"""
Guideline Extraction Pipeline.

Parses regulatory guideline PDFs (e.g., EMA IMPD Quality guideline) and
extracts stability-related obligations into structured rules that can
drive validation and generation.

Pipeline steps:
  1. PDF text extraction with page numbers
  2. Section/heading detection
  3. Stability-relevant section filtering
  4. Clause segmentation (sentence-level)
  5. MUST/SHOULD/MAY detection per clause
  6. Rule structuring with traceability anchors
  7. Human review (all rules land as pending_review)
"""

import hashlib
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


# ── Data structures ─────────────────────────────────────────────────

@dataclass
class GuidelineMetadata:
    title: str = ""
    agency: str = ""
    document_id: str = ""
    version: str = ""
    publication_date: str = ""
    file_checksum: str = ""
    source_file_id: str = ""


@dataclass
class RuleTraceability:
    source_file_id: str = ""
    page: int = 0
    section_heading: str = ""
    excerpt_snippet: str = ""  # ≤ 25 words


@dataclass
class ExtractedRule:
    rule_id: str = ""
    applies_to: list[str] = field(default_factory=list)  # ["DS"], ["DP"], ["DS","DP"]
    mapped_app_sections: list[str] = field(default_factory=list)
    requirement_level: str = "SHOULD"  # MUST, SHOULD, MAY
    rule_text: str = ""
    evidence_expected: list[str] = field(default_factory=list)
    ui_fields_required: list[str] = field(default_factory=list)
    validation_severity: str = "WARN"  # BLOCK or WARN
    validation_logic: str = ""
    traceability: Optional[RuleTraceability] = None
    confidence: float = 0.0


@dataclass
class GlossaryEntry:
    term: str = ""
    definition: str = ""
    source_page: int = 0


@dataclass
class AllocationPack:
    guideline_metadata: GuidelineMetadata = field(default_factory=GuidelineMetadata)
    rules: list[ExtractedRule] = field(default_factory=list)
    glossary: list[GlossaryEntry] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "guideline_metadata": {
                "title": self.guideline_metadata.title,
                "agency": self.guideline_metadata.agency,
                "document_id": self.guideline_metadata.document_id,
                "version": self.guideline_metadata.version,
                "publication_date": self.guideline_metadata.publication_date,
                "file_checksum": self.guideline_metadata.file_checksum,
                "source_file_id": self.guideline_metadata.source_file_id,
            },
            "rules": [
                {
                    "rule_id": r.rule_id,
                    "applies_to": r.applies_to,
                    "mapped_app_sections": r.mapped_app_sections,
                    "requirement_level": r.requirement_level,
                    "rule_text": r.rule_text,
                    "evidence_expected": r.evidence_expected,
                    "ui_fields_required": r.ui_fields_required,
                    "validation": {
                        "severity": r.validation_severity,
                        "logic": r.validation_logic,
                    },
                    "traceability": {
                        "source_file_id": r.traceability.source_file_id if r.traceability else "",
                        "page": r.traceability.page if r.traceability else 0,
                        "section_heading": r.traceability.section_heading if r.traceability else "",
                        "excerpt_snippet": r.traceability.excerpt_snippet if r.traceability else "",
                    },
                }
                for r in self.rules
            ],
            "glossary": [
                {"term": g.term, "definition": g.definition, "source_page": g.source_page}
                for g in self.glossary
            ],
        }


# ── Extraction pipeline ────────────────────────────────────────────

class GuidelineExtractor:
    """
    Extracts stability-related regulatory rules from a guideline PDF.

    Usage:
        extractor = GuidelineExtractor(pdf_path, file_id, file_checksum)
        pack = extractor.extract()
    """

    # Section keywords that indicate stability-relevant content
    STABILITY_KEYWORDS = [
        "stability", "retest period", "retest date", "shelf life", "shelf-life",
        "storage condition", "accelerated", "long-term", "long term",
        "intermediate", "stress testing", "photostability",
        "in-use stability", "in use stability",
        "stability commitment", "ongoing stability",
        "stability protocol", "stability program",
        "bulk stability", "drug substance stability", "drug product stability",
        "3.2.s.7", "3.2.p.8", "s.7", "p.8",
    ]

    # DS section identifiers in various naming conventions
    DS_SECTION_PATTERNS = [
        re.compile(r"\b3\.2\.S\.7\b", re.IGNORECASE),
        re.compile(r"\b2\.2\.1\.S\.7\b", re.IGNORECASE),
        re.compile(r"\bdrug\s+substance\s+stability\b", re.IGNORECASE),
        re.compile(r"\bretest\s+period\b", re.IGNORECASE),
    ]

    DP_SECTION_PATTERNS = [
        re.compile(r"\b3\.2\.P\.8\b", re.IGNORECASE),
        re.compile(r"\b2\.2\.1\.P\.8\b", re.IGNORECASE),
        re.compile(r"\bdrug\s+product\s+stability\b", re.IGNORECASE),
        re.compile(r"\bshelf[\s-]?life\b", re.IGNORECASE),
    ]

    # Requirement level detection
    MUST_PATTERNS = [
        re.compile(r"\bmust\b", re.IGNORECASE),
        re.compile(r"\bshall\b", re.IGNORECASE),
        re.compile(r"\bis\s+required\b", re.IGNORECASE),
        re.compile(r"\bare\s+required\b", re.IGNORECASE),
        re.compile(r"\bmandatory\b", re.IGNORECASE),
        re.compile(r"\bis\s+expected\s+to\b", re.IGNORECASE),
    ]

    SHOULD_PATTERNS = [
        re.compile(r"\bshould\b", re.IGNORECASE),
        re.compile(r"\bis\s+recommended\b", re.IGNORECASE),
        re.compile(r"\bis\s+advisable\b", re.IGNORECASE),
        re.compile(r"\bnormally\b", re.IGNORECASE),
        re.compile(r"\bgenerally\b", re.IGNORECASE),
    ]

    MAY_PATTERNS = [
        re.compile(r"\bmay\b", re.IGNORECASE),
        re.compile(r"\bcan\b", re.IGNORECASE),
        re.compile(r"\boptional\b", re.IGNORECASE),
        re.compile(r"\bif\s+applicable\b", re.IGNORECASE),
        re.compile(r"\bwhere\s+relevant\b", re.IGNORECASE),
    ]

    # Heading detection patterns
    HEADING_PATTERN = re.compile(
        r"^(\d+\.?\d*\.?\d*\.?\d*)\s+(.+)$",
        re.MULTILINE,
    )

    def __init__(self, pdf_path: str, file_id: str, file_checksum: str):
        self.pdf_path = pdf_path
        self.file_id = file_id
        self.file_checksum = file_checksum

    def extract(self) -> AllocationPack:
        """Run the full extraction pipeline."""
        import pdfplumber

        pack = AllocationPack()

        try:
            with pdfplumber.open(self.pdf_path) as pdf:
                # Step 1: Extract text with page numbers
                pages = []
                for i, page in enumerate(pdf.pages):
                    text = page.extract_text() or ""
                    pages.append((i + 1, text))

                # Step 2: Extract metadata from first pages
                pack.guideline_metadata = self._extract_metadata(pages)

                # Step 3: Identify sections and headings
                sections = self._identify_sections(pages)

                # Step 4: Filter to stability-relevant sections
                stability_sections = self._filter_stability_sections(sections)

                # Step 5: Segment into clauses and detect requirements
                raw_rules = self._extract_rules_from_sections(stability_sections)

                # Step 6: Assign rule IDs and map to app sections
                pack.rules = self._structure_rules(raw_rules)

                # Step 7: Extract glossary
                pack.glossary = self._extract_glossary(pages)

        except Exception as e:
            logger.error(f"Guideline extraction failed: {e}", exc_info=True)

        return pack

    def _extract_metadata(self, pages: list[tuple[int, str]]) -> GuidelineMetadata:
        """Extract guideline metadata from front matter."""
        first_pages_text = "\n".join(text for _, text in pages[:5])

        meta = GuidelineMetadata(
            file_checksum=self.file_checksum,
            source_file_id=self.file_id,
            agency="EMA",  # default; refine by content detection
        )

        # Try to find title (usually the largest text / first heading)
        lines = first_pages_text.strip().split("\n")
        for line in lines[:15]:
            line = line.strip()
            if len(line) > 20 and not line.startswith("Page"):
                meta.title = line
                break

        # Detect agency
        text_lower = first_pages_text.lower()
        if "ema" in text_lower or "european medicines agency" in text_lower:
            meta.agency = "EMA"
        elif "fda" in text_lower or "food and drug administration" in text_lower:
            meta.agency = "FDA"
        elif "ich" in text_lower:
            meta.agency = "ICH"

        # Look for document ID patterns
        doc_id_match = re.search(
            r"(EMA/\S+/\d+|CHMP/\S+/\d+|CPMP/\S+/\d+|ICH\s+\S+)",
            first_pages_text,
        )
        if doc_id_match:
            meta.document_id = doc_id_match.group(1)

        # Look for version/revision
        version_match = re.search(
            r"(?:revision|version|rev\.?)\s*(\d+[\.\d]*)",
            first_pages_text,
            re.IGNORECASE,
        )
        if version_match:
            meta.version = f"Revision {version_match.group(1)}"

        # Look for date
        date_match = re.search(
            r"(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{4}|\d{4}-\d{2}-\d{2})",
            first_pages_text,
        )
        if date_match:
            meta.publication_date = date_match.group(1)

        return meta

    def _identify_sections(
        self, pages: list[tuple[int, str]],
    ) -> list[dict]:
        """
        Parse the document into sections based on headings.

        Returns list of {heading, heading_number, page, text, start_line}.
        """
        sections = []
        current_section = None

        for page_num, page_text in pages:
            lines = page_text.split("\n")
            for line_idx, line in enumerate(lines):
                line_stripped = line.strip()

                # Check if line looks like a heading
                heading_match = self.HEADING_PATTERN.match(line_stripped)
                if heading_match and len(line_stripped) < 200:
                    # Save previous section
                    if current_section:
                        sections.append(current_section)

                    current_section = {
                        "heading_number": heading_match.group(1),
                        "heading": heading_match.group(2).strip(),
                        "page": page_num,
                        "text": "",
                    }
                elif current_section:
                    current_section["text"] += line_stripped + "\n"

        if current_section:
            sections.append(current_section)

        return sections

    def _filter_stability_sections(self, sections: list[dict]) -> list[dict]:
        """Keep only sections relevant to stability."""
        relevant = []
        for section in sections:
            combined = (section["heading"] + " " + section["text"]).lower()
            if any(kw in combined for kw in self.STABILITY_KEYWORDS):
                relevant.append(section)
        return relevant

    def _extract_rules_from_sections(
        self, sections: list[dict],
    ) -> list[dict]:
        """
        Segment sections into individual clauses and detect requirement level.

        Returns list of raw rule dicts with text, level, section info, page.
        """
        raw_rules = []

        for section in sections:
            # Split into sentences (approximate)
            sentences = re.split(r'(?<=[.;])\s+', section["text"])

            for sentence in sentences:
                sentence = sentence.strip()
                if len(sentence) < 15:
                    continue

                # Skip purely structural/reference sentences
                if sentence.lower().startswith(("see ", "refer to ", "note:")):
                    continue

                # Detect requirement level
                level = self._detect_requirement_level(sentence)
                if level is None:
                    continue  # Not a requirement clause

                # Determine if DS or DP (or both)
                applies_to = self._determine_applies_to(sentence, section["heading"])

                raw_rules.append({
                    "text": sentence,
                    "level": level,
                    "applies_to": applies_to,
                    "section_heading": f"{section['heading_number']} {section['heading']}",
                    "page": section["page"],
                })

        return raw_rules

    def _detect_requirement_level(self, text: str) -> Optional[str]:
        """Detect MUST/SHOULD/MAY from a clause. Returns None if no obligation detected."""
        # MUST takes priority
        for pattern in self.MUST_PATTERNS:
            if pattern.search(text):
                return "MUST"

        for pattern in self.SHOULD_PATTERNS:
            if pattern.search(text):
                return "SHOULD"

        for pattern in self.MAY_PATTERNS:
            if pattern.search(text):
                return "MAY"

        return None

    def _determine_applies_to(self, text: str, heading: str) -> list[str]:
        """Determine whether a rule applies to DS, DP, or both."""
        combined = (text + " " + heading).lower()
        applies = []

        is_ds = any(p.search(combined) for p in self.DS_SECTION_PATTERNS)
        is_dp = any(p.search(combined) for p in self.DP_SECTION_PATTERNS)

        if is_ds:
            applies.append("DS")
        if is_dp:
            applies.append("DP")

        # If neither specifically detected, assume both
        if not applies:
            applies = ["DS", "DP"]

        return applies

    def _structure_rules(self, raw_rules: list[dict]) -> list[ExtractedRule]:
        """
        Convert raw clause dicts into structured ExtractedRule objects
        with rule IDs, section mappings, and UI field mappings.
        """
        rules = []
        ds_counter = 0
        dp_counter = 0

        for raw in raw_rules:
            applies = raw["applies_to"]

            # Generate rule ID
            if "DS" in applies and "DP" not in applies:
                ds_counter += 1
                rule_id = f"EMA-IMPD-S7-{ds_counter:03d}"
            elif "DP" in applies and "DS" not in applies:
                dp_counter += 1
                rule_id = f"EMA-IMPD-P8-{dp_counter:03d}"
            else:
                ds_counter += 1
                rule_id = f"EMA-IMPD-GEN-{ds_counter:03d}"

            # Map to app sections
            mapped_sections = []
            if "DS" in applies:
                mapped_sections.extend(["3.2.S.7", "2.2.1.S.7"])
            if "DP" in applies:
                mapped_sections.extend(["3.2.P.8", "2.2.1.P.8"])

            # Map to UI fields based on content
            ui_fields = self._infer_ui_fields(raw["text"], applies)

            # Infer evidence expected
            evidence = self._infer_evidence(raw["text"])

            # Map requirement level to validation severity
            severity = "BLOCK" if raw["level"] == "MUST" else "WARN"

            # Generate validation logic expression
            logic = self._infer_validation_logic(raw["text"], ui_fields)

            # Generate excerpt (≤ 25 words)
            words = raw["text"].split()
            snippet = " ".join(words[:25])
            if len(words) > 25:
                snippet += "..."

            rule = ExtractedRule(
                rule_id=rule_id,
                applies_to=applies,
                mapped_app_sections=mapped_sections,
                requirement_level=raw["level"],
                rule_text=raw["text"],
                evidence_expected=evidence,
                ui_fields_required=ui_fields,
                validation_severity=severity,
                validation_logic=logic,
                traceability=RuleTraceability(
                    source_file_id=self.file_id,
                    page=raw["page"],
                    section_heading=raw["section_heading"],
                    excerpt_snippet=snippet,
                ),
                confidence=0.7,
            )
            rules.append(rule)

        return rules

    def _infer_ui_fields(self, text: str, applies_to: list[str]) -> list[str]:
        """Infer which UI fields are required based on rule text content."""
        fields = []
        text_lower = text.lower()

        field_mappings = {
            "retest period": "ds.retest_period",
            "retest date": "ds.retest_period",
            "shelf life": "dp.shelf_life",
            "shelf-life": "dp.shelf_life",
            "storage condition": "{scope}.storage_conditions",
            "accelerated": "{scope}.study_accelerated",
            "long-term": "{scope}.study_long_term",
            "long term": "{scope}.study_long_term",
            "in-use stability": "dp.in_use_stability",
            "in use stability": "dp.in_use_stability",
            "stability commitment": "{scope}.stability_commitment",
            "ongoing stability": "{scope}.stability_commitment",
            "stability program": "{scope}.stability_commitment",
            "tabulated": "{scope}.stability_table",
            "summary": "{scope}.stability_table",
            "photostability": "{scope}.study_photostability",
            "stress": "{scope}.study_stress",
            "reconstitution": "dp.in_use_stability",
            "dilution": "dp.in_use_stability",
            "multi-dose": "dp.in_use_stability",
            "specification": "{scope}.specification_reference",
            "container closure": "{scope}.container_closure",
            "batch": "{scope}.lot_information",
        }

        for keyword, field_template in field_mappings.items():
            if keyword in text_lower:
                if "{scope}" in field_template:
                    for scope_label in applies_to:
                        scope_prefix = "ds" if scope_label == "DS" else "dp"
                        fields.append(field_template.replace("{scope}", scope_prefix))
                else:
                    fields.append(field_template)

        return list(set(fields))

    def _infer_evidence(self, text: str) -> list[str]:
        """Infer what evidence is expected based on rule text."""
        evidence = []
        text_lower = text.lower()

        evidence_map = {
            "stability table": ["table", "tabulated", "data", "results"],
            "retest period statement": ["retest period", "retest date"],
            "shelf-life statement": ["shelf life", "shelf-life"],
            "storage condition specification": ["storage condition", "store at"],
            "stability commitment statement": ["commitment", "ongoing", "stability program"],
            "accelerated study results": ["accelerated"],
            "long-term study results": ["long-term", "long term"],
            "photostability study": ["photostability", "photo"],
            "in-use stability data": ["in-use", "in use", "reconstitut", "dilut"],
            "stress study results": ["stress", "forced degradation"],
            "justification statement": ["justif", "rationale"],
        }

        for evidence_type, keywords in evidence_map.items():
            if any(kw in text_lower for kw in keywords):
                evidence.append(evidence_type)

        return evidence

    def _infer_validation_logic(self, text: str, ui_fields: list[str]) -> str:
        """
        Generate a declarative validation logic expression.

        These are evaluated by the RegulatoryRuleEngine at generation time.
        """
        if not ui_fields:
            return "manual_review_required"

        # Build presence checks for required fields
        checks = [f"field_present('{f}')" for f in ui_fields]
        return " AND ".join(checks)

    def _extract_glossary(self, pages: list[tuple[int, str]]) -> list[GlossaryEntry]:
        """Extract glossary/definition terms from the guideline."""
        entries = []
        full_text = "\n".join(text for _, text in pages)

        # Look for definition patterns
        # Pattern: "term" means/is defined as/refers to ...
        def_patterns = [
            re.compile(r'"([^"]+)"\s+(?:means|is defined as|refers to)\s+(.+?)(?:\.|$)', re.IGNORECASE),
            re.compile(r"'([^']+)'\s+(?:means|is defined as|refers to)\s+(.+?)(?:\.|$)", re.IGNORECASE),
        ]

        for page_num, page_text in pages:
            for pattern in def_patterns:
                for match in pattern.finditer(page_text):
                    entries.append(GlossaryEntry(
                        term=match.group(1).strip(),
                        definition=match.group(2).strip()[:500],
                        source_page=page_num,
                    ))

        # Also add standard stability terms
        standard_terms = {
            "retest period": "The period of time during which the drug substance is expected to remain within its specification and therefore can be used in the manufacture of a given drug product, provided that the drug substance has been stored under the defined conditions.",
            "shelf life": "The time period during which a drug product is expected to remain within the approved specification, provided that it is stored under the conditions defined on the container label.",
            "accelerated testing": "Studies designed to increase the rate of chemical degradation or physical change of a drug substance or drug product by using exaggerated storage conditions.",
            "in-use stability": "Stability of a drug product after opening of the container, reconstitution, dilution, or mixing, as appropriate.",
        }

        seen_terms = {e.term.lower() for e in entries}
        for term, definition in standard_terms.items():
            if term.lower() not in seen_terms:
                entries.append(GlossaryEntry(term=term, definition=definition, source_page=0))

        return entries


def compute_file_checksum(file_path: str) -> str:
    """Compute SHA-256 checksum of a file."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()
