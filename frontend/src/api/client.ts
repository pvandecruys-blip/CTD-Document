/**
<<<<<<< HEAD
 * API client for the CTD Stability Document Generator backend.
 * Includes mock data fallback for demo purposes.
 */

import {
  MOCK_PROJECTS,
  MOCK_DOCUMENTS,
  MOCK_READINESS,
  MOCK_STUDIES,
  MOCK_LOTS,
  MOCK_CONDITIONS,
  MOCK_ATTRIBUTES,
  MOCK_VALIDATION_REPORT,
  MOCK_GENERATION_RUNS,
  MOCK_GUIDELINES,
  MOCK_RULES,
  MOCK_EXTRACTION_JOB,
  MOCK_PIVOT_VIEW,
} from './mockData';

// API URL - uses environment variable in production, defaults to relative path for local
const API_URL = import.meta.env.VITE_API_URL || '';
const BASE = `${API_URL}/api/v1`;

// Enable mock mode for demo - set VITE_USE_MOCK=false in production to use real API
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // If mock mode is enabled, throw to trigger fallback
  if (USE_MOCK) {
    throw new Error('Mock mode enabled');
  }

  const res = await fetch(`${BASE}${path}`, {
=======
 * API client for the CTD Stability Document Generator.
 *
 * Uses simplified Vercel serverless endpoints:
 * - /api/projects - Project and document management
 * - /api/generate - CTD document generation
 */

const BASE = '/api';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
>>>>>>> 68d323b42af503ce8bf62966ceab373b2c263f0e
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Helper to simulate async behavior for mock data
function mockAsync<T>(data: T, delay = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), delay));
}

// ── Projects ────────────────────────────────────────────────────────

export const projects = {
<<<<<<< HEAD
  list: async () => {
    try {
      return await request<{ items: import('../types').Project[]; total: number }>('/projects');
    } catch {
      return mockAsync({ items: MOCK_PROJECTS, total: MOCK_PROJECTS.length });
    }
  },
  get: async (id: string) => {
    try {
      return await request<import('../types').Project>(`/projects/${id}`);
    } catch {
      const project = MOCK_PROJECTS.find((p) => p.id === id);
      if (!project) throw new Error('Project not found');
      return mockAsync(project);
    }
  },
  create: async (data: { name: string; description?: string }) => {
    try {
      return await request<import('../types').Project>('/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch {
      // Create a new mock project
      const newProject: import('../types').Project = {
        id: `proj-${Date.now()}`,
        name: data.name,
        description: data.description,
        status: 'draft',
        clinical_phase: 'phase_1',
        numbering_mode: 'ctd',
        created_by: { id: 'user-1', display_name: 'Demo User', role: 'author' },
        document_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      MOCK_PROJECTS.unshift(newProject);
      return mockAsync(newProject);
    }
  },
  delete: async (id: string) => {
    try {
      return await request<void>(`/projects/${id}`, { method: 'DELETE' });
    } catch {
      const idx = MOCK_PROJECTS.findIndex((p) => p.id === id);
      if (idx !== -1) MOCK_PROJECTS.splice(idx, 1);
      return mockAsync(undefined as void);
    }
  },
=======
  list: () => request<{ items: import('../types').Project[]; total: number }>(`${BASE}/projects`),

  get: (id: string) => request<import('../types').Project>(`${BASE}/projects?id=${id}`),

  create: (data: { name: string; description?: string }) =>
    request<import('../types').Project>(`${BASE}/projects`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<import('../types').Project>) =>
    request<import('../types').Project>(`${BASE}/projects?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request<void>(`${BASE}/projects?id=${id}`, { method: 'DELETE' }),
>>>>>>> 68d323b42af503ce8bf62966ceab373b2c263f0e
};

// ── Documents ───────────────────────────────────────────────────────

export const documents = {
<<<<<<< HEAD
  list: async (projectId: string) => {
    try {
      return await request<{ items: import('../types').DocumentFile[] }>(`/projects/${projectId}/documents`);
    } catch {
      const docs = MOCK_DOCUMENTS[projectId] || [];
      return mockAsync({ items: docs });
    }
  },
  upload: async (projectId: string, file: File, classification?: string) => {
    if (!USE_MOCK) {
      const form = new FormData();
      form.append('file', file);
      if (classification) form.append('classification', classification);
      const res = await fetch(`${BASE}/projects/${projectId}/documents`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    }
    // Mock upload
    const newDoc: import('../types').DocumentFile = {
      id: `doc-${Date.now()}`,
      filename: file.name,
      original_filename: file.name,
      file_type: file.name.split('.').pop() || 'unknown',
      classification: (classification as import('../types').DocumentClassification) || 'other_supporting',
      authority: 'supporting',
      checksum_sha256: 'mock...',
      file_size_bytes: file.size,
      uploaded_at: new Date().toISOString(),
    };
    if (!MOCK_DOCUMENTS[projectId]) MOCK_DOCUMENTS[projectId] = [];
    MOCK_DOCUMENTS[projectId].push(newDoc);

    // Update project document count
    const project = MOCK_PROJECTS.find((p) => p.id === projectId);
    if (project) project.document_count++;

    return mockAsync(newDoc);
  },
  reclassify: async (projectId: string, docId: string, classification: string) => {
    if (!USE_MOCK) {
      const form = new FormData();
      form.append('classification', classification);
      const res = await fetch(`${BASE}/projects/${projectId}/documents/${docId}/classify`, {
        method: 'PUT',
        body: form,
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    }
    // Mock reclassify
    const docs = MOCK_DOCUMENTS[projectId];
    if (docs) {
      const doc = docs.find((d) => d.id === docId);
      if (doc) {
        doc.classification = classification as import('../types').DocumentClassification;
        return mockAsync(doc);
      }
    }
    throw new Error('Document not found');
  },
  delete: async (projectId: string, docId: string) => {
    try {
      return await request<void>(`/projects/${projectId}/documents/${docId}`, { method: 'DELETE' });
    } catch {
      const docs = MOCK_DOCUMENTS[projectId];
      if (docs) {
        const idx = docs.findIndex((d) => d.id === docId);
        if (idx !== -1) {
          docs.splice(idx, 1);
          const project = MOCK_PROJECTS.find((p) => p.id === projectId);
          if (project) project.document_count--;
        }
      }
      return mockAsync(undefined as void);
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
    try {
      return await request<ReadinessReport>(`/projects/${projectId}/readiness`);
    } catch {
      const report = MOCK_READINESS[projectId] || MOCK_READINESS['proj-001'];
      return mockAsync(report);
    }
  },
=======
  list: (projectId: string) =>
    request<{ items: import('../types').DocumentFile[] }>(`${BASE}/projects?id=${projectId}&documents=1`),

  /**
   * Add a document with pre-extracted text.
   * Frontend must parse the file and extract text before calling this.
   */
  upload: (
    projectId: string,
    filename: string,
    extractedText: string,
    classification?: string,
    notes?: string,
  ) =>
    request<import('../types').DocumentFile>(`${BASE}/projects?id=${projectId}&documents=1`, {
      method: 'POST',
      body: JSON.stringify({
        filename,
        extracted_text: extractedText,
        classification,
        notes,
      }),
    }),

  reclassify: (projectId: string, docId: string, classification: string) =>
    request<import('../types').DocumentFile>(`${BASE}/projects?id=${projectId}&doc_id=${docId}`, {
      method: 'PUT',
      body: JSON.stringify({ classification }),
    }),

  delete: (projectId: string, docId: string) =>
    request<void>(`${BASE}/projects?id=${projectId}&doc_id=${docId}`, { method: 'DELETE' }),
>>>>>>> 68d323b42af503ce8bf62966ceab373b2c263f0e
};

// ── Extraction ──────────────────────────────────────────────────────

export const extraction = {
<<<<<<< HEAD
  start: async (projectId: string) => {
    try {
      return await request<import('../types').ExtractionJob>(`/projects/${projectId}/extract`, { method: 'POST' });
    } catch {
      return mockAsync(MOCK_EXTRACTION_JOB, 1500); // Simulate extraction time
    }
  },
  status: async (projectId: string, jobId: string) => {
    try {
      return await request<import('../types').ExtractionJob>(`/projects/${projectId}/extract/${jobId}`);
    } catch {
      return mockAsync(MOCK_EXTRACTION_JOB);
    }
  },
=======
  start: (projectId: string) =>
    request<import('../types').ExtractionJob>(`${BASE}/projects?id=${projectId}&extract=1`, {
      method: 'POST',
    }),
>>>>>>> 68d323b42af503ce8bf62966ceab373b2c263f0e
};

// ── Studies/Lots/Conditions/Attributes ──────────────────────────────

export const studies = {
<<<<<<< HEAD
  list: async (projectId: string) => {
    try {
      return await request<{ items: import('../types').Study[] }>(`/projects/${projectId}/studies`);
    } catch {
      const studyList = MOCK_STUDIES[projectId] || MOCK_STUDIES['proj-001'] || [];
      return mockAsync({ items: studyList });
    }
  },
  update: async (projectId: string, studyId: string, data: Partial<import('../types').Study>) => {
    try {
      return await request<import('../types').Study>(`/projects/${projectId}/studies/${studyId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch {
      const studyList = MOCK_STUDIES[projectId] || MOCK_STUDIES['proj-001'];
      const study = studyList?.find((s) => s.id === studyId);
      if (study) {
        Object.assign(study, data);
        return mockAsync(study);
      }
      throw new Error('Study not found');
    }
  },
=======
  list: (projectId: string) =>
    request<{ items: import('../types').Study[] }>(`${BASE}/projects?id=${projectId}&studies=1`),
>>>>>>> 68d323b42af503ce8bf62966ceab373b2c263f0e
};

export const lots = {
<<<<<<< HEAD
  list: async (projectId: string, studyId: string) => {
    try {
      return await request<{ items: import('../types').Lot[] }>(`/projects/${projectId}/studies/${studyId}/lots`);
    } catch {
      const lotList = MOCK_LOTS[studyId] || [];
      return mockAsync({ items: lotList });
    }
  },
=======
  list: (projectId: string) =>
    request<{ items: import('../types').Lot[] }>(`${BASE}/projects?id=${projectId}&lots=1`),
>>>>>>> 68d323b42af503ce8bf62966ceab373b2c263f0e
};

export const conditions = {
<<<<<<< HEAD
  list: async (projectId: string, studyId: string) => {
    try {
      return await request<{ items: import('../types').StorageCondition[] }>(
        `/projects/${projectId}/studies/${studyId}/conditions`,
      );
    } catch {
      return mockAsync({ items: MOCK_CONDITIONS });
    }
  },
=======
  list: (projectId: string) =>
    request<{ items: import('../types').StorageCondition[] }>(
      `${BASE}/projects?id=${projectId}&conditions=1`,
    ),
>>>>>>> 68d323b42af503ce8bf62966ceab373b2c263f0e
};

export const attributes = {
<<<<<<< HEAD
  list: async (projectId: string, studyId: string) => {
    try {
      return await request<{ items: import('../types').QualityAttribute[] }>(
        `/projects/${projectId}/studies/${studyId}/attributes`,
      );
    } catch {
      return mockAsync({ items: MOCK_ATTRIBUTES });
    }
  },
};

// ── Results ─────────────────────────────────────────────────────────

export const results = {
  pivot: async (projectId: string, studyId: string, lotId: string, conditionId: string) => {
    try {
      return await request<import('../types').PivotedResultView>(
        `/projects/${projectId}/studies/${studyId}/results/pivot?lot_id=${lotId}&condition_id=${conditionId}`,
      );
    } catch {
      // Return mock pivot view with the selected lot and condition
      const lot = Object.values(MOCK_LOTS).flat().find((l) => l.id === lotId) || MOCK_PIVOT_VIEW.lot;
      const condition = MOCK_CONDITIONS.find((c) => c.id === conditionId) || MOCK_PIVOT_VIEW.condition;
      return mockAsync({
        ...MOCK_PIVOT_VIEW,
        lot,
        condition,
      });
    }
  },
};

// ── Validation ──────────────────────────────────────────────────────

export const validation = {
  run: async (projectId: string) => {
    try {
      return await request<import('../types').ValidationReport>(`/projects/${projectId}/validate`, {
        method: 'POST',
      });
    } catch {
      return mockAsync({ ...MOCK_VALIDATION_REPORT, timestamp: new Date().toISOString() }, 800);
    }
  },
};

=======
  list: (projectId: string) =>
    request<{ items: import('../types').QualityAttribute[] }>(
      `${BASE}/projects?id=${projectId}&attributes=1`,
    ),
};

>>>>>>> 68d323b42af503ce8bf62966ceab373b2c263f0e
// ── Generation ──────────────────────────────────────────────────────

export interface GenerateRequest {
  project: {
    id: string;
    name: string;
    description?: string;
  };
  studies: import('../types').Study[];
  lots: import('../types').Lot[];
  conditions: import('../types').StorageCondition[];
  attributes: import('../types').QualityAttribute[];
  documents: Array<{
    filename: string;
    extracted_text: string;
    classification?: string;
  }>;
}

export const generation = {
<<<<<<< HEAD
  start: async (projectId: string, options: import('../types').GenerationOptions) => {
    try {
      return await request<import('../types').GenerationRun>(`/projects/${projectId}/generate`, {
        method: 'POST',
        body: JSON.stringify(options),
      });
    } catch {
      // Create a new generation run
      const newRun: import('../types').GenerationRun = {
        run_id: `gen-${Date.now().toString(36)}`,
        status: 'running',
        created_at: new Date().toISOString(),
      };
      // Simulate completion after delay
      setTimeout(() => {
        newRun.status = 'completed';
        newRun.completed_at = new Date().toISOString();
        newRun.outputs = {
          html: `/api/v1/outputs/${newRun.run_id}/document.html`,
          traceability_json: `/api/v1/outputs/${newRun.run_id}/traceability.json`,
        };
        newRun.token_usage = {
          input_tokens: Math.floor(40000 + Math.random() * 10000),
          output_tokens: Math.floor(10000 + Math.random() * 5000),
        };
      }, 3000);
      return mockAsync(newRun, 500);
    }
  },
  status: async (projectId: string, runId: string) => {
    try {
      return await request<import('../types').GenerationRun>(`/projects/${projectId}/generate/${runId}`);
    } catch {
      // Return a completed run for demo
      const completedRun: import('../types').GenerationRun = {
        run_id: runId,
        status: 'completed',
        outputs: {
          html: `/api/v1/outputs/${runId}/document.html`,
          traceability_json: `/api/v1/outputs/${runId}/traceability.json`,
        },
        token_usage: {
          input_tokens: 45200,
          output_tokens: 12800,
        },
        created_at: new Date(Date.now() - 120000).toISOString(),
        completed_at: new Date().toISOString(),
      };
      return mockAsync(completedRun);
    }
  },
  list: async (projectId: string) => {
    try {
      return await request<{ items: import('../types').GenerationRun[] }>(`/projects/${projectId}/generate`);
    } catch {
      return mockAsync({ items: MOCK_GENERATION_RUNS });
    }
  },
};

// ── Regulatory ──────────────────────────────────────────────────────

export const regulatory = {
  guidelines: {
    list: async () => {
      try {
        return await request<{ items: import('../types').RegulatoryGuideline[]; total: number }>(
          '/regulatory/guidelines',
        );
      } catch {
        return mockAsync({ items: MOCK_GUIDELINES, total: MOCK_GUIDELINES.length });
      }
    },
    get: async (id: string) => {
      try {
        return await request<import('../types').RegulatoryGuideline>(`/regulatory/guidelines/${id}`);
      } catch {
        const guideline = MOCK_GUIDELINES.find((g) => g.id === id);
        if (!guideline) throw new Error('Guideline not found');
        return mockAsync(guideline);
      }
    },
    upload: async (file: File, title: string, agency: string, documentId?: string, version?: string) => {
      if (!USE_MOCK) {
        const form = new FormData();
        form.append('file', file);
        form.append('title', title);
        form.append('agency', agency);
        if (documentId) form.append('document_id', documentId);
        if (version) form.append('version', version);
        const res = await fetch(`${BASE}/regulatory/guidelines`, {
          method: 'POST',
          body: form,
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      }
      // Mock upload
      const newGuideline: import('../types').RegulatoryGuideline = {
        id: `guide-${Date.now()}`,
        title,
        agency,
        document_id: documentId,
        version,
        is_active: false,
        original_filename: file.name,
        file_checksum_sha256: 'mock...',
        allocation_pack_count: 0,
        uploaded_at: new Date().toISOString(),
      };
      MOCK_GUIDELINES.push(newGuideline);
      return mockAsync(newGuideline);
    },
    delete: async (id: string) => {
      try {
        return await request<void>(`/regulatory/guidelines/${id}`, { method: 'DELETE' });
      } catch {
        const idx = MOCK_GUIDELINES.findIndex((g) => g.id === id);
        if (idx !== -1) MOCK_GUIDELINES.splice(idx, 1);
        return mockAsync(undefined as void);
      }
    },
    allocate: async (guidelineId: string) => {
      try {
        return await request<{ job_id: string; status: string; message: string }>(
          `/regulatory/guidelines/${guidelineId}/allocate`,
          { method: 'POST' },
        );
      } catch {
        // Mock allocation - update guideline
        const guideline = MOCK_GUIDELINES.find((g) => g.id === guidelineId);
        if (guideline) {
          guideline.is_active = true;
          guideline.allocation_pack_count = 1;
        }
        return mockAsync({ job_id: `alloc-${Date.now()}`, status: 'completed', message: 'Rules extracted successfully' }, 2000);
      }
    },
    rules: async (guidelineId: string) => {
      try {
        return await request<{ items: import('../types').RegulatoryRule[] }>(
          `/regulatory/guidelines/${guidelineId}/rules`,
        );
      } catch {
        const rules = MOCK_RULES[guidelineId] || MOCK_RULES['guide-001'] || [];
        return mockAsync({ items: rules });
      }
    },
    updateRuleStatus: async (guidelineId: string, ruleId: string, status: string, justification?: string) => {
      try {
        return await request<unknown>(`/regulatory/guidelines/${guidelineId}/rules/${ruleId}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status, override_justification: justification }),
        });
      } catch {
        const rules = MOCK_RULES[guidelineId];
        if (rules) {
          const rule = rules.find((r) => r.id === ruleId);
          if (rule) {
            rule.status = status as import('../types').AllocationStatus;
            if (justification) rule.override_justification = justification;
          }
        }
        return mockAsync({ success: true });
      }
    },
    glossary: async (guidelineId: string) => {
      try {
        return await request<{ items: import('../types').RegulatoryGlossaryEntry[] }>(
          `/regulatory/guidelines/${guidelineId}/glossary`,
        );
      } catch {
        // Mock glossary
        const mockGlossary: import('../types').RegulatoryGlossaryEntry[] = [
          { id: 'gl-001', term: 'Drug Substance', definition: 'The active pharmaceutical ingredient (API) that is intended to furnish pharmacological activity.', source_page: 3 },
          { id: 'gl-002', term: 'Drug Product', definition: 'The finished dosage form that contains the drug substance, generally in association with other ingredients.', source_page: 3 },
          { id: 'gl-003', term: 'Accelerated Testing', definition: 'Studies designed to increase the rate of chemical degradation or physical change by using exaggerated storage conditions.', source_page: 4 },
          { id: 'gl-004', term: 'Long-term Testing', definition: 'Stability studies under the recommended storage conditions for the intended shelf-life.', source_page: 4 },
          { id: 'gl-005', term: 'Intermediate Testing', definition: 'Studies conducted at 30°C/65% RH designed to moderately increase the rate of degradation.', source_page: 5 },
          { id: 'gl-006', term: 'Retest Period', definition: 'The period of time during which the drug substance is expected to remain within specifications.', source_page: 6 },
          { id: 'gl-007', term: 'Shelf Life', definition: 'The time period during which a drug product is expected to meet specifications when stored appropriately.', source_page: 6 },
          { id: 'gl-008', term: 'Matrixing', definition: 'A statistical design where only a fraction of the total samples are tested at any time point.', source_page: 8 },
          { id: 'gl-009', term: 'Bracketing', definition: 'A design where only samples on the extremes of certain factors are tested at all time points.', source_page: 8 },
        ];
        return mockAsync({ items: mockGlossary });
      }
    },
  },
  activations: {
    list: async (projectId: string) => {
      try {
        return await request<{ items: import('../types').ProjectGuidelineActivation[] }>(
          `/projects/${projectId}/regulatory/activations`,
        );
      } catch {
        // Mock activations based on project
        const mockActivations: import('../types').ProjectGuidelineActivation[] = projectId === 'proj-001' ? [
          {
            id: 'act-001',
            project_id: projectId,
            guideline_id: 'guide-001',
            guideline_title: 'ICH Q1A(R2) - Stability Testing of New Drug Substances and Products',
            numbering_mode: 'ctd',
            clinical_phase: 'phase_3',
            is_active: true,
            activated_at: '2024-11-15T10:00:00Z',
          },
        ] : [];
        return mockAsync({ items: mockActivations });
      }
    },
    activate: async (projectId: string, guidelineId: string, numberingMode: string, clinicalPhase: string) => {
      try {
        return await request<{ id: string; status: string }>(
          `/projects/${projectId}/regulatory/activate`,
          {
            method: 'POST',
            body: JSON.stringify({
              guideline_id: guidelineId,
              numbering_mode: numberingMode,
              clinical_phase: clinicalPhase,
            }),
          },
        );
      } catch {
        return mockAsync({ id: `act-${Date.now()}`, status: 'activated' });
      }
    },
    deactivate: async (projectId: string, activationId: string) => {
      try {
        return await request<void>(`/projects/${projectId}/regulatory/activate/${activationId}`, {
          method: 'DELETE',
        });
      } catch {
        return mockAsync(undefined as void);
      }
    },
  },
  evaluate: async (projectId: string) => {
    try {
      return await request<import('../types').RuleEvaluationReport>(
        `/projects/${projectId}/regulatory/evaluate`,
        { method: 'POST' },
      );
    } catch {
      // Mock evaluation report
      const mockEvaluation: import('../types').RuleEvaluationReport = {
        timestamp: new Date().toISOString(),
        can_proceed: true,
        blocking_failures: [],
        warnings: [
          {
            rule_id: 'rule-005',
            rule_id_code: 'Q1A-005',
            result: 'FAIL',
            severity: 'WARN',
            details: 'Retest period not explicitly stated in documents',
          },
        ],
        passes: [
          { rule_id: 'rule-001', rule_id_code: 'Q1A-001', result: 'PASS', severity: 'BLOCK', details: '12 quality attributes defined and tested' },
          { rule_id: 'rule-002', rule_id_code: 'Q1A-002', result: 'PASS', severity: 'BLOCK', details: '3 primary batches included (A001, A002, A003)' },
          { rule_id: 'rule-003', rule_id_code: 'Q1A-003', result: 'PASS', severity: 'BLOCK', details: '24 months long-term data available' },
          { rule_id: 'rule-004', rule_id_code: 'Q1A-004', result: 'PASS', severity: 'WARN', details: 'Accelerated conditions 40°C/75% RH included' },
        ],
        waivers: [],
      };
      return mockAsync(mockEvaluation, 600);
    }
  },
  waivers: {
    list: async (projectId: string) => {
      try {
        return await request<{ items: import('../types').RuleWaiver[] }>(
          `/projects/${projectId}/regulatory/waivers`,
        );
      } catch {
        return mockAsync({ items: [] });
      }
    },
    add: async (projectId: string, ruleIdCode: string, justification: string) => {
      try {
        return await request<{ rule_id_code: string; status: string }>(
          `/projects/${projectId}/regulatory/waivers`,
          {
            method: 'POST',
            body: JSON.stringify({ rule_id_code: ruleIdCode, justification }),
          },
        );
      } catch {
        return mockAsync({ rule_id_code: ruleIdCode, status: 'waived' });
      }
    },
    remove: async (projectId: string, ruleIdCode: string) => {
      try {
        return await request<void>(`/projects/${projectId}/regulatory/waivers/${ruleIdCode}`, {
          method: 'DELETE',
        });
      } catch {
        return mockAsync(undefined as void);
      }
    },
  },
=======
  /**
   * Generate a CTD stability document.
   * Pass all project data in the request body.
   */
  start: (data: GenerateRequest) =>
    request<import('../types').GenerationRun>(`${BASE}/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  status: (projectId: string, runId: string) =>
    request<import('../types').GenerationRun>(`${BASE}/generate?project_id=${projectId}&run_id=${runId}`),

  list: (projectId: string) =>
    request<{ items: import('../types').GenerationRun[] }>(`${BASE}/generate?project_id=${projectId}`),

  /**
   * Get the generated HTML document.
   */
  getHtml: (projectId: string, runId: string) =>
    fetch(`${BASE}/generate/html?project_id=${projectId}&run_id=${runId}`).then((res) => res.text()),
>>>>>>> 68d323b42af503ce8bf62966ceab373b2c263f0e
};
