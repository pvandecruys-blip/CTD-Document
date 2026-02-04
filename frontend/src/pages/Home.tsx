import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  FolderOpen,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Trash2,
  ChevronRight,
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  compound: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  sectionsComplete: number;
  totalSections: number;
  status: 'draft' | 'in_progress' | 'complete';
}

// Mock projects for demo
const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    name: 'Amlodipine Besylate 5mg Tablets',
    compound: 'Amlodipine Besylate',
    description: 'Generic amlodipine tablets for hypertension treatment',
    createdAt: '2024-01-15',
    updatedAt: '2024-02-01',
    sectionsComplete: 8,
    totalSections: 15,
    status: 'in_progress',
  },
  {
    id: 'proj-2',
    name: 'Metformin HCl 500mg Extended Release',
    compound: 'Metformin Hydrochloride',
    description: 'Extended release tablets for type 2 diabetes',
    createdAt: '2024-01-20',
    updatedAt: '2024-01-28',
    sectionsComplete: 3,
    totalSections: 15,
    status: 'draft',
  },
  {
    id: 'proj-3',
    name: 'Omeprazole 20mg Capsules',
    compound: 'Omeprazole',
    description: 'Delayed release capsules for GERD treatment',
    createdAt: '2023-12-01',
    updatedAt: '2024-01-10',
    sectionsComplete: 15,
    totalSections: 15,
    status: 'complete',
  },
];

const STATUS_CONFIG = {
  draft: {
    label: 'Draft',
    color: 'bg-gray-100 text-gray-700',
    icon: Clock,
  },
  in_progress: {
    label: 'In Progress',
    color: 'bg-blue-100 text-blue-700',
    icon: AlertTriangle,
  },
  complete: {
    label: 'Complete',
    color: 'bg-green-100 text-green-700',
    icon: CheckCircle2,
  },
};

function ProjectCard({ project, onClick, onDelete }: { project: Project; onClick: () => void; onDelete: () => void }) {
  const status = STATUS_CONFIG[project.status];
  const StatusIcon = status.icon;
  const progress = Math.round((project.sectionsComplete / project.totalSections) * 100);

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-primary-300 hover:shadow-lg transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-lg">
            <FolderOpen size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
              {project.name}
            </h3>
            <p className="text-xs text-gray-500">{project.compound}</p>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{project.description}</p>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500">Section Progress</span>
          <span className="font-medium text-gray-700">{project.sectionsComplete}/{project.totalSections}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${status.color}`}>
          <StatusIcon size={12} />
          {status.label}
        </span>
        <span className="text-xs text-gray-400">
          Updated {project.updatedAt}
        </span>
      </div>

      {/* Hover indicator */}
      <div className="flex items-center justify-end mt-3 pt-3 border-t border-gray-100">
        <span className="text-xs text-primary-600 font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          Open Project <ChevronRight size={14} />
        </span>
      </div>
    </div>
  );
}

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'sectionsComplete' | 'totalSections' | 'status'>) => void;
}

function NewProjectModal({ isOpen, onClose, onCreate }: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [compound, setCompound] = useState('');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && compound) {
      onCreate({ name, compound, description });
      setName('');
      setCompound('');
      setDescription('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Project</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Amlodipine Besylate 5mg Tablets"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Compound/API Name *</label>
            <input
              type="text"
              value={compound}
              onChange={(e) => setCompound(e.target.value)}
              placeholder="e.g., Amlodipine Besylate"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the product..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);
  const [showNewModal, setShowNewModal] = useState(false);

  const handleCreateProject = (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'sectionsComplete' | 'totalSections' | 'status'>) => {
    const newProject: Project = {
      ...data,
      id: `proj-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      sectionsComplete: 0,
      totalSections: 15,
      status: 'draft',
    };
    setProjects([newProject, ...projects]);
  };

  const handleDeleteProject = (id: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      setProjects(projects.filter((p) => p.id !== id));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-600 rounded-xl">
                <Shield className="text-white" size={28} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">CMC Document Generator</h1>
                <p className="text-gray-500">AI-powered CTD Module 3 authoring tool</p>
              </div>
            </div>
            <button
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
            >
              <Plus size={20} />
              New Project
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Info Banner */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Your CTD Projects</h2>
          <p className="text-gray-600 text-sm">
            Each project contains all sections of Module 3 Quality documentation (Drug Substance 3.2.S and Drug Product 3.2.P).
            Select a project to continue working on it, or create a new one to start fresh.
          </p>
          <div className="flex gap-6 mt-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-gray-400"></span>
              <span className="text-gray-600"><strong>Draft</strong> - Not started</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span>
              <span className="text-gray-600"><strong>In Progress</strong> - Work in progress</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              <span className="text-gray-600"><strong>Complete</strong> - All sections done</span>
            </div>
          </div>
        </div>

        {/* Projects Grid */}
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => navigate(`/project/${project.id}`)}
                onDelete={() => handleDeleteProject(project.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <FolderOpen size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
            <p className="text-gray-500 mb-6">Create your first CTD project to get started</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Plus size={18} />
              Create Project
            </button>
          </div>
        )}

        {/* Footer Info */}
        <div className="text-center text-xs text-gray-400 mt-12">
          <p>CTD Module 3 Quality Documentation Generator v0.1.0</p>
          <p className="mt-1">Compliant with ICH M4Q, EMA, and FDA requirements</p>
        </div>
      </main>

      <NewProjectModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={handleCreateProject}
      />
    </div>
  );
}
