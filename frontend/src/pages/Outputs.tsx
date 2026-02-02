import { useEffect, useState } from 'react';
import { FileOutput, Download, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { GenerationRun, GenerationStatus } from '../types';
import { useProject } from '../context/ProjectContext';
import { generation } from '../api/client';

const STATUS_DISPLAY: Record<GenerationStatus, { icon: React.ReactNode; color: string }> = {
  pending: { icon: <Clock size={14} className="text-gray-400" />, color: 'bg-gray-100 text-gray-600' },
  running: { icon: <Loader2 size={14} className="text-blue-500 animate-spin" />, color: 'bg-blue-100 text-blue-700' },
  completed: { icon: <CheckCircle2 size={14} className="text-green-500" />, color: 'bg-green-100 text-green-700' },
  failed: { icon: <XCircle size={14} className="text-red-500" />, color: 'bg-red-100 text-red-700' },
};

export default function Outputs() {
  const { current } = useProject();
  const [runs, setRuns] = useState<GenerationRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!current) { setRuns([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await generation.list(current.id);
      setRuns(data.items);
    } catch { /* */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [current?.id]);

  if (!current) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
        <FileOutput className="mx-auto mb-3 text-gray-300" size={40} />
        <p className="text-gray-500 text-sm">Create a project first from the Dashboard.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Outputs & Traceability</h1>
        <p className="text-sm text-gray-500 mt-1">
          Downloads for <span className="font-medium">{current.name}</span>
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
          <FileOutput className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-500 text-sm">No generation runs yet. Use the Generate page to create documents.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {runs.map((run) => {
            const s = STATUS_DISPLAY[run.status];
            return (
              <div key={run.run_id} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-gray-700">{run.run_id.slice(0, 8)}</span>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${s.color}`}>
                        {s.icon} {run.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      Created: {new Date(run.created_at).toLocaleString()}
                      {run.completed_at && <> | Completed: {new Date(run.completed_at).toLocaleString()}</>}
                    </p>
                  </div>
                </div>
                {run.outputs && run.status === 'completed' && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {run.outputs.pdf && (
                      <a href={run.outputs.pdf} className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-800 border border-primary-200 rounded-md px-3 py-1.5 hover:bg-primary-50">
                        <Download size={14} /> Download PDF
                      </a>
                    )}
                    {run.outputs.traceability_json && (
                      <a href={run.outputs.traceability_json} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50">
                        <Download size={14} /> Traceability JSON
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
