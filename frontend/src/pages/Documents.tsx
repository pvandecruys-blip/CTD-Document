import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import type { DocumentFile, DocumentClassification, VeevaDocument } from '../types';
import { useProject } from '../context/ProjectContext';
import { documents, veeva } from '../api/client';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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

function VeevaRow({ doc, syncing, expanded, onToggleHistory, onSync }: {
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

export default function Documents() {
  const { current, reload: reloadProjects } = useProject();
  const [docs, setDocs] = useState<DocumentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'pending' | 'uploading' | 'done' | 'error' }[]>([]);

  // Veeva Vault state
  const [veevaOpen, setVeevaOpen] = useState(true);
  const [veevaDocs, setVeevaDocs] = useState<VeevaDocument[]>([]);
  const [veevaLoading, setVeevaLoading] = useState(false);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const [expandedVeevaId, setExpandedVeevaId] = useState<string | null>(null);

  const pid = current?.id;

  const load = useCallback(async () => {
    if (!pid) { setDocs([]); setLoading(false); return; }
    setLoading(true);
    try {
      const docData = await documents.list(pid);
      setDocs(docData.items);
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  // Load Veeva vault documents
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

  // Extract text from various file types with table structure preservation
  const extractTextFromFile = async (file: File): Promise<string> => {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    console.log(`Extracting text from ${file.name} (${ext}, ${file.size} bytes)`);

    try {
      // PDF extraction using PDF.js with table structure preservation
      if (ext === '.pdf') {
        console.log('Starting PDF extraction with table detection...');
        const arrayBuffer = await file.arrayBuffer();

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        console.log(`PDF loaded: ${pdf.numPages} pages`);

        const textParts: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();

          // Extract items with position data - use any to handle PDF.js type variations
          const items = (content.items as Array<{ str?: string; transform?: number[] }>)
            .filter((item) => item.str && item.transform)
            .map((item) => ({
              text: item.str!,
              x: Math.round(item.transform![4]), // X position
              y: Math.round(item.transform![5]), // Y position
            }))
            .filter((item) => item.text.trim()); // Remove empty items

          if (items.length === 0) {
            textParts.push('');
            continue;
          }

          // Group items by Y position (rows) - items within 3px are same row
          const rows: Map<number, typeof items> = new Map();
          for (const item of items) {
            let foundRow = false;
            for (const [rowY] of rows) {
              if (Math.abs(item.y - rowY) < 3) {
                rows.get(rowY)!.push(item);
                foundRow = true;
                break;
              }
            }
            if (!foundRow) {
              rows.set(item.y, [item]);
            }
          }

          // Sort rows by Y (top to bottom = higher Y first in PDF coordinates)
          const sortedRows = Array.from(rows.entries())
            .sort((a, b) => b[0] - a[0]);

          // Build text with proper spacing
          const pageLines: string[] = [];
          for (const [, rowItems] of sortedRows) {
            // Sort items in row by X position (left to right)
            rowItems.sort((a, b) => a.x - b.x);

            // Join with tabs if there's significant horizontal gap (likely table columns)
            let lineText = '';
            let lastX = -1000;
            for (const item of rowItems) {
              const gap = item.x - lastX;
              if (lastX >= 0 && gap > 30) {
                // Large gap = likely table column separator
                lineText += '\t';
              } else if (lastX >= 0 && gap > 5) {
                // Small gap = space
                lineText += ' ';
              }
              lineText += item.text;
              lastX = item.x + (item.text.length * 5); // Approximate end position
            }
            pageLines.push(lineText);
          }

          textParts.push(pageLines.join('\n'));
        }

        const fullText = textParts.join('\n\n--- PAGE BREAK ---\n\n');
        console.log(`PDF extraction complete: ${fullText.length} characters`);
        return fullText || `[PDF ${file.name} contains no extractable text - may be scanned/image-based]`;
      }

      // DOCX extraction using Mammoth
      if (ext === '.docx') {
        console.log('Starting DOCX extraction...');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        console.log(`DOCX extraction complete: ${result.value.length} characters`);
        return result.value || `[DOCX ${file.name} contains no text]`;
      }

      // Plain text and other text-based files
      if (ext === '.txt' || ext === '.csv' || ext === '.xml') {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const text = reader.result as string || '';
            console.log(`Text file read: ${text.length} characters`);
            resolve(text);
          };
          reader.onerror = () => resolve(`[Error reading ${file.name}]`);
          reader.readAsText(file);
        });
      }

      // For unsupported formats, return a notice
      return `[File type ${ext} not supported for text extraction. Please upload PDF, DOCX, or TXT files for best results.]`;
    } catch (error) {
      console.error('Text extraction error:', error);
      return `[Error extracting text from ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}]`;
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!pid) return;
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    setUploadQueue(fileArr.map((f) => ({ name: f.name, status: 'pending' })));
    setUploading(true);

    for (let i = 0; i < fileArr.length; i++) {
      setUploadQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: 'uploading' } : item));
      try {
        const text = await extractTextFromFile(fileArr[i]);
        await documents.upload(pid, fileArr[i].name, text);
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

      {/* ── Veeva Vault Panel ─────────────────────────────────── */}
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
                {veevaDocs.filter((d) => d.status !== 'steady_state').length} update{veevaDocs.filter((d) => d.status !== 'steady_state').length !== 1 ? 's' : ''}
              </span>
            )}
            {veevaOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </div>
        </button>

        {veevaOpen && (
          <div className="border-t border-gray-100">
            {/* Sync All header */}
            {veevaDocs.some((d) => d.status !== 'steady_state') && (
              <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                <p className="text-xs text-amber-800">
                  Some documents have new versions available in Veeva Vault.
                </p>
                <button
                  onClick={handleVeevaSyncAll}
                  disabled={syncingAll}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-200/50 hover:bg-amber-200 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
                >
                  {syncingAll ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  {syncingAll ? 'Syncing...' : 'Sync All'}
                </button>
              </div>
            )}

            {veevaLoading ? (
              <div className="py-6 text-center text-gray-400 text-sm">Loading vault...</div>
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
