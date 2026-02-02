"""
API routes for the Regulatory Library & Allocation module.

Provides endpoints for:
  - Uploading and managing regulatory guideline documents
  - Running guideline allocation extraction
  - Reviewing and confirming extracted rules
  - Activating guidelines for projects
  - Evaluating rules against project data
  - Downloading allocation packs (JSON, checklist)
"""

from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1", tags=["regulatory"])


# ── Pydantic schemas ────────────────────────────────────────────────

class GuidelineUploadResponse(BaseModel):
    id: str
    title: str
    agency: str
    document_id: Optional[str]
    version: Optional[str]
    file_checksum_sha256: str
    original_filename: str
    uploaded_at: str


class GuidelineResponse(BaseModel):
    id: str
    title: str
    agency: str
    document_id: Optional[str]
    version: Optional[str]
    publication_date: Optional[str]
    is_active: bool
    original_filename: str
    allocation_pack_count: int = 0


class AllocationRequest(BaseModel):
    guideline_id: str
    options: Optional[dict] = None  # future: extraction config


class AllocationJobResponse(BaseModel):
    job_id: str
    status: str
    message: str


class ActivationRequest(BaseModel):
    guideline_id: str
    numbering_mode: str = "ctd"     # ctd | impd
    clinical_phase: str = "phase_1"  # phase_1 | phase_2 | phase_3 | post_approval


class RuleStatusUpdate(BaseModel):
    status: str  # confirmed | rejected | overridden
    override_justification: Optional[str] = None


class WaiverRequest(BaseModel):
    rule_id_code: str
    justification: str


class RuleEvaluationResponse(BaseModel):
    timestamp: str
    can_proceed: bool
    blocking_failures: list[dict]
    warnings: list[dict]
    passes: list[dict]
    waivers: list[dict]


# ── Guideline management endpoints ─────────────────────────────────

@router.get("/regulatory/guidelines")
async def list_guidelines():
    """List all uploaded regulatory guidelines."""
    return {"items": [], "total": 0}


@router.post("/regulatory/guidelines", status_code=status.HTTP_201_CREATED)
async def upload_guideline(
    file: UploadFile = File(...),
    title: str = Form(...),
    agency: str = Form("EMA"),
    document_id: Optional[str] = Form(None),
    version: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
):
    """
    Upload a regulatory guideline PDF.

    The guideline is stored immutably with a SHA-256 checksum.
    It is NOT automatically activated for any project.
    """
    # Implementation:
    # 1. Compute SHA-256 checksum
    # 2. Store file in object storage (immutable)
    # 3. Create RegulatoryGuideline record
    # 4. Audit log
    guideline_id = str(uuid4())
    return GuidelineUploadResponse(
        id=guideline_id,
        title=title,
        agency=agency,
        document_id=document_id,
        version=version,
        file_checksum_sha256="pending",
        original_filename=file.filename or "unknown",
        uploaded_at="",
    )


@router.get("/regulatory/guidelines/{guideline_id}")
async def get_guideline(guideline_id: str):
    """Get guideline details including allocation pack history."""
    return {}


@router.delete("/regulatory/guidelines/{guideline_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_guideline(guideline_id: str):
    """Delete a guideline (only if not activated for any project)."""
    pass


# ── Allocation extraction endpoints ────────────────────────────────

@router.post("/regulatory/guidelines/{guideline_id}/allocate", status_code=status.HTTP_202_ACCEPTED)
async def trigger_allocation(guideline_id: str, body: Optional[AllocationRequest] = None):
    """
    Run allocation extraction on a guideline document.

    Extracts stability-related obligations and produces a rules JSON
    with traceability to source pages/sections.

    All extracted rules land as 'pending_review' and require human confirmation.
    """
    # Implementation:
    # 1. Load guideline file from object storage
    # 2. Run GuidelineExtractor pipeline
    # 3. Store AllocationPack + individual RegulatoryRules in DB
    # 4. Return job ID for polling
    job_id = str(uuid4())
    return AllocationJobResponse(
        job_id=job_id,
        status="running",
        message="Allocation extraction started",
    )


@router.get("/regulatory/guidelines/{guideline_id}/allocate/{job_id}")
async def get_allocation_status(guideline_id: str, job_id: str):
    """Poll allocation extraction job status."""
    return {"job_id": job_id, "status": "completed"}


# ── Allocation pack endpoints ──────────────────────────────────────

@router.get("/regulatory/guidelines/{guideline_id}/allocation-packs")
async def list_allocation_packs(guideline_id: str):
    """List all allocation pack versions for a guideline."""
    return {"items": []}


@router.get("/regulatory/guidelines/{guideline_id}/allocation-packs/{pack_id}")
async def get_allocation_pack(guideline_id: str, pack_id: str):
    """Get a specific allocation pack with all rules."""
    return {}


@router.get("/regulatory/guidelines/{guideline_id}/allocation-packs/{pack_id}/download")
async def download_allocation_pack(guideline_id: str, pack_id: str, fmt: str = "json"):
    """
    Download allocation pack in specified format.

    Formats:
      - json: machine-readable rules JSON
      - checklist: human-readable checklist (DOCX)
      - mapping: mapping table (XLSX)
    """
    raise HTTPException(status_code=404, detail="Not found")


# ── Individual rule management ──────────────────────────────────────

@router.get("/regulatory/guidelines/{guideline_id}/rules")
async def list_rules(
    guideline_id: str,
    applies_to: Optional[str] = None,   # DS, DP
    requirement_level: Optional[str] = None,  # MUST, SHOULD, MAY
    status_filter: Optional[str] = None,  # pending_review, confirmed, rejected, overridden
):
    """List all extracted rules for a guideline, with optional filters."""
    return {"items": []}


@router.get("/regulatory/guidelines/{guideline_id}/rules/{rule_id}")
async def get_rule(guideline_id: str, rule_id: str):
    """Get rule details including traceability link to source page."""
    return {}


@router.put("/regulatory/guidelines/{guideline_id}/rules/{rule_id}/status")
async def update_rule_status(guideline_id: str, rule_id: str, body: RuleStatusUpdate):
    """
    Confirm, reject, or override a rule.

    If overriding, a justification is required.
    All status changes are audit-logged.
    """
    # Implementation:
    # 1. Validate status transition
    # 2. If overridden, require override_justification
    # 3. Update rule status
    # 4. Audit log
    return {}


# ── Project guideline activation ────────────────────────────────────

@router.post("/projects/{project_id}/regulatory/activate", status_code=status.HTTP_201_CREATED)
async def activate_guideline_for_project(project_id: str, body: ActivationRequest):
    """
    Activate a guideline for a project.

    Sets the numbering mode (CTD vs IMPD) and clinical phase.
    The activated guideline's rules will be enforced during validation
    and generation for this project.
    """
    # Implementation:
    # 1. Validate guideline exists and has a confirmed allocation pack
    # 2. Create ProjectGuidelineActivation record
    # 3. Update project numbering_mode and clinical_phase
    # 4. Audit log
    activation_id = str(uuid4())
    return {"id": activation_id, "status": "active"}


@router.get("/projects/{project_id}/regulatory/activations")
async def list_project_activations(project_id: str):
    """List all guideline activations for a project."""
    return {"items": []}


@router.delete("/projects/{project_id}/regulatory/activate/{activation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_guideline(project_id: str, activation_id: str):
    """Deactivate a guideline for a project."""
    pass


# ── Rule evaluation ────────────────────────────────────────────────

@router.post("/projects/{project_id}/regulatory/evaluate")
async def evaluate_rules(project_id: str):
    """
    Evaluate all active guideline rules against current project data.

    Returns a detailed report showing:
      - Blocking failures (MUST rules not met)
      - Warnings (SHOULD rules not met)
      - Passes
      - Waivers (rules explicitly waived with justification)

    This is called automatically during the generation validation step
    but can also be called independently for pre-check.
    """
    # Implementation:
    # 1. Load active guidelines and their confirmed rules for this project
    # 2. Build ProjectContext from DB
    # 3. Run RegulatoryRuleEngine.evaluate()
    # 4. Store RuleEvaluationLog entries
    # 5. Return report
    return RuleEvaluationResponse(
        timestamp="",
        can_proceed=True,
        blocking_failures=[],
        warnings=[],
        passes=[],
        waivers=[],
    )


@router.post("/projects/{project_id}/regulatory/waivers")
async def add_waiver(project_id: str, body: WaiverRequest):
    """
    Add a waiver for a specific rule.

    Requires a justification explaining why the rule does not apply
    or why non-compliance is acceptable.

    Waivers are audit-logged and visible in the generation report.
    """
    # Implementation:
    # 1. Validate rule exists and is active for this project
    # 2. Store waiver with justification
    # 3. Audit log
    return {"rule_id_code": body.rule_id_code, "status": "waived"}


@router.get("/projects/{project_id}/regulatory/waivers")
async def list_waivers(project_id: str):
    """List all active waivers for a project."""
    return {"items": []}


@router.delete("/projects/{project_id}/regulatory/waivers/{rule_id_code}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_waiver(project_id: str, rule_id_code: str):
    """Remove a waiver, re-enabling rule enforcement."""
    pass


# ── Glossary ────────────────────────────────────────────────────────

@router.get("/regulatory/guidelines/{guideline_id}/glossary")
async def get_glossary(guideline_id: str):
    """Get the regulatory glossary extracted from the guideline."""
    return {"items": []}
