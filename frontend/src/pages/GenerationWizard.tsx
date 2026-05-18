import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Wand2, Check, Download, Clock, CheckCircle2, XCircle, Loader2, Link2, FileUp, FolderInput } from 'lucide-react';
import type { GenerationRun, GenerationStatus, DocumentFile } from '../types';
import { useProject } from '../context/ProjectContext';
import { generation, studies, lots, conditions, attributes, documents, paragraphs, type GenerateRequest } from '../api/client';
import ParagraphEditor, { findChangedParagraphs, getParagraphHtml } from '../components/ParagraphEditor';
import { downloadAsHtml, printAsPdf, downloadAsDocx } from '../lib/exportFormats';

// Helper to get document texts from localStorage
function getDocumentTexts(): Record<string, string> {
  try {
    const item = localStorage.getItem('ctd_document_texts');
    return item ? JSON.parse(item) : {};
  } catch {
    return {};
  }
}

// Helper to get generated HTML from localStorage
function getGeneratedHtml(runId: string): string | null {
  try {
    const item = localStorage.getItem('ctd_generated_html');
    const data = item ? JSON.parse(item) : {};
    return data[runId] || null;
  } catch {
    return null;
  }
}

// Download HTML file
function downloadHtml(runId: string, projectName: string, sectionNumber: string, sectionTitle: string) {
  let html = getGeneratedHtml(runId);
  if (!html) {
    alert('HTML content not found. Please regenerate the document.');
    return;
  }

  // If stored HTML is just body content (no full document wrapper), wrap it
  const trimmed = html.trim().toLowerCase();
  if (!trimmed.startsWith('<!doctype') && !trimmed.startsWith('<html')) {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${sectionNumber} – ${sectionTitle}</title>
  <style>
    body { font-family: 'Times New Roman', Times, serif; max-width: 210mm; margin: 0 auto; padding: 40px 30px; color: #1a1a1a; line-height: 1.6; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 11px; }
    th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; }
    h1, h2, h3, h4 { color: #1a1a1a; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
  }

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName.replace(/[^a-z0-9]/gi, '_')}_${sectionNumber}_${sectionTitle.replace(/[^a-z0-9]/gi, '_')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Client-side source traceability (no API call) ───────────────────
//
// Every data value in a table cell that can be found in a source document
// is marked with a reference back to its source. Refs are **shared per
// unique value**: if "12.5" appears in three cells, all three cells show
// the same ref number rather than three different ones. This keeps the
// appendix readable while preserving full verification coverage.
//
// We skip:
//   - the abbreviations/glossary table (definitions, not data)
//   - true noise (Pass/Fail/N/A/dashes — these appear hundreds of times
//     and tracing each adds no verification value)
//   - empty cells, page numbers, very short or very long blobs
interface SourceRef {
  index: number;
  value: string;
  filename: string;
  snippet: string;
}

/** Values too generic to benefit from a source reference. */
const TRACEABILITY_STOPWORDS: ReadonlySet<string> = new Set([
  // Result words
  'pass', 'fail', 'failed', 'passed', 'pending', 'closed', 'open',
  'completed', 'within limits', 'controlled',
  // Generic affirmatives/negatives
  'yes', 'no', 'true', 'false', 'none', 'unknown', 'n/a', 'na',
  'not applicable',
  // Punctuation / placeholders
  '—', '-', '...', '..', '.', 'tbd', 'tbc',
  // Common table labels the AI sometimes echoes
  'parameter', 'specification', 'criteria', 'result', 'value',
  'unit operation', 'equipment type', 'mean',
]);

const PAGE_NUMBER_RE = /^Page\s+\d+\s+of\s+\d+$/i;

/** Accept any non-noise value. Bare numbers, abbreviations, value+unit
 * combinations, identifiers — all welcome, because regulatory reviewers
 * need every figure verifiable against source. Generic stopwords are
 * filtered to keep the appendix from being dominated by "Pass" and "N/A". */
function shouldTraceValue(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 2 || t.length > 100) return false;
  if (TRACEABILITY_STOPWORDS.has(t.toLowerCase())) return false;
  if (PAGE_NUMBER_RE.test(t)) return false;
  return true;
}

/** Heuristic: skip the abbreviations/glossary table — its values are by definition
 * already in the source documents but the references would all be vacuous. */
function isMetadataTable(table: Element): boolean {
  const firstRow = table.querySelector('tr');
  if (!firstRow) return false;
  const headers = Array.from(firstRow.querySelectorAll('th, td'))
    .map((c) => (c.textContent || '').trim().toLowerCase());
  return headers.includes('abbreviation') || headers.includes('definition');
}

/** Find `value` in `docLower` using word-boundary matching so "12" doesn't
 * spuriously match "120", "212", or "12.5". Returns -1 if not found. */
function findWithWordBoundary(value: string, docLower: string): number {
  const isAlphaNum = (c: string | undefined) => !!c && /[a-z0-9]/i.test(c);
  let from = 0;
  for (;;) {
    const pos = docLower.indexOf(value, from);
    if (pos === -1) return -1;
    const before = pos > 0 ? docLower[pos - 1] : undefined;
    const after = pos + value.length < docLower.length ? docLower[pos + value.length] : undefined;
    if (!isAlphaNum(before) && !isAlphaNum(after)) return pos;
    from = pos + 1;
  }
}

function addClientTraceability(
  html: string,
  docMappings: { filename: string; extracted_text: string }[]
): { html: string; refs: SourceRef[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const refs: SourceRef[] = [];
  /** Map from lowercased cell value → ref entry so duplicates share a ref. */
  const valueToRef = new Map<string, { index: number; filename: string; snippet: string }>();
  let refIndex = 1;
  /** How many cells reference each ref (for the appendix occurrence count). */
  const refUsageCount = new Map<number, number>();

  // Build searchable text per document (lowercase for matching)
  const docTexts = docMappings
    .filter((d) => d.extracted_text.trim().length > 0)
    .map((d) => ({ filename: d.filename, text: d.extracted_text, lower: d.extracted_text.toLowerCase() }));

  if (docTexts.length === 0) return { html, refs: [] };

  // Identify tables to skip in their entirety (abbreviations/glossary —
  // these are definitions, not data, and pointing back to source for each
  // abbreviation adds noise without verification value).
  const skippedTables = new WeakSet<Element>();
  doc.querySelectorAll('table').forEach((t) => {
    if (isMetadataTable(t)) skippedTables.add(t);
  });

  const cells = doc.querySelectorAll('td');
  cells.forEach((cell) => {
    const parentTable = cell.closest('table');
    if (parentTable && skippedTables.has(parentTable)) return;

    const raw = (cell.textContent || '').trim();
    if (!shouldTraceValue(raw)) return;

    const dedupKey = raw.toLowerCase();
    let entry = valueToRef.get(dedupKey);

    if (!entry) {
      // First time we see this value — look it up in source documents.
      for (const d of docTexts) {
        const pos = findWithWordBoundary(dedupKey, d.lower);
        if (pos === -1) continue;

        const start = Math.max(0, pos - 40);
        const end = Math.min(d.text.length, pos + dedupKey.length + 40);
        let snippet = d.text.slice(start, end).replace(/\s+/g, ' ').trim();
        if (start > 0) snippet = '...' + snippet;
        if (end < d.text.length) snippet = snippet + '...';

        entry = { index: refIndex, filename: d.filename, snippet };
        valueToRef.set(dedupKey, entry);
        refs.push({ index: refIndex, value: raw, filename: d.filename, snippet });
        refIndex++;
        break;
      }
      if (!entry) return; // value not found in any source doc
    }

    // Attach the (possibly shared) ref number to this cell.
    refUsageCount.set(entry.index, (refUsageCount.get(entry.index) || 0) + 1);
    const sup = doc.createElement('sup');
    sup.textContent = `[${entry.index}]`;
    sup.style.cssText = 'color:#cbd5e1;font-size:7px;cursor:help;margin-left:1px;font-weight:normal;vertical-align:super;';
    sup.title = `Source: ${entry.filename}`;
    cell.appendChild(sup);
  });

  if (refs.length === 0) return { html, refs: [] };

  // 2. Add source appendix at the bottom
  const appendix = doc.createElement('div');
  appendix.style.cssText = 'margin-top:40px;padding-top:20px;border-top:2px solid #1a1a1a;';
  appendix.innerHTML = `
    <h3 style="font-size:14px;font-weight:bold;margin-bottom:12px;">Source References</h3>
    <table style="border-collapse:collapse;width:100%;font-size:10px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="border:1px solid #d1d5db;padding:4px 8px;width:30px;">Ref</th>
          <th style="border:1px solid #d1d5db;padding:4px 8px;">Value</th>
          <th style="border:1px solid #d1d5db;padding:4px 8px;width:40px;text-align:center;">Uses</th>
          <th style="border:1px solid #d1d5db;padding:4px 8px;">Source Document</th>
          <th style="border:1px solid #d1d5db;padding:4px 8px;">Context</th>
        </tr>
      </thead>
      <tbody>
        ${refs.map((r) => `
          <tr>
            <td style="border:1px solid #d1d5db;padding:4px 8px;text-align:center;color:#2563eb;font-weight:bold;">[${r.index}]</td>
            <td style="border:1px solid #d1d5db;padding:4px 8px;">${r.value}</td>
            <td style="border:1px solid #d1d5db;padding:4px 8px;text-align:center;color:#6b7280;">${refUsageCount.get(r.index) || 1}</td>
            <td style="border:1px solid #d1d5db;padding:4px 8px;font-style:italic;">${r.filename}</td>
            <td style="border:1px solid #d1d5db;padding:4px 8px;color:#6b7280;font-size:9px;">${r.snippet}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p style="font-size:9px;color:#9ca3af;margin-top:8px;">${refs.length} unique value${refs.length !== 1 ? 's' : ''} traced to ${new Set(refs.map(r => r.filename)).size} source document${new Set(refs.map(r => r.filename)).size !== 1 ? 's' : ''}, used in ${[...refUsageCount.values()].reduce((a, b) => a + b, 0)} cell${[...refUsageCount.values()].reduce((a, b) => a + b, 0) !== 1 ? 's' : ''}. Identical values across cells share a single reference number. Generic terms (Pass, N/A) and the abbreviations table are excluded.</p>
  `;
  doc.body.appendChild(appendix);

  // Preserve the full document (including <head>/<style>) if the original had it
  const isFullDoc = html.trim().toLowerCase().startsWith('<!doctype') || html.trim().toLowerCase().startsWith('<html');
  const fullHtml = isFullDoc
    ? `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
    : doc.body.innerHTML;

  return { html: fullHtml, refs };
}

type Step = 1 | 2 | 3;

const STEPS = [
  { num: 1, label: 'Scope' },
  { num: 2, label: 'Formatting' },
  { num: 3, label: 'Review & Generate' },
];

const STATUS_DISPLAY: Record<GenerationStatus, { icon: React.ReactNode; color: string; label: string }> = {
  pending: { icon: <Clock size={14} className="text-gray-400" />, color: 'bg-gray-100 text-gray-600', label: 'Pending' },
  running: { icon: <Loader2 size={14} className="text-blue-500 animate-spin" />, color: 'bg-blue-100 text-blue-700', label: 'Running' },
  completed: { icon: <CheckCircle2 size={14} className="text-green-500" />, color: 'bg-green-100 text-green-700', label: 'Completed' },
  failed: { icon: <XCircle size={14} className="text-red-500" />, color: 'bg-red-100 text-red-700', label: 'Failed' },
};

interface GenerationWizardProps {
  sectionId?: string;
  sectionNumber?: string;
  sectionTitle?: string;
}

export default function GenerationWizard({ sectionId = 'S.7.3', sectionNumber = '3.2.S.7.3', sectionTitle = 'Stability Data' }: GenerationWizardProps) {
  const { current } = useProject();
  const [step, setStep] = useState<Step>(1);
  const [run, setRun] = useState<GenerationRun | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pastRuns, setPastRuns] = useState<GenerationRun[]>([]);

  const [includeTrace, setIncludeTrace] = useState(true);
  const [tablePrefix, setTablePrefix] = useState(`${sectionId}-`);
  const [traceCount, setTraceCount] = useState(0);
  const [projectDocs, setProjectDocs] = useState<DocumentFile[]>([]);

  const loadPastRuns = async () => {
    if (!current) return;
    try {
      const data = await generation.list(current.id);
      setPastRuns(data.items);
    } catch { /* */ }
  };

  const loadDocs = async () => {
    if (!current) return;
    try {
      // Only documents explicitly tagged for this section feed generation.
      // Untagged or other-section docs stay in the project library and must be
      // tagged via the Sources tab before they show up here.
      const data = await documents.listForSection(current.id, sectionId);
      setProjectDocs(data.items.filter((d) => d.source !== 'veeva'));
    } catch { /* */ }
  };

  useEffect(() => { loadPastRuns(); loadDocs(); }, [current?.id]);

  // Check if documents were added/updated after the last generation
  const newDocsInfo = useMemo(() => {
    const sectionRuns = pastRuns.filter((r) => r.section_id === sectionId && r.status === 'completed');
    if (sectionRuns.length === 0 || projectDocs.length === 0) return null;

    const lastRunTime = Math.max(...sectionRuns.map((r) => new Date(r.completed_at || r.created_at).getTime()));
    const newerDocs = projectDocs.filter((d) => new Date(d.uploaded_at).getTime() > lastRunTime);

    if (newerDocs.length === 0) return null;
    return { count: newerDocs.length, names: newerDocs.map((d) => d.original_filename) };
  }, [pastRuns, projectDocs, sectionId]);

  const handleGenerate = async () => {
    if (!current) return;
    setGenerating(true);
    try {
      // Fetch all project data to send to the generation API.
      // Documents are filtered to the current section's tagged sources only —
      // untagged or other-section documents are intentionally excluded so the
      // model isn't fed irrelevant context.
      const [studyData, lotData, conditionData, attrData, docData] = await Promise.all([
        studies.list(current.id),
        lots.list(current.id),
        conditions.list(current.id),
        attributes.list(current.id),
        documents.listForSection(current.id, sectionId),
      ]);

      // Get document texts from localStorage
      const docTexts = getDocumentTexts();

      const request: GenerateRequest = {
        section: sectionId,
        project: {
          id: current.id,
          name: current.name,
          description: current.description,
        },
        studies: studyData.items,
        lots: lotData.items,
        conditions: conditionData.items,
        attributes: attrData.items,
        documents: docData.items.filter((d) => d.source !== 'veeva').map((d) => ({
          filename: d.original_filename,
          extracted_text: docTexts[d.id] || '',
          classification: d.classification,
        })),
      };

      const result = await generation.start(request);

      // Client-side traceability (no API call — instant)
      if (includeTrace && result.status === 'completed' && result.outputs?.html) {
        const storedHtml = getGeneratedHtml(result.outputs.html);
        if (storedHtml) {
          const uploadedDocs = docData.items
            .filter((d) => d.source !== 'veeva')
            .map((d) => ({ filename: d.original_filename, extracted_text: docTexts[d.id] || '' }));
          const { html: tracedHtml, refs } = addClientTraceability(storedHtml, uploadedDocs);
          if (refs.length > 0) {
            // Update stored HTML with traced version
            const htmlStorage = JSON.parse(localStorage.getItem('ctd_generated_html') || '{}');
            htmlStorage[result.outputs.html] = tracedHtml;
            localStorage.setItem('ctd_generated_html', JSON.stringify(htmlStorage));
            setTraceCount(refs.length);
          }
        }
      }

      setRun(result);
      await loadPastRuns();
    } catch { /* */ } finally {
      setGenerating(false);
    }
  };

  const handleReset = () => {
    setRun(null);
    setStep(1);
  };

  /**
   * Regenerate using the same project data as the current run, but preserve
   * the user's locked paragraphs. After the new run completes, compute a
   * per-paragraph diff and record `pending_change` for every paragraph that
   * actually changed (so the user can accept/reject the AI's edits).
   */
  const handleRegenerate = useCallback(async (lockedPids: string[]) => {
    if (!current || !run) return;
    const oldRunId = run.run_id;
    const oldHtml = run.outputs?.html ? getGeneratedHtml(run.outputs.html) : null;
    if (!oldHtml) return;

    setGenerating(true);
    try {
      // Build the locked-paragraphs payload from the current HTML.
      const lockedParagraphs = lockedPids
        .map((pid) => {
          const block = getParagraphHtml(oldHtml, pid);
          return block ? { pid, html: block } : null;
        })
        .filter((x): x is { pid: string; html: string } => x !== null);

      // Fetch the same sources used for the first generation.
      const [studyData, lotData, conditionData, attrData, docData] = await Promise.all([
        studies.list(current.id),
        lots.list(current.id),
        conditions.list(current.id),
        attributes.list(current.id),
        documents.listForSection(current.id, sectionId),
      ]);

      const docTexts = getDocumentTexts();
      const request: GenerateRequest = {
        section: sectionId,
        project: {
          id: current.id,
          name: current.name,
          description: current.description,
        },
        studies: studyData.items,
        lots: lotData.items,
        conditions: conditionData.items,
        attributes: attrData.items,
        documents: docData.items.filter((d) => d.source !== 'veeva').map((d) => ({
          filename: d.original_filename,
          extracted_text: docTexts[d.id] || '',
          classification: d.classification,
        })),
        locked_paragraphs: lockedParagraphs,
      };

      const newRun = await generation.start(request);
      const newRunId = newRun.run_id;
      const newHtml = newRun.outputs?.html ? getGeneratedHtml(newRun.outputs.html) : null;

      if (newHtml) {
        // Carry over locks, version history, and comments.
        paragraphs.cloneRun(oldRunId, newRunId);

        // Per-paragraph diff: record pending_change for everything that
        // actually changed AND wasn't locked. Push prior version into history.
        const lockedSet = new Set(lockedPids);
        const changes = findChangedParagraphs(oldHtml, newHtml);
        for (const { pid, before, after } of changes) {
          paragraphs.pushVersion(newRunId, pid, {
            html: before,
            created_at: new Date().toISOString(),
            run_id: oldRunId,
          });
          if (!lockedSet.has(pid)) {
            paragraphs.setPendingChange(newRunId, pid, before, after);
          }
        }
      }

      setRun(newRun);
      await loadPastRuns();
    } catch (err) {
      console.error('Regenerate failed:', err);
    } finally {
      setGenerating(false);
    }
  }, [current, run, sectionId]);

  if (!current) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
        <Wand2 className="mx-auto mb-3 text-gray-300" size={40} />
        <p className="text-gray-500 text-sm">Create a project first from the Dashboard.</p>
      </div>
    );
  }

  // ── After generation: render the paragraph editor ────────────────
  if (run && run.status === 'completed') {
    return (
      <EditorView
        run={run}
        sectionId={sectionId}
        sectionNumber={sectionNumber}
        sectionTitle={sectionTitle}
        regenerating={generating}
        traceCount={traceCount}
        pastRuns={pastRuns}
        newDocsInfo={newDocsInfo}
        onReset={handleReset}
        onRegenerate={async (lockedPids) => {
          if (!current) return;
          await handleRegenerate(lockedPids);
        }}
      />
    );
  }

  // ── Wizard flow ─────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Generate {sectionNumber}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {sectionTitle} for <span className="font-medium">{current.name}</span>
      </p>

      {/* No sources warning — blocks generation until at least one doc is tagged */}
      {projectDocs.length === 0 && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
          <FolderInput size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">
              No documents tagged for {sectionNumber} yet
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              Generation needs at least one source document tagged for this section.
              Go to the Sources tab to upload or pick documents from the project library.
            </p>
            {current && (
              <RouterLink
                to={`/project/${current.id}/ctd/${sectionId}/documents`}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-900 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-md transition-colors"
              >
                <FolderInput size={12} />
                Open Sources
              </RouterLink>
            )}
          </div>
        </div>
      )}

      {/* Sources summary */}
      {projectDocs.length > 0 && (
        <div className="mb-4 inline-flex items-center gap-2 text-xs text-gray-500">
          <FolderInput size={12} className="text-gray-400" />
          <span>
            <span className="font-medium text-gray-700">{projectDocs.length}</span> document{projectDocs.length !== 1 ? 's' : ''} tagged for this section
          </span>
          {current && (
            <RouterLink
              to={`/project/${current.id}/ctd/${sectionId}/documents`}
              className="text-primary-600 hover:text-primary-800 font-medium"
            >
              · Manage sources
            </RouterLink>
          )}
        </div>
      )}

      {/* New documents notification */}
      {newDocsInfo && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
          <FileUp size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900">
              {newDocsInfo.count} new document{newDocsInfo.count > 1 ? 's' : ''} available since last generation
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {newDocsInfo.names.join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= s.num ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {step > s.num ? <Check size={16} /> : s.num}
            </div>
            <span className={`ml-2 text-sm ${step >= s.num ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{s.label}</span>
            {i < STEPS.length - 1 && <div className="mx-4 w-12 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900 mb-2">Section Scope</h2>
            <div className="p-4 rounded-md bg-primary-50 border border-primary-200">
              <p className="text-sm font-medium text-primary-900">{sectionNumber} — {sectionTitle}</p>
              <p className="text-xs text-primary-700 mt-1">
                Generates the complete {sectionTitle.toLowerCase()} document based on your uploaded source documents.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900 mb-2">Output & Formatting</h2>
            <div className="p-3 rounded-md bg-gray-50 border text-sm text-gray-700">
              Output format: <span className="font-medium">PDF</span>
            </div>
            <label className="flex items-center gap-2 p-3 rounded-md border hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={includeTrace} onChange={(e) => setIncludeTrace(e.target.checked)} />
              <span className="text-sm">Include traceability report</span>
            </label>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Table Prefix</label>
              <input value={tablePrefix} onChange={(e) => setTablePrefix(e.target.value)} className="w-48 border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900 mb-2">Review Configuration</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <dt className="text-gray-500">Section</dt>
              <dd className="text-gray-900">{sectionNumber} {sectionTitle}</dd>
              <dt className="text-gray-500">Output Format</dt>
              <dd className="text-gray-900">PDF</dd>
              <dt className="text-gray-500">Traceability</dt>
              <dd className="text-gray-900">{includeTrace ? 'Included' : 'Excluded'}</dd>
              <dt className="text-gray-500">Table Prefix</dt>
              <dd className="text-gray-900 font-mono">{tablePrefix}</dd>
            </dl>

            {generating && (
              <div className="mt-4 p-4 rounded-md bg-blue-50 border border-blue-200 flex items-center gap-3">
                <Loader2 size={18} className="text-blue-500 animate-spin" />
                <p className="text-sm text-blue-800 font-medium">Generating with Claude Opus — this may take a moment...</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between mt-6">
        <button onClick={() => setStep((s) => Math.max(1, s - 1) as Step)} disabled={step === 1 || generating} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30">
          <ChevronLeft size={16} /> Back
        </button>
        {step < 3 ? (
          <button onClick={() => setStep((s) => Math.min(3, s + 1) as Step)} className="inline-flex items-center gap-1 bg-primary-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-primary-700">
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={generating || projectDocs.length === 0}
            title={projectDocs.length === 0 ? 'Tag at least one source document for this section first' : undefined}
            className="inline-flex items-center gap-2 bg-green-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Wand2 size={16} /> {generating ? 'Generating...' : `Generate ${sectionNumber}`}
          </button>
        )}
      </div>

      {/* Previous runs at the bottom */}
      {pastRuns.length > 0 && !generating && (
        <div className="mt-10">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Previous Runs</h3>
          <div className="space-y-3">
            {pastRuns.map((r) => {
              const s = STATUS_DISPLAY[r.status];
              return (
                <div key={r.run_id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${s.color}`}>
                      {s.icon} {s.label}
                    </span>
                    <span className="font-mono text-sm text-gray-600">{r.run_id.slice(0, 8)}</span>
                    <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  {r.outputs?.html && r.status === 'completed' && (
                    <button onClick={() => downloadHtml(r.outputs!.html!, current?.name || 'Document', sectionNumber, sectionTitle)} className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 font-medium">
                      <Download size={12} /> Download HTML
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Editor view (after generation) ──────────────────────────────────
interface EditorViewProps {
  run: GenerationRun;
  sectionId: string;
  sectionNumber: string;
  sectionTitle: string;
  regenerating: boolean;
  traceCount: number;
  pastRuns: GenerationRun[];
  newDocsInfo: { count: number; names: string[] } | null;
  onReset: () => void;
  onRegenerate: (lockedPids: string[]) => Promise<void>;
}

function EditorView({ run, sectionId: _sectionId, sectionNumber, sectionTitle, regenerating, traceCount, pastRuns, newDocsInfo, onReset, onRegenerate }: EditorViewProps) {
  const { current } = useProject();
  const [html, setHtml] = useState<string | null>(null);
  const [showRunList, setShowRunList] = useState(false);

  useEffect(() => {
    const stored = run.outputs?.html ? getGeneratedHtml(run.outputs.html) : null;
    setHtml(stored);
  }, [run.run_id, run.outputs?.html]);

  const handleHtmlChange = useCallback((newHtml: string) => {
    if (!run.outputs?.html) return;
    setHtml(newHtml);
    // Persist back to localStorage so reloads see the edited document.
    const storage = JSON.parse(localStorage.getItem('ctd_generated_html') || '{}');
    storage[run.outputs.html] = newHtml;
    localStorage.setItem('ctd_generated_html', JSON.stringify(storage));
  }, [run.outputs?.html]);

  if (!html) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
        <Loader2 className="mx-auto mb-3 text-gray-300 animate-spin" size={40} />
        <p className="text-gray-500 text-sm">Loading generated document…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-gray-900 truncate">
            {sectionNumber} {sectionTitle}
          </h1>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
            <CheckCircle2 size={11} className="text-green-500" />
            <span>Generated</span>
            <span>·</span>
            <span>{new Date(run.created_at).toLocaleString()}</span>
            {traceCount > 0 && (
              <>
                <span>·</span>
                <Link2 size={11} className="text-blue-500" />
                <span>{traceCount} source ref{traceCount !== 1 ? 's' : ''}</span>
              </>
            )}
            {run.token_usage && (
              <>
                <span>·</span>
                <span className="text-gray-400">
                  {run.token_usage.input_tokens?.toLocaleString()} in / {run.token_usage.output_tokens?.toLocaleString()} out
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {pastRuns.length > 1 && (
            <button
              onClick={() => setShowRunList(!showRunList)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md transition-colors"
            >
              <Clock size={11} />
              {pastRuns.length} runs
            </button>
          )}
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-md transition-colors"
          >
            <Wand2 size={11} />
            New generation
          </button>
        </div>
      </div>

      {/* New documents banner */}
      {newDocsInfo && (
        <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <FileUp size={12} className="text-amber-500 flex-shrink-0" />
            <span className="text-amber-900 font-medium">
              {newDocsInfo.count} new document{newDocsInfo.count > 1 ? 's' : ''} since last generation
            </span>
            <span className="text-amber-700 truncate">{newDocsInfo.names.join(', ')}</span>
          </div>
        </div>
      )}

      {/* Past runs (collapsible) */}
      {showRunList && pastRuns.length > 1 && (
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 max-h-40 overflow-y-auto flex-shrink-0">
          <div className="space-y-1.5">
            {pastRuns.map((r) => {
              const s = STATUS_DISPLAY[r.status];
              const isCurrent = r.run_id === run.run_id;
              return (
                <div
                  key={r.run_id}
                  className={`flex items-center justify-between gap-3 py-1.5 px-3 rounded-md text-xs ${isCurrent ? 'bg-primary-50 border border-primary-100' : 'bg-white border border-gray-200'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] ${s.color}`}>
                      {s.icon} {s.label}
                    </span>
                    <span className="font-mono text-gray-700">{r.run_id.slice(0, 8)}</span>
                    <span className="text-gray-400 truncate">{new Date(r.created_at).toLocaleString()}</span>
                    {isCurrent && <span className="text-[10px] font-medium text-primary-600">Current</span>}
                  </div>
                  {r.outputs?.html && r.status === 'completed' && !isCurrent && (
                    <button
                      onClick={() => downloadHtml(r.outputs!.html!, current?.name || 'Document', sectionNumber, sectionTitle)}
                      className="inline-flex items-center gap-1 text-gray-500 hover:text-primary-700"
                    >
                      <Download size={10} /> HTML
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Paragraph editor takes the remaining vertical space */}
      <div className="flex-1 overflow-hidden">
        <ParagraphEditor
          runId={run.run_id}
          html={html}
          regenerating={regenerating}
          onRegenerate={onRegenerate}
          onDownloadHtml={() => downloadAsHtml(html, { projectName: current?.name || 'Document', sectionNumber, sectionTitle })}
          onPrintPdf={() => printAsPdf(html, { projectName: current?.name || 'Document', sectionNumber, sectionTitle })}
          onDownloadDocx={() => downloadAsDocx(html, { projectName: current?.name || 'Document', sectionNumber, sectionTitle })}
          onHtmlChange={handleHtmlChange}
        />
      </div>
    </div>
  );
}
