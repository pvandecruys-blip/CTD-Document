import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  TableProperties,
  Wand2,
  ShieldCheck,
  BookOpen,
  ChevronDown,
} from 'lucide-react';

import { ProjectProvider, useProject } from './context/ProjectContext';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import ExtractionReview from './pages/ExtractionReview';
import GenerationWizard from './pages/GenerationWizard';
import ValidationReport from './pages/ValidationReport';
import RegulatoryLibrary from './pages/RegulatoryLibrary';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/documents', label: 'Documents', icon: Upload },
  { to: '/extraction', label: 'Extraction Review', icon: TableProperties },
  { to: '/generate', label: 'Generate & Download', icon: Wand2 },
  { to: '/validation', label: 'Validation', icon: ShieldCheck },
  { to: '/regulatory', label: 'Regulatory Library', icon: BookOpen },
];

function ProjectSelector() {
  const { current, list, select } = useProject();
  if (list.length === 0) return null;
  return (
    <div className="px-3 py-2 border-b border-gray-700">
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
        Active Project
      </label>
      <div className="relative">
        <select
          value={current?.id ?? ''}
          onChange={(e) => {
            const p = list.find((x) => x.id === e.target.value);
            if (p) select(p);
          }}
          className="w-full bg-gray-800 text-gray-200 text-sm rounded px-2 py-1.5 appearance-none pr-7 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
      </div>
    </div>
  );
}

function AppShell() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-gray-900 text-gray-300 flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-gray-700">
          <span className="text-white font-semibold text-sm tracking-wide">
            CTD Stability Generator
          </span>
        </div>
        <ProjectSelector />
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-700 text-white'
                    : 'hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-700 text-xs text-gray-500">
          v0.1.0
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/extraction" element={<ExtractionReview />} />
          <Route path="/generate" element={<GenerationWizard />} />
          <Route path="/validation" element={<ValidationReport />} />
          <Route path="/regulatory" element={<RegulatoryLibrary />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <AppShell />
    </ProjectProvider>
  );
}
