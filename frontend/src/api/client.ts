/**
 * API client for the CTD Stability Document Generator backend.
 */

const BASE = import.meta.env.VITE_API_URL || '/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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

// ── Projects ────────────────────────────────────────────────────────

export const projects = {
  list: () => request<{ items: import('../types').Project[]; total: number }>('/projects'),
  get: (id: string) => request<import('../types').Project>(`/projects/${id}`),
  create: (data: { name: string; description?: string }) =>
    request<import('../types').Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
};

// ── Documents ───────────────────────────────────────────────────────

export const documents = {
  list: (projectId: string) =>
    request<{ items: import('../types').DocumentFile[] }>(`/projects/${projectId}/documents`),
  upload: async (projectId: string, file: File, classification?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (classification) form.append('classification', classification);
    const res = await fetch(`${BASE}/projects/${projectId}/documents`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
  reclassify: async (projectId: string, docId: string, classification: string) => {
    const form = new FormData();
    form.append('classification', classification);
    const res = await fetch(`${BASE}/projects/${projectId}/documents/${docId}/classify`, {
      method: 'PUT',
      body: form,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
  delete: (projectId: string, docId: string) =>
    request<void>(`/projects/${projectId}/documents/${docId}`, { method: 'DELETE' }),
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
  check: (projectId: string) =>
    request<ReadinessReport>(`/projects/${projectId}/readiness`),
};

// ── Extraction ──────────────────────────────────────────────────────

export const extraction = {
  start: (projectId: string) =>
    request<import('../types').ExtractionJob>(`/projects/${projectId}/extract`, { method: 'POST' }),
  status: (projectId: string, jobId: string) =>
    request<import('../types').ExtractionJob>(`/projects/${projectId}/extract/${jobId}`),
};

// ── Studies ─────────────────────────────────────────────────────────

export const studies = {
  list: (projectId: string) =>
    request<{ items: import('../types').Study[] }>(`/projects/${projectId}/studies`),
  update: (projectId: string, studyId: string, data: Partial<import('../types').Study>) =>
    request<import('../types').Study>(`/projects/${projectId}/studies/${studyId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ── Lots ────────────────────────────────────────────────────────────

export const lots = {
  list: (projectId: string, studyId: string) =>
    request<{ items: import('../types').Lot[] }>(`/projects/${projectId}/studies/${studyId}/lots`),
};

// ── Conditions ──────────────────────────────────────────────────────

export const conditions = {
  list: (projectId: string, studyId: string) =>
    request<{ items: import('../types').StorageCondition[] }>(
      `/projects/${projectId}/studies/${studyId}/conditions`,
    ),
};

// ── Attributes ──────────────────────────────────────────────────────

export const attributes = {
  list: (projectId: string, studyId: string) =>
    request<{ items: import('../types').QualityAttribute[] }>(
      `/projects/${projectId}/studies/${studyId}/attributes`,
    ),
};

// ── Results ─────────────────────────────────────────────────────────

export const results = {
  pivot: (projectId: string, studyId: string, lotId: string, conditionId: string) =>
    request<import('../types').PivotedResultView>(
      `/projects/${projectId}/studies/${studyId}/results/pivot?lot_id=${lotId}&condition_id=${conditionId}`,
    ),
};

// ── Validation ──────────────────────────────────────────────────────

export const validation = {
  run: (projectId: string) =>
    request<import('../types').ValidationReport>(`/projects/${projectId}/validate`, {
      method: 'POST',
    }),
};

// ── Generation ──────────────────────────────────────────────────────

export const generation = {
  start: (projectId: string, options: import('../types').GenerationOptions) =>
    request<import('../types').GenerationRun>(`/projects/${projectId}/generate`, {
      method: 'POST',
      body: JSON.stringify(options),
    }),
  status: (projectId: string, runId: string) =>
    request<import('../types').GenerationRun>(`/projects/${projectId}/generate/${runId}`),
  list: (projectId: string) =>
    request<{ items: import('../types').GenerationRun[] }>(`/projects/${projectId}/generate`),
};

// ── Regulatory ──────────────────────────────────────────────────────

export const regulatory = {
  guidelines: {
    list: () =>
      request<{ items: import('../types').RegulatoryGuideline[]; total: number }>(
        '/regulatory/guidelines',
      ),
    get: (id: string) =>
      request<import('../types').RegulatoryGuideline>(`/regulatory/guidelines/${id}`),
    upload: async (file: File, title: string, agency: string, documentId?: string, version?: string) => {
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
    },
    delete: (id: string) =>
      request<void>(`/regulatory/guidelines/${id}`, { method: 'DELETE' }),
    allocate: (guidelineId: string) =>
      request<{ job_id: string; status: string; message: string }>(
        `/regulatory/guidelines/${guidelineId}/allocate`,
        { method: 'POST' },
      ),
    rules: (guidelineId: string) =>
      request<{ items: import('../types').RegulatoryRule[] }>(
        `/regulatory/guidelines/${guidelineId}/rules`,
      ),
    updateRuleStatus: (guidelineId: string, ruleId: string, status: string, justification?: string) =>
      request<unknown>(`/regulatory/guidelines/${guidelineId}/rules/${ruleId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status, override_justification: justification }),
      }),
    glossary: (guidelineId: string) =>
      request<{ items: import('../types').RegulatoryGlossaryEntry[] }>(
        `/regulatory/guidelines/${guidelineId}/glossary`,
      ),
  },
  activations: {
    list: (projectId: string) =>
      request<{ items: import('../types').ProjectGuidelineActivation[] }>(
        `/projects/${projectId}/regulatory/activations`,
      ),
    activate: (projectId: string, guidelineId: string, numberingMode: string, clinicalPhase: string) =>
      request<{ id: string; status: string }>(
        `/projects/${projectId}/regulatory/activate`,
        {
          method: 'POST',
          body: JSON.stringify({
            guideline_id: guidelineId,
            numbering_mode: numberingMode,
            clinical_phase: clinicalPhase,
          }),
        },
      ),
    deactivate: (projectId: string, activationId: string) =>
      request<void>(`/projects/${projectId}/regulatory/activate/${activationId}`, {
        method: 'DELETE',
      }),
  },
  evaluate: (projectId: string) =>
    request<import('../types').RuleEvaluationReport>(
      `/projects/${projectId}/regulatory/evaluate`,
      { method: 'POST' },
    ),
  waivers: {
    list: (projectId: string) =>
      request<{ items: import('../types').RuleWaiver[] }>(
        `/projects/${projectId}/regulatory/waivers`,
      ),
    add: (projectId: string, ruleIdCode: string, justification: string) =>
      request<{ rule_id_code: string; status: string }>(
        `/projects/${projectId}/regulatory/waivers`,
        {
          method: 'POST',
          body: JSON.stringify({ rule_id_code: ruleIdCode, justification }),
        },
      ),
    remove: (projectId: string, ruleIdCode: string) =>
      request<void>(`/projects/${projectId}/regulatory/waivers/${ruleIdCode}`, {
        method: 'DELETE',
      }),
  },
};
