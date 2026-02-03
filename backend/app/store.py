"""
In-memory data store for the CTD Stability Document Generator.

SERVERLESS-COMPATIBLE: All state is held in memory. On Vercel, each function
instance has its own memory, and data persists only while the instance is warm.

This is a stateless demo architecture — data resets between cold starts.
For production, use a real database (Supabase, PlanetScale, etc.).
"""

from typing import Optional

# ── In-memory storage dictionaries ────────────────────────────────
# These are module-level singletons that persist within a process/instance

_projects: dict[str, dict] = {}
_documents: dict[str, dict] = {}  # key = doc_id, includes project_id
_document_bytes: dict[str, bytes] = {}  # key = doc_id
_studies: dict[str, dict] = {}  # key = study_id, includes project_id
_lots: dict[str, dict] = {}
_conditions: dict[str, dict] = {}
_attributes: dict[str, dict] = {}
_generation_runs: dict[str, dict] = {}  # key = run_id
_generation_html: dict[str, str] = {}  # key = run_id


# ── Projects ──────────────────────────────────────────────────────

def get_all_projects() -> list[dict]:
    """Return all projects, newest first."""
    return list(reversed(_projects.values()))


def get_project(project_id: str) -> dict | None:
    """Get a single project by ID."""
    return _projects.get(project_id)


def upsert_project(project: dict):
    """Create or update a project."""
    _projects[project["id"]] = project


def delete_project(project_id: str):
    """Delete a project and all associated data."""
    _projects.pop(project_id, None)
    # Delete associated documents
    for doc_id in list(_documents.keys()):
        if _documents[doc_id].get("_project_id") == project_id:
            _documents.pop(doc_id, None)
            _document_bytes.pop(doc_id, None)
    # Delete associated studies/lots/conditions/attributes
    for store in [_studies, _lots, _conditions, _attributes]:
        for key in list(store.keys()):
            if store[key].get("_project_id") == project_id:
                store.pop(key, None)
    # Delete generation runs
    for run_id in list(_generation_runs.keys()):
        if _generation_runs[run_id].get("_project_id") == project_id:
            _generation_runs.pop(run_id, None)
            _generation_html.pop(run_id, None)


# ── Documents ─────────────────────────────────────────────────────

def get_documents(project_id: str) -> list[dict]:
    """Get all documents for a project."""
    return [
        {k: v for k, v in doc.items() if not k.startswith("_")}
        for doc in _documents.values()
        if doc.get("_project_id") == project_id
    ]


def add_document(project_id: str, doc: dict, file_bytes: bytes | None = None):
    """Add a document with optional file bytes."""
    doc_with_project = {**doc, "_project_id": project_id}
    _documents[doc["id"]] = doc_with_project
    if file_bytes:
        _document_bytes[doc["id"]] = file_bytes


def get_document_bytes(project_id: str, doc_id: str) -> bytes | None:
    """Get file bytes for a document."""
    doc = _documents.get(doc_id)
    if doc and doc.get("_project_id") == project_id:
        return _document_bytes.get(doc_id)
    return None


def update_document(project_id: str, doc_id: str, doc: dict):
    """Update document metadata."""
    if doc_id in _documents and _documents[doc_id].get("_project_id") == project_id:
        _documents[doc_id] = {**doc, "_project_id": project_id}


def delete_document(project_id: str, doc_id: str):
    """Delete a document."""
    doc = _documents.get(doc_id)
    if doc and doc.get("_project_id") == project_id:
        _documents.pop(doc_id, None)
        _document_bytes.pop(doc_id, None)


def count_documents(project_id: str) -> int:
    """Count documents in a project."""
    return sum(1 for doc in _documents.values() if doc.get("_project_id") == project_id)


# ── Studies ───────────────────────────────────────────────────────

def get_studies(project_id: str) -> list[dict]:
    """Get all studies for a project."""
    return [
        {k: v for k, v in s.items() if not k.startswith("_")}
        for s in _studies.values()
        if s.get("_project_id") == project_id
    ]


def set_studies(project_id: str, studies: list[dict]):
    """Replace all studies for a project."""
    # Remove existing
    for key in list(_studies.keys()):
        if _studies[key].get("_project_id") == project_id:
            _studies.pop(key)
    # Add new
    for study in studies:
        _studies[study["id"]] = {**study, "_project_id": project_id}


# ── Lots ──────────────────────────────────────────────────────────

def get_lots(project_id: str) -> list[dict]:
    """Get all lots for a project."""
    return [
        {k: v for k, v in lot.items() if not k.startswith("_")}
        for lot in _lots.values()
        if lot.get("_project_id") == project_id
    ]


def set_lots(project_id: str, lots: list[dict]):
    """Replace all lots for a project."""
    for key in list(_lots.keys()):
        if _lots[key].get("_project_id") == project_id:
            _lots.pop(key)
    for lot in lots:
        _lots[lot["id"]] = {**lot, "_project_id": project_id}


# ── Conditions ────────────────────────────────────────────────────

def get_conditions(project_id: str) -> list[dict]:
    """Get all conditions for a project."""
    return [
        {k: v for k, v in c.items() if not k.startswith("_")}
        for c in _conditions.values()
        if c.get("_project_id") == project_id
    ]


def set_conditions(project_id: str, conditions: list[dict]):
    """Replace all conditions for a project."""
    for key in list(_conditions.keys()):
        if _conditions[key].get("_project_id") == project_id:
            _conditions.pop(key)
    for cond in conditions:
        _conditions[cond["id"]] = {**cond, "_project_id": project_id}


# ── Attributes ────────────────────────────────────────────────────

def get_attributes(project_id: str) -> list[dict]:
    """Get all attributes for a project."""
    return [
        {k: v for k, v in a.items() if not k.startswith("_")}
        for a in _attributes.values()
        if a.get("_project_id") == project_id
    ]


def set_attributes(project_id: str, attributes: list[dict]):
    """Replace all attributes for a project."""
    for key in list(_attributes.keys()):
        if _attributes[key].get("_project_id") == project_id:
            _attributes.pop(key)
    for attr in attributes:
        _attributes[attr["id"]] = {**attr, "_project_id": project_id}


# ── Generation Runs ──────────────────────────────────────────────

def get_generation_runs(project_id: str) -> list[dict]:
    """Get all generation runs for a project, newest first."""
    runs = [
        {k: v for k, v in run.items() if not k.startswith("_")}
        for run in _generation_runs.values()
        if run.get("_project_id") == project_id
    ]
    return list(reversed(runs))


def add_generation_run(project_id: str, run: dict, output_html: str | None = None):
    """Add a generation run with optional HTML output."""
    _generation_runs[run["run_id"]] = {**run, "_project_id": project_id}
    if output_html:
        _generation_html[run["run_id"]] = output_html


def get_generation_html(project_id: str, run_id: str) -> str | None:
    """Get the generated HTML for a run."""
    run = _generation_runs.get(run_id)
    if run and run.get("_project_id") == project_id:
        return _generation_html.get(run_id)
    return None
