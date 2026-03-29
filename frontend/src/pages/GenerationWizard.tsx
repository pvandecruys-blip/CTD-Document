import { useEffect, useState } from 'react';
import { ChevronRight, ChevronLeft, Wand2, Check, Download, Clock, CheckCircle2, XCircle, Loader2, FileDown, Link2 } from 'lucide-react';
import type { GenerationRun, GenerationStatus } from '../types';
import { useProject } from '../context/ProjectContext';
import { generation, studies, lots, conditions, attributes, documents, traceability, type GenerateRequest } from '../api/client';

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
  const html = getGeneratedHtml(runId);
  if (!html) {
    alert('HTML content not found. Please regenerate the document.');
    return;
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

// Download as PDF using html2pdf.js
async function downloadPdf(runId: string, projectName: string, sectionNumber: string, sectionTitle: string) {
  const html = getGeneratedHtml(runId);
  if (!html) {
    alert('HTML content not found. Please regenerate the document.');
    return;
  }

  // Dynamically import html2pdf.js
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html2pdf = (await import('html2pdf.js' as any)).default;

  // Create a hidden container for rendering
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.innerHTML = html;
  document.body.appendChild(container);

  const filename = `${projectName.replace(/[^a-z0-9]/gi, '_')}_${sectionNumber}_${sectionTitle.replace(/[^a-z0-9]/gi, '_')}.pdf`;

  await html2pdf()
    .set({
      margin: [10, 10, 10, 10],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    } as any)
    .from(container)
    .save();

  document.body.removeChild(container);
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
  const [tracing, setTracing] = useState(false);
  const [traceStatus, setTraceStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const loadPastRuns = async () => {
    if (!current) return;
    try {
      const data = await generation.list(current.id);
      setPastRuns(data.items);
    } catch { /* */ }
  };

  useEffect(() => { loadPastRuns(); }, [current?.id]);

  const handleGenerate = async () => {
    if (!current) return;
    setGenerating(true);
    setTraceStatus('idle');
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

      const docMappings = docData.items.map((d) => ({
        filename: d.original_filename,
        extracted_text: docTexts[d.id] || '',
        classification: d.classification,
      }));

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
        documents: docMappings,
      };

      // STEP 1: Generate the document
      const result = await generation.start(request);
      setRun(result);
      setGenerating(false);

      // STEP 2: Traceability (if enabled and generation succeeded)
      if (includeTrace && result.status === 'completed' && result.outputs?.html) {
        setTracing(true);
        setTraceStatus('running');
        try {
          const html = getGeneratedHtml(result.outputs.html);
          if (html) {
            const values = traceability.extractTableValues(html);
            const refs = await traceability.trace(values, docMappings);
            if (refs.length > 0) {
              const enrichedHtml = traceability.injectReferences(html, refs);
              // Update stored HTML with traceability
              const htmlStorage = JSON.parse(localStorage.getItem('ctd_generated_html') || '{}');
              htmlStorage[result.outputs.html] = enrichedHtml;
              localStorage.setItem('ctd_generated_html', JSON.stringify(htmlStorage));
            }
            setTraceStatus('done');
          }
        } catch {
          setTraceStatus('failed');
        } finally {
          setTracing(false);
        }
      }

      await loadPastRuns();
    } catch { /* */ } finally {
      setGenerating(false);
      setTracing(false);
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

        {/* Success card */}
        <div className="bg-white rounded-xl border-2 border-green-200 p-8 text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Document Generated</h2>
          <p className="text-sm text-gray-500 mb-4">
            {sectionNumber} {sectionTitle} — <span className="font-mono text-xs">{run.run_id.slice(0, 8)}</span>
          </p>

          {/* Traceability status */}
          {tracing && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 inline-flex items-center gap-2">
              <Loader2 size={14} className="text-amber-500 animate-spin" />
              <span className="text-sm text-amber-700">Adding source traceability references...</span>
            </div>
          )}
          {traceStatus === 'done' && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 inline-flex items-center gap-2">
              <Link2 size={14} className="text-green-600" />
              <span className="text-sm text-green-700">Source traceability references added to document</span>
            </div>
          )}
          {traceStatus === 'failed' && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 inline-flex items-center gap-2">
              <XCircle size={14} className="text-red-500" />
              <span className="text-sm text-red-700">Traceability failed — document available without references</span>
            </div>
          )}

          <div className="flex items-center justify-center gap-3 flex-wrap mb-2">
            {run.outputs?.html && (
              <>
                <button
                  onClick={async () => {
                    setPdfGenerating(true);
                    try {
                      await downloadPdf(run.outputs!.html!, current?.name || 'Document', sectionNumber, sectionTitle);
                    } finally {
                      setPdfGenerating(false);
                    }
                  }}
                  disabled={tracing || pdfGenerating}
                  className="inline-flex items-center gap-3 bg-primary-600 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-primary-700 shadow-sm transition-colors disabled:opacity-50"
                >
                  {pdfGenerating ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
                  {pdfGenerating ? 'Generating PDF...' : 'Download PDF'}
                </button>
                <button
                  onClick={() => downloadHtml(run.outputs!.html!, current?.name || 'Document', sectionNumber, sectionTitle)}
                  disabled={tracing}
                  className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <Download size={16} />
                  Download HTML
                </button>
              </>
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
      <p className="text-sm text-gray-500 mb-6">
        Stability Data for <span className="font-medium">{current.name}</span>
      </p>

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
              <div className="mt-4 space-y-3">
                <div className="p-4 rounded-md bg-blue-50 border border-blue-200 flex items-center gap-3">
                  <Loader2 size={18} className="text-blue-500 animate-spin" />
                  <div>
                    <p className="text-sm text-blue-800 font-medium">Step 1: Generating document with Claude Opus...</p>
                    <p className="text-xs text-blue-600 mt-0.5">This may take a moment</p>
                  </div>
                </div>
                {includeTrace && (
                  <div className="p-3 rounded-md bg-gray-50 border border-gray-200 flex items-center gap-3 opacity-50">
                    <Link2 size={16} className="text-gray-400" />
                    <p className="text-sm text-gray-500">Step 2: Source traceability (after document is ready)</p>
                  </div>
                )}
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
            <Wand2 size={16} /> {generating ? 'Generating...' : 'Generate {sectionNumber}'}
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
