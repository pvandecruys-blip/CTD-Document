import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Wand2,
  Download,
  Eye,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Loader2,
} from 'lucide-react';

// Section titles for generation
const SECTION_TITLES: Record<string, { number: string; title: string }> = {
  s1: { number: '3.2.S.1', title: 'General Information' },
  s2: { number: '3.2.S.2', title: 'Manufacture' },
  s3: { number: '3.2.S.3', title: 'Characterisation' },
  s4: { number: '3.2.S.4', title: 'Control of Drug Substance' },
  s5: { number: '3.2.S.5', title: 'Reference Standards or Materials' },
  s6: { number: '3.2.S.6', title: 'Container Closure System' },
  p1: { number: '3.2.P.1', title: 'Description and Composition' },
  p2: { number: '3.2.P.2', title: 'Pharmaceutical Development' },
  p3: { number: '3.2.P.3', title: 'Manufacture' },
  p4: { number: '3.2.P.4', title: 'Control of Excipients' },
  p5: { number: '3.2.P.5', title: 'Control of Drug Product' },
  p6: { number: '3.2.P.6', title: 'Reference Standards or Materials' },
  p7: { number: '3.2.P.7', title: 'Container Closure System' },
};

// Mock generation history
const MOCK_GENERATIONS = [
  {
    id: 'gen-001',
    createdAt: '2025-01-30 14:32',
    status: 'completed',
    tokens: { input: 45200, output: 12800 },
    version: 'v1.2',
  },
  {
    id: 'gen-002',
    createdAt: '2025-01-28 10:15',
    status: 'completed',
    tokens: { input: 42100, output: 11500 },
    version: 'v1.1',
  },
  {
    id: 'gen-003',
    createdAt: '2025-01-25 16:45',
    status: 'completed',
    tokens: { input: 38900, output: 10200 },
    version: 'v1.0',
  },
];

export default function PreviewGenerate() {
  const location = useLocation();
  const sectionId = location.pathname.split('/')[2] || 's1';
  const sectionInfo = SECTION_TITLES[sectionId] || SECTION_TITLES['s1'];

  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const startGeneration = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setShowPreview(true);
    }, 3000);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Generate & Download</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate {sectionInfo.number} {sectionInfo.title} documentation
          </p>
        </div>
        <button
          onClick={startGeneration}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Wand2 size={16} />
              Generate Document
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

      {/* Generation Options */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Generation Options</h2>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Output Format</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="rounded border-gray-300" />
                <span className="text-sm text-gray-600">Word Document (.docx)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="rounded border-gray-300" />
                <span className="text-sm text-gray-600">PDF Document</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded border-gray-300" />
                <span className="text-sm text-gray-600">HTML Preview</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Options</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="rounded border-gray-300" />
                <span className="text-sm text-gray-600">Include traceability references</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded border-gray-300" />
                <span className="text-sm text-gray-600">Include source document appendix</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="rounded border-gray-300" />
                <span className="text-sm text-gray-600">Apply regulatory template</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Panel */}
      {showPreview && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Generated Document Preview</h2>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 border border-gray-300 rounded-lg">
                <Eye size={16} />
                Full Preview
              </button>
              <button className="inline-flex items-center gap-1.5 text-sm text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-lg">
                <Download size={16} />
                Download
              </button>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-6 font-mono text-sm text-gray-700 border border-gray-200 max-h-[400px] overflow-y-auto whitespace-pre-wrap">
{`${sectionInfo.number} ${sectionInfo.title.toUpperCase()}

${sectionInfo.number}.1 Overview

This section provides comprehensive documentation for the ${sectionInfo.title.toLowerCase()}
in accordance with ICH M4Q guidelines and regional regulatory requirements.

The information presented herein has been compiled from validated source documents
and verified against applicable specifications and standards.

${sectionInfo.number}.2 Details

[Detailed content would be generated based on extracted data...]

• Key parameter 1: Value extracted from source documents
• Key parameter 2: Value extracted from source documents
• Key parameter 3: Value extracted from source documents

${sectionInfo.number}.3 Supporting Information

All data presented in this section is traceable to source documents as indicated
in the traceability matrix (Appendix A).

References:
- Source Document 1 (Page X, Section Y)
- Source Document 2 (Page X, Section Y)
- Source Document 3 (Page X, Section Y)

[End of Section ${sectionInfo.number}]`}
          </div>

          <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock size={14} />
              Generated just now
            </span>
            <span>•</span>
            <span>~45,200 input tokens</span>
            <span>•</span>
            <span>~12,800 output tokens</span>
          </div>
        </div>
      )}

      {/* Generation History */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Generation History</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Run ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tokens</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Version</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MOCK_GENERATIONS.map((gen) => (
              <tr key={gen.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-gray-400" />
                    <span className="text-sm font-mono text-gray-600">{gen.id}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{gen.createdAt}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={12} />
                    Completed
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {gen.tokens.input.toLocaleString()} / {gen.tokens.output.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{gen.version}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-sm text-primary-600 hover:text-primary-700">
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
