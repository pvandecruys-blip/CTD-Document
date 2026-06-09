/**
 * Client-side storage using localStorage.
 * All data is stored in the browser - no backend required.
 */

import type {
  Project,
  Modality,
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
  VeevaDocument,
  VeevaNotification,
  ParagraphComment,
  ParagraphVersion,
  ParagraphState,
  CommentStatus,
  ActivityEntry,
  ActivityAction,
} from '../types';

// ── Storage Keys ────────────────────────────────────────────────────
const STORAGE_KEYS = {
  PROJECTS: 'ctd_projects',
  DOCUMENTS: 'ctd_documents',
  DOCUMENT_TEXTS: 'ctd_document_texts', // Stores extracted text for AI processing
  STUDIES: 'ctd_studies',
  LOTS: 'ctd_lots',
  CONDITIONS: 'ctd_conditions',
  ATTRIBUTES: 'ctd_attributes',
  GENERATION_RUNS: 'ctd_generation_runs',
  GUIDELINES: 'ctd_guidelines',
  RULES: 'ctd_rules',
};

// ── API Configuration ───────────────────────────────────────────────
const API_BASE = import.meta.env.PROD ? '' : ''; // Use relative paths for Vercel

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

  create: async (data: { name: string; description?: string; modality?: Modality }) => {
    await delay();
    const items = getStorage<Project[]>(STORAGE_KEYS.PROJECTS, []);
    const newProject: Project = {
      id: generateId('proj'),
      name: data.name,
      description: data.description,
      status: 'draft',
      clinical_phase: 'phase_1',
      numbering_mode: 'ctd',
      modality: data.modality ?? 'NCE',
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

    // Delete all related data for this project
    const docs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    const projectDocs = docs[id] || [];

    // Delete document texts for all documents in this project
    const allTexts = getStorage<Record<string, string>>(STORAGE_KEYS.DOCUMENT_TEXTS, {});
    projectDocs.forEach((doc) => {
      delete allTexts[doc.id];
    });
    setStorage(STORAGE_KEYS.DOCUMENT_TEXTS, allTexts);

    delete docs[id];
    setStorage(STORAGE_KEYS.DOCUMENTS, docs);

    const allStudies = getStorage<Record<string, Study[]>>(STORAGE_KEYS.STUDIES, {});
    delete allStudies[id];
    setStorage(STORAGE_KEYS.STUDIES, allStudies);

    const allLots = getStorage<Record<string, Lot[]>>(STORAGE_KEYS.LOTS, {});
    delete allLots[id];
    setStorage(STORAGE_KEYS.LOTS, allLots);

    const allConditions = getStorage<Record<string, StorageCondition[]>>(STORAGE_KEYS.CONDITIONS, {});
    delete allConditions[id];
    setStorage(STORAGE_KEYS.CONDITIONS, allConditions);

    const allAttributes = getStorage<Record<string, QualityAttribute[]>>(STORAGE_KEYS.ATTRIBUTES, {});
    delete allAttributes[id];
    setStorage(STORAGE_KEYS.ATTRIBUTES, allAttributes);

    // Delete generation runs for this project
    const runs = getStorage<(GenerationRun & { project_id?: string })[]>(STORAGE_KEYS.GENERATION_RUNS, []);
    const filteredRuns = runs.filter((r) => r.project_id !== id);
    setStorage(STORAGE_KEYS.GENERATION_RUNS, filteredRuns);

    // Delete generated HTML for this project's runs
    const htmlStorage = getStorage<Record<string, string>>('ctd_generated_html', {});
    runs.filter((r) => r.project_id === id).forEach((r) => {
      delete htmlStorage[r.run_id];
    });
    setStorage('ctd_generated_html', htmlStorage);
  },
};

// ── Documents ───────────────────────────────────────────────────────
export interface UploadOptions {
  classification?: string;
  source?: 'upload' | 'veeva';
  section_tags?: string[];
}

export const documents = {
  list: async (projectId: string) => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    const items = allDocs[projectId] || [];
    return { items };
  },

  /**
   * Return the documents that should feed generation for a given CTD section.
   * A document is considered "for this section" if its section_tags array
   * contains the section id. Documents without section_tags are untagged
   * and excluded from generation by default — they remain visible in the
   * project library so the user can tag them or pick them per section.
   */
  listForSection: async (projectId: string, sectionId: string) => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    const all = allDocs[projectId] || [];
    const items = all.filter((d) => Array.isArray(d.section_tags) && d.section_tags.includes(sectionId));
    return { items };
  },

  upload: async (
    projectId: string,
    filename: string,
    extractedText: string,
    classificationOrOpts?: string | UploadOptions,
    source?: 'upload' | 'veeva',
  ) => {
    await delay();

    // Back-compat: old call sites pass (projectId, filename, text, classification, source).
    // New call sites pass (projectId, filename, text, { classification, source, section_tags }).
    const opts: UploadOptions =
      typeof classificationOrOpts === 'object' && classificationOrOpts !== null
        ? classificationOrOpts
        : { classification: classificationOrOpts as string | undefined, source };

    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    if (!allDocs[projectId]) allDocs[projectId] = [];

    const docId = generateId('doc');
    const newDoc: DocumentFile = {
      id: docId,
      filename,
      original_filename: filename,
      file_type: filename.split('.').pop() || 'unknown',
      classification: (opts.classification as DocumentClassification) || 'other_supporting',
      authority: 'supporting',
      checksum_sha256: 'local-storage',
      file_size_bytes: extractedText.length,
      uploaded_at: new Date().toISOString(),
      source: opts.source || 'upload',
      section_tags: opts.section_tags && opts.section_tags.length > 0 ? [...opts.section_tags] : undefined,
    };
    allDocs[projectId].push(newDoc);
    setStorage(STORAGE_KEYS.DOCUMENTS, allDocs);

    // Store extracted text separately for AI processing
    const allTexts = getStorage<Record<string, string>>(STORAGE_KEYS.DOCUMENT_TEXTS, {});
    allTexts[docId] = extractedText;
    setStorage(STORAGE_KEYS.DOCUMENT_TEXTS, allTexts);

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

  /**
   * Replace the section_tags on a document. Pass [] to clear all tags
   * (document becomes untagged — visible in library but not used by any
   * section's generation until explicitly retagged).
   */
  setTags: async (projectId: string, docId: string, tags: string[]) => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    const docs = allDocs[projectId];
    if (!docs) throw new Error('Project not found');
    const doc = docs.find((d) => d.id === docId);
    if (!doc) throw new Error('Document not found');
    doc.section_tags = tags.length > 0 ? [...new Set(tags)] : undefined;
    setStorage(STORAGE_KEYS.DOCUMENTS, allDocs);
    return doc;
  },

  /** Add a single section tag (idempotent). */
  addTag: async (projectId: string, docId: string, sectionId: string) => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    const docs = allDocs[projectId];
    if (!docs) throw new Error('Project not found');
    const doc = docs.find((d) => d.id === docId);
    if (!doc) throw new Error('Document not found');
    const current = new Set(doc.section_tags || []);
    current.add(sectionId);
    doc.section_tags = [...current];
    setStorage(STORAGE_KEYS.DOCUMENTS, allDocs);
    return doc;
  },

  /** Remove a single section tag (idempotent). */
  removeTag: async (projectId: string, docId: string, sectionId: string) => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    const docs = allDocs[projectId];
    if (!docs) throw new Error('Project not found');
    const doc = docs.find((d) => d.id === docId);
    if (!doc) throw new Error('Document not found');
    const filtered = (doc.section_tags || []).filter((t) => t !== sectionId);
    doc.section_tags = filtered.length > 0 ? filtered : undefined;
    setStorage(STORAGE_KEYS.DOCUMENTS, allDocs);
    return doc;
  },

  delete: async (projectId: string, docId: string) => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    if (allDocs[projectId]) {
      allDocs[projectId] = allDocs[projectId].filter((d) => d.id !== docId);
      setStorage(STORAGE_KEYS.DOCUMENTS, allDocs);

      // Delete the document's extracted text
      const allTexts = getStorage<Record<string, string>>(STORAGE_KEYS.DOCUMENT_TEXTS, {});
      delete allTexts[docId];
      setStorage(STORAGE_KEYS.DOCUMENT_TEXTS, allTexts);

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
    // Get all documents for this project
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    const docs = allDocs[projectId] || [];
    const allTexts = getStorage<Record<string, string>>(STORAGE_KEYS.DOCUMENT_TEXTS, {});

    if (docs.length === 0) {
      throw new Error('No documents to extract from');
    }

    // Combine all document texts for extraction
    const combinedText = docs
      .map((doc) => {
        const text = allTexts[doc.id] || '';
        return `=== Document: ${doc.filename} ===\n${text}`;
      })
      .join('\n\n');

    // Call the AI extraction API
    try {
      const response = await fetch(`${API_BASE}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: combinedText,
          filename: docs.map((d) => d.filename).join(', '),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'API request failed' }));
        throw new Error(error.error || 'Extraction failed');
      }

      const result = await response.json();
      const extracted = result.extraction || {};

      // Store extracted studies
      const allStudies = getStorage<Record<string, Study[]>>(STORAGE_KEYS.STUDIES, {});
      allStudies[projectId] = (extracted.studies || []).map((s: { study_label?: string; study_type?: string; protocol_id?: string; confidence?: number }, idx: number) => ({
        id: generateId('study'),
        product_id: projectId,
        study_label: s.study_label || `Study ${idx + 1}`,
        study_type: s.study_type || 'long_term',
        protocol_id: s.protocol_id || null,
        sites: [],
        manufacturers: [],
        extraction_status: 'confirmed' as const,
        confidence: s.confidence || 0.8,
        source_anchors: [],
      }));
      setStorage(STORAGE_KEYS.STUDIES, allStudies);

      // Store extracted conditions (per-project)
      const conditionsList: StorageCondition[] = (extracted.conditions || []).map((c: { label?: string; temperature_setpoint?: number; humidity?: string; confidence?: number }, idx: number) => ({
        id: generateId('cond'),
        label: c.label || `Condition ${idx + 1}`,
        temperature_setpoint: c.temperature_setpoint || null,
        humidity: c.humidity || null,
        display_order: idx + 1,
        extraction_status: 'confirmed' as const,
        confidence: c.confidence || 0.8,
      }));
      const allConditions = getStorage<Record<string, StorageCondition[]>>(STORAGE_KEYS.CONDITIONS, {});
      allConditions[projectId] = conditionsList;
      setStorage(STORAGE_KEYS.CONDITIONS, allConditions);

      // Store extracted attributes (per-project)
      const attrList: QualityAttribute[] = (extracted.attributes || []).map((a: { name?: string; method_group?: string; analytical_procedure?: string; acceptance_criteria?: string; confidence?: number }, idx: number) => ({
        id: generateId('attr'),
        name: a.name || `Attribute ${idx + 1}`,
        method_group: a.method_group || 'Other',
        analytical_procedure: a.analytical_procedure || null,
        display_order: idx + 1,
        extraction_status: 'confirmed' as const,
        confidence: a.confidence || 0.8,
        acceptance_criteria: a.acceptance_criteria
          ? [{ id: generateId('crit'), criteria_text: a.acceptance_criteria }]
          : [],
      }));
      const allAttributes = getStorage<Record<string, QualityAttribute[]>>(STORAGE_KEYS.ATTRIBUTES, {});
      allAttributes[projectId] = attrList;
      setStorage(STORAGE_KEYS.ATTRIBUTES, allAttributes);

      // Store extracted lots
      const allLots = getStorage<Record<string, Lot[]>>(STORAGE_KEYS.LOTS, {});
      allLots[projectId] = (extracted.lots || []).map((l: { lot_number?: string; manufacturer?: string; manufacturing_site?: string; confidence?: number }, idx: number) => ({
        id: generateId('lot'),
        lot_number: l.lot_number || `LOT-${idx + 1}`,
        manufacturer: l.manufacturer || null,
        manufacturing_site: l.manufacturing_site || null,
        extraction_status: 'confirmed' as const,
        confidence: l.confidence || 0.8,
      }));
      setStorage(STORAGE_KEYS.LOTS, allLots);

      const job: ExtractionJob = {
        job_id: generateId('extract'),
        status: 'completed',
        summary: {
          studies_found: allStudies[projectId]?.length || 0,
          lots_found: allLots[projectId]?.length || 0,
          conditions_found: conditionsList.length,
          attributes_found: attrList.length,
          results_found: 0,
          low_confidence_count: 0,
        },
      };
      return job;
    } catch (error) {
      // If API fails, fall back to mock data for demo purposes
      console.warn('AI extraction failed, using mock data:', error);
      return extraction.startMock(projectId);
    }
  },

  // Fallback mock extraction when API is unavailable
  startMock: async (projectId: string) => {
    await delay(1000);

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
    const allConditions = getStorage<Record<string, StorageCondition[]>>(STORAGE_KEYS.CONDITIONS, {});
    allConditions[projectId] = conditionsList;
    setStorage(STORAGE_KEYS.CONDITIONS, allConditions);

    const attrList: QualityAttribute[] = [
      { id: generateId('attr'), name: 'Appearance', method_group: 'Physical', display_order: 1, extraction_status: 'confirmed', confidence: 0.90, acceptance_criteria: [{ id: generateId('crit'), criteria_text: 'White to off-white powder' }] },
      { id: generateId('attr'), name: 'Assay', method_group: 'Chemical', analytical_procedure: 'HPLC', display_order: 2, extraction_status: 'confirmed', confidence: 0.94, acceptance_criteria: [{ id: generateId('crit'), criteria_text: '98.0% - 102.0%' }] },
      { id: generateId('attr'), name: 'Related Substances', method_group: 'Chemical', analytical_procedure: 'HPLC', display_order: 3, extraction_status: 'confirmed', confidence: 0.91, acceptance_criteria: [{ id: generateId('crit'), criteria_text: 'Total: NMT 2.0%' }] },
      { id: generateId('attr'), name: 'Water Content', method_group: 'Physical', analytical_procedure: 'Karl Fischer', display_order: 4, extraction_status: 'confirmed', confidence: 0.89, acceptance_criteria: [{ id: generateId('crit'), criteria_text: 'NMT 0.5%' }] },
    ];
    const allAttributes = getStorage<Record<string, QualityAttribute[]>>(STORAGE_KEYS.ATTRIBUTES, {});
    allAttributes[projectId] = attrList;
    setStorage(STORAGE_KEYS.ATTRIBUTES, allAttributes);

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
  list: async (projectId: string, _studyId?: string) => {
    await delay();
    const allConditions = getStorage<Record<string, StorageCondition[]>>(STORAGE_KEYS.CONDITIONS, {});
    const items = allConditions[projectId] || [];
    return { items };
  },
};

// ── Attributes ──────────────────────────────────────────────────────
export const attributes = {
  list: async (projectId: string, _studyId?: string) => {
    await delay();
    const allAttributes = getStorage<Record<string, QualityAttribute[]>>(STORAGE_KEYS.ATTRIBUTES, {});
    const items = allAttributes[projectId] || [];
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
  section?: string; // CTD section ID e.g. "S.7.3", "S.2.5"
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
  /**
   * Locked paragraphs from a prior generation that must be preserved
   * byte-exact in the regenerated output. The backend will defensively
   * re-inject these even if the model ignored the instruction.
   */
  locked_paragraphs?: {
    pid: string;
    html: string;
  }[];
}

// Storage key for generated HTML content
const GENERATED_HTML_KEY = 'ctd_generated_html';

export const generation = {
  start: async (req: GenerateRequest) => {
    const runId = generateId('gen');

    try {
      // Call the AI generation API
      const response = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: req.section || 'S.7.3',
          project: {
            name: req.project.name,
            description: req.project.description || '',
          },
          studies: req.studies.map((s) => ({
            id: s.id,
            study_label: s.study_label,
            study_type: s.study_type,
            protocol_id: s.protocol_id,
          })),
          lots: req.lots.map((l) => ({
            lot_number: l.lot_number,
            manufacturer: l.manufacturer,
            manufacturing_site: l.manufacturing_site,
            intended_use: l.intended_use,
          })),
          conditions: req.conditions.map((c) => ({
            label: c.label,
            temperature_setpoint: c.temperature_setpoint,
            humidity: c.humidity,
          })),
          attributes: req.attributes.map((a) => ({
            name: a.name,
            method_group: a.method_group,
            analytical_procedure: a.analytical_procedure,
            acceptance_criteria: a.acceptance_criteria?.map((ac) => ({ criteria_text: ac.criteria_text })) || [],
          })),
          documents: req.documents,
          locked_paragraphs: req.locked_paragraphs || [],
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'API request failed' }));
        throw new Error(error.error || 'Generation failed');
      }

      const result = await response.json();

      // Store the generated HTML
      const htmlStorage = getStorage<Record<string, string>>(GENERATED_HTML_KEY, {});
      htmlStorage[runId] = result.html || result.content || '';
      setStorage(GENERATED_HTML_KEY, htmlStorage);

      const newRun: GenerationRun & { project_id: string } = {
        run_id: runId,
        project_id: req.project.id,
        section_id: req.section || 'S.7.3',
        status: 'completed' as GenerationStatus,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        outputs: {
          html: runId, // Reference to stored HTML
          traceability_json: '#traceability',
        },
        token_usage: {
          input_tokens: result.metadata?.input_tokens || 0,
          output_tokens: result.metadata?.output_tokens || 0,
        },
        audit: {
          generated_by: 'Local User',
          model: result.metadata?.model,
          sources: req.documents.map((d) => ({
            filename: d.filename,
            classification: d.classification,
            size_bytes: d.extracted_text.length,
          })),
          locked_paragraph_count: req.locked_paragraphs?.length || 0,
          regenerated_from: req.locked_paragraphs && req.locked_paragraphs.length > 0 ? 'prior run' : undefined,
        },
      };

      // Save generation run
      const runs = getStorage<(GenerationRun & { project_id?: string })[]>(STORAGE_KEYS.GENERATION_RUNS, []);
      runs.unshift(newRun);
      setStorage(STORAGE_KEYS.GENERATION_RUNS, runs);

      return newRun;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('AI generation failed:', errorMessage);
      // Show alert so user knows what happened
      alert(`AI generation failed: ${errorMessage}\n\nFalling back to mock data. Check Vercel logs for details.`);
      return generation.startMock(req);
    }
  },

  // Fallback mock generation when API is unavailable
  startMock: async (req: GenerateRequest) => {
    await delay(2000);

    const runId = generateId('gen');

    // Store mock HTML
    const mockHtml = `
      <html>
      <head><title>CTD Section 3.2.S.7.3 - Stability Data</title></head>
      <body>
        <h1>3.2.S.7.3 Stability Data</h1>
        <p><em>This is a mock document generated because the AI API is unavailable.</em></p>
        <p>To enable real AI generation, configure the ANTHROPIC_API_KEY environment variable in Vercel.</p>
        <h2>Studies</h2>
        <p>Long-term and accelerated stability studies were conducted...</p>
        <h2>Storage Conditions</h2>
        <ul>
          <li>25°C/60% RH (Long-term)</li>
          <li>40°C/75% RH (Accelerated)</li>
        </ul>
        <h2>Results Summary</h2>
        <p>All tested parameters remained within specifications throughout the study duration.</p>
      </body>
      </html>
    `;

    const htmlStorage = getStorage<Record<string, string>>(GENERATED_HTML_KEY, {});
    htmlStorage[runId] = mockHtml;
    setStorage(GENERATED_HTML_KEY, htmlStorage);

    const newRun: GenerationRun & { project_id: string } = {
      run_id: runId,
      project_id: req.project.id,
      section_id: req.section || 'S.7.3',
      status: 'completed' as GenerationStatus,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      outputs: {
        html: runId,
        traceability_json: '#traceability',
      },
      token_usage: {
        input_tokens: Math.floor(40000 + Math.random() * 10000),
        output_tokens: Math.floor(10000 + Math.random() * 5000),
      },
      audit: {
        generated_by: 'Local User',
        model: 'mock (API unavailable)',
        sources: req.documents.map((d) => ({
          filename: d.filename,
          classification: d.classification,
          size_bytes: d.extracted_text.length,
        })),
        locked_paragraph_count: req.locked_paragraphs?.length || 0,
      },
    };

    const runs = getStorage<(GenerationRun & { project_id?: string })[]>(STORAGE_KEYS.GENERATION_RUNS, []);
    runs.unshift(newRun);
    setStorage(STORAGE_KEYS.GENERATION_RUNS, runs);

    return newRun;
  },

  // Get generated HTML content
  getHtml: async (runId: string) => {
    const htmlStorage = getStorage<Record<string, string>>(GENERATED_HTML_KEY, {});
    return htmlStorage[runId] || null;
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

  list: async (projectId: string) => {
    await delay();
    const allRuns = getStorage<(GenerationRun & { project_id?: string })[]>(STORAGE_KEYS.GENERATION_RUNS, []);
    // Filter runs by project ID
    const items = allRuns.filter((r) => r.project_id === projectId);
    return { items };
  },

  /**
   * Permanently delete a run and everything attached to it: the run record,
   * its stored HTML, and its paragraph state, comments, version history and
   * activity log.
   */
  delete: async (runId: string) => {
    await delay();
    const allRuns = getStorage<(GenerationRun & { project_id?: string })[]>(STORAGE_KEYS.GENERATION_RUNS, []);
    const run = allRuns.find((r) => r.run_id === runId);
    setStorage(STORAGE_KEYS.GENERATION_RUNS, allRuns.filter((r) => r.run_id !== runId));

    // Remove stored HTML (keyed by the run's output reference and/or runId)
    const htmlStorage = getStorage<Record<string, string>>(GENERATED_HTML_KEY, {});
    if (run?.outputs?.html) delete htmlStorage[run.outputs.html];
    delete htmlStorage[runId];
    setStorage(GENERATED_HTML_KEY, htmlStorage);

    // Remove paragraph state (locks/comments/versions) and activity log
    paragraphs.clearRun(runId);
    activity.clearRun(runId);
  },
};

// ── ICH Q Guidelines — Pre-seeded Data ───────────────────────────────

export interface ICHRule {
  id: string;
  guideline_id: string;
  rule_id_code: string;
  rule_text: string;
  requirement_level: 'MUST' | 'SHOULD' | 'MAY';
  severity: 'BLOCK' | 'WARN';
  applies_to: ('DS' | 'DP')[];
  ctd_sections: string[];
  evidence_expected: string;
  category: string;
  /** Modalities this rule applies to. Omitted → inherits the guideline's modalities. */
  modalities?: Modality[];
}

/** The two regulatory domains from the mapping email's tables. */
export type RegulatoryDomain = 'process_validation' | 'stability' | 'general';

export interface ICHGuideline {
  id: string;
  code: string;
  title: string;
  agency: string;
  version: string;
  description: string;
  rules: ICHRule[];
  /** Which of the email's mapping tables this guideline belongs to. */
  domain?: RegulatoryDomain;
  /** Drug Substance CTD section tags this guideline maps to (e.g. ['S.2.5']). */
  ds_ctd_tags?: string[];
  /** Drug Product CTD section tags this guideline maps to (e.g. ['P.3.5']). */
  dp_ctd_tags?: string[];
  /** "Primary focus / why it matters" column from the email. */
  why_it_matters?: string;
  /** Link to the full-text guideline PDF / page. */
  reference_url?: string;
  /** Modalities this guideline applies to. Omitted → applies to all modalities. */
  modalities?: Modality[];
}

// Modality groupings reused across guideline definitions.
const ALL_MODALITIES: Modality[] = ['NCE', 'NBE', 'ATMP', 'SYNTHETIC_HYBRID', 'VACCINE'];
const BIO_MODALITIES: Modality[] = ['NBE', 'ATMP', 'VACCINE'];

const ICH_GUIDELINES: ICHGuideline[] = [
  {
    id: 'ich-q1a',
    code: 'ICH Q1A(R2)',
    title: 'Stability Testing of New Drug Substances and Products',
    agency: 'ICH',
    version: 'R2 (2003)',
    description: 'Establishes requirements for stability testing protocols, storage conditions, testing frequency, and data evaluation for drug substances and products.',
    domain: 'stability',
    ds_ctd_tags: ['S.7.1', 'S.7.3'],
    dp_ctd_tags: ['P.8.1', 'P.8.3'],
    why_it_matters: 'Core stability protocol design, storage conditions and shelf-life.',
    reference_url: 'https://database.ich.org/sites/default/files/Q1A%28R2%29%20Guideline.pdf',
    modalities: ALL_MODALITIES,
    rules: [
      { id: 'q1a-001', guideline_id: 'ich-q1a', rule_id_code: 'Q1A-001', rule_text: 'Long-term testing shall be conducted at 25°C ± 2°C / 60% RH ± 5% RH for a minimum of 12 months at time of submission.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.3', 'P.8.3'], evidence_expected: 'Stability data at 25°C/60%RH with ≥12 months', category: 'Storage Conditions' },
      { id: 'q1a-002', guideline_id: 'ich-q1a', rule_id_code: 'Q1A-002', rule_text: 'Accelerated testing shall be conducted at 40°C ± 2°C / 75% RH ± 5% RH for a minimum of 6 months.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.3', 'P.8.3'], evidence_expected: 'Stability data at 40°C/75%RH with ≥6 months', category: 'Storage Conditions' },
      { id: 'q1a-003', guideline_id: 'ich-q1a', rule_id_code: 'Q1A-003', rule_text: 'A minimum of three primary batches of drug substance should be used for stability testing.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS'], ctd_sections: ['S.7.1', 'S.7.3'], evidence_expected: '≥3 batches in stability data', category: 'Batch Requirements' },
      { id: 'q1a-004', guideline_id: 'ich-q1a', rule_id_code: 'Q1A-004', rule_text: 'A minimum of two batches of drug product should be used for accelerated and long-term testing.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DP'], ctd_sections: ['P.8.1', 'P.8.3'], evidence_expected: '≥2 batches for DP stability', category: 'Batch Requirements' },
      { id: 'q1a-005', guideline_id: 'ich-q1a', rule_id_code: 'Q1A-005', rule_text: 'For long-term studies, frequency of testing should be every 3 months over the first year, every 6 months over the second year, and annually thereafter through the proposed retest period.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.3', 'P.8.3'], evidence_expected: 'Timepoints at 0, 3, 6, 9, 12, 18, 24, 36 months', category: 'Testing Frequency' },
      { id: 'q1a-006', guideline_id: 'ich-q1a', rule_id_code: 'Q1A-006', rule_text: 'A retest period or shelf life shall be proposed based on available stability data.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.1', 'P.8.1'], evidence_expected: 'Retest period / shelf life statement', category: 'Retest Period' },
      { id: 'q1a-007', guideline_id: 'ich-q1a', rule_id_code: 'Q1A-007', rule_text: 'Stability data should be presented in an appropriate format such as tabular, graphical, or narrative.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.3', 'P.8.3'], evidence_expected: 'Tables and/or graphs in stability section', category: 'Data Presentation' },
      { id: 'q1a-008', guideline_id: 'ich-q1a', rule_id_code: 'Q1A-008', rule_text: 'A post-approval stability protocol and commitment should be provided.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.2', 'P.8.2'], evidence_expected: 'Post-approval stability protocol section', category: 'Post-Approval' },
      { id: 'q1a-009', guideline_id: 'ich-q1a', rule_id_code: 'Q1A-009', rule_text: 'Container closure system used for stability studies must be the same as or simulate the proposed marketing container.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.3', 'P.8.3'], evidence_expected: 'Container closure description in stability section', category: 'Container Closure' },
      { id: 'q1a-010', guideline_id: 'ich-q1a', rule_id_code: 'Q1A-010', rule_text: 'Specification and acceptance criteria for each quality attribute tested in stability shall be stated.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.3', 'P.8.3'], evidence_expected: 'Acceptance criteria for all tested attributes', category: 'Specifications' },
    ],
  },
  {
    id: 'ich-q1b',
    code: 'ICH Q1B',
    title: 'Photostability Testing of New Drug Substances and Products',
    agency: 'ICH',
    version: '1996',
    description: 'Provides guidance on photostability testing as part of stress testing for drug substances and products.',
    domain: 'stability',
    ds_ctd_tags: ['S.7.3'],
    dp_ctd_tags: ['P.8.3'],
    why_it_matters: 'Procedures for light exposure and photostability assessment.',
    reference_url: 'https://database.ich.org/sites/default/files/Q1B_Guideline.pdf',
    modalities: ALL_MODALITIES,
    rules: [
      { id: 'q1b-001', guideline_id: 'ich-q1b', rule_id_code: 'Q1B-001', rule_text: 'Photostability testing should be conducted on at least one primary batch of the drug substance.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS'], ctd_sections: ['S.7.3'], evidence_expected: 'Photostability data for ≥1 DS batch', category: 'Photostability' },
      { id: 'q1b-002', guideline_id: 'ich-q1b', rule_id_code: 'Q1B-002', rule_text: 'Samples should be exposed to light providing an overall illumination of ≥1.2 million lux hours and an integrated near UV energy of ≥200 Wh/m².', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.3', 'P.8.3'], evidence_expected: 'Light exposure conditions documented', category: 'Photostability' },
      { id: 'q1b-003', guideline_id: 'ich-q1b', rule_id_code: 'Q1B-003', rule_text: 'If results demonstrate the drug substance is photolabile, confirmed testing on the drug product should be performed.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DP'], ctd_sections: ['P.8.3'], evidence_expected: 'DP photostability if DS is photolabile', category: 'Photostability' },
    ],
  },
  {
    id: 'ich-q3a',
    code: 'ICH Q3A(R2)',
    title: 'Impurities in New Drug Substances',
    agency: 'ICH',
    version: 'R2 (2006)',
    description: 'Provides guidance on classification, identification, qualification and reporting thresholds for impurities in drug substances.',
    domain: 'general',
    ds_ctd_tags: ['S.3.2', 'S.4.1', 'S.4.5'],
    dp_ctd_tags: [],
    why_it_matters: 'Reporting, identification and qualification of impurities in the drug substance.',
    reference_url: 'https://database.ich.org/sites/default/files/Q3A%28R2%29%20Guideline.pdf',
    modalities: ALL_MODALITIES,
    rules: [
      { id: 'q3a-001', guideline_id: 'ich-q3a', rule_id_code: 'Q3A-001', rule_text: 'Organic impurities above the reporting threshold shall be reported.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS'], ctd_sections: ['S.3.2', 'S.4.1'], evidence_expected: 'Impurity profile with levels above reporting threshold', category: 'Impurity Reporting' },
      { id: 'q3a-002', guideline_id: 'ich-q3a', rule_id_code: 'Q3A-002', rule_text: 'Identified impurities above the identification threshold shall be identified by name and structure.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS'], ctd_sections: ['S.3.2'], evidence_expected: 'Named/identified impurities above threshold', category: 'Impurity Identification' },
      { id: 'q3a-003', guideline_id: 'ich-q3a', rule_id_code: 'Q3A-003', rule_text: 'Impurities above the qualification threshold shall be qualified or justified.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS'], ctd_sections: ['S.3.2', 'S.4.5'], evidence_expected: 'Qualification data or justification for impurities', category: 'Impurity Qualification' },
      { id: 'q3a-004', guideline_id: 'ich-q3a', rule_id_code: 'Q3A-004', rule_text: 'A rationale for the selection of impurities included in the specification should be provided.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS'], ctd_sections: ['S.4.5'], evidence_expected: 'Justification of specification for impurities', category: 'Specifications' },
      { id: 'q3a-005', guideline_id: 'ich-q3a', rule_id_code: 'Q3A-005', rule_text: 'Analytical procedures used for detecting impurities shall be validated.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS'], ctd_sections: ['S.4.2', 'S.4.3'], evidence_expected: 'Validated analytical method for impurities', category: 'Analytical Methods' },
    ],
  },
  {
    id: 'ich-q3b',
    code: 'ICH Q3B(R2)',
    title: 'Impurities in New Drug Products',
    agency: 'ICH',
    version: 'R2 (2006)',
    description: 'Guidance on reporting, identification, and qualification of degradation products in drug products.',
    domain: 'general',
    ds_ctd_tags: [],
    dp_ctd_tags: ['P.5.5', 'P.8.3'],
    why_it_matters: 'Reporting and identification of degradation products in the drug product.',
    reference_url: 'https://database.ich.org/sites/default/files/Q3B%28R2%29%20Guideline.pdf',
    modalities: ALL_MODALITIES,
    rules: [
      { id: 'q3b-001', guideline_id: 'ich-q3b', rule_id_code: 'Q3B-001', rule_text: 'Degradation products above the reporting threshold in the drug product shall be reported.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DP'], ctd_sections: ['P.5.5', 'P.5.1'], evidence_expected: 'Degradation product profile above reporting threshold', category: 'Degradation Products' },
      { id: 'q3b-002', guideline_id: 'ich-q3b', rule_id_code: 'Q3B-002', rule_text: 'Degradation products above the identification threshold shall be identified.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DP'], ctd_sections: ['P.5.5'], evidence_expected: 'Identified degradation products', category: 'Degradation Products' },
      { id: 'q3b-003', guideline_id: 'ich-q3b', rule_id_code: 'Q3B-003', rule_text: 'Degradation pathways should be described based on stress testing and stability data.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DP'], ctd_sections: ['P.5.5', 'P.8.3'], evidence_expected: 'Degradation pathway discussion', category: 'Degradation Products' },
    ],
  },
  {
    id: 'ich-q6a',
    code: 'ICH Q6A',
    title: 'Specifications: Test Procedures and Acceptance Criteria',
    agency: 'ICH',
    version: '1999',
    description: 'Guidance on setting specifications for new drug substances and drug products (chemical entities).',
    domain: 'general',
    ds_ctd_tags: ['S.4.1', 'S.4.5'],
    dp_ctd_tags: ['P.5.1', 'P.5.6'],
    why_it_matters: 'Test procedures and acceptance criteria for release and stability specifications.',
    reference_url: 'https://database.ich.org/sites/default/files/Q6A%20Guideline.pdf',
    modalities: ALL_MODALITIES,
    rules: [
      { id: 'q6a-001', guideline_id: 'ich-q6a', rule_id_code: 'Q6A-001', rule_text: 'Specifications shall include tests for description, identification, assay, and impurities.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.4.1', 'P.5.1'], evidence_expected: 'Specification table with required tests', category: 'Specifications' },
      { id: 'q6a-002', guideline_id: 'ich-q6a', rule_id_code: 'Q6A-002', rule_text: 'Drug product specifications should include tests for dissolution or disintegration where applicable.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DP'], ctd_sections: ['P.5.1'], evidence_expected: 'Dissolution/disintegration test in DP spec', category: 'Specifications' },
      { id: 'q6a-003', guideline_id: 'ich-q6a', rule_id_code: 'Q6A-003', rule_text: 'Drug product specifications should include uniformity of dosage units testing.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DP'], ctd_sections: ['P.5.1'], evidence_expected: 'Uniformity of dosage units test', category: 'Specifications' },
      { id: 'q6a-004', guideline_id: 'ich-q6a', rule_id_code: 'Q6A-004', rule_text: 'Justification of specification shall be provided based on manufacturing, stability, and clinical data.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.4.5', 'P.5.6'], evidence_expected: 'Justification of specification section', category: 'Specifications' },
    ],
  },
  {
    id: 'ich-q2',
    code: 'ICH Q2(R2)',
    title: 'Validation of Analytical Procedures',
    agency: 'ICH',
    version: 'R2 (2022)',
    description: 'Provides guidance on the validation characteristics to consider during validation of analytical procedures.',
    domain: 'general',
    ds_ctd_tags: ['S.4.2', 'S.4.3'],
    dp_ctd_tags: ['P.5.2', 'P.5.3'],
    why_it_matters: 'Validation of analytical procedures used for release and stability testing.',
    reference_url: 'https://database.ich.org/sites/default/files/ICH_Q2-R2_Document_Step4_Guideline_2023_1130.pdf',
    modalities: ALL_MODALITIES,
    rules: [
      { id: 'q2-001', guideline_id: 'ich-q2', rule_id_code: 'Q2-001', rule_text: 'Analytical procedures used for testing shall be validated for specificity, accuracy, precision, linearity, range, and robustness.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.4.3', 'P.5.3'], evidence_expected: 'Analytical validation report', category: 'Analytical Validation' },
      { id: 'q2-002', guideline_id: 'ich-q2', rule_id_code: 'Q2-002', rule_text: 'Detection limit and quantitation limit should be established for impurity testing methods.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.4.3', 'P.5.3'], evidence_expected: 'LOD/LOQ values for impurity methods', category: 'Analytical Validation' },
      { id: 'q2-003', guideline_id: 'ich-q2', rule_id_code: 'Q2-003', rule_text: 'System suitability criteria shall be established for each analytical procedure.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.4.2', 'P.5.2'], evidence_expected: 'System suitability criteria defined', category: 'Analytical Validation' },
    ],
  },

  // ── Process & Manufacturing Validation (3.2.S.2.5 & 3.2.P.3.5) ──────
  {
    id: 'ich-q7', code: 'ICH Q7', title: 'Good Manufacturing Practice for Active Pharmaceutical Ingredients', agency: 'ICH', version: '2000',
    description: 'GMP requirements for APIs covering process controls, validation and change control.',
    domain: 'process_validation', ds_ctd_tags: ['S.2.2', 'S.2.5', 'S.4'], dp_ctd_tags: [],
    why_it_matters: 'API GMP, validation, change control and process controls.',
    reference_url: 'https://database.ich.org/sites/default/files/Q7_Guideline.pdf', modalities: ALL_MODALITIES,
    rules: [
      { id: 'q7-001', guideline_id: 'ich-q7', rule_id_code: 'Q7-001', rule_text: 'Critical process steps and critical process parameters shall be defined and controlled during API manufacture.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS'], ctd_sections: ['S.2.2', 'S.2.5'], evidence_expected: 'Description of critical steps and in-process controls', category: 'Process Controls' },
      { id: 'q7-002', guideline_id: 'ich-q7', rule_id_code: 'Q7-002', rule_text: 'Process validation should confirm the manufacturing process performs as intended and reproducibly.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS'], ctd_sections: ['S.2.5'], evidence_expected: 'Process validation summary for the API', category: 'Process Validation' },
    ],
  },
  {
    id: 'ich-q11', code: 'ICH Q11', title: 'Development and Manufacture of Drug Substances', agency: 'ICH', version: '2012',
    description: 'Approaches to developing and understanding the manufacturing process and control strategy for drug substances.',
    domain: 'process_validation', ds_ctd_tags: ['S.2.2', 'S.2.5', 'S.4'], dp_ctd_tags: [],
    why_it_matters: 'DS manufacturing process development, control strategy and validation.',
    reference_url: 'https://database.ich.org/sites/default/files/Q11_Guideline.pdf', modalities: ALL_MODALITIES,
    rules: [
      { id: 'q11-001', guideline_id: 'ich-q11', rule_id_code: 'Q11-001', rule_text: 'A control strategy linking material attributes and process parameters to drug substance CQAs shall be described.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS'], ctd_sections: ['S.2.5', 'S.2.6'], evidence_expected: 'Control strategy and CQA linkage', category: 'Control Strategy' },
    ],
  },
  {
    id: 'ich-q9', code: 'ICH Q9(R1)', title: 'Quality Risk Management', agency: 'ICH', version: 'R1 (2023)',
    description: 'Risk-based principles for justifying critical process parameters, CQAs and control strategies.',
    domain: 'process_validation', ds_ctd_tags: ['S.2.5', 'S.4'], dp_ctd_tags: ['P.3.5', 'P.5'],
    why_it_matters: 'Risk-based justification of CPPs, CQAs and control strategies.',
    reference_url: 'https://database.ich.org/sites/default/files/ICH_Q9%28R1%29_Guideline_Step4_2023_0126_0.pdf', modalities: ALL_MODALITIES,
    rules: [
      { id: 'q9-001', guideline_id: 'ich-q9', rule_id_code: 'Q9-001', rule_text: 'A documented quality risk assessment should justify the selection of critical process parameters and the control strategy.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.2.5', 'P.3.5'], evidence_expected: 'Risk assessment justifying CPPs / control strategy', category: 'Risk Management' },
    ],
  },
  {
    id: 'ich-q10', code: 'ICH Q10', title: 'Pharmaceutical Quality System', agency: 'ICH', version: '2008',
    description: 'Lifecycle quality system covering PQS, CAPA, change management and continued process verification.',
    domain: 'process_validation', ds_ctd_tags: ['S.2.5', 'S.4'], dp_ctd_tags: ['P.3.5', 'P.5'],
    why_it_matters: 'Lifecycle management, PQS, CAPA, change management and CPV.',
    reference_url: 'https://database.ich.org/sites/default/files/Q10_Guideline.pdf', modalities: ALL_MODALITIES,
    rules: [
      { id: 'q10-001', guideline_id: 'ich-q10', rule_id_code: 'Q10-001', rule_text: 'A continued process verification (CPV) approach should be described to monitor the process during routine production.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.2.5', 'P.3.5'], evidence_expected: 'Continued process verification / monitoring plan', category: 'Lifecycle Management' },
    ],
  },
  {
    id: 'ich-q8', code: 'ICH Q8(R2)', title: 'Pharmaceutical Development', agency: 'ICH', version: 'R2 (2009)',
    description: 'Drug product formulation and process development, design space and control strategy justification.',
    domain: 'process_validation', ds_ctd_tags: [], dp_ctd_tags: ['P.2', 'P.3.5', 'P.5'],
    why_it_matters: 'DP formulation, design space and process parameter justification.',
    reference_url: 'https://database.ich.org/sites/default/files/Q8_R2_Guideline.pdf', modalities: ALL_MODALITIES,
    rules: [
      { id: 'q8-001', guideline_id: 'ich-q8', rule_id_code: 'Q8-001', rule_text: 'Critical quality attributes of the drug product and their link to formulation and process should be described.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DP'], ctd_sections: ['P.2', 'P.3.5'], evidence_expected: 'Pharmaceutical development discussion linking CQAs to process', category: 'Pharmaceutical Development' },
    ],
  },
  {
    id: 'ich-q12', code: 'ICH Q12', title: 'Lifecycle Management', agency: 'ICH', version: '2019',
    description: 'Framework for post-approval change management and established conditions (ECs).',
    domain: 'process_validation', ds_ctd_tags: ['S.2.5', 'S.4'], dp_ctd_tags: ['P.3.5', 'P.5'],
    why_it_matters: 'Post-approval change management and established conditions (ECs).',
    reference_url: 'https://database.ich.org/sites/default/files/ICH_Q12_Guideline_Step4_2019_1119.pdf', modalities: ALL_MODALITIES,
    rules: [
      { id: 'q12-001', guideline_id: 'ich-q12', rule_id_code: 'Q12-001', rule_text: 'Established conditions and a post-approval change management protocol should be identified where applicable.', requirement_level: 'MAY', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.2.5', 'P.3.5'], evidence_expected: 'Established conditions / PACMP statement', category: 'Lifecycle Management' },
    ],
  },
  {
    id: 'ich-q13', code: 'ICH Q13', title: 'Continuous Manufacturing of Drug Substances and Drug Products', agency: 'ICH', version: '2023',
    description: 'Validation and control strategy expectations for continuous manufacturing processes.',
    domain: 'process_validation', ds_ctd_tags: ['S.2.2', 'S.2.5'], dp_ctd_tags: ['P.3.3', 'P.3.5'],
    why_it_matters: 'Validation and control strategy for continuous processes.',
    reference_url: 'https://database.ich.org/sites/default/files/ICH_Q13_Step4_Guideline_2023_0316.pdf', modalities: ALL_MODALITIES,
    rules: [
      { id: 'q13-001', guideline_id: 'ich-q13', rule_id_code: 'Q13-001', rule_text: 'For continuous manufacturing, the control strategy shall address state of control, residence time distribution and material traceability.', requirement_level: 'MUST', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.2.5', 'P.3.5'], evidence_expected: 'Continuous manufacturing control strategy (only if CM is used)', category: 'Continuous Manufacturing' },
    ],
  },
  {
    id: 'ich-q5a', code: 'ICH Q5A(R2)', title: 'Viral Safety Evaluation of Biotechnology Products', agency: 'ICH', version: 'R2 (2023)',
    description: 'Validation of viral clearance and viral safety for biotech/biological drug substances.',
    domain: 'process_validation', ds_ctd_tags: ['S.2.5', 'A.2'], dp_ctd_tags: [],
    why_it_matters: 'Validation of viral clearance for biotech/biological products.',
    reference_url: 'https://database.ich.org/sites/default/files/ICH_Q5A%28R2%29_Guideline_2023_1101.pdf', modalities: BIO_MODALITIES,
    rules: [
      { id: 'q5a-001', guideline_id: 'ich-q5a', rule_id_code: 'Q5A-001', rule_text: 'Viral clearance studies validating the manufacturing process shall be provided for products derived from cell lines of human or animal origin.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS'], ctd_sections: ['S.2.5', 'A.2'], evidence_expected: 'Viral clearance / inactivation validation data', category: 'Viral Safety' },
    ],
  },
  {
    id: 'ich-q5e', code: 'ICH Q5E', title: 'Comparability of Biotechnological/Biological Products', agency: 'ICH', version: '2004',
    description: 'Comparability assessment when manufacturing process changes are made before/after validation.',
    domain: 'process_validation', ds_ctd_tags: ['S.2.5'], dp_ctd_tags: ['P.3.5'],
    why_it_matters: 'Comparability testing for process changes before/after validation.',
    reference_url: 'https://database.ich.org/sites/default/files/Q5E%20Guideline.pdf', modalities: ['NBE', 'ATMP', 'VACCINE', 'SYNTHETIC_HYBRID'],
    rules: [
      { id: 'q5e-001', guideline_id: 'ich-q5e', rule_id_code: 'Q5E-001', rule_text: 'A comparability exercise should demonstrate that pre- and post-change material is comparable in quality, safety and efficacy.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.2.5', 'P.3.5'], evidence_expected: 'Comparability assessment for process/site/scale changes', category: 'Comparability' },
    ],
  },
  {
    id: 'ema-pv', code: 'EMA PV (Finished Products)', title: 'Process Validation for Finished Products', agency: 'EMA', version: '2016',
    description: 'EU regulatory expectations for the process validation data to be provided for finished products.',
    domain: 'process_validation', ds_ctd_tags: ['S.2.5'], dp_ctd_tags: ['P.3.5'],
    why_it_matters: 'Regulatory expectations for finished product PV data.',
    reference_url: 'https://www.ema.europa.eu/en/process-validation-finished-products-information-data-be-provided-regulatory-submissions-scientific-guideline', modalities: ALL_MODALITIES,
    rules: [
      { id: 'ema-pv-001', guideline_id: 'ema-pv', rule_id_code: 'EMA-PV-001', rule_text: 'Process validation data (traditional, continuous, or hybrid) for the finished product should be presented in the submission.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DP'], ctd_sections: ['P.3.5'], evidence_expected: 'Finished product process validation data', category: 'Process Validation' },
    ],
  },
  {
    id: 'eu-annex15', code: 'EU GMP Annex 15', title: 'Qualification and Validation', agency: 'EU GMP', version: '2015',
    description: 'European expectations for equipment qualification, process validation and cleaning validation.',
    domain: 'process_validation', ds_ctd_tags: ['S.2.5'], dp_ctd_tags: ['P.3.5'],
    why_it_matters: 'European expectations for qualification, process and cleaning validation.',
    reference_url: 'https://health.ec.europa.eu/system/files/2016-11/2015-10_annex15_en_0.pdf', modalities: ALL_MODALITIES,
    rules: [
      { id: 'annex15-001', guideline_id: 'eu-annex15', rule_id_code: 'ANNEX15-001', rule_text: 'Process validation and cleaning validation should be supported by qualified equipment and documented protocols.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.2.5', 'P.3.5'], evidence_expected: 'Qualification / cleaning validation references', category: 'Qualification & Validation' },
    ],
  },
  {
    id: 'fda-pv', code: 'FDA PV Guidance', title: 'Process Validation: General Principles and Practices', agency: 'FDA', version: '2011',
    description: 'FDA three-stage lifecycle validation framework (process design, qualification, continued verification).',
    domain: 'process_validation', ds_ctd_tags: ['S.2.5'], dp_ctd_tags: ['P.3.5'],
    why_it_matters: 'FDA 3-stage lifecycle validation framework (US expectations).',
    reference_url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/process-validation-general-principles-and-practices', modalities: ALL_MODALITIES,
    rules: [
      { id: 'fda-pv-001', guideline_id: 'fda-pv', rule_id_code: 'FDA-PV-001', rule_text: 'Process validation should follow a lifecycle approach: process design, process qualification, and continued process verification.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.2.5', 'P.3.5'], evidence_expected: 'Evidence of 3-stage lifecycle validation', category: 'Process Validation' },
    ],
  },

  // ── Stability Testing (3.2.S.7 & 3.2.P.8) ──────────────────────────
  {
    id: 'ich-q1c', code: 'ICH Q1C', title: 'Stability Testing for New Dosage Forms', agency: 'ICH', version: '1996',
    description: 'Stability testing expectations for new dosage forms of already approved drugs.',
    domain: 'stability', ds_ctd_tags: [], dp_ctd_tags: ['P.8.1', 'P.8.3'],
    why_it_matters: 'Stability testing for new dosage forms of approved APIs.',
    reference_url: 'https://database.ich.org/sites/default/files/Q1C%20Guideline.pdf', modalities: ALL_MODALITIES,
    rules: [
      { id: 'q1c-001', guideline_id: 'ich-q1c', rule_id_code: 'Q1C-001', rule_text: 'A new dosage form of an approved drug should be supported by stability studies following Q1A principles.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DP'], ctd_sections: ['P.8.1', 'P.8.3'], evidence_expected: 'Stability data for the new dosage form (if applicable)', category: 'Stability' },
    ],
  },
  {
    id: 'ich-q1d', code: 'ICH Q1D', title: 'Bracketing and Matrixing Designs for Stability Testing', agency: 'ICH', version: '2002',
    description: 'Reduced stability testing designs using bracketing and matrixing.',
    domain: 'stability', ds_ctd_tags: ['S.7.1'], dp_ctd_tags: ['P.8.1'],
    why_it_matters: 'Reduced stability testing designs (bracketing & matrixing).',
    reference_url: 'https://database.ich.org/sites/default/files/Q1D_Guideline.pdf', modalities: ALL_MODALITIES,
    rules: [
      { id: 'q1d-001', guideline_id: 'ich-q1d', rule_id_code: 'Q1D-001', rule_text: 'If a reduced design (bracketing or matrixing) is used, its justification should be documented.', requirement_level: 'MAY', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.1', 'P.8.1'], evidence_expected: 'Justification for any bracketing/matrixing design', category: 'Study Design' },
    ],
  },
  {
    id: 'ich-q1e', code: 'ICH Q1E', title: 'Evaluation of Stability Data', agency: 'ICH', version: '2003',
    description: 'Statistical evaluation and extrapolation of stability data to justify retest period / shelf life.',
    domain: 'stability', ds_ctd_tags: ['S.7.3', 'S.7.4'], dp_ctd_tags: ['P.8.3'],
    why_it_matters: 'Statistical methods for stability data and regression analysis.',
    reference_url: 'https://database.ich.org/sites/default/files/Q1E_Guideline.pdf', modalities: ALL_MODALITIES,
    rules: [
      { id: 'q1e-001', guideline_id: 'ich-q1e', rule_id_code: 'Q1E-001', rule_text: 'The proposed retest period or shelf life should be justified by appropriate evaluation (including statistical analysis where applicable) of the stability data.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.3', 'P.8.3'], evidence_expected: 'Statistical evaluation / extrapolation supporting shelf life', category: 'Data Evaluation' },
    ],
  },
  {
    id: 'ich-q5c', code: 'ICH Q5C', title: 'Stability Testing of Biotechnological/Biological Products', agency: 'ICH', version: '1995',
    description: 'Stability testing expectations specific to biotech/biological products.',
    domain: 'stability', ds_ctd_tags: ['S.7.1', 'S.7.3'], dp_ctd_tags: ['P.8.1', 'P.8.3'],
    why_it_matters: 'Biological/biotech product stability testing guidelines.',
    reference_url: 'https://database.ich.org/sites/default/files/Q5C_Guideline.pdf', modalities: BIO_MODALITIES,
    rules: [
      { id: 'q5c-001', guideline_id: 'ich-q5c', rule_id_code: 'Q5C-001', rule_text: 'Stability-indicating tests for biological activity/potency and relevant degradation pathways shall be included in the stability programme.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.1', 'P.8.1'], evidence_expected: 'Potency / stability-indicating assays in the stability protocol', category: 'Biological Stability' },
    ],
  },
  {
    id: 'ema-stability', code: 'EMA Stability', title: 'Stability Testing of Existing Active Substances and Related Finished Products', agency: 'EMA', version: '2003',
    description: 'EU-specific stability expectations for existing active substances and related finished products.',
    domain: 'stability', ds_ctd_tags: ['S.7.1', 'S.7.3'], dp_ctd_tags: ['P.8.1', 'P.8.3'],
    why_it_matters: 'EU-specific stability guidelines for existing substances and DP.',
    reference_url: 'https://www.ema.europa.eu/en/stability-testing-existing-active-substances-related-finished-products-scientific-guideline', modalities: ALL_MODALITIES,
    rules: [
      { id: 'ema-stab-001', guideline_id: 'ema-stability', rule_id_code: 'EMA-STAB-001', rule_text: 'Stability data should support the proposed shelf life and storage statement for the EU market.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.3', 'P.8.3'], evidence_expected: 'Shelf life and storage statement supported by data', category: 'Stability' },
    ],
  },
  {
    id: 'fda-stability', code: 'FDA Stability', title: 'Q1A(R2) Stability Testing (FDA-adopted)', agency: 'FDA', version: '2003',
    description: 'US FDA-adopted core stability testing requirements (ICH Q1A(R2)).',
    domain: 'stability', ds_ctd_tags: ['S.7.1', 'S.7.3'], dp_ctd_tags: ['P.8.1', 'P.8.3'],
    why_it_matters: 'US FDA-adopted core stability testing requirements.',
    reference_url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/q1ar2-stability-testing-new-drug-substances-and-products', modalities: ALL_MODALITIES,
    rules: [
      { id: 'fda-stab-001', guideline_id: 'fda-stability', rule_id_code: 'FDA-STAB-001', rule_text: 'Stability data should meet FDA-adopted ICH conditions for long-term and accelerated storage.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.3', 'P.8.3'], evidence_expected: 'Long-term and accelerated data per FDA/ICH conditions', category: 'Stability' },
    ],
  },
  {
    id: 'who-trs1010', code: 'WHO TRS 1010 Annex 10', title: 'Stability Testing for Climatic Zones III and IV', agency: 'WHO', version: '2018',
    description: 'Global stability requirements defining conditions for Climatic Zones III and IV.',
    domain: 'stability', ds_ctd_tags: ['S.7.1', 'S.7.3'], dp_ctd_tags: ['P.8.1', 'P.8.3'],
    why_it_matters: 'Stability testing for Climatic Zones III and IV (global registration).',
    reference_url: 'https://www.who.int/publications/m/item/trs1010-annex10', modalities: ALL_MODALITIES,
    rules: [
      { id: 'who-001', guideline_id: 'who-trs1010', rule_id_code: 'WHO-001', rule_text: 'For Zone IVb registration, long-term stability data at 30°C/75% RH should be provided.', requirement_level: 'MAY', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.7.3', 'P.8.3'], evidence_expected: 'Zone IVb (30°C/75%RH) data if targeting those markets', category: 'Climatic Zones' },
    ],
  },
];

/** Guidelines applicable to a given modality (undefined modalities → all). */
export function getApplicableGuidelines(modality: Modality = 'NCE'): ICHGuideline[] {
  return ICH_GUIDELINES.filter((g) => !g.modalities || g.modalities.includes(modality));
}

// ── AI compliance check (reads the generated document) ──────────────
const VALIDATION_RESULTS_KEY = 'ctd_validation_results';

export interface ComplianceResult {
  section_id: string;
  run_id: string;
  guideline_id: string;
  guideline_code: string;
  guideline_title: string;
  domain: RegulatoryDomain;
  reference_url?: string;
  rule: ICHRule;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  evidence_quote?: string;
  reasoning?: string;
  suggestion?: string;
}

export interface ComplianceReport {
  project_id: string;
  modality: Modality;
  generated_at: string;
  /** false when we fell back to the rule-based heuristic (AI unavailable). */
  ai_powered: boolean;
  results: ComplianceResult[];
  summary: { total: number; pass: number; fail: number; warning: number; not_applicable: number; score: number };
  sections_checked: string[];
}

function ruleAppliesToModality(rule: ICHRule, guideline: ICHGuideline, modality: Modality): boolean {
  const mods = rule.modalities ?? guideline.modalities;
  return !mods || mods.includes(modality);
}

/** For a section id (e.g. 'S.7.3'), the {guideline, rule} pairs that apply for a modality. */
function rulesForSection(sectionId: string, modality: Modality): { guideline: ICHGuideline; rule: ICHRule }[] {
  const pairs: { guideline: ICHGuideline; rule: ICHRule }[] = [];
  for (const guideline of getApplicableGuidelines(modality)) {
    for (const rule of guideline.rules) {
      if (rule.ctd_sections.includes(sectionId) && ruleAppliesToModality(rule, guideline, modality)) {
        pairs.push({ guideline, rule });
      }
    }
  }
  return pairs;
}

function summarize(results: ComplianceResult[]): ComplianceReport['summary'] {
  const total = results.length;
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const warning = results.filter((r) => r.status === 'warning').length;
  const not_applicable = results.filter((r) => r.status === 'not_applicable').length;
  const applicable = total - not_applicable;
  const score = applicable > 0 ? Math.round((pass / applicable) * 100) : 0;
  return { total, pass, fail, warning, not_applicable, score };
}

/** Most-recent completed run per section for a project. */
function latestRunsBySection(projectId: string): (GenerationRun & { project_id?: string })[] {
  const allRuns = getStorage<(GenerationRun & { project_id?: string })[]>(STORAGE_KEYS.GENERATION_RUNS, []);
  const completed = allRuns.filter((r) => r.project_id === projectId && r.status === 'completed' && r.section_id);
  const bySection = new Map<string, GenerationRun & { project_id?: string }>();
  for (const run of completed) {
    const existing = bySection.get(run.section_id!);
    if (!existing || new Date(run.created_at).getTime() > new Date(existing.created_at).getTime()) {
      bySection.set(run.section_id!, run);
    }
  }
  return [...bySection.values()];
}

/** Build a compliance report from the rule-based heuristic (AI-unavailable fallback). */
function heuristicReport(projectId: string, modality: Modality): ComplianceReport {
  const { results: gap } = runGapAssessment(projectId);
  const applicableIds = new Set(getApplicableGuidelines(modality).map((g) => g.id));
  const results: ComplianceResult[] = gap
    .filter((r) => applicableIds.has(r.guideline_id))
    .map((r) => {
      const guideline = ICH_GUIDELINES.find((g) => g.id === r.guideline_id);
      return {
        section_id: r.rule.ctd_sections[0] || '',
        run_id: '',
        guideline_id: r.guideline_id,
        guideline_code: r.guideline_code,
        guideline_title: guideline?.title || '',
        domain: guideline?.domain || 'general',
        reference_url: guideline?.reference_url,
        rule: r.rule,
        status: r.status,
        reasoning: r.detail,
      };
    });
  return {
    project_id: projectId,
    modality,
    generated_at: new Date().toISOString(),
    ai_powered: false,
    results,
    summary: summarize(results),
    sections_checked: [...new Set(results.map((r) => r.section_id).filter(Boolean))],
  };
}

export const compliance = {
  /** Return the last cached report for a project, if any. */
  getCached: (projectId: string): ComplianceReport | null => {
    const all = getStorage<Record<string, ComplianceReport>>(VALIDATION_RESULTS_KEY, {});
    return all[projectId] || null;
  },

  /**
   * Run the AI compliance check: for each generated section, ask the model to
   * judge the applicable rules against the actual document content. Falls back
   * to the rule-based heuristic if the API is unavailable. Result is cached.
   */
  run: async (projectId: string): Promise<ComplianceReport> => {
    const project = getStorage<Project[]>(STORAGE_KEYS.PROJECTS, []).find((p) => p.id === projectId);
    const modality: Modality = project?.modality ?? 'NCE';
    const runs = latestRunsBySection(projectId);
    const htmlStore = getStorage<Record<string, string>>(GENERATED_HTML_KEY, {});

    const results: ComplianceResult[] = [];
    let anySucceeded = false;
    let anyAttempted = false;

    for (const run of runs) {
      const sectionId = run.section_id!;
      const pairs = rulesForSection(sectionId, modality);
      if (pairs.length === 0) continue;

      const html = run.outputs?.html ? htmlStore[run.outputs.html] : '';
      if (!html) continue;

      anyAttempted = true;
      try {
        const response = await fetch(`${API_BASE}/api/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            section: sectionId,
            modality,
            document_html: html,
            rules: pairs.map(({ rule }) => ({
              rule_id: rule.id,
              rule_id_code: rule.rule_id_code,
              rule_text: rule.rule_text,
              requirement_level: rule.requirement_level,
              severity: rule.severity,
              evidence_expected: rule.evidence_expected,
            })),
          }),
        });
        if (!response.ok) throw new Error(`validate failed: ${response.status}`);
        const data = await response.json();
        const verdicts: Record<string, { status: ComplianceResult['status']; evidence_quote?: string; reasoning?: string; suggestion?: string }> = {};
        for (const v of data.verdicts || []) verdicts[v.rule_id] = v;
        anySucceeded = true;

        for (const { guideline, rule } of pairs) {
          const v = verdicts[rule.id];
          results.push({
            section_id: sectionId,
            run_id: run.run_id,
            guideline_id: guideline.id,
            guideline_code: guideline.code,
            guideline_title: guideline.title,
            domain: guideline.domain || 'general',
            reference_url: guideline.reference_url,
            rule,
            status: v?.status || 'warning',
            evidence_quote: v?.evidence_quote,
            reasoning: v?.reasoning || (v ? '' : 'No verdict returned for this rule.'),
            suggestion: v?.suggestion,
          });
        }
      } catch (err) {
        console.error('Compliance check failed for section', sectionId, err);
        // Leave this section's rules out of the AI results; handled by fallback below.
      }
    }

    // If we attempted sections but every call failed, fall back to the heuristic.
    if (anyAttempted && !anySucceeded) {
      const report = heuristicReport(projectId, modality);
      const all = getStorage<Record<string, ComplianceReport>>(VALIDATION_RESULTS_KEY, {});
      all[projectId] = report;
      setStorage(VALIDATION_RESULTS_KEY, all);
      return report;
    }

    const report: ComplianceReport = {
      project_id: projectId,
      modality,
      generated_at: new Date().toISOString(),
      ai_powered: anySucceeded,
      results,
      summary: summarize(results),
      sections_checked: [...new Set(results.map((r) => r.section_id).filter(Boolean))],
    };
    const all = getStorage<Record<string, ComplianceReport>>(VALIDATION_RESULTS_KEY, {});
    all[projectId] = report;
    setStorage(VALIDATION_RESULTS_KEY, all);
    return report;
  },
};

// Expose for UI
export function getICHGuidelines(): ICHGuideline[] {
  return ICH_GUIDELINES;
}

// Gap assessment: evaluate project data against ICH rules
export interface GapAssessmentResult {
  guideline_id: string;
  guideline_code: string;
  rule: ICHRule;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  detail: string;
}

export function runGapAssessment(projectId: string): {
  results: GapAssessmentResult[];
  summary: { total: number; pass: number; fail: number; warning: number; not_applicable: number; score: number };
} {
  // Gather project data to evaluate
  const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
  const docs = (allDocs[projectId] || []).filter((d) => d.source !== 'veeva');
  const allStudies = getStorage<Record<string, Study[]>>(STORAGE_KEYS.STUDIES, {});
  const projectStudies = allStudies[projectId] || [];
  const allLots = getStorage<Record<string, Lot[]>>(STORAGE_KEYS.LOTS, {});
  const projectLots = allLots[projectId] || [];
  const allConditions = getStorage<Record<string, StorageCondition[]>>(STORAGE_KEYS.CONDITIONS, {});
  const projectConditions = allConditions[projectId] || [];
  const allAttrs = getStorage<Record<string, QualityAttribute[]>>(STORAGE_KEYS.ATTRIBUTES, {});
  const projectAttrs = allAttrs[projectId] || [];
  const allRuns = getStorage<(GenerationRun & { project_id?: string })[]>(STORAGE_KEYS.GENERATION_RUNS, []);
  const projectRuns = allRuns.filter((r) => r.project_id === projectId && r.status === 'completed');
  const completedSections = new Set(projectRuns.map((r) => r.section_id).filter(Boolean));

  const hasDocType = (cls: string) => docs.some((d) => d.classification === cls);
  const hasStabilityDocs = hasDocType('stability_report') || hasDocType('stability_plan');
  const hasCoA = hasDocType('coa');
  const longTermCondition = projectConditions.some((c) => c.label?.toLowerCase().includes('long') || (c.temperature_setpoint !== undefined && c.temperature_setpoint <= 30));
  const acceleratedCondition = projectConditions.some((c) => c.label?.toLowerCase().includes('accel') || (c.temperature_setpoint !== undefined && c.temperature_setpoint >= 40));
  const dsLots = projectLots.length;
  const hasStudies = projectStudies.length > 0;

  const results: GapAssessmentResult[] = [];

  for (const guideline of ICH_GUIDELINES) {
    for (const rule of guideline.rules) {
      let status: GapAssessmentResult['status'] = 'warning';
      let detail = '';

      // Smart evaluation based on rule ID
      switch (rule.id) {
        // Q1A rules
        case 'q1a-001':
          if (longTermCondition && hasStabilityDocs) { status = 'pass'; detail = 'Long-term condition (25°C/60%RH) found with stability documents uploaded.'; }
          else if (!longTermCondition) { status = 'fail'; detail = 'No long-term storage condition (25°C/60%RH) defined in project.'; }
          else { status = 'warning'; detail = 'Long-term condition exists but no stability reports uploaded.'; }
          break;
        case 'q1a-002':
          if (acceleratedCondition && hasStabilityDocs) { status = 'pass'; detail = 'Accelerated condition (40°C/75%RH) found with stability documents.'; }
          else if (!acceleratedCondition) { status = 'fail'; detail = 'No accelerated storage condition (40°C/75%RH) defined in project.'; }
          else { status = 'warning'; detail = 'Accelerated condition exists but no stability reports uploaded.'; }
          break;
        case 'q1a-003':
          if (dsLots >= 3) { status = 'pass'; detail = `${dsLots} lots defined (≥3 required for DS).`; }
          else if (dsLots > 0) { status = 'fail'; detail = `Only ${dsLots} lot(s) defined. Minimum 3 primary batches required.`; }
          else { status = 'fail'; detail = 'No lots defined. Minimum 3 primary batches required for DS stability.'; }
          break;
        case 'q1a-004':
          if (dsLots >= 2) { status = 'pass'; detail = `${dsLots} lots defined (≥2 required for DP).`; }
          else if (dsLots > 0) { status = 'fail'; detail = `Only ${dsLots} lot(s) defined. Minimum 2 batches required for DP.`; }
          else { status = 'fail'; detail = 'No lots defined. Minimum 2 batches required for DP stability.'; }
          break;
        case 'q1a-005':
          if (hasStudies && hasStabilityDocs) { status = 'pass'; detail = 'Studies and stability data present. Verify testing timepoints in generated output.'; }
          else { status = 'warning'; detail = 'Unable to verify testing frequency. Ensure timepoints follow Q1A guidance.'; }
          break;
        case 'q1a-006':
          if (completedSections.has('S.7.1') || completedSections.has('P.8.1')) { status = 'pass'; detail = 'Stability summary section generated — should contain retest period.'; }
          else { status = 'fail'; detail = 'Stability summary not yet generated. Retest period / shelf life must be proposed.'; }
          break;
        case 'q1a-007':
          if (completedSections.has('S.7.3') || completedSections.has('P.8.3')) { status = 'pass'; detail = 'Stability data section generated with tabular data.'; }
          else { status = 'warning'; detail = 'Stability data section not yet generated.'; }
          break;
        case 'q1a-008':
          if (completedSections.has('S.7.2') || completedSections.has('P.8.2')) { status = 'pass'; detail = 'Post-approval stability protocol section generated.'; }
          else { status = 'warning'; detail = 'Post-approval stability protocol not yet generated. Recommended for submission.'; }
          break;
        case 'q1a-009':
          if (hasStabilityDocs) { status = 'warning'; detail = 'Verify container closure system matches marketing container in stability reports.'; }
          else { status = 'fail'; detail = 'No stability documents uploaded. Cannot verify container closure system.'; }
          break;
        case 'q1a-010':
          if (projectAttrs.length > 0) { status = 'pass'; detail = `${projectAttrs.length} quality attributes defined with acceptance criteria.`; }
          else { status = 'fail'; detail = 'No quality attributes defined. Specifications must include acceptance criteria.'; }
          break;
        // Q1B rules
        case 'q1b-001':
          if (hasStabilityDocs) { status = 'warning'; detail = 'Verify photostability data is included in stability reports.'; }
          else { status = 'fail'; detail = 'No stability documents uploaded. Photostability testing required.'; }
          break;
        case 'q1b-002':
          status = 'warning'; detail = 'Verify light exposure conditions (≥1.2M lux hours, ≥200 Wh/m²) are documented.';
          break;
        case 'q1b-003':
          status = 'not_applicable'; detail = 'Requires photostability result assessment. Verify if DS is photolabile.';
          break;
        // Q3A rules
        case 'q3a-001':
        case 'q3a-002':
        case 'q3a-003':
          if (hasCoA || docs.some((d) => d.classification === 'technical_report')) { status = 'warning'; detail = 'Supporting documents uploaded. Verify impurity data in CoA / technical reports.'; }
          else { status = 'fail'; detail = 'No CoA or technical reports uploaded. Cannot verify impurity reporting.'; }
          break;
        case 'q3a-004':
          if (completedSections.has('S.4.5')) { status = 'pass'; detail = 'Justification of specification section generated.'; }
          else { status = 'warning'; detail = 'Justification of specification section not yet generated.'; }
          break;
        case 'q3a-005':
          if (completedSections.has('S.4.3')) { status = 'pass'; detail = 'Validation of analytical procedures section generated.'; }
          else { status = 'warning'; detail = 'Analytical procedure validation section not yet generated.'; }
          break;
        // Q3B rules
        case 'q3b-001':
        case 'q3b-002':
          if (hasCoA) { status = 'warning'; detail = 'CoA uploaded. Verify degradation product reporting in documents.'; }
          else { status = 'fail'; detail = 'No CoA uploaded. Cannot assess degradation product reporting.'; }
          break;
        case 'q3b-003':
          status = 'warning'; detail = 'Verify degradation pathways are discussed based on stress testing and stability data.';
          break;
        // Q6A rules
        case 'q6a-001':
          if (projectAttrs.length >= 3) { status = 'pass'; detail = `${projectAttrs.length} quality attributes defined including key tests.`; }
          else if (projectAttrs.length > 0) { status = 'warning'; detail = `Only ${projectAttrs.length} attribute(s). Verify description, ID, assay, and impurities are included.`; }
          else { status = 'fail'; detail = 'No specifications defined. Must include description, identification, assay, and impurities.'; }
          break;
        case 'q6a-002':
        case 'q6a-003':
          if (projectAttrs.length > 0) { status = 'warning'; detail = 'Verify this test is included in the drug product specification.'; }
          else { status = 'fail'; detail = 'No quality attributes defined for drug product.'; }
          break;
        case 'q6a-004':
          if (completedSections.has('S.4.5') || completedSections.has('P.5.6')) { status = 'pass'; detail = 'Justification of specification section generated.'; }
          else { status = 'warning'; detail = 'Justification of specification not yet generated.'; }
          break;
        // Q2 rules
        case 'q2-001':
          if (completedSections.has('S.4.3') || completedSections.has('P.5.3')) { status = 'pass'; detail = 'Validation of analytical procedures section generated.'; }
          else { status = 'warning'; detail = 'Analytical validation section not yet generated.'; }
          break;
        case 'q2-002':
          status = 'warning'; detail = 'Verify LOD/LOQ values are established for impurity testing methods.';
          break;
        case 'q2-003':
          status = 'warning'; detail = 'Verify system suitability criteria are defined in analytical procedures.';
          break;
        default:
          status = 'warning'; detail = 'Manual verification required.';
      }

      results.push({ guideline_id: guideline.id, guideline_code: guideline.code, rule, status, detail });
    }
  }

  const total = results.length;
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const warning = results.filter((r) => r.status === 'warning').length;
  const not_applicable = results.filter((r) => r.status === 'not_applicable').length;
  const applicable = total - not_applicable;
  const score = applicable > 0 ? Math.round((pass / applicable) * 100) : 0;

  return { results, summary: { total, pass, fail, warning, not_applicable, score } };
}

// ── Regulatory (legacy API kept for compatibility) ──────────────────
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

  evaluate: async (projectId: string) => {
    await delay(500);
    const { results } = runGapAssessment(projectId);
    const blocking = results.filter((r) => r.status === 'fail' && r.rule.severity === 'BLOCK');
    return {
      timestamp: new Date().toISOString(),
      can_proceed: blocking.length === 0,
      blocking_failures: blocking.map((r) => ({ rule_id: r.rule.id, rule_id_code: r.rule.rule_id_code, result: 'FAIL' as const, severity: r.rule.severity, details: r.detail })),
      warnings: results.filter((r) => r.status === 'warning').map((r) => ({ rule_id: r.rule.id, rule_id_code: r.rule.rule_id_code, result: 'FAIL' as const, severity: 'WARN' as const, details: r.detail })),
      passes: results.filter((r) => r.status === 'pass').map((r) => ({ rule_id: r.rule.id, rule_id_code: r.rule.rule_id_code, result: 'PASS' as const, severity: r.rule.severity, details: r.detail })),
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

// ── Veeva Vault (Mock) ─────────────────────────────────────────────
const VEEVA_VAULT_KEY = 'ctd_veeva_vault';
const VEEVA_NOTIFICATIONS_KEY = 'ctd_veeva_notifications';

function seedVeevaVault(projectId: string): VeevaDocument[] {
  const docs: VeevaDocument[] = [
    {
      id: generateId('veeva'),
      vault_name: 'Stability Report — Drug Substance Lot A',
      document_number: 'DOC-2024-001',
      current_version: '3.2',
      synced_version: '3.0',
      status: 'update_available',
      last_modified: '2025-12-15T10:30:00Z',
      classification: 'stability_report',
      version_history: [
        { version: '3.2', date: '2025-12-15', change_note: 'Added 36-month data' },
        { version: '3.0', date: '2025-06-01', change_note: 'Added 24-month data' },
        { version: '2.0', date: '2024-12-01', change_note: 'Added 12-month data' },
      ],
    },
    {
      id: generateId('veeva'),
      vault_name: 'Stability Report — Drug Substance Lot B',
      document_number: 'DOC-2024-002',
      current_version: '2.1',
      synced_version: '2.1',
      status: 'steady_state',
      last_modified: '2025-09-20T14:00:00Z',
      classification: 'stability_report',
      version_history: [
        { version: '2.1', date: '2025-09-20', change_note: 'Minor formatting corrections' },
        { version: '2.0', date: '2025-06-15', change_note: 'Added 12-month data' },
      ],
    },
    {
      id: generateId('veeva'),
      vault_name: 'Certificate of Analysis — Batch 2024-PV-01',
      document_number: 'DOC-2024-003',
      current_version: '1.1',
      synced_version: '1.0',
      status: 'update_available',
      last_modified: '2025-11-05T09:15:00Z',
      classification: 'coa',
      version_history: [
        { version: '1.1', date: '2025-11-05', change_note: 'Corrected impurity value' },
        { version: '1.0', date: '2025-03-10', change_note: 'Initial release' },
      ],
    },
    {
      id: generateId('veeva'),
      vault_name: 'Process Validation Protocol — Drug Substance',
      document_number: 'DOC-2024-004',
      current_version: '2.0',
      synced_version: undefined,
      status: 'new',
      last_modified: '2025-10-28T16:45:00Z',
      classification: 'technical_report',
      version_history: [
        { version: '2.0', date: '2025-10-28', change_note: 'Updated acceptance criteria' },
        { version: '1.0', date: '2025-01-15', change_note: 'Initial protocol' },
      ],
    },
    {
      id: generateId('veeva'),
      vault_name: 'Stability Plan — Drug Substance',
      document_number: 'DOC-2024-005',
      current_version: '1.3',
      synced_version: '1.3',
      status: 'steady_state',
      last_modified: '2025-08-12T11:20:00Z',
      classification: 'stability_plan',
      version_history: [
        { version: '1.3', date: '2025-08-12', change_note: 'Added photostability protocol' },
        { version: '1.2', date: '2025-04-20', change_note: 'Added intermediate conditions' },
        { version: '1.0', date: '2024-11-01', change_note: 'Initial plan' },
      ],
    },
    {
      id: generateId('veeva'),
      vault_name: 'Accelerated Stability Report — Drug Substance',
      document_number: 'DOC-2025-001',
      current_version: '1.0',
      synced_version: undefined,
      status: 'new',
      last_modified: '2026-01-20T08:30:00Z',
      classification: 'stability_report',
      version_history: [
        { version: '1.0', date: '2026-01-20', change_note: 'Initial 6-month accelerated study' },
      ],
    },
  ];

  const allVaults = getStorage<Record<string, VeevaDocument[]>>(VEEVA_VAULT_KEY, {});
  allVaults[projectId] = docs;
  setStorage(VEEVA_VAULT_KEY, allVaults);

  // Create notifications for update_available and new docs
  const notifs: VeevaNotification[] = docs
    .filter((d) => d.status !== 'steady_state')
    .map((d) => ({
      id: generateId('vnotif'),
      veeva_doc_id: d.id,
      document_name: d.vault_name,
      document_number: d.document_number,
      new_version: d.current_version,
      created_at: d.last_modified,
      dismissed: false,
    }));

  const allNotifs = getStorage<Record<string, VeevaNotification[]>>(VEEVA_NOTIFICATIONS_KEY, {});
  allNotifs[projectId] = notifs;
  setStorage(VEEVA_NOTIFICATIONS_KEY, allNotifs);

  return docs;
}

export const veeva = {
  getVault: async (projectId: string) => {
    await delay();
    const allVaults = getStorage<Record<string, VeevaDocument[]>>(VEEVA_VAULT_KEY, {});
    if (!allVaults[projectId]) {
      return { items: seedVeevaVault(projectId) };
    }
    return { items: allVaults[projectId] };
  },

  sync: async (projectId: string, veevaDocId: string) => {
    await delay(800);
    const allVaults = getStorage<Record<string, VeevaDocument[]>>(VEEVA_VAULT_KEY, {});
    const docs = allVaults[projectId] || [];
    const doc = docs.find((d) => d.id === veevaDocId);
    if (!doc) throw new Error('Veeva document not found');

    // Update synced version
    doc.synced_version = doc.current_version;
    doc.status = 'steady_state';
    setStorage(VEEVA_VAULT_KEY, allVaults);

    // Create/update a document in the project
    const mockText = `[Synced from Veeva Vault]\nDocument: ${doc.vault_name}\nVersion: ${doc.current_version}\nDocument Number: ${doc.document_number}\nLast Modified: ${doc.last_modified}\n\nThis document was synced from Veeva Vault. In a production environment, the full document content would be extracted here.`;
    await documents.upload(projectId, `${doc.document_number}_v${doc.current_version}.pdf`, mockText, doc.classification, 'veeva');

    // Dismiss related notification
    const allNotifs = getStorage<Record<string, VeevaNotification[]>>(VEEVA_NOTIFICATIONS_KEY, {});
    const notifs = allNotifs[projectId] || [];
    const notif = notifs.find((n) => n.veeva_doc_id === veevaDocId);
    if (notif) notif.dismissed = true;
    setStorage(VEEVA_NOTIFICATIONS_KEY, allNotifs);

    return doc;
  },

  syncAll: async (projectId: string) => {
    await delay(500);
    const allVaults = getStorage<Record<string, VeevaDocument[]>>(VEEVA_VAULT_KEY, {});
    const docs = allVaults[projectId] || [];
    const toSync = docs.filter((d) => d.status !== 'steady_state');

    for (const doc of toSync) {
      doc.synced_version = doc.current_version;
      doc.status = 'steady_state';

      const mockText = `[Synced from Veeva Vault]\nDocument: ${doc.vault_name}\nVersion: ${doc.current_version}\nDocument Number: ${doc.document_number}\nLast Modified: ${doc.last_modified}\n\nThis document was synced from Veeva Vault.`;
      await documents.upload(projectId, `${doc.document_number}_v${doc.current_version}.pdf`, mockText, doc.classification, 'veeva');
    }

    setStorage(VEEVA_VAULT_KEY, allVaults);

    // Dismiss all notifications
    const allNotifs = getStorage<Record<string, VeevaNotification[]>>(VEEVA_NOTIFICATIONS_KEY, {});
    const notifs = allNotifs[projectId] || [];
    notifs.forEach((n) => { n.dismissed = true; });
    setStorage(VEEVA_NOTIFICATIONS_KEY, allNotifs);

    return { synced: toSync.length };
  },

  getNotifications: async (projectId: string) => {
    await delay();
    const allNotifs = getStorage<Record<string, VeevaNotification[]>>(VEEVA_NOTIFICATIONS_KEY, {});
    if (!allNotifs[projectId]) {
      // Seed vault first if needed
      const allVaults = getStorage<Record<string, VeevaDocument[]>>(VEEVA_VAULT_KEY, {});
      if (!allVaults[projectId]) seedVeevaVault(projectId);
    }
    const notifs = allNotifs[projectId] || [];
    return { items: notifs.filter((n) => !n.dismissed) };
  },

  dismissNotification: async (projectId: string, notifId: string) => {
    await delay();
    const allNotifs = getStorage<Record<string, VeevaNotification[]>>(VEEVA_NOTIFICATIONS_KEY, {});
    const notifs = allNotifs[projectId] || [];
    const notif = notifs.find((n) => n.id === notifId);
    if (notif) notif.dismissed = true;
    setStorage(VEEVA_NOTIFICATIONS_KEY, allNotifs);
  },
};

// ── Paragraph editor state (locks, comments, versions) ─────────────
//
// All paragraph-level state is keyed by `run_id` (one generation run) then
// by `pid` (the data-pid emitted by the backend). Everything lives in
// localStorage; no backend persistence yet. We keep this completely
// separate from the run/HTML storage so we don't bloat those records.

const PARAGRAPH_STATE_KEY = 'ctd_paragraph_state';
const PARAGRAPH_COMMENTS_KEY = 'ctd_paragraph_comments';
const VERSION_HISTORY_LIMIT = 3;

type ParagraphStateStore = Record<string /* runId */, Record<string /* pid */, ParagraphState>>;
type ParagraphCommentsStore = Record<string /* runId */, ParagraphComment[]>;

function loadParagraphState(): ParagraphStateStore {
  return getStorage<ParagraphStateStore>(PARAGRAPH_STATE_KEY, {});
}
function loadComments(): ParagraphCommentsStore {
  return getStorage<ParagraphCommentsStore>(PARAGRAPH_COMMENTS_KEY, {});
}

export const paragraphs = {
  /** All paragraph-level state for a given run, keyed by pid. */
  getStates: (runId: string): Record<string, ParagraphState> => {
    const all = loadParagraphState();
    return all[runId] || {};
  },

  /** Lock or unlock a paragraph. Locked paragraphs are preserved on regeneration. */
  setLocked: (runId: string, pid: string, locked: boolean): ParagraphState => {
    const all = loadParagraphState();
    if (!all[runId]) all[runId] = {};
    if (!all[runId][pid]) all[runId][pid] = {};
    all[runId][pid].locked = locked;
    setStorage(PARAGRAPH_STATE_KEY, all);
    return all[runId][pid];
  },

  /**
   * Capture a paragraph snapshot in the rolling version history.
   * Keeps the most recent VERSION_HISTORY_LIMIT entries.
   */
  pushVersion: (runId: string, pid: string, version: ParagraphVersion): void => {
    const all = loadParagraphState();
    if (!all[runId]) all[runId] = {};
    if (!all[runId][pid]) all[runId][pid] = {};
    const versions = all[runId][pid].versions || [];
    versions.push(version);
    if (versions.length > VERSION_HISTORY_LIMIT) versions.splice(0, versions.length - VERSION_HISTORY_LIMIT);
    all[runId][pid].versions = versions;
    setStorage(PARAGRAPH_STATE_KEY, all);
  },

  /**
   * Record a pending track-change for the given pid. The reviewer will
   * later accept (keep `after_html`) or reject (revert to `before_html`).
   */
  setPendingChange: (runId: string, pid: string, beforeHtml: string, afterHtml: string): void => {
    const all = loadParagraphState();
    if (!all[runId]) all[runId] = {};
    if (!all[runId][pid]) all[runId][pid] = {};
    all[runId][pid].pending_change = {
      before_html: beforeHtml,
      after_html: afterHtml,
      captured_at: new Date().toISOString(),
    };
    setStorage(PARAGRAPH_STATE_KEY, all);
  },

  clearPendingChange: (runId: string, pid: string): void => {
    const all = loadParagraphState();
    if (all[runId]?.[pid]?.pending_change) {
      delete all[runId][pid].pending_change;
      setStorage(PARAGRAPH_STATE_KEY, all);
    }
  },

  /** Get all comments for a run, optionally filtered by pid. */
  getComments: (runId: string, pid?: string): ParagraphComment[] => {
    const all = loadComments();
    const items = all[runId] || [];
    return pid ? items.filter((c) => c.pid === pid) : items;
  },

  addComment: (runId: string, pid: string, text: string, author: string = 'Local User'): ParagraphComment => {
    const all = loadComments();
    if (!all[runId]) all[runId] = [];
    const comment: ParagraphComment = {
      id: generateId('cmt'),
      pid,
      text,
      status: 'open',
      author,
      created_at: new Date().toISOString(),
    };
    all[runId].push(comment);
    setStorage(PARAGRAPH_COMMENTS_KEY, all);
    return comment;
  },

  updateComment: (runId: string, commentId: string, updates: Partial<Pick<ParagraphComment, 'text' | 'status'>>): ParagraphComment | null => {
    const all = loadComments();
    const items = all[runId] || [];
    const c = items.find((x) => x.id === commentId);
    if (!c) return null;
    if (updates.text !== undefined) c.text = updates.text;
    if (updates.status !== undefined) c.status = updates.status;
    setStorage(PARAGRAPH_COMMENTS_KEY, all);
    return c;
  },

  deleteComment: (runId: string, commentId: string): void => {
    const all = loadComments();
    if (!all[runId]) return;
    all[runId] = all[runId].filter((c) => c.id !== commentId);
    setStorage(PARAGRAPH_COMMENTS_KEY, all);
  },

  setCommentStatus: (runId: string, commentId: string, status: CommentStatus): ParagraphComment | null => {
    return paragraphs.updateComment(runId, commentId, { status });
  },

  /** Discard all paragraph state for a run (when the run is deleted). */
  clearRun: (runId: string): void => {
    const states = loadParagraphState();
    const comments = loadComments();
    if (states[runId]) {
      delete states[runId];
      setStorage(PARAGRAPH_STATE_KEY, states);
    }
    if (comments[runId]) {
      delete comments[runId];
      setStorage(PARAGRAPH_COMMENTS_KEY, comments);
    }
  },

  /** Copy the activity log across a regenerate as well (see cloneRun). */
  // (defined on the `activity` export below; cloneRun handles paragraph state)

  /**
   * Copy paragraph state (locks, versions, comments) from one run to another.
   * Used on regenerate so the new run inherits the user's prior edits — locks
   * stay locked, comment threads continue across paragraphs by pid, and
   * version history accumulates instead of resetting.
   */
  cloneRun: (fromRunId: string, toRunId: string): void => {
    const states = loadParagraphState();
    const comments = loadComments();

    const src = states[fromRunId];
    if (src) {
      const dst = states[toRunId] || {};
      for (const [pid, state] of Object.entries(src)) {
        const target = dst[pid] || {};
        if (state.locked !== undefined) target.locked = state.locked;
        if (state.versions) target.versions = [...state.versions];
        dst[pid] = target;
      }
      states[toRunId] = dst;
      setStorage(PARAGRAPH_STATE_KEY, states);
    }

    const srcComments = comments[fromRunId];
    if (srcComments && srcComments.length > 0) {
      const dst = comments[toRunId] || [];
      for (const c of srcComments) {
        dst.push({ ...c, id: generateId('cmt') });
      }
      comments[toRunId] = dst;
      setStorage(PARAGRAPH_COMMENTS_KEY, comments);
    }
  },
};

// ── Activity log (change history) ──────────────────────────────────
//
// Records every paragraph-level action so the editor can show a
// chronological "who did what, when" feed. The `actor` is currently a
// placeholder ("Local User") — getCurrentActor() is the single seam to
// wire a real authenticated identity through once login exists.

const ACTIVITY_LOG_KEY = 'ctd_activity_log';
type ActivityStore = Record<string /* runId */, ActivityEntry[]>;

function loadActivity(): ActivityStore {
  return getStorage<ActivityStore>(ACTIVITY_LOG_KEY, {});
}

/** The acting user. Replace the body with the real auth identity later;
 * every activity entry flows through here so attribution upgrades in one place. */
export function getCurrentActor(): string {
  return 'Local User';
}

export const activity = {
  /** Append an entry to a run's activity log. */
  log: (runId: string, action: ActivityAction, opts?: { pid?: string; detail?: string }): ActivityEntry => {
    const all = loadActivity();
    if (!all[runId]) all[runId] = [];
    const entry: ActivityEntry = {
      id: generateId('act'),
      run_id: runId,
      actor: getCurrentActor(),
      action,
      pid: opts?.pid,
      detail: opts?.detail,
      created_at: new Date().toISOString(),
    };
    all[runId].push(entry);
    setStorage(ACTIVITY_LOG_KEY, all);
    return entry;
  },

  /** All entries for a run, newest first. */
  list: (runId: string): ActivityEntry[] => {
    const all = loadActivity();
    return [...(all[runId] || [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  },

  /** Carry the log across a regenerate so history is continuous. */
  clone: (fromRunId: string, toRunId: string): void => {
    const all = loadActivity();
    const src = all[fromRunId];
    if (!src || src.length === 0) return;
    const dst = all[toRunId] || [];
    for (const e of src) dst.push({ ...e, id: generateId('act'), run_id: toRunId });
    all[toRunId] = dst;
    setStorage(ACTIVITY_LOG_KEY, all);
  },

  clearRun: (runId: string): void => {
    const all = loadActivity();
    if (all[runId]) {
      delete all[runId];
      setStorage(ACTIVITY_LOG_KEY, all);
    }
  },
};
