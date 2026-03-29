import { useState, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
  BarChart3,
  Filter,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { runGapAssessment, getICHGuidelines, type GapAssessmentResult } from '../api/client';

const STATUS_CONFIG = {
  pass: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'Pass' },
  fail: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Fail' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Warning' },
  not_applicable: { icon: MinusCircle, color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-200', label: 'N/A' },
};

function ScoreRing({ score }: { score: number }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}%</span>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Compliance</span>
      </div>
    </div>
  );
}

function ResultRow({ result }: { result: GapAssessmentResult }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[result.status];
  const StatusIcon = cfg.icon;

  return (
    <div className={`border rounded-lg overflow-hidden ${cfg.border}`}>
      <div
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-opacity-80 transition-colors ${cfg.bg}`}
      >
        <StatusIcon size={16} className={cfg.color} />

        <span className="font-mono text-xs text-gray-500 w-20 flex-shrink-0">{result.rule.rule_id_code}</span>

        <span className="text-sm text-gray-800 flex-1 line-clamp-1">{result.rule.rule_text}</span>

        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          result.rule.requirement_level === 'MUST' ? 'bg-red-50 text-red-600' :
          result.rule.requirement_level === 'SHOULD' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
        }`}>
          {result.rule.requirement_level}
        </span>

        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>

        <div className="w-4 flex-shrink-0">
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-3 bg-white border-t border-gray-100 space-y-2">
          <div className="text-xs text-gray-700 p-2 bg-gray-50 rounded">
            <strong>Assessment:</strong> {result.detail}
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <span className="font-medium text-gray-500">Guideline:</span>
              <span className="ml-1 text-gray-700">{result.guideline_code}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">CTD Sections:</span>
              <span className="ml-1 text-gray-700">{result.rule.ctd_sections.map((s) => `3.2.${s}`).join(', ')}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">Category:</span>
              <span className="ml-1 text-gray-700">{result.rule.category}</span>
            </div>
          </div>
          <div className="text-xs">
            <span className="font-medium text-gray-500">Evidence Expected:</span>
            <span className="ml-1 text-gray-700">{result.rule.evidence_expected}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function GuidelineSection({ guidelineCode, guidelineTitle, results }: { guidelineCode: string; guidelineTitle: string; results: GapAssessmentResult[] }) {
  const [expanded, setExpanded] = useState(true);
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const warn = results.filter((r) => r.status === 'warning').length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="w-5 flex-shrink-0">
          {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        </div>
        <div className="flex-1">
          <span className="font-bold text-sm text-gray-900">{guidelineCode}</span>
          <span className="text-xs text-gray-500 ml-2">{guidelineTitle}</span>
        </div>
        <div className="flex items-center gap-3">
          {pass > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full">
              <CheckCircle2 size={12} /> {pass}
            </span>
          )}
          {fail > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded-full">
              <XCircle size={12} /> {fail}
            </span>
          )}
          {warn > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
              <AlertTriangle size={12} /> {warn}
            </span>
          )}
        </div>
      </div>
      {expanded && (
        <div className="p-4 pt-0 space-y-2">
          {results.map((r) => (
            <ResultRow key={r.rule.id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ValidationReport() {
  const { current } = useProject();
  const [filterStatus, setFilterStatus] = useState<'all' | 'fail' | 'warning' | 'pass'>('all');
  const [runTimestamp, setRunTimestamp] = useState<string | null>(null);

  const assessment = useMemo(() => {
    if (!current) return null;
    const result = runGapAssessment(current.id);
    setRunTimestamp(new Date().toISOString());
    return result;
  }, [current]);

  if (!current) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
        <ShieldCheck className="mx-auto mb-3 text-gray-300" size={40} />
        <p className="text-gray-500 text-sm">Create a project first from the Dashboard.</p>
      </div>
    );
  }

  if (!assessment) return null;

  const { results, summary } = assessment;
  const guidelines = getICHGuidelines();

  // Filter
  const filteredResults = filterStatus === 'all' ? results : results.filter((r) => r.status === filterStatus);

  // Group by guideline
  const grouped = guidelines.map((g) => ({
    code: g.code,
    title: g.title,
    results: filteredResults.filter((r) => r.guideline_id === g.id),
  })).filter((g) => g.results.length > 0);

  const handleRerun = () => {
    // Force re-render
    window.location.reload();
  };

  const handleExport = () => {
    const lines = [
      `ICH Q Gap Assessment Report`,
      `Project: ${current.name}`,
      `Date: ${new Date().toLocaleDateString()}`,
      `Compliance Score: ${summary.score}%`,
      ``,
      `Summary: ${summary.pass} Pass | ${summary.fail} Fail | ${summary.warning} Warning | ${summary.not_applicable} N/A`,
      ``,
      `--- Detailed Results ---`,
      ``,
    ];

    for (const r of results) {
      lines.push(`[${r.status.toUpperCase()}] ${r.rule.rule_id_code} (${r.guideline_code})`);
      lines.push(`  Rule: ${r.rule.rule_text}`);
      lines.push(`  Detail: ${r.detail}`);
      lines.push(`  Severity: ${r.rule.severity} | Level: ${r.rule.requirement_level}`);
      lines.push(``);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${current.name.replace(/[^a-z0-9]/gi, '_')}_Gap_Assessment.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ICH Q Gap Assessment</h1>
          <p className="text-sm text-gray-500 mt-1">
            Compliance check for <span className="font-medium">{current.name}</span> against ICH Quality Guidelines
          </p>
          {runTimestamp && (
            <p className="text-[10px] text-gray-400 mt-1">
              Last run: {new Date(runTimestamp).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRerun}
            className="inline-flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} />
            Re-run
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 text-sm text-white bg-primary-600 px-3 py-2 rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Download size={14} />
            Export Report
          </button>
        </div>
      </div>

      {/* Score overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-8">
          <ScoreRing score={summary.score} />

          <div className="flex-1 grid grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-xl bg-green-50 border border-green-200">
              <CheckCircle2 size={20} className="text-green-600 mx-auto mb-1" />
              <div className="text-2xl font-bold text-green-700">{summary.pass}</div>
              <div className="text-[10px] text-green-600 uppercase tracking-wider font-medium">Passed</div>
            </div>
            <div className="text-center p-4 rounded-xl bg-red-50 border border-red-200">
              <XCircle size={20} className="text-red-600 mx-auto mb-1" />
              <div className="text-2xl font-bold text-red-700">{summary.fail}</div>
              <div className="text-[10px] text-red-600 uppercase tracking-wider font-medium">Failed</div>
            </div>
            <div className="text-center p-4 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle size={20} className="text-amber-600 mx-auto mb-1" />
              <div className="text-2xl font-bold text-amber-700">{summary.warning}</div>
              <div className="text-[10px] text-amber-600 uppercase tracking-wider font-medium">Warnings</div>
            </div>
            <div className="text-center p-4 rounded-xl bg-gray-50 border border-gray-200">
              <MinusCircle size={20} className="text-gray-400 mx-auto mb-1" />
              <div className="text-2xl font-bold text-gray-500">{summary.not_applicable}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">N/A</div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-6">
          <div className="flex items-center gap-1 h-3 rounded-full overflow-hidden bg-gray-100">
            {summary.pass > 0 && (
              <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${(summary.pass / summary.total) * 100}%` }} />
            )}
            {summary.fail > 0 && (
              <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${(summary.fail / summary.total) * 100}%` }} />
            )}
            {summary.warning > 0 && (
              <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${(summary.warning / summary.total) * 100}%` }} />
            )}
            {summary.not_applicable > 0 && (
              <div className="h-full bg-gray-300 transition-all duration-500" style={{ width: `${(summary.not_applicable / summary.total) * 100}%` }} />
            )}
          </div>
        </div>
      </div>

      {/* Critical failures banner */}
      {summary.fail > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <ShieldAlert size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-900 font-medium text-sm">
              {summary.fail} critical gap{summary.fail > 1 ? 's' : ''} detected
            </p>
            <p className="text-red-700 text-xs mt-0.5">
              These items must be addressed before CTD submission. Upload missing documents, define required data, or generate the relevant sections.
            </p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        <Filter size={14} className="text-gray-400" />
        {([
          { key: 'all', label: 'All', count: summary.total },
          { key: 'fail', label: 'Failures', count: summary.fail },
          { key: 'warning', label: 'Warnings', count: summary.warning },
          { key: 'pass', label: 'Passed', count: summary.pass },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterStatus === key
                ? key === 'fail' ? 'bg-red-100 text-red-700' :
                  key === 'warning' ? 'bg-amber-100 text-amber-700' :
                  key === 'pass' ? 'bg-green-100 text-green-700' :
                  'bg-gray-200 text-gray-800'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Results by guideline */}
      <div className="space-y-4">
        {grouped.map((g) => (
          <GuidelineSection key={g.code} guidelineCode={g.code} guidelineTitle={g.title} results={g.results} />
        ))}
        {grouped.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <BarChart3 className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-gray-500 text-sm">No results match the selected filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
