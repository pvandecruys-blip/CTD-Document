"""
Vercel Serverless Function: Regulatory Compliance Check

Reads a generated CTD document section and judges it, rule by rule, against the
applicable regulatory guidelines. Returns a structured verdict per rule with an
evidence quote pulled from the document (or a note on what is missing).
"""

import os
import re
import json
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler
import anthropic

# ── Configuration (mirrors generate.py / extract.py) ────────────────────────
API_KEY = os.environ.get("ANTHROPIC_API_KEY")
BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://genai-sharedservice-emea.pwc.com")
MODEL = os.environ.get("ANTHROPIC_MODEL", "vertex_ai.anthropic.claude-opus-4-5")
MAX_TOKENS = 4096
TEMPERATURE = 0.0

# Cap the document text we send so a huge stability table can't blow the budget.
MAX_DOC_CHARS = 60000

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

SYSTEM_PROMPT = """You are a regulatory affairs reviewer for ICH CTD Module 3 (Quality) submissions.
You are given the plain text of ONE generated CTD section and a list of regulatory rules that apply to it.

For EACH rule, decide whether the section's content satisfies it, judging ONLY on the text provided —
do not assume facts that are not present.

Return STRICT JSON (no markdown, no prose outside the JSON) of the form:
{
  "verdicts": [
    {
      "rule_id": "<the rule_id you were given>",
      "status": "pass" | "fail" | "warning" | "not_applicable",
      "evidence_quote": "<short verbatim quote from the document that supports your verdict, or empty string if missing>",
      "reasoning": "<one or two sentences explaining the verdict>",
      "suggestion": "<for fail/warning: a concrete fix; otherwise empty string>"
    }
  ]
}

Status guidance:
- "pass": the document clearly contains the required content; cite the supporting passage in evidence_quote.
- "fail": the rule is a hard requirement (severity BLOCK) and the required content is absent or contradicted.
- "warning": the content is partially present, ambiguous, or a SHOULD-level expectation is not clearly met.
- "not_applicable": the rule does not apply to this section/document (e.g. continuous-manufacturing rules for a batch process, biologics rules for content that is clearly small-molecule).

Output one verdict per rule, in the same order. Keep quotes short (one sentence/phrase)."""


# ── HTML → text ─────────────────────────────────────────────────────────────
class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip = True
        if tag in ("p", "br", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th"):
            self._parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            self._parts.append(data)

    def text(self):
        raw = "".join(self._parts)
        raw = re.sub(r"[ \t]+", " ", raw)
        raw = re.sub(r"\n\s*\n+", "\n", raw)
        return raw.strip()


def _html_to_text(html: str) -> str:
    parser = _TextExtractor()
    try:
        parser.feed(html or "")
    except Exception:
        # Fall back to a crude tag strip if the parser chokes on malformed HTML.
        return re.sub(r"<[^>]+>", " ", html or "").strip()
    return parser.text()


def _build_user_prompt(section: str, modality: str, doc_text: str, rules: list) -> str:
    lines = [
        f"# SECTION\n{section or 'unknown'}",
        f"\n# MODALITY\n{modality or 'NCE'}",
        "\n# RULES TO CHECK",
    ]
    for r in rules:
        lines.append(
            f"- rule_id: {r.get('rule_id')}\n"
            f"  code: {r.get('rule_id_code', '')}\n"
            f"  requirement_level: {r.get('requirement_level', '')}\n"
            f"  severity: {r.get('severity', '')}\n"
            f"  rule: {r.get('rule_text', '')}\n"
            f"  evidence_expected: {r.get('evidence_expected', '')}"
        )
    lines.append("\n# DOCUMENT TEXT")
    lines.append(doc_text[:MAX_DOC_CHARS])
    lines.append("\n---\nReturn the verdicts JSON now.")
    return "\n".join(lines)


def validate(data: dict) -> dict:
    section = data.get("section", "")
    modality = data.get("modality", "NCE")
    rules = data.get("rules", []) or []
    doc_html = data.get("document_html", "") or ""

    if not rules:
        return {"verdicts": []}

    doc_text = _html_to_text(doc_html)
    if not doc_text:
        # Nothing to judge against — let the caller treat these as warnings.
        return {"verdicts": [], "note": "empty document"}

    user_prompt = _build_user_prompt(section, modality, doc_text, rules)

    client = anthropic.Anthropic(api_key=API_KEY, base_url=BASE_URL)
    message = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        temperature=TEMPERATURE,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw = "".join(block.text for block in message.content if getattr(block, "type", "") == "text").strip()

    # Strip markdown fences if the model added them.
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*\n?", "", raw)
        raw = re.sub(r"\n?```\s*$", "", raw)

    try:
        parsed = json.loads(raw)
        verdicts = parsed.get("verdicts", []) if isinstance(parsed, dict) else []
    except json.JSONDecodeError:
        verdicts = []

    return {
        "verdicts": verdicts,
        "metadata": {
            "model": MODEL,
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
        },
    }


class handler(BaseHTTPRequestHandler):
    """
    POST /api/validate

    Request:
    {
      "section": "S.7.3",
      "modality": "NBE",
      "document_html": "<html>...</html>",
      "rules": [
        {"rule_id": "q1a-001", "rule_id_code": "Q1A-001", "rule_text": "...",
         "requirement_level": "MUST", "severity": "BLOCK", "evidence_expected": "..."}
      ]
    }

    Response:
    { "verdicts": [{ "rule_id", "status", "evidence_quote", "reasoning", "suggestion" }], "metadata": {...} }
    """

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
            self._json({"error": "Invalid JSON"}, 400)
            return

        try:
            result = validate(data)
            self._json(result)
        except Exception as e:
            self._json({"error": str(e)}, 500)

    def _json(self, data, status=200):
        self.send_response(status)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
