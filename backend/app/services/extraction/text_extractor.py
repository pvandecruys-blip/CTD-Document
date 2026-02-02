"""
Extract plain text from uploaded documents (PDF, DOCX, XLSX).

Used to feed document content into the Claude generation prompt.
"""

from pathlib import Path

import pdfplumber
from docx import Document as DocxDocument
from openpyxl import load_workbook


def extract_text(file_path: str) -> str:
    """Extract text from a file based on its extension."""
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext == ".pdf":
        return _extract_pdf(path)
    elif ext in (".docx", ".doc"):
        return _extract_docx(path)
    elif ext in (".xlsx", ".xls"):
        return _extract_xlsx(path)
    else:
        return ""


def _extract_pdf(path: Path) -> str:
    """Extract text from PDF using pdfplumber."""
    pages = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)

            # Also extract tables as text
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if row:
                        cells = [str(c).strip() if c else "" for c in row]
                        pages.append(" | ".join(cells))
    return "\n\n".join(pages)


def _extract_docx(path: Path) -> str:
    """Extract text from DOCX."""
    doc = DocxDocument(str(path))
    parts = []

    for para in doc.paragraphs:
        if para.text.strip():
            parts.append(para.text)

    # Also extract tables
    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            parts.append(" | ".join(cells))

    return "\n".join(parts)


def _extract_xlsx(path: Path) -> str:
    """Extract text from XLSX spreadsheet."""
    wb = load_workbook(str(path), data_only=True)
    parts = []

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        parts.append(f"--- Sheet: {sheet_name} ---")
        for row in ws.iter_rows(values_only=True):
            cells = [str(c).strip() if c is not None else "" for c in row]
            if any(cells):
                parts.append(" | ".join(cells))

    return "\n".join(parts)
