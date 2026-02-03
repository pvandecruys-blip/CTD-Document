"""
SQLite persistence layer for the CTD Stability Document Generator.

Stores projects, documents (with file bytes as BLOB), extracted entities,
and generation runs. Works in serverless environments like Vercel.

NOTE: On Vercel, /tmp is ephemeral per function instance. Data persists
only during a "warm" session. This is acceptable for demo purposes.
"""

import base64
import json
import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager

_ON_VERCEL = os.environ.get("VERCEL") == "1"

if _ON_VERCEL:
    DB_PATH = Path("/tmp/ctd_stability.db")
else:
    DB_PATH = Path(__file__).resolve().parent.parent / "ctd_stability.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
);

-- Documents table now includes file_content BLOB for in-DB storage
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    data TEXT NOT NULL,
    file_content BLOB
);

CREATE TABLE IF NOT EXISTS studies (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lots (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conditions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attributes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    data TEXT NOT NULL
);

-- Generation runs now store output_html directly (no file references)
CREATE TABLE IF NOT EXISTS generation_runs (
    run_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    data TEXT NOT NULL,
    output_html TEXT
);
"""


def _init_db():
    """Create tables if they don't exist."""
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.executescript(_SCHEMA)
        # Migration: add file_content column if missing (for existing DBs)
        try:
            conn.execute("ALTER TABLE documents ADD COLUMN file_content BLOB")
        except sqlite3.OperationalError:
            pass  # Column already exists
        # Migration: add output_html column if missing
        try:
            conn.execute("ALTER TABLE generation_runs ADD COLUMN output_html TEXT")
        except sqlite3.OperationalError:
            pass  # Column already exists


# Initialize on import
_init_db()


@contextmanager
def _connect():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _to_json(obj: dict) -> str:
    return json.dumps(obj, default=str)


def _from_json(text: str) -> dict:
    return json.loads(text)


# ── Projects ──────────────────────────────────────────────────────

def get_all_projects() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT data FROM projects ORDER BY rowid DESC").fetchall()
    return [_from_json(r["data"]) for r in rows]


def get_project(project_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT data FROM projects WHERE id = ?", (project_id,)).fetchone()
    return _from_json(row["data"]) if row else None


def upsert_project(project: dict):
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO projects (id, data) VALUES (?, ?)",
            (project["id"], _to_json(project)),
        )


def delete_project(project_id: str):
    with _connect() as conn:
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        conn.execute("DELETE FROM documents WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM studies WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM lots WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM conditions WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM attributes WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM generation_runs WHERE project_id = ?", (project_id,))


# ── Documents ─────────────────────────────────────────────────────

def get_documents(project_id: str) -> list[dict]:
    """Get document metadata (without file bytes for efficiency)."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT data FROM documents WHERE project_id = ? ORDER BY rowid",
            (project_id,),
        ).fetchall()
    return [_from_json(r["data"]) for r in rows]


def add_document(project_id: str, doc: dict, file_bytes: bytes | None = None):
    """Add document with optional file content stored as BLOB."""
    with _connect() as conn:
        conn.execute(
            "INSERT INTO documents (id, project_id, data, file_content) VALUES (?, ?, ?, ?)",
            (doc["id"], project_id, _to_json(doc), file_bytes),
        )


def get_document_bytes(project_id: str, doc_id: str) -> bytes | None:
    """Retrieve raw file bytes for a document (for text extraction)."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT file_content FROM documents WHERE id = ? AND project_id = ?",
            (doc_id, project_id),
        ).fetchone()
    return row["file_content"] if row else None


def update_document(project_id: str, doc_id: str, doc: dict):
    with _connect() as conn:
        conn.execute(
            "UPDATE documents SET data = ? WHERE id = ? AND project_id = ?",
            (_to_json(doc), doc_id, project_id),
        )


def delete_document(project_id: str, doc_id: str):
    with _connect() as conn:
        conn.execute(
            "DELETE FROM documents WHERE id = ? AND project_id = ?",
            (doc_id, project_id),
        )


def count_documents(project_id: str) -> int:
    with _connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM documents WHERE project_id = ?",
            (project_id,),
        ).fetchone()
    return row["cnt"]


# ── Studies ───────────────────────────────────────────────────────

def get_studies(project_id: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT data FROM studies WHERE project_id = ? ORDER BY rowid",
            (project_id,),
        ).fetchall()
    return [_from_json(r["data"]) for r in rows]


def set_studies(project_id: str, studies: list[dict]):
    with _connect() as conn:
        conn.execute("DELETE FROM studies WHERE project_id = ?", (project_id,))
        for s in studies:
            conn.execute(
                "INSERT INTO studies (id, project_id, data) VALUES (?, ?, ?)",
                (s["id"], project_id, _to_json(s)),
            )


# ── Lots ──────────────────────────────────────────────────────────

def get_lots(project_id: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT data FROM lots WHERE project_id = ? ORDER BY rowid",
            (project_id,),
        ).fetchall()
    return [_from_json(r["data"]) for r in rows]


def set_lots(project_id: str, lots: list[dict]):
    with _connect() as conn:
        conn.execute("DELETE FROM lots WHERE project_id = ?", (project_id,))
        for l in lots:
            conn.execute(
                "INSERT INTO lots (id, project_id, data) VALUES (?, ?, ?)",
                (l["id"], project_id, _to_json(l)),
            )


# ── Conditions ────────────────────────────────────────────────────

def get_conditions(project_id: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT data FROM conditions WHERE project_id = ? ORDER BY rowid",
            (project_id,),
        ).fetchall()
    return [_from_json(r["data"]) for r in rows]


def set_conditions(project_id: str, conditions: list[dict]):
    with _connect() as conn:
        conn.execute("DELETE FROM conditions WHERE project_id = ?", (project_id,))
        for c in conditions:
            conn.execute(
                "INSERT INTO conditions (id, project_id, data) VALUES (?, ?, ?)",
                (c["id"], project_id, _to_json(c)),
            )


# ── Attributes ────────────────────────────────────────────────────

def get_attributes(project_id: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT data FROM attributes WHERE project_id = ? ORDER BY rowid",
            (project_id,),
        ).fetchall()
    return [_from_json(r["data"]) for r in rows]


def set_attributes(project_id: str, attributes: list[dict]):
    with _connect() as conn:
        conn.execute("DELETE FROM attributes WHERE project_id = ?", (project_id,))
        for a in attributes:
            conn.execute(
                "INSERT INTO attributes (id, project_id, data) VALUES (?, ?, ?)",
                (a["id"], project_id, _to_json(a)),
            )


# ── Generation Runs ──────────────────────────────────────────────

def get_generation_runs(project_id: str) -> list[dict]:
    """Get generation run metadata (without full HTML for list view)."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT data FROM generation_runs WHERE project_id = ? ORDER BY rowid DESC",
            (project_id,),
        ).fetchall()
    return [_from_json(r["data"]) for r in rows]


def add_generation_run(project_id: str, run: dict, output_html: str | None = None):
    """Store generation run with optional HTML content."""
    with _connect() as conn:
        conn.execute(
            "INSERT INTO generation_runs (run_id, project_id, data, output_html) VALUES (?, ?, ?, ?)",
            (run["run_id"], project_id, _to_json(run), output_html),
        )


def get_generation_html(project_id: str, run_id: str) -> str | None:
    """Retrieve the generated HTML for a specific run."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT output_html FROM generation_runs WHERE run_id = ? AND project_id = ?",
            (run_id, project_id),
        ).fetchone()
    return row["output_html"] if row else None
