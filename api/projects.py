"""
Vercel Serverless Function: /api/projects

Simple in-memory project and document management.
Note: Data resets on each deployment since Vercel functions are stateless.
For production, use a database like Vercel KV or Postgres.
"""

import json
import os
from http.server import BaseHTTPRequestHandler
from datetime import datetime, timezone
from uuid import uuid4
from urllib.parse import parse_qs, urlparse

# ══════════════════════════════════════════════════════════════════════════════
# IN-MEMORY STORAGE (resets on cold start)
# ══════════════════════════════════════════════════════════════════════════════

# For demo purposes - in production use Vercel KV or a database
PROJECTS: dict = {}
DOCUMENTS: dict = {}  # project_id -> list of documents


# ══════════════════════════════════════════════════════════════════════════════
# HTTP HELPERS
# ══════════════════════════════════════════════════════════════════════════════

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def _send_json(handler, data, status=200):
    handler.send_response(status)
    for k, v in CORS_HEADERS.items():
        handler.send_header(k, v)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(data).encode())


def _send_empty(handler, status=204):
    handler.send_response(status)
    for k, v in CORS_HEADERS.items():
        handler.send_header(k, v)
    handler.end_headers()


# ══════════════════════════════════════════════════════════════════════════════
# VERCEL HANDLER
# ══════════════════════════════════════════════════════════════════════════════

class handler(BaseHTTPRequestHandler):
    """
    /api/projects - Project and document management

    Projects:
      GET    /api/projects           - List all projects
      GET    /api/projects?id=X      - Get single project
      POST   /api/projects           - Create project
      PUT    /api/projects?id=X      - Update project
      DELETE /api/projects?id=X      - Delete project

    Documents:
      GET    /api/projects?id=X&documents=1           - List documents
      POST   /api/projects?id=X&documents=1           - Add document
      PUT    /api/projects?id=X&doc_id=Y              - Update document
      DELETE /api/projects?id=X&doc_id=Y              - Delete document

    Data (for generation):
      GET    /api/projects?id=X&studies=1             - List studies (empty for now)
      GET    /api/projects?id=X&lots=1                - List lots (empty for now)
      GET    /api/projects?id=X&conditions=1          - List conditions (empty for now)
      GET    /api/projects?id=X&attributes=1          - List attributes (empty for now)
    """

    def do_OPTIONS(self):
        self.send_response(200)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()

    def _parse_query(self):
        parsed = urlparse(self.path)
        return parse_qs(parsed.query)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        body = self.rfile.read(length)
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {}

    def do_GET(self):
        query = self._parse_query()
        project_id = query.get("id", [None])[0]

        # List/get studies, lots, conditions, attributes (return empty for now)
        if project_id:
            if "studies" in query:
                _send_json(self, {"items": []})
                return
            if "lots" in query:
                _send_json(self, {"items": []})
                return
            if "conditions" in query:
                _send_json(self, {"items": []})
                return
            if "attributes" in query:
                _send_json(self, {"items": []})
                return

            # List documents for project
            if "documents" in query:
                docs = DOCUMENTS.get(project_id, [])
                _send_json(self, {"items": docs})
                return

            # Get single project
            if project_id in PROJECTS:
                _send_json(self, PROJECTS[project_id])
            else:
                _send_json(self, {"error": "Project not found"}, 404)
            return

        # List all projects
        items = list(PROJECTS.values())
        _send_json(self, {"items": items, "total": len(items)})

    def do_POST(self):
        query = self._parse_query()
        project_id = query.get("id", [None])[0]
        body = self._read_body()

        # Add document to project
        if project_id and "documents" in query:
            if project_id not in PROJECTS:
                _send_json(self, {"error": "Project not found"}, 404)
                return

            doc_id = str(uuid4())
            now = datetime.now(timezone.utc).isoformat()
            doc = {
                "id": doc_id,
                "filename": body.get("filename", "unknown"),
                "original_filename": body.get("filename", "unknown"),
                "file_type": body.get("filename", "").split(".")[-1].lower() if "." in body.get("filename", "") else "unknown",
                "classification": body.get("classification", "other_supporting"),
                "authority": "supporting",
                "checksum_sha256": "",
                "file_size_bytes": len(body.get("extracted_text", "")),
                "extracted_text": body.get("extracted_text", ""),
                "uploaded_at": now,
                "notes": body.get("notes"),
            }

            if project_id not in DOCUMENTS:
                DOCUMENTS[project_id] = []
            DOCUMENTS[project_id].append(doc)

            # Update project document count
            PROJECTS[project_id]["document_count"] = len(DOCUMENTS[project_id])

            _send_json(self, doc, 201)
            return

        # Start extraction (mock - just return success)
        if project_id and "extract" in query:
            _send_json(self, {
                "job_id": str(uuid4()),
                "status": "completed",
                "summary": {
                    "studies_found": 0,
                    "lots_found": 0,
                    "conditions_found": 0,
                    "attributes_found": 0,
                    "results_found": 0,
                    "low_confidence_count": 0,
                }
            })
            return

        # Create new project
        project_id = str(uuid4())
        now = datetime.now(timezone.utc).isoformat()
        project = {
            "id": project_id,
            "name": body.get("name", "Untitled Project"),
            "description": body.get("description"),
            "status": "active",
            "clinical_phase": body.get("clinical_phase"),
            "numbering_mode": body.get("numbering_mode", "ctd"),
            "created_by": {
                "id": "user-1",
                "display_name": "Demo User",
                "role": "author",
            },
            "document_count": 0,
            "created_at": now,
            "updated_at": now,
        }
        PROJECTS[project_id] = project
        DOCUMENTS[project_id] = []
        _send_json(self, project, 201)

    def do_PUT(self):
        query = self._parse_query()
        project_id = query.get("id", [None])[0]
        doc_id = query.get("doc_id", [None])[0]
        body = self._read_body()

        if not project_id:
            _send_json(self, {"error": "Project ID required"}, 400)
            return

        if project_id not in PROJECTS:
            _send_json(self, {"error": "Project not found"}, 404)
            return

        # Update document
        if doc_id:
            docs = DOCUMENTS.get(project_id, [])
            for doc in docs:
                if doc["id"] == doc_id:
                    if "classification" in body:
                        doc["classification"] = body["classification"]
                    _send_json(self, doc)
                    return
            _send_json(self, {"error": "Document not found"}, 404)
            return

        # Update project
        project = PROJECTS[project_id]
        if "name" in body:
            project["name"] = body["name"]
        if "description" in body:
            project["description"] = body["description"]
        project["updated_at"] = datetime.now(timezone.utc).isoformat()
        _send_json(self, project)

    def do_DELETE(self):
        query = self._parse_query()
        project_id = query.get("id", [None])[0]
        doc_id = query.get("doc_id", [None])[0]

        if not project_id:
            _send_json(self, {"error": "Project ID required"}, 400)
            return

        # Delete document
        if doc_id:
            if project_id in DOCUMENTS:
                DOCUMENTS[project_id] = [d for d in DOCUMENTS[project_id] if d["id"] != doc_id]
                if project_id in PROJECTS:
                    PROJECTS[project_id]["document_count"] = len(DOCUMENTS[project_id])
            _send_empty(self)
            return

        # Delete project
        if project_id in PROJECTS:
            del PROJECTS[project_id]
        if project_id in DOCUMENTS:
            del DOCUMENTS[project_id]
        _send_empty(self)
