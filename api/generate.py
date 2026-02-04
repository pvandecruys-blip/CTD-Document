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

CTD_STABILITY_SYSTEM_PROMPT = """Generate CTD section 3.2.S.7.3 "Stability Data" as a complete HTML document.

OUTPUT: Return only HTML starting with <!DOCTYPE html> and ending with </html>. No markdown fences or commentary.

STRUCTURE:
1. Cover page: "3.2.S.7.3 STABILITY DATA" + drug name
2. Table of Contents (linked)
3. List of Tables (linked)
4. Abbreviations table (API, CoA, CTD, HPLC, ICH, NMT, NLT, RH, etc.)
5. Introduction: "Batches of [DRUG NAME] placed into stability studies, the storage conditions utilized, and the data collected to date are presented in the table below and in subsequent tables."
6. Table 1: Overview (columns: Table link, Batch, Type, Condition, Available data)
7. Detailed tables per batch/condition with: header block (drug name, batch, manufacturer, storage), results grid (test items, acceptance criteria, timepoints)

STYLE:
- A4, Arial 11pt, margins 2.54cm
- Tables: border 1px #999, header #003366 white text, zebra striping
- Links: #0066cc underlined
- Page breaks before each major section

RULES:
- Never invent data - use "—" for missing values
- Preserve "[REDACTED]" exactly
- Use "Drug substance", "Batch", "Test item", "Acceptance criteria" terminology
- Format conditions as "25°C / 60% RH"
- Map study types: long_term→Long-term, accelerated→Accelerated, etc.
"""


# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://genai-sharedservice-emea.pwc.com")
MODEL = os.environ.get("ANTHROPIC_MODEL", "vertex_ai.anthropic.claude-opus-4-5")
TEMPERATURE = 0.0
MAX_TOKENS = 16384


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

    # Documents
    if documents:
        doc_parts = []
        for d in documents:
            text = d.get("extracted_text", "").strip()
            if text:
                if len(text) > 10000:
                    text = text[:10000] + "\n[truncated]"
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
    Generate CTD stability document.

    Args:
        data: Structured input with project, studies, lots, conditions, attributes, documents

    Returns:
        dict with run_id, html, and metadata
    """
    run_id = str(uuid4())
    started_at = datetime.now(timezone.utc)

    # Serialize input
    user_prompt = _serialize_input(data) + "\n\n---\nGenerate the complete HTML document."

    # Call AI (using PwC GenAI service)
    client = anthropic.Anthropic(api_key=API_KEY, base_url=BASE_URL)
    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        temperature=TEMPERATURE,
        system=CTD_STABILITY_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    # Extract HTML
    html = response.content[0].text.strip()
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
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
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
