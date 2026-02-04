import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Play,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';

// Section-specific validation rules
const SECTION_VALIDATIONS: Record<string, {
  rules: Array<{
    id: string;
    name: string;
    description: string;
    severity: 'block' | 'warn' | 'info';
    status: 'pass' | 'fail' | 'warning';
    message?: string;
  }>;
}> = {
  s1: {
    rules: [
      { id: 'S1-001', name: 'INN Name Present', description: 'International Nonproprietary Name must be provided', severity: 'block', status: 'pass' },
      { id: 'S1-002', name: 'Chemical Name Complete', description: 'Full IUPAC chemical name required', severity: 'block', status: 'pass' },
      { id: 'S1-003', name: 'CAS Number Valid', description: 'CAS Registry Number must be valid format', severity: 'block', status: 'pass' },
      { id: 'S1-004', name: 'Molecular Formula', description: 'Molecular formula must match structure', severity: 'block', status: 'pass' },
      { id: 'S1-005', name: 'Structure Diagram', description: 'Chemical structure diagram should be included', severity: 'warn', status: 'warning', message: 'Structure diagram not detected in uploaded documents' },
      { id: 'S1-006', name: 'Physical Properties', description: 'Key physical properties should be documented', severity: 'info', status: 'pass' },
    ],
  },
  s2: {
    rules: [
      { id: 'S2-001', name: 'Manufacturer Identified', description: 'Manufacturing site must be specified', severity: 'block', status: 'pass' },
      { id: 'S2-002', name: 'Process Description', description: 'Complete manufacturing process required', severity: 'block', status: 'pass' },
      { id: 'S2-003', name: 'Process Flow Diagram', description: 'Process flow diagram must be included', severity: 'block', status: 'pass' },
      { id: 'S2-004', name: 'Starting Materials', description: 'All starting materials must be identified', severity: 'block', status: 'pass' },
      { id: 'S2-005', name: 'Critical Process Parameters', description: 'CPPs should be defined for critical steps', severity: 'warn', status: 'pass' },
      { id: 'S2-006', name: 'Process Validation', description: 'Process validation data required', severity: 'block', status: 'pass' },
      { id: 'S2-007', name: 'IPC Tests Defined', description: 'In-process controls should be specified', severity: 'warn', status: 'warning', message: 'Some IPC tests missing acceptance criteria' },
    ],
  },
  s3: {
    rules: [
      { id: 'S3-001', name: 'Structure Confirmation', description: 'Structure must be confirmed by multiple techniques', severity: 'block', status: 'pass' },
      { id: 'S3-002', name: 'NMR Spectra', description: 'NMR spectral data required', severity: 'block', status: 'pass' },
      { id: 'S3-003', name: 'Mass Spectrometry', description: 'MS data required for molecular weight confirmation', severity: 'block', status: 'pass' },
      { id: 'S3-004', name: 'Impurity Identification', description: 'All specified impurities must be identified', severity: 'block', status: 'pass' },
      { id: 'S3-005', name: 'Impurity Limits', description: 'Impurity limits must comply with ICH Q3A', severity: 'block', status: 'pass' },
      { id: 'S3-006', name: 'Stereochemistry', description: 'Stereochemistry should be defined', severity: 'warn', status: 'pass' },
      { id: 'S3-007', name: 'Polymorphism', description: 'Polymorphic form should be characterized', severity: 'warn', status: 'warning', message: 'Polymorphism study data incomplete' },
    ],
  },
  s4: {
    rules: [
      { id: 'S4-001', name: 'Specification Complete', description: 'All required tests must be included', severity: 'block', status: 'pass' },
      { id: 'S4-002', name: 'Appearance Test', description: 'Appearance test required', severity: 'block', status: 'pass' },
      { id: 'S4-003', name: 'Identity Tests', description: 'At least two identity tests required', severity: 'block', status: 'pass' },
      { id: 'S4-004', name: 'Assay Method', description: 'Validated assay method required', severity: 'block', status: 'pass' },
      { id: 'S4-005', name: 'Impurity Tests', description: 'Related substances test required', severity: 'block', status: 'pass' },
      { id: 'S4-006', name: 'Method Validation', description: 'All methods must be validated per ICH Q2', severity: 'block', status: 'pass' },
      { id: 'S4-007', name: 'Batch Analysis', description: 'Batch analysis data for representative batches', severity: 'warn', status: 'pass' },
      { id: 'S4-008', name: 'Acceptance Criteria', description: 'All tests must have justified acceptance criteria', severity: 'block', status: 'pass' },
    ],
  },
};

// Default validation for sections not specifically defined
const DEFAULT_VALIDATION = {
  rules: [
    { id: 'GEN-001', name: 'Required Documents', description: 'All required documents uploaded', severity: 'block' as const, status: 'pass' as const },
    { id: 'GEN-002', name: 'Data Extraction', description: 'Key data successfully extracted', severity: 'block' as const, status: 'pass' as const },
    { id: 'GEN-003', name: 'Completeness Check', description: 'Section data appears complete', severity: 'warn' as const, status: 'warning' as const, message: 'Some optional fields not populated' },
    { id: 'GEN-004', name: 'Consistency Check', description: 'Data is internally consistent', severity: 'warn' as const, status: 'pass' as const },
  ],
};

export default function PreviewValidation() {
  const location = useLocation();
  const sectionId = location.pathname.split('/')[2] || 's1';
  const validationData = SECTION_VALIDATIONS[sectionId] || DEFAULT_VALIDATION;

  const [hasRun, setHasRun] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  const runValidation = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      setHasRun(true);
    }, 1500);
  };

  const blockingFails = validationData.rules.filter(r => r.severity === 'block' && r.status === 'fail');
  const warnings = validationData.rules.filter(r => r.status === 'warning');
  const passed = validationData.rules.filter(r => r.status === 'pass');

  const overallStatus = blockingFails.length > 0 ? 'fail' : warnings.length > 0 ? 'warning' : 'pass';

  const getSeverityIcon = (severity: string, status: string) => {
    if (status === 'pass') {
      return <CheckCircle2 size={16} className="text-green-500" />;
    }
    switch (severity) {
      case 'block':
        return <ShieldX size={16} className="text-red-500" />;
      case 'warn':
        return <AlertTriangle size={16} className="text-amber-500" />;
      default:
        return <Info size={16} className="text-blue-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'block':
        return <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">BLOCK</span>;
      case 'warn':
        return <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">WARN</span>;
      default:
        return <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">INFO</span>;
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Validation Report</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pre-generation compliance checks
          </p>
        </div>
        <button
          onClick={runValidation}
          disabled={isRunning}
          className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          <Play size={16} />
          {isRunning ? 'Running...' : 'Run Validation'}
        </button>
      </div>

      {/* Demo Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-center gap-2">
        <AlertTriangle className="text-amber-500" size={16} />
        <p className="text-amber-700 text-sm">
          <strong>Preview Mode</strong> - This is a demonstration with mock data.
        </p>
      </div>

      {hasRun && (
        <>
          {/* Overall Status */}
          <div className={`p-4 rounded-lg border mb-6 ${
            overallStatus === 'pass' ? 'bg-green-50 border-green-200' :
            overallStatus === 'warning' ? 'bg-amber-50 border-amber-200' :
            'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-3">
              {overallStatus === 'pass' ? (
                <ShieldCheck size={24} className="text-green-600" />
              ) : overallStatus === 'warning' ? (
                <ShieldAlert size={24} className="text-amber-600" />
              ) : (
                <ShieldX size={24} className="text-red-600" />
              )}
              <div>
                <p className="font-semibold text-gray-900">
                  {overallStatus === 'pass' ? 'All checks passed' :
                   overallStatus === 'warning' ? `Passed with ${warnings.length} warning(s)` :
                   `${blockingFails.length} blocking failure(s) - cannot generate`}
                </p>
                <p className="text-sm text-gray-600">
                  {passed.length} passed, {warnings.length} warnings, {blockingFails.length} failures
                </p>
              </div>
            </div>
          </div>

          {/* Blocking Failures */}
          {blockingFails.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <ShieldX size={16} className="text-red-500" />
                Blocking Failures ({blockingFails.length})
              </h2>
              <div className="space-y-2">
                {blockingFails.map((rule) => (
                  <div key={rule.id} className="flex items-start gap-3 p-2 bg-red-50 rounded">
                    {getSeverityIcon(rule.severity, rule.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{rule.name}</span>
                        {getSeverityBadge(rule.severity)}
                      </div>
                      <p className="text-xs text-gray-600">{rule.description}</p>
                      {rule.message && <p className="text-xs text-red-600 mt-1">{rule.message}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" />
                Warnings ({warnings.length})
              </h2>
              <div className="space-y-2">
                {warnings.map((rule) => (
                  <div key={rule.id} className="flex items-start gap-3 p-2 bg-amber-50 rounded">
                    {getSeverityIcon(rule.severity, rule.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{rule.name}</span>
                        {getSeverityBadge(rule.severity)}
                      </div>
                      <p className="text-xs text-gray-600">{rule.description}</p>
                      {rule.message && <p className="text-xs text-amber-600 mt-1">{rule.message}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Passed */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-500" />
              Passed ({passed.length})
            </h2>
            <div className="space-y-2">
              {passed.map((rule) => (
                <div key={rule.id} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded">
                  {getSeverityIcon(rule.severity, rule.status)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{rule.name}</span>
                      {getSeverityBadge(rule.severity)}
                    </div>
                    <p className="text-xs text-gray-600">{rule.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
