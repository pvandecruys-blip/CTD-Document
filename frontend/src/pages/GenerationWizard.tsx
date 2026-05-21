import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Wand2, Clock, CheckCircle2, Loader2, Link2, FileUp, FolderInput, FileText, Info } from 'lucide-react';
import type { GenerationRun, DocumentFile } from '../types';
import { useProject } from '../context/ProjectContext';
import { generation, studies, lots, conditions, attributes, documents, paragraphs, activity, type GenerateRequest } from '../api/client';
import ParagraphEditor, { findChangedParagraphs, getParagraphHtml } from '../components/ParagraphEditor';
import RunHistory from '../components/RunHistory';
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

// ── Client-side source traceability (no API call) ───────────────────
//
// Regulatory-style traceability: each **source document** gets one ref
// number ([1], [2], [3], …). Every traceable value in the document body
// carries the ref of the source it was found in, and every table gets a
// "Source: <filename> [N]" caption listing all the source docs that
// contributed to it.
//
// This matches how CTD submissions are typically built in Word/Veeva
// workflows: the reviewer sees per-table provenance at a glance and can
// drill into the appendix for the full filenames. Repeated values share
// the same ref number naturally because they share the same source.
//
// We skip:
//   - the abbreviations/glossary table (definitions, not data)
//   - true noise (Pass/Fail/N/A/dashes — high-frequency, low-value)
//   - empty cells, page numbers, very short or very long blobs
interface SourceRef {
  index: number;
  filename: string;
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

/** Escape HTML special chars so filenames/values are safe inside innerHTML. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
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

  /** filename → ref index (one per source document, lazily assigned the
   * first time we find a value coming from that document). */
  const filenameToRef = new Map<string, number>();
  let nextRefIndex = 1;

  /** Per-table set of source filenames whose data appears in that table —
   * drives the per-table "Source: …" caption inserted below each table. */
  const tableToSources = new Map<Element, Set<string>>();

  /** Cache of (cell value → matched source filename) so we don't re-search
   * the source corpus for repeated values. */
  const valueToFilename = new Map<string, string | null>();

  // Build searchable text per document (lowercase for matching)
  const docTexts = docMappings
    .filter((d) => d.extracted_text.trim().length > 0)
    .map((d) => ({ filename: d.filename, text: d.extracted_text, lower: d.extracted_text.toLowerCase() }));

  if (docTexts.length === 0) return { html, refs: [] };

  // Skip metadata tables entirely (abbreviations/glossary)
  const skippedTables = new WeakSet<Element>();
  doc.querySelectorAll('table').forEach((t) => {
    if (isMetadataTable(t)) skippedTables.add(t);
  });

  const cells = doc.querySelectorAll('td');
  let totalCellRefs = 0;

  cells.forEach((cell) => {
    const parentTable = cell.closest('table');
    if (parentTable && skippedTables.has(parentTable)) return;

    const raw = (cell.textContent || '').trim();
    if (!shouldTraceValue(raw)) return;

    const dedupKey = raw.toLowerCase();
    let matchedFilename = valueToFilename.get(dedupKey) ?? null;

    if (matchedFilename === null && !valueToFilename.has(dedupKey)) {
      // First lookup for this value
      for (const d of docTexts) {
        if (findWithWordBoundary(dedupKey, d.lower) !== -1) {
          matchedFilename = d.filename;
          break;
        }
      }
      valueToFilename.set(dedupKey, matchedFilename);
    }
    if (!matchedFilename) return;

    // Assign (or reuse) the source document's ref number
    let ref = filenameToRef.get(matchedFilename);
    if (ref === undefined) {
      ref = nextRefIndex++;
      filenameToRef.set(matchedFilename, ref);
    }

    // Record this source as contributing to the parent table
    if (parentTable) {
      let sources = tableToSources.get(parentTable);
      if (!sources) { sources = new Set(); tableToSources.set(parentTable, sources); }
      sources.add(matchedFilename);
    }

    // Attach the inline ref. Because the same number is repeated across
    // cells from the same document, the eye habituates and it reads as a
    // subtle marker rather than noise.
    const sup = doc.createElement('sup');
    sup.textContent = `[${ref}]`;
    sup.style.cssText = 'color:#94a3b8;font-size:8px;cursor:help;margin-left:1px;font-weight:normal;vertical-align:super;';
    sup.title = `Source: ${matchedFilename}`;
    cell.appendChild(sup);
    totalCellRefs++;
  });

  if (filenameToRef.size === 0) return { html, refs: [] };

  // Insert per-table "Source: …" captions just after each table.
  tableToSources.forEach((sources, table) => {
    if (sources.size === 0) return;
    const caption = doc.createElement('p');
    caption.style.cssText = 'font-size:10px;color:#6b7280;font-style:italic;margin-top:-4px;margin-bottom:18px;padding-left:2px;';
    const sourceList = [...sources]
      .map((f) => `${escapeHtml(f)} <sup style="color:#2563eb;font-style:normal;font-weight:600;">[${filenameToRef.get(f)}]</sup>`)
      .join(', ');
    caption.innerHTML = `Source: ${sourceList}`;
    if (table.nextSibling) {
      table.parentNode?.insertBefore(caption, table.nextSibling);
    } else {
      table.parentNode?.appendChild(caption);
    }
  });

  // Build the appendix — one row per source document.
  const refs: SourceRef[] = [...filenameToRef.entries()]
    .map(([filename, index]) => ({ index, filename }))
    .sort((a, b) => a.index - b.index);

  const appendix = doc.createElement('div');
  appendix.style.cssText = 'margin-top:40px;padding-top:20px;border-top:2px solid #1a1a1a;';
  appendix.innerHTML = `
    <h3 style="font-size:14px;font-weight:bold;margin-bottom:12px;">Source References</h3>
    <table style="border-collapse:collapse;width:100%;font-size:11px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="border:1px solid #d1d5db;padding:6px 10px;width:40px;text-align:center;">Ref</th>
          <th style="border:1px solid #d1d5db;padding:6px 10px;">Source Document</th>
        </tr>
      </thead>
      <tbody>
        ${refs.map((r) => `
          <tr>
            <td style="border:1px solid #d1d5db;padding:6px 10px;text-align:center;color:#2563eb;font-weight:bold;">[${r.index}]</td>
            <td style="border:1px solid #d1d5db;padding:6px 10px;">${escapeHtml(r.filename)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p style="font-size:9px;color:#9ca3af;margin-top:8px;">${refs.length} source document${refs.length !== 1 ? 's' : ''} referenced across ${totalCellRefs} value${totalCellRefs !== 1 ? 's' : ''}. Each table also carries an inline caption listing its sources. The abbreviations table and generic terms (Pass, N/A) are excluded from tracing.</p>
  `;
  doc.body.appendChild(appendix);

  // Preserve the full document (including <head>/<style>) if the original had it
  const isFullDoc = html.trim().toLowerCase().startsWith('<!doctype') || html.trim().toLowerCase().startsWith('<html');
  const fullHtml = isFullDoc
    ? `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
    : doc.body.innerHTML;

  return { html: fullHtml, refs };
}

interface GenerationWizardProps {
  sectionId?: string;
  sectionNumber?: string;
  sectionTitle?: string;
}

export default function GenerationWizard({ sectionId = 'S.7.3', sectionNumber = '3.2.S.7.3', sectionTitle = 'Stability Data' }: GenerationWizardProps) {
  const { current } = useProject();
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

      activity.log(result.run_id, 'generated', {
        detail: `${docData.items.filter((d) => d.source !== 'veeva').length} source document(s)`,
      });

      setRun(result);
      await loadPastRuns();
    } catch { /* */ } finally {
      setGenerating(false);
    }
  };

  const handleReset = () => {
    setRun(null);
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
        // Carry over locks, version history, comments, and activity log.
        paragraphs.cloneRun(oldRunId, newRunId);
        activity.clone(oldRunId, newRunId);

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

      activity.log(newRunId, 'regenerated', {
        detail: lockedPids.length > 0 ? `${lockedPids.length} paragraph(s) preserved` : undefined,
      });

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
        onOpenRun={(r) => setRun(r)}
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

      {projectDocs.length > 0 && (
        <div className="space-y-5">
          {/* Sources used */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">
                Sources used
                <span className="ml-2 text-xs font-normal text-gray-400">({projectDocs.length})</span>
              </h2>
              {current && (
                <RouterLink
                  to={`/project/${current.id}/ctd/${sectionId}/documents`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
                >
                  <FolderInput size={12} /> Manage sources
                </RouterLink>
              )}
            </div>
            <ul className="space-y-1.5">
              {projectDocs.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <FileText size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-800 truncate">{d.original_filename}</span>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">{d.classification.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Options */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Options</h2>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeTrace}
                onChange={(e) => setIncludeTrace(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Include traceability references (per-source markers + appendix)</span>
            </label>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Table prefix</label>
              <input
                value={tablePrefix}
                onChange={(e) => setTablePrefix(e.target.value)}
                className="w-40 border border-gray-200 rounded-md px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Output note */}
          <div className="flex items-start gap-2 px-1 text-xs text-gray-500">
            <Info size={13} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <span>
              Generation produces an editable document. After reviewing you can lock paragraphs,
              add comments, regenerate, and export to <span className="font-medium text-gray-600">PDF, Word or HTML</span>.
            </span>
          </div>

          {/* Generate */}
          <div className="flex items-center justify-end gap-3">
            {generating && (
              <span className="inline-flex items-center gap-2 text-sm text-blue-700">
                <Loader2 size={16} className="animate-spin" />
                Generating with Claude Opus…
              </span>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Wand2 size={16} /> {generating ? 'Generating…' : `Generate ${sectionNumber}`}
            </button>
          </div>
        </div>
      )}

      {/* Previous runs at the bottom */}
      {pastRuns.length > 0 && !generating && (
        <div className="mt-10">
          <RunHistory
            runs={pastRuns}
            projectName={current.name}
            sectionNumber={sectionNumber}
            sectionTitle={sectionTitle}
            resolveHtml={(r) => (r.outputs?.html ? getGeneratedHtml(r.outputs.html) : null)}
            onOpen={(r) => setRun(r)}
          />
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
  onOpenRun: (run: GenerationRun) => void;
}

function EditorView({ run, sectionId: _sectionId, sectionNumber, sectionTitle, regenerating, traceCount, pastRuns, newDocsInfo, onReset, onRegenerate, onOpenRun }: EditorViewProps) {
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
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 max-h-[60vh] overflow-y-auto flex-shrink-0">
          <RunHistory
            runs={pastRuns}
            currentRunId={run.run_id}
            projectName={current?.name || 'Document'}
            sectionNumber={sectionNumber}
            sectionTitle={sectionTitle}
            resolveHtml={(r) => (r.outputs?.html ? getGeneratedHtml(r.outputs.html) : null)}
            onOpen={(r) => { onOpenRun(r); setShowRunList(false); }}
          />
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
