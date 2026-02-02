"""
SQLAlchemy ORM models for the CTD Stability Document Generator.
Maps to the PostgreSQL schema defined in migrations/001_initial_schema.sql.
"""

import enum
from datetime import datetime, date
from typing import Optional
from uuid import uuid4

from sqlalchemy import (
    Column, String, Text, Integer, Float, Boolean, DateTime, Date,
    ForeignKey, Enum, BigInteger, ARRAY, JSON, UniqueConstraint, Index,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, relationship, Mapped, mapped_column
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


# ── Enums ──────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    admin = "admin"
    author = "author"
    reviewer = "reviewer"
    viewer = "viewer"


class DocumentClassification(str, enum.Enum):
    stability_plan = "stability_plan"
    stability_report = "stability_report"
    technical_report = "technical_report"
    coa = "coa"
    post_approval_protocol = "post_approval_protocol"
    regulatory_guideline = "regulatory_guideline"
    other_supporting = "other_supporting"


AUTHORITATIVE_CLASSIFICATIONS = {
    DocumentClassification.stability_plan,
    DocumentClassification.stability_report,
    DocumentClassification.regulatory_guideline,
}


class RequirementLevel(str, enum.Enum):
    MUST = "MUST"
    SHOULD = "SHOULD"
    MAY = "MAY"


class RuleSeverity(str, enum.Enum):
    BLOCK = "BLOCK"
    WARN = "WARN"


class AllocationStatus(str, enum.Enum):
    pending_review = "pending_review"
    confirmed = "confirmed"
    rejected = "rejected"
    overridden = "overridden"


class NumberingMode(str, enum.Enum):
    ctd = "ctd"
    impd = "impd"


class ClinicalPhase(str, enum.Enum):
    phase_1 = "phase_1"
    phase_2 = "phase_2"
    phase_3 = "phase_3"
    post_approval = "post_approval"


class ExtractionStatus(str, enum.Enum):
    pending_review = "pending_review"
    confirmed = "confirmed"
    rejected = "rejected"
    manually_added = "manually_added"


class StudyType(str, enum.Enum):
    accelerated = "accelerated"
    long_term = "long_term"
    intermediate = "intermediate"
    stress = "stress"
    photostability = "photostability"
    other = "other"


class ProductType(str, enum.Enum):
    drug_substance = "drug_substance"
    drug_product = "drug_product"


class GenerationStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class TimepointUnit(str, enum.Enum):
    hour = "hour"
    day = "day"
    week = "week"
    month = "month"
    year = "year"


# ── Models ─────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.viewer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    projects = relationship("Project", back_populates="creator")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    clinical_phase: Mapped[Optional[ClinicalPhase]] = mapped_column(Enum(ClinicalPhase), default=ClinicalPhase.phase_1)
    numbering_mode: Mapped[Optional[NumberingMode]] = mapped_column(Enum(NumberingMode), default=NumberingMode.ctd)
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    creator = relationship("User", back_populates="projects")
    products = relationship("Product", back_populates="project", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")
    generation_runs = relationship("GenerationRun", back_populates="project", cascade="all, delete-orphan")
    guideline_activations = relationship("ProjectGuidelineActivation", back_populates="project", cascade="all, delete-orphan")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    product_type: Mapped[ProductType] = mapped_column(Enum(ProductType), nullable=False)
    product_name: Mapped[str] = mapped_column(String(500), nullable=False)
    dosage_form: Mapped[Optional[str]] = mapped_column(String(255))
    strength: Mapped[Optional[str]] = mapped_column(String(255))
    ctd_section: Mapped[Optional[str]] = mapped_column(String(50))
    # Product characteristics for conditional guideline rules
    requires_reconstitution: Mapped[bool] = mapped_column(Boolean, default=False)
    is_multi_dose: Mapped[bool] = mapped_column(Boolean, default=False)
    in_use_stability_required: Mapped[Optional[bool]] = mapped_column(Boolean)
    in_use_stability_justification: Mapped[Optional[str]] = mapped_column(Text)
    # DS fields driven by guideline rules
    retest_period: Mapped[Optional[str]] = mapped_column(String(255))
    retest_period_justification: Mapped[Optional[str]] = mapped_column(Text)
    proposed_storage_conditions: Mapped[Optional[str]] = mapped_column(String(500))
    stability_commitment_statement: Mapped[Optional[str]] = mapped_column(Text)
    # DP fields driven by guideline rules
    shelf_life: Mapped[Optional[str]] = mapped_column(String(255))
    shelf_life_justification: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="products")
    studies = relationship("Study", back_populates="product", cascade="all, delete-orphan")
    storage_conditions = relationship("StorageCondition", back_populates="product", cascade="all, delete-orphan")
    timepoints = relationship("Timepoint", back_populates="product", cascade="all, delete-orphan")
    quality_attributes = relationship("QualityAttribute", back_populates="product", cascade="all, delete-orphan")
    table_definitions = relationship("TableDefinition", back_populates="product", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(String(1000), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_type: Mapped[str] = mapped_column(String(20), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(2000), nullable=False)
    classification: Mapped[DocumentClassification] = mapped_column(Enum(DocumentClassification), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    uploaded_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    notes: Mapped[Optional[str]] = mapped_column(Text)

    project = relationship("Project", back_populates="documents")
    source_anchors = relationship("SourceAnchor", back_populates="document", cascade="all, delete-orphan")

    @property
    def is_authoritative(self) -> bool:
        return self.classification in AUTHORITATIVE_CLASSIFICATIONS


class SourceAnchor(Base):
    __tablename__ = "source_anchors"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    page_number: Mapped[Optional[int]] = mapped_column(Integer)
    section_ref: Mapped[Optional[str]] = mapped_column(String(255))
    table_ref: Mapped[Optional[str]] = mapped_column(String(255))
    row_index: Mapped[Optional[int]] = mapped_column(Integer)
    col_index: Mapped[Optional[int]] = mapped_column(Integer)
    bounding_box: Mapped[Optional[dict]] = mapped_column(JSONB)
    text_snippet: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document = relationship("Document", back_populates="source_anchors")


class Study(Base):
    __tablename__ = "studies"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    product_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    study_type: Mapped[StudyType] = mapped_column(Enum(StudyType), nullable=False)
    study_label: Mapped[Optional[str]] = mapped_column(String(500))
    protocol_id: Mapped[Optional[str]] = mapped_column(String(255))
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    sites: Mapped[Optional[list]] = mapped_column(ARRAY(Text))
    manufacturers: Mapped[Optional[list]] = mapped_column(ARRAY(Text))
    extraction_status: Mapped[ExtractionStatus] = mapped_column(Enum(ExtractionStatus), default=ExtractionStatus.pending_review)
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    product = relationship("Product", back_populates="studies")
    lots = relationship("Lot", back_populates="study", cascade="all, delete-orphan")


class Lot(Base):
    __tablename__ = "lots"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    study_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("studies.id", ondelete="CASCADE"), nullable=False)
    lot_number: Mapped[str] = mapped_column(String(255), nullable=False)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(500))
    manufacturing_site: Mapped[Optional[str]] = mapped_column(String(500))
    intended_use: Mapped[Optional[str]] = mapped_column(String(255))
    lot_use_label: Mapped[Optional[str]] = mapped_column(String(500))
    extraction_status: Mapped[ExtractionStatus] = mapped_column(Enum(ExtractionStatus), default=ExtractionStatus.pending_review)
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    study = relationship("Study", back_populates="lots")
    results = relationship("Result", back_populates="lot", cascade="all, delete-orphan")


class StorageCondition(Base):
    __tablename__ = "storage_conditions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    product_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    temperature_min: Mapped[Optional[float]] = mapped_column(Float)
    temperature_max: Mapped[Optional[float]] = mapped_column(Float)
    temperature_setpoint: Mapped[Optional[float]] = mapped_column(Float)
    tolerance: Mapped[Optional[str]] = mapped_column(String(100))
    humidity: Mapped[Optional[str]] = mapped_column(String(100))
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    extraction_status: Mapped[ExtractionStatus] = mapped_column(Enum(ExtractionStatus), default=ExtractionStatus.pending_review)
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product", back_populates="storage_conditions")
    results = relationship("Result", back_populates="condition", cascade="all, delete-orphan")


class Timepoint(Base):
    __tablename__ = "timepoints"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    product_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[TimepointUnit] = mapped_column(Enum(TimepointUnit), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("product_id", "value", "unit"),)

    product = relationship("Product", back_populates="timepoints")
    results = relationship("Result", back_populates="timepoint")


class QualityAttribute(Base):
    __tablename__ = "quality_attributes"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    product_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    method_group: Mapped[Optional[str]] = mapped_column(String(255))
    analytical_procedure: Mapped[Optional[str]] = mapped_column(String(500))
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    extraction_status: Mapped[ExtractionStatus] = mapped_column(Enum(ExtractionStatus), default=ExtractionStatus.pending_review)
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    product = relationship("Product", back_populates="quality_attributes")
    acceptance_criteria = relationship("AcceptanceCriteria", back_populates="attribute", cascade="all, delete-orphan")
    results = relationship("Result", back_populates="attribute")


class AcceptanceCriteria(Base):
    __tablename__ = "acceptance_criteria"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    attribute_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("quality_attributes.id", ondelete="CASCADE"), nullable=False)
    criteria_text: Mapped[str] = mapped_column(Text, nullable=False)
    criteria_type: Mapped[Optional[str]] = mapped_column(String(50))
    lower_limit: Mapped[Optional[float]] = mapped_column(Float)
    upper_limit: Mapped[Optional[float]] = mapped_column(Float)
    unit: Mapped[Optional[str]] = mapped_column(String(50))
    extraction_status: Mapped[ExtractionStatus] = mapped_column(Enum(ExtractionStatus), default=ExtractionStatus.pending_review)
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    attribute = relationship("QualityAttribute", back_populates="acceptance_criteria")


class Result(Base):
    __tablename__ = "results"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    lot_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("lots.id", ondelete="CASCADE"), nullable=False)
    condition_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("storage_conditions.id", ondelete="CASCADE"), nullable=False)
    timepoint_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("timepoints.id", ondelete="CASCADE"), nullable=False)
    attribute_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("quality_attributes.id", ondelete="CASCADE"), nullable=False)
    value_text: Mapped[Optional[str]] = mapped_column(String(500))
    value_numeric: Mapped[Optional[float]] = mapped_column(Float)
    status: Mapped[Optional[str]] = mapped_column(String(50))
    unit: Mapped[Optional[str]] = mapped_column(String(100))
    flags: Mapped[Optional[list]] = mapped_column(ARRAY(Text))
    extraction_status: Mapped[ExtractionStatus] = mapped_column(Enum(ExtractionStatus), default=ExtractionStatus.pending_review)
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    is_author_narrative: Mapped[bool] = mapped_column(Boolean, default=False)
    author_narrative_justification: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    lot = relationship("Lot", back_populates="results")
    condition = relationship("StorageCondition", back_populates="results")
    timepoint = relationship("Timepoint", back_populates="results")
    attribute = relationship("QualityAttribute", back_populates="results")


class TableDefinition(Base):
    __tablename__ = "table_definitions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    product_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    table_type: Mapped[str] = mapped_column(String(100), nullable=False)
    section_prefix: Mapped[str] = mapped_column(String(50), nullable=False)
    attribute_groups: Mapped[dict] = mapped_column(JSONB, nullable=False)
    footnotes: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product", back_populates="table_definitions")


class GenerationRun(Base):
    __tablename__ = "generation_runs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[GenerationStatus] = mapped_column(Enum(GenerationStatus), default=GenerationStatus.pending)
    options: Mapped[dict] = mapped_column(JSONB, nullable=False)
    template_version: Mapped[Optional[str]] = mapped_column(String(100))
    validation_result: Mapped[Optional[dict]] = mapped_column(JSONB)
    output_docx_path: Mapped[Optional[str]] = mapped_column(String(2000))
    output_pdf_path: Mapped[Optional[str]] = mapped_column(String(2000))
    traceability_json_path: Mapped[Optional[str]] = mapped_column(String(2000))
    traceability_table_path: Mapped[Optional[str]] = mapped_column(String(2000))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    project = relationship("Project", back_populates="generation_runs")


class RedactionPolicy(Base):
    __tablename__ = "redaction_policies"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    placeholder_token: Mapped[str] = mapped_column(String(100), default="[REDACTED]")
    rules: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RedactionLog(Base):
    __tablename__ = "redaction_logs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    generation_run_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("generation_runs.id", ondelete="CASCADE"), nullable=False)
    policy_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("redaction_policies.id"), nullable=False)
    field_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    rule_applied: Mapped[str] = mapped_column(String(100), nullable=False)
    replacement: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    old_value: Mapped[Optional[dict]] = mapped_column(JSONB)
    new_value: Mapped[Optional[dict]] = mapped_column(JSONB)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StylingProfile(Base):
    __tablename__ = "styling_profiles"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    confidentiality_mark: Mapped[Optional[str]] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── Regulatory Library Models ──────────────────────────────────────

class RegulatoryGuideline(Base):
    __tablename__ = "regulatory_guidelines"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    agency: Mapped[str] = mapped_column(String(100), nullable=False)
    document_id: Mapped[Optional[str]] = mapped_column(String(255))
    version: Mapped[Optional[str]] = mapped_column(String(100))
    publication_date: Mapped[Optional[date]] = mapped_column(Date)
    file_checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(2000), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    notes: Mapped[Optional[str]] = mapped_column(Text)

    allocation_packs = relationship("GuidelineAllocationPack", back_populates="guideline", cascade="all, delete-orphan")
    project_activations = relationship("ProjectGuidelineActivation", back_populates="guideline", cascade="all, delete-orphan")


class ProjectGuidelineActivation(Base):
    __tablename__ = "project_guideline_activations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    guideline_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("regulatory_guidelines.id", ondelete="CASCADE"), nullable=False)
    numbering_mode: Mapped[NumberingMode] = mapped_column(Enum(NumberingMode), default=NumberingMode.ctd)
    clinical_phase: Mapped[ClinicalPhase] = mapped_column(Enum(ClinicalPhase), default=ClinicalPhase.phase_1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    activated_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("project_id", "guideline_id"),)

    project = relationship("Project", back_populates="guideline_activations")
    guideline = relationship("RegulatoryGuideline", back_populates="project_activations")


class GuidelineAllocationPack(Base):
    __tablename__ = "guideline_allocation_packs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    guideline_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("regulatory_guidelines.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    rules_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    extraction_status: Mapped[ExtractionStatus] = mapped_column(Enum(ExtractionStatus), default=ExtractionStatus.pending_review)
    extracted_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"))
    reviewed_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    guideline = relationship("RegulatoryGuideline", back_populates="allocation_packs")
    regulatory_rules = relationship("RegulatoryRule", back_populates="allocation_pack", cascade="all, delete-orphan")
    glossary_entries = relationship("RegulatoryGlossary", back_populates="allocation_pack", cascade="all, delete-orphan")


class RegulatoryRule(Base):
    __tablename__ = "regulatory_rules"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    allocation_pack_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("guideline_allocation_packs.id", ondelete="CASCADE"), nullable=False)
    rule_id_code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    applies_to: Mapped[list] = mapped_column(ARRAY(Text), nullable=False)
    mapped_app_sections: Mapped[list] = mapped_column(ARRAY(Text), nullable=False)
    requirement_level: Mapped[RequirementLevel] = mapped_column(Enum(RequirementLevel), nullable=False)
    rule_text: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_expected: Mapped[Optional[list]] = mapped_column(ARRAY(Text))
    ui_fields_required: Mapped[Optional[list]] = mapped_column(ARRAY(Text))
    validation_severity: Mapped[RuleSeverity] = mapped_column(Enum(RuleSeverity), default=RuleSeverity.WARN)
    validation_logic: Mapped[Optional[str]] = mapped_column(Text)
    # Traceability
    source_page: Mapped[Optional[int]] = mapped_column(Integer)
    source_section: Mapped[Optional[str]] = mapped_column(String(500))
    source_snippet: Mapped[Optional[str]] = mapped_column(Text)
    # Status
    status: Mapped[AllocationStatus] = mapped_column(Enum(AllocationStatus), default=AllocationStatus.pending_review)
    override_justification: Mapped[Optional[str]] = mapped_column(Text)
    reviewed_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    allocation_pack = relationship("GuidelineAllocationPack", back_populates="regulatory_rules")


class RegulatoryGlossary(Base):
    __tablename__ = "regulatory_glossary"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    allocation_pack_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("guideline_allocation_packs.id", ondelete="CASCADE"), nullable=False)
    term: Mapped[str] = mapped_column(String(500), nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    source_page: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    allocation_pack = relationship("GuidelineAllocationPack", back_populates="glossary_entries")


class RuleEvaluationLog(Base):
    __tablename__ = "rule_evaluation_log"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    generation_run_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("generation_runs.id", ondelete="CASCADE"), nullable=False)
    rule_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("regulatory_rules.id"), nullable=False)
    rule_id_code: Mapped[str] = mapped_column(String(100), nullable=False)
    evaluation_result: Mapped[str] = mapped_column(String(20), nullable=False)
    severity: Mapped[RuleSeverity] = mapped_column(Enum(RuleSeverity), nullable=False)
    details: Mapped[Optional[str]] = mapped_column(Text)
    waiver_justification: Mapped[Optional[str]] = mapped_column(Text)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
