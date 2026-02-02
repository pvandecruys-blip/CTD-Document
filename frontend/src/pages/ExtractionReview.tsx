import { useEffect, useState } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  TableProperties,
} from 'lucide-react';
import type { Study, Lot, StorageCondition, QualityAttribute, ExtractionStatus } from '../types';
import { useProject } from '../context/ProjectContext';
import { extraction, studies, lots, conditions, attributes } from '../api/client';

type Tab = 'studies' | 'lots' | 'conditions' | 'attributes';

const STATUS_ICONS: Record<ExtractionStatus, React.ReactNode> = {
  pending_review: <AlertTriangle size={14} className="text-amber-500" />,
  confirmed: <CheckCircle2 size={14} className="text-green-500" />,
  rejected: <XCircle size={14} className="text-red-500" />,
  manually_added: <CheckCircle2 size={14} className="text-blue-500" />,
};

export default function ExtractionReview() {
  const { current } = useProject();
  const [tab, setTab] = useState<Tab>('studies');
  const [studyList, setStudyList] = useState<Study[]>([]);
  const [lotList, setLotList] = useState<Lot[]>([]);
  const [conditionList, setConditionList] = useState<StorageCondition[]>([]);
  const [attrList, setAttrList] = useState<QualityAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedStudy, setExpandedStudy] = useState<string | null>(null);

  const pid = current?.id;

  const load = async () => {
    if (!pid) { setLoading(false); return; }
    setLoading(true);
    try {
      const [s, c, a] = await Promise.all([
        studies.list(pid),
        conditions.list(pid, '_all'),
        attributes.list(pid, '_all'),
      ]);
      setStudyList(s.items);
      setConditionList(c.items);
      setAttrList(a.items);
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [pid]);

  const loadLots = async (studyId: string) => {
    if (!pid) return;
    if (expandedStudy === studyId) {
      setExpandedStudy(null);
      return;
    }
    setExpandedStudy(studyId);
    try {
      const data = await lots.list(pid, studyId);
      setLotList(data.items);
    } catch {
      setLotList([]);
    }
  };

  const startExtraction = async () => {
    if (!pid) return;
    setRunning(true);
    try {
      await extraction.start(pid);
      await load();
    } finally {
      setRunning(false);
    }
  };

  const confidenceBar = (value?: number) => {
    if (value == null) return null;
    const pct = Math.round(value * 100);
    const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-gray-500">{pct}%</span>
      </div>
    );
  };

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'studies', label: 'Studies', count: studyList.length },
    { key: 'lots', label: 'Lots', count: lotList.length },
    { key: 'conditions', label: 'Storage Conditions', count: conditionList.length },
    { key: 'attributes', label: 'Quality Attributes', count: attrList.length },
  ];

  if (!current) {
    return (
      <div className="p-6 max-w-6xl mx-auto text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
        <TableProperties className="mx-auto mb-3 text-gray-300" size={40} />
        <p className="text-gray-500 text-sm">Create a project first from the Dashboard.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Extraction Review</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review AI-extracted stability data for <span className="font-medium">{current.name}</span>
          </p>
        </div>
        <button
          onClick={startExtraction}
          disabled={running}
          className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          <Play size={16} />
          {running ? 'Running...' : 'Run Extraction'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <>
          {tab === 'studies' && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {studyList.length === 0 ? (
                <p className="p-6 text-center text-gray-400 text-sm">
                  No studies extracted yet. Upload documents and run extraction.
                </p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-500 w-8"></th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Study</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Protocol</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {studyList.map((s) => (
                      <Fragment key={s.id}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => loadLots(s.id)}
                        >
                          <td className="px-4 py-3">
                            {expandedStudy === s.id ? (
                              <ChevronDown size={14} className="text-gray-400" />
                            ) : (
                              <ChevronRight size={14} className="text-gray-400" />
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {s.study_label || s.id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3 text-gray-600 capitalize">{s.study_type.replace('_', ' ')}</td>
                          <td className="px-4 py-3 text-gray-500">{s.protocol_id ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1">
                              {STATUS_ICONS[s.extraction_status]}
                              <span className="text-xs">{s.extraction_status.replace('_', ' ')}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3">{confidenceBar(s.confidence)}</td>
                        </tr>
                        {expandedStudy === s.id && (
                          <tr>
                            <td colSpan={6} className="bg-gray-50 px-8 py-3">
                              {lotList.length === 0 ? (
                                <p className="text-sm text-gray-400">No lots found for this study.</p>
                              ) : (
                                <table className="min-w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <th className="pr-4 py-1 text-left font-medium">Lot #</th>
                                      <th className="pr-4 py-1 text-left font-medium">Manufacturer</th>
                                      <th className="pr-4 py-1 text-left font-medium">Use</th>
                                      <th className="pr-4 py-1 text-left font-medium">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lotList.map((l) => (
                                      <tr key={l.id}>
                                        <td className="pr-4 py-1 text-gray-900">{l.lot_number}</td>
                                        <td className="pr-4 py-1 text-gray-600">{l.manufacturer ?? '—'}</td>
                                        <td className="pr-4 py-1 text-gray-600">{l.lot_use_label ?? '—'}</td>
                                        <td className="pr-4 py-1">
                                          <span className="inline-flex items-center gap-1">
                                            {STATUS_ICONS[l.extraction_status]}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'conditions' && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {conditionList.length === 0 ? (
                <p className="p-6 text-center text-gray-400 text-sm">No conditions extracted.</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Label</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Temperature</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Humidity</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {conditionList.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{c.label}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {c.temperature_setpoint != null ? `${c.temperature_setpoint}°C` : '—'}
                          {c.tolerance ? ` ${c.tolerance}` : ''}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{c.humidity ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1">
                            {STATUS_ICONS[c.extraction_status]}
                            <span className="text-xs">{c.extraction_status.replace('_', ' ')}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">{confidenceBar(c.confidence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'attributes' && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {attrList.length === 0 ? (
                <p className="p-6 text-center text-gray-400 text-sm">No attributes extracted.</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Attribute</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Method Group</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Procedure</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Criteria</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {attrList.map((a) => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                        <td className="px-4 py-3 text-gray-600">{a.method_group ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{a.analytical_procedure ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {a.acceptance_criteria.map((c) => c.criteria_text).join('; ') || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1">
                            {STATUS_ICONS[a.extraction_status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">{confidenceBar(a.confidence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'lots' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-400 text-sm">
              Select a study in the Studies tab to view its lots.
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { Fragment } from 'react';
