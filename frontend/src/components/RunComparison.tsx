import { useMemo } from 'react';
import { X, Plus, Minus, ArrowRight } from 'lucide-react';
import type { GenerationRun } from '../types';
import { diffDocuments, summarizeDiff } from '../lib/htmlDiff';

interface RunComparisonProps {
  older: { run: GenerationRun; html: string };
  newer: { run: GenerationRun; html: string };
  onClose: () => void;
}

/** Full-screen redline comparison of two generation runs. */
export default function RunComparison({ older, newer, onClose }: RunComparisonProps) {
  const blocks = useMemo(() => diffDocuments(older.html, newer.html), [older.html, newer.html]);
  const summary = useMemo(() => summarizeDiff(blocks), [blocks]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Compare runs</h2>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
              <span className="font-mono">{older.run.run_id.slice(0, 8)}</span>
              <span className="text-gray-400">{new Date(older.run.created_at).toLocaleString()}</span>
              <ArrowRight size={11} className="text-gray-400" />
              <span className="font-mono">{newer.run.run_id.slice(0, 8)}</span>
              <span className="text-gray-400">{new Date(newer.run.created_at).toLocaleString()}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Summary bar */}
        <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-4 text-xs flex-shrink-0">
          <span className="inline-flex items-center gap-1 text-green-700">
            <Plus size={12} /> {summary.added} added
          </span>
          <span className="inline-flex items-center gap-1 text-red-700">
            <Minus size={12} /> {summary.removed} removed
          </span>
          <span className="text-gray-500">{summary.unchanged} unchanged</span>
          {summary.added === 0 && summary.removed === 0 && (
            <span className="text-gray-400 italic">Documents are identical at paragraph level.</span>
          )}
        </div>

        {/* Legend */}
        <div className="px-5 py-1.5 border-b border-gray-100 flex items-center gap-4 text-[10px] text-gray-400 flex-shrink-0">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300" /> Added in newer
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300" /> Removed from older
          </span>
        </div>

        {/* Diff body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 bg-gray-50">
          <div
            className="max-w-[210mm] mx-auto bg-white shadow-sm p-8 text-sm"
            style={{ fontFamily: "'Times New Roman', Times, serif", lineHeight: 1.6 }}
          >
            {blocks.map((b, i) => {
              if (b.type === 'unchanged') {
                return <div key={i} dangerouslySetInnerHTML={{ __html: b.html }} />;
              }
              const decoration: React.CSSProperties =
                b.type === 'added'
                  ? { backgroundColor: 'rgba(34,197,94,0.12)', borderLeft: '3px solid rgb(34,197,94)' }
                  : { backgroundColor: 'rgba(239,68,68,0.10)', borderLeft: '3px solid rgb(239,68,68)', opacity: 0.8 };
              return (
                <div
                  key={i}
                  style={{ ...decoration, padding: '4px 10px', margin: '3px 0', borderRadius: 2 }}
                >
                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: b.type === 'added' ? 'rgb(21,128,61)' : 'rgb(185,28,28)', display: 'block', marginBottom: 2 }}>
                    {b.type === 'added' ? '+ added' : '− removed'}
                  </span>
                  <div dangerouslySetInnerHTML={{ __html: b.html }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
