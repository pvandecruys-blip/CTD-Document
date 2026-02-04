import { BookOpen } from 'lucide-react';

export default function RegulatoryLibrary() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Regulatory Library</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage guidelines and regulatory rules
        </p>
      </div>

      <div className="text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
        <BookOpen className="mx-auto mb-3 text-gray-300" size={40} />
        <p className="text-gray-500 text-sm">Regulatory library coming soon.</p>
        <p className="text-gray-400 text-xs mt-2">
          This feature will allow you to upload and manage regulatory guidelines.
        </p>
      </div>
    </div>
  );
}
