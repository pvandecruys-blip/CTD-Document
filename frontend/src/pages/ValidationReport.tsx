import { ShieldCheck } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

export default function ValidationReport() {
  const { current } = useProject();

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Validation Report</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pre-generation checks for <span className="font-medium">{current.name}</span>
        </p>
      </div>

      <div className="text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
        <ShieldCheck className="mx-auto mb-3 text-gray-300" size={40} />
        <p className="text-gray-500 text-sm">Validation checks coming soon.</p>
        <p className="text-gray-400 text-xs mt-2">
          This feature will validate your project data before generation.
        </p>
      </div>
    </div>
  );
}
