"""
Vercel Serverless Function: /api/trace

Lightweight AI call to create source traceability mapping.
Takes generated HTML table values + source documents,
returns a JSON mapping of references.
"""

import json
import os
import re
from http.server import BaseHTTPRequestHandler

import anthropic


# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://genai-sharedservice-emea.pwc.com")
MODEL = os.environ.get("ANTHROPIC_MODEL", "vertex_ai.anthropic.claude-opus-4-5")
TEMPERATURE = 0.0

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

TRACE_SYSTEM_PROMPT = """You are a source traceability engine. You receive:
1. A list of data values extracted from a generated CTD document
2. Source documents with their extracted text

Your job is to find where each data value originated in the source documents.

# OUTPUT FORMAT
Return ONLY a valid JSON array. No commentary, no markdown fences.

Each element:
{
  "value": "the exact data value",
  "found": true/false,
  "source_filename": "filename or null",
  "source_context": "20-30 word quote from the source document containing this value, or null",
  "confidence": "high" | "medium" | "low"
}

# RULES
1. Match values exactly or with minor formatting differences (e.g., "99.5%" matches "99.5 %")
2. For numeric values, match if the number is the same regardless of formatting
3. Set "found": false if the value cannot be located in any source document
4. "confidence": "high" = exact match, "medium" = number matches but context differs, "low" = partial/inferred match
5. Keep source_context short (20-30 words max) — just enough to show the surrounding text
6. Do NOT invent sources. If a value is not in the documents, mark found: false
7. Return the JSON array and nothing else
"""


def _send_json(handler, data, status=200):
    handler.send_response(status)
    for k, v in CORS_HEADERS.items():
        handler.send_header(k, v)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(data).encode())


def trace(data: dict) -> dict:
    """Create traceability mapping from table values to source documents."""
    values = data.get("values", [])
    documents = data.get("documents", [])

    if not values or not documents:
        return {"references": [], "error": None}

    # Build the user prompt
    values_text = "\n".join(f"- {v}" for v in values[:200])  # Limit to 200 values

    docs_text = []
    for d in documents:
        text = d.get("extracted_text", "").strip()
        if text:
            if len(text) > 30000:
                text = text[:30000] + "\n[truncated]"
            docs_text.append(f"── {d.get('filename', 'unknown')} ──\n{text}")

    user_prompt = f"""# DATA VALUES TO TRACE
{values_text}

# SOURCE DOCUMENTS
{chr(10).join(docs_text) if docs_text else "(no documents)"}

Return the JSON array now."""

    # Call AI
    client = anthropic.Anthropic(api_key=API_KEY, base_url=BASE_URL)

    response = client.messages.create(
        model=MODEL,
        max_tokens=16000,
        temperature=TEMPERATURE,
        system=TRACE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    # Parse response
    raw = response.content[0].text.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*\n?", "", raw)
        raw = re.sub(r"\n?```\s*$", "", raw)

    try:
        references = json.loads(raw)
    except json.JSONDecodeError:
        references = []

    return {
        "references": references,
        "metadata": {
            "model": MODEL,
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            "values_sent": len(values),
        },
    }


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            _send_json(self, {"error": "Invalid JSON"}, 400)
            return

        try:
            result = trace(data)
            _send_json(self, result)
        except Exception as e:
            _send_json(self, {"error": str(e)}, 500)
