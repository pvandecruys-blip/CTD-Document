import { useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Upload,
  Wand2,
  ShieldCheck,
  BookOpen,
  ArrowLeft,
  FlaskConical,
  Pill,
  FileText,
  Factory,
  Microscope,
  ClipboardList,
  Beaker,
  Container,
  TestTube,
  Package,
} from 'lucide-react';

import { ProjectProvider, useProject } from './context/ProjectContext';
import Home from './pages/Home';
import ProjectDashboard from './pages/ProjectDashboard';
import Documents from './pages/Documents';
import GenerationWizard from './pages/GenerationWizard';
import ValidationReport from './pages/ValidationReport';
import RegulatoryLibrary from './pages/RegulatoryLibrary';
import PreviewDocuments from './pages/PreviewDocuments';
import PreviewGenerate from './pages/PreviewGenerate';
import PreviewValidation from './pages/PreviewValidation';

const STABILITY_NAV_ITEMS = [
  { to: 'documents', label: 'Documents', icon: Upload },
  { to: 'generate', label: 'Generate & Download', icon: Wand2 },
  { to: 'validation', label: 'Validation', icon: ShieldCheck },
  { to: 'regulatory', label: 'Regulatory Library', icon: BookOpen },
];

const PREVIEW_NAV_ITEMS = [
  { to: 'documents', label: 'Documents', icon: Upload },
  { to: 'generate', label: 'Generate & Download', icon: Wand2 },
  { to: 'validation', label: 'Validation', icon: ShieldCheck },
];

interface StabilityConfig {
  type: 'ds' | 'dp';
  sectionNumber: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  outputName: string;
}

const STABILITY_CONFIGS: Record<string, StabilityConfig> = {
  ds: {
    type: 'ds',
    sectionNumber: '3.2.S.7',
    title: 'Drug Substance Stability',
    subtitle: 'API stability data and retest period',
    icon: FlaskConical,
    color: 'text-blue-400',
    outputName: 'Retest Period',
  },
  dp: {
    type: 'dp',
    sectionNumber: '3.2.P.8',
    title: 'Drug Product Stability',
    subtitle: 'Finished product stability and shelf life',
    icon: Pill,
    color: 'text-green-400',
    outputName: 'Shelf Life',
  },
};

interface SectionConfig {
  id: string;
  sectionNumber: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
}

const SECTION_CONFIGS: Record<string, SectionConfig> = {
  s1: { id: 's1', sectionNumber: '3.2.S.1', title: 'General Information', subtitle: 'Nomenclature, structure, properties', icon: FileText, color: 'text-blue-400' },
  s2: { id: 's2', sectionNumber: '3.2.S.2', title: 'Manufacture', subtitle: 'Manufacturing process & controls', icon: Factory, color: 'text-blue-400' },
  s3: { id: 's3', sectionNumber: '3.2.S.3', title: 'Characterisation', subtitle: 'Structure & impurities', icon: Microscope, color: 'text-blue-400' },
  s4: { id: 's4', sectionNumber: '3.2.S.4', title: 'Control of Drug Substance', subtitle: 'Specifications & methods', icon: ClipboardList, color: 'text-blue-400' },
  s5: { id: 's5', sectionNumber: '3.2.S.5', title: 'Reference Standards', subtitle: 'Reference materials', icon: Beaker, color: 'text-blue-400' },
  s6: { id: 's6', sectionNumber: '3.2.S.6', title: 'Container Closure System', subtitle: 'Packaging specifications', icon: Container, color: 'text-blue-400' },
  p1: { id: 'p1', sectionNumber: '3.2.P.1', title: 'Description & Composition', subtitle: 'Dosage form & formulation', icon: Pill, color: 'text-green-400' },
  p2: { id: 'p2', sectionNumber: '3.2.P.2', title: 'Pharmaceutical Development', subtitle: 'Development studies', icon: FlaskConical, color: 'text-green-400' },
  p3: { id: 'p3', sectionNumber: '3.2.P.3', title: 'Manufacture', subtitle: 'Batch formula & process', icon: Factory, color: 'text-green-400' },
  p4: { id: 'p4', sectionNumber: '3.2.P.4', title: 'Control of Excipients', subtitle: 'Excipient specifications', icon: TestTube, color: 'text-green-400' },
  p5: { id: 'p5', sectionNumber: '3.2.P.5', title: 'Control of Drug Product', subtitle: 'Product specifications', icon: ClipboardList, color: 'text-green-400' },
  p6: { id: 'p6', sectionNumber: '3.2.P.6', title: 'Reference Standards', subtitle: 'Reference materials', icon: Beaker, color: 'text-green-400' },
  p7: { id: 'p7', sectionNumber: '3.2.P.7', title: 'Container Closure System', subtitle: 'Primary & secondary packaging', icon: Package, color: 'text-green-400' },
};

// Stability Shell - for fully functional S.7 and P.8 sections
function StabilityShell({ config, projectId }: { config: StabilityConfig; projectId: string }) {
  const navigate = useNavigate();
  const { selectById } = useProject();
  const Icon = config.icon;
  const basePath = `/project/${projectId}/stability/${config.type}`;

  // Sync project from URL
  useEffect(() => {
    selectById(projectId);
  }, [projectId, selectById]);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-gray-900 text-gray-300 flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-gray-700 gap-3">
          <Icon size={20} className={config.color} />
          <div>
            <span className="text-white font-semibold text-sm tracking-wide block">
              {config.sectionNumber}
            </span>
            <span className="text-gray-500 text-[10px]">{config.type === 'ds' ? 'Drug Substance' : 'Drug Product'}</span>
          </div>
        </div>

        {/* Back to Project */}
        <button
          onClick={() => navigate(`/project/${projectId}`)}
          className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400 hover:text-white hover:bg-gray-800 border-b border-gray-700 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Project
        </button>

        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
          {STABILITY_NAV_ITEMS.map(({ to, label, icon: NavIcon }) => (
            <NavLink
              key={to}
              to={`${basePath}/${to}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-700 text-white'
                    : 'hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <NavIcon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Section Info */}
        <div className="px-4 py-3 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-2">Output</div>
          <div className="text-xs text-gray-300">{config.outputName}</div>
        </div>

        <div className="px-4 py-3 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-2">Section Status</div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-xs text-green-400">Fully Functional</span>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-700 text-xs text-gray-500">
          v0.1.0
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <Routes>
          <Route path="/" element={<Navigate to={`${basePath}/documents`} replace />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/generate" element={<GenerationWizard />} />
          <Route path="/validation" element={<ValidationReport />} />
          <Route path="/regulatory" element={<RegulatoryLibrary />} />
        </Routes>
      </main>
    </div>
  );
}

function ProjectStabilityRouter() {
  const { projectId, type } = useParams<{ projectId: string; type: string }>();
  const config = STABILITY_CONFIGS[type || 'ds'];

  if (!config || !projectId) {
    return <Navigate to="/" replace />;
  }

  return <StabilityShell config={config} projectId={projectId} />;
}

// Section Shell - for preview sections
function SectionShell({ config, projectId }: { config: SectionConfig; projectId: string }) {
  const navigate = useNavigate();
  const { selectById } = useProject();
  const Icon = config.icon;
  const basePath = `/project/${projectId}/section/${config.id}`;
  const isDrugSubstance = config.id.startsWith('s');

  // Sync project from URL
  useEffect(() => {
    selectById(projectId);
  }, [projectId, selectById]);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-gray-900 text-gray-300 flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-gray-700 gap-3">
          <Icon size={20} className={config.color} />
          <div>
            <span className="text-white font-semibold text-sm tracking-wide block">
              {config.sectionNumber}
            </span>
            <span className="text-gray-500 text-[10px]">{isDrugSubstance ? 'Drug Substance' : 'Drug Product'}</span>
          </div>
        </div>

        {/* Back to Project */}
        <button
          onClick={() => navigate(`/project/${projectId}`)}
          className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400 hover:text-white hover:bg-gray-800 border-b border-gray-700 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Project
        </button>

        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
          {PREVIEW_NAV_ITEMS.map(({ to, label, icon: NavIcon }) => (
            <NavLink
              key={to}
              to={`${basePath}/${to}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-700 text-white'
                    : 'hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <NavIcon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Section Info */}
        <div className="px-4 py-3 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-2">Section Status</div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span className="text-xs text-amber-400">Preview Mode</span>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-700 text-xs text-gray-500">
          v0.1.0
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <Routes>
          <Route path="/" element={<Navigate to={`${basePath}/documents`} replace />} />
          <Route path="/documents" element={<PreviewDocuments />} />
          <Route path="/generate" element={<PreviewGenerate />} />
          <Route path="/validation" element={<PreviewValidation />} />
        </Routes>
      </main>
    </div>
  );
}

function ProjectSectionRouter() {
  const { projectId, sectionId } = useParams<{ projectId: string; sectionId: string }>();
  const config = SECTION_CONFIGS[sectionId || 's1'];

  if (!config || !projectId) {
    return <Navigate to="/" replace />;
  }

  return <SectionShell config={config} projectId={projectId} />;
}

export default function App() {
  return (
    <ProjectProvider>
      <Routes>
        {/* Home - Projects List */}
        <Route path="/" element={<Home />} />

        {/* Project Dashboard - shows all sections */}
        <Route path="/project/:projectId" element={<ProjectDashboard />} />

        {/* Preview sections within a project */}
        <Route path="/project/:projectId/section/:sectionId/*" element={<ProjectSectionRouter />} />

        {/* Stability sections within a project (fully functional) */}
        <Route path="/project/:projectId/stability/:type/*" element={<ProjectStabilityRouter />} />

        {/* Legacy routes - redirect to home */}
        <Route path="/stability/*" element={<Navigate to="/" replace />} />
        <Route path="/section/*" element={<Navigate to="/" replace />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/documents" element={<Navigate to="/" replace />} />
        <Route path="/extraction" element={<Navigate to="/" replace />} />
        <Route path="/generate" element={<Navigate to="/" replace />} />
        <Route path="/validation" element={<Navigate to="/" replace />} />
        <Route path="/regulatory" element={<Navigate to="/" replace />} />
      </Routes>
    </ProjectProvider>
  );
}
