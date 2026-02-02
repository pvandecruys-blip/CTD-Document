# CTD Stability Document Generator — Regulatory Library & Allocation Addendum

**Version:** 1.0
**Date:** 2026-01-29
**Extends:** 01-PRD-AND-SYSTEM-DESIGN.md

---

## 1. Feature Overview

The **Regulatory Library & Allocation** module adds a new capability: the user can attach authoritative regulatory guideline PDFs (e.g., EMA IMPD Quality guideline), extract stability-related obligations, and convert them into enforceable, traceable rules that drive the app's validation engine and generation wizard.

**Important constraint:** This is a decision-support system. It does NOT replace regulatory judgment. All extracted rules require human review, and all enforcement rules support explicit waivers with mandatory justification.

---

## 2. Scope of Extraction

Only stability-relevant requirements are extracted:

| Topic Area                     | DS (3.2.S.7)       | DP (3.2.P.8)       |
|-------------------------------|---------------------|---------------------|
| Stability data presentation   | Required            | Required            |
| Retest period / Shelf life    | Retest period       | Shelf life          |
| Storage conditions            | Required            | Required            |
| Accelerated studies           | Required            | Required            |
| Long-term studies             | Required            | Required            |
| Stress testing                | Recommended         | Recommended         |
| Photostability                | Recommended         | Recommended         |
| In-use stability              | N/A                 | Conditional         |
| Stability commitment          | Required            | Required            |
| Phase-based expectations      | Phase I vs II/III   | Phase I vs II/III   |

---

## 3. Data Model Extension

### New Tables (Migration 002)

| Table                            | Purpose                                                |
|----------------------------------|--------------------------------------------------------|
| `regulatory_guidelines`          | Immutable guideline document storage                   |
| `project_guideline_activations`  | Many-to-many: which guidelines are active per project  |
| `guideline_allocation_packs`     | Versioned extraction output (full rules JSON)          |
| `regulatory_rules`              | Individual denormalized rules with traceability        |
| `regulatory_glossary`           | Extracted terms and definitions                        |
| `rule_evaluation_log`           | Per-generation-run rule evaluation audit trail         |

### Extended Columns on Existing Tables

| Table      | New Columns                                                        |
|------------|---------------------------------------------------------------------|
| `projects` | `clinical_phase`, `numbering_mode`                                 |
| `products` | `requires_reconstitution`, `is_multi_dose`, `in_use_stability_required`, `in_use_stability_justification`, `retest_period`, `retest_period_justification`, `proposed_storage_conditions`, `stability_commitment_statement`, `shelf_life`, `shelf_life_justification` |

---

## 4. Allocation Pipeline

```
Guideline PDF
     │
     ▼
┌─────────────────────┐
│ 1. PDF Text Extract  │  pdfplumber: full text with page numbers
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 2. Section Detection │  Regex heading pattern → structured sections
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 3. Stability Filter  │  Keep only sections with stability keywords
│                      │  (stability, retest, shelf life, accelerated, etc.)
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 4. Clause Segment    │  Split into sentence-level clauses
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 5. MUST/SHOULD/MAY   │  Priority-ordered regex detection:
│    Detection         │  MUST > SHOULD > MAY
│                      │  Also: "shall", "is required", "mandatory",
│                      │  "recommended", "may", "if applicable"
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 6. DS/DP Assignment  │  Pattern matching: 3.2.S.7, drug substance,
│                      │  retest → DS; 3.2.P.8, drug product,
│                      │  shelf life → DP; generic → both
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 7. Rule Structuring  │  Assign rule IDs, map to UI fields,
│                      │  infer evidence expected, generate
│                      │  validation logic expressions
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 8. Traceability Link │  Each rule → (page, section heading,
│                      │  ≤25-word excerpt snippet)
└──────────┬──────────┘
           ▼
  AllocationPack (JSON) → stored in DB as pending_review
```

### Confidence and Human Review

All extracted rules land as `pending_review`. The user must:
1. Review each rule in the UI
2. Confirm, reject, or override (with justification)
3. Only `confirmed` rules are enforced during generation

---

## 5. Rule Engine Integration

### Integration Points

```
┌──────────────┐     ┌────────────────────┐     ┌──────────────────┐
│ Generation   │────▶│ Validation Engine   │────▶│ Rule Engine      │
│ Wizard       │     │ (existing V-01..11) │     │ (new: guideline  │
│ Step 3       │     │                     │     │  rules + phase   │
│              │     │ + Rule Engine       │     │  + conditional)  │
│              │     │   evaluation        │     │                  │
└──────────────┘     └────────────────────┘     └──────────────────┘
                              │
                              ▼
                     ┌────────────────────┐
                     │ RuleEvaluationLog  │  stored per generation run
                     │ (audit trail)      │
                     └────────────────────┘
```

### Rule Evaluation Flow

1. Load active guidelines for the project
2. Load confirmed rules from the latest allocation pack
3. Build `ProjectContext` from DB (product characteristics, study presence, field values)
4. Check for waivers
5. Evaluate each rule:
   - Parse `validation_logic` expression
   - Check `field_present()` conditions against context
   - Return PASS / FAIL / WAIVED
6. Evaluate built-in conditional rules:
   - In-use stability (reconstitution/multi-dose)
7. Evaluate phase-specific rules:
   - Phase I: commitment + initiated study + partial results OK
   - Phase II/III: accelerated + long-term results required
8. Aggregate into `RuleEngineReport`
9. If any BLOCK failures → generation blocked

### Validation Logic Expressions

Rules use a simple declarative syntax:

```
field_present('ds.retest_period')
field_present('ds.retest_period') AND field_present('ds.storage_conditions')
IF product.requires_reconstitution THEN field_present('dp.in_use_stability')
manual_review_required
```

### Field Path Registry

| Field Path                    | Maps To                                    |
|-------------------------------|---------------------------------------------|
| `ds.retest_period`            | Product.retest_period (not null/empty)       |
| `ds.storage_conditions`       | Product.proposed_storage_conditions          |
| `ds.stability_commitment`     | Product.stability_commitment_statement       |
| `ds.study_accelerated`        | Study exists with type=accelerated           |
| `ds.study_long_term`          | Study exists with type=long_term             |
| `ds.study_stress`             | Study exists with type=stress                |
| `ds.study_photostability`     | Study exists with type=photostability        |
| `ds.stability_table`          | Results exist for DS product                 |
| `ds.lot_information`          | Lot count > 0                               |
| `dp.shelf_life`               | Product.shelf_life                           |
| `dp.in_use_stability`         | In-use study exists                          |
| `dp.storage_conditions`       | Product.proposed_storage_conditions          |
| `dp.stability_commitment`     | Product.stability_commitment_statement       |
| `dp.study_accelerated`        | Study exists with type=accelerated           |
| `dp.study_long_term`          | Study exists with type=long_term             |
| `dp.stability_table`          | Results exist for DP product                 |
| `dp.lot_information`          | Lot count > 0                               |

---

## 6. Default EMA IMPD Rules

The application ships with a pre-built allocation pack for the EMA IMPD Quality guideline containing 14 rules:

### DS Rules (3.2.S.7 / 2.2.1.S.7)

| Rule ID            | Level  | Summary                                    | Severity |
|--------------------|--------|--------------------------------------------|----------|
| EMA-IMPD-S7-001   | MUST   | Stability data + tabulated summary         | BLOCK    |
| EMA-IMPD-S7-002   | MUST   | Retest period + storage conditions stated  | BLOCK    |
| EMA-IMPD-S7-003   | SHOULD | Accelerated + long-term studies initiated  | WARN     |
| EMA-IMPD-S7-004   | MUST   | Ongoing stability commitment               | BLOCK    |
| EMA-IMPD-S7-005   | SHOULD | Stress testing data available              | WARN     |

### DP Rules (3.2.P.8 / 2.2.1.P.8)

| Rule ID            | Level  | Summary                                    | Severity |
|--------------------|--------|--------------------------------------------|----------|
| EMA-IMPD-P8-001   | MUST   | Stability data + tabulated summary         | BLOCK    |
| EMA-IMPD-P8-002   | MUST   | Shelf-life + storage conditions stated     | BLOCK    |
| EMA-IMPD-P8-003   | SHOULD | Accelerated + long-term ICH-compliant      | WARN     |
| EMA-IMPD-P8-004   | MUST   | In-use stability (if reconst./multi-dose)  | BLOCK    |
| EMA-IMPD-P8-005   | SHOULD | Photostability per ICH Q1B                 | WARN     |
| EMA-IMPD-P8-006   | MUST   | Ongoing stability commitment               | BLOCK    |

### General Rules (both DS + DP)

| Rule ID            | Level  | Summary                                    | Severity |
|--------------------|--------|--------------------------------------------|----------|
| EMA-IMPD-GEN-001  | MUST   | Storage conditions described per ICH Q1A   | BLOCK    |
| EMA-IMPD-GEN-002  | SHOULD | Stability spec consistent with release     | WARN     |
| EMA-IMPD-GEN-003  | MUST   | Batch info (number, size, site, date)      | BLOCK    |

### Built-in Phase Rules

| Rule ID              | Phase     | Summary                                    | Severity |
|----------------------|-----------|--------------------------------------------|----------|
| PHASE-I-COMMIT       | Phase I   | Stability commitment statement required    | BLOCK    |
| PHASE-I-STUDY        | Phase I   | ≥1 study initiated (accelerated/LT)       | BLOCK    |
| PHASE-I-RESULTS      | Phase I   | Results tabulated (or justified)           | WARN     |
| PHASE-II-III-ACCEL   | Phase II+ | Accelerated results table present          | BLOCK    |
| PHASE-II-III-LT      | Phase II+ | Long-term results table present            | BLOCK    |

### Built-in Conditional Rules

| Rule ID           | Condition                             | Summary                      | Severity |
|-------------------|---------------------------------------|------------------------------|----------|
| COND-INUSE-001    | reconstitution OR multi-dose          | In-use stability mandatory   | BLOCK    |

---

## 7. UX: Regulatory Library Module

### Screen 7: Regulatory Library (new tab)

**Layout:**
- Top: "Upload Guideline" button
- Main area: table of uploaded guidelines with columns:
  - Title, Agency, Version, Publication Date, Status (active/inactive), Allocation Packs count, Actions
- Click a guideline row to expand details:
  - File info (checksum, size, upload date)
  - "Allocate" button → triggers extraction
  - List of allocation pack versions

### Screen 8: Allocation Review (new sub-screen)

**Layout:**
- Three tabs: **Checklist** | **Rules JSON** | **Mapping Table**

**Checklist tab:**
- Split view: DS rules (left) and DP rules (right)
- Each rule shows:
  - Rule ID badge (e.g., `EMA-IMPD-S7-001`)
  - Requirement level badge (MUST=red, SHOULD=amber, MAY=green)
  - Rule text
  - Evidence expected (chips)
  - "View Source" button → opens PDF viewer at the source page
  - Status dropdown: Pending Review → Confirm / Reject / Override
  - If Override: mandatory justification text field

**Rules JSON tab:**
- Read-only JSON viewer (syntax highlighted)
- "Download JSON" button

**Mapping Table tab:**
- Columns: Guideline Clause | Rule ID | App Section | Required UI Fields | Validation Severity
- Filterable by DS/DP, MUST/SHOULD/MAY
- "Download XLSX" button

### Screen 9: Project Guideline Activation (in project settings)

- "Activate Guideline" button
- Modal:
  - Select guideline from dropdown (only those with confirmed allocation packs)
  - Choose numbering mode: CTD (3.2.S.7/3.2.P.8) vs IMPD (2.2.1.S.7/2.2.1.P.8)
  - Choose clinical phase: Phase I / Phase II / Phase III / Post-approval
- Active guidelines listed with deactivation option

### Generation Wizard Updates

**Step 3 (Validate) — Enhanced:**
- New section: "Regulatory Rule Evaluation"
- Shows:
  - Blocking failures (red) with rule ID, text, affected fields
  - Warnings (amber) with same detail
  - Waivers (blue) showing waived rules with justifications
  - Passes (green) count
- "Add Waiver" button per failed rule → opens justification modal
- Cannot proceed to generate if any BLOCK failures remain (unless waived)

### Required Field Indicators

When a guideline is activated for a project, the extraction review UI shows:
- **Required field badges** next to fields that are required by active rules
- Example: "Retest Period" field shows a red "MUST (EMA-IMPD-S7-002)" badge if not yet filled
- Hovering the badge shows the full rule text and "View Source" link

---

## 8. IMPD Numbering Mode

When the user activates a guideline in IMPD mode:
- Section headings use IMPD numbering: `2.2.1.S.7` instead of `3.2.S.7`
- Table numbering uses IMPD prefix: `Table 2.2.1.P.8-1` instead of `Table 3.2.P.8-1`
- Both numbering formats are stored; generation uses the active mode
- The mapping table shows both CTD and IMPD equivalents

---

## 9. API Endpoints (New)

| Method | Endpoint                                                  | Description                           |
|--------|-----------------------------------------------------------|---------------------------------------|
| GET    | `/regulatory/guidelines`                                  | List all guidelines                   |
| POST   | `/regulatory/guidelines`                                  | Upload a guideline                    |
| GET    | `/regulatory/guidelines/{id}`                             | Get guideline details                 |
| DELETE | `/regulatory/guidelines/{id}`                             | Delete (if no active project links)   |
| POST   | `/regulatory/guidelines/{id}/allocate`                    | Trigger allocation extraction         |
| GET    | `/regulatory/guidelines/{id}/allocate/{job_id}`           | Poll extraction status                |
| GET    | `/regulatory/guidelines/{id}/allocation-packs`            | List allocation pack versions         |
| GET    | `/regulatory/guidelines/{id}/allocation-packs/{pack_id}`  | Get pack with rules                   |
| GET    | `/regulatory/guidelines/{id}/allocation-packs/{id}/download` | Download (JSON/checklist/mapping)  |
| GET    | `/regulatory/guidelines/{id}/rules`                       | List rules (filterable)               |
| GET    | `/regulatory/guidelines/{id}/rules/{rule_id}`             | Get rule + traceability               |
| PUT    | `/regulatory/guidelines/{id}/rules/{rule_id}/status`      | Confirm/reject/override rule          |
| POST   | `/projects/{id}/regulatory/activate`                      | Activate guideline for project        |
| GET    | `/projects/{id}/regulatory/activations`                   | List active guidelines                |
| DELETE | `/projects/{id}/regulatory/activate/{activation_id}`      | Deactivate                            |
| POST   | `/projects/{id}/regulatory/evaluate`                      | Run rule evaluation                   |
| POST   | `/projects/{id}/regulatory/waivers`                       | Add waiver with justification         |
| GET    | `/projects/{id}/regulatory/waivers`                       | List active waivers                   |
| DELETE | `/projects/{id}/regulatory/waivers/{rule_id_code}`        | Remove waiver                         |
| GET    | `/regulatory/guidelines/{id}/glossary`                    | Get regulatory glossary               |

---

## 10. Updated Phased Implementation Plan

### Phase 2.5: Regulatory Library (new — between Phase 2 and Phase 3)

**Deliverables:**
1. DB migration 002 (regulatory tables + product extensions)
2. Guideline upload + immutable storage
3. Allocation extraction pipeline
4. Rule review UI (checklist + JSON + mapping views)
5. Project guideline activation with numbering mode + phase selection
6. Rule engine integration into validation
7. Phase-based and conditional rule evaluation
8. Waiver management
9. Default EMA IMPD rules JSON (shipped with app)
10. Generation wizard enhancement (rule evaluation display)

**Dependencies:**
- Requires Phase 1 (extraction + review) to be complete
- Requires Phase 2 (generation + validation) to be at least in progress

---

## 11. Traceability Requirements

Every extracted rule stores:

```json
{
  "traceability": {
    "source_file_id": "uuid of the uploaded guideline",
    "page": 42,
    "section_heading": "3.2.S.7 Stability",
    "excerpt_snippet": "Stability data on drug substance batches used in the clinical trial must be provided..."
  }
}
```

In the UI:
- Each rule has a "View Source" button
- Clicking it opens the PDF viewer pane at the exact page
- The section heading and excerpt are displayed as a tooltip
- The rule evaluation log (per generation run) links each evaluation back to the rule and its source

This ensures full audit trail from generated document → validation check → regulatory rule → guideline page.
