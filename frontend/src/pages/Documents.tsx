import { useEffect, useState, useCallback } from 'react';
import {
  FileText,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileUp,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import type { DocumentFile, DocumentClassification } from '../types';
import { useProject } from '../context/ProjectContext';
import { documents, readiness, type ReadinessReport } from '../api/client';

const CLASSIFICATION_OPTIONS: { value: DocumentClassification; label: string }[] = [
  { value: 'stability_plan', label: 'Stability Plan' },
  { value: 'stability_report', label: 'Stability Report' },
  { value: 'coa', label: 'Certificate of Analysis' },
  { value: 'technical_report', label: 'Technical Report' },
  { value: 'other_supporting', label: 'Other Supporting' },
];

const STATUS_STYLE: Record<string, { bg: string; icon: React.ReactNode }> = {
  ready: { bg: 'bg-green-50 border-green-200', icon: <CheckCircle2 size={16} className="text-green-600" /> },
  partial: { bg: 'bg-amber-50 border-amber-200', icon: <AlertTriangle size={16} className="text-amber-600" /> },
  blocked: { bg: 'bg-red-50 border-red-200', icon: <XCircle size={16} className="text-red-500" /> },
  optional: { bg: 'bg-gray-50 border-gray-200', icon: <FileText size={16} className="text-gray-400" /> },
};

export default function Documents() {
  const { current, reload: reloadProjects } = useProject();
  const [docs, setDocs] = useState<DocumentFile[]>([]);
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'pending' | 'uploading' | 'done' | 'error' }[]>([]);

  const pid = current?.id;

  const load = useCallback(async () => {
    if (!pid) { setDocs([]); setReport(null); setLoading(false); return; }
    setLoading(true);
    try {
      const [docData, readinessData] = await Promise.all([
        documents.list(pid),
        readiness.check(pid),
      ]);
      setDocs(docData.items);
      setReport(readinessData);
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  const uploadFiles = async (files: FileList | File[]) => {
    if (!pid) return;
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    setUploadQueue(fileArr.map((f) => ({ name: f.name, status: 'pending' })));
    setUploading(true);

    for (let i = 0; i < fileArr.length; i++) {
      setUploadQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: 'uploading' } : item));
      try {
        await documents.upload(pid, fileArr[i]);
        setUploadQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: 'done' } : item));
      } catch {
        setUploadQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: 'error' } : item));
      }
    }

    setUploading(false);
    await load();
    await reloadProjects();

    // Clear queue after a moment
    setTimeout(() => setUploadQueue([]), 2000);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    // Collect files from dropped items (including folders)
    const ALLOWED_EXT = ['.pdf', '.docx', '.doc', '.xlsx', '.xls'];
    const collected: File[] = [];

    const readEntry = (entry: FileSystemEntry): Promise<void> => {
      return new Promise((resolve) => {
        if (entry.isFile) {
          (entry as FileSystemFileEntry).file((f) => {
            const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
            if (ALLOWED_EXT.includes(ext)) collected.push(f);
            resolve();
          }, () => resolve());
        } else if (entry.isDirectory) {
          const reader = (entry as FileSystemDirectoryEntry).createReader();
          reader.readEntries(async (entries) => {
            for (const child of entries) {
              await readEntry(child);
            }
            resolve();
          }, () => resolve());
        } else {
          resolve();
        }
      });
    };

    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }

    if (entries.length > 0) {
      for (const entry of entries) {
        await readEntry(entry);
      }
      if (collected.length > 0) uploadFiles(collected);
    } else if (e.dataTransfer.files.length > 0) {
      // Fallback for browsers that don't support webkitGetAsEntry
      uploadFiles(e.dataTransfer.files);
    }
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
    if (!pid || !confirm('Remove this document?')) return;
    await documents.delete(pid, docId);
    await load();
    await reloadProjects();
  };

  if (!current) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
          <FileText className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-500 text-sm">Create a project first from the Dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-sm text-gray-500 mt-1">
          Drop your source files — the system will classify them and determine what can be generated.
        </p>
      </div>

      {/* ── Drop Zone ──────────────────────────────────────────── */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative rounded-xl border-2 border-dashed transition-all mb-6 ${
          dragOver
            ? 'border-primary-400 bg-primary-50 scale-[1.01]'
            : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
      >
        <label className="flex flex-col items-center justify-center py-12 cursor-pointer">
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.xls,.doc"
            onChange={handleFileInput}
            className="hidden"
          />
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors ${
            dragOver ? 'bg-primary-100' : 'bg-gray-100'
          }`}>
            <FileUp size={28} className={dragOver ? 'text-primary-600' : 'text-gray-400'} />
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">
            Drop files or folders here, or click to browse
          </p>
          <p className="text-xs text-gray-400">
            PDF, DOCX, XLSX — Stability Plans, Reports, CoAs, Guidelines, etc.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Documents will be automatically classified
          </p>
        </label>

        {/* Upload queue overlay */}
        {uploadQueue.length > 0 && (
          <div className="absolute inset-0 bg-white/90 rounded-xl flex items-center justify-center">
            <div className="w-full max-w-sm px-6">
              <p className="text-sm font-medium text-gray-700 mb-3 text-center">
                {uploading ? 'Uploading...' : 'Upload complete'}
              </p>
              <div className="space-y-2">
                {uploadQueue.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {item.status === 'uploading' && <RefreshCw size={14} className="text-primary-500 animate-spin" />}
                    {item.status === 'done' && <CheckCircle2 size={14} className="text-green-500" />}
                    {item.status === 'error' && <XCircle size={14} className="text-red-500" />}
                    {item.status === 'pending' && <div className="w-3.5 h-3.5 rounded-full bg-gray-200" />}
                    <span className={item.status === 'done' ? 'text-gray-500' : 'text-gray-700'}>
                      {item.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Readiness Panel ────────────────────────────────────── */}
      {report && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
            Build Readiness
          </h2>
          <div className="grid gap-3">
            {report.capabilities.map((cap) => {
              const style = STATUS_STYLE[cap.status] || STATUS_STYLE.blocked;
              return (
                <div
                  key={cap.section}
                  className={`rounded-lg border p-4 ${style.bg}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {style.icon}
                    <span className="text-xs font-mono text-gray-500">{cap.section}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">{cap.title}</p>
                  {cap.status === 'ready' ? (
                    <p className="text-xs text-green-700">Ready to generate</p>
                  ) : cap.missing.length > 0 ? (
                    <ul className="text-xs text-gray-500 space-y-0.5">
                      {cap.missing.map((m, i) => (
                        <li key={i}>• {m}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400">Optional</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary bar */}
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
            <span>{report.document_summary.total} document{report.document_summary.total !== 1 ? 's' : ''}</span>
            <span className="text-green-600">{report.document_summary.authoritative_count} authoritative</span>
            <span>{report.document_summary.supporting_count} supporting</span>
            {report.extraction_status.extracted && (
              <span className="text-primary-600">
                {report.extraction_status.studies} studies, {report.extraction_status.conditions} conditions, {report.extraction_status.attributes} attributes extracted
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Document Table ─────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No documents yet. Drop files above to get started.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">File</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Classification</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Authority</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Size</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map((d) => (
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
                    {(d as any).auto_classified && (
                      <span className="ml-2 text-[10px] text-amber-500 font-medium">AUTO</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {d.authority === 'authoritative' ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        Authoritative
                      </span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        Supporting
                      </span>
                    )}
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
  );
}
