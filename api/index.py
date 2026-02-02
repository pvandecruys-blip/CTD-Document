"""
Vercel serverless function entry point.

Adds the backend directory to sys.path so that all FastAPI routes
and services are accessible, then re-exports the ASGI app.
"""

import sys
from pathlib import Path

# Make backend packages importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402, F401
