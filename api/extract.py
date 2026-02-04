"""
Vercel Serverless Function: Document Extraction
Analyzes uploaded stability documents using Claude API to extract structured data.
"""

import os
import json
from http.server import BaseHTTPRequestHandler
import anthropic

# Configuration
API_KEY = os.environ.get("ANTHROPIC_API_KEY")
BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://genai-sharedservice-emea.pwc.com")
MODEL = os.environ.get("ANTHROPIC_MODEL", "vertex_ai.anthropic.claude-opus-4-5")

# Initialize Anthropic client (using PwC GenAI service)
client = anthropic.Anthropic(api_key=API_KEY, base_url=BASE_URL)

EXTRACTION_PROMPT = """You are a regulatory affairs expert specialized in ICH CTD Module 3 Quality documentation, specifically stability data sections (3.2.S.7 and 3.2.P.8).

Analyze the following document text and extract structured stability data. Return a JSON object with:

{
  "studies": [
    {
      "study_label": "string - name/identifier of the study",
      "study_type": "long_term|accelerated|intermediate|stress|photostability|other",
      "protocol_id": "string or null",
      "confidence": 0.0-1.0
    }
  ],
  "conditions": [
    {
      "label": "string - e.g., '25°C/60% RH'",
      "temperature_setpoint": number or null,
      "humidity": "string or null",
      "confidence": 0.0-1.0
    }
  ],
  "attributes": [
    {
      "name": "string - quality attribute name",
      "method_group": "Physical|Chemical|Microbiological|Other",
      "analytical_procedure": "string or null",
      "acceptance_criteria": "string or null",
      "confidence": 0.0-1.0
    }
  ],
  "lots": [
    {
      "lot_number": "string",
      "manufacturer": "string or null",
      "manufacturing_site": "string or null",
      "confidence": 0.0-1.0
    }
  ],
  "document_classification": "stability_plan|stability_report|coa|technical_report|other_supporting",
  "summary": "Brief summary of what this document contains"
}

Be thorough but only include data that is clearly present in the document. Set confidence scores based on how clearly the information is stated.

DOCUMENT TEXT:
"""


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))

            document_text = data.get('text', '')
            filename = data.get('filename', 'unknown')

            if not document_text:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'No document text provided'}).encode())
                return

            # Call Claude API for extraction
            message = client.messages.create(
                model=MODEL,
                max_tokens=4096,
                messages=[
                    {
                        "role": "user",
                        "content": f"{EXTRACTION_PROMPT}\n\nFilename: {filename}\n\n{document_text[:50000]}"  # Limit text length
                    }
                ]
            )

            # Parse Claude's response
            response_text = message.content[0].text

            # Try to extract JSON from the response
            try:
                # Find JSON in the response
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                if start != -1 and end > start:
                    extracted_data = json.loads(response_text[start:end])
                else:
                    extracted_data = {"error": "Could not parse extraction results", "raw": response_text}
            except json.JSONDecodeError:
                extracted_data = {"error": "Invalid JSON in response", "raw": response_text}

            # Return success response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'extraction': extracted_data,
                'tokens_used': {
                    'input': message.usage.input_tokens,
                    'output': message.usage.output_tokens
                }
            }).encode())

        except anthropic.APIError as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': f'Claude API error: {str(e)}'}).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
