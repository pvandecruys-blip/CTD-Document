import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Play,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

// Section-specific extracted data
const SECTION_EXTRACTIONS: Record<string, {
  summary: { total: number; confirmed: number; pending: number };
  items: Array<{
    id: string;
    category: string;
    label: string;
    value: string;
    confidence: number;
    status: 'confirmed' | 'pending_review' | 'rejected';
    source: string;
  }>;
}> = {
  s1: {
    summary: { total: 8, confirmed: 7, pending: 1 },
    items: [
      { id: '1', category: 'Nomenclature', label: 'INN Name', value: 'Amlodipine', confidence: 0.98, status: 'confirmed', source: 'API_Specification_v3.2.pdf, p.1' },
      { id: '2', category: 'Nomenclature', label: 'Chemical Name (IUPAC)', value: '3-ethyl 5-methyl 2-[(2-aminoethoxy)methyl]-4-(2-chlorophenyl)-6-methyl-1,4-dihydropyridine-3,5-dicarboxylate', confidence: 0.95, status: 'confirmed', source: 'Structure_Elucidation_Report.pdf, p.3' },
      { id: '3', category: 'Nomenclature', label: 'CAS Registry Number', value: '88150-42-9', confidence: 0.99, status: 'confirmed', source: 'CAS_Registry_Confirmation.pdf, p.1' },
      { id: '4', category: 'Structure', label: 'Molecular Formula', value: 'C20H25ClN2O5', confidence: 0.99, status: 'confirmed', source: 'Structure_Elucidation_Report.pdf, p.5' },
      { id: '5', category: 'Structure', label: 'Molecular Weight', value: '408.88 g/mol', confidence: 0.99, status: 'confirmed', source: 'Structure_Elucidation_Report.pdf, p.5' },
      { id: '6', category: 'Properties', label: 'Physical Form', value: 'White to off-white crystalline powder', confidence: 0.96, status: 'confirmed', source: 'Physical_Properties_Data.xlsx' },
      { id: '7', category: 'Properties', label: 'Solubility (Water)', value: 'Slightly soluble', confidence: 0.92, status: 'confirmed', source: 'Physical_Properties_Data.xlsx' },
      { id: '8', category: 'Properties', label: 'Melting Point', value: '178-181°C', confidence: 0.88, status: 'pending_review', source: 'Physical_Properties_Data.xlsx' },
    ],
  },
  s2: {
    summary: { total: 12, confirmed: 10, pending: 2 },
    items: [
      { id: '1', category: 'Manufacturer', label: 'Company Name', value: 'PharmaChem GmbH', confidence: 0.98, status: 'confirmed', source: 'Manufacturing_Process_Description.pdf, p.1' },
      { id: '2', category: 'Manufacturer', label: 'Site Address', value: 'Industriestrasse 15, 4057 Basel, Switzerland', confidence: 0.97, status: 'confirmed', source: 'Manufacturing_Process_Description.pdf, p.1' },
      { id: '3', category: 'Process', label: 'Number of Steps', value: '6 synthetic steps', confidence: 0.95, status: 'confirmed', source: 'Process_Flow_Diagram.pdf' },
      { id: '4', category: 'Process', label: 'Batch Size', value: '100 kg', confidence: 0.96, status: 'confirmed', source: 'Batch_Records_Validation.pdf, p.2' },
      { id: '5', category: 'Process', label: 'Starting Material 1', value: 'Compound A (CAS: 12345-67-8)', confidence: 0.91, status: 'confirmed', source: 'Manufacturing_Process_Description.pdf, p.4' },
      { id: '6', category: 'Process', label: 'Critical Step', value: 'Step 3 - Ring formation', confidence: 0.89, status: 'pending_review', source: 'Critical_Process_Parameters.xlsx' },
      { id: '7', category: 'Controls', label: 'IPC Test - Step 3', value: 'HPLC purity ≥95%', confidence: 0.94, status: 'confirmed', source: 'IPC_Testing_Results.pdf' },
      { id: '8', category: 'Controls', label: 'IPC Test - Step 5', value: 'pH 6.8-7.2', confidence: 0.93, status: 'confirmed', source: 'IPC_Testing_Results.pdf' },
      { id: '9', category: 'Validation', label: 'Batches Validated', value: '3 consecutive batches', confidence: 0.97, status: 'confirmed', source: 'Process_Validation_Protocol.pdf, p.8' },
      { id: '10', category: 'Validation', label: 'Validation Date', value: 'October 2024', confidence: 0.95, status: 'confirmed', source: 'Process_Validation_Protocol.pdf, p.1' },
      { id: '11', category: 'Validation', label: 'Yield Range', value: '82-88%', confidence: 0.90, status: 'confirmed', source: 'Batch_Records_Validation.pdf, p.15' },
      { id: '12', category: 'Validation', label: 'CPP - Temperature Step 3', value: '20-25°C', confidence: 0.85, status: 'pending_review', source: 'Critical_Process_Parameters.xlsx' },
    ],
  },
  s3: {
    summary: { total: 10, confirmed: 9, pending: 1 },
    items: [
      { id: '1', category: 'Structure', label: 'Confirmed By', value: 'NMR, MS, IR, UV, Elemental Analysis', confidence: 0.98, status: 'confirmed', source: 'Structure_Elucidation_Package.pdf, p.2' },
      { id: '2', category: 'Structure', label: 'Stereochemistry', value: 'Racemic mixture (R,S)', confidence: 0.96, status: 'confirmed', source: 'NMR_Spectra_Complete.pdf, p.12' },
      { id: '3', category: 'Structure', label: 'Polymorphic Form', value: 'Form I (stable)', confidence: 0.94, status: 'confirmed', source: 'Structure_Elucidation_Package.pdf, p.18' },
      { id: '4', category: 'Impurities', label: 'Impurity A', value: 'Desamino derivative, ≤0.15%', confidence: 0.95, status: 'confirmed', source: 'Impurity_Profile_Report.pdf, p.5' },
      { id: '5', category: 'Impurities', label: 'Impurity B', value: 'Ethyl ester, ≤0.10%', confidence: 0.94, status: 'confirmed', source: 'Impurity_Profile_Report.pdf, p.6' },
      { id: '6', category: 'Impurities', label: 'Impurity C', value: 'Oxidative degradant, ≤0.20%', confidence: 0.93, status: 'confirmed', source: 'Impurity_Profile_Report.pdf, p.7' },
      { id: '7', category: 'Impurities', label: 'Unspecified Limit', value: 'NMT 0.10%', confidence: 0.97, status: 'confirmed', source: 'Impurity_Profile_Report.pdf, p.3' },
      { id: '8', category: 'Impurities', label: 'Total Impurities', value: 'NMT 1.0%', confidence: 0.98, status: 'confirmed', source: 'Impurity_Profile_Report.pdf, p.3' },
      { id: '9', category: 'Characterization', label: 'Elemental Analysis', value: 'C: 58.7%, H: 6.2%, N: 6.9%', confidence: 0.96, status: 'confirmed', source: 'Structure_Elucidation_Package.pdf, p.22' },
      { id: '10', category: 'Characterization', label: 'Optical Rotation', value: 'Not applicable (racemic)', confidence: 0.88, status: 'pending_review', source: 'Structure_Elucidation_Package.pdf, p.15' },
    ],
  },
  s4: {
    summary: { total: 14, confirmed: 13, pending: 1 },
    items: [
      { id: '1', category: 'Specification', label: 'Appearance', value: 'White to off-white crystalline powder', confidence: 0.99, status: 'confirmed', source: 'Drug_Substance_Specification.pdf, p.1' },
      { id: '2', category: 'Specification', label: 'Identification (IR)', value: 'Conforms to reference', confidence: 0.98, status: 'confirmed', source: 'Drug_Substance_Specification.pdf, p.1' },
      { id: '3', category: 'Specification', label: 'Assay', value: '98.0% - 102.0%', confidence: 0.99, status: 'confirmed', source: 'Drug_Substance_Specification.pdf, p.1' },
      { id: '4', category: 'Specification', label: 'Related Substances Total', value: 'NMT 1.0%', confidence: 0.98, status: 'confirmed', source: 'Drug_Substance_Specification.pdf, p.1' },
      { id: '5', category: 'Specification', label: 'Water Content', value: 'NMT 0.5%', confidence: 0.97, status: 'confirmed', source: 'Drug_Substance_Specification.pdf, p.2' },
      { id: '6', category: 'Specification', label: 'Residual Solvents', value: 'Meets ICH Q3C', confidence: 0.96, status: 'confirmed', source: 'Drug_Substance_Specification.pdf, p.2' },
      { id: '7', category: 'Methods', label: 'Assay Method', value: 'HPLC, USP <621>', confidence: 0.97, status: 'confirmed', source: 'Analytical_Methods_Package.pdf, p.5' },
      { id: '8', category: 'Methods', label: 'RS Method', value: 'HPLC, gradient elution', confidence: 0.96, status: 'confirmed', source: 'Analytical_Methods_Package.pdf, p.12' },
      { id: '9', category: 'Methods', label: 'Water Method', value: 'Karl Fischer, USP <921>', confidence: 0.98, status: 'confirmed', source: 'Analytical_Methods_Package.pdf, p.25' },
      { id: '10', category: 'Validation', label: 'Assay Validated', value: 'Yes, ICH Q2(R1)', confidence: 0.95, status: 'confirmed', source: 'Method_Validation_Report.pdf, p.1' },
      { id: '11', category: 'Validation', label: 'RS Method Validated', value: 'Yes, ICH Q2(R1)', confidence: 0.95, status: 'confirmed', source: 'Method_Validation_Report.pdf, p.1' },
      { id: '12', category: 'Batch Data', label: 'Batches Tested', value: '10 production batches', confidence: 0.94, status: 'confirmed', source: 'Batch_Analysis_Data.xlsx' },
      { id: '13', category: 'Batch Data', label: 'Assay Range', value: '99.2% - 100.8%', confidence: 0.93, status: 'confirmed', source: 'Batch_Analysis_Data.xlsx' },
      { id: '14', category: 'Batch Data', label: 'RS Range', value: '0.08% - 0.42%', confidence: 0.89, status: 'pending_review', source: 'Batch_Analysis_Data.xlsx' },
    ],
  },
};

// Default extraction data for sections not specifically defined
const DEFAULT_EXTRACTION = {
  summary: { total: 6, confirmed: 5, pending: 1 },
  items: [
    { id: '1', category: 'General', label: 'Parameter 1', value: 'Extracted value 1', confidence: 0.95, status: 'confirmed' as const, source: 'Source_Document.pdf' },
    { id: '2', category: 'General', label: 'Parameter 2', value: 'Extracted value 2', confidence: 0.92, status: 'confirmed' as const, source: 'Source_Document.pdf' },
    { id: '3', category: 'General', label: 'Parameter 3', value: 'Extracted value 3', confidence: 0.88, status: 'pending_review' as const, source: 'Source_Document.pdf' },
  ],
};

export default function PreviewExtraction() {
  const location = useLocation();
  const sectionId = location.pathname.split('/')[2] || 's1';
  const extractionData = SECTION_EXTRACTIONS[sectionId] || DEFAULT_EXTRACTION;

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Group items by category
  const categories = extractionData.items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof extractionData.items>);

  const runExtraction = () => {
    setIsRunning(true);
    setTimeout(() => setIsRunning(false), 2000);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle2 size={14} className="text-green-500" />;
      case 'pending_review':
        return <AlertTriangle size={14} className="text-amber-500" />;
      default:
        return <AlertTriangle size={14} className="text-red-500" />;
    }
  };

  const confidenceBar = (value: number) => {
    const pct = Math.round(value * 100);
    const color = pct >= 90 ? 'bg-green-500' : pct >= 80 ? 'bg-amber-400' : 'bg-red-400';
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-gray-500">{pct}%</span>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Extraction Review</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review AI-extracted data from your documents
          </p>
        </div>
        <button
          onClick={runExtraction}
          disabled={isRunning}
          className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <Sparkles size={16} className="animate-pulse" />
              Running...
            </>
          ) : (
            <>
              <Play size={16} />
              Run Extraction
            </>
          )}
        </button>
      </div>

      {/* Demo Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-center gap-2">
        <AlertTriangle className="text-amber-500" size={16} />
        <p className="text-amber-700 text-sm">
          <strong>Preview Mode</strong> - This is a demonstration with mock data.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{extractionData.summary.total}</div>
          <div className="text-sm text-gray-500">Total Items Extracted</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-green-600">{extractionData.summary.confirmed}</div>
          <div className="text-sm text-gray-500">Confirmed</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-amber-600">{extractionData.summary.pending}</div>
          <div className="text-sm text-gray-500">Pending Review</div>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-4">
        {Object.entries(categories).map(([category, items]) => (
          <div key={category} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                {expandedCategory === category ? (
                  <ChevronDown size={16} className="text-gray-400" />
                ) : (
                  <ChevronRight size={16} className="text-gray-400" />
                )}
                <span className="font-medium text-gray-900">{category}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {items.length} items
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-600">
                  {items.filter(i => i.status === 'confirmed').length} confirmed
                </span>
                {items.some(i => i.status === 'pending_review') && (
                  <span className="text-xs text-amber-600">
                    {items.filter(i => i.status === 'pending_review').length} pending
                  </span>
                )}
              </div>
            </button>

            {expandedCategory === category && (
              <div className="border-t border-gray-200">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Field</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Value</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Confidence</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-600">{item.label}</td>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{item.value}</td>
                        <td className="px-4 py-2">{confidenceBar(item.confidence)}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            {getStatusIcon(item.status)}
                            <span className="text-xs capitalize">{item.status.replace('_', ' ')}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">{item.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
