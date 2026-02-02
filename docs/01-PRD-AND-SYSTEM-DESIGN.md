# CTD Stability Document Generator — Product Requirements & System Design

**Version:** 1.0
**Date:** 2026-01-29
**Status:** Draft Specification

---

## 1. Product Requirements Document (PRD)

### 1.1 Problem Statement

Regulatory CMC authors must produce CTD Module 3 stability sections (3.2.S.7 for Drug Substance, 3.2.P.8 for Drug Product) that follow strict formatting, table conventions, and traceability requirements. Today this is largely a manual process: authors copy data from stability reports, plans, CoAs, and technical reports into Word templates, then manually cross-check numbering, completeness, and consistency. This is error-prone, slow, and difficult to audit.

### 1.2 Product Vision

A web application that ingests authoritative stability documents (plans and reports), extracts structured data with human review, and generates CTD-ready DOCX/PDF stability sections with full traceability to source documents.

### 1.3 Users & Roles

| Role     | Description                                                    |
|----------|----------------------------------------------------------------|
| Admin    | Manages system config, users, redaction policies, templates    |
| Author   | Creates projects, uploads docs, reviews extractions, generates |
| Reviewer | Read-only + can approve/reject generation runs                 |
| Viewer   | Read-only access to projects and outputs                       |

### 1.4 Authoritative vs. Supporting Sources (Scope Rule)

**Authoritative (generation sources):**
- Stability Plan(s)
- Stability Report(s)

**Supporting (traceability/reference only — NOT used for primary data generation):**
- Technical Reports
- Certificates of Analysis (CoA)
- Post Approval Protocol(s)
- LIMS raw data exports
- Stability protocols / specifications

The system MUST enforce this distinction:
- Generation pulls data ONLY from authoritative sources.
- Supporting documents may be attached for cross-reference and traceability.
- If a user attempts to use a supporting document as a primary source, the system displays a scope warning and blocks generation.

### 1.5 Explicitly Out-of-Scope (v1)

- Automatic stability report generation from raw LIMS data.
- Automatic generation from stability protocols/specifications as primary sources.
- Direct LIMS system integration.

These are labeled as future phases (v2+).

### 1.6 Functional Requirements

#### FR-1: Project Management
- Create, rename, archive stability document build projects.
- Each project targets one product (DS or DP) and one or more CTD sections.

#### FR-2: Document Upload & Classification
- Upload PDF, DOCX, XLSX files.
- Classify each as: Stability Plan, Stability Report, Technical Report, CoA, Post Approval Protocol, Other/Supporting.
- Store file metadata: name, type, version, checksum (SHA-256), upload timestamp, uploader.

#### FR-3: Extraction Pipeline
- Run extraction on authoritative documents.
- Extract: product info, lots/batches, study metadata, storage conditions, timepoints, quality attributes/assays, acceptance criteria, result values/statuses.
- Each extracted datum links to a SourceAnchor (document, page, section/table, text snippet).
- Output: proposed normalized records with confidence scores.
- Human-in-the-loop: all extractions require user review before use in generation.

#### FR-4: Structured Data Review & Editing
- Tabular editor UI for reviewing extracted data.
- Filter by entity type (lots, conditions, assays, results).
- Edit, confirm, reject, or add records manually.
- Every edit is audit-logged.
- Source citation visible for each datum.

#### FR-5: Generation Options
- Toggle DS section (blanked) ON/OFF.
- Toggle DP section: generate full section vs. link/reference only.
- Select storage condition groups to include.
- Configure redaction rules.
- Select document styling profile.

#### FR-6: Document Generation
- DOCX output (primary editable deliverable).
- PDF output (final view, generated from DOCX).
- Traceability Appendix: JSON + human-readable table mapping every cell/statement to source citations.

#### FR-7: QA / Validation Checks
- Completeness: all mandatory fields populated.
- Consistency: table numbering, timepoint ordering, condition naming.
- Source enforcement: no primary data from non-authoritative docs.
- Redaction confirmation for DS exports.
- Validation report viewable in UI; blocks export if hard failures exist.

#### FR-8: Redaction Engine
- Rule types: always-redact, regex, threshold, role-based.
- Configurable placeholder tokens.
- Non-redacted dataset stored internally; redacted output for export.
- Redaction audit trail.

#### FR-9: Audit & Versioning
- All data edits logged (who, when, old value, new value).
- Every generation run is immutable and reproducible.
- Document version history.

### 1.7 Non-Functional Requirements

| Category       | Requirement                                                 |
|----------------|-------------------------------------------------------------|
| Security       | RBAC, TLS, encrypted storage for sensitive data             |
| Deployment     | On-prem (Docker Compose) + cloud (Kubernetes) options       |
| Performance    | Handle projects with 50+ lots, 20+ conditions, 100+ assays |
| Auditability   | 21 CFR Part 11 awareness (audit trail, electronic signatures future) |
| Reproducibility| Any past generation run can be exactly reproduced           |

---

## 2. System Design

### 2.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React/TS)                   │
│  ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐ │
│  │Dashboard │ │Doc Upload  │ │Extraction│ │Generate  │ │
│  │          │ │& Classify  │ │Review    │ │Wizard    │ │
│  └──────────┘ └────────────┘ └──────────┘ └──────────┘ │
│  ┌──────────┐ ┌────────────┐                            │
│  │Validation│ │Traceability│                            │
│  │Report    │ │Viewer      │                            │
│  └──────────┘ └────────────┘                            │
└────────────────────┬────────────────────────────────────┘
                     │ REST API (HTTPS)
┌────────────────────▼────────────────────────────────────┐
│                 BACKEND (Python FastAPI)                  │
│                                                          │
│  ┌─────────┐ ┌───────────┐ ┌──────────┐ ┌────────────┐ │
│  │API Layer│ │Extraction │ │Generation│ │Validation  │ │
│  │(Routes) │ │Service    │ │Service   │ │Service     │ │
│  └─────────┘ └───────────┘ └──────────┘ └────────────┘ │
│  ┌───────────┐ ┌──────────┐ ┌──────────────────────┐   │
│  │Redaction  │ │Audit     │ │Auth (JWT + RBAC)     │   │
│  │Service    │ │Service   │ │                      │   │
│  └───────────┘ └──────────┘ └──────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │       Task Queue (Celery / background tasks)      │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬──────────┬──────────────────────────┘
                     │          │
          ┌──────────▼──┐  ┌───▼──────────────┐
          │ PostgreSQL  │  │ Object Storage   │
          │ (data +     │  │ (MinIO / S3 /    │
          │  audit log) │  │  local fs)       │
          └─────────────┘  └──────────────────┘
```

### 2.2 Component Descriptions

| Component            | Technology              | Responsibility                                    |
|----------------------|-------------------------|---------------------------------------------------|
| Frontend             | React 18 + TypeScript   | All user-facing screens, file upload, data editing |
| API Layer            | FastAPI (Python 3.11+)  | REST endpoints, auth, request validation           |
| Extraction Service   | pdfplumber + docx + openpyxl + optional LLM | Parse docs, extract tables and text |
| Generation Service   | python-docx + docxtpl   | Build DOCX from normalized data + templates        |
| Validation Service   | Pure Python rules engine| Pre-export checks                                  |
| Redaction Service    | Python regex + rules    | Apply redaction policies to output data            |
| Audit Service        | SQLAlchemy event hooks  | Log all mutations                                  |
| Task Queue           | Celery + Redis (or asyncio background tasks) | Long-running extraction/generation |
| Database             | PostgreSQL 15+          | All structured data, audit logs                    |
| Object Storage       | MinIO (on-prem) / S3    | Original uploads, generated outputs                |

### 2.3 Data Flow

```
1. User creates Project
2. User uploads documents → stored in Object Storage, metadata in DB
3. User classifies documents (authoritative vs. supporting)
4. User triggers "Extract" on authoritative docs
   → Extraction Service reads file from Object Storage
   → Parses text, tables, structure
   → Creates proposed normalized records (Studies, Lots, Conditions,
     Timepoints, Assays, Results) with SourceAnchors
   → Stores as "pending review" in DB
5. User reviews extracted data in structured editor
   → Confirms, edits, rejects records
   → All changes audit-logged
6. User opens Generation Wizard
   → Selects sections, conditions, redaction rules, template
   → System runs Validation Service (pre-checks)
   → If pass: Generation Service builds DOCX + Traceability Appendix
   → Redaction Service applies policies to DS output
   → Files stored in Object Storage; GenerationRun record in DB
7. User downloads outputs
```

### 2.4 Deployment

**On-Premises (Docker Compose):**
```yaml
services:
  frontend:    # nginx serving React build
  backend:     # FastAPI with uvicorn
  worker:      # Celery worker (extraction/generation)
  db:          # PostgreSQL
  redis:       # Celery broker
  minio:       # Object storage
```

**Cloud (Kubernetes):**
- Same containers orchestrated via Helm chart.
- PostgreSQL as managed service (RDS/Cloud SQL).
- S3 for object storage.
- Ingress with TLS termination.

---

## 3. UI Wireframe Descriptions

### Screen 1: Project Dashboard
- Card grid of projects showing: project name, product, status (draft/in-review/finalized), last modified, document count.
- "New Project" button opens a modal: project name, product name, DS/DP toggle, dosage form.
- Each card links to the project detail view.

### Screen 2: Document Upload & Classification
- Left panel: list of uploaded documents with classification badges (color-coded: green=authoritative, gray=supporting).
- Right panel: drag-and-drop upload zone.
- On upload, a classification dialog appears: dropdown for document type, optional version/notes.
- "Authoritative" types (Stability Plan, Stability Report) get a green badge.
- "Supporting" types get a gray badge with a tooltip: "Supporting reference only — not used for primary generation."
- Bulk upload supported.

### Screen 3: Extraction Review
- Top bar: "Run Extraction" button (disabled unless authoritative docs exist).
- After extraction: a tabbed interface:
  - **Studies tab**: table of extracted studies (product, type, start date, protocol, sites).
  - **Lots tab**: table of lots (lot number, manufacturer, use, linked study).
  - **Conditions tab**: table of storage conditions (temp, tolerance, label).
  - **Assays tab**: table of quality attributes (name, method, group).
  - **Results tab**: pivotable grid — rows = assays, columns = timepoints, cells = value/status. Filterable by lot and condition.
- Each cell shows a confidence indicator (green/yellow/red).
- Click any cell to see the SourceAnchor: document name, page, snippet, with a "View in Context" link that opens a document viewer pane showing the source page.
- Inline editing: click to edit any value. Changes are highlighted and audit-logged.
- "Add Manual Record" button for each tab.

### Screen 4: Generation Wizard (3-step)
**Step 1 — Scope:**
- Checkboxes: DS 3.2.S.7 (blanked), DP 3.2.P.8 (generate / link-only).
- Multi-select: storage condition groups to include.
- Multi-select: lots to include.

**Step 2 — Redaction & Styling:**
- Redaction policy selector (from saved policies) or "Create New."
- Redaction preview: shows sample table with redacted fields highlighted.
- Styling profile: CTD numbering prefix, table number format, header/footer text, confidentiality marks.

**Step 3 — Preview & Validate:**
- Validation report panel: list of checks with pass/fail/warning status.
- Document structure preview: shows TOC, section headings, table titles.
- "Generate" button (disabled if hard validation failures).

### Screen 5: Validation Report
- Table of validation checks: rule name, status (Pass/Fail/Warning), details, affected entities.
- Filter by status.
- Click any failure to navigate to the relevant data in the extraction review screen.

### Screen 6: Output & Traceability
- List of generation runs: timestamp, user, options summary, validation status.
- For each run: download buttons (DOCX, PDF, Traceability JSON, Traceability Table).
- Traceability viewer: expandable tree — Section → Table → Cell → Source Citation(s).

---

## 4. Parsing/Extraction Strategy

### 4.1 Libraries

| Task                  | Primary Library       | Fallback                    |
|-----------------------|-----------------------|-----------------------------|
| PDF text extraction   | pdfplumber            | PyMuPDF (fitz)              |
| PDF table extraction  | pdfplumber + camelot  | tabula-py                   |
| Scanned PDF / images  | Tesseract OCR (pytesseract) | Azure Document Intelligence / AWS Textract (cloud) |
| DOCX parsing          | python-docx           | mammoth (for HTML conversion)|
| XLSX parsing          | openpyxl              | pandas                      |
| Table template matching | Custom heuristics   | LLM-assisted (GPT-4 / Claude API) |

### 4.2 Extraction Pipeline Steps

```
Input Document
     │
     ▼
┌─────────────────────┐
│ 1. File Type Router  │  PDF → pdf_extractor
│                      │  DOCX → docx_extractor
│                      │  XLSX → xlsx_extractor
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 2. Text Extraction   │  Full text with page numbers
│    + Structure Parse │  Identify headings, sections
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 3. Table Extraction  │  Detect tables, extract cell grids
│    + Template Match  │  Match against known stability table
│                      │  layouts (condition headers, assay
│                      │  rows, timepoint columns)
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 4. Entity Extraction │  Identify: product names, lot numbers,
│    (NER / regex /    │  storage conditions, timepoints,
│     heuristics)      │  assay names, acceptance criteria,
│                      │  result values, status labels
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 5. Normalization     │  Map to schema entities
│    + Deduplication   │  Merge duplicates (same lot across
│                      │  multiple tables)
│                      │  Assign confidence scores
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 6. SourceAnchor      │  Link each datum to doc/page/table/
│    Linking           │  cell position
└──────────┬──────────┘
           ▼
  Proposed Normalized Records
  (stored in DB as "pending_review")
```

### 4.3 Table Template Detection

The reference DP accelerated stability section has a repeating pattern:
- **Table header row**: "Analytical Procedure / Quality Attribute" | "Timepoint / Acceptance Criteria" | T0 | T1W | T2W | T1M | ...
- **Grouped rows**: assays grouped by analytical method (Appearance, pH, DLS, HPLC-CAD, etc.)
- **Footer**: abbreviation definitions, footnotes.

The extractor will:
1. Detect tables with this column structure using header-row pattern matching.
2. Extract the condition and lot from the table title (e.g., "Table 3.2.P.8.3-5: Lot XYZ at -20 ± 5 °C").
3. Parse each row into (assay_name, method_group, acceptance_criteria, {timepoint: value/status}).
4. Handle multi-page tables by detecting continuation patterns (no repeated header = continuation; repeated header = new table or page break continuation).

### 4.4 Confidence Scoring

| Confidence Level | Score Range | Meaning                                    |
|------------------|-------------|---------------------------------------------|
| High             | 0.85–1.0    | Clean text extraction, unambiguous match    |
| Medium           | 0.6–0.84    | Minor ambiguity (e.g., OCR artifacts)       |
| Low              | <0.6        | Significant uncertainty, manual review req. |

---

## 5. Document Generation Strategy

### 5.1 Template System

Use `python-docx` for programmatic DOCX construction with `docxtpl` for Jinja2-based templating where appropriate.

**Template structure:**
```
templates/
  dp_stability_accelerated.docx    # DP 3.2.P.8.3 template
  ds_stability_blanked.docx        # DS 3.2.S.7 template (with redaction placeholders)
  styles/
    ctd_styles.json                # Heading styles, table styles, fonts, margins
```

### 5.2 Generation Steps

```
1. Load template DOCX
2. Inject metadata: product name, section number, date
3. Generate narrative paragraph from study metadata
4. Build Summary Table: enumerate studies → table numbers
5. For each (lot × condition) combination:
   a. Create detail table with configured assay groups
   b. Populate timepoint columns with result values/statuses
   c. Add footnotes
   d. Number table sequentially
6. Generate Table of Contents (DOCX TOC field)
7. Generate List of Tables (DOCX field)
8. Apply redaction (if DS section)
9. Save DOCX
10. Convert DOCX → PDF (via LibreOffice headless or docx2pdf)
11. Generate Traceability Appendix (JSON + rendered table)
```

### 5.3 Table Numbering Rules

- Format: `Table {section_prefix}-{sequential_number}`
- Example DP: `Table 3.2.P.8.3-1`, `Table 3.2.P.8.3-2`, ...
- Example DS: `Table 3.2.S.7-1`, `Table 3.2.S.7-2`, ...
- Configurable prefix per project.
- Sequential numbering reset per section.
- Uniqueness enforced by validation.

### 5.4 Table Rendering Rules

Each detail table follows this structure:

```
┌─────────────────────────────────┬──────────────────┬────┬────┬────┬────┐
│ Analytical Procedure /          │ Timepoint /       │ T0 │ 1W │ 2W │ 1M │ ...
│ Quality Attribute               │ Acceptance Crit.  │    │    │    │    │
├─────────────────────────────────┼──────────────────┼────┼────┼────┼────┤
│ GROUP: Appearance               │                  │    │    │    │    │
│   Visual Appearance             │ [criteria text]  │ S  │ S  │ S  │ S  │
│   Color (instrument)            │ [criteria text]  │ S  │ S  │ -  │ S  │
├─────────────────────────────────┼──────────────────┼────┼────┼────┼────┤
│ GROUP: pH                       │                  │    │    │    │    │
│   pH                            │ [criteria text]  │ S  │ S  │ S  │ S  │
├─────────────────────────────────┼──────────────────┼────┼────┼────┼────┤
│ GROUP: Purity (HPLC-CAD)        │                  │    │    │    │    │
│   Main Peak (%)                 │ [criteria text]  │ val│ val│ val│ val│
│   ...                           │                  │    │    │    │    │
└─────────────────────────────────┴──────────────────┴────┴────┴────┴────┘
Footnotes:
  S = Meets acceptance criteria
  W = week, M = month
  ...
```

- Assay groups are rendered in the order defined by the TableDefinition / template config.
- Empty cells (not tested at that timepoint) show "–" or "NT".
- "Pending" results show "Pending".

---

## 6. Validation Rules

### 6.1 Hard Validations (Block Export)

| ID   | Rule                                                        | Implementation                          |
|------|-------------------------------------------------------------|-----------------------------------------|
| V-01 | Product name must be set                                    | Check Project.product is not null       |
| V-02 | At least one Study record exists                            | COUNT(studies) > 0                      |
| V-03 | At least one Lot/Batch exists                               | COUNT(lots) > 0                         |
| V-04 | At least one StorageCondition exists                        | COUNT(conditions) > 0                   |
| V-05 | At least one timepoint row per included condition           | Check results exist                     |
| V-06 | Table numbering is unique and sequential                    | Sorted check on table_number            |
| V-07 | Timepoints sorted correctly within each condition           | sort_order validation                   |
| V-08 | Every result cell has ≥1 SourceAnchor OR "author narrative" justification | LEFT JOIN check       |
| V-09 | No primary data sourced from non-authoritative documents    | Check source_doc.classification         |
| V-10 | DS export: redaction policy must be applied                 | Check redaction_run exists              |
| V-11 | Section ID (CTD number) is set                              | Check not null/empty                    |

### 6.2 Soft Validations (Warnings)

| ID   | Rule                                                        |
|------|-------------------------------------------------------------|
| W-01 | Low-confidence extracted values exist (< 0.6)               |
| W-02 | Some assays have no acceptance criteria text                 |
| W-03 | Timepoint gaps detected (e.g., T0 → T3M, skipping T1M)     |
| W-04 | Lot count differs from Summary Table expectation             |
| W-05 | Footnote abbreviations used but not defined                  |

### 6.3 Implementation

Validation runs as a service that returns a structured report:

```json
{
  "run_id": "uuid",
  "timestamp": "2026-01-29T10:00:00Z",
  "status": "FAIL",
  "hard_failures": [
    {"rule_id": "V-08", "message": "3 result cells missing source anchors", "affected": ["result_id_1", "result_id_2", "result_id_3"]}
  ],
  "warnings": [
    {"rule_id": "W-01", "message": "12 values with confidence < 0.6", "affected": [...]}
  ]
}
```

---

## 7. Redaction System Design

### 7.1 Redaction Policy Schema

```json
{
  "policy_id": "uuid",
  "name": "DS Default Blanked",
  "description": "Standard DS redaction for regulatory submission",
  "placeholder_token": "[REDACTED]",
  "rules": [
    {
      "type": "always_redact",
      "target_fields": ["lot_number", "manufacturer_site"],
      "scope": "ds_only"
    },
    {
      "type": "regex",
      "pattern": "LOT-\\d{4}-\\d{3}",
      "replacement": "[LOT-REDACTED]",
      "scope": "all"
    },
    {
      "type": "threshold",
      "field": "result_value",
      "condition": "numeric_value < proprietary_threshold",
      "replacement": "(b)(4)",
      "scope": "ds_only"
    },
    {
      "type": "role_based",
      "visible_to_roles": ["admin", "author"],
      "hidden_from_roles": ["reviewer", "viewer"],
      "replacement": "[CONFIDENTIAL]"
    }
  ]
}
```

### 7.2 Redaction Flow

```
Normalized Dataset
       │
       ▼
┌──────────────────┐
│ Load Redaction    │
│ Policy           │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Apply Rules      │  For each field in output dataset:
│ (in priority     │  1. Check always_redact list
│  order)          │  2. Check regex rules
│                  │  3. Check threshold rules
│                  │  4. Check role-based rules
│                  │  Result: field value or placeholder
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Redacted Dataset │  Used by Generation Service for DS output
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Redaction Log    │  Audit: which fields were redacted,
│                  │  which rule applied, original hash
└──────────────────┘
```

### 7.3 Example: Redacted DS Table

**Before redaction:**
```
Lot Number: LOT-2025-001
Manufacturer: Acme Biologics, Site A
pH at T0: 7.2
Purity at T0: 98.5%
```

**After redaction (DS blanked):**
```
Lot Number: [REDACTED]
Manufacturer: [REDACTED]
pH at T0: 7.2
Purity at T0: (b)(4)
```

---

## 8. Phased Implementation Plan

### Phase 0: Foundation (MVP)
- Project CRUD + document upload/classification
- Database schema + migrations
- Basic auth (JWT) + RBAC
- File storage integration (local/MinIO)
- UI: Dashboard, Upload, Classification screens

### Phase 1: Extraction + Review
- PDF/DOCX table extraction pipeline
- Entity extraction (lots, conditions, assays, results)
- SourceAnchor linking
- Confidence scoring
- UI: Extraction Review screen with tabular editor
- Audit logging for data edits

### Phase 2: Generation + Validation
- DOCX template system (DP accelerated + DS blanked)
- Table rendering engine
- Narrative paragraph generation
- TOC + List of Tables generation
- Validation rules engine (hard + soft)
- UI: Generation Wizard, Validation Report
- PDF conversion

### Phase 3: Redaction + Traceability
- Redaction policy management
- Redaction engine with all 4 rule types
- Traceability Appendix generation (JSON + table)
- UI: Redaction policy editor, Traceability viewer
- Full audit trail for redaction

### Phase 4: Polish + Compliance
- Electronic signature support (21 CFR Part 11 readiness)
- Advanced document viewer (highlight source anchors in original PDF)
- Template management UI (upload/configure custom templates)
- Performance optimization for large projects
- Cloud deployment (Kubernetes + Helm)

### Phase 5: Future (Out-of-Scope v1)
- Direct LIMS data ingestion
- Stability protocol/spec as primary generation sources
- LLM-assisted extraction (Claude/GPT for complex table parsing)
- Multi-product / multi-section batch generation
- Regulatory submission portal integration (eCTD)
