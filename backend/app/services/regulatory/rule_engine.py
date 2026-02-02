"""
Regulatory Rule Engine.

Consumes the allocation pack rules JSON and enforces them at validation
and generation time. Integrates with the existing ValidationEngine to
add guideline-driven checks.

Key capabilities:
  - Required field enforcement at generation time
  - Blocking validation failures before export
  - Conditional section logic (in-use stability, reconstitution)
  - Phase-based toggles (Phase I vs Phase II/III)
  - Rule evaluation logging for audit trail

IMPORTANT: This is a decision-support system. It does NOT replace
regulatory judgment. All rules support human override with mandatory
justification.
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


# ── Data structures ─────────────────────────────────────────────────

@dataclass
class RuleEvaluation:
    """Result of evaluating a single regulatory rule."""
    rule_id: str
    rule_id_code: str
    result: str             # PASS, FAIL, WAIVED
    severity: str           # BLOCK, WARN
    details: str = ""
    waiver_justification: Optional[str] = None


@dataclass
class RuleEngineReport:
    """Complete report from running all rules."""
    evaluations: list[RuleEvaluation] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")

    @property
    def blocking_failures(self) -> list[RuleEvaluation]:
        return [e for e in self.evaluations if e.result == "FAIL" and e.severity == "BLOCK"]

    @property
    def warnings(self) -> list[RuleEvaluation]:
        return [e for e in self.evaluations if e.result == "FAIL" and e.severity == "WARN"]

    @property
    def passes(self) -> list[RuleEvaluation]:
        return [e for e in self.evaluations if e.result == "PASS"]

    @property
    def waivers(self) -> list[RuleEvaluation]:
        return [e for e in self.evaluations if e.result == "WAIVED"]

    @property
    def can_proceed(self) -> bool:
        return len(self.blocking_failures) == 0

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "can_proceed": self.can_proceed,
            "blocking_failures": [self._eval_dict(e) for e in self.blocking_failures],
            "warnings": [self._eval_dict(e) for e in self.warnings],
            "passes": [self._eval_dict(e) for e in self.passes],
            "waivers": [self._eval_dict(e) for e in self.waivers],
        }

    @staticmethod
    def _eval_dict(e: RuleEvaluation) -> dict:
        return {
            "rule_id": e.rule_id,
            "rule_id_code": e.rule_id_code,
            "result": e.result,
            "severity": e.severity,
            "details": e.details,
            "waiver_justification": e.waiver_justification,
        }


# ── Project context for rule evaluation ─────────────────────────────

@dataclass
class ProjectContext:
    """
    Snapshot of project state used by the rule engine.
    Built from DB queries before rule evaluation.
    """
    # Product characteristics
    product_type: str = ""              # drug_substance, drug_product
    product_name: str = ""
    dosage_form: Optional[str] = None
    requires_reconstitution: bool = False
    is_multi_dose: bool = False
    in_use_stability_required: Optional[bool] = None
    in_use_stability_justification: Optional[str] = None

    # Clinical phase
    clinical_phase: str = "phase_1"     # phase_1, phase_2, phase_3, post_approval
    numbering_mode: str = "ctd"         # ctd, impd

    # DS fields
    retest_period: Optional[str] = None
    retest_period_justification: Optional[str] = None
    proposed_storage_conditions: Optional[str] = None
    stability_commitment_statement: Optional[str] = None

    # DP fields
    shelf_life: Optional[str] = None
    shelf_life_justification: Optional[str] = None

    # Data presence flags (computed from DB)
    has_accelerated_study: bool = False
    has_long_term_study: bool = False
    has_intermediate_study: bool = False
    has_photostability_study: bool = False
    has_stress_study: bool = False
    has_in_use_study: bool = False
    has_stability_table: bool = False
    has_any_results: bool = False
    lot_count: int = 0
    condition_count: int = 0

    # Waivers (rule_id_code → justification)
    waivers: dict[str, str] = field(default_factory=dict)


# ── Rule engine ─────────────────────────────────────────────────────

class RegulatoryRuleEngine:
    """
    Evaluates regulatory rules against a project context.

    Usage:
        engine = RegulatoryRuleEngine(rules_json, context)
        report = engine.evaluate()
    """

    def __init__(self, rules: list[dict], context: ProjectContext):
        self.rules = rules
        self.ctx = context

    def evaluate(self) -> RuleEngineReport:
        """Evaluate all rules against the project context."""
        report = RuleEngineReport()

        for rule in self.rules:
            # Filter by applies_to
            applies_to = rule.get("applies_to", [])
            product_scope = "DS" if self.ctx.product_type == "drug_substance" else "DP"
            if product_scope not in applies_to and applies_to != ["DS", "DP"]:
                continue

            # Filter by numbering mode
            sections = rule.get("mapped_app_sections", [])
            if self.ctx.numbering_mode == "impd":
                # IMPD mode: include 2.2.1.* sections
                pass  # all sections apply
            else:
                # CTD mode: only 3.2.* sections
                sections = [s for s in sections if s.startswith("3.2.")]
                if not sections:
                    continue

            evaluation = self._evaluate_single_rule(rule)
            report.evaluations.append(evaluation)

        # Run built-in conditional rules
        report.evaluations.extend(self._evaluate_conditional_rules())
        report.evaluations.extend(self._evaluate_phase_rules())

        return report

    def _evaluate_single_rule(self, rule: dict) -> RuleEvaluation:
        """Evaluate a single rule against the context."""
        rule_id = rule.get("rule_id", "UNKNOWN")
        severity = rule.get("validation", {}).get("severity", "WARN")
        logic = rule.get("validation", {}).get("logic", "")
        ui_fields = rule.get("ui_fields_required", [])

        # Check for waiver
        if rule_id in self.ctx.waivers:
            return RuleEvaluation(
                rule_id=str(uuid4()),
                rule_id_code=rule_id,
                result="WAIVED",
                severity=severity,
                details=f"Rule waived by user.",
                waiver_justification=self.ctx.waivers[rule_id],
            )

        # Evaluate logic expression
        if logic == "manual_review_required":
            return RuleEvaluation(
                rule_id=str(uuid4()),
                rule_id_code=rule_id,
                result="PASS",
                severity=severity,
                details="Manual review rule — check in UI.",
            )

        # Parse and evaluate field_present() checks
        missing_fields = []
        for ui_field in ui_fields:
            if not self._is_field_present(ui_field):
                missing_fields.append(ui_field)

        if missing_fields:
            return RuleEvaluation(
                rule_id=str(uuid4()),
                rule_id_code=rule_id,
                result="FAIL",
                severity=severity,
                details=f"Missing required fields: {', '.join(missing_fields)}. "
                        f"Rule: {rule.get('rule_text', '')[:100]}",
            )

        return RuleEvaluation(
            rule_id=str(uuid4()),
            rule_id_code=rule_id,
            result="PASS",
            severity=severity,
            details="All required fields present.",
        )

    def _is_field_present(self, field_path: str) -> bool:
        """
        Check if a UI field has been populated in the project context.

        Field paths use dot notation: "ds.retest_period", "dp.shelf_life", etc.
        """
        field_map = {
            "ds.retest_period": self.ctx.retest_period,
            "ds.retest_period_justification": self.ctx.retest_period_justification,
            "ds.storage_conditions": self.ctx.proposed_storage_conditions,
            "ds.stability_commitment": self.ctx.stability_commitment_statement,
            "ds.study_accelerated": self.ctx.has_accelerated_study,
            "ds.study_long_term": self.ctx.has_long_term_study,
            "ds.study_photostability": self.ctx.has_photostability_study,
            "ds.study_stress": self.ctx.has_stress_study,
            "ds.stability_table": self.ctx.has_stability_table,
            "ds.lot_information": self.ctx.lot_count > 0,
            "dp.shelf_life": self.ctx.shelf_life,
            "dp.shelf_life_justification": self.ctx.shelf_life_justification,
            "dp.storage_conditions": self.ctx.proposed_storage_conditions,
            "dp.stability_commitment": self.ctx.stability_commitment_statement,
            "dp.study_accelerated": self.ctx.has_accelerated_study,
            "dp.study_long_term": self.ctx.has_long_term_study,
            "dp.study_photostability": self.ctx.has_photostability_study,
            "dp.study_stress": self.ctx.has_stress_study,
            "dp.stability_table": self.ctx.has_stability_table,
            "dp.in_use_stability": self.ctx.has_in_use_study,
            "dp.lot_information": self.ctx.lot_count > 0,
        }

        value = field_map.get(field_path)
        if value is None:
            return False
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return len(value.strip()) > 0
        return bool(value)

    # ── Conditional rules (built-in) ────────────────────────────────

    def _evaluate_conditional_rules(self) -> list[RuleEvaluation]:
        """
        Evaluate built-in conditional rules that cannot be expressed
        as simple field_present() checks.
        """
        evaluations = []
        product_is_dp = self.ctx.product_type == "drug_product"

        # Rule: If reconstitution/dilution/mixing OR multi-dose → in-use stability mandatory
        if product_is_dp and (self.ctx.requires_reconstitution or self.ctx.is_multi_dose):
            rule_id_code = "COND-INUSE-001"

            if rule_id_code in self.ctx.waivers:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code=rule_id_code,
                    result="WAIVED",
                    severity="BLOCK",
                    waiver_justification=self.ctx.waivers[rule_id_code],
                ))
            elif self.ctx.has_in_use_study:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code=rule_id_code,
                    result="PASS",
                    severity="BLOCK",
                    details="In-use stability data present for product requiring reconstitution/multi-dose.",
                ))
            elif self.ctx.in_use_stability_justification:
                # User provided justification for immediate use
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code=rule_id_code,
                    result="PASS",
                    severity="BLOCK",
                    details=f"In-use stability not required — justification: "
                            f"{self.ctx.in_use_stability_justification}",
                ))
            else:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code=rule_id_code,
                    result="FAIL",
                    severity="BLOCK",
                    details="Product requires reconstitution/dilution or is multi-dose, "
                            "but no in-use stability data is present and no justification provided. "
                            "Add in-use stability data or provide a controlled justification.",
                ))

        return evaluations

    def _evaluate_phase_rules(self) -> list[RuleEvaluation]:
        """
        Evaluate phase-dependent rules.

        Phase I:
          - Enforce stability commitment statement
          - Enforce at least initiated accelerated/long-term study
          - Allow tabulated partial results (or documented justification)

        Phase II/III:
          - Enforce accelerated + long-term results table presence
          - Or documented justification
        """
        evaluations = []

        if self.ctx.clinical_phase == "phase_1":
            # Commitment statement
            if self.ctx.stability_commitment_statement:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code="PHASE-I-COMMIT",
                    result="PASS",
                    severity="BLOCK",
                    details="Stability commitment statement present for Phase I.",
                ))
            elif "PHASE-I-COMMIT" in self.ctx.waivers:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code="PHASE-I-COMMIT",
                    result="WAIVED",
                    severity="BLOCK",
                    waiver_justification=self.ctx.waivers["PHASE-I-COMMIT"],
                ))
            else:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code="PHASE-I-COMMIT",
                    result="FAIL",
                    severity="BLOCK",
                    details="Phase I requires an ongoing stability program commitment statement.",
                ))

            # At least initiated accelerated or long-term
            if self.ctx.has_accelerated_study or self.ctx.has_long_term_study:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code="PHASE-I-STUDY",
                    result="PASS",
                    severity="BLOCK",
                    details="At least one stability study (accelerated or long-term) initiated.",
                ))
            elif "PHASE-I-STUDY" in self.ctx.waivers:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code="PHASE-I-STUDY",
                    result="WAIVED",
                    severity="BLOCK",
                    waiver_justification=self.ctx.waivers["PHASE-I-STUDY"],
                ))
            else:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code="PHASE-I-STUDY",
                    result="FAIL",
                    severity="BLOCK",
                    details="Phase I requires at least one accelerated or long-term stability study "
                            "to be initiated (even if only partial results are available).",
                ))

            # Results presence (warning, not block, for Phase I)
            if self.ctx.has_any_results:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code="PHASE-I-RESULTS",
                    result="PASS",
                    severity="WARN",
                    details="Stability results are tabulated.",
                ))
            else:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code="PHASE-I-RESULTS",
                    result="FAIL",
                    severity="WARN",
                    details="No stability results tabulated. For Phase I, available results "
                            "(or documented justification for their absence) should be provided.",
                ))

        elif self.ctx.clinical_phase in ("phase_2", "phase_3"):
            # Accelerated results
            accel_code = "PHASE-II-III-ACCEL"
            if self.ctx.has_accelerated_study and self.ctx.has_stability_table:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code=accel_code,
                    result="PASS",
                    severity="BLOCK",
                    details="Accelerated stability results table present.",
                ))
            elif accel_code in self.ctx.waivers:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code=accel_code,
                    result="WAIVED",
                    severity="BLOCK",
                    waiver_justification=self.ctx.waivers[accel_code],
                ))
            else:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code=accel_code,
                    result="FAIL",
                    severity="BLOCK",
                    details="Phase II/III requires accelerated stability results table "
                            "(or documented justification for absence).",
                ))

            # Long-term results
            lt_code = "PHASE-II-III-LT"
            if self.ctx.has_long_term_study and self.ctx.has_stability_table:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code=lt_code,
                    result="PASS",
                    severity="BLOCK",
                    details="Long-term stability results table present.",
                ))
            elif lt_code in self.ctx.waivers:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code=lt_code,
                    result="WAIVED",
                    severity="BLOCK",
                    waiver_justification=self.ctx.waivers[lt_code],
                ))
            else:
                evaluations.append(RuleEvaluation(
                    rule_id=str(uuid4()),
                    rule_id_code=lt_code,
                    result="FAIL",
                    severity="BLOCK",
                    details="Phase II/III requires long-term stability results table "
                            "(or documented justification for absence).",
                ))

        return evaluations


# ── Helper: build ProjectContext from DB ────────────────────────────

def build_project_context_from_db(db_session, project_id: str) -> ProjectContext:
    """
    Query the database and build a ProjectContext for rule evaluation.

    This is the bridge between the ORM layer and the rule engine.
    """
    from app.models.database import (
        Project, Product, Study, Lot, Result, StorageCondition,
        StudyType,
    )

    project = db_session.query(Project).get(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    products = db_session.query(Product).filter(Product.project_id == project_id).all()
    product = products[0] if products else None

    ctx = ProjectContext(
        clinical_phase=getattr(project, "clinical_phase", "phase_1") or "phase_1",
        numbering_mode=getattr(project, "numbering_mode", "ctd") or "ctd",
    )

    if product:
        ctx.product_type = product.product_type.value if product.product_type else ""
        ctx.product_name = product.product_name or ""
        ctx.dosage_form = product.dosage_form
        ctx.requires_reconstitution = getattr(product, "requires_reconstitution", False) or False
        ctx.is_multi_dose = getattr(product, "is_multi_dose", False) or False
        ctx.in_use_stability_required = getattr(product, "in_use_stability_required", None)
        ctx.in_use_stability_justification = getattr(product, "in_use_stability_justification", None)
        ctx.retest_period = getattr(product, "retest_period", None)
        ctx.retest_period_justification = getattr(product, "retest_period_justification", None)
        ctx.proposed_storage_conditions = getattr(product, "proposed_storage_conditions", None)
        ctx.stability_commitment_statement = getattr(product, "stability_commitment_statement", None)
        ctx.shelf_life = getattr(product, "shelf_life", None)
        ctx.shelf_life_justification = getattr(product, "shelf_life_justification", None)

        # Query studies
        studies = db_session.query(Study).filter(Study.product_id == product.id).all()
        study_types = {s.study_type for s in studies}
        ctx.has_accelerated_study = StudyType.accelerated in study_types
        ctx.has_long_term_study = StudyType.long_term in study_types
        ctx.has_intermediate_study = StudyType.intermediate in study_types
        ctx.has_photostability_study = StudyType.photostability in study_types
        ctx.has_stress_study = StudyType.stress in study_types

        # Check for in-use study (study_type == "other" with label containing "in-use")
        ctx.has_in_use_study = any(
            s.study_type == StudyType.other and s.study_label and "in-use" in s.study_label.lower()
            for s in studies
        )

        # Count lots and conditions
        study_ids = [s.id for s in studies]
        if study_ids:
            ctx.lot_count = db_session.query(Lot).filter(Lot.study_id.in_(study_ids)).count()

        ctx.condition_count = (
            db_session.query(StorageCondition)
            .filter(StorageCondition.product_id == product.id)
            .count()
        )

        # Check for results
        if study_ids:
            lot_ids = [
                lot.id
                for lot in db_session.query(Lot).filter(Lot.study_id.in_(study_ids)).all()
            ]
            if lot_ids:
                ctx.has_any_results = db_session.query(Result).filter(Result.lot_id.in_(lot_ids)).count() > 0
                ctx.has_stability_table = ctx.has_any_results  # simplified

    return ctx
