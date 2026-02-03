"""
CTD Stability Document Writer — 3.2.S.7.3 Stability Data.

SERVERLESS-COMPATIBLE: No filesystem writes. Generated HTML is returned
directly and stored in SQLite by the caller.

Uses Claude API to generate Word-friendly HTML for CTD Module 3 section 3.2.S.7.3.
"""

import json
import os
import re
from datetime import datetime, timezone
from uuid import uuid4

import anthropic


API_KEY = os.environ.get(
    "ANTHROPIC_API_KEY", "sk-nrYZTmnPgUu2a7uxxCZLsg"
)
BASE_URL = os.environ.get(
    "ANTHROPIC_BASE_URL", "https://genai-sharedservice-emea.pwc.com"
)
MODEL = os.environ.get(
    "ANTHROPIC_MODEL", "vertex_ai.anthropic.claude-opus-4-5"
)


def _get_client() -> anthropic.Anthropic:
    """Get Anthropic client pointing at the configured endpoint."""
    return anthropic.Anthropic(api_key=API_KEY, base_url=BASE_URL)


# ── Prompt helpers ───────────────────────────────────────────────

def _format_document_texts(document_texts: list[dict] | None) -> str:
    """Format extracted document texts for inclusion in the prompt."""
    if not document_texts:
        return "(No source documents provided)"

    parts = []
    for doc in document_texts:
        name = doc.get("filename", "Unknown")
        classification = doc.get("classification", "unknown")
        text = doc.get("text", "").strip()
        if text:
            # Truncate very long documents to stay within token limits
            if len(text) > 30000:
                text = text[:30000] + "\n... [truncated]"
            parts.append(f"── {name} [{classification}] ──\n{text}")
    return "\n\n".join(parts) if parts else "(No text could be extracted from documents)"


# ── Prompt builder ───────────────────────────────────────────────

def _build_stability_prompt(
    project: dict,
    studies: list[dict],
    lots: list[dict],
    conditions: list[dict],
    attributes: list[dict],
    options: dict,
    document_texts: list[dict] | None = None,
) -> str:
    """Build the detailed 3.2.S.7.3 prompt for Claude."""

    drug_substance_name = project.get("name", "Drug Substance")
    description = project.get("description", "")

    # Build abbreviations list
    abbreviations = [
        ("API", "Active Pharmaceutical Ingredient"),
        ("CoA", "Certificate of Analysis"),
        ("CTD", "Common Technical Document"),
        ("HPLC", "High Performance Liquid Chromatography"),
        ("ICH", "International Council for Harmonisation"),
        ("NMT", "Not More Than"),
        ("NLT", "Not Less Than"),
        ("RH", "Relative Humidity"),
        ("Ph. Eur.", "European Pharmacopoeia"),
        ("USP", "United States Pharmacopeia"),
    ]
    abbrev_text = "\n".join(f"  - {abbr}: {defn}" for abbr, defn in abbreviations)

    # Build stability tables data from extracted studies/lots/conditions/attributes
    table_entries = []
    table_num = 2
    for study in studies:
        study_type = study.get("study_type", "long_term")
        study_label = study.get("study_label", "Unnamed study")

        # Determine table type label
        type_labels = {
            "long_term": "Long-term",
            "accelerated": "Accelerated",
            "intermediate": "Intermediate",
            "stress": "Stress",
            "photostability": "Photostability",
        }
        table_type = type_labels.get(study_type, study_type.replace("_", " ").title())

        for lot in lots:
            if lot.get("study_id") and lot["study_id"] != study.get("id"):
                continue
            for cond in conditions:
                entry = {
                    "table_number": table_num,
                    "table_type": table_type,
                    "batch_number": lot.get("lot_number", "—"),
                    "batch_type": lot.get("intended_use", "Development"),
                    "batch_size": lot.get("batch_size", "—"),
                    "manufacturing_date": lot.get("manufacturing_date", "—"),
                    "manufacturer": lot.get("manufacturer", "—"),
                    "container_closure": lot.get("container_closure", "—"),
                    "storage_condition": cond.get("label", "—"),
                    "storage_orientation": cond.get("orientation", "N/A"),
                    "available_duration": cond.get("duration", "—"),
                    "timepoints": cond.get("timepoints", ["Initial", "3", "6", "9", "12", "18", "24", "36"]),
                    "test_items": [],
                }
                for attr in attributes:
                    criteria_list = attr.get("acceptance_criteria", [])
                    criteria_text = "; ".join(
                        c.get("criteria_text", "—") for c in criteria_list
                    ) or "—"
                    entry["test_items"].append({
                        "name": attr.get("name", "—"),
                        "acceptance_criteria": criteria_text,
                        "results": {},  # No results yet — Claude will use "—"
                    })
                table_entries.append(entry)
                table_num += 1

    # If no table entries were generated, create a placeholder
    if not table_entries:
        table_entries.append({
            "table_number": 2,
            "table_type": "Long-term",
            "batch_number": "—",
            "batch_type": "Development",
            "batch_size": "—",
            "manufacturing_date": "—",
            "manufacturer": "—",
            "container_closure": "—",
            "storage_condition": "25°C / 60% RH",
            "storage_orientation": "N/A",
            "available_duration": "—",
            "timepoints": ["Initial", "3", "6", "9", "12"],
            "test_items": [{"name": a.get("name", "—"), "acceptance_criteria": "—", "results": {}} for a in attributes] if attributes else [{"name": "—", "acceptance_criteria": "—", "results": {}}],
        })

    # Format table entries for the prompt
    tables_text = ""
    for entry in table_entries:
        tables_text += f"""
TABLE {entry['table_number']}:
  Type: {entry['table_type']}
  Batch number: {entry['batch_number']}
  Batch type: {entry['batch_type']}
  Batch size: {entry['batch_size']}
  Manufacturing date: {entry['manufacturing_date']}
  Manufacturer: {entry['manufacturer']}
  Container/closure: {entry['container_closure']}
  Storage condition: {entry['storage_condition']}
  Storage orientation: {entry['storage_orientation']}
  Available duration: {entry['available_duration']}
  Timepoints (months): {', '.join(str(t) for t in entry['timepoints'])}
  Test items:
"""
        for ti in entry["test_items"]:
            tables_text += f"    - {ti['name']} | Acceptance: {ti['acceptance_criteria']}\n"

    # Build Table 1 overview text
    table1_rows = ""
    for entry in table_entries:
        table1_rows += f"  - Table {entry['table_number']}: Batch {entry['batch_number']}, {entry['batch_type']}, {entry['storage_condition']}, Available: {entry['available_duration']}\n"

    prompt = f"""You are a senior CMC regulatory writer producing Module 3 CTD content for:
3.2.S.7.3 STABILITY DATA (Drug Substance).

Your task is to generate a stability data document that matches the reference layout and style:
- A "TABLE OF CONTENTS" page with dot leaders and blue underlined internal links
- A "LIST OF TABLES" page with blue underlined internal links
- "ABBREVIATIONS"
- "1 INTRODUCTION"
- "2 DATA TABLES"
- Table 1 = master overview titled "Stability data for {drug_substance_name}"
  that lists each detailed stability table, batch type, storage condition, and available duration.
- Then Table 2..N = detailed stability tables for each batch/condition.

REGULATORY CONTEXT (Drug Substance, CTD structure)
- This deliverable is specifically for 3.2.S.7.3 (stability data tables). Keep narrative minimal and factual.
- Do NOT invent scientific conclusions unless the user explicitly requests "summary/conclusions" text.

OUTPUT FORMAT:
Return Word-friendly HTML including page breaks, headings, and anchor links so TOC/List of Tables hyperlink internally.
The HTML will be converted to PDF so use @page CSS for A4, proper margins, and page-break-before/after.

STRICT STYLE + LAYOUT RULES
- Page size A4 portrait, normal margins (2.54 cm).
- Font: Arial, Calibri, or Helvetica; body ~11pt. Headings bold, larger.
- Major page titles centered and uppercase: "TABLE OF CONTENTS", "LIST OF TABLES".
- Use numbering exactly: "1 INTRODUCTION", "2 DATA TABLES".
- Use dot leaders in TOC and List of Tables.
- TOC/List of Tables entries must be blue, underlined internal hyperlinks.
- Table titles must follow: "Table X – <Long-term/Accelerated/etc.> stability batch".
- If any value is missing: write "—" (do not infer).
- Table borders: thin solid lines. Header row with dark background and white text.
- Zebra-stripe table rows for readability.

CSS REQUIREMENTS (embed in <style> block):
- @page {{ size: A4; margin: 2.54cm; }}
- body {{ font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #333; }}
- Use .page-break {{ page-break-before: always; }} for new pages
- Table styling with collapsed borders, header bg #003366 text white
- Alternating row backgrounds #f9f9f9
- Internal anchor links in blue (#0066cc), underlined

USER INPUTS:

A) DOCUMENT METADATA
- Section label: 3.2.S.7.3
- Drug substance name: {drug_substance_name}
{f"- Description: {description}" if description else ""}
- Confidentiality: use [REDACTED] where manufacturer-specific info would go if not provided

B) ABBREVIATIONS
{abbrev_text}

C) TABLE 1 OVERVIEW DATA (for the master summary table)
{table1_rows}

D) STABILITY PROGRAM TABLES (structured data if extracted)
{tables_text}

E) SOURCE DOCUMENTS (extracted text from uploaded files — USE THIS DATA)
{_format_document_texts(document_texts)}

CRITICAL: The source documents above contain the REAL stability data (batch numbers,
storage conditions, timepoints, test results, acceptance criteria, etc.).
You MUST extract and use the actual data from these documents to populate the tables.
If the structured data in section D is incomplete or placeholder, prioritize the
source document content. Do NOT use placeholder dashes if real data is available
in the source documents.

DOCUMENT STRUCTURE TO GENERATE (exact order):

[Cover/header section]
- Title: "3.2.S.7.3 STABILITY DATA"
- Drug substance name

[Next page] TABLE OF CONTENTS
With dot leaders + internal anchor links for each section.

[Next page] LIST OF TABLES
- "Table 1 – Stability data for {drug_substance_name}"
- One entry per detailed table (Table 2..N)
- Each is a blue underlined internal link.

[Next page] ABBREVIATIONS
2-column table: Abbreviation | Definition

[Next] 1 INTRODUCTION
Write 1 short paragraph:
"Batches of {drug_substance_name} placed into stability studies, the storage conditions utilized, and the data collected to date are presented in the table below and in subsequent tables."

[Next] Table 1 – Stability data for {drug_substance_name}
Columns: Table (hyperlink) | Batch number | Batch type | Storage condition | Available data

[Next] 2 DATA TABLES
For each detailed stability table (Table 2..N), generate:

A) Table title: "Table X – <Type> stability batch"

B) Header block (two-column layout):
Left: Drug substance, Manufacturing date, Container/closure, Storage condition, Storage orientation
Right: Batch no., Batch size, Manufacturer

C) Main results grid:
First columns: "Test item" | "Acceptance criteria"
Then merged header: "Time [months]" with sub-columns for each timepoint.
Populate with provided results or "—" for missing values.

QUALITY CHECKS:
- Table numbering consistent across TOC, List of Tables, Table 1 overview, and detailed tables.
- Every detailed table referenced in Table 1 exists.
- No invented data, no invented acceptance criteria.
- Preserve [REDACTED] exactly wherever it appears.

Return ONLY the completed HTML document. No commentary, no explanations, no reasoning.
Start with <!DOCTYPE html> and end with </html>."""

    return prompt


def _clean_html_response(text: str) -> str:
    """Extract HTML from Claude's response, stripping any markdown fences."""
    cleaned = text.strip()
    # Remove markdown code fences if present
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:html)?\s*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```\s*$", "", cleaned)
    # Ensure it starts with DOCTYPE or <html>
    if not cleaned.lower().startswith("<!doctype") and not cleaned.lower().startswith("<html"):
        # Wrap in basic HTML
        cleaned = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@page {{ size: A4; margin: 2.54cm; }}
body {{ font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #333; }}
</style>
</head>
<body>
{cleaned}
</body>
</html>"""
    return cleaned


async def generate_stability_document(
    project: dict,
    project_id: str,
    studies: list[dict],
    lots: list[dict],
    conditions: list[dict],
    attributes: list[dict],
    options: dict,
    documents: list[dict] | None = None,
) -> tuple[dict, str]:
    """
    Generate a CTD 3.2.S.7.3 stability data document using Claude API.

    SERVERLESS: No files written to disk. Returns tuple of (metadata, html_content).
    The caller is responsible for storing the HTML (e.g., in SQLite).

    Args:
        project: Project metadata dict
        project_id: Project ID (used to fetch document bytes from DB)
        studies, lots, conditions, attributes: Extracted stability data
        options: Generation options
        documents: Document metadata list (bytes fetched from DB)

    Returns:
        Tuple of (run_metadata_dict, html_content_string)
    """
    run_id = str(uuid4())
    now = datetime.now(timezone.utc)

    # 1. Extract text from uploaded documents (fetching bytes from SQLite)
    document_texts = []
    if documents:
        from app import store
        from app.services.extraction.text_extractor import extract_text_from_bytes

        for doc in documents:
            doc_id = doc.get("id")
            file_type = doc.get("file_type", "")
            if doc_id and file_type:
                try:
                    # Fetch file bytes from in-memory store
                    file_bytes = store.get_document_bytes(project_id, doc_id)
                    if file_bytes:
                        text = extract_text_from_bytes(file_bytes, file_type)
                        if text.strip():
                            document_texts.append({
                                "filename": doc.get("original_filename", "Unknown"),
                                "classification": doc.get("classification", "unknown"),
                                "text": text,
                            })
                except Exception:
                    pass  # Skip files that can't be parsed

    # 2. Build prompt
    prompt = _build_stability_prompt(
        project, studies, lots, conditions, attributes, options,
        document_texts=document_texts or None,
    )

    # 3. Call Claude API
    client = _get_client()
    message = client.messages.create(
        model=MODEL,
        max_tokens=16384,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = message.content[0].text

    # 4. Clean HTML response
    html_content = _clean_html_response(response_text)

    # 5. Build run metadata (no file paths — HTML stored in DB by caller)
    run_metadata = {
        "run_id": run_id,
        "status": "completed",
        "outputs": {
            "html": f"/api/v1/outputs/{run_id}/3.2.S.7.3_stability.html",
            "traceability_json": f"/api/v1/outputs/{run_id}/traceability.json",
        },
        "validation_result": None,
        "created_at": now.isoformat(),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "token_usage": {
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
        },
        # Inline traceability data (no separate file needed)
        "traceability": {
            "run_id": run_id,
            "generated_at": now.isoformat(),
            "model": MODEL,
            "prompt_tokens": message.usage.input_tokens,
            "completion_tokens": message.usage.output_tokens,
            "project": project.get("name"),
            "studies_count": len(studies),
            "lots_count": len(lots),
            "conditions_count": len(conditions),
            "attributes_count": len(attributes),
        },
    }

    # Return both metadata and HTML content
    return run_metadata, html_content
