import { useEffect, useState, useCallback } from 'react';
import {
  FileText,
  Trash2,
  CheckCircle2,
  XCircle,
  FileUp,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import type { DocumentFile, DocumentClassification } from '../types';
import { useProject } from '../context/ProjectContext';
import { documents } from '../api/client';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const CLASSIFICATION_OPTIONS: { value: DocumentClassification; label: string }[] = [
  { value: 'stability_plan', label: 'Stability Plan' },
  { value: 'stability_report', label: 'Stability Report' },
  { value: 'coa', label: 'Certificate of Analysis' },
  { value: 'technical_report', label: 'Technical Report' },
  { value: 'other_supporting', label: 'Other Supporting' },
];

export default function Documents() {
  const { current, reload: reloadProjects } = useProject();
  const [docs, setDocs] = useState<DocumentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'pending' | 'uploading' | 'done' | 'error' }[]>([]);

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

          // Extract items with position data
          type TextItem = { str: string; transform: number[] };
          const items = content.items
            .filter((item): item is TextItem => 'str' in item && 'transform' in item)
            .map((item) => ({
              text: item.str,
              x: Math.round(item.transform[4]), // X position
              y: Math.round(item.transform[5]), // Y position
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
