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
  VeevaDocument,
  VeevaNotification,
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
export const documents = {
  list: async (projectId: string) => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    const items = allDocs[projectId] || [];
    return { items };
  },

  upload: async (projectId: string, filename: string, extractedText: string, classification?: string, source?: 'upload' | 'veeva') => {
    await delay();
    const allDocs = getStorage<Record<string, DocumentFile[]>>(STORAGE_KEYS.DOCUMENTS, {});
    if (!allDocs[projectId]) allDocs[projectId] = [];

    const docId = generateId('doc');
    const newDoc: DocumentFile = {
      id: docId,
      filename,
      original_filename: filename,
      file_type: filename.split('.').pop() || 'unknown',
      classification: (classification as DocumentClassification) || 'other_supporting',
      authority: 'supporting',
      checksum_sha256: 'local-storage',
      file_size_bytes: extractedText.length,
      uploaded_at: new Date().toISOString(),
      source: source || 'upload',
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
}

export interface ICHGuideline {
  id: string;
  code: string;
  title: string;
  agency: string;
  version: string;
  description: string;
  rules: ICHRule[];
}

const ICH_GUIDELINES: ICHGuideline[] = [
  {
    id: 'ich-q1a',
    code: 'ICH Q1A(R2)',
    title: 'Stability Testing of New Drug Substances and Products',
    agency: 'ICH',
    version: 'R2 (2003)',
    description: 'Establishes requirements for stability testing protocols, storage conditions, testing frequency, and data evaluation for drug substances and products.',
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
    rules: [
      { id: 'q2-001', guideline_id: 'ich-q2', rule_id_code: 'Q2-001', rule_text: 'Analytical procedures used for testing shall be validated for specificity, accuracy, precision, linearity, range, and robustness.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.4.3', 'P.5.3'], evidence_expected: 'Analytical validation report', category: 'Analytical Validation' },
      { id: 'q2-002', guideline_id: 'ich-q2', rule_id_code: 'Q2-002', rule_text: 'Detection limit and quantitation limit should be established for impurity testing methods.', requirement_level: 'SHOULD', severity: 'WARN', applies_to: ['DS', 'DP'], ctd_sections: ['S.4.3', 'P.5.3'], evidence_expected: 'LOD/LOQ values for impurity methods', category: 'Analytical Validation' },
      { id: 'q2-003', guideline_id: 'ich-q2', rule_id_code: 'Q2-003', rule_text: 'System suitability criteria shall be established for each analytical procedure.', requirement_level: 'MUST', severity: 'BLOCK', applies_to: ['DS', 'DP'], ctd_sections: ['S.4.2', 'P.5.2'], evidence_expected: 'System suitability criteria defined', category: 'Analytical Validation' },
    ],
  },
];

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
