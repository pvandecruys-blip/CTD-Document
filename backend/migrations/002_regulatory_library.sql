-- CTD Stability Document Generator — Database Schema Extension
-- Migration 002: Regulatory Library & Allocation
-- PostgreSQL 15+

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE requirement_level AS ENUM ('MUST', 'SHOULD', 'MAY');
CREATE TYPE regulatory_rule_severity AS ENUM ('BLOCK', 'WARN');
CREATE TYPE allocation_status AS ENUM ('pending_review', 'confirmed', 'rejected', 'overridden');
CREATE TYPE numbering_mode AS ENUM ('ctd', 'impd');
CREATE TYPE clinical_phase AS ENUM ('phase_1', 'phase_2', 'phase_3', 'post_approval');

-- ============================================================
-- REGULATORY GUIDELINES (the source documents)
-- ============================================================

CREATE TABLE regulatory_guidelines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title               VARCHAR(1000) NOT NULL,
    agency              VARCHAR(100) NOT NULL,       -- EMA, FDA, ICH, etc.
    document_id         VARCHAR(255),                -- official doc identifier
    version             VARCHAR(100),
    publication_date    DATE,
    file_checksum_sha256 VARCHAR(64) NOT NULL,
    storage_path        VARCHAR(2000) NOT NULL,      -- object storage path
    original_filename   VARCHAR(1000) NOT NULL,
    file_size_bytes     BIGINT NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT FALSE,
    uploaded_by         UUID NOT NULL REFERENCES users(id),
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes               TEXT
);

-- ============================================================
-- PROJECT ↔ GUIDELINE ACTIVATION (many-to-many)
-- ============================================================

CREATE TABLE project_guideline_activations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    guideline_id        UUID NOT NULL REFERENCES regulatory_guidelines(id) ON DELETE CASCADE,
    numbering_mode      numbering_mode NOT NULL DEFAULT 'ctd',
    clinical_phase      clinical_phase NOT NULL DEFAULT 'phase_1',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    activated_by        UUID NOT NULL REFERENCES users(id),
    activated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, guideline_id)
);

CREATE INDEX idx_pga_project ON project_guideline_activations(project_id);

-- ============================================================
-- ALLOCATION PACKS (output of guideline extraction)
-- ============================================================

CREATE TABLE guideline_allocation_packs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guideline_id        UUID NOT NULL REFERENCES regulatory_guidelines(id) ON DELETE CASCADE,
    version             INTEGER NOT NULL DEFAULT 1,
    rules_json          JSONB NOT NULL,              -- the full allocation JSON contract
    extraction_status   extraction_status NOT NULL DEFAULT 'pending_review',
    extracted_by        UUID REFERENCES users(id),   -- null if auto-extracted
    reviewed_by         UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at         TIMESTAMPTZ
);

CREATE INDEX idx_gap_guideline ON guideline_allocation_packs(guideline_id);

-- ============================================================
-- INDIVIDUAL REGULATORY RULES (denormalized from allocation pack)
-- ============================================================

CREATE TABLE regulatory_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allocation_pack_id  UUID NOT NULL REFERENCES guideline_allocation_packs(id) ON DELETE CASCADE,
    rule_id_code        VARCHAR(100) NOT NULL UNIQUE, -- e.g., "EMA-IMPD-S7-001"
    applies_to          TEXT[] NOT NULL,               -- ['DS'], ['DP'], ['DS','DP']
    mapped_app_sections TEXT[] NOT NULL,               -- ['3.2.S.7', '2.2.1.S.7']
    requirement_level   requirement_level NOT NULL,
    rule_text           TEXT NOT NULL,
    evidence_expected   TEXT[],                        -- ['stability table', 'retest period statement']
    ui_fields_required  TEXT[],                        -- ['ds.retest_period', 'ds.storage_conditions']
    validation_severity regulatory_rule_severity NOT NULL DEFAULT 'WARN',
    validation_logic    TEXT,                          -- declarative rule expression
    -- traceability
    source_page         INTEGER,
    source_section      VARCHAR(500),
    source_snippet      TEXT,                          -- ≤ 25 words excerpt
    -- status
    status              allocation_status NOT NULL DEFAULT 'pending_review',
    override_justification TEXT,                       -- required if status='overridden'
    reviewed_by         UUID REFERENCES users(id),
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rr_pack ON regulatory_rules(allocation_pack_id);
CREATE INDEX idx_rr_applies ON regulatory_rules USING GIN (applies_to);
CREATE INDEX idx_rr_sections ON regulatory_rules USING GIN (mapped_app_sections);

-- ============================================================
-- GLOSSARY (from guideline extraction)
-- ============================================================

CREATE TABLE regulatory_glossary (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allocation_pack_id  UUID NOT NULL REFERENCES guideline_allocation_packs(id) ON DELETE CASCADE,
    term                VARCHAR(500) NOT NULL,
    definition          TEXT NOT NULL,
    source_page         INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RULE EVALUATION LOG (per generation run)
-- ============================================================

CREATE TABLE rule_evaluation_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_run_id   UUID NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
    rule_id             UUID NOT NULL REFERENCES regulatory_rules(id),
    rule_id_code        VARCHAR(100) NOT NULL,
    evaluation_result   VARCHAR(20) NOT NULL,         -- 'PASS', 'FAIL', 'WAIVED'
    severity            regulatory_rule_severity NOT NULL,
    details             TEXT,
    waiver_justification TEXT,                         -- if WAIVED
    evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rel_run ON rule_evaluation_log(generation_run_id);

-- ============================================================
-- EXTEND PROJECT with phase and product characteristics
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS clinical_phase clinical_phase DEFAULT 'phase_1';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS numbering_mode numbering_mode DEFAULT 'ctd';

-- Product characteristics needed for conditional rules
ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_reconstitution BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_multi_dose BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS in_use_stability_required BOOLEAN;  -- null = auto-determine
ALTER TABLE products ADD COLUMN IF NOT EXISTS in_use_stability_justification TEXT; -- if not required, why

-- DS-specific fields driven by guideline rules
ALTER TABLE products ADD COLUMN IF NOT EXISTS retest_period VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS retest_period_justification TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS proposed_storage_conditions VARCHAR(500);
ALTER TABLE products ADD COLUMN IF NOT EXISTS stability_commitment_statement TEXT;

-- DP-specific fields driven by guideline rules
ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf_life VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf_life_justification TEXT;
