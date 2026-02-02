import { useEffect, useState } from 'react';
import {
  BookOpen,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import type {
  RegulatoryGuideline,
  RegulatoryRule,
  RequirementLevel,
  AllocationStatus,
} from '../types';
import { regulatory } from '../api/client';

type View = 'guidelines' | 'rules';

const REQ_COLORS: Record<RequirementLevel, string> = {
  MUST: 'bg-red-100 text-red-700',
  SHOULD: 'bg-amber-100 text-amber-700',
  MAY: 'bg-blue-100 text-blue-600',
};

const STATUS_ICONS: Record<AllocationStatus, React.ReactNode> = {
  pending_review: <AlertTriangle size={14} className="text-amber-500" />,
  confirmed: <CheckCircle2 size={14} className="text-green-500" />,
  rejected: <XCircle size={14} className="text-red-500" />,
  overridden: <CheckCircle2 size={14} className="text-purple-500" />,
};

export default function RegulatoryLibrary() {
  const [view, setView] = useState<View>('guidelines');
  const [guidelines, setGuidelines] = useState<RegulatoryGuideline[]>([]);
  const [rules, setRules] = useState<RegulatoryRule[]>([]);
  const [selectedGuideline, setSelectedGuideline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [agency, setAgency] = useState('EMA');
  const [docId, setDocId] = useState('');
  const [version, setVersion] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadGuidelines = async () => {
    setLoading(true);
    try {
      const data = await regulatory.guidelines.list();
      setGuidelines(data.items);
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async (guidelineId: string) => {
    setSelectedGuideline(guidelineId);
    setView('rules');
    setLoading(true);
    try {
      const data = await regulatory.guidelines.rules(guidelineId);
      setRules(data.items);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGuidelines(); }, []);

  const handleUpload = async () => {
    if (!file || !title.trim()) return;
    setUploading(true);
    try {
      await regulatory.guidelines.upload(file, title, agency, docId || undefined, version || undefined);
      setShowUpload(false);
      setFile(null);
      setTitle('');
      await loadGuidelines();
    } finally {
      setUploading(false);
    }
  };

  const handleAllocate = async (guidelineId: string) => {
    await regulatory.guidelines.allocate(guidelineId);
    // In a real app: poll for completion, then reload
    await loadRules(guidelineId);
  };

  const handleRuleStatus = async (ruleId: string, newStatus: string) => {
    if (!selectedGuideline) return;
    const justification =
      newStatus === 'overridden' ? prompt('Override justification:') : undefined;
    if (newStatus === 'overridden' && !justification) return;
    await regulatory.guidelines.updateRuleStatus(
      selectedGuideline,
      ruleId,
      newStatus,
      justification ?? undefined,
    );
    await loadRules(selectedGuideline);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this guideline?')) return;
    await regulatory.guidelines.delete(id);
    await loadGuidelines();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Regulatory Library</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage guidelines, extract rules, and review allocations
          </p>
        </div>
        <div className="flex gap-2">
          {view === 'rules' && (
            <button
              onClick={() => { setView('guidelines'); setSelectedGuideline(null); }}
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
            >
              Back to Guidelines
            </button>
          )}
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700"
          >
            <Upload size={16} />
            Upload Guideline
          </button>
        </div>
      </div>

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Upload Regulatory Guideline</h2>

            <label className="block text-sm font-medium text-gray-700 mb-1">PDF File</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-500 mb-3 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />

            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              placeholder="e.g. EMA/CHMP/QWP/545525/2017"
            />

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agency</label>
                <select
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                >
                  <option value="EMA">EMA</option>
                  <option value="FDA">FDA</option>
                  <option value="ICH">ICH</option>
                  <option value="PMDA">PMDA</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Doc ID</label>
                <input
                  value={docId}
                  onChange={(e) => setDocId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !file || !title.trim()}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : view === 'guidelines' ? (
        /* Guidelines list */
        guidelines.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
            <BookOpen className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-gray-500 text-sm">No guidelines uploaded yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Title</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Agency</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Version</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Packs</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {guidelines.map((g) => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{g.title}</td>
                    <td className="px-4 py-3 text-gray-600">{g.agency}</td>
                    <td className="px-4 py-3 text-gray-500">{g.version ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{g.allocation_pack_count}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          g.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {g.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => handleAllocate(g.id)}
                          className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                        >
                          Allocate
                        </button>
                        <button
                          onClick={() => loadRules(g.id)}
                          className="text-xs text-gray-600 hover:text-gray-800 font-medium"
                        >
                          Rules
                        </button>
                        <button
                          onClick={() => handleDelete(g.id)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Rules view */
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {rules.length === 0 ? (
            <p className="p-6 text-center text-gray-400 text-sm">
              No rules extracted. Run allocation first.
            </p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Rule ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Level</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Applies To</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Rule Text</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.rule_id_code}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${REQ_COLORS[r.requirement_level]}`}>
                        {r.requirement_level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.applies_to.join(', ')}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-md truncate">{r.rule_text}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs">
                        {STATUS_ICONS[r.status]}
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {r.status === 'pending_review' && (
                          <>
                            <button
                              onClick={() => handleRuleStatus(r.id, 'confirmed')}
                              className="text-xs text-green-600 hover:text-green-800 font-medium"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleRuleStatus(r.id, 'rejected')}
                              className="text-xs text-red-600 hover:text-red-800 font-medium"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleRuleStatus(r.id, 'overridden')}
                          className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                        >
                          Override
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
