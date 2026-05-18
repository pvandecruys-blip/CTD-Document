import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FileText,
  Trash2,
  CheckCircle2,
  XCircle,
  FileUp,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Download,
  Cloud,
  CloudOff,
  History,
  Loader2,
  ArrowLeft,
  Tag,
  Plus,
  X,
} from 'lucide-react';
import type { DocumentFile, DocumentClassification, VeevaDocument } from '../types';
import { useProject } from '../context/ProjectContext';
import { documents, veeva } from '../api/client';
import { extractTextFromFile, collectDroppedFiles } from '../lib/fileText';
import { getLeafSections } from '../config/ctdStructure';

const CLASSIFICATION_OPTIONS: { value: DocumentClassification; label: string }[] = [
  { value: 'stability_plan', label: 'Stability Plan' },
  { value: 'stability_report', label: 'Stability Report' },
  { value: 'coa', label: 'Certificate of Analysis' },
  { value: 'technical_report', label: 'Technical Report' },
  { value: 'other_supporting', label: 'Other Supporting' },
];

const VEEVA_STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  steady_state: { label: 'Up to date', color: 'bg-green-100 text-green-700' },
  update_available: { label: 'Update Available', color: 'bg-amber-100 text-amber-700 animate-pulse' },
  new: { label: 'New', color: 'bg-blue-100 text-blue-700' },
};

// ─── Section Tag Picker ──────────────────────────────────────────────
function SectionTagPicker({
  currentTags,
  onAdd,
  onClose,
}: {
  currentTags: string[];
  onAdd: (sectionId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const allSections = useMemo(() => getLeafSections(), []);
  const available = allSections.filter(
    (s) =>
      !currentTags.includes(s.id) &&
      (filter === '' ||
        s.number.toLowerCase().includes(filter.toLowerCase()) ||
        s.title.toLowerCase().includes(filter.toLowerCase())),
  );

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
        <input
          type="text"
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter sections…"
          className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-primary-500 focus:outline-none"
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {available.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-gray-400">No matching sections</div>
        ) : (
          available.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                onAdd(s.id);
                onClose();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-primary-50 flex items-center gap-2 group"
            >
              <span className="font-mono text-[10px] text-gray-500 w-16 flex-shrink-0">{s.number}</span>
              <span className="text-xs text-gray-700 group-hover:text-primary-700 truncate">{s.title}</span>
              {s.isGenerable && <span className="ml-auto text-[9px] text-green-600 font-medium">AI</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Section Tags Cell ───────────────────────────────────────────────
function SectionTagsCell({
  doc,
  onChange,
}: {
  doc: DocumentFile;
  onChange: () => void;
}) {
  const { current } = useProject();
  const [pickerOpen, setPickerOpen] = useState(false);
  const tags = doc.section_tags || [];

  const handleAdd = async (sectionId: string) => {
    if (!current) return;
    await documents.addTag(current.id, doc.id, sectionId);
    onChange();
  };

  const handleRemove = async (sectionId: string) => {
    if (!current) return;
    await documents.removeTag(current.id, doc.id, sectionId);
    onChange();
  };

  const sectionByNumber = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of getLeafSections()) map.set(s.id, s.number);
    return map;
  }, []);

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1">
        {tags.length === 0 && <span className="text-[10px] text-gray-300 italic">Untagged</span>}
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 border border-primary-100"
          >
            {sectionByNumber.get(tag) || tag}
            <button
              onClick={() => handleRemove(tag)}
              className="text-primary-400 hover:text-primary-700"
              title="Remove tag"
            >
              <X size={9} />
            </button>
          </span>
        ))}
        <button
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-primary-600 hover:bg-primary-50 px-1.5 py-0.5 rounded border border-dashed border-gray-200 hover:border-primary-300 transition-colors"
        >
          <Plus size={10} />
          Tag
        </button>
      </div>
      {pickerOpen && (
        <SectionTagPicker
          currentTags={tags}
          onAdd={handleAdd}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Veeva Vault row (reused) ────────────────────────────────────────
function VeevaRow({
  doc,
  syncing,
  expanded,
  onToggleHistory,
  onSync,
}: {
  doc: VeevaDocument;
  syncing: boolean;
  expanded: boolean;
  onToggleHistory: () => void;
  onSync: () => void;
}) {
  const st = VEEVA_STATUS_DISPLAY[doc.status] || VEEVA_STATUS_DISPLAY.steady_state;
  return (
    <>
      <tr className="hover:bg-gray-50/50 group">
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-blue-400 flex-shrink-0" />
            <span className="text-gray-900 text-sm font-medium">{doc.vault_name}</span>
          </div>
        </td>
        <td className="px-4 py-2.5">
          <span className="font-mono text-xs text-gray-500">{doc.document_number}</span>
        </td>
        <td className="px-4 py-2.5">
          <span className="font-mono text-xs text-gray-900 font-medium">v{doc.current_version}</span>
        </td>
        <td className="px-4 py-2.5">
          {doc.synced_version ? (
            <span className="font-mono text-xs text-gray-500">v{doc.synced_version}</span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium ${st.color}`}>
            {st.label}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right">
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={onToggleHistory}
              className="text-gray-300 hover:text-gray-500 transition-colors"
              title="Version history"
            >
              <History size={14} />
            </button>
            {doc.status !== 'steady_state' && (
              <button
                onClick={onSync}
                disabled={syncing}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-800 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
              >
                {syncing ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                {syncing ? 'Syncing' : 'Sync'}
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-gray-50/80">
            <div className="ml-6">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Version History</p>
              <div className="space-y-1.5">
                {doc.version_history.map((v) => (
                  <div key={v.version} className="flex items-center gap-3 text-xs">
                    <span className={`font-mono font-medium w-10 ${v.version === doc.synced_version ? 'text-green-600' : 'text-gray-500'}`}>
                      v{v.version}
                    </span>
                    <span className="text-gray-400 w-20">{v.date}</span>
                    <span className="text-gray-600">{v.change_note}</span>
                    {v.version === doc.synced_version && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-600 font-medium">SYNCED</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DocumentLibrary() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { current, selectById, reload: reloadProjects } = useProject();
  const [docs, setDocs] = useState<DocumentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'pending' | 'uploading' | 'done' | 'error' }[]>([]);

  // Veeva state
  const [veevaOpen, setVeevaOpen] = useState(true);
  const [veevaDocs, setVeevaDocs] = useState<VeevaDocument[]>([]);
  const [veevaLoading, setVeevaLoading] = useState(false);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const [expandedVeevaId, setExpandedVeevaId] = useState<string | null>(null);

  // Section-tag filter
  const [tagFilter, setTagFilter] = useState<string>('all');

  useEffect(() => {
    if (projectId) selectById(projectId);
  }, [projectId, selectById]);

  const pid = current?.id;

  const load = useCallback(async () => {
    if (!pid) { setDocs([]); setLoading(false); return; }
    setLoading(true);
    try {
      const docData = await documents.list(pid);
      setDocs(docData.items);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  const loadVeeva = useCallback(async () => {
    if (!pid) return;
    setVeevaLoading(true);
    try {
      const data = await veeva.getVault(pid);
      setVeevaDocs(data.items);
    } catch { /* */ } finally {
      setVeevaLoading(false);
    }
  }, [pid]);

  useEffect(() => { loadVeeva(); }, [loadVeeva]);

  const handleVeevaSync = async (docId: string) => {
    if (!pid) return;
    setSyncingIds((s) => new Set(s).add(docId));
    try {
      await veeva.sync(pid, docId);
      await loadVeeva();
      await load();
      await reloadProjects();
    } catch { /* */ } finally {
      setSyncingIds((s) => { const n = new Set(s); n.delete(docId); return n; });
    }
  };

  const handleVeevaSyncAll = async () => {
    if (!pid) return;
    setSyncingAll(true);
    try {
      await veeva.syncAll(pid);
      await loadVeeva();
      await load();
      await reloadProjects();
    } catch { /* */ } finally {
      setSyncingAll(false);
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!pid) return;
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    setUploadQueue(fileArr.map((f) => ({ name: f.name, status: 'pending' })));
    setUploading(true);

    for (let i = 0; i < fileArr.length; i++) {
      setUploadQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: 'uploading' } : item)));
      try {
        const text = await extractTextFromFile(fileArr[i]);
        // Library uploads are untagged by default — user tags them afterwards.
        await documents.upload(pid, fileArr[i].name, text);
        setUploadQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: 'done' } : item)));
      } catch {
        setUploadQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: 'error' } : item)));
      }
    }

    setUploading(false);
    await load();
    await reloadProjects();
    setTimeout(() => setUploadQueue([]), 2000);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = await collectDroppedFiles(e, ['.pdf', '.docx', '.doc', '.xlsx', '.xls']);
    if (files.length > 0) uploadFiles(files);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleReclassify = async (docId: string, newClass: string) => {
    if (!pid) return;
    await documents.reclassify(pid, docId, newClass);
    await load();
  };

  const handleDelete = async (docId: string) => {
    if (!pid || !confirm('Remove this document from the project library?')) return;
    await documents.delete(pid, docId);
    await load();
    await reloadProjects();
  };

  const filteredDocs = useMemo(() => {
    if (tagFilter === 'all') return docs;
    if (tagFilter === 'untagged') return docs.filter((d) => !d.section_tags || d.section_tags.length === 0);
    return docs.filter((d) => d.section_tags?.includes(tagFilter));
  }, [docs, tagFilter]);

  const allSections = useMemo(() => getLeafSections(), []);
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = { all: docs.length, untagged: 0 };
    for (const d of docs) {
      if (!d.section_tags || d.section_tags.length === 0) counts.untagged++;
      for (const t of d.section_tags || []) counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [docs]);

  if (!current) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
          <FileText className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-500 text-sm">Loading project…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate(`/project/${current.id}`)}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={16} />
            Back to project
          </button>
          <div className="h-4 w-px bg-gray-200" />
          <h1 className="text-base font-semibold text-gray-900">Document Library</h1>
          <span className="text-xs text-gray-400">— {current.name}</span>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <p className="text-sm text-gray-500">
            All documents for this project. Tag each document with the CTD sections it should feed.
            Untagged documents stay here but won't be used by any section's generation.
          </p>
        </div>

        {/* Veeva Vault */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
          <button
            onClick={() => setVeevaOpen(!veevaOpen)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <Cloud size={16} className="text-white" />
              </div>
              <div className="text-left">
                <span className="text-sm font-semibold text-gray-900">Veeva Vault</span>
                <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Connected</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {veevaDocs.filter((d) => d.status !== 'steady_state').length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  {veevaDocs.filter((d) => d.status !== 'steady_state').length} updates
                </span>
              )}
              {veevaOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </div>
          </button>

          {veevaOpen && (
            <div className="border-t border-gray-100">
              {veevaDocs.some((d) => d.status !== 'steady_state') && (
                <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                  <p className="text-xs text-amber-800">Some documents have new versions available in Veeva Vault.</p>
                  <button
                    onClick={handleVeevaSyncAll}
                    disabled={syncingAll}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-200/50 hover:bg-amber-200 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
                  >
                    {syncingAll ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    {syncingAll ? 'Syncing…' : 'Sync All'}
                  </button>
                </div>
              )}

              {veevaLoading ? (
                <div className="py-6 text-center text-gray-400 text-sm">Loading vault…</div>
              ) : veevaDocs.length === 0 ? (
                <div className="py-6 text-center">
                  <CloudOff size={20} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-gray-400 text-sm">No documents in vault</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50/50">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Document</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Doc Number</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Vault Ver.</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Synced Ver.</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Status</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {veevaDocs.map((vd) => (
                      <VeevaRow
                        key={vd.id}
                        doc={vd}
                        syncing={syncingIds.has(vd.id)}
                        expanded={expandedVeevaId === vd.id}
                        onToggleHistory={() => setExpandedVeevaId(expandedVeevaId === vd.id ? null : vd.id)}
                        onSync={() => handleVeevaSync(vd.id)}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative rounded-xl border-2 border-dashed transition-all mb-6 ${
            dragOver ? 'border-primary-400 bg-primary-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-gray-400'
          }`}
        >
          <label className="flex flex-col items-center justify-center py-12 cursor-pointer">
            <input type="file" multiple accept=".pdf,.docx,.xlsx,.xls,.doc" onChange={handleFileInput} className="hidden" />
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors ${dragOver ? 'bg-primary-100' : 'bg-gray-100'}`}>
              <FileUp size={28} className={dragOver ? 'text-primary-600' : 'text-gray-400'} />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Drop files or folders here, or click to browse</p>
            <p className="text-xs text-gray-400">PDF, DOCX, XLSX — uploaded to the project library, untagged by default</p>
          </label>

          {uploadQueue.length > 0 && (
            <div className="absolute inset-0 bg-white/90 rounded-xl flex items-center justify-center">
              <div className="w-full max-w-sm px-6">
                <p className="text-sm font-medium text-gray-700 mb-3 text-center">{uploading ? 'Uploading…' : 'Upload complete'}</p>
                <div className="space-y-2">
                  {uploadQueue.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {item.status === 'uploading' && <RefreshCw size={14} className="text-primary-500 animate-spin" />}
                      {item.status === 'done' && <CheckCircle2 size={14} className="text-green-500" />}
                      {item.status === 'error' && <XCircle size={14} className="text-red-500" />}
                      {item.status === 'pending' && <div className="w-3.5 h-3.5 rounded-full bg-gray-200" />}
                      <span className={item.status === 'done' ? 'text-gray-500' : 'text-gray-700'}>{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tag filter chips */}
        {docs.length > 0 && (
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 mr-1">
              <Tag size={11} className="inline mr-1" />
              Filter:
            </span>
            <button
              onClick={() => setTagFilter('all')}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${tagFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              All ({tagCounts.all || 0})
            </button>
            <button
              onClick={() => setTagFilter('untagged')}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${tagFilter === 'untagged' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Untagged ({tagCounts.untagged || 0})
            </button>
            {allSections
              .filter((s) => (tagCounts[s.id] || 0) > 0)
              .map((s) => (
                <button
                  key={s.id}
                  onClick={() => setTagFilter(s.id)}
                  className={`text-xs font-mono px-2 py-0.5 rounded-full transition-colors ${tagFilter === s.id ? 'bg-primary-700 text-white' : 'bg-primary-50 text-primary-700 hover:bg-primary-100'}`}
                >
                  {s.number} ({tagCounts[s.id] || 0})
                </button>
              ))}
          </div>
        )}

        {/* Documents table */}
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading…</div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            {docs.length === 0
              ? 'No documents yet. Drop files above to get started.'
              : 'No documents match the current filter.'}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-visible">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">File</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Classification</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Used by Sections</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Size</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDocs.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-gray-400 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{d.original_filename}</p>
                          <p className="text-xs text-gray-400 uppercase">{d.file_type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative inline-block">
                        <select
                          value={d.classification}
                          onChange={(e) => handleReclassify(d.id, e.target.value)}
                          className="text-xs bg-transparent border border-gray-200 rounded px-2 py-1 pr-6 appearance-none cursor-pointer hover:border-gray-400 focus:ring-1 focus:ring-primary-500 focus:outline-none"
                        >
                          {CLASSIFICATION_OPTIONS.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <SectionTagsCell doc={d} onChange={load} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {d.file_size_bytes > 1024 * 1024
                        ? `${(d.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`
                        : `${(d.file_size_bytes / 1024).toFixed(0)} KB`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
