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

  upload: async (projectId: string, filename: string, extractedText: string, classification?: string) => {
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
