/**
 * TypeScript type definitions for the CTD Stability Document Generator frontend.
 */

// ── Enums ──────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'author' | 'reviewer' | 'viewer';

export type DocumentClassification =
  | 'stability_plan'
  | 'stability_report'
  | 'coa'
  | 'technical_report'
  | 'other_supporting';

export type NumberingMode = 'ctd' | 'impd';

export type ClinicalPhase = 'phase_1' | 'phase_2' | 'phase_3' | 'post_approval';

export type RequirementLevel = 'MUST' | 'SHOULD' | 'MAY';

export type RuleSeverity = 'BLOCK' | 'WARN';

export type AllocationStatus = 'pending_review' | 'confirmed' | 'rejected' | 'overridden';

export type DocumentAuthority = 'authoritative' | 'supporting';

export type ExtractionStatus = 'pending_review' | 'confirmed' | 'rejected' | 'manually_added';

export type StudyType = 'accelerated' | 'long_term' | 'intermediate' | 'stress' | 'photostability' | 'other';

export type ProductType = 'drug_substance' | 'drug_product';

export type GenerationStatus = 'pending' | 'running' | 'completed' | 'failed';

export type TimepointUnit = 'hour' | 'day' | 'week' | 'month' | 'year';

// ── Core entities ──────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  clinical_phase?: ClinicalPhase;
  numbering_mode?: NumberingMode;
  created_by: UserSummary;
  document_count: number;
  created_at: string;
  updated_at: string;
}

export interface UserSummary {
  id: string;
  display_name: string;
  role: UserRole;
}

export interface DocumentFile {
  id: string;
  filename: string;
  original_filename: string;
  file_type: string;
  classification: DocumentClassification;
  authority: DocumentAuthority;
  checksum_sha256: string;
  file_size_bytes: number;
  uploaded_at: string;
  notes?: string;
}

export interface SourceAnchor {
  document_name: string;
  page?: number;
  section_ref?: string;
  table_ref?: string;
  snippet?: string;
}

export interface Study {
  id: string;
  product_id: string;
  study_type: StudyType;
  study_label?: string;
  protocol_id?: string;
  start_date?: string;
  sites: string[];
  manufacturers: string[];
  extraction_status: ExtractionStatus;
  confidence?: number;
  source_anchors: SourceAnchor[];
}

export interface Lot {
  id: string;
  study_id: string;
  lot_number: string;
  manufacturer?: string;
  manufacturing_site?: string;
  intended_use?: string;
  lot_use_label?: string;
  extraction_status: ExtractionStatus;
  confidence?: number;
}

export interface StorageCondition {
  id: string;
  label: string;
  temperature_setpoint?: number;
  tolerance?: string;
  humidity?: string;
  display_order: number;
  extraction_status: ExtractionStatus;
  confidence?: number;
}

export interface Timepoint {
  id: string;
  value: number;
  unit: TimepointUnit;
  label: string;
  sort_order: number;
}

export interface QualityAttribute {
  id: string;
  name: string;
  method_group?: string;
  analytical_procedure?: string;
  display_order: number;
  acceptance_criteria: AcceptanceCriteria[];
  extraction_status: ExtractionStatus;
  confidence?: number;
}

export interface AcceptanceCriteria {
  id: string;
  criteria_text: string;
  criteria_type?: string;
  lower_limit?: number;
  upper_limit?: number;
  unit?: string;
}

export interface Result {
  id: string;
  lot_id: string;
  condition_id: string;
  timepoint_id: string;
  attribute_id: string;
  value_text?: string;
  value_numeric?: number;
  status?: string;
  unit?: string;
  confidence?: number;
  extraction_status: ExtractionStatus;
  is_author_narrative: boolean;
  source_anchors: SourceAnchor[];
}

// ── Pivoted result view ────────────────────────────────────────────

export interface PivotedResultRow {
  attribute: {
    name: string;
    method_group?: string;
  };
  acceptance_criteria?: string;
  values: Record<string, {
    value?: string;
    status?: string;
    confidence?: number;
  }>;
}

export interface PivotedResultView {
  lot: Lot;
  condition: StorageCondition;
  timepoints: string[];
  rows: PivotedResultRow[];
}

// ── Generation ─────────────────────────────────────────────────────

export interface GenerationOptions {
  sections: {
    ds_blanked: boolean;
    dp_generate: boolean;
    dp_link_only: boolean;
  };
  included_conditions: string[];
  included_lots: string[];
  redaction_policy_id?: string;
  styling_profile_id?: string;
  table_numbering?: {
    dp_prefix: string;
    ds_prefix: string;
  };
  output_formats: string[];
  include_traceability: boolean;
}

export interface GenerationRun {
  run_id: string;
  status: GenerationStatus;
  outputs?: {
    pdf?: string;
    html?: string;
    traceability_json?: string;
  };
  validation_result?: ValidationReport;
  token_usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  created_at: string;
  completed_at?: string;
}

// ── Validation ─────────────────────────────────────────────────────

export interface ValidationCheck {
  rule_id: string;
  rule_name: string;
  severity: 'hard' | 'soft';
  status: 'pass' | 'fail' | 'warning';
  message?: string;
  affected_entities?: {
    type: string;
    id: string;
    description: string;
  }[];
}

export interface ValidationReport {
  run_id: string;
  timestamp: string;
  overall_status: string;
  hard_failures: ValidationCheck[];
  warnings: ValidationCheck[];
  passed: ValidationCheck[];
}

// ── Redaction ──────────────────────────────────────────────────────

export interface RedactionRule {
  type: 'always_redact' | 'regex' | 'threshold' | 'role_based';
  target_fields?: string[];
  pattern?: string;
  replacement?: string;
  scope?: string;
  condition?: string;
  visible_to_roles?: string[];
  hidden_from_roles?: string[];
}

export interface RedactionPolicy {
  id: string;
  name: string;
  placeholder_token: string;
  rules: RedactionRule[];
  is_default: boolean;
}

// ── Audit ──────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  user: UserSummary;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  created_at: string;
}

// ── Extraction job ─────────────────────────────────────────────────

export interface ExtractionJob {
  job_id: string;
  status: 'running' | 'completed' | 'failed';
  progress?: {
    documents_processed: number;
    documents_total: number;
  };
  summary?: {
    studies_found: number;
    lots_found: number;
    conditions_found: number;
    attributes_found: number;
    results_found: number;
    low_confidence_count: number;
  };
}

// ── Regulatory Library ─────────────────────────────────────────────

export interface RegulatoryGuideline {
  id: string;
  title: string;
  agency: string;
  document_id?: string;
  version?: string;
  publication_date?: string;
  is_active: boolean;
  original_filename: string;
  file_checksum_sha256: string;
  allocation_pack_count: number;
  uploaded_at: string;
}

export interface GuidelineAllocationPack {
  id: string;
  guideline_id: string;
  version: number;
  extraction_status: ExtractionStatus;
  rules_count: number;
  created_at: string;
  reviewed_at?: string;
}

export interface RegulatoryRuleTraceability {
  source_file_id: string;
  page: number;
  section_heading: string;
  excerpt_snippet: string;
}

export interface RegulatoryRule {
  id: string;
  rule_id_code: string;
  applies_to: string[];               // ["DS"], ["DP"], ["DS","DP"]
  mapped_app_sections: string[];       // ["3.2.S.7", "2.2.1.S.7"]
  requirement_level: RequirementLevel;
  rule_text: string;
  evidence_expected: string[];
  ui_fields_required: string[];
  validation_severity: RuleSeverity;
  validation_logic: string;
  traceability: RegulatoryRuleTraceability;
  status: AllocationStatus;
  override_justification?: string;
}

export interface RegulatoryGlossaryEntry {
  id: string;
  term: string;
  definition: string;
  source_page?: number;
}

export interface ProjectGuidelineActivation {
  id: string;
  project_id: string;
  guideline_id: string;
  guideline_title: string;
  numbering_mode: NumberingMode;
  clinical_phase: ClinicalPhase;
  is_active: boolean;
  activated_at: string;
}

export interface RuleEvaluation {
  rule_id: string;
  rule_id_code: string;
  result: 'PASS' | 'FAIL' | 'WAIVED';
  severity: RuleSeverity;
  details: string;
  waiver_justification?: string;
}

export interface RuleEvaluationReport {
  timestamp: string;
  can_proceed: boolean;
  blocking_failures: RuleEvaluation[];
  warnings: RuleEvaluation[];
  passes: RuleEvaluation[];
  waivers: RuleEvaluation[];
}

export interface RuleWaiver {
  rule_id_code: string;
  justification: string;
  created_at: string;
  created_by: UserSummary;
}

// Guideline allocation pack JSON contract (full download format)
export interface AllocationPackJSON {
  guideline_metadata: {
    title: string;
    agency: string;
    document_id: string;
    version: string;
    publication_date: string;
    file_checksum: string;
    source_file_id: string;
  };
  rules: Array<{
    rule_id: string;
    applies_to: string[];
    mapped_app_sections: string[];
    requirement_level: RequirementLevel;
    rule_text: string;
    evidence_expected: string[];
    ui_fields_required: string[];
    validation: {
      severity: RuleSeverity;
      logic: string;
    };
    traceability: RegulatoryRuleTraceability;
  }>;
  glossary: Array<{
    term: string;
    definition: string;
    source_page: number;
  }>;
}
