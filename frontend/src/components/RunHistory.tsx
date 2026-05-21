import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Printer,
  FileType,
  Download,
  Eye,
  GitCompare,
  ShieldCheck,
  Lock,
  Trash2,
} from 'lucide-react';
import type { GenerationRun, GenerationStatus } from '../types';
import { downloadAsHtml, printAsPdf, downloadAsDocx } from '../lib/exportFormats';
import RunComparison from './RunComparison';

const STATUS_DISPLAY: Record<GenerationStatus, { icon: React.ReactNode; color: string; label: string }> = {
  pending: { icon: <Clock size={12} className="text-gray-400" />, color: 'bg-gray-100 text-gray-600', label: 'Pending' },
  running: { icon: <Loader2 size={12} className="text-blue-500 animate-spin" />, color: 'bg-blue-100 text-blue-700', label: 'Running' },
  completed: { icon: <CheckCircle2 size={12} className="text-green-500" />, color: 'bg-green-100 text-green-700', label: 'Completed' },
  failed: { icon: <XCircle size={12} className="text-red-500" />, color: 'bg-red-100 text-red-700', label: 'Failed' },
};

interface RunHistoryProps {
  runs: GenerationRun[];
  currentRunId?: string;
  projectName: string;
  sectionNumber: string;
  sectionTitle: string;
  /** Resolve a run's stored HTML (returns null if missing). */
  resolveHtml: (run: GenerationRun) => string | null;
  /** Open a run in the editor. */
  onOpen?: (run: GenerationRun) => void;
  /** Permanently delete a run. */
  onDelete?: (run: GenerationRun) => void;
}

export default function RunHistory({
  runs,
  currentRunId,
  projectName,
  sectionNumber,
  sectionTitle,
  resolveHtml,
  onOpen,
  onDelete,
}: RunHistoryProps) {
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);
  const [exportMenuFor, setExportMenuFor] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<{ older: GenerationRun; newer: GenerationRun } | null>(null);

  const completedRuns = runs.filter((r) => r.status === 'completed');

  const meta = { projectName, sectionNumber, sectionTitle };

  const exportRun = (run: GenerationRun, format: 'html' | 'pdf' | 'docx') => {
    const html = resolveHtml(run);
    if (!html) {
      alert('Stored output for this run was not found.');
      return;
    }
    if (format === 'html') downloadAsHtml(html, meta);
    else if (format === 'pdf') printAsPdf(html, meta);
    else downloadAsDocx(html, meta);
    setExportMenuFor(null);
  };

  const toggleSelect = (runId: string) => {
    setSelected((prev) => {
      if (prev.includes(runId)) return prev.filter((id) => id !== runId);
      if (prev.length >= 2) return [prev[1], runId]; // keep most recent two picks
      return [...prev, runId];
    });
  };

  const startComparison = () => {
    if (selected.length !== 2) return;
    const [a, b] = selected.map((id) => completedRuns.find((r) => r.run_id === id)!).filter(Boolean);
    if (!a || !b) return;
    // Older = earlier created_at
    const older = new Date(a.created_at) <= new Date(b.created_at) ? a : b;
    const newer = older === a ? b : a;
    setComparison({ older, newer });
  };

  if (runs.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Previous Runs</h3>
        {completedRuns.length >= 2 && (
          <div className="flex items-center gap-2">
            {compareMode && (
              <span className="text-xs text-gray-400">{selected.length}/2 selected</span>
            )}
            {compareMode && selected.length === 2 && (
              <button
                onClick={startComparison}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-md transition-colors"
              >
                <GitCompare size={12} />
                Compare
              </button>
            )}
            <button
              onClick={() => { setCompareMode(!compareMode); setSelected([]); }}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                compareMode ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <GitCompare size={12} />
              {compareMode ? 'Cancel' : 'Compare runs'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        {runs.map((r) => {
          const s = STATUS_DISPLAY[r.status];
          const isCurrent = r.run_id === currentRunId;
          const isSelected = selected.includes(r.run_id);
          const auditOpen = expandedAudit === r.run_id;
          const canExport = r.status === 'completed' && !!r.outputs?.html;

          return (
            <div
              key={r.run_id}
              className={`bg-white rounded-lg border transition-colors ${
                isSelected ? 'border-primary-400 ring-1 ring-primary-200' : 'border-gray-200'
              }`}
            >
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {compareMode && r.status === 'completed' && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(r.run_id)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer flex-shrink-0"
                    />
                  )}
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${s.color}`}>
                    {s.icon} {s.label}
                  </span>
                  <span className="font-mono text-sm text-gray-700">{r.run_id.slice(0, 8)}</span>
                  {r.label && <span className="text-xs text-gray-500 italic">{r.label}</span>}
                  <span className="text-xs text-gray-400 truncate">{new Date(r.created_at).toLocaleString()}</span>
                  {isCurrent && <span className="text-[10px] font-medium text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">Current</span>}
                  {(r.audit?.locked_paragraph_count || 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-indigo-600" title={`${r.audit!.locked_paragraph_count} locked paragraph(s) preserved`}>
                      <Lock size={9} />{r.audit!.locked_paragraph_count}
                    </span>
                  )}
                </div>

                {!compareMode && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {r.audit && (
                      <button
                        onClick={() => setExpandedAudit(auditOpen ? null : r.run_id)}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
                        title="Audit trail"
                      >
                        <ShieldCheck size={13} />
                        {auditOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      </button>
                    )}
                    {onOpen && canExport && (
                      <button
                        onClick={() => onOpen(r)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800 px-2 py-1 rounded hover:bg-primary-50 transition-colors"
                      >
                        <Eye size={13} /> Open
                      </button>
                    )}
                    {canExport && (
                      <div className="relative">
                        <button
                          onClick={() => setExportMenuFor(exportMenuFor === r.run_id ? null : r.run_id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                        >
                          <Download size={13} /> Export <ChevronDown size={10} />
                        </button>
                        {exportMenuFor === r.run_id && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setExportMenuFor(null)} />
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-40">
                              <button onClick={() => exportRun(r, 'html')} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs flex items-center gap-2">
                                <FileText size={12} className="text-blue-500" /> HTML
                              </button>
                              <button onClick={() => exportRun(r, 'pdf')} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs flex items-center gap-2">
                                <Printer size={12} className="text-red-500" /> Print → PDF
                              </button>
                              <button onClick={() => exportRun(r, 'docx')} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs flex items-center gap-2">
                                <FileType size={12} className="text-indigo-500" /> Word (.doc)
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => {
                          const label = r.label || r.run_id.slice(0, 8);
                          if (confirm(`Delete run ${label}? This permanently removes its document, comments, locks and history.`)) {
                            onDelete(r);
                          }
                        }}
                        className="inline-flex items-center text-gray-300 hover:text-red-600 px-1.5 py-1 rounded hover:bg-red-50 transition-colors"
                        title="Delete this run"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Audit trail panel */}
              {auditOpen && r.audit && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50">
                  <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-xs mt-2">
                    <dt className="text-gray-400">Generated by</dt>
                    <dd className="text-gray-700">{r.audit.generated_by}</dd>
                    <dt className="text-gray-400">Generated at</dt>
                    <dd className="text-gray-700">{new Date(r.created_at).toLocaleString()}</dd>
                    {r.audit.model && (
                      <>
                        <dt className="text-gray-400">Model</dt>
                        <dd className="text-gray-700 font-mono text-[11px]">{r.audit.model}</dd>
                      </>
                    )}
                    {r.token_usage && (
                      <>
                        <dt className="text-gray-400">Tokens</dt>
                        <dd className="text-gray-700">{r.token_usage.input_tokens?.toLocaleString()} in / {r.token_usage.output_tokens?.toLocaleString()} out</dd>
                      </>
                    )}
                    {(r.audit.locked_paragraph_count || 0) > 0 && (
                      <>
                        <dt className="text-gray-400">Locked paragraphs</dt>
                        <dd className="text-gray-700">{r.audit.locked_paragraph_count} preserved on regenerate</dd>
                      </>
                    )}
                    <dt className="text-gray-400 self-start">Source documents</dt>
                    <dd className="text-gray-700">
                      {r.audit.sources.length === 0 ? (
                        <span className="text-gray-400 italic">none recorded</span>
                      ) : (
                        <ul className="space-y-1">
                          {r.audit.sources.map((src, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <FileText size={11} className="text-gray-400 flex-shrink-0" />
                              <span className="truncate">{src.filename}</span>
                              <span className="text-[10px] text-gray-400">{src.classification.replace(/_/g, ' ')}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </dl>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {comparison && (
        <RunComparison
          older={{ run: comparison.older, html: resolveHtml(comparison.older) || '' }}
          newer={{ run: comparison.newer, html: resolveHtml(comparison.newer) || '' }}
          onClose={() => { setComparison(null); setCompareMode(false); setSelected([]); }}
        />
      )}
    </div>
  );
}
