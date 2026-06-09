import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  ChevronDown,
  ChevronRight,
  Download,
  Sparkles,
  Loader2,
  Filter,
  ExternalLink,
  ArrowRight,
  Quote,
  Lightbulb,
  FileText,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { compliance, generation, type ComplianceReport, type ComplianceResult } from '../api/client';
import { ScoreRing, STATUS_CONFIG } from '../components/compliance/primitives';
import { resolveModality } from '../config/modalities';

const DOMAIN_LABELS: Record<string, string> = {
  process_validation: 'Process & Manufacturing Validation',
  stability: 'Stability Testing',
  general: 'Specifications, Impurities & Methods',
};

function RuleRow({ result, onGoToSection }: { result: ComplianceResult; onGoToSection: (sectionId: string) => void }) {
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
        <span className="font-mono text-xs text-gray-500 w-24 flex-shrink-0">{result.rule.rule_id_code}</span>
        <span className="text-sm text-gray-800 flex-1 line-clamp-1">{result.rule.rule_text}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
          result.rule.requirement_level === 'MUST' ? 'bg-red-50 text-red-600' :
          result.rule.requirement_level === 'SHOULD' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
        }`}>
          {result.rule.requirement_level}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
        <div className="w-4 flex-shrink-0">
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-3 bg-white border-t border-gray-100 space-y-3">
          {result.reasoning && (
            <div className="text-xs text-gray-700">
              <span className="font-medium text-gray-500">Assessment:</span> {result.reasoning}
            </div>
          )}

          {result.evidence_quote && (
            <div className="flex gap-2 text-xs bg-gray-50 border border-gray-100 rounded-md p-2.5">
              <Quote size={13} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Evidence from the document</div>
                <p className="text-gray-700 italic font-serif">"{result.evidence_quote}"</p>
              </div>
            </div>
          )}

          {result.suggestion && (result.status === 'fail' || result.status === 'warning') && (
            <div className="flex gap-2 text-xs bg-amber-50 border border-amber-100 rounded-md p-2.5">
              <Lightbulb size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-[10px] text-amber-600 uppercase tracking-wider mb-0.5">Suggested fix</div>
                <p className="text-amber-900">{result.suggestion}</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span><span className="font-medium text-gray-500">Guideline:</span> <span className="text-gray-700">{result.guideline_code}</span></span>
            <span><span className="font-medium text-gray-500">Section:</span> <span className="text-gray-700">{result.section_id ? `3.2.${result.section_id}` : '—'}</span></span>
            <span><span className="font-medium text-gray-500">CTD tags:</span> <span className="text-gray-700">{result.rule.ctd_sections.map((s) => `3.2.${s}`).join(', ')}</span></span>
            <span><span className="font-medium text-gray-500">Category:</span> <span className="text-gray-700">{result.rule.category}</span></span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            {result.reference_url && (
              <a
                href={result.reference_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-800"
              >
                <ExternalLink size={12} />
                View guideline
              </a>
            )}
            {result.section_id && (
              <button
                onClick={(e) => { e.stopPropagation(); onGoToSection(result.section_id); }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                <ArrowRight size={12} />
                Go to section
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GuidelineGroup({ code, title, results, onGoToSection }: { code: string; title: string; results: ComplianceResult[]; onGoToSection: (s: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const warn = results.filter((r) => r.status === 'warning').length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div onClick={() => setExpanded(!expanded)} className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors">
        <div className="w-5 flex-shrink-0">
          {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-bold text-sm text-gray-900">{code}</span>
          <span className="text-xs text-gray-500 ml-2">{title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {pass > 0 && <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full"><CheckCircle2 size={12} /> {pass}</span>}
          {fail > 0 && <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded-full"><XCircle size={12} /> {fail}</span>}
          {warn > 0 && <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full"><AlertTriangle size={12} /> {warn}</span>}
        </div>
      </div>
      {expanded && (
        <div className="p-4 pt-0 space-y-2">
          {results.map((r) => (
            <RuleRow key={`${r.section_id}-${r.rule.id}`} result={r} onGoToSection={onGoToSection} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ComplianceDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { current, selectById } = useProject();
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [running, setRunning] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'fail' | 'warning' | 'pass'>('all');
  const [hasGenerated, setHasGenerated] = useState<boolean | null>(null);

  useEffect(() => {
    if (projectId) selectById(projectId);
  }, [projectId, selectById]);

  // Load cached report + whether any section has been generated.
  useEffect(() => {
    if (!projectId) return;
    setReport(compliance.getCached(projectId));
    generation.list(projectId)
      .then((data) => setHasGenerated(data.items.some((r) => r.status === 'completed')))
      .catch(() => setHasGenerated(false));
  }, [projectId]);

  const handleRun = async () => {
    if (!projectId) return;
    setRunning(true);
    try {
      const result = await compliance.run(projectId);
      setReport(result);
    } finally {
      setRunning(false);
    }
  };

  const goToSection = (sectionId: string) => {
    navigate(`/project/${projectId}/ctd/${sectionId}/generate`);
  };

  const grouped = useMemo(() => {
    if (!report) return [];
    const filtered = filterStatus === 'all' ? report.results : report.results.filter((r) => r.status === filterStatus);
    // domain → guideline → results
    const byDomain = new Map<string, Map<string, { code: string; title: string; results: ComplianceResult[] }>>();
    for (const r of filtered) {
      if (!byDomain.has(r.domain)) byDomain.set(r.domain, new Map());
      const guidelines = byDomain.get(r.domain)!;
      if (!guidelines.has(r.guideline_id)) guidelines.set(r.guideline_id, { code: r.guideline_code, title: r.guideline_title, results: [] });
      guidelines.get(r.guideline_id)!.results.push(r);
    }
    const order = ['process_validation', 'stability', 'general'];
    return [...byDomain.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([domain, guidelines]) => ({ domain, guidelines: [...guidelines.values()] }));
  }, [report, filterStatus]);

  const handleExport = () => {
    if (!report || !current) return;
    const lines = [
      `Regulatory Compliance Report`,
      `Project: ${current.name}`,
      `Modality: ${resolveModality(report.modality).label} — ${resolveModality(report.modality).name}`,
      `Date: ${new Date(report.generated_at).toLocaleString()}`,
      `Method: ${report.ai_powered ? 'AI document review' : 'Rule-based estimate (AI unavailable)'}`,
      `Compliance Score: ${report.summary.score}%`,
      `Summary: ${report.summary.pass} Pass | ${report.summary.fail} Fail | ${report.summary.warning} Warning | ${report.summary.not_applicable} N/A`,
      ``,
      `--- Detailed Results ---`,
      ``,
    ];
    for (const r of report.results) {
      lines.push(`[${r.status.toUpperCase()}] ${r.rule.rule_id_code} (${r.guideline_code}) — section 3.2.${r.section_id}`);
      lines.push(`  Rule: ${r.rule.rule_text}`);
      if (r.reasoning) lines.push(`  Assessment: ${r.reasoning}`);
      if (r.evidence_quote) lines.push(`  Evidence: "${r.evidence_quote}"`);
      if (r.suggestion) lines.push(`  Suggested fix: ${r.suggestion}`);
      lines.push(``);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${current.name.replace(/[^a-z0-9]/gi, '_')}_Compliance_Report.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const modalityMeta = resolveModality(current?.modality);
  const summary = report?.summary;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <button
            onClick={() => navigate(`/project/${projectId}`)}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Project
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary-600 rounded-xl">
                <ShieldCheck className="text-white" size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900">Compliance Check</h1>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${modalityMeta.badgeClass}`} title={modalityMeta.description}>
                    {modalityMeta.label} · {modalityMeta.name}
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  {current?.name || 'Project'} — generated documents checked against applicable regulatory guidelines
                </p>
                {report && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Last run {new Date(report.generated_at).toLocaleString()} · {report.sections_checked.length} section{report.sections_checked.length !== 1 ? 's' : ''} checked
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {report && (
                <button onClick={handleExport} className="inline-flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <Download size={14} />
                  Export
                </button>
              )}
              <button
                onClick={handleRun}
                disabled={running || hasGenerated === false}
                className="inline-flex items-center gap-2 text-sm text-white bg-primary-600 px-4 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {running ? 'Checking…' : report ? 'Re-run check' : 'Run check'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* AI in progress */}
        {running && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <Loader2 className="mx-auto mb-3 text-primary-500 animate-spin" size={36} />
            <p className="text-gray-700 font-medium text-sm">Claude is reading your generated documents…</p>
            <p className="text-gray-400 text-xs mt-1">Judging each applicable rule against the actual content. This can take a moment.</p>
          </div>
        )}

        {/* Empty: nothing generated yet */}
        {!running && hasGenerated === false && (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <FileText className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-gray-600 font-medium text-sm">No generated sections yet</p>
            <p className="text-gray-400 text-xs mt-1 max-w-md mx-auto">
              Generate at least one CTD section, then run the compliance check to validate the produced document against the applicable guidelines.
            </p>
          </div>
        )}

        {/* Intro CTA before first run */}
        {!running && hasGenerated && !report && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <div className="inline-flex p-3 bg-primary-50 rounded-2xl mb-3">
              <Sparkles className="text-primary-600" size={28} />
            </div>
            <p className="text-gray-800 font-semibold">Run an AI compliance check</p>
            <p className="text-gray-500 text-sm mt-1 max-w-lg mx-auto">
              Claude reads your generated CTD documents and checks each applicable {modalityMeta.name} guideline,
              quoting the supporting passage or flagging what's missing.
            </p>
            <button
              onClick={handleRun}
              className="mt-5 inline-flex items-center gap-2 text-sm text-white bg-primary-600 px-5 py-2.5 rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Sparkles size={15} />
              Run check
            </button>
          </div>
        )}

        {/* Report */}
        {!running && report && summary && (
          <div className="space-y-6">
            {!report.ai_powered && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-xs text-amber-800">
                <AlertTriangle size={14} className="flex-shrink-0" />
                AI review was unavailable — showing a rule-based estimate from your project setup instead. Re-run to try the full document check again.
              </div>
            )}

            {/* Score overview */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
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
              <div className="mt-6 flex items-center gap-1 h-3 rounded-full overflow-hidden bg-gray-100">
                {summary.pass > 0 && <div className="h-full bg-green-500" style={{ width: `${(summary.pass / summary.total) * 100}%` }} />}
                {summary.fail > 0 && <div className="h-full bg-red-500" style={{ width: `${(summary.fail / summary.total) * 100}%` }} />}
                {summary.warning > 0 && <div className="h-full bg-amber-400" style={{ width: `${(summary.warning / summary.total) * 100}%` }} />}
                {summary.not_applicable > 0 && <div className="h-full bg-gray-300" style={{ width: `${(summary.not_applicable / summary.total) * 100}%` }} />}
              </div>
            </div>

            {/* Critical failures */}
            {summary.fail > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <ShieldAlert size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-900 font-medium text-sm">{summary.fail} critical gap{summary.fail > 1 ? 's' : ''} detected</p>
                  <p className="text-red-700 text-xs mt-0.5">These hard requirements are not met by the generated documents. Address them before CTD submission.</p>
                </div>
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex items-center gap-2">
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

            {/* Grouped results */}
            <div className="space-y-6">
              {grouped.map(({ domain, guidelines }) => (
                <div key={domain}>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">{DOMAIN_LABELS[domain] || domain}</h2>
                  <div className="space-y-3">
                    {guidelines.map((g) => (
                      <GuidelineGroup key={g.code} code={g.code} title={g.title} results={g.results} onGoToSection={goToSection} />
                    ))}
                  </div>
                </div>
              ))}
              {grouped.length === 0 && (
                <div className="text-center py-10 bg-white rounded-xl border border-gray-200 text-sm text-gray-500">
                  No results match the selected filter.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
