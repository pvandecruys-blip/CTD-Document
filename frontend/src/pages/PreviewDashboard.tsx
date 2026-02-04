import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';

// Mock projects per section type
const SECTION_PROJECTS: Record<string, Array<{
  id: string;
  name: string;
  description: string;
  status: string;
  documentCount: number;
  lastUpdated: string;
}>> = {
  s1: [
    { id: 'p1', name: 'Amlodipine Besylate API', description: 'General information and nomenclature package', status: 'active', documentCount: 5, lastUpdated: '2025-01-28' },
    { id: 'p2', name: 'Lisinopril Dihydrate', description: 'Structure and properties documentation', status: 'draft', documentCount: 3, lastUpdated: '2025-01-25' },
  ],
  s2: [
    { id: 'p1', name: 'Amlodipine Manufacturing', description: 'Complete manufacturing dossier for API', status: 'active', documentCount: 12, lastUpdated: '2025-01-30' },
    { id: 'p2', name: 'Metformin HCl Process', description: 'Process description and validation', status: 'active', documentCount: 8, lastUpdated: '2025-01-27' },
  ],
  s3: [
    { id: 'p1', name: 'Amlodipine Characterisation', description: 'Structure elucidation and impurity profiling', status: 'active', documentCount: 7, lastUpdated: '2025-01-29' },
  ],
  s4: [
    { id: 'p1', name: 'Amlodipine DS Control', description: 'Specifications and analytical methods', status: 'active', documentCount: 9, lastUpdated: '2025-01-28' },
    { id: 'p2', name: 'Lisinopril DS Specs', description: 'Release and shelf-life specifications', status: 'draft', documentCount: 4, lastUpdated: '2025-01-20' },
  ],
  s5: [
    { id: 'p1', name: 'API Reference Standards', description: 'Primary and working standards for DS testing', status: 'active', documentCount: 4, lastUpdated: '2025-01-26' },
  ],
  s6: [
    { id: 'p1', name: 'DS Container Closure', description: 'Packaging system for drug substance', status: 'active', documentCount: 3, lastUpdated: '2025-01-24' },
  ],
  p1: [
    { id: 'p1', name: 'Amlodipine 5mg Tablets', description: 'Tablet description and composition', status: 'active', documentCount: 4, lastUpdated: '2025-01-29' },
    { id: 'p2', name: 'Amlodipine 10mg Tablets', description: 'Higher strength formulation', status: 'active', documentCount: 4, lastUpdated: '2025-01-28' },
  ],
  p2: [
    { id: 'p1', name: 'Amlodipine Tablet Development', description: 'QbD-based pharmaceutical development', status: 'active', documentCount: 15, lastUpdated: '2025-01-30' },
  ],
  p3: [
    { id: 'p1', name: 'Tablet Manufacturing Process', description: 'Batch formula and process description', status: 'active', documentCount: 10, lastUpdated: '2025-01-29' },
  ],
  p4: [
    { id: 'p1', name: 'Excipient Control Package', description: 'All excipient specifications and vendors', status: 'active', documentCount: 8, lastUpdated: '2025-01-27' },
  ],
  p5: [
    { id: 'p1', name: 'Finished Product Control', description: 'Release and stability specifications', status: 'active', documentCount: 6, lastUpdated: '2025-01-28' },
  ],
  p6: [
    { id: 'p1', name: 'DP Reference Standards', description: 'Reference standards for product testing', status: 'active', documentCount: 4, lastUpdated: '2025-01-25' },
  ],
  p7: [
    { id: 'p1', name: 'Blister Pack System', description: 'Primary and secondary packaging', status: 'active', documentCount: 5, lastUpdated: '2025-01-26' },
    { id: 'p2', name: 'HDPE Bottle System', description: 'Alternative container closure', status: 'draft', documentCount: 3, lastUpdated: '2025-01-22' },
  ],
};

export default function PreviewDashboard() {
  const location = useLocation();
  const sectionId = location.pathname.split('/')[2] || 's1';
  const projects = SECTION_PROJECTS[sectionId] || SECTION_PROJECTS['s1'];

  const [selectedProject, setSelectedProject] = useState(projects[0]?.id);

  const getStatusBadge = (status: string) => {
    if (status === 'active') {
      return (
        <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
          <CheckCircle2 size={12} /> Active
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
        <AlertTriangle size={12} /> Draft
      </span>
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your projects and track progress
          </p>
        </div>
        <button className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700">
          <Plus size={16} />
          New Project
        </button>
      </div>

      {/* Demo Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-center gap-2">
        <AlertTriangle className="text-amber-500" size={16} />
        <p className="text-amber-700 text-sm">
          <strong>Preview Mode</strong> - This is a demonstration with mock data.
        </p>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() => setSelectedProject(project.id)}
            className={`bg-white rounded-lg border-2 p-4 cursor-pointer transition-all hover:shadow-md ${
              selectedProject === project.id
                ? 'border-primary-500 shadow-md'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <FolderOpen size={20} className="text-gray-600" />
              </div>
              {getStatusBadge(project.status)}
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">{project.name}</h3>
            <p className="text-xs text-gray-500 mb-3">{project.description}</p>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <FileText size={12} />
                {project.documentCount} documents
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {project.lastUpdated}
              </span>
            </div>
          </div>
        ))}

        {/* Add Project Card */}
        <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-4 flex flex-col items-center justify-center min-h-[160px] cursor-pointer hover:border-gray-400 hover:bg-gray-100 transition-colors">
          <Plus size={24} className="text-gray-400 mb-2" />
          <span className="text-sm text-gray-500">Create New Project</span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{projects.length}</div>
          <div className="text-sm text-gray-500">Total Projects</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-green-600">
            {projects.filter(p => p.status === 'active').length}
          </div>
          <div className="text-sm text-gray-500">Active</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-amber-600">
            {projects.filter(p => p.status === 'draft').length}
          </div>
          <div className="text-sm text-gray-500">Drafts</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">
            {projects.reduce((acc, p) => acc + p.documentCount, 0)}
          </div>
          <div className="text-sm text-gray-500">Total Documents</div>
        </div>
      </div>
    </div>
  );
}
