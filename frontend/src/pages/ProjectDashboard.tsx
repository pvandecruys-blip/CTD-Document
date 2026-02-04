import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import {
  ArrowLeft,
  Shield,
  FlaskConical,
  Pill,
  FileText,
  Factory,
  Microscope,
  ClipboardList,
  Beaker,
  Container,
  Thermometer,
  TestTube,
  Package,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';

interface CTDSection {
  id: string;
  number: string;
  title: string;
  description: string;
  icon: React.ElementType;
  status: 'not_started' | 'in_progress' | 'complete';
  documentsCount: number;
  isStability: boolean;
}

// Mock section statuses for demo (would come from project data in real app)
const getMockSectionStatus = (sectionId: string, projectId: string): { status: 'not_started' | 'in_progress' | 'complete'; documentsCount: number } => {
  // Simulate different progress based on project
  if (projectId === 'proj-1') {
    const completed = ['s1', 's2', 's3', 's7', 'p1', 'p2', 'p3', 'p8'];
    const inProgress = ['s4', 'p4'];
    if (completed.includes(sectionId)) return { status: 'complete', documentsCount: Math.floor(Math.random() * 5) + 3 };
    if (inProgress.includes(sectionId)) return { status: 'in_progress', documentsCount: Math.floor(Math.random() * 3) + 1 };
    return { status: 'not_started', documentsCount: 0 };
  }
  if (projectId === 'proj-2') {
    const completed = ['s1', 'p1'];
    const inProgress = ['s2'];
    if (completed.includes(sectionId)) return { status: 'complete', documentsCount: Math.floor(Math.random() * 5) + 3 };
    if (inProgress.includes(sectionId)) return { status: 'in_progress', documentsCount: Math.floor(Math.random() * 3) + 1 };
    return { status: 'not_started', documentsCount: 0 };
  }
  if (projectId === 'proj-3') {
    return { status: 'complete', documentsCount: Math.floor(Math.random() * 5) + 3 };
  }
  return { status: 'not_started', documentsCount: 0 };
};

const DRUG_SUBSTANCE_SECTIONS = (projectId: string): CTDSection[] => [
  { id: 's1', number: '3.2.S.1', title: 'General Information', description: 'Nomenclature, structure, and general properties', icon: FileText, isStability: false, ...getMockSectionStatus('s1', projectId) },
  { id: 's2', number: '3.2.S.2', title: 'Manufacture', description: 'Manufacturer, process, controls, and validation', icon: Factory, isStability: false, ...getMockSectionStatus('s2', projectId) },
  { id: 's3', number: '3.2.S.3', title: 'Characterisation', description: 'Structure elucidation and impurities', icon: Microscope, isStability: false, ...getMockSectionStatus('s3', projectId) },
  { id: 's4', number: '3.2.S.4', title: 'Control of Drug Substance', description: 'Specifications, analytical procedures, validation', icon: ClipboardList, isStability: false, ...getMockSectionStatus('s4', projectId) },
  { id: 's5', number: '3.2.S.5', title: 'Reference Standards', description: 'Reference standards and materials', icon: Beaker, isStability: false, ...getMockSectionStatus('s5', projectId) },
  { id: 's6', number: '3.2.S.6', title: 'Container Closure System', description: 'Container closure description and specifications', icon: Container, isStability: false, ...getMockSectionStatus('s6', projectId) },
  { id: 's7', number: '3.2.S.7', title: 'Stability', description: 'Stability summary, protocol, and data', icon: Thermometer, isStability: true, ...getMockSectionStatus('s7', projectId) },
];

const DRUG_PRODUCT_SECTIONS = (projectId: string): CTDSection[] => [
  { id: 'p1', number: '3.2.P.1', title: 'Description & Composition', description: 'Dosage form description and formulation', icon: Pill, isStability: false, ...getMockSectionStatus('p1', projectId) },
  { id: 'p2', number: '3.2.P.2', title: 'Pharmaceutical Development', description: 'Development studies and optimization', icon: FlaskConical, isStability: false, ...getMockSectionStatus('p2', projectId) },
  { id: 'p3', number: '3.2.P.3', title: 'Manufacture', description: 'Batch formula, process, and validation', icon: Factory, isStability: false, ...getMockSectionStatus('p3', projectId) },
  { id: 'p4', number: '3.2.P.4', title: 'Control of Excipients', description: 'Excipient specifications and suppliers', icon: TestTube, isStability: false, ...getMockSectionStatus('p4', projectId) },
  { id: 'p5', number: '3.2.P.5', title: 'Control of Drug Product', description: 'Specifications and analytical methods', icon: ClipboardList, isStability: false, ...getMockSectionStatus('p5', projectId) },
  { id: 'p6', number: '3.2.P.6', title: 'Reference Standards', description: 'Reference standards for drug product', icon: Beaker, isStability: false, ...getMockSectionStatus('p6', projectId) },
  { id: 'p7', number: '3.2.P.7', title: 'Container Closure System', description: 'Primary and secondary packaging', icon: Package, isStability: false, ...getMockSectionStatus('p7', projectId) },
  { id: 'p8', number: '3.2.P.8', title: 'Stability', description: 'Drug product stability data and shelf life', icon: Thermometer, isStability: true, ...getMockSectionStatus('p8', projectId) },
];

const STATUS_CONFIG = {
  not_started: {
    label: 'Not Started',
    color: 'bg-gray-100 text-gray-600',
    dotColor: 'bg-gray-400',
    cardBorder: 'border-gray-200 hover:border-gray-300',
  },
  in_progress: {
    label: 'In Progress',
    color: 'bg-blue-100 text-blue-700',
    dotColor: 'bg-blue-500',
    cardBorder: 'border-blue-200 hover:border-blue-300',
  },
  complete: {
    label: 'Complete',
    color: 'bg-green-100 text-green-700',
    dotColor: 'bg-green-500',
    cardBorder: 'border-green-200 hover:border-green-300',
  },
};

function SectionCard({ section, onClick }: { section: CTDSection; onClick: () => void }) {
  const status = STATUS_CONFIG[section.status];
  const Icon = section.icon;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border-2 p-4 cursor-pointer transition-all hover:shadow-md group ${status.cardBorder}`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${section.isStability ? 'bg-primary-100' : 'bg-gray-100'}`}>
          <Icon size={18} className={section.isStability ? 'text-primary-600' : 'text-gray-600'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-gray-500">{section.number}</span>
            {section.isStability && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 font-medium">
                Ready
              </span>
            )}
          </div>
          <h3 className="font-medium text-gray-900 text-sm group-hover:text-primary-600 transition-colors">
            {section.title}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{section.description}</p>
        </div>
        <ChevronRight size={16} className="text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" />
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full ${status.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`}></span>
          {status.label}
        </span>
        {section.documentsCount > 0 && (
          <span className="text-[10px] text-gray-500">
            {section.documentsCount} docs
          </span>
        )}
      </div>
    </div>
  );
}

export default function ProjectDashboard() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { current, selectById, loading } = useProject();

  // Sync project from URL
  useEffect(() => {
    if (projectId) {
      selectById(projectId);
    }
  }, [projectId, selectById]);

  // Show loading state
  if (loading || !current) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-gray-500">Loading project...</div>
      </div>
    );
  }

  const project = { name: current.name, compound: current.description || 'CTD Project' };

  const drugSubstanceSections = DRUG_SUBSTANCE_SECTIONS(projectId || '');
  const drugProductSections = DRUG_PRODUCT_SECTIONS(projectId || '');

  const allSections = [...drugSubstanceSections, ...drugProductSections];
  const completedCount = allSections.filter(s => s.status === 'complete').length;
  const inProgressCount = allSections.filter(s => s.status === 'in_progress').length;

  const handleSectionClick = (section: CTDSection) => {
    if (section.isStability) {
      // Route to fully functional stability section
      const type = section.id === 's7' ? 'ds' : 'dp';
      navigate(`/project/${projectId}/stability/${type}/dashboard`);
    } else {
      // Route to preview section (goes directly to documents)
      navigate(`/project/${projectId}/section/${section.id}/documents`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Projects
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-600 rounded-xl">
                <Shield className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                <p className="text-sm text-gray-500">{project.compound}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{completedCount}/{allSections.length}</div>
                <div className="text-xs text-gray-500">Sections Complete</div>
              </div>
              <div className="h-12 w-px bg-gray-200"></div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-500" />
                  <span className="text-sm text-gray-600">{completedCount} complete</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-blue-500" />
                  <span className="text-sm text-gray-600">{inProgressCount} in progress</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-600">{allSections.length - completedCount - inProgressCount} not started</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Demo Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-amber-800 font-medium text-sm">Preview Mode</p>
            <p className="text-amber-700 text-xs mt-0.5">
              Sections marked <span className="font-medium">Ready</span> (S.7 and P.8 Stability) are fully functional.
              Other sections show demo data to preview the workflow.
            </p>
          </div>
        </div>

        {/* Drug Substance Sections */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <FlaskConical className="text-blue-600" size={22} />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Drug Substance (3.2.S)</h2>
              <p className="text-xs text-gray-500">Active Pharmaceutical Ingredient documentation</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {drugSubstanceSections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                onClick={() => handleSectionClick(section)}
              />
            ))}
          </div>
        </div>

        {/* Drug Product Sections */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Pill className="text-green-600" size={22} />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Drug Product (3.2.P)</h2>
              <p className="text-xs text-gray-500">Finished dosage form documentation</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {drugProductSections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                onClick={() => handleSectionClick(section)}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
