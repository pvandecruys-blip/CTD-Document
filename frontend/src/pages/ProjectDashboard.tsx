import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import {
  ArrowLeft,
  Shield,
  FlaskConical,
  Pill,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { CTD_STRUCTURE, getLeafSections, getGenerableSections, type CTDSection } from '../config/ctdStructure';
import { generation } from '../api/client';
import type { GenerationRun } from '../types';

function SectionRow({ section, depth, projectId, completedSections }: { section: CTDSection; depth: number; projectId: string; completedSections: Set<string> }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = section.children && section.children.length > 0;
  const isLeaf = !hasChildren;
  const isCompleted = completedSections.has(section.id);

  const handleClick = () => {
    if (section.isGenerable) {
      navigate(`/project/${projectId}/ctd/${section.id}/documents`);
    } else if (hasChildren) {
      setExpanded(!expanded);
    }
  };

  return (
    <>
      <div
        onClick={handleClick}
        className={`flex items-center gap-2 py-2.5 px-3 rounded-lg transition-all cursor-pointer group ${
          section.isGenerable
            ? 'hover:bg-primary-50 hover:border-primary-200'
            : hasChildren
            ? 'hover:bg-gray-50'
            : 'opacity-60 cursor-default'
        }`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        {/* Expand/collapse icon */}
        <div className="w-5 flex-shrink-0">
          {hasChildren ? (
            expanded ? (
              <ChevronDown size={14} className="text-gray-400" />
            ) : (
              <ChevronRight size={14} className="text-gray-400" />
            )
          ) : null}
        </div>

        {/* Section number */}
        <span className="font-mono text-xs text-gray-500 w-20 flex-shrink-0">{section.number}</span>

        {/* Title */}
        <span className={`text-sm flex-1 ${section.isGenerable ? 'text-gray-900 font-medium group-hover:text-primary-700' : 'text-gray-700'}`}>
          {section.title}
        </span>

        {/* Status badge */}
        {section.isGenerable && isCompleted ? (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
            <CheckCircle2 size={10} />
            Generated
          </span>
        ) : section.isGenerable ? (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
            <Sparkles size={10} />
            AI Ready
          </span>
        ) : isLeaf ? (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            <Lock size={10} />
            Coming Soon
          </span>
        ) : null}

        {/* Arrow for generable sections */}
        {section.isGenerable && (
          <ChevronRight size={14} className="text-gray-400 group-hover:text-primary-500" />
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && section.children!.map((child) => (
        <SectionRow key={child.id} section={child} depth={depth + 1} projectId={projectId} completedSections={completedSections} />
      ))}
    </>
  );
}

function ProgressTracker({ completedCount, generableCount, totalLeaf, completedSections }: {
  completedCount: number;
  generableCount: number;
  totalLeaf: number;
  completedSections: Set<string>;
}) {
  const overallPercent = totalLeaf > 0 ? Math.round((completedCount / totalLeaf) * 100) : 0;
  const generablePercent = generableCount > 0 ? Math.round((completedCount / generableCount) * 100) : 0;

  // Count per category
  const sLeafs = getLeafSections(CTD_STRUCTURE.filter(s => s.id === 'S'));
  const pLeafs = getLeafSections(CTD_STRUCTURE.filter(s => s.id === 'P'));
  const sCompleted = sLeafs.filter(s => completedSections.has(s.id)).length;
  const pCompleted = pLeafs.filter(s => completedSections.has(s.id)).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Document Completion</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {completedCount} of {totalLeaf} sections completed
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-primary-600">{overallPercent}%</span>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-3 mb-4">
        <div
          className="h-3 rounded-full transition-all duration-500 bg-gradient-to-r from-primary-500 to-green-500"
          style={{ width: `${overallPercent}%` }}
        />
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="p-3 rounded-lg bg-blue-50">
          <div className="text-lg font-bold text-blue-700">{sCompleted}/{sLeafs.length}</div>
          <div className="text-[10px] text-blue-600 font-medium uppercase tracking-wider">Drug Substance</div>
        </div>
        <div className="p-3 rounded-lg bg-green-50">
          <div className="text-lg font-bold text-green-700">{pCompleted}/{pLeafs.length}</div>
          <div className="text-[10px] text-green-600 font-medium uppercase tracking-wider">Drug Product</div>
        </div>
        <div className="p-3 rounded-lg bg-amber-50">
          <div className="text-lg font-bold text-amber-700">{generableCount - completedCount}</div>
          <div className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Ready to Generate</div>
        </div>
      </div>

      {/* Generable progress detail */}
      {generableCount > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>AI-enabled sections</span>
            <span className="font-medium">{completedCount}/{generableCount} done</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all duration-500 bg-green-500"
              style={{ width: `${generablePercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectDashboard() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { current, selectById, loading } = useProject();
  const [runs, setRuns] = useState<GenerationRun[]>([]);

  useEffect(() => {
    if (projectId) selectById(projectId);
  }, [projectId, selectById]);

  useEffect(() => {
    if (!projectId) return;
    generation.list(projectId).then((data) => setRuns(data.items)).catch(() => {});
  }, [projectId]);

  // Compute completed sections from runs
  const completedSections = useMemo(() => {
    const set = new Set<string>();
    for (const r of runs) {
      if (r.status === 'completed' && r.section_id) {
        set.add(r.section_id);
      }
    }
    return set;
  }, [runs]);

  const totalLeaf = useMemo(() => getLeafSections().length, []);
  const generableCount = useMemo(() => getGenerableSections().length, []);

  if (loading || !current) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-gray-500">Loading project...</div>
      </div>
    );
  }

  const drugSubstance = CTD_STRUCTURE.find((s) => s.id === 'S')!;
  const drugProduct = CTD_STRUCTURE.find((s) => s.id === 'P')!;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Projects
          </button>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-600 rounded-xl">
              <Shield className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{current.name}</h1>
              <p className="text-sm text-gray-500">{current.description || 'CTD Module 3 – Quality'}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Progress tracker */}
        <ProgressTracker
          completedCount={completedSections.size}
          generableCount={generableCount}
          totalLeaf={totalLeaf}
          completedSections={completedSections}
        />

        {/* Info banner */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 flex items-start gap-3">
          <Sparkles className="text-primary-500 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-primary-900 font-medium text-sm">CTD Module 3 – Quality</p>
            <p className="text-primary-700 text-xs mt-0.5">
              Sections marked <span className="font-semibold text-green-700">Generated</span> are complete.
              Sections marked <span className="font-semibold text-amber-700">AI Ready</span> can be generated from your uploaded documents.
            </p>
          </div>
        </div>

        {/* Drug Substance */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-blue-50/50">
            <FlaskConical className="text-blue-600" size={20} />
            <div>
              <h2 className="text-base font-bold text-gray-900">3.2.S – Drug Substance</h2>
              <p className="text-xs text-gray-500">Active Pharmaceutical Ingredient</p>
            </div>
          </div>
          <div className="py-2 px-2">
            {drugSubstance.children!.map((section) => (
              <SectionRow key={section.id} section={section} depth={0} projectId={projectId!} completedSections={completedSections} />
            ))}
          </div>
        </div>

        {/* Drug Product */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-green-50/50">
            <Pill className="text-green-600" size={20} />
            <div>
              <h2 className="text-base font-bold text-gray-900">3.2.P – Drug Product</h2>
              <p className="text-xs text-gray-500">Finished Dosage Form</p>
            </div>
          </div>
          <div className="py-2 px-2">
            {drugProduct.children!.map((section) => (
              <SectionRow key={section.id} section={section} depth={0} projectId={projectId!} completedSections={completedSections} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
