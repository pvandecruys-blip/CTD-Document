"""
Redaction engine for CTD stability document generation.

Applies redaction policies to datasets before document export,
producing blanked outputs (primarily for DS 3.2.S.7 sections).

Supports four rule types:
  1. always_redact — named fields are always replaced
  2. regex — pattern-based redaction
  3. threshold — numeric value-based redaction
  4. role_based — visibility depends on user role
"""

import hashlib
import logging
import re
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


@dataclass
class RedactionRule:
    """A single redaction rule from a policy."""
    type: str                       # always_redact, regex, threshold, role_based
    target_fields: list[str] = field(default_factory=list)
    pattern: Optional[str] = None
    replacement: Optional[str] = None
    scope: str = "all"              # all, ds_only, dp_only
    condition: Optional[str] = None  # for threshold rules
    visible_to_roles: list[str] = field(default_factory=list)
    hidden_from_roles: list[str] = field(default_factory=list)


@dataclass
class RedactionPolicy:
    """A complete redaction policy with ordered rules."""
    policy_id: str
    name: str
    placeholder_token: str = "[REDACTED]"
    rules: list[RedactionRule] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "RedactionPolicy":
        rules = [
            RedactionRule(
                type=r["type"],
                target_fields=r.get("target_fields", []),
                pattern=r.get("pattern"),
                replacement=r.get("replacement"),
                scope=r.get("scope", "all"),
                condition=r.get("condition"),
                visible_to_roles=r.get("visible_to_roles", []),
                hidden_from_roles=r.get("hidden_from_roles", []),
            )
            for r in data.get("rules", [])
        ]
        return cls(
            policy_id=data.get("policy_id", str(uuid4())),
            name=data.get("name", "Unnamed Policy"),
            placeholder_token=data.get("placeholder_token", "[REDACTED]"),
            rules=rules,
        )


@dataclass
class RedactionLogEntry:
    """Audit log entry for a single redacted field."""
    field_path: str
    original_hash: str      # SHA-256 of original value
    rule_type: str
    rule_detail: str
    replacement: str


class RedactionEngine:
    """
    Applies a RedactionPolicy to a dataset, producing a redacted copy.

    The engine processes data records (dicts) and replaces field values
    according to the policy rules, in priority order:
      1. always_redact (highest priority)
      2. regex
      3. threshold
      4. role_based (lowest priority)

    Usage:
        engine = RedactionEngine(policy, section_type="ds", user_role="viewer")
        redacted_data, log = engine.apply(original_data)
    """

    def __init__(
        self,
        policy: RedactionPolicy,
        section_type: str = "ds",       # "ds" or "dp"
        user_role: str = "viewer",
    ):
        self.policy = policy
        self.section_type = section_type
        self.user_role = user_role
        self.log: list[RedactionLogEntry] = []

    def apply(self, data: list[dict]) -> tuple[list[dict], list[RedactionLogEntry]]:
        """
        Apply redaction to a list of data records.

        Args:
            data: List of dicts, each representing a result row with fields
                  like lot_number, manufacturer, value_text, value_numeric, etc.

        Returns:
            Tuple of (redacted_data, redaction_log).
            redacted_data is a deep copy with sensitive fields replaced.
        """
        self.log = []
        redacted = deepcopy(data)

        for record_idx, record in enumerate(redacted):
            for field_name, value in list(record.items()):
                if value is None:
                    continue

                field_path = f"record[{record_idx}].{field_name}"
                str_value = str(value)

                # Apply rules in priority order
                redacted_value = self._apply_rules(field_name, str_value, value, field_path)
                if redacted_value is not None:
                    record[field_name] = redacted_value

        return redacted, self.log

    def apply_to_table_data(
        self,
        table_data: dict,
    ) -> tuple[dict, list[RedactionLogEntry]]:
        """
        Apply redaction to structured table generation data.

        table_data format:
        {
            "lot": {"lot_number": "LOT-001", "manufacturer": "Acme"},
            "condition": {"label": "-20 ± 5 °C"},
            "rows": [
                {
                    "attribute": "pH",
                    "acceptance_criteria": "6.0–7.0",
                    "values": {"T0": "6.5", "1M": "6.4", ...}
                }
            ]
        }
        """
        self.log = []
        redacted = deepcopy(table_data)

        # Redact lot-level fields
        if "lot" in redacted:
            for field_name, value in list(redacted["lot"].items()):
                if value is None:
                    continue
                field_path = f"lot.{field_name}"
                result = self._apply_rules(field_name, str(value), value, field_path)
                if result is not None:
                    redacted["lot"][field_name] = result

        # Redact result values in rows
        if "rows" in redacted:
            for row_idx, row in enumerate(redacted["rows"]):
                # Redact acceptance criteria if needed
                if "acceptance_criteria" in row and row["acceptance_criteria"]:
                    fp = f"row[{row_idx}].acceptance_criteria"
                    result = self._apply_rules(
                        "acceptance_criteria", str(row["acceptance_criteria"]),
                        row["acceptance_criteria"], fp,
                    )
                    if result is not None:
                        row["acceptance_criteria"] = result

                # Redact individual result values
                if "values" in row:
                    for tp_label, val in list(row["values"].items()):
                        if val is None:
                            continue
                        fp = f"row[{row_idx}].values.{tp_label}"
                        result = self._apply_rules(
                            "result_value", str(val), val, fp,
                        )
                        if result is not None:
                            row["values"][tp_label] = result

        return redacted, self.log

    def _apply_rules(
        self,
        field_name: str,
        str_value: str,
        original_value: Any,
        field_path: str,
    ) -> Optional[str]:
        """
        Apply all rules to a single field. Returns replacement value or None if no rule matches.
        """
        for rule in self.policy.rules:
            # Check scope
            if rule.scope == "ds_only" and self.section_type != "ds":
                continue
            if rule.scope == "dp_only" and self.section_type != "dp":
                continue

            replacement = None

            if rule.type == "always_redact":
                replacement = self._apply_always_redact(rule, field_name, str_value)

            elif rule.type == "regex":
                replacement = self._apply_regex(rule, str_value)

            elif rule.type == "threshold":
                replacement = self._apply_threshold(rule, field_name, original_value)

            elif rule.type == "role_based":
                replacement = self._apply_role_based(rule)

            if replacement is not None:
                # Log the redaction
                original_hash = hashlib.sha256(str_value.encode()).hexdigest()
                self.log.append(RedactionLogEntry(
                    field_path=field_path,
                    original_hash=original_hash,
                    rule_type=rule.type,
                    rule_detail=self._rule_detail(rule),
                    replacement=replacement,
                ))
                return replacement

        return None

    def _apply_always_redact(
        self, rule: RedactionRule, field_name: str, value: str,
    ) -> Optional[str]:
        """Check if field is in the always-redact list."""
        if field_name in rule.target_fields:
            return rule.replacement or self.policy.placeholder_token
        return None

    def _apply_regex(self, rule: RedactionRule, value: str) -> Optional[str]:
        """Apply regex pattern matching and replacement."""
        if not rule.pattern:
            return None
        try:
            if re.search(rule.pattern, value):
                replacement = rule.replacement or self.policy.placeholder_token
                return re.sub(rule.pattern, replacement, value)
        except re.error as e:
            logger.warning(f"Invalid regex in redaction rule: {rule.pattern} — {e}")
        return None

    def _apply_threshold(
        self, rule: RedactionRule, field_name: str, value: Any,
    ) -> Optional[str]:
        """Apply threshold-based redaction for numeric values."""
        if field_name not in rule.target_fields:
            return None

        # Parse numeric value
        numeric = None
        if isinstance(value, (int, float)):
            numeric = float(value)
        elif isinstance(value, str):
            try:
                numeric = float(value.replace(",", "").replace("%", "").strip())
            except ValueError:
                return None

        if numeric is None:
            return None

        # Evaluate threshold condition
        # Supported: "numeric_value < X", "numeric_value > X"
        if rule.condition:
            try:
                # Simple threshold parsing
                if "<" in rule.condition:
                    threshold = float(rule.condition.split("<")[-1].strip())
                    if numeric < threshold:
                        return rule.replacement or self.policy.placeholder_token
                elif ">" in rule.condition:
                    threshold = float(rule.condition.split(">")[-1].strip())
                    if numeric > threshold:
                        return rule.replacement or self.policy.placeholder_token
            except (ValueError, IndexError):
                logger.warning(f"Could not parse threshold condition: {rule.condition}")

        return None

    def _apply_role_based(self, rule: RedactionRule) -> Optional[str]:
        """Apply role-based visibility rules."""
        if self.user_role in rule.hidden_from_roles:
            return rule.replacement or self.policy.placeholder_token
        if rule.visible_to_roles and self.user_role not in rule.visible_to_roles:
            return rule.replacement or self.policy.placeholder_token
        return None

    @staticmethod
    def _rule_detail(rule: RedactionRule) -> str:
        """Generate a human-readable description of the rule."""
        if rule.type == "always_redact":
            return f"Always redact fields: {', '.join(rule.target_fields)}"
        elif rule.type == "regex":
            return f"Regex: {rule.pattern}"
        elif rule.type == "threshold":
            return f"Threshold: {rule.condition} on {', '.join(rule.target_fields)}"
        elif rule.type == "role_based":
            return f"Role-based: hidden from {', '.join(rule.hidden_from_roles)}"
        return rule.type


# ── Convenience: create default DS blanked policy ───────────────────

def create_default_ds_policy() -> RedactionPolicy:
    """Create a sensible default redaction policy for DS blanked sections."""
    return RedactionPolicy(
        policy_id=str(uuid4()),
        name="DS Default Blanked",
        placeholder_token="[REDACTED]",
        rules=[
            RedactionRule(
                type="always_redact",
                target_fields=["lot_number", "manufacturer", "manufacturing_site"],
                scope="ds_only",
                replacement="[REDACTED]",
            ),
            RedactionRule(
                type="regex",
                pattern=r"LOT[-–]?\d{2,}[-–]?\d{2,}",
                replacement="[LOT-REDACTED]",
                scope="all",
            ),
            RedactionRule(
                type="regex",
                pattern=r"Site\s+[A-Z]",
                replacement="[SITE-REDACTED]",
                scope="ds_only",
            ),
        ],
    )
