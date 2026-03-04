import { useEffect, useState, useRef } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Upload,
  Wand2,
  ShieldCheck,
  BookOpen,
  ArrowLeft,
  Bell,
  Download,
  X,
} from 'lucide-react';

import { ProjectProvider, useProject } from './context/ProjectContext';
import { findSection } from './config/ctdStructure';
import { veeva } from './api/client';
import type { VeevaNotification } from './types';
import Home from './pages/Home';
import ProjectDashboard from './pages/ProjectDashboard';
import Documents from './pages/Documents';
import GenerationWizard from './pages/GenerationWizard';
import ValidationReport from './pages/ValidationReport';
import RegulatoryLibrary from './pages/RegulatoryLibrary';
import PreviewDocuments from './pages/PreviewDocuments';
import PreviewGenerate from './pages/PreviewGenerate';
import PreviewValidation from './pages/PreviewValidation';

const NAV_ITEMS_FULL = [
  { to: 'documents', label: 'Documents', icon: Upload },
  { to: 'generate', label: 'Generate & Download', icon: Wand2 },
  { to: 'validation', label: 'Validation', icon: ShieldCheck },
  { to: 'regulatory', label: 'Regulatory Library', icon: BookOpen },
];

const NAV_ITEMS_PREVIEW = [
  { to: 'documents', label: 'Documents', icon: Upload },
  { to: 'generate', label: 'Generate & Download', icon: Wand2 },
  { to: 'validation', label: 'Validation', icon: ShieldCheck },
];

// Notification Bell component for sidebar
function NotificationBell({ projectId }: { projectId: string }) {
  const [notifications, setNotifications] = useState<VeevaNotification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    veeva.getNotifications(projectId).then((data) => setNotifications(data.items)).catch(() => {});
  }, [projectId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSync = async (notif: VeevaNotification) => {
    try {
      await veeva.sync(projectId, notif.veeva_doc_id);
      setNotifications((n) => n.filter((x) => x.id !== notif.id));
    } catch { /* */ }
  };

  const handleDismiss = async (notifId: string) => {
    await veeva.dismissNotification(projectId, notifId);
    setNotifications((n) => n.filter((x) => x.id !== notifId));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-md hover:bg-gray-700 transition-colors"
      >
        <Bell size={16} className="text-gray-400" />
        {notifications.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {notifications.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700">Veeva Vault Notifications</p>
          </div>
          {notifications.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-gray-400">
              All documents are up to date
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
              {notifications.map((n) => (
                <div key={n.id} className="px-3 py-2.5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{n.document_name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {n.document_number} — New version <span className="font-mono font-medium">v{n.new_version}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => handleDismiss(n.id)}
                      className="text-gray-300 hover:text-gray-500 flex-shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <button
                    onClick={() => handleSync(n)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-primary-600 hover:text-primary-800"
                  >
                    <Download size={10} />
                    Sync to project
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Unified CTD Section Shell - works for both generable and preview sections
function CTDSectionShell({ sectionId, projectId }: { sectionId: string; projectId: string }) {
  const navigate = useNavigate();
  const { selectById } = useProject();
  const section = findSection(sectionId);
  const basePath = `/project/${projectId}/ctd/${sectionId}`;
  const isGenerable = section?.isGenerable ?? false;
  const navItems = isGenerable ? NAV_ITEMS_FULL : NAV_ITEMS_PREVIEW;

  useEffect(() => {
    selectById(projectId);
  }, [projectId, selectById]);

  if (!section) return <Navigate to={`/project/${projectId}`} replace />;

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-gray-900 text-gray-300 flex flex-col">
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-700">
          <div>
            <span className="text-white font-semibold text-sm tracking-wide block">
              {section.number}
            </span>
            <span className="text-gray-500 text-[10px]">{section.title}</span>
          </div>
          <NotificationBell projectId={projectId} />
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
          {navItems.map(({ to, label, icon: NavIcon }) => (
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

        {/* Status */}
        <div className="px-4 py-3 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-2">Section Status</div>
          <div className="flex items-center gap-2">
            {isGenerable ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-xs text-green-400">AI Ready</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="text-xs text-amber-400">Preview Mode</span>
              </>
            )}
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
          {isGenerable ? (
            <>
              <Route path="/documents" element={<Documents />} />
              <Route path="/generate" element={<GenerationWizard sectionId={sectionId} sectionNumber={section.number} sectionTitle={section.title} />} />
              <Route path="/validation" element={<ValidationReport />} />
              <Route path="/regulatory" element={<RegulatoryLibrary />} />
            </>
          ) : (
            <>
              <Route path="/documents" element={<PreviewDocuments />} />
              <Route path="/generate" element={<PreviewGenerate />} />
              <Route path="/validation" element={<PreviewValidation />} />
            </>
          )}
        </Routes>
      </main>
    </div>
  );
}

function CTDSectionRouter() {
  const { projectId, sectionId } = useParams<{ projectId: string; sectionId: string }>();

  if (!projectId || !sectionId) {
    return <Navigate to="/" replace />;
  }

  return <CTDSectionShell sectionId={sectionId} projectId={projectId} />;
}

export default function App() {
  return (
    <ProjectProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project/:projectId" element={<ProjectDashboard />} />
        <Route path="/project/:projectId/ctd/:sectionId/*" element={<CTDSectionRouter />} />

        {/* Legacy routes */}
        <Route path="/project/:projectId/stability/*" element={<Navigate to="/" replace />} />
        <Route path="/project/:projectId/section/*" element={<Navigate to="/" replace />} />
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
