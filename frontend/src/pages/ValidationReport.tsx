import { useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, CheckCircle2, Play } from 'lucide-react';
import type { ValidationReport as VReport, ValidationCheck } from '../types';
import { useProject } from '../context/ProjectContext';
import { validation } from '../api/client';

export default function ValidationReport() {
  const { current } = useProject();
  const [report, setReport] = useState<VReport | null>(null);
  const [loading, setLoading] = useState(false);

  const runValidation = async () => {
    if (!current) return;
    setLoading(true);
    try {
      const data = await validation.run(current.id);
      setReport(data);
    } catch { /* */ } finally {
      setLoading(false);
    }
  };

  const severityBadge = (check: ValidationCheck) => {
    if (check.status === 'fail') {
      return check.severity === 'hard' ? (
        <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
          <ShieldX size={12} /> BLOCK
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
          <AlertTriangle size={12} /> WARN
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
        <CheckCircle2 size={12} /> PASS
      </span>
    );
  };

  const renderChecks = (checks: ValidationCheck[], emptyMsg: string) =>
    checks.length === 0 ? (
      <p className="text-sm text-gray-400 py-3">{emptyMsg}</p>
    ) : (
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs">
            <th className="pr-4 py-2 text-left font-medium">Rule</th>
            <th className="pr-4 py-2 text-left font-medium">Name</th>
            <th className="pr-4 py-2 text-left font-medium">Severity</th>
            <th className="pr-4 py-2 text-left font-medium">Message</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {checks.map((c) => (
            <tr key={c.rule_id} className="hover:bg-gray-50">
              <td className="pr-4 py-2 font-mono text-xs text-gray-600">{c.rule_id}</td>
              <td className="pr-4 py-2 text-gray-900">{c.rule_name}</td>
              <td className="pr-4 py-2">{severityBadge(c)}</td>
              <td className="pr-4 py-2 text-gray-500">{c.message ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );

  if (!current) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
        <ShieldCheck className="mx-auto mb-3 text-gray-300" size={40} />
        <p className="text-gray-500 text-sm">Create a project first from the Dashboard.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Validation Report</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pre-generation checks for <span className="font-medium">{current.name}</span>
          </p>
        </div>
        <button onClick={runValidation} disabled={loading} className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
          <Play size={16} /> {loading ? 'Running...' : 'Run Validation'}
        </button>
      </div>

      {!report ? (
        <div className="text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
          <ShieldCheck className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-500 text-sm">Click "Run Validation" to check project readiness.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className={`p-4 rounded-lg border ${report.overall_status === 'pass' ? 'bg-green-50 border-green-200' : report.hard_failures.length > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center gap-2">
              {report.hard_failures.length > 0 ? <ShieldAlert className="text-red-600" size={20} /> : report.warnings.length > 0 ? <AlertTriangle className="text-amber-600" size={20} /> : <ShieldCheck className="text-green-600" size={20} />}
              <span className="font-semibold text-sm">
                {report.hard_failures.length > 0 ? `${report.hard_failures.length} blocking failure(s) — cannot generate` : report.warnings.length > 0 ? `Passed with ${report.warnings.length} warning(s)` : 'All checks passed'}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ShieldX size={16} className="text-red-500" /> Blocking Failures ({report.hard_failures.length})
            </h2>
            {renderChecks(report.hard_failures, 'No blocking failures.')}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" /> Warnings ({report.warnings.length})
            </h2>
            {renderChecks(report.warnings, 'No warnings.')}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-500" /> Passed ({report.passed.length})
            </h2>
            {renderChecks(report.passed, 'No checks have passed yet.')}
          </div>
        </div>
      )}
    </div>
  );
}
