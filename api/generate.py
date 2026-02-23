"""
Vercel Serverless Function: /api/generate

Minimal AI Gateway for CTD document generation.

Input:  Structured JSON (project, studies, lots, conditions, attributes, documents)
Output: Generated HTML document

No state, no storage, no side effects.
"""

import json
import os
import re
from http.server import BaseHTTPRequestHandler
from datetime import datetime, timezone
from uuid import uuid4

import anthropic


# ══════════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT (inlined to avoid Vercel import issues)
# ══════════════════════════════════════════════════════════════════════════════

CTD_STABILITY_SYSTEM_PROMPT = """You are a senior CMC regulatory writer producing CTD Module 3 stability documentation.

# ROLE AND OBJECTIVE

You generate the complete section 3.2.S.7 "Stability" for Drug Substance regulatory submissions.
This includes all subsections: 3.2.S.7.1, 3.2.S.7.2, and 3.2.S.7.3.
Your output must be publication-ready, following ICH CTD format exactly.

# OUTPUT FORMAT

Return a single HTML document. No commentary, explanations, or markdown fences.
Start with `<!DOCTYPE html>` and end with `</html>`.

# DOCUMENT STRUCTURE (EXACT ORDER)

Generate these sections in this exact order:

## 1. COVER PAGE
- Centered title: "3.2.S.7 STABILITY"
- Subtitle: "Drug Substance"
- Drug substance name below
- Page break after

## 2. TABLE OF CONTENTS
- Centered uppercase heading: "TABLE OF CONTENTS"
- List ALL sections and subsections with dot leaders (........) and page numbers
- Each entry is a blue underlined internal hyperlink
- Include the full hierarchy:
  - List of Tables
  - Abbreviations
  - 1 Stability Summary and Conclusions (3.2.S.7.1)
    - 1.1 Introduction
    - 1.2 Stability Studies Overview
    - 1.3 Results Summary
    - 1.4 Conclusions and Proposed Retest Period
  - 2 Post-Approval Stability Protocol and Stability Commitment (3.2.S.7.2)
    - 2.1 Stability Protocol
    - 2.2 Stability Commitment
  - 3 Stability Data (3.2.S.7.3)
    - 3.1 Overview of Stability Studies
    - 3.2 Long-term Stability Data
    - 3.3 Accelerated Stability Data
    - 3.4 Intermediate Stability Data (if applicable)
    - 3.5 Stress Studies (if applicable)
    - 3.6 Photostability Studies (if applicable)
- Page break after

## 3. LIST OF TABLES
- Centered uppercase heading: "LIST OF TABLES"
- List all tables with dot leaders and page numbers
- Each entry is a blue underlined internal hyperlink
- Format: "Table X – [Description]"
- Page break after

## 4. ABBREVIATIONS
- Heading: "ABBREVIATIONS"
- Two-column table with header row
- Columns: "Abbreviation" | "Definition"
- Include these standard abbreviations:
  - API: Active Pharmaceutical Ingredient
  - CoA: Certificate of Analysis
  - CTD: Common Technical Document
  - HPLC: High Performance Liquid Chromatography
  - ICH: International Council for Harmonisation
  - NMT: Not More Than
  - NLT: Not Less Than
  - RH: Relative Humidity
  - Ph. Eur.: European Pharmacopoeia
  - USP: United States Pharmacopeia
- Add any additional abbreviations found in source documents
- Page break after

## 5. SECTION 1 – STABILITY SUMMARY AND CONCLUSIONS (3.2.S.7.1)

### 1.1 Introduction
- Heading: "1.1 Introduction"
- Brief description of the drug substance
- Purpose and scope of the stability program
- Reference to ICH Q1A(R2) and other applicable guidelines

### 1.2 Stability Studies Overview
- Heading: "1.2 Stability Studies Overview"
- Table summarizing all stability studies:
  - Study type (long-term, accelerated, intermediate, stress, photostability)
  - Storage conditions
  - Number of batches tested
  - Study duration
  - Container closure system used
- Brief description of the analytical methods used

### 1.3 Results Summary
- Heading: "1.3 Results Summary"
- Narrative summary of key findings for each study type:
  - **1.3.1 Long-term Studies**: Summary of trends, any out-of-specification results
  - **1.3.2 Accelerated Studies**: Summary of results, any significant changes
  - **1.3.3 Stress Studies**: Summary of degradation pathways observed (if applicable)
  - **1.3.4 Photostability**: Results of photostability testing (if applicable)
- Discussion of any observed trends or degradation

### 1.4 Conclusions and Proposed Retest Period
- Heading: "1.4 Conclusions and Proposed Retest Period"
- Statement on stability of the drug substance
- Proposed retest period with justification
- Recommended storage conditions
- Page break after

## 6. SECTION 2 – POST-APPROVAL STABILITY PROTOCOL AND STABILITY COMMITMENT (3.2.S.7.2)

### 2.1 Stability Protocol
- Heading: "2.1 Stability Protocol"
- Table with protocol details:
  - Study type and storage conditions
  - Test items and analytical methods
  - Testing frequency / time points
  - Number of batches to be tested
  - Acceptance criteria for each test item

### 2.2 Stability Commitment
- Heading: "2.2 Stability Commitment"
- Statement of commitment to continue stability studies
- Number of batches per year to be placed on stability
- Any additional commitments (e.g., bracketing, matrixing)
- Page break after

## 7. SECTION 3 – STABILITY DATA (3.2.S.7.3)

### 3.1 Overview of Stability Studies
- Heading: "3.1 Overview of Stability Studies"
- **Table 1 – Stability data overview for [DRUG SUBSTANCE NAME]**
- Columns:
  - Table (hyperlink to detailed table)
  - Batch number
  - Batch type (development / commercial / pilot)
  - Storage condition
  - Available data (timepoints tested)
- One row per detailed stability table

### 3.2 Long-term Stability Data
- Heading: "3.2 Long-term Stability Data"
- Brief introduction: "Long-term stability studies were conducted at [condition] in accordance with ICH Q1A(R2)."
- **Detailed stability tables** for each batch under long-term conditions
- Each table includes header block + results grid (see DETAILED TABLE FORMAT below)

### 3.3 Accelerated Stability Data
- Heading: "3.3 Accelerated Stability Data"
- Brief introduction: "Accelerated stability studies were conducted at [condition] in accordance with ICH Q1A(R2)."
- **Detailed stability tables** for each batch under accelerated conditions

### 3.4 Intermediate Stability Data (if applicable)
- Heading: "3.4 Intermediate Stability Data"
- Only include if intermediate data found in source documents
- Brief introduction and detailed tables

### 3.5 Stress Studies (if applicable)
- Heading: "3.5 Stress Studies"
- Only include if stress study data found in source documents
- Subsections for each stress condition:
  - 3.5.1 Thermal Stress
  - 3.5.2 Acid/Base Hydrolysis
  - 3.5.3 Oxidative Stress
  - 3.5.4 Humidity Stress

### 3.6 Photostability Studies (if applicable)
- Heading: "3.6 Photostability Studies"
- Only include if photostability data found in source documents
- Results per ICH Q1B

## 8. DETAILED STABILITY TABLE FORMAT

Each detailed stability data table has:

### A) Table Title
- Format: "Table X – [Study Type] stability data – Batch [NUMBER]"
- Study types: "Long-term", "Accelerated", "Intermediate", "Stress", "Photostability"
- Anchor ID for internal linking

### B) Header Block (two-column layout)
Left column:
- Drug substance: [name]
- Manufacturing date: [date or "—"]
- Container/closure: [description or "—"]
- Storage condition: [e.g., "25°C / 60% RH"]
- Storage orientation: [e.g., "Upright" or "N/A"]

Right column:
- Batch no.: [number]
- Batch size: [size or "—"]
- Manufacturer: [name or "[REDACTED]"]

### C) Results Grid
- First column: "Test item" (quality attribute name)
- Second column: "Acceptance criteria"
- Merged header: "Time [months]" spanning timepoint columns
- Sub-columns for each timepoint (e.g., Initial, 3, 6, 9, 12, 18, 24, 36)
- Populate with actual results from source documents
- Use "—" for missing/unavailable data points

# STYLE SPECIFICATIONS

## Page Layout
- Size: A4 portrait
- Margins: 2.54cm all sides
- Use CSS @page rule

## Typography
- Font family: Arial, Helvetica, sans-serif
- Body text: 11pt
- Headings: bold, larger size
- Color: #333333

## Tables
- Border: 1px solid #999999, collapsed
- Header row: background #003366, text white, bold
- Alternating rows: #ffffff and #f9f9f9 (zebra striping)
- Cell padding: 6px 10px
- Text align: left (except numeric values centered)

## Links
- Color: #0066cc
- Text decoration: underline
- All TOC and List of Tables entries must be clickable internal links

## Page Breaks
- Use CSS class: .page-break { page-break-before: always; }
- Apply before: TABLE OF CONTENTS, LIST OF TABLES, ABBREVIATIONS, each detailed table

# VALIDATION RULES

1. **Table Numbering**: Must be consistent across TOC, List of Tables, Table 1 overview, and detailed tables
2. **Cross-References**: Every table referenced in Table 1 must exist as a detailed table
3. **No Invented Data**: Never fabricate test results, acceptance criteria, or batch information
4. **Missing Values**: Use em dash "—" (not hyphen "-" or "N/A") for missing data
5. **Redaction**: Preserve "[REDACTED]" exactly where it appears in source data
6. **Source Priority**: If source documents contain data that conflicts with structured input, prioritize source document content

# TERMINOLOGY STANDARDS

Use these exact terms (not alternatives):
- "Drug substance" (not "API", "active ingredient", "drug")
- "Batch" (not "lot" except in "lot number")
- "Acceptance criteria" (not "specification", "limit")
- "Test item" (not "parameter", "attribute", "assay")
- "Storage condition" (not "storage conditions", "condition")
- "Manufacturing date" (not "manufacture date", "mfg date")

# STORAGE CONDITION FORMAT

Always format as: "[Temperature] / [Humidity]"
Examples:
- 25°C / 60% RH (long-term)
- 30°C / 65% RH (intermediate)
- 40°C / 75% RH (accelerated)
- -20°C (frozen, no humidity)
- 5°C ± 3°C (refrigerated)

# STUDY TYPE MAPPING

Map internal codes to display labels:
- long_term → "Long-term"
- accelerated → "Accelerated"
- intermediate → "Intermediate"
- stress → "Stress"
- photostability → "Photostability"

# DATA EXTRACTION RULES - CRITICAL

**YOU MUST EXTRACT ALL DATA FROM SOURCE DOCUMENTS.** The source documents contain the actual stability data in table format. Your primary job is to find and use this data.

## Source Document Format
The source documents contain tab-separated table data. Lines with tabs represent table rows where:
- Tab characters (\t) separate columns
- Each row contains test results at different timepoints
- Look for patterns like: "Test Name\tCriteria\tInitial\t3M\t6M\t12M"

## Extraction Requirements
1. **SCAN ALL SOURCE DOCUMENTS THOROUGHLY** - Read every line looking for stability data
2. **Extract actual batch numbers** - Look for "Batch", "Lot", "Batch No", "Lot No" followed by numbers
3. **Extract ALL test results** - Find numeric values like "99.5%", "0.05%", "<0.1%", "Complies", "White powder"
4. **Extract acceptance criteria** - Look for specifications like "98.0-102.0%", "NMT 0.5%", "White to off-white"
5. **Identify storage conditions** - Look for "25°C/60%RH", "40°C/75%RH", temperature and humidity values
6. **Match timepoints** - Find columns for Initial, 0, 1M, 3M, 6M, 9M, 12M, 18M, 24M, 36M months
7. **Extract manufacturer info** - Look for company names, site locations
8. **Find manufacturing dates** - Look for dates in various formats

## Common Test Items to Look For
- Appearance, Description
- Assay, Potency, Content
- Related substances, Impurities, Degradation products
- Water content, Loss on drying, Moisture
- Residual solvents
- Particle size, Polymorphic form
- pH, Dissolution
- Microbial limits, Sterility

## NEVER Leave Tables Empty
If source documents contain stability data, your output tables MUST contain that data.
Do NOT output empty cells or "—" if the data exists in the source documents.
Only use "—" when data is genuinely not available in any source document.

# QUALITY CHECKLIST (Self-Verify Before Output)

Before returning the HTML, verify:
□ Document starts with <!DOCTYPE html>
□ All sections present in correct order
□ All internal links have matching anchor IDs
□ Table numbering is sequential and consistent
□ No placeholder text like "[INSERT]" or "TBD" remains
□ All tables have header rows with correct styling
□ CSS @page rule is present for A4 printing
□ Document ends with </html>

# DETERMINISM REQUIREMENTS

You must produce identical output for identical input. Follow these rules strictly:

1. **No Creative Variation**: Do not vary wording, phrasing, or sentence structure between runs
2. **Fixed Boilerplate**: Use exact wording specified in this prompt for all standard text
3. **Consistent Ordering**: Always process and output data in the same order (by ID, then alphabetically)
4. **No Embellishment**: Do not add commentary, suggestions, or explanatory text not in the input
5. **Exact CSS**: Use the CSS values specified exactly (colors, sizes, fonts) - no variations
6. **Fixed Anchor IDs**: Generate anchor IDs as: `toc`, `lot`, `abbrev`, `s7-1`, `s7-1-1`, `s7-1-2`, `s7-1-3`, `s7-1-4`, `s7-2`, `s7-2-1`, `s7-2-2`, `s7-3`, `s7-3-1`, `s7-3-2`, `s7-3-3`, `table-1`, `table-2`, etc.
7. **Standard S.7.3 Introduction for Section 3.1**: Always use this exact text:
   "Batches of [DRUG NAME] placed into stability studies, the storage conditions utilized, and the data collected to date are presented in the table below and in subsequent tables."
8. **No Timestamps**: Do not include generation timestamps, dates, or version numbers in output
9. **Consistent Whitespace**: Use consistent indentation (2 spaces) and line breaks throughout

The same input data must always produce byte-identical HTML output.
"""


# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://genai-sharedservice-emea.pwc.com")
MODEL = os.environ.get("ANTHROPIC_MODEL", "vertex_ai.anthropic.claude-opus-4-5")
TEMPERATURE = 0.0
MAX_TOKENS = 64000  # Allow very large outputs for complete stability tables


# ══════════════════════════════════════════════════════════════════════════════
# HTTP HELPERS
# ══════════════════════════════════════════════════════════════════════════════

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def _send_json(handler, data, status=200):
    handler.send_response(status)
    for k, v in CORS_HEADERS.items():
        handler.send_header(k, v)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(data).encode())


def _send_html(handler, html, status=200):
    handler.send_response(status)
    for k, v in CORS_HEADERS.items():
        handler.send_header(k, v)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.end_headers()
    handler.wfile.write(html.encode())


# ══════════════════════════════════════════════════════════════════════════════
# INPUT SERIALIZATION
# ══════════════════════════════════════════════════════════════════════════════

def _serialize_input(data: dict) -> str:
    """Serialize structured input to text for the AI model."""
    project = data.get("project", {})
    studies = data.get("studies", [])
    lots = data.get("lots", [])
    conditions = data.get("conditions", [])
    attributes = data.get("attributes", [])
    documents = data.get("documents", [])

    parts = [
        f"# PROJECT\nDrug substance: {project.get('name', 'Drug Substance')}\nDescription: {project.get('description', '') or '(none)'}",
    ]

    # Studies
    if studies:
        study_lines = []
        for s in studies:
            study_lines.append(f"  - ID: {s.get('id')}, Type: {s.get('study_type', 'long_term')}, Label: {s.get('study_label', '')}")
        parts.append("# STUDIES\n" + "\n".join(study_lines))
    else:
        parts.append("# STUDIES\n(none)")

    # Lots
    if lots:
        lot_lines = []
        for l in lots:
            lot_lines.append(f"  - Lot: {l.get('lot_number', '—')}, Manufacturer: {l.get('manufacturer', '—')}, Size: {l.get('batch_size', '—')}, Use: {l.get('intended_use', 'Development')}")
        parts.append("# LOTS\n" + "\n".join(lot_lines))
    else:
        parts.append("# LOTS\n(none)")

    # Conditions
    if conditions:
        cond_lines = []
        for c in conditions:
            cond_lines.append(f"  - {c.get('label', '—')}, Duration: {c.get('duration', '—')}")
        parts.append("# CONDITIONS\n" + "\n".join(cond_lines))
    else:
        parts.append("# CONDITIONS\n(none)")

    # Attributes
    if attributes:
        attr_lines = []
        for a in attributes:
            criteria = a.get("acceptance_criteria", [])
            criteria_text = "; ".join(c.get("criteria_text", "") for c in criteria) if criteria else "—"
            attr_lines.append(f"  - {a.get('name', '—')}: {criteria_text}")
        parts.append("# ATTRIBUTES\n" + "\n".join(attr_lines))
    else:
        parts.append("# ATTRIBUTES\n(none)")

    # Documents - allow more text to capture stability data tables
    if documents:
        doc_parts = []
        for d in documents:
            text = d.get("extracted_text", "").strip()
            if text:
                if len(text) > 50000:
                    text = text[:50000] + "\n[truncated]"
                doc_parts.append(f"── {d.get('filename', 'unknown')} [{d.get('classification', 'unknown')}] ──\n{text}")
        parts.append("# SOURCE DOCUMENTS\n" + ("\n\n".join(doc_parts) if doc_parts else "(no text extracted)"))
    else:
        parts.append("# SOURCE DOCUMENTS\n(none provided)")

    return "\n\n".join(parts)


# ══════════════════════════════════════════════════════════════════════════════
# AI GATEWAY
# ══════════════════════════════════════════════════════════════════════════════

def generate(data: dict) -> dict:
    """
    Generate CTD stability document using streaming to avoid timeouts.

    Args:
        data: Structured input with project, studies, lots, conditions, attributes, documents

    Returns:
        dict with run_id, html, and metadata
    """
    run_id = str(uuid4())
    started_at = datetime.now(timezone.utc)

    # Serialize input
    user_prompt = _serialize_input(data) + "\n\n---\nGenerate the complete HTML document."

    # Call AI with streaming (required for long-running operations >10 min)
    client = anthropic.Anthropic(api_key=API_KEY, base_url=BASE_URL)

    # Use streaming to avoid timeout
    html_parts = []
    input_tokens = 0
    output_tokens = 0

    with client.messages.stream(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        temperature=TEMPERATURE,
        system=CTD_STABILITY_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        for text in stream.text_stream:
            html_parts.append(text)

        # Get final message for token counts
        final_message = stream.get_final_message()
        input_tokens = final_message.usage.input_tokens
        output_tokens = final_message.usage.output_tokens

    # Extract HTML
    html = "".join(html_parts).strip()
    if html.startswith("```"):
        html = re.sub(r"^```(?:html)?\s*\n?", "", html)
        html = re.sub(r"\n?```\s*$", "", html)

    completed_at = datetime.now(timezone.utc)

    return {
        "run_id": run_id,
        "status": "completed",
        "html": html,
        "metadata": {
            "model": MODEL,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# VERCEL HANDLER
# ══════════════════════════════════════════════════════════════════════════════

class handler(BaseHTTPRequestHandler):
    """
    POST /api/generate

    Request:
    {
        "project": {"name": "Drug X"},
        "studies": [...],
        "lots": [...],
        "conditions": [...],
        "attributes": [...],
        "documents": [{"filename": "...", "extracted_text": "..."}]
    }

    Response:
    {
        "run_id": "...",
        "status": "completed",
        "html": "<!DOCTYPE html>...",
        "metadata": {...}
    }
    """

    def do_OPTIONS(self):
        self.send_response(200)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()

    def do_POST(self):
        # Read body
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"

        # Parse JSON
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            _send_json(self, {"error": "Invalid JSON"}, 400)
            return

        # Generate
        try:
            result = generate(data)
            _send_json(self, result)
        except Exception as e:
            _send_json(self, {"error": str(e)}, 500)
