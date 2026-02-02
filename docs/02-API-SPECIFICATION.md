# CTD Stability Document Generator — API Specification

**Base URL:** `/api/v1`
**Auth:** Bearer JWT token in `Authorization` header

---

## Authentication

### POST /auth/login
```json
// Request
{ "email": "author@example.com", "password": "..." }

// Response 200
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": { "id": "uuid", "email": "...", "display_name": "...", "role": "author" }
}
```

---

## Projects

### GET /projects
List all projects accessible to the current user.
```json
// Response 200
{
  "items": [
    {
      "id": "uuid",
      "name": "Product X Stability Submission",
      "status": "draft",
      "created_by": { "id": "uuid", "display_name": "Jane Doe" },
      "document_count": 5,
      "created_at": "2026-01-15T10:00:00Z",
      "updated_at": "2026-01-28T14:30:00Z"
    }
  ],
  "total": 1
}
```

### POST /projects
```json
// Request
{
  "name": "Product X Stability Submission",
  "description": "CTD Module 3 stability sections for Product X",
  "product": {
    "product_type": "drug_product",
    "product_name": "Product X 100 mg/mL",
    "dosage_form": "Solution for injection",
    "ctd_section": "3.2.P.8"
  }
}

// Response 201
{ "id": "uuid", "name": "...", "status": "draft", ... }
```

### GET /projects/{project_id}
### PUT /projects/{project_id}
### DELETE /projects/{project_id}

---

## Documents

### POST /projects/{project_id}/documents
Upload and classify a document. Multipart form data.

```
Content-Type: multipart/form-data

Fields:
  file: (binary)
  classification: "stability_report"
  notes: "Final stability report for lots 001-003"
```

```json
// Response 201
{
  "id": "uuid",
  "filename": "stability_report_v2.pdf",
  "file_type": "pdf",
  "classification": "stability_report",
  "authority": "authoritative",
  "checksum_sha256": "abc123...",
  "file_size_bytes": 2456789,
  "uploaded_at": "2026-01-29T09:00:00Z"
}
```

### GET /projects/{project_id}/documents
```json
// Query params: ?classification=stability_report&authority=authoritative
// Response 200
{
  "items": [ { "id": "uuid", "filename": "...", "classification": "...", ... } ],
  "total": 5
}
```

### PUT /projects/{project_id}/documents/{document_id}
Reclassify or update notes.

### DELETE /projects/{project_id}/documents/{document_id}

---

## Extraction

### POST /projects/{project_id}/extract
Trigger extraction on all authoritative documents (or specify document IDs).

```json
// Request
{
  "document_ids": ["uuid1", "uuid2"],  // optional; if omitted, all authoritative docs
  "options": {
    "ocr_enabled": false,
    "table_template_matching": true
  }
}

// Response 202
{
  "extraction_job_id": "uuid",
  "status": "running",
  "message": "Extraction started for 2 documents"
}
```

### GET /projects/{project_id}/extract/{job_id}
Poll extraction job status.

```json
// Response 200
{
  "job_id": "uuid",
  "status": "completed",  // running, completed, failed
  "progress": { "documents_processed": 2, "documents_total": 2 },
  "summary": {
    "studies_found": 3,
    "lots_found": 8,
    "conditions_found": 4,
    "attributes_found": 25,
    "results_found": 1200,
    "low_confidence_count": 15
  }
}
```

---

## Studies

### GET /projects/{project_id}/studies
```json
// Response 200
{
  "items": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "study_type": "accelerated",
      "study_label": "Accelerated Stability Study",
      "start_date": "2024-06-01",
      "sites": ["Site A", "Site B"],
      "manufacturers": ["Acme Biologics"],
      "extraction_status": "confirmed",
      "confidence": 0.95,
      "source_anchors": [
        { "document_name": "stability_report.pdf", "page": 3, "snippet": "..." }
      ]
    }
  ]
}
```

### PUT /projects/{project_id}/studies/{study_id}
Edit extracted study data. Audit-logged.

```json
// Request
{
  "study_label": "Accelerated Stability Study (Updated)",
  "extraction_status": "confirmed"
}
```

### POST /projects/{project_id}/studies
Manually add a study record.

---

## Lots

### GET /projects/{project_id}/lots
```json
// Query params: ?study_id=uuid
// Response 200
{
  "items": [
    {
      "id": "uuid",
      "study_id": "uuid",
      "lot_number": "LOT-2025-001",
      "manufacturer": "Acme Biologics",
      "manufacturing_site": "Site A",
      "intended_use": "clinical",
      "lot_use_label": "Clinical Supply (Phase 3)",
      "extraction_status": "pending_review",
      "confidence": 0.88
    }
  ]
}
```

### PUT /projects/{project_id}/lots/{lot_id}
### POST /projects/{project_id}/lots

---

## Storage Conditions

### GET /projects/{project_id}/conditions
```json
{
  "items": [
    {
      "id": "uuid",
      "label": "-20 ± 5 °C",
      "temperature_setpoint": -20,
      "tolerance": "± 5 °C",
      "humidity": null,
      "display_order": 1,
      "extraction_status": "confirmed"
    }
  ]
}
```

### PUT /projects/{project_id}/conditions/{condition_id}
### POST /projects/{project_id}/conditions

---

## Quality Attributes / Assays

### GET /projects/{project_id}/attributes
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Visual Appearance",
      "method_group": "Appearance",
      "analytical_procedure": "Visual inspection",
      "display_order": 1,
      "acceptance_criteria": [
        { "id": "uuid", "criteria_text": "Clear to slightly opalescent", "criteria_type": "conforms" }
      ]
    }
  ]
}
```

### PUT /projects/{project_id}/attributes/{attribute_id}
### POST /projects/{project_id}/attributes

---

## Results

### GET /projects/{project_id}/results
```json
// Query params: ?lot_id=uuid&condition_id=uuid&attribute_id=uuid
// Response 200
{
  "items": [
    {
      "id": "uuid",
      "lot_id": "uuid",
      "condition_id": "uuid",
      "timepoint_id": "uuid",
      "attribute_id": "uuid",
      "value_text": "Meets",
      "value_numeric": null,
      "status": "S",
      "unit": null,
      "confidence": 0.92,
      "extraction_status": "confirmed",
      "source_anchors": [ { "document_name": "...", "page": 12, "snippet": "..." } ]
    }
  ],
  "total": 500,
  "page": 1,
  "page_size": 100
}
```

### GET /projects/{project_id}/results/pivot
Pivoted view: rows = attributes, columns = timepoints, filtered by lot + condition.

```json
// Query params: ?lot_id=uuid&condition_id=uuid
// Response 200
{
  "lot": { "lot_number": "LOT-2025-001" },
  "condition": { "label": "-20 ± 5 °C" },
  "timepoints": ["T0", "1W", "2W", "1M", "2M", "3M"],
  "rows": [
    {
      "attribute": { "name": "Visual Appearance", "method_group": "Appearance" },
      "acceptance_criteria": "Clear to slightly opalescent",
      "values": {
        "T0": { "value": "Meets", "status": "S", "confidence": 0.95 },
        "1W": { "value": "Meets", "status": "S", "confidence": 0.93 },
        "2W": { "value": null, "status": "Pending", "confidence": null }
      }
    }
  ]
}
```

### PUT /projects/{project_id}/results/{result_id}
### POST /projects/{project_id}/results
### DELETE /projects/{project_id}/results/{result_id}

---

## Timepoints

### GET /projects/{project_id}/timepoints
### POST /projects/{project_id}/timepoints
### PUT /projects/{project_id}/timepoints/{timepoint_id}
### DELETE /projects/{project_id}/timepoints/{timepoint_id}

---

## Validation

### POST /projects/{project_id}/validate
Run all validation checks.

```json
// Response 200
{
  "run_id": "uuid",
  "timestamp": "2026-01-29T10:00:00Z",
  "overall_status": "FAIL",
  "hard_failures": [
    {
      "rule_id": "V-08",
      "rule_name": "Source anchor required",
      "message": "3 result cells have no source anchor and no author-narrative justification",
      "severity": "hard",
      "affected_entities": [
        { "type": "result", "id": "uuid", "description": "Lot LOT-001, T3M, pH" }
      ]
    }
  ],
  "warnings": [
    {
      "rule_id": "W-01",
      "rule_name": "Low confidence values",
      "message": "12 values have confidence < 0.6",
      "severity": "soft",
      "affected_entities": [ ... ]
    }
  ],
  "passed": [
    { "rule_id": "V-01", "rule_name": "Product name set", "severity": "hard" },
    { "rule_id": "V-02", "rule_name": "At least one study", "severity": "hard" }
  ]
}
```

---

## Generation

### POST /projects/{project_id}/generate
Trigger document generation.

```json
// Request
{
  "sections": {
    "ds_blanked": true,
    "dp_generate": true,      // false = link-only
    "dp_link_only": false
  },
  "included_conditions": ["uuid1", "uuid2", "uuid3"],
  "included_lots": ["uuid1", "uuid2"],
  "redaction_policy_id": "uuid",
  "styling_profile_id": "uuid",
  "table_numbering": {
    "dp_prefix": "3.2.P.8.3",
    "ds_prefix": "3.2.S.7"
  },
  "output_formats": ["docx", "pdf"],
  "include_traceability": true
}

// Response 202
{
  "generation_run_id": "uuid",
  "status": "running"
}
```

### GET /projects/{project_id}/generate/{run_id}
Poll generation status.

```json
// Response 200 (completed)
{
  "run_id": "uuid",
  "status": "completed",
  "outputs": {
    "docx": "/api/v1/projects/{id}/generate/{run_id}/download/docx",
    "pdf": "/api/v1/projects/{id}/generate/{run_id}/download/pdf",
    "traceability_json": "/api/v1/projects/{id}/generate/{run_id}/download/traceability.json",
    "traceability_table": "/api/v1/projects/{id}/generate/{run_id}/download/traceability.xlsx"
  },
  "validation_result": { ... },
  "created_at": "2026-01-29T10:05:00Z",
  "completed_at": "2026-01-29T10:06:30Z"
}
```

### GET /projects/{project_id}/generate/{run_id}/download/{format}
Download generated file. Returns binary with appropriate Content-Type.

---

## Redaction Policies

### GET /redaction-policies
### POST /redaction-policies
```json
// Request
{
  "name": "DS Default Blanked",
  "placeholder_token": "[REDACTED]",
  "rules": [
    {
      "type": "always_redact",
      "target_fields": ["lot_number", "manufacturer", "manufacturing_site"],
      "scope": "ds_only"
    },
    {
      "type": "regex",
      "pattern": "LOT-\\d{4}-\\d{3}",
      "replacement": "[LOT-REDACTED]"
    }
  ]
}
```

### PUT /redaction-policies/{policy_id}
### DELETE /redaction-policies/{policy_id}

---

## Audit Log

### GET /projects/{project_id}/audit-log
```json
// Query params: ?entity_type=result&entity_id=uuid&from=2026-01-01&to=2026-01-29
// Response 200
{
  "items": [
    {
      "id": "uuid",
      "user": { "display_name": "Jane Doe" },
      "action": "update",
      "entity_type": "result",
      "entity_id": "uuid",
      "old_value": { "value_text": "97.5", "status": "S" },
      "new_value": { "value_text": "97.8", "status": "S" },
      "created_at": "2026-01-28T14:35:00Z"
    }
  ]
}
```

---

## Styling Profiles

### GET /styling-profiles
### POST /styling-profiles
### PUT /styling-profiles/{profile_id}
