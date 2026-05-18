import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  FileText,
  CheckCircle2,
  XCircle,
  FileUp,
  RefreshCw,
  Library,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { DocumentFile } from '../types';
import { useProject } from '../context/ProjectContext';
import { documents } from '../api/client';
import { extractTextFromFile, collectDroppedFiles } from '../lib/fileText';
import { findSection } from '../config/ctdStructure';

export default function SectionSources() {
  const { current, reload: reloadProjects } = useProject();
  const { sectionId } = useParams<{ sectionId: string }>();
  const section = sectionId ? findSection(sectionId) : undefined;

  const [allDocs, setAllDocs] = useState<DocumentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'pending' | 'uploading' | 'done' | 'error' }[]>([]);

  const pid = current?.id;

  const load = useCallback(async () => {
    if (!pid) { setAllDocs([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await documents.list(pid);
      setAllDocs(data.items);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  const sectionDocs = useMemo(
    () => allDocs.filter((d) => d.section_tags?.includes(sectionId || '')),
    [allDocs, sectionId],
  );
  const otherDocs = useMemo(
    () => allDocs.filter((d) => !d.section_tags?.includes(sectionId || '')),
    [allDocs, sectionId],
  );

  const uploadFiles = async (files: FileList | File[]) => {
    if (!pid || !sectionId) return;
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    setUploadQueue(fileArr.map((f) => ({ name: f.name, status: 'pending' })));
    setUploading(true);

    for (let i = 0; i < fileArr.length; i++) {
      setUploadQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: 'uploading' } : item)));
      try {
        const text = await extractTextFromFile(fileArr[i]);
        // Auto-tag with the current section.
        await documents.upload(pid, fileArr[i].name, text, { section_tags: [sectionId] });
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

  const handleAddToSection = async (docId: string) => {
    if (!pid || !sectionId) return;
    await documents.addTag(pid, docId, sectionId);
    await load();
  };

  const handleRemoveFromSection = async (docId: string) => {
    if (!pid || !sectionId) return;
    await documents.removeTag(pid, docId, sectionId);
    await load();
  };

  if (!current || !section) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
          <FileText className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-500 text-sm">Loading section…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sources</h1>
          <p className="text-sm text-gray-500 mt-1">
            Documents that feed generation for <span className="font-mono font-medium">{section.number}</span>{' '}
            <span className="text-gray-700">{section.title}</span>.
          </p>
        </div>
        <Link
          to={`/project/${current.id}/library`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md transition-colors flex-shrink-0"
        >
          <Library size={12} />
          Open full library
        </Link>
      </div>

      {/* Drop zone — auto-tags with current section */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`relative rounded-xl border-2 border-dashed transition-all mb-6 ${
          dragOver ? 'border-primary-400 bg-primary-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
      >
        <label className="flex flex-col items-center justify-center py-10 cursor-pointer">
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.xls,.doc"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                uploadFiles(e.target.files);
                e.target.value = '';
              }
            }}
            className="hidden"
          />
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 transition-colors ${dragOver ? 'bg-primary-100' : 'bg-gray-100'}`}>
            <FileUp size={24} className={dragOver ? 'text-primary-600' : 'text-gray-400'} />
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">Drop files for this section</p>
          <p className="text-xs text-gray-400">Uploads are auto-tagged with <span className="font-mono">{section.number}</span></p>
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

      {/* Sources for this section */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          Sources for this section
          <span className="ml-2 text-xs font-normal text-gray-400">({sectionDocs.length})</span>
        </h2>
        {loading ? (
          <div className="text-center py-6 text-gray-400 text-sm">Loading…</div>
        ) : sectionDocs.length === 0 ? (
          <div className="text-center py-6 bg-white rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
            No documents tagged for this section yet. Upload above, or pick from the library below.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">File</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Classification</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Size</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sectionDocs.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 group">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="text-gray-900 text-sm">{d.original_filename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-gray-500">{d.classification.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {d.file_size_bytes > 1024 * 1024
                        ? `${(d.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`
                        : `${(d.file_size_bytes / 1024).toFixed(0)} KB`}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleRemoveFromSection(d.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-600 px-2 py-1 rounded transition-colors"
                        title="Remove from this section (document stays in library)"
                      >
                        <Minus size={11} />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pick from library */}
      <div>
        <button
          onClick={() => setLibraryOpen(!libraryOpen)}
          className="w-full flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Library size={14} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Add from library</span>
            <span className="text-xs text-gray-400">({otherDocs.length} available)</span>
          </div>
          {libraryOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>

        {libraryOpen && (
          <div className="mt-2 bg-white rounded-lg border border-gray-200 overflow-hidden">
            {otherDocs.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">
                No other documents in the project library yet.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">File</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Classification</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Other Tags</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {otherDocs.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50 group">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-gray-400 flex-shrink-0" />
                          <span className="text-gray-700 text-sm">{d.original_filename}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-gray-500">{d.classification.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {!d.section_tags || d.section_tags.length === 0 ? (
                          <span className="text-[10px] text-gray-300 italic">Untagged</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {d.section_tags.map((t) => (
                              <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                {findSection(t)?.number || t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleAddToSection(d.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-800 bg-primary-50 hover:bg-primary-100 px-2 py-1 rounded transition-colors"
                        >
                          <Plus size={11} />
                          Add to section
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
