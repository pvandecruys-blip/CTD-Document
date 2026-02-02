-- CTD Stability Document Generator — Database Schema
-- Migration 001: Initial Schema
-- PostgreSQL 15+

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'author', 'reviewer', 'viewer');
CREATE TYPE document_classification AS ENUM (
    'stability_plan',       -- authoritative
    'stability_report',     -- authoritative
    'technical_report',     -- supporting
    'coa',                  -- supporting
    'post_approval_protocol', -- supporting
    'other_supporting'      -- supporting
);
CREATE TYPE document_authority AS ENUM ('authoritative', 'supporting');
CREATE TYPE extraction_status AS ENUM ('pending_review', 'confirmed', 'rejected', 'manually_added');
CREATE TYPE study_type AS ENUM ('accelerated', 'long_term', 'intermediate', 'stress', 'photostability', 'other');
CREATE TYPE product_type AS ENUM ('drug_substance', 'drug_product');
CREATE TYPE generation_status AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE validation_severity AS ENUM ('hard', 'soft');
CREATE TYPE validation_status AS ENUM ('pass', 'fail', 'warning');
CREATE TYPE redaction_rule_type AS ENUM ('always_redact', 'regex', 'threshold', 'role_based');
CREATE TYPE timepoint_unit AS ENUM ('hour', 'day', 'week', 'month', 'year');

-- ============================================================
-- USERS & AUTH
-- ============================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    display_name    VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            user_role NOT NULL DEFAULT 'viewer',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROJECTS
-- ============================================================

CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(500) NOT NULL,
    description     TEXT,
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',  -- draft, in_review, finalized, archived
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PRODUCTS
-- ============================================================

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    product_type    product_type NOT NULL,
    product_name    VARCHAR(500) NOT NULL,
    dosage_form     VARCHAR(255),
    strength        VARCHAR(255),
    ctd_section     VARCHAR(50),  -- e.g., '3.2.S.7' or '3.2.P.8'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOCUMENTS (uploaded files)
-- ============================================================

CREATE TABLE documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename            VARCHAR(1000) NOT NULL,
    original_filename   VARCHAR(1000) NOT NULL,
    file_type           VARCHAR(20) NOT NULL,  -- pdf, docx, xlsx
    file_size_bytes     BIGINT NOT NULL,
    checksum_sha256     VARCHAR(64) NOT NULL,
    storage_path        VARCHAR(2000) NOT NULL,  -- path in object storage
    classification      document_classification NOT NULL,
    authority           document_authority NOT NULL GENERATED ALWAYS AS (
                            CASE WHEN classification IN ('stability_plan', 'stability_report')
                                 THEN 'authoritative'::document_authority
                                 ELSE 'supporting'::document_authority
                            END
                        ) STORED,
    version             INTEGER NOT NULL DEFAULT 1,
    uploaded_by         UUID NOT NULL REFERENCES users(id),
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes               TEXT
);

CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_documents_classification ON documents(classification);

-- ============================================================
-- SOURCE ANCHORS (traceability links to source documents)
-- ============================================================

CREATE TABLE source_anchors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number     INTEGER,
    section_ref     VARCHAR(255),       -- e.g., "Table 3.2.P.8.3-1"
    table_ref       VARCHAR(255),       -- specific table identifier
    row_index       INTEGER,
    col_index       INTEGER,
    bounding_box    JSONB,              -- {x0, y0, x1, y1} if available
    text_snippet    TEXT,               -- extracted text snippet for context
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_source_anchors_document ON source_anchors(document_id);

-- ============================================================
-- STUDIES
-- ============================================================

CREATE TABLE studies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    study_type      study_type NOT NULL,
    study_label     VARCHAR(500),           -- e.g., "Accelerated Stability Study"
    protocol_id     VARCHAR(255),           -- reference to protocol
    start_date      DATE,
    sites           TEXT[],                 -- array of site names
    manufacturers   TEXT[],                 -- array of manufacturer names
    extraction_status extraction_status NOT NULL DEFAULT 'pending_review',
    confidence      REAL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_studies_product ON studies(product_id);

-- Link studies to source anchors
CREATE TABLE study_source_anchors (
    study_id        UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    anchor_id       UUID NOT NULL REFERENCES source_anchors(id) ON DELETE CASCADE,
    PRIMARY KEY (study_id, anchor_id)
);

-- ============================================================
-- LOTS / BATCHES
-- ============================================================

CREATE TABLE lots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    lot_number      VARCHAR(255) NOT NULL,
    manufacturer    VARCHAR(500),
    manufacturing_site VARCHAR(500),
    intended_use    VARCHAR(255),  -- clinical, commercial, PPQ, emergency_supply, etc.
    lot_use_label   VARCHAR(500),  -- display label for summary table
    extraction_status extraction_status NOT NULL DEFAULT 'pending_review',
    confidence      REAL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lots_study ON lots(study_id);

CREATE TABLE lot_source_anchors (
    lot_id          UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
    anchor_id       UUID NOT NULL REFERENCES source_anchors(id) ON DELETE CASCADE,
    PRIMARY KEY (lot_id, anchor_id)
);

-- ============================================================
-- STORAGE CONDITIONS
-- ============================================================

CREATE TABLE storage_conditions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label           VARCHAR(255) NOT NULL,      -- e.g., "-20 ± 5 °C"
    temperature_min REAL,
    temperature_max REAL,
    temperature_setpoint REAL,
    tolerance       VARCHAR(100),               -- e.g., "± 5 °C"
    humidity        VARCHAR(100),               -- e.g., "65% RH ± 5%"
    display_order   INTEGER NOT NULL DEFAULT 0,
    extraction_status extraction_status NOT NULL DEFAULT 'pending_review',
    confidence      REAL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_storage_conditions_product ON storage_conditions(product_id);

CREATE TABLE condition_source_anchors (
    condition_id    UUID NOT NULL REFERENCES storage_conditions(id) ON DELETE CASCADE,
    anchor_id       UUID NOT NULL REFERENCES source_anchors(id) ON DELETE CASCADE,
    PRIMARY KEY (condition_id, anchor_id)
);

-- ============================================================
-- TIMEPOINTS
-- ============================================================

CREATE TABLE timepoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    value           REAL NOT NULL,              -- numeric value
    unit            timepoint_unit NOT NULL,     -- week, month, etc.
    label           VARCHAR(50) NOT NULL,        -- display: "T0", "1W", "2W", "1M", etc.
    sort_order      INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_timepoints_product ON timepoints(product_id);
CREATE UNIQUE INDEX idx_timepoints_unique ON timepoints(product_id, value, unit);

-- ============================================================
-- QUALITY ATTRIBUTES / ASSAYS
-- ============================================================

CREATE TABLE quality_attributes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name            VARCHAR(500) NOT NULL,       -- e.g., "Visual Appearance"
    method_group    VARCHAR(255),                -- e.g., "Appearance", "HPLC-CAD", "DLS"
    analytical_procedure VARCHAR(500),           -- e.g., "HPLC-CAD Method 1"
    display_order   INTEGER NOT NULL DEFAULT 0,
    extraction_status extraction_status NOT NULL DEFAULT 'pending_review',
    confidence      REAL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_attributes_product ON quality_attributes(product_id);

CREATE TABLE attribute_source_anchors (
    attribute_id    UUID NOT NULL REFERENCES quality_attributes(id) ON DELETE CASCADE,
    anchor_id       UUID NOT NULL REFERENCES source_anchors(id) ON DELETE CASCADE,
    PRIMARY KEY (attribute_id, anchor_id)
);

-- ============================================================
-- ACCEPTANCE CRITERIA
-- ============================================================

CREATE TABLE acceptance_criteria (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_id    UUID NOT NULL REFERENCES quality_attributes(id) ON DELETE CASCADE,
    criteria_text   TEXT NOT NULL,               -- human-readable: "≥ 95.0%"
    criteria_type   VARCHAR(50),                 -- 'range', 'minimum', 'maximum', 'conforms', 'report'
    lower_limit     REAL,
    upper_limit     REAL,
    unit            VARCHAR(50),
    extraction_status extraction_status NOT NULL DEFAULT 'pending_review',
    confidence      REAL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_acceptance_criteria_attribute ON acceptance_criteria(attribute_id);

CREATE TABLE criteria_source_anchors (
    criteria_id     UUID NOT NULL REFERENCES acceptance_criteria(id) ON DELETE CASCADE,
    anchor_id       UUID NOT NULL REFERENCES source_anchors(id) ON DELETE CASCADE,
    PRIMARY KEY (criteria_id, anchor_id)
);

-- ============================================================
-- RESULTS
-- ============================================================

CREATE TABLE results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id          UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
    condition_id    UUID NOT NULL REFERENCES storage_conditions(id) ON DELETE CASCADE,
    timepoint_id    UUID NOT NULL REFERENCES timepoints(id) ON DELETE CASCADE,
    attribute_id    UUID NOT NULL REFERENCES quality_attributes(id) ON DELETE CASCADE,
    value_text      VARCHAR(500),               -- raw text value
    value_numeric   REAL,                       -- parsed numeric (if applicable)
    status          VARCHAR(50),                -- 'S' (meets), 'NS' (not meets), 'Pending', 'NT', etc.
    unit            VARCHAR(100),
    flags           TEXT[],                     -- any flags/notes
    extraction_status extraction_status NOT NULL DEFAULT 'pending_review',
    confidence      REAL,
    is_author_narrative BOOLEAN NOT NULL DEFAULT FALSE,  -- true if manually added without source
    author_narrative_justification TEXT,                  -- required if is_author_narrative
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_results_lot ON results(lot_id);
CREATE INDEX idx_results_condition ON results(condition_id);
CREATE INDEX idx_results_composite ON results(lot_id, condition_id, timepoint_id, attribute_id);

CREATE TABLE result_source_anchors (
    result_id       UUID NOT NULL REFERENCES results(id) ON DELETE CASCADE,
    anchor_id       UUID NOT NULL REFERENCES source_anchors(id) ON DELETE CASCADE,
    PRIMARY KEY (result_id, anchor_id)
);

-- ============================================================
-- TABLE DEFINITIONS (layout templates for generation)
-- ============================================================

CREATE TABLE table_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    table_type      VARCHAR(100) NOT NULL,      -- 'detail', 'summary'
    section_prefix  VARCHAR(50) NOT NULL,        -- e.g., '3.2.P.8.3'
    attribute_groups JSONB NOT NULL,             -- ordered list of method_group names to include
    footnotes       JSONB,                       -- default footnotes for this table type
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GENERATION RUNS
-- ============================================================

CREATE TABLE generation_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status          generation_status NOT NULL DEFAULT 'pending',
    options         JSONB NOT NULL,             -- full generation config snapshot
    template_version VARCHAR(100),
    validation_result JSONB,                   -- snapshot of validation output
    output_docx_path VARCHAR(2000),
    output_pdf_path  VARCHAR(2000),
    traceability_json_path VARCHAR(2000),
    traceability_table_path VARCHAR(2000),
    error_message   TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_generation_runs_project ON generation_runs(project_id);

-- ============================================================
-- REDACTION POLICIES
-- ============================================================

CREATE TABLE redaction_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    placeholder_token VARCHAR(100) NOT NULL DEFAULT '[REDACTED]',
    rules           JSONB NOT NULL,             -- array of redaction rules
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE redaction_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_run_id UUID NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
    policy_id       UUID NOT NULL REFERENCES redaction_policies(id),
    field_path      VARCHAR(500) NOT NULL,      -- e.g., "result.lot_id.lot_number"
    original_hash   VARCHAR(64) NOT NULL,       -- SHA-256 of original value (not the value itself)
    rule_applied    VARCHAR(100) NOT NULL,       -- which rule triggered
    replacement     VARCHAR(500) NOT NULL,       -- what was substituted
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_redaction_logs_run ON redaction_logs(generation_run_id);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,       -- 'create', 'update', 'delete', 'extract', 'generate', 'redact'
    entity_type     VARCHAR(100) NOT NULL,       -- 'project', 'document', 'study', 'lot', 'result', etc.
    entity_id       UUID NOT NULL,
    old_value       JSONB,
    new_value       JSONB,
    metadata        JSONB,                       -- additional context
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- ============================================================
-- STYLING PROFILES
-- ============================================================

CREATE TABLE styling_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    config          JSONB NOT NULL,             -- heading styles, table styles, fonts, margins, headers, footers
    confidentiality_mark TEXT,                  -- e.g., "CONFIDENTIAL"
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
