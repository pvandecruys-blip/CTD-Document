"""
API routes for project management, document upload, extraction,
generation, and validation.

Uses SQLite for persistence across restarts.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app import db

router = APIRouter(prefix="/api/v1", tags=["projects"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Pydantic schemas ────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class GenerationRequest(BaseModel):
    sections: dict
    included_conditions: Optional[list[str]] = None
    included_lots: Optional[list[str]] = None
    redaction_policy_id: Optional[str] = None
    styling_profile_id: Optional[str] = None
    table_numbering: Optional[dict] = None
    output_formats: list[str] = ["pdf"]
    include_traceability: bool = True


# ── Project endpoints ───────────────────────────────────────────────

@router.get("/projects")
async def list_projects():
    items = db.get_all_projects()
    return {"items": items, "total": len(items)}


@router.post("/projects", status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate):
    project_id = str(uuid4())
    now = _now()
    project = {
        "id": project_id,
        "name": body.name,
        "description": body.description,
        "status": "draft",
        "clinical_phase": None,
        "numbering_mode": None,
        "created_by": {"id": "user-1", "display_name": "Demo User", "role": "admin"},
        "document_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    db.upsert_project(project)
    return project


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/projects/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if body.name is not None:
        project["name"] = body.name
    if body.description is not None:
        project["description"] = body.description
    if body.status is not None:
        project["status"] = body.status
    project["updated_at"] = _now()
    db.upsert_project(project)
    return project


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_endpoint(project_id: str):
    db.delete_project(project_id)


# ── Auto-classification helpers ────────────────────────────────────

_CLASSIFY_KEYWORDS: list[tuple[str, list[str]]] = [
    ("stability_plan", ["stability plan", "stability protocol", "study plan", "study protocol", "stability study design"]),
    ("stability_report", ["stability report", "stability data", "stability results", "stability summary", "shelf life", "stability study report"]),
    ("coa", ["certificate of analysis", "coa", "certificate analysis", "batch analysis", "lot analysis"]),
    ("technical_report", ["technical report", "development report", "analytical report", "method validation"]),
]


def _auto_classify(filename: str) -> str:
    """Guess document classification from filename."""
    lower = filename.lower()
    for classification, keywords in _CLASSIFY_KEYWORDS:
        if any(kw in lower for kw in keywords):
            return classification
    if "stab" in lower and ("plan" in lower or "protocol" in lower):
        return "stability_plan"
    if "stab" in lower:
        return "stability_report"
    if "coa" in lower or "certificate" in lower:
        return "coa"
    return "other_supporting"


_AUTHORITATIVE = {"stability_plan", "stability_report"}


# ── Document endpoints ──────────────────────────────────────────────

@router.post("/projects/{project_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    project_id: str,
    file: UploadFile = File(...),
    classification: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
):
    """Upload a document. Classification is auto-detected if not provided."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    content = await file.read()
    filename = file.filename or "unknown"

    if not classification:
        classification = _auto_classify(filename)

    authority = "authoritative" if classification in _AUTHORITATIVE else "supporting"
    doc_id = str(uuid4())

    # Save file to disk for later extraction
    upload_dir = Path(__file__).resolve().parent.parent.parent.parent / "uploads" / project_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"{doc_id}_{filename}"
    file_path.write_bytes(content)

    doc = {
        "id": doc_id,
        "filename": filename,
        "original_filename": filename,
        "file_type": filename.rsplit(".", 1)[-1].lower() if "." in filename else "unknown",
        "classification": classification,
        "authority": authority,
        "auto_classified": True,
        "checksum_sha256": "demo",
        "file_size_bytes": len(content),
        "file_path": str(file_path),
        "uploaded_at": _now(),
        "notes": notes,
    }
    db.add_document(project_id, doc)
    project["document_count"] = db.count_documents(project_id)
    project["updated_at"] = _now()
    db.upsert_project(project)
    return doc


@router.put("/projects/{project_id}/documents/{document_id}/classify")
async def reclassify_document(project_id: str, document_id: str, classification: str = Form(...)):
    """Manually override the classification of a document."""
    docs = db.get_documents(project_id)
    for d in docs:
        if d["id"] == document_id:
            d["classification"] = classification
            d["authority"] = "authoritative" if classification in _AUTHORITATIVE else "supporting"
            d["auto_classified"] = False
            db.update_document(project_id, document_id, d)
            return d
    raise HTTPException(status_code=404, detail="Document not found")


@router.get("/projects/{project_id}/documents")
async def list_documents(
    project_id: str,
    classification: Optional[str] = None,
    authority: Optional[str] = None,
):
    docs = db.get_documents(project_id)
    if classification:
        docs = [d for d in docs if d["classification"] == classification]
    if authority:
        docs = [d for d in docs if d["authority"] == authority]
    return {"items": docs, "total": len(docs)}


@router.delete("/projects/{project_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(project_id: str, document_id: str):
    db.delete_document(project_id, document_id)
    project = db.get_project(project_id)
    if project:
        project["document_count"] = db.count_documents(project_id)
        db.upsert_project(project)


# ── Readiness check endpoint ─────────────────────────────────────

@router.get("/projects/{project_id}/readiness")
async def check_readiness(project_id: str):
    docs = db.get_documents(project_id)
    studies_data = db.get_studies(project_id)
    conds_data = db.get_conditions(project_id)
    attrs_data = db.get_attributes(project_id)

    by_class: dict[str, int] = {}
    for d in docs:
        by_class[d["classification"]] = by_class.get(d["classification"], 0) + 1

    has_stability_plan = by_class.get("stability_plan", 0) > 0
    has_stability_report = by_class.get("stability_report", 0) > 0
    has_coa = by_class.get("coa", 0) > 0
    has_extracted = len(studies_data) > 0

    capabilities = []

    has_sources = has_stability_report or has_stability_plan
    ds_missing = []
    if not has_sources:
        ds_missing.append("Upload a Stability Plan or Report")
    if not has_extracted:
        ds_missing.append("Run extraction to parse stability data")
    if not has_coa:
        ds_missing.append("Upload Certificates of Analysis (recommended)")
    capabilities.append({
        "section": "3.2.S.7",
        "title": "Drug Substance Stability",
        "status": "ready" if has_sources and has_extracted else "partial" if has_sources else "blocked",
        "sources_found": [k for k, v in by_class.items() if v > 0 and k in ("stability_plan", "stability_report", "coa")],
        "missing": ds_missing,
    })

    overall = "ready" if all(
        c["status"] in ("ready", "optional") for c in capabilities
    ) else "partial"

    return {
        "overall_status": overall,
        "document_summary": {
            "total": len(docs),
            "by_classification": by_class,
            "authoritative_count": sum(1 for d in docs if d["authority"] == "authoritative"),
            "supporting_count": sum(1 for d in docs if d["authority"] == "supporting"),
        },
        "extraction_status": {
            "studies": len(studies_data),
            "conditions": len(conds_data),
            "attributes": len(attrs_data),
            "extracted": has_extracted,
        },
        "capabilities": capabilities,
    }


# ── Extraction endpoints ───────────────────────────────────────────

@router.post("/projects/{project_id}/extract", status_code=status.HTTP_202_ACCEPTED)
async def trigger_extraction(project_id: str):
    """Trigger data extraction from authoritative documents."""
    job_id = str(uuid4())
    study_id = str(uuid4())
    lot_id = str(uuid4())
    cond_id = str(uuid4())
    attr_id = str(uuid4())

    studies = [{
        "id": study_id,
        "product_id": "p-1",
        "study_type": "long_term",
        "study_label": "LT-001 Long Term 25°C/60% RH",
        "protocol_id": "STAB-2024-001",
        "start_date": "2024-01-15",
        "sites": ["Site A"],
        "manufacturers": ["Manufacturer X"],
        "extraction_status": "pending_review",
        "confidence": 0.87,
        "source_anchors": [{"document_name": "Stability Report.pdf", "page": 12}],
    }]
    lots = [{
        "id": lot_id,
        "study_id": study_id,
        "lot_number": "LOT-2024-A001",
        "manufacturer": "Manufacturer X",
        "manufacturing_site": "Site A",
        "intended_use": "Registration",
        "lot_use_label": "Primary",
        "extraction_status": "pending_review",
        "confidence": 0.92,
    }]
    conditions = [
        {
            "id": cond_id,
            "label": "25°C / 60% RH",
            "temperature_setpoint": 25,
            "tolerance": "± 2°C",
            "humidity": "60% RH ± 5%",
            "display_order": 1,
            "extraction_status": "pending_review",
            "confidence": 0.95,
        },
        {
            "id": str(uuid4()),
            "label": "40°C / 75% RH",
            "temperature_setpoint": 40,
            "tolerance": "± 2°C",
            "humidity": "75% RH ± 5%",
            "display_order": 2,
            "extraction_status": "pending_review",
            "confidence": 0.93,
        },
    ]
    attributes = [
        {
            "id": attr_id,
            "name": "Appearance",
            "method_group": "Physical",
            "analytical_procedure": "Visual inspection",
            "display_order": 1,
            "acceptance_criteria": [{"id": str(uuid4()), "criteria_text": "White to off-white powder"}],
            "extraction_status": "pending_review",
            "confidence": 0.91,
        },
        {
            "id": str(uuid4()),
            "name": "Assay",
            "method_group": "Chemical",
            "analytical_procedure": "HPLC",
            "display_order": 2,
            "acceptance_criteria": [{"id": str(uuid4()), "criteria_text": "95.0 – 105.0% of label claim"}],
            "extraction_status": "pending_review",
            "confidence": 0.88,
        },
        {
            "id": str(uuid4()),
            "name": "Related Substances",
            "method_group": "Chemical",
            "analytical_procedure": "HPLC",
            "display_order": 3,
            "acceptance_criteria": [
                {"id": str(uuid4()), "criteria_text": "Individual unknown: NMT 0.2%"},
                {"id": str(uuid4()), "criteria_text": "Total impurities: NMT 1.0%"},
            ],
            "extraction_status": "pending_review",
            "confidence": 0.84,
        },
    ]

    db.set_studies(project_id, studies)
    db.set_lots(project_id, lots)
    db.set_conditions(project_id, conditions)
    db.set_attributes(project_id, attributes)

    return {
        "job_id": job_id,
        "status": "completed",
        "progress": {"documents_processed": 1, "documents_total": 1},
        "summary": {
            "studies_found": 1,
            "lots_found": 1,
            "conditions_found": 2,
            "attributes_found": 3,
            "results_found": 0,
            "low_confidence_count": 0,
        },
    }


@router.get("/projects/{project_id}/extract/{job_id}")
async def get_extraction_status(project_id: str, job_id: str):
    return {"job_id": job_id, "status": "completed"}


# ── Entity CRUD endpoints ────────────────────────────────────────────

@router.get("/projects/{project_id}/studies")
async def list_studies(project_id: str):
    return {"items": db.get_studies(project_id)}


@router.get("/projects/{project_id}/studies/{study_id}/lots")
async def list_study_lots(project_id: str, study_id: str):
    all_lots = db.get_lots(project_id)
    filtered = [l for l in all_lots if l["study_id"] == study_id]
    return {"items": filtered}


@router.get("/projects/{project_id}/studies/{study_id}/conditions")
async def list_study_conditions(project_id: str, study_id: str):
    return {"items": db.get_conditions(project_id)}


@router.get("/projects/{project_id}/studies/{study_id}/attributes")
async def list_study_attributes(project_id: str, study_id: str):
    return {"items": db.get_attributes(project_id)}


@router.get("/projects/{project_id}/studies/{study_id}/results/pivot")
async def get_results_pivot(project_id: str, study_id: str, lot_id: str, condition_id: str):
    return {"lot": {}, "condition": {}, "timepoints": [], "rows": []}


@router.get("/projects/{project_id}/conditions")
async def list_conditions(project_id: str):
    return {"items": db.get_conditions(project_id)}


@router.get("/projects/{project_id}/attributes")
async def list_attributes(project_id: str):
    return {"items": db.get_attributes(project_id)}


@router.get("/projects/{project_id}/lots")
async def list_lots(project_id: str, study_id: Optional[str] = None):
    all_lots = db.get_lots(project_id)
    if study_id:
        all_lots = [l for l in all_lots if l["study_id"] == study_id]
    return {"items": all_lots}


# ── Validation endpoint ────────────────────────────────────────────

@router.post("/projects/{project_id}/validate")
async def validate_project(project_id: str):
    now = _now()
    studies = db.get_studies(project_id)
    docs = db.get_documents(project_id)
    conds = db.get_conditions(project_id)
    lots = db.get_lots(project_id)
    attrs = db.get_attributes(project_id)

    hard_failures = []
    warnings = []
    passed = []

    if studies:
        passed.append({"rule_id": "V-01", "rule_name": "Study exists", "severity": "hard", "status": "pass"})
    else:
        hard_failures.append({
            "rule_id": "V-01", "rule_name": "Study exists", "severity": "hard", "status": "fail",
            "message": "No studies found. Run extraction first.",
        })

    auth_docs = [d for d in docs if d["authority"] == "authoritative"]
    if auth_docs:
        passed.append({"rule_id": "V-02", "rule_name": "Authoritative source", "severity": "hard", "status": "pass"})
    else:
        hard_failures.append({
            "rule_id": "V-02", "rule_name": "Authoritative source", "severity": "hard", "status": "fail",
            "message": "No authoritative documents. Upload a stability plan or report.",
        })

    if conds:
        passed.append({"rule_id": "V-03", "rule_name": "Storage conditions", "severity": "hard", "status": "pass"})
    else:
        hard_failures.append({
            "rule_id": "V-03", "rule_name": "Storage conditions", "severity": "hard", "status": "fail",
            "message": "No storage conditions extracted.",
        })

    all_entities = studies + lots + conds + attrs
    low_conf = [e for e in all_entities if e.get("confidence") and e["confidence"] < 0.8]
    if low_conf:
        warnings.append({
            "rule_id": "W-01", "rule_name": "Low confidence items", "severity": "soft", "status": "warning",
            "message": f"{len(low_conf)} item(s) with confidence below 80%.",
        })
    else:
        passed.append({"rule_id": "W-01", "rule_name": "Low confidence items", "severity": "soft", "status": "pass"})

    overall = "fail" if hard_failures else ("warning" if warnings else "pass")
    return {
        "run_id": str(uuid4()),
        "timestamp": now,
        "overall_status": overall,
        "hard_failures": hard_failures,
        "warnings": warnings,
        "passed": passed,
    }


# ── Generation endpoints ───────────────────────────────────────────

@router.post("/projects/{project_id}/generate", status_code=status.HTTP_202_ACCEPTED)
async def trigger_generation(project_id: str, body: GenerationRequest):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_studies = db.get_studies(project_id)
    project_lots = db.get_lots(project_id)
    project_conditions = db.get_conditions(project_id)
    project_attributes = db.get_attributes(project_id)
    project_documents = db.get_documents(project_id)

    try:
        from app.services.generation.ctd_writer import generate_stability_document

        result = await generate_stability_document(
            project=project,
            studies=project_studies,
            lots=project_lots,
            conditions=project_conditions,
            attributes=project_attributes,
            options=body.model_dump(),
            documents=project_documents,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    db.add_generation_run(project_id, result)
    return result


@router.get("/projects/{project_id}/generate")
async def list_generation_runs(project_id: str):
    return {"items": db.get_generation_runs(project_id)}


@router.get("/projects/{project_id}/generate/{run_id}")
async def get_generation_status(project_id: str, run_id: str):
    runs = db.get_generation_runs(project_id)
    for r in runs:
        if r["run_id"] == run_id:
            return r
    raise HTTPException(status_code=404, detail="Run not found")


# ── File download endpoint ────────────────────────────────────────

@router.get("/outputs/{run_id}/{filename}")
async def download_output(run_id: str, filename: str):
    """Serve a generated output file."""
    output_dir = Path(__file__).resolve().parent.parent.parent.parent / "generated_outputs" / run_id
    file_path = output_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    media_types = {
        ".pdf": "application/pdf",
        ".html": "text/html",
        ".json": "application/json",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    media_type = media_types.get(file_path.suffix, "application/octet-stream")
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type=media_type,
    )


# ── Audit log ───────────────────────────────────────────────────────

@router.get("/projects/{project_id}/audit-log")
async def get_audit_log(
    project_id: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
):
    return {"items": []}
