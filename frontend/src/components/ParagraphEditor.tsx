import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Lock,
  Unlock,
  MessageSquare,
  History,
  Check,
  X,
  Trash2,
  ChevronDown,
  Loader2,
  Wand2,
  Download,
  AlertCircle,
  Pencil,
  FileText,
  Printer,
  FileType,
  Activity,
  MessageSquarePlus,
} from 'lucide-react';
import type { ParagraphComment, ParagraphState, CommentStatus, ActivityEntry, ParagraphVersion } from '../types';
import { paragraphs, activity } from '../api/client';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Strip outer <html>/<body>/<head>/<style> wrappers — we render body content only. */
function extractBodyContent(html: string): { body: string; styles: string } {
  const trimmed = html.trim();
  if (!trimmed.toLowerCase().startsWith('<!doctype') && !trimmed.toLowerCase().startsWith('<html')) {
    return { body: trimmed, styles: '' };
  }
  const doc = new DOMParser().parseFromString(trimmed, 'text/html');
  const body = doc.body?.innerHTML || trimmed;
  // Preserve <style> blocks so generated documents keep their formatting
  const styleTags = Array.from(doc.head?.querySelectorAll('style') || []).map((s) => s.outerHTML).join('\n');
  return { body, styles: styleTags };
}

/** Return the outerHTML of the element with the given data-pid, or null. */
function getParagraphHtml(fullHtml: string, pid: string): string | null {
  const doc = new DOMParser().parseFromString(fullHtml, 'text/html');
  const el = doc.querySelector(`[data-pid="${pid}"]`);
  return el ? el.outerHTML : null;
}

/** Replace the element with the given data-pid with the new HTML, returning the full document HTML. */
function replaceParagraph(fullHtml: string, pid: string, newOuterHtml: string): string {
  const isFull = fullHtml.trim().toLowerCase().startsWith('<!doctype') || fullHtml.trim().toLowerCase().startsWith('<html');
  const doc = new DOMParser().parseFromString(fullHtml, 'text/html');
  const el = doc.querySelector(`[data-pid="${pid}"]`);
  if (!el) return fullHtml;

  const tmp = doc.createElement('div');
  tmp.innerHTML = newOuterHtml;
  const newEl = tmp.firstElementChild;
  if (!newEl) return fullHtml;

  el.replaceWith(newEl);
  return isFull ? `<!DOCTYPE html>\n${doc.documentElement.outerHTML}` : doc.body.innerHTML;
}

// ─── Comment status display ──────────────────────────────────────────
const STATUS_OPTIONS: { value: CommentStatus; label: string; color: string }[] = [
  { value: 'open', label: 'Open', color: 'bg-gray-100 text-gray-700' },
  { value: 'approved', label: 'Approved', color: 'bg-green-100 text-green-700' },
  { value: 'needs_change', label: 'Needs change', color: 'bg-amber-100 text-amber-700' },
  { value: 'blocked', label: 'Blocked', color: 'bg-red-100 text-red-700' },
];

function StatusBadge({ status, onChange }: { status: CommentStatus; onChange: (s: CommentStatus) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${current.color} hover:brightness-95`}
      >
        {current.label}
        <ChevronDown size={9} />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white rounded-md shadow-lg border border-gray-200 py-1 min-w-[120px]">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full text-left px-3 py-1 hover:bg-gray-50 text-xs flex items-center gap-2"
            >
              <span className={`w-2 h-2 rounded-full ${opt.color.split(' ')[0]}`} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ParagraphEditor ─────────────────────────────────────────────────

interface ParagraphEditorProps {
  /** ID of the generation run — used as the key for all paragraph state. */
  runId: string;
  /** Full HTML document (or body content) to render. */
  html: string;
  /** Called when the user clicks Regenerate. Receives currently locked pids. */
  onRegenerate?: (lockedPids: string[]) => Promise<void>;
  /** Download the current HTML as a .html file. */
  onDownloadHtml?: () => void;
  /** Open print dialog for the current HTML (browser → PDF). */
  onPrintPdf?: () => void;
  /** Download the current HTML as a .doc Word-compatible file. */
  onDownloadDocx?: () => void;
  /**
   * Optional callback to persist HTML changes back to localStorage. Called
   * on track-changes Reject and on inline manual edits.
   */
  onHtmlChange?: (newHtml: string) => void;
  /** Show regenerate button. */
  regenerating?: boolean;
}

export default function ParagraphEditor({ runId, html, onRegenerate, onDownloadHtml, onPrintPdf, onDownloadDocx, onHtmlChange, regenerating = false }: ParagraphEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverPid, setHoverPid] = useState<string | null>(null);
  const [selectedPid, setSelectedPid] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, ParagraphState>>({});
  const [comments, setComments] = useState<ParagraphComment[]>([]);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);
  const [editingPid, setEditingPid] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  // Track each paragraph's HTML at the moment editing started, so we can
  // detect whether the user actually changed anything on blur.
  const editStartHtml = useRef<string>('');

  // Local copy of HTML so we can revert paragraphs in-place without round-tripping.
  const [localHtml, setLocalHtml] = useState(html);
  useEffect(() => { setLocalHtml(html); }, [html]);

  const { body, styles } = useMemo(() => extractBodyContent(localHtml), [localHtml]);

  // Close download menu on outside click
  useEffect(() => {
    if (!downloadOpen) return;
    const handler = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) setDownloadOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [downloadOpen]);

  // Load all state for this run once
  useEffect(() => {
    setStates(paragraphs.getStates(runId));
    setComments(paragraphs.getComments(runId));
    setActivityLog(activity.list(runId));
  }, [runId]);

  const refresh = useCallback(() => {
    setStates(paragraphs.getStates(runId));
    setComments(paragraphs.getComments(runId));
    setActivityLog(activity.list(runId));
  }, [runId]);

  // Decorate rendered paragraphs with state classes + manage contenteditable.
  useEffect(() => {
    if (!containerRef.current) return;
    const elements = containerRef.current.querySelectorAll<HTMLElement>('[data-pid]');
    const commentCounts: Record<string, number> = {};
    for (const c of comments) commentCounts[c.pid] = (commentCounts[c.pid] || 0) + 1;

    elements.forEach((el) => {
      const pid = el.getAttribute('data-pid');
      if (!pid) return;
      const st = states[pid] || {};
      el.classList.toggle('para-locked', !!st.locked);
      el.classList.toggle('para-has-comments', (commentCounts[pid] || 0) > 0);
      el.classList.toggle('para-pending-change', !!st.pending_change);
      el.classList.toggle('para-selected', pid === selectedPid);
      el.classList.toggle('para-editing', pid === editingPid);

      const shouldBeEditable = pid === editingPid;
      const isEditable = el.getAttribute('contenteditable') === 'true';
      if (shouldBeEditable && !isEditable) {
        el.setAttribute('contenteditable', 'true');
        el.spellcheck = true;
        editStartHtml.current = el.outerHTML;
        // Focus after the next paint so the caret lands inside
        setTimeout(() => {
          el.focus();
          // Place caret at end
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }, 0);
      } else if (!shouldBeEditable && isEditable) {
        el.removeAttribute('contenteditable');
      }
    });
  }, [body, states, comments, selectedPid, editingPid]);

  // Capture inline edits on blur — push to version history and notify parent.
  // Uses event delegation so we only attach one listener regardless of paragraph count.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target?.getAttribute) return;
      const pid = target.getAttribute('data-pid');
      const editable = target.getAttribute('contenteditable');
      if (!pid || editable !== 'true') return;

      const newHtml = target.outerHTML;
      const oldHtml = editStartHtml.current;
      if (!oldHtml || newHtml === oldHtml) {
        // No change — just exit edit mode
        setEditingPid((p) => (p === pid ? null : p));
        return;
      }

      // Persist version history so the manual edit is recoverable
      paragraphs.pushVersion(runId, pid, {
        html: oldHtml,
        created_at: new Date().toISOString(),
        run_id: runId, // user-initiated edit, no separate regen run
      });
      activity.log(runId, 'edited', { pid });

      // Update the full document HTML and notify parent
      const updatedFull = replaceParagraph(localHtml, pid, newHtml);
      setLocalHtml(updatedFull);
      onHtmlChange?.(updatedFull);
      setEditingPid((p) => (p === pid ? null : p));
      refresh();
    };

    container.addEventListener('blur', handleBlur, true); // capture phase
    return () => container.removeEventListener('blur', handleBlur, true);
  }, [runId, localHtml, onHtmlChange, refresh]);

  // Mouse tracking on the document container
  const handleMouseOver = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-pid]') as HTMLElement | null;
    if (!target) return;
    const pid = target.getAttribute('data-pid');
    if (!pid || pid === hoverPid) return;
    setHoverPid(pid);
    const containerRect = containerRef.current?.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    if (containerRect) {
      setHoverPos({
        top: rect.top - containerRect.top + (containerRef.current?.scrollTop || 0),
        left: rect.right - containerRect.left + 8,
      });
    }
  };

  const handleParagraphClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-pid]') as HTMLElement | null;
    if (!target) return;
    const pid = target.getAttribute('data-pid');
    if (pid) { setSelectedPid(pid); setShowActivity(false); }
  };

  // ─── Actions ──────────────────────────────────────────────────────
  const toggleLock = (pid: string) => {
    const current = states[pid]?.locked || false;
    paragraphs.setLocked(runId, pid, !current);
    activity.log(runId, current ? 'unlocked' : 'locked', { pid });
    refresh();
  };

  const handleAddComment = (pid: string, text: string) => {
    if (!text.trim()) return;
    paragraphs.addComment(runId, pid, text.trim());
    activity.log(runId, 'commented', { pid, detail: text.trim().slice(0, 80) });
    refresh();
  };

  const handleUpdateCommentStatus = (commentId: string, status: CommentStatus) => {
    paragraphs.setCommentStatus(runId, commentId, status);
    const c = comments.find((x) => x.id === commentId);
    activity.log(runId, 'comment_status', { pid: c?.pid, detail: `marked ${status.replace('_', ' ')}` });
    refresh();
  };

  const handleDeleteComment = (commentId: string) => {
    paragraphs.deleteComment(runId, commentId);
    refresh();
  };

  const handleAcceptChange = (pid: string) => {
    // Keep current content (after_html), just clear the pending flag.
    paragraphs.clearPendingChange(runId, pid);
    activity.log(runId, 'accepted_change', { pid });
    refresh();
  };

  const handleRejectChange = (pid: string) => {
    const change = states[pid]?.pending_change;
    if (!change) return;
    const newHtml = replaceParagraph(localHtml, pid, change.before_html);
    setLocalHtml(newHtml);
    paragraphs.clearPendingChange(runId, pid);
    activity.log(runId, 'rejected_change', { pid });
    refresh();
    onHtmlChange?.(newHtml);
  };

  const lockedPids = useMemo(
    () => Object.entries(states).filter(([, s]) => s.locked).map(([pid]) => pid),
    [states],
  );

  // One "previous version" per changed subsection — the most recent snapshot
  // captured before the current text (versions are stored oldest-first, so the
  // last entry is the immediately preceding version). We deliberately surface
  // only this single previous version here, not the full history.
  const previousVersions = useMemo(() => {
    const doc = new DOMParser().parseFromString(body, 'text/html');
    const entries: { pid: string; label: string; version: ParagraphVersion }[] = [];
    for (const [pid, st] of Object.entries(states)) {
      const versions = st.versions;
      if (!versions || versions.length === 0) continue;
      const previous = versions[versions.length - 1];

      // Label the subsection by its nearest preceding heading, falling back to
      // a snippet of the current text.
      const el = doc.querySelector(`[data-pid="${pid}"]`);
      let label = pid;
      if (el) {
        let heading = '';
        let node: Element | null = el;
        while (node && !heading) {
          let sib = node.previousElementSibling;
          while (sib) {
            if (/^H[1-6]$/.test(sib.tagName)) { heading = sib.textContent?.trim() || ''; break; }
            sib = sib.previousElementSibling;
          }
          node = node.parentElement;
        }
        label = heading || (el.textContent?.trim().slice(0, 60) || pid);
      }
      entries.push({ pid, label, version: previous });
    }
    return entries;
  }, [states, body]);

  const selectedComments = selectedPid ? comments.filter((c) => c.pid === selectedPid) : [];
  const selectedState = selectedPid ? states[selectedPid] || {} : ({} as ParagraphState);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Editor styles for paragraph decoration. Scoped via .pe-doc parent. */}
      <style>{`
        .pe-doc { position: relative; }
        .pe-doc [data-pid] {
          position: relative;
          transition: background-color 0.15s, outline 0.15s;
          outline: 2px solid transparent;
          outline-offset: 2px;
          border-radius: 2px;
        }
        .pe-doc [data-pid]:hover {
          background-color: rgba(59, 130, 246, 0.04);
        }
        .pe-doc [data-pid].para-locked {
          background-color: rgba(99, 102, 241, 0.06);
          border-left: 3px solid rgb(99, 102, 241);
          padding-left: 6px;
        }
        .pe-doc [data-pid].para-has-comments {
          background-color: rgba(245, 158, 11, 0.05);
        }
        .pe-doc [data-pid].para-pending-change {
          background-color: rgba(34, 197, 94, 0.06);
          outline: 1px dashed rgb(34, 197, 94);
        }
        .pe-doc [data-pid].para-selected {
          outline: 2px solid rgb(59, 130, 246);
          background-color: rgba(59, 130, 246, 0.06);
        }
        .pe-doc [data-pid].para-editing {
          outline: 2px solid rgb(37, 99, 235) !important;
          background-color: rgba(219, 234, 254, 0.5) !important;
          cursor: text;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
        .pe-doc [data-pid][contenteditable="true"]:focus {
          outline-style: solid;
        }
        ${styles}
      `}</style>

      {/* Top action bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="font-medium text-gray-700">Run {runId.slice(0, 8)}</span>
          <span>·</span>
          <span>{Object.keys(states).filter((p) => states[p]?.locked).length} locked</span>
          <span>·</span>
          <span>{comments.length} comment{comments.length !== 1 ? 's' : ''}</span>
          {Object.values(states).some((s) => s.pending_change) && (
            <>
              <span>·</span>
              <span className="text-amber-600 font-medium">
                {Object.values(states).filter((s) => s.pending_change).length} unresolved change{Object.values(states).filter((s) => s.pending_change).length !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowActivity((v) => !v); setSelectedPid(null); }}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
              showActivity ? 'bg-gray-800 text-white' : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50'
            }`}
            title="Change history for this run"
          >
            <Activity size={12} />
            Activity
            {activityLog.length > 0 && (
              <span className={`text-[10px] px-1 rounded ${showActivity ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
                {activityLog.length}
              </span>
            )}
          </button>
          {onRegenerate && (
            <button
              onClick={() => onRegenerate(lockedPids)}
              disabled={regenerating}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
              title={lockedPids.length > 0 ? `Regenerate, preserving ${lockedPids.length} locked paragraph(s)` : 'Regenerate document'}
            >
              {regenerating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
              {regenerating ? 'Regenerating…' : 'Regenerate'}
            </button>
          )}
          {(onDownloadHtml || onPrintPdf || onDownloadDocx) && (
            <div ref={downloadMenuRef} className="relative">
              <button
                onClick={() => setDownloadOpen(!downloadOpen)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-md transition-colors"
              >
                <Download size={12} />
                Export
                <ChevronDown size={10} />
              </button>
              {downloadOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-40">
                  {onDownloadHtml && (
                    <button
                      onClick={() => { onDownloadHtml(); setDownloadOpen(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs flex items-center gap-2"
                    >
                      <FileText size={12} className="text-blue-500" />
                      <div>
                        <div className="font-medium text-gray-800">HTML</div>
                        <div className="text-[10px] text-gray-500">Source format, full styles</div>
                      </div>
                    </button>
                  )}
                  {onPrintPdf && (
                    <button
                      onClick={() => { onPrintPdf(); setDownloadOpen(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs flex items-center gap-2"
                    >
                      <Printer size={12} className="text-red-500" />
                      <div>
                        <div className="font-medium text-gray-800">Print → PDF</div>
                        <div className="text-[10px] text-gray-500">Browser print dialog</div>
                      </div>
                    </button>
                  )}
                  {onDownloadDocx && (
                    <button
                      onClick={() => { onDownloadDocx(); setDownloadOpen(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs flex items-center gap-2"
                    >
                      <FileType size={12} className="text-indigo-500" />
                      <div>
                        <div className="font-medium text-gray-800">Word (.doc)</div>
                        <div className="text-[10px] text-gray-500">Editable in Microsoft Word</div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Document area */}
        <div
          className="flex-1 overflow-y-auto bg-gray-100 py-6 px-4"
          ref={containerRef}
          onMouseOver={handleMouseOver}
          onClick={handleParagraphClick}
        >
          <div
            className="pe-doc max-w-[210mm] mx-auto bg-white shadow-sm p-10 text-sm"
            style={{ fontFamily: "'Times New Roman', Times, serif", lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: body }}
          />

          {/* Previous version — one entry per changed subsection (not the full history) */}
          {previousVersions.length > 0 && (
            <div className="max-w-[210mm] mx-auto mt-6">
              <details className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <summary className="cursor-pointer select-none px-5 py-3 flex items-center gap-2 text-sm font-medium text-gray-700">
                  <History size={14} className="text-gray-400" />
                  Previous version
                  <span className="text-[11px] font-normal text-gray-400">
                    {previousVersions.length} changed subsection{previousVersions.length !== 1 ? 's' : ''}
                  </span>
                </summary>
                <div className="border-t border-gray-100 divide-y divide-gray-100">
                  {previousVersions.map(({ pid, label, version }) => (
                    <button
                      key={pid}
                      onClick={() => { setSelectedPid(pid); setShowActivity(false); }}
                      className="text-left w-full px-5 py-3 hover:bg-gray-50 transition-colors"
                      title="Open this subsection"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-medium text-gray-800 truncate">{label}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          {new Date(version.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div
                        className="text-[13px] text-gray-500 max-h-32 overflow-y-auto font-serif border-l-2 border-gray-200 pl-3"
                        dangerouslySetInnerHTML={{ __html: version.html }}
                      />
                    </button>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Floating hover controls */}
          {hoverPid && hoverPos && !editingPid && (
            <div
              className="absolute z-30 flex items-center gap-1 bg-white rounded-md shadow-lg border border-gray-200 px-1.5 py-1"
              style={{ top: hoverPos.top, left: hoverPos.left, pointerEvents: 'auto' }}
              onMouseLeave={() => setHoverPid(null)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setEditingPid(hoverPid); }}
                disabled={!!states[hoverPid]?.locked}
                className={`p-1 rounded transition-colors ${states[hoverPid]?.locked ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:bg-blue-50 hover:text-blue-700'}`}
                title={states[hoverPid]?.locked ? 'Unlock the paragraph before editing' : 'Edit paragraph text'}
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleLock(hoverPid); }}
                className={`p-1 rounded transition-colors ${states[hoverPid]?.locked ? 'text-indigo-600 hover:bg-indigo-50' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}
                title={states[hoverPid]?.locked ? 'Unlock paragraph' : 'Lock paragraph (preserve on regenerate)'}
              >
                {states[hoverPid]?.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedPid(hoverPid); }}
                className="p-1 rounded text-gray-400 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                title="Comments"
              >
                <MessageSquare size={13} />
                {comments.filter((c) => c.pid === hoverPid).length > 0 && (
                  <span className="ml-0.5 text-[9px] font-medium text-amber-600">
                    {comments.filter((c) => c.pid === hoverPid).length}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Floating "Done editing" hint when in edit mode */}
          {editingPid && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg">
              <Pencil size={12} />
              Editing paragraph — click outside to save
              <button
                onClick={() => setEditingPid(null)}
                className="ml-1 px-2 py-0.5 rounded bg-blue-700 hover:bg-blue-800 text-[10px]"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Right drawer: activity feed */}
        {showActivity && (
          <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Activity</span>
                <span className="text-[10px] text-gray-400">{activityLog.length}</span>
              </div>
              <button onClick={() => setShowActivity(false)} className="text-gray-300 hover:text-gray-500">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <ActivityFeed entries={activityLog} onJumpToParagraph={(pid) => { setSelectedPid(pid); setShowActivity(false); }} />
            </div>
            <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400">
              Actor attribution is a placeholder until login is added.
            </div>
          </div>
        )}

        {/* Right drawer: paragraph details */}
        {!showActivity && selectedPid && (
          <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Paragraph</p>
                <p className="font-mono text-xs text-gray-700">{selectedPid}</p>
              </div>
              <button
                onClick={() => setSelectedPid(null)}
                className="text-gray-300 hover:text-gray-500"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Lock + Edit actions */}
              <div className="px-4 py-3 border-b border-gray-100 space-y-2">
                <button
                  onClick={() => { if (!selectedState.locked) setEditingPid(selectedPid); }}
                  disabled={!!selectedState.locked || editingPid === selectedPid}
                  className="w-full inline-flex items-center justify-center gap-2 text-xs font-medium py-2 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Pencil size={13} />
                  {editingPid === selectedPid ? 'Editing — click outside to save' : 'Edit text'}
                </button>
                <button
                  onClick={() => toggleLock(selectedPid)}
                  className={`w-full inline-flex items-center justify-center gap-2 text-xs font-medium py-2 rounded-md transition-colors ${
                    selectedState.locked
                      ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {selectedState.locked ? <Lock size={13} /> : <Unlock size={13} />}
                  {selectedState.locked ? 'Locked — preserved on regenerate' : 'Lock this paragraph'}
                </button>
              </div>

              {/* Pending change (track changes) */}
              {selectedState.pending_change && (
                <div className="px-4 py-3 border-b border-gray-100 bg-green-50/30">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={12} className="text-amber-600" />
                    <span className="text-xs font-medium text-gray-700">Unresolved change</span>
                  </div>
                  <div className="space-y-2 mb-3 text-[11px]">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Before</div>
                      <div className="px-2 py-1.5 rounded bg-red-50 border border-red-100 text-red-900 max-h-32 overflow-y-auto font-serif">
                        <div dangerouslySetInnerHTML={{ __html: selectedState.pending_change.before_html }} />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">After</div>
                      <div className="px-2 py-1.5 rounded bg-green-50 border border-green-100 text-green-900 max-h-32 overflow-y-auto font-serif">
                        <div dangerouslySetInnerHTML={{ __html: selectedState.pending_change.after_html }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptChange(selectedPid)}
                      className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-white bg-green-600 hover:bg-green-700 py-1.5 rounded transition-colors"
                    >
                      <Check size={11} />
                      Accept
                    </button>
                    <button
                      onClick={() => handleRejectChange(selectedPid)}
                      className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 py-1.5 rounded transition-colors"
                    >
                      <X size={11} />
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Comments */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700">Comments</span>
                  <span className="text-[10px] text-gray-400">{selectedComments.length}</span>
                </div>
                <CommentList
                  comments={selectedComments}
                  onStatusChange={handleUpdateCommentStatus}
                  onDelete={handleDeleteComment}
                />
                <CommentInput onSubmit={(text) => handleAddComment(selectedPid, text)} />
              </div>

              {/* Versions */}
              {(selectedState.versions?.length || 0) > 0 && (
                <div className="px-4 py-3 border-t border-gray-100">
                  <div className="flex items-center gap-1.5 mb-2">
                    <History size={12} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-700">Version history</span>
                  </div>
                  <div className="space-y-1.5">
                    {[...(selectedState.versions || [])].reverse().map((v, i) => (
                      <div key={i} className="text-[10px] text-gray-500 bg-gray-50 rounded px-2 py-1.5 border border-gray-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono">{v.run_id.slice(-6)}</span>
                          <span>{new Date(v.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-gray-600 max-h-16 overflow-y-auto font-serif" dangerouslySetInnerHTML={{ __html: v.html }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inline subcomponents ────────────────────────────────────────────

function CommentList({
  comments,
  onStatusChange,
  onDelete,
}: {
  comments: ParagraphComment[];
  onStatusChange: (id: string, status: CommentStatus) => void;
  onDelete: (id: string) => void;
}) {
  if (comments.length === 0) {
    return <p className="text-[11px] text-gray-400 italic mb-2">No comments yet.</p>;
  }
  return (
    <div className="space-y-2 mb-3">
      {comments.map((c) => (
        <div key={c.id} className="bg-gray-50 rounded-md p-2 border border-gray-100">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-[10px] text-gray-500">{c.author}</span>
            <button onClick={() => onDelete(c.id)} className="text-gray-300 hover:text-red-500">
              <Trash2 size={10} />
            </button>
          </div>
          <p className="text-xs text-gray-800 whitespace-pre-wrap break-words mb-1.5">{c.text}</p>
          <div className="flex items-center justify-between">
            <StatusBadge status={c.status} onChange={(s) => onStatusChange(c.id, s)} />
            <span className="text-[9px] text-gray-400">{new Date(c.created_at).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Activity feed ───────────────────────────────────────────────────

const ACTION_DISPLAY: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  generated: { label: 'Generated document', icon: <Wand2 size={12} />, color: 'text-green-600' },
  regenerated: { label: 'Regenerated', icon: <Wand2 size={12} />, color: 'text-primary-600' },
  edited: { label: 'Edited paragraph', icon: <Pencil size={12} />, color: 'text-blue-600' },
  locked: { label: 'Locked paragraph', icon: <Lock size={12} />, color: 'text-indigo-600' },
  unlocked: { label: 'Unlocked paragraph', icon: <Unlock size={12} />, color: 'text-gray-500' },
  commented: { label: 'Added comment', icon: <MessageSquarePlus size={12} />, color: 'text-amber-600' },
  comment_status: { label: 'Updated comment status', icon: <MessageSquare size={12} />, color: 'text-amber-600' },
  accepted_change: { label: 'Accepted change', icon: <Check size={12} />, color: 'text-green-600' },
  rejected_change: { label: 'Rejected change', icon: <X size={12} />, color: 'text-red-600' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function ActivityFeed({ entries, onJumpToParagraph }: { entries: ActivityEntry[]; onJumpToParagraph: (pid: string) => void }) {
  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 italic text-center py-6">No activity recorded yet.</p>;
  }
  return (
    <ol className="relative border-l border-gray-200 ml-2 space-y-3">
      {entries.map((e) => {
        const d = ACTION_DISPLAY[e.action] || { label: e.action, icon: <Activity size={12} />, color: 'text-gray-500' };
        return (
          <li key={e.id} className="ml-4">
            <span className={`absolute -left-[7px] flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white border border-gray-300 ${d.color}`} />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className={`flex items-center gap-1.5 text-xs font-medium ${d.color}`}>
                  {d.icon}
                  <span className="text-gray-800">{d.label}</span>
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  <span className="font-medium text-gray-600">{e.actor}</span>
                  {e.pid && (
                    <>
                      {' · '}
                      <button
                        onClick={() => onJumpToParagraph(e.pid!)}
                        className="font-mono text-primary-500 hover:text-primary-700 hover:underline"
                      >
                        {e.pid}
                      </button>
                    </>
                  )}
                </div>
                {e.detail && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{e.detail}</div>}
              </div>
              <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0" title={new Date(e.created_at).toLocaleString()}>
                {timeAgo(e.created_at)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CommentInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a comment…"
        rows={2}
        className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:ring-1 focus:ring-primary-500 focus:outline-none resize-none"
      />
      <button
        onClick={() => { if (value.trim()) { onSubmit(value); setValue(''); } }}
        disabled={!value.trim()}
        className="w-full text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed py-1.5 rounded-md transition-colors"
      >
        Add comment
      </button>
    </div>
  );
}

// ─── Helpers exported for the regenerate flow ────────────────────────

/** Diff two HTML strings paragraph-by-paragraph by data-pid. Returns the pids that changed. */
export function findChangedParagraphs(beforeHtml: string, afterHtml: string): Array<{ pid: string; before: string; after: string }> {
  const before = new DOMParser().parseFromString(beforeHtml, 'text/html');
  const after = new DOMParser().parseFromString(afterHtml, 'text/html');
  const changes: Array<{ pid: string; before: string; after: string }> = [];

  const beforeMap = new Map<string, string>();
  before.querySelectorAll('[data-pid]').forEach((el) => {
    const pid = el.getAttribute('data-pid');
    if (pid) beforeMap.set(pid, el.outerHTML);
  });

  after.querySelectorAll('[data-pid]').forEach((el) => {
    const pid = el.getAttribute('data-pid');
    if (!pid) return;
    const oldHtml = beforeMap.get(pid);
    const newHtml = el.outerHTML;
    if (oldHtml !== undefined && oldHtml !== newHtml) {
      changes.push({ pid, before: oldHtml, after: newHtml });
    }
  });

  return changes;
}

export { getParagraphHtml, replaceParagraph, extractBodyContent };
