/**
 * API client for the CTD Stability Document Generator.
 *
 * Uses simplified Vercel serverless endpoints:
 * - /api/projects - Project and document management
 * - /api/generate - CTD document generation
 */

const BASE = '/api';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
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
};

// ── Documents ───────────────────────────────────────────────────────

export const documents = {
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
};

// ── Extraction ──────────────────────────────────────────────────────

export const extraction = {
  start: (projectId: string) =>
    request<import('../types').ExtractionJob>(`${BASE}/projects?id=${projectId}&extract=1`, {
      method: 'POST',
    }),
};

// ── Studies/Lots/Conditions/Attributes ──────────────────────────────

export const studies = {
  list: (projectId: string) =>
    request<{ items: import('../types').Study[] }>(`${BASE}/projects?id=${projectId}&studies=1`),
};

export const lots = {
  list: (projectId: string) =>
    request<{ items: import('../types').Lot[] }>(`${BASE}/projects?id=${projectId}&lots=1`),
};

export const conditions = {
  list: (projectId: string) =>
    request<{ items: import('../types').StorageCondition[] }>(
      `${BASE}/projects?id=${projectId}&conditions=1`,
    ),
};

export const attributes = {
  list: (projectId: string) =>
    request<{ items: import('../types').QualityAttribute[] }>(
      `${BASE}/projects?id=${projectId}&attributes=1`,
    ),
};

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
};
