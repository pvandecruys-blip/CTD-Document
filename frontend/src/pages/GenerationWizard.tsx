import { useEffect, useState, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Wand2, Check, Download, Clock, CheckCircle2, XCircle, Loader2, Link2, FileUp } from 'lucide-react';
import type { GenerationRun, GenerationStatus, DocumentFile } from '../types';
import { useProject } from '../context/ProjectContext';
import { generation, studies, lots, conditions, attributes, documents, type GenerateRequest } from '../api/client';

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
interface SourceRef {
  index: number;
  value: string;
  filename: string;
  snippet: string;
}

function addClientTraceability(
  html: string,
  docMappings: { filename: string; extracted_text: string }[]
): { html: string; refs: SourceRef[] } {
  // 1. Parse table cell values from the HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const cells = doc.querySelectorAll('td');
  const refs: SourceRef[] = [];
  const seen = new Set<string>();
  let refIndex = 1;

  // Build searchable text per document (lowercase for matching)
  const docTexts = docMappings
    .filter((d) => d.extracted_text.trim().length > 0)
    .map((d) => ({ filename: d.filename, text: d.extracted_text, lower: d.extracted_text.toLowerCase() }));

  if (docTexts.length === 0) return { html, refs: [] };

  cells.forEach((cell) => {
    const raw = (cell.textContent || '').trim();
    if (!raw || raw.length < 2 || raw.length > 200) return;
    if (seen.has(raw)) return;

    // Try to find this value in source documents
    const searchVal = raw.toLowerCase();
    for (const d of docTexts) {
      const pos = d.lower.indexOf(searchVal);
      if (pos === -1) continue;

      // Found a match — extract a short snippet around the value
      const start = Math.max(0, pos - 40);
      const end = Math.min(d.text.length, pos + searchVal.length + 40);
      let snippet = d.text.slice(start, end).replace(/\s+/g, ' ').trim();
      if (start > 0) snippet = '...' + snippet;
      if (end < d.text.length) snippet = snippet + '...';

      seen.add(raw);
      refs.push({ index: refIndex, value: raw, filename: d.filename, snippet });

      // Add superscript to the cell
      const sup = doc.createElement('sup');
      sup.textContent = `[${refIndex}]`;
      sup.style.cssText = 'color:#2563eb;font-size:9px;cursor:help;margin-left:2px;';
      sup.title = `Source: ${d.filename}`;
      cell.appendChild(sup);

      refIndex++;
      break; // One match per cell value is enough
    }
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
          <th style="border:1px solid #d1d5db;padding:4px 8px;">Source Document</th>
          <th style="border:1px solid #d1d5db;padding:4px 8px;">Context</th>
        </tr>
      </thead>
      <tbody>
        ${refs.map((r) => `
          <tr>
            <td style="border:1px solid #d1d5db;padding:4px 8px;text-align:center;color:#2563eb;font-weight:bold;">[${r.index}]</td>
            <td style="border:1px solid #d1d5db;padding:4px 8px;">${r.value}</td>
            <td style="border:1px solid #d1d5db;padding:4px 8px;font-style:italic;">${r.filename}</td>
            <td style="border:1px solid #d1d5db;padding:4px 8px;color:#6b7280;font-size:9px;">${r.snippet}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p style="font-size:9px;color:#9ca3af;margin-top:8px;">${refs.length} reference(s) found across ${new Set(refs.map(r => r.filename)).size} source document(s).</p>
  `;
  doc.body.appendChild(appendix);

  // Preserve the full document (including <head>/<style>) if the original had it
  const serializer = new XMLSerializer();
  const fullHtml = html.trim().toLowerCase().startsWith('<!doctype') || html.trim().toLowerCase().startsWith('<html')
    ? `<!DOCTYPE html>\n${serializer.serializeToString(doc.documentElement)}`
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
      const data = await documents.list(current.id);
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
      // Fetch all project data to send to the generation API
      const [studyData, lotData, conditionData, attrData, docData] = await Promise.all([
        studies.list(current.id),
        lots.list(current.id),
        conditions.list(current.id),
        attributes.list(current.id),
        documents.list(current.id),
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

  if (!current) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
        <Wand2 className="mx-auto mb-3 text-gray-300" size={40} />
        <p className="text-gray-500 text-sm">Create a project first from the Dashboard.</p>
      </div>
    );
  }

  // ── After generation: show big download card ────────────────────
  if (run && run.status === 'completed') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Generate {sectionNumber}</h1>

        {/* New documents banner */}
        {newDocsInfo && (
          <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
            <FileUp size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                {newDocsInfo.count} new document{newDocsInfo.count > 1 ? 's' : ''} uploaded since last generation
              </p>
              <p className="text-xs text-amber-700 mt-1">
                {newDocsInfo.names.join(', ')}
              </p>
              <button
                onClick={handleReset}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-md transition-colors"
              >
                <Wand2 size={12} />
                Regenerate with new documents
              </button>
            </div>
          </div>
        )}

        {/* Success card */}
        <div className="bg-white rounded-xl border-2 border-green-200 p-8 text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Document Generated</h2>
          <p className="text-sm text-gray-500 mb-4">
            {sectionNumber} {sectionTitle} — <span className="font-mono text-xs">{run.run_id.slice(0, 8)}</span>
          </p>

          {traceCount > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 inline-flex items-center gap-2">
              <Link2 size={14} className="text-blue-600" />
              <span className="text-sm text-blue-700">{traceCount} source reference{traceCount > 1 ? 's' : ''} added to document</span>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 flex-wrap">
            {run.outputs?.html && (
              <button
                onClick={() => downloadHtml(run.outputs!.html!, current?.name || 'Document', sectionNumber, sectionTitle)}
                className="inline-flex items-center gap-3 bg-primary-600 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-primary-700 shadow-sm transition-colors"
              >
                <Download size={18} />
                Download HTML
              </button>
            )}
          </div>

          {run.token_usage && (
            <p className="text-xs text-gray-400 mt-4">
              Tokens used: {run.token_usage.input_tokens?.toLocaleString()} in / {run.token_usage.output_tokens?.toLocaleString()} out
            </p>
          )}
        </div>

        <div className="text-center">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-800 font-medium"
          >
            <Wand2 size={16} /> Generate another version
          </button>
        </div>

        {/* Previous runs */}
        {pastRuns.length > 1 && (
          <div className="mt-10">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Previous Runs</h3>
            <div className="space-y-3">
              {pastRuns.filter(r => r.run_id !== run.run_id).map((r) => {
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
                      <button onClick={() => downloadHtml(r.outputs!.html!, current?.name || 'Document', sectionNumber, sectionTitle)} className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800">
                        <Download size={12} /> HTML
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

  // ── Wizard flow ─────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Generate {sectionNumber}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {sectionTitle} for <span className="font-medium">{current.name}</span>
      </p>

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
          <button onClick={handleGenerate} disabled={generating} className="inline-flex items-center gap-2 bg-green-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50">
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
