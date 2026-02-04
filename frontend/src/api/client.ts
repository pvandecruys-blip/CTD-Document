/**
 * Client-side storage using localStorage.
 * All data is stored in the browser - no backend required.
 */

import type {
  Project,
  DocumentFile,
  DocumentClassification,
  Study,
  Lot,
  StorageCondition,
  QualityAttribute,
  GenerationRun,
  GenerationStatus,
  RegulatoryGuideline,
  RegulatoryRule,
  AllocationStatus,
  ExtractionJob,
  ValidationReport,
} from '../types';

// ── Storage Keys ────────────────────────────────────────────────────
const STORAGE_KEYS = {
  PROJECTS: 'ctd_projects',
  DOCUMENTS: 'ctd_documents',
  STUDIES: 'ctd_studies',
  LOTS: 'ctd_lots',
  CONDITIONS: 'ctd_conditions',
  ATTRIBUTES: 'ctd_attributes',
  GENERATION_RUNS: 'ctd_generation_runs',
  GUIDELINES: 'ctd_guidelines',
  RULES: 'ctd_rules',
};

// ── Helpers ─────────────────────────────────────────────────────────
function getStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.warn('localStorage write failed');
  }
}

function delay(ms = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Projects ────────────────────────────────────────────────────────
export const projects = {
  list: async () => {
    await delay();
    const items = getStorage<Project[]>(STORAGE_KEYS.PROJECTS, []);
    return { items, total: items.length };
  },

  get: async (id: string) => {
    await delay();
    const items = getStorage<Project[]>(STORAGE_KEYS.PROJECTS, []);
    const project = items.find((p) => p.id === id);
    if (!project) throw new Error('Project not found');
    return project;
  },

  create: async (data: { name: string; description?: string }) => {
    await delay();
    const items = getStorage<Project[]>(STORAGE_KEYS.PROJECTS, []);
    const newProject: Project = {
      id: generateId('proj'),
      name: data.name,
      description: data.description,
      status: 'draft',
      clinical_phase: 'phase_1',
      numbering_mode: 'ctd',
      created_by: { id: 'user-1', display_name: 'Local User', role: 'author' },
      document_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    items.unshift(newProject);
    setStorage(STORAGE_KEYS.PROJECTS, items);
    return newProject;
  },

  delete: async (id: string) => {
    await delay();
    const items = getStorage<Project[]>(STORAGE_KEYS.PROJECTS, []);
    const filtered = items.filter((p) => p.id !== id);
    setStorage(STORAGE_KEYS.PROJECTS, filtered);

    // Also delete related data
    const docs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    delete docs[id];
    setStorage(STORAGE_KEYS.DOCUMENTS, docs);

    const studies = getStorage<Record<string, Study[]>>(STORAGE_KEYS.STUDIES, {});
    delete studies[id];
    setStorage(STORAGE_KEYS.STUDIES, studies);
  },
};

// ── Documents ───────────────────────────────────────────────────────
export const documents = {
  list: async (projectId: string) => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    const items = allDocs[projectId] || [];
    return { items };
  },

  upload: async (projectId: string, filename: string, extractedText: string, classification?: string) => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    if (!allDocs[projectId]) allDocs[projectId] = [];

    const newDoc: DocumentFile = {
      id: generateId('doc'),
      filename,
      original_filename: filename,
      file_type: filename.split('.').pop() || 'unknown',
      classification: (classification as DocumentClassification) || 'other_supporting',
      authority: 'supporting',
      checksum_sha256: 'local-storage',
      file_size_bytes: extractedText.length,
      uploaded_at: new Date().toISOString(),
    };
    allDocs[projectId].push(newDoc);
    setStorage(STORAGE_KEYS.DOCUMENTS, allDocs);

    // Update project document count
    const projects = getStorage<Project[]>(STORAGE_KEYS.PROJECTS, []);
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      project.document_count = allDocs[projectId].length;
      setStorage(STORAGE_KEYS.PROJECTS, projects);
    }

    return newDoc;
  },

  reclassify: async (projectId: string, docId: string, classification: string) => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    const docs = allDocs[projectId];
    if (docs) {
      const doc = docs.find((d) => d.id === docId);
      if (doc) {
        doc.classification = classification as DocumentClassification;
        setStorage(STORAGE_KEYS.DOCUMENTS, allDocs);
        return doc;
      }
    }
    throw new Error('Document not found');
  },

  delete: async (projectId: string, docId: string) => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    if (allDocs[projectId]) {
      allDocs[projectId] = allDocs[projectId].filter((d) => d.id !== docId);
      setStorage(STORAGE_KEYS.DOCUMENTS, allDocs);

      // Update project document count
      const projects = getStorage<Project[]>(STORAGE_KEYS.PROJECTS, []);
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        project.document_count = allDocs[projectId].length;
        setStorage(STORAGE_KEYS.PROJECTS, projects);
      }
    }
  },
};

// ── Readiness ───────────────────────────────────────────────────────
export interface ReadinessCapability {
  section: string;
  title: string;
  status: 'ready' | 'partial' | 'blocked' | 'optional';
  sources_found: string[];
  missing: string[];
}

export interface ReadinessReport {
  overall_status: string;
  document_summary: {
    total: number;
    by_classification: Record<string, number>;
    authoritative_count: number;
    supporting_count: number;
  };
  extraction_status: {
    studies: number;
    conditions: number;
    attributes: number;
    extracted: boolean;
  };
  capabilities: ReadinessCapability[];
}

export const readiness = {
  check: async (projectId: string) => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    const docs = allDocs[projectId] || [];
    const allStudies = getStorage<Record<string, Study[]>>(STORAGE_KEYS.STUDIES, {});
    const studyList = allStudies[projectId] || [];

    const byClass: Record<string, number> = {};
    docs.forEach((d) => {
      byClass[d.classification] = (byClass[d.classification] || 0) + 1;
    });

    const report: ReadinessReport = {
      overall_status: docs.length > 0 ? 'partial' : 'empty',
      document_summary: {
        total: docs.length,
        by_classification: byClass,
        authoritative_count: docs.filter((d) => d.authority === 'authoritative').length,
        supporting_count: docs.filter((d) => d.authority === 'supporting').length,
      },
      extraction_status: {
        studies: studyList.length,
        conditions: getStorage<StorageCondition[]>(STORAGE_KEYS.CONDITIONS, []).length,
        attributes: getStorage<QualityAttribute[]>(STORAGE_KEYS.ATTRIBUTES, []).length,
        extracted: studyList.length > 0,
      },
      capabilities: [
        {
          section: '3.2.S.7.3',
          title: 'Stability Data (Drug Substance)',
          status: studyList.length > 0 ? 'ready' : 'blocked',
          sources_found: docs.filter((d) => d.classification === 'stability_report').map((d) => d.filename),
          missing: studyList.length === 0 ? ['Run extraction first'] : [],
        },
        {
          section: '3.2.P.8.3',
          title: 'Stability Data (Drug Product)',
          status: 'optional',
          sources_found: [],
          missing: ['Drug product stability data'],
        },
      ],
    };
    return report;
  },
};

// ── Extraction ──────────────────────────────────────────────────────
export const extraction = {
  start: async (projectId: string) => {
    await delay(1000); // Simulate extraction time

    // Create sample extracted data
    const allStudies = getStorage<Record<string, Study[]>>(STORAGE_KEYS.STUDIES, {});
    allStudies[projectId] = [
      {
        id: generateId('study'),
        product_id: projectId,
        study_label: 'Long-term Stability Study',
        study_type: 'long_term',
        protocol_id: 'STAB-001',
        sites: [],
        manufacturers: [],
        extraction_status: 'confirmed',
        confidence: 0.92,
        source_anchors: [],
      },
      {
        id: generateId('study'),
        product_id: projectId,
        study_label: 'Accelerated Stability Study',
        study_type: 'accelerated',
        protocol_id: 'STAB-002',
        sites: [],
        manufacturers: [],
        extraction_status: 'confirmed',
        confidence: 0.88,
        source_anchors: [],
      },
    ];
    setStorage(STORAGE_KEYS.STUDIES, allStudies);

    const conditionsList: StorageCondition[] = [
      { id: generateId('cond'), label: '25°C/60% RH', temperature_setpoint: 25, humidity: '60% RH', display_order: 1, extraction_status: 'confirmed', confidence: 0.95 },
      { id: generateId('cond'), label: '40°C/75% RH', temperature_setpoint: 40, humidity: '75% RH', display_order: 2, extraction_status: 'confirmed', confidence: 0.93 },
    ];
    setStorage(STORAGE_KEYS.CONDITIONS, conditionsList);

    const attrList: QualityAttribute[] = [
      { id: generateId('attr'), name: 'Appearance', method_group: 'Physical', display_order: 1, extraction_status: 'confirmed', confidence: 0.90, acceptance_criteria: [{ id: generateId('crit'), criteria_text: 'White to off-white powder' }] },
      { id: generateId('attr'), name: 'Assay', method_group: 'Chemical', analytical_procedure: 'HPLC', display_order: 2, extraction_status: 'confirmed', confidence: 0.94, acceptance_criteria: [{ id: generateId('crit'), criteria_text: '98.0% - 102.0%' }] },
      { id: generateId('attr'), name: 'Related Substances', method_group: 'Chemical', analytical_procedure: 'HPLC', display_order: 3, extraction_status: 'confirmed', confidence: 0.91, acceptance_criteria: [{ id: generateId('crit'), criteria_text: 'Total: NMT 2.0%' }] },
      { id: generateId('attr'), name: 'Water Content', method_group: 'Physical', analytical_procedure: 'Karl Fischer', display_order: 4, extraction_status: 'confirmed', confidence: 0.89, acceptance_criteria: [{ id: generateId('crit'), criteria_text: 'NMT 0.5%' }] },
    ];
    setStorage(STORAGE_KEYS.ATTRIBUTES, attrList);

    const job: ExtractionJob = {
      job_id: generateId('extract'),
      status: 'completed',
      summary: {
        studies_found: 2,
        lots_found: 0,
        conditions_found: 2,
        attributes_found: 4,
        results_found: 0,
        low_confidence_count: 0,
      },
    };
    return job;
  },

  status: async (_projectId: string, jobId: string) => {
    await delay();
    const job: ExtractionJob = {
      job_id: jobId,
      status: 'completed',
    };
    return job;
  },
};

// ── Studies ─────────────────────────────────────────────────────────
export const studies = {
  list: async (projectId: string) => {
    await delay();
    const allStudies = getStorage<Record<string, Study[]>>(STORAGE_KEYS.STUDIES, {});
    const items = allStudies[projectId] || [];
    return { items };
  },

  update: async (projectId: string, studyId: string, data: Partial<Study>) => {
    await delay();
    const allStudies = getStorage<Record<string, Study[]>>(STORAGE_KEYS.STUDIES, {});
    const studyList = allStudies[projectId];
    if (studyList) {
      const study = studyList.find((s) => s.id === studyId);
      if (study) {
        Object.assign(study, data);
        setStorage(STORAGE_KEYS.STUDIES, allStudies);
        return study;
      }
    }
    throw new Error('Study not found');
  },
};

// ── Lots ────────────────────────────────────────────────────────────
export const lots = {
  list: async (projectId: string, _studyId?: string) => {
    await delay();
    const allLots = getStorage<Record<string, Lot[]>>(STORAGE_KEYS.LOTS, {});
    const items = allLots[projectId] || [];
    return { items };
  },
};

// ── Conditions ──────────────────────────────────────────────────────
export const conditions = {
  list: async (_projectId: string, _studyId?: string) => {
    await delay();
    const items = getStorage<StorageCondition[]>(STORAGE_KEYS.CONDITIONS, []);
    return { items };
  },
};

// ── Attributes ──────────────────────────────────────────────────────
export const attributes = {
  list: async (_projectId: string, _studyId?: string) => {
    await delay();
    const items = getStorage<QualityAttribute[]>(STORAGE_KEYS.ATTRIBUTES, []);
    return { items };
  },
};

// ── Results ─────────────────────────────────────────────────────────
export const results = {
  pivot: async (_projectId: string, _studyId: string, lotId: string, conditionId: string) => {
    await delay();
    const allLots = getStorage<Record<string, Lot[]>>(STORAGE_KEYS.LOTS, {});
    const lotList = Object.values(allLots).flat();
    const lot = lotList.find((l) => l.id === lotId) || { id: lotId, lot_number: 'LOT-001', extraction_status: 'confirmed' as const };

    const conditionsList = getStorage<StorageCondition[]>(STORAGE_KEYS.CONDITIONS, []);
    const condition = conditionsList.find((c) => c.id === conditionId) || { id: conditionId, label: '25°C/60% RH', extraction_status: 'confirmed' as const };

    return {
      lot,
      condition,
      time_points: ['0M', '3M', '6M', '9M', '12M'],
      rows: [],
    };
  },
};

// ── Validation ──────────────────────────────────────────────────────
export const validation = {
  run: async (_projectId: string) => {
    await delay(500);
    const report: ValidationReport = {
      run_id: generateId('val'),
      timestamp: new Date().toISOString(),
      overall_status: 'pass_with_warnings',
      hard_failures: [],
      warnings: [
        { rule_id: 'val-001', rule_name: 'Photostability', severity: 'soft', status: 'warning', message: 'Photostability study data not found' },
        { rule_id: 'val-002', rule_name: 'Container Closure', severity: 'soft', status: 'warning', message: 'Container closure compatibility data incomplete' },
      ],
      passed: [
        { rule_id: 'val-003', rule_name: 'Batch Count', severity: 'hard', status: 'pass', message: 'Minimum batch count met' },
      ],
    };
    return report;
  },
};

// ── Generation ──────────────────────────────────────────────────────
export interface GenerateRequest {
  project: {
    id: string;
    name: string;
    description?: string;
  };
  studies: Study[];
  lots: Lot[];
  conditions: StorageCondition[];
  attributes: QualityAttribute[];
  documents: {
    filename: string;
    extracted_text: string;
    classification: string;
  }[];
}

export const generation = {
  start: async (_req: GenerateRequest) => {
    await delay(2000); // Simulate generation time

    const newRun: GenerationRun = {
      run_id: generateId('gen'),
      status: 'completed' as GenerationStatus,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      outputs: {
        html: '#generated-preview',
        traceability_json: '#traceability',
      },
      token_usage: {
        input_tokens: Math.floor(40000 + Math.random() * 10000),
        output_tokens: Math.floor(10000 + Math.random() * 5000),
      },
    };

    // Save generation run
    const runs = getStorage<GenerationRun[]>(STORAGE_KEYS.GENERATION_RUNS, []);
    runs.unshift(newRun);
    setStorage(STORAGE_KEYS.GENERATION_RUNS, runs);

    return newRun;
  },

  status: async (_projectId: string, runId: string) => {
    await delay();
    const runs = getStorage<GenerationRun[]>(STORAGE_KEYS.GENERATION_RUNS, []);
    const run = runs.find((r) => r.run_id === runId);
    if (run) return run;

    return {
      run_id: runId,
      status: 'completed' as GenerationStatus,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };
  },

  list: async (_projectId: string) => {
    await delay();
    const items = getStorage<GenerationRun[]>(STORAGE_KEYS.GENERATION_RUNS, []);
    return { items };
  },
};

// ── Regulatory ──────────────────────────────────────────────────────
export const regulatory = {
  guidelines: {
    list: async () => {
      await delay();
      const items = getStorage<RegulatoryGuideline[]>(STORAGE_KEYS.GUIDELINES, []);
      return { items, total: items.length };
    },

    get: async (id: string) => {
      await delay();
      const items = getStorage<RegulatoryGuideline[]>(STORAGE_KEYS.GUIDELINES, []);
      const guideline = items.find((g) => g.id === id);
      if (!guideline) throw new Error('Guideline not found');
      return guideline;
    },

    upload: async (file: File, title: string, agency: string, documentId?: string, version?: string) => {
      await delay();
      const items = getStorage<RegulatoryGuideline[]>(STORAGE_KEYS.GUIDELINES, []);
      const newGuideline: RegulatoryGuideline = {
        id: generateId('guide'),
        title,
        agency,
        document_id: documentId,
        version,
        is_active: false,
        original_filename: file.name,
        file_checksum_sha256: 'local-storage',
        allocation_pack_count: 0,
        uploaded_at: new Date().toISOString(),
      };
      items.push(newGuideline);
      setStorage(STORAGE_KEYS.GUIDELINES, items);
      return newGuideline;
    },

    delete: async (id: string) => {
      await delay();
      const items = getStorage<RegulatoryGuideline[]>(STORAGE_KEYS.GUIDELINES, []);
      const filtered = items.filter((g) => g.id !== id);
      setStorage(STORAGE_KEYS.GUIDELINES, filtered);
    },

    allocate: async (guidelineId: string) => {
      await delay(1500);
      const items = getStorage<RegulatoryGuideline[]>(STORAGE_KEYS.GUIDELINES, []);
      const guideline = items.find((g) => g.id === guidelineId);
      if (guideline) {
        guideline.is_active = true;
        guideline.allocation_pack_count = 1;
        setStorage(STORAGE_KEYS.GUIDELINES, items);
      }

      // Create sample rules (using partial type for simplicity)
      const allRules = getStorage<Record<string, Partial<RegulatoryRule>[]>>(STORAGE_KEYS.RULES, {});
      allRules[guidelineId] = [
        { id: generateId('rule'), rule_id_code: 'Q1A-001', rule_text: 'Testing frequency for long-term studies', status: 'pending_review' as AllocationStatus, validation_severity: 'BLOCK' },
        { id: generateId('rule'), rule_id_code: 'Q1A-002', rule_text: 'Minimum number of batches', status: 'pending_review' as AllocationStatus, validation_severity: 'BLOCK' },
        { id: generateId('rule'), rule_id_code: 'Q1A-003', rule_text: 'Storage conditions specification', status: 'pending_review' as AllocationStatus, validation_severity: 'WARN' },
      ];
      setStorage(STORAGE_KEYS.RULES, allRules);

      return { job_id: generateId('alloc'), status: 'completed', message: 'Rules extracted successfully' };
    },

    rules: async (guidelineId: string) => {
      await delay();
      const allRules = getStorage<Record<string, Partial<RegulatoryRule>[]>>(STORAGE_KEYS.RULES, {});
      const items = allRules[guidelineId] || [];
      return { items };
    },

    updateRuleStatus: async (guidelineId: string, ruleId: string, status: string, justification?: string) => {
      await delay();
      const allRules = getStorage<Record<string, Partial<RegulatoryRule>[]>>(STORAGE_KEYS.RULES, {});
      const rules = allRules[guidelineId];
      if (rules) {
        const rule = rules.find((r) => r.id === ruleId);
        if (rule) {
          rule.status = status as AllocationStatus;
          if (justification) rule.override_justification = justification;
          setStorage(STORAGE_KEYS.RULES, allRules);
        }
      }
      return { success: true };
    },

    glossary: async (_guidelineId: string) => {
      await delay();
      return {
        items: [
          { id: 'gl-001', term: 'Drug Substance', definition: 'The active pharmaceutical ingredient (API).', source_page: 3 },
          { id: 'gl-002', term: 'Drug Product', definition: 'The finished dosage form containing the drug substance.', source_page: 3 },
          { id: 'gl-003', term: 'Accelerated Testing', definition: 'Studies using exaggerated storage conditions.', source_page: 4 },
        ],
      };
    },
  },

  activations: {
    list: async (_projectId: string) => {
      await delay();
      return { items: [] };
    },

    activate: async (_projectId: string, _guidelineId: string, _numberingMode: string, _clinicalPhase: string) => {
      await delay();
      return { id: generateId('act'), status: 'activated' };
    },

    deactivate: async (_projectId: string, _activationId: string) => {
      await delay();
    },
  },

  evaluate: async (_projectId: string) => {
    await delay(500);
    return {
      timestamp: new Date().toISOString(),
      can_proceed: true,
      blocking_failures: [],
      warnings: [
        { rule_id: 'rule-001', rule_id_code: 'Q1A-005', result: 'FAIL', severity: 'WARN', details: 'Retest period not explicitly stated' },
      ],
      passes: [
        { rule_id: 'rule-002', rule_id_code: 'Q1A-001', result: 'PASS', severity: 'BLOCK', details: 'Quality attributes defined' },
        { rule_id: 'rule-003', rule_id_code: 'Q1A-002', result: 'PASS', severity: 'BLOCK', details: 'Primary batches included' },
      ],
      waivers: [],
    };
  },

  waivers: {
    list: async (_projectId: string) => {
      await delay();
      return { items: [] };
    },

    add: async (_projectId: string, ruleIdCode: string, _justification: string) => {
      await delay();
      return { rule_id_code: ruleIdCode, status: 'waived' };
    },

    remove: async (_projectId: string, _ruleIdCode: string) => {
      await delay();
    },
  },
};
