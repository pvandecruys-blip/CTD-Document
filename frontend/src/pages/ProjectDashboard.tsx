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
  FileText,
  BookOpen,
  Microscope,
  Users,
  Download,
  Loader2,
  FileStack,
  AlertCircle,
  FileUp,
} from 'lucide-react';
import { CTD_STRUCTURE, getLeafSections, getGenerableSections, type CTDSection } from '../config/ctdStructure';
import { generation, documents } from '../api/client';
import type { GenerationRun, DocumentFile } from '../types';

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

const CTD_MODULES = [
  {
    id: 1,
    title: 'Module 1',
    subtitle: 'Administrative Information',
    icon: FileText,
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    enabled: false,
    description: 'Regional administrative information including application forms, prescribing information, and labelling.',
  },
  {
    id: 2,
    title: 'Module 2',
    subtitle: 'Summaries',
    icon: BookOpen,
    color: 'text-purple-400',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    enabled: false,
    description: 'Quality Overall Summary (QOS), Nonclinical Overview, Clinical Overview, and Written Summaries.',
  },
  {
    id: 3,
    title: 'Module 3',
    subtitle: 'Quality (CMC)',
    icon: FlaskConical,
    color: 'text-primary-600',
    bgColor: 'bg-primary-50',
    borderColor: 'border-primary-300',
    enabled: true,
    description: 'Drug Substance and Drug Product quality documentation including manufacturing, controls, and stability.',
  },
  {
    id: 4,
    title: 'Module 4',
    subtitle: 'Nonclinical',
    icon: Microscope,
    color: 'text-orange-400',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    enabled: false,
    description: 'Nonclinical study reports — pharmacology, pharmacokinetics, and toxicology.',
  },
  {
    id: 5,
    title: 'Module 5',
    subtitle: 'Clinical',
    icon: Users,
    color: 'text-teal-400',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    enabled: false,
    description: 'Clinical study reports, case report forms, and individual patient data listings.',
  },
];

// Extract body content from a full HTML document (strips <html>, <head>, <style>, etc.)
function extractBodyContent(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : html;
}

function BuildFinalCTD({ projectName, completedSections, generableCount, runs }: {
  projectName: string;
  completedSections: Set<string>;
  generableCount: number;
  runs: GenerationRun[];
}) {
  const [building, setBuilding] = useState(false);
  const completedCount = completedSections.size;
  const allGenerable = getGenerableSections();

  const handleBuild = async () => {
    setBuilding(true);
    try {
      // Collect generated HTML from all completed sections (in CTD order)
      const htmlStorage = JSON.parse(localStorage.getItem('ctd_generated_html') || '{}');
      const sections: { number: string; title: string; html: string }[] = [];

      for (const section of allGenerable) {
        if (!completedSections.has(section.id)) continue;

        // Find the most recent completed run for this section
        const sectionRun = runs
          .filter((r) => r.section_id === section.id && r.status === 'completed' && r.outputs?.html)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

        if (sectionRun?.outputs?.html) {
          const rawHtml = htmlStorage[sectionRun.outputs.html];
          if (rawHtml) {
            // Extract just the body content so we can embed it in the combined document
            sections.push({ number: section.number, title: section.title, html: extractBodyContent(rawHtml) });
          }
        }
      }

      if (sections.length === 0) {
        alert('No generated sections found. Please generate at least one section first.');
        return;
      }

      // Build combined CTD submission package
      const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const combinedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CTD Submission Package – ${projectName}</title>
  <style>
    @page { size: A4 portrait; margin: 2.54cm; }
    body { font-family: Arial, Helvetica, sans-serif; max-width: 210mm; margin: 0 auto; padding: 40px 30px; color: #333; line-height: 1.6; font-size: 11pt; }

    /* Cover page */
    .cover-page { text-align: center; padding: 60px 0 40px; page-break-after: always; }
    .cover-page .logo { font-size: 12px; text-transform: uppercase; letter-spacing: 3px; color: #003366; margin-bottom: 60px; }
    .cover-page h1 { font-size: 32px; font-weight: bold; color: #003366; margin-bottom: 4px; }
    .cover-page h2 { font-size: 22px; font-weight: normal; color: #555; margin-bottom: 12px; }
    .cover-page .product-name { font-size: 20px; color: #003366; font-weight: bold; margin-top: 40px; padding: 12px 24px; border: 2px solid #003366; display: inline-block; }
    .cover-page .meta { font-size: 12px; color: #666; margin-top: 60px; }
    .cover-page .meta p { margin: 4px 0; }
    .cover-page .meta strong { color: #333; }

    /* Module overview */
    .module-overview { page-break-after: always; }
    .module-overview h2 { font-size: 18px; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 6px; margin-bottom: 20px; }
    .module-box { border: 1px solid #ddd; border-radius: 4px; padding: 12px 16px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; }
    .module-box.active { border-color: #003366; background: #f0f4ff; }
    .module-box.placeholder { opacity: 0.5; }
    .module-num { font-size: 14px; font-weight: bold; color: #003366; min-width: 80px; }
    .module-title { font-size: 13px; color: #333; }
    .module-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: bold; margin-left: auto; }
    .badge-included { background: #d1fae5; color: #065f46; }
    .badge-pending { background: #fef3c7; color: #92400e; }

    /* Table of Contents */
    .toc { page-break-after: always; }
    .toc h2 { font-size: 18px; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 6px; margin-bottom: 16px; }
    .toc-entry { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px dotted #ccc; }
    .toc-number { font-family: 'Courier New', monospace; color: #003366; min-width: 90px; font-weight: bold; }

    /* Section dividers */
    .section-divider { page-break-before: always; margin-top: 40px; }
    .section-divider:first-of-type { page-break-before: auto; margin-top: 0; }
    .section-banner { background: #003366; color: white; padding: 10px 16px; font-size: 12px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 24px; }

    /* Tables (base styles, individual sections may override with inline styles) */
    table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10pt; }
    th, td { border: 1px solid #999; padding: 6px 10px; text-align: left; }
    th { background: #003366; color: white; font-weight: bold; }
    tr:nth-child(even) { background: #f9f9f9; }

    /* General */
    h1, h2, h3, h4 { color: #003366; }
    a { color: #0066cc; text-decoration: underline; }
    .footer { text-align: center; font-size: 9px; color: #999; margin-top: 60px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="cover-page">
    <div class="logo">Common Technical Document</div>
    <h1>CTD Submission Package</h1>
    <h2>ICH M4 Quality Documentation</h2>
    <div class="product-name">${projectName}</div>
    <div class="meta">
      <p><strong>Compilation Date:</strong> ${now}</p>
      <p><strong>Modules Included:</strong> Module 3 – Quality (CMC)</p>
      <p><strong>Sections Compiled:</strong> ${sections.length} of ${allGenerable.length}</p>
      <p><strong>Format:</strong> ICH M4Q(R2) / eCTD</p>
      <p style="margin-top: 20px; font-style: italic;">CONFIDENTIAL</p>
    </div>
  </div>

  <!-- Module Overview -->
  <div class="module-overview">
    <h2>Module Overview</h2>
    <div class="module-box placeholder">
      <span class="module-num">Module 1</span>
      <span class="module-title">Administrative Information and Prescribing Information</span>
      <span class="module-badge badge-pending">Pending</span>
    </div>
    <div class="module-box placeholder">
      <span class="module-num">Module 2</span>
      <span class="module-title">Common Technical Document Summaries</span>
      <span class="module-badge badge-pending">Pending</span>
    </div>
    <div class="module-box active">
      <span class="module-num">Module 3</span>
      <span class="module-title">Quality (CMC) — ${sections.length} sections included</span>
      <span class="module-badge badge-included">Included</span>
    </div>
    <div class="module-box placeholder">
      <span class="module-num">Module 4</span>
      <span class="module-title">Nonclinical Study Reports</span>
      <span class="module-badge badge-pending">Pending</span>
    </div>
    <div class="module-box placeholder">
      <span class="module-num">Module 5</span>
      <span class="module-title">Clinical Study Reports</span>
      <span class="module-badge badge-pending">Pending</span>
    </div>
  </div>

  <!-- Table of Contents -->
  <div class="toc">
    <h2>Table of Contents — Module 3</h2>
    ${sections.map((s) => `<div class="toc-entry"><span><span class="toc-number">${s.number}</span> ${s.title}</span></div>`).join('\n    ')}
  </div>

  <!-- Compiled Sections -->
  ${sections.map((s) => `
  <div class="section-divider">
    <div class="section-banner">${s.number} – ${s.title}</div>
    ${s.html}
  </div>`).join('\n')}

  <div class="footer">
    CTD Submission Package – ${projectName} | Compiled ${now} | Confidential – Do Not Distribute
  </div>
</body>
</html>`;

      // Download
      const blob = new Blob([combinedHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/[^a-z0-9]/gi, '_')}_CTD_Submission_Package.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-8">
      <div className="flex items-start gap-5">
        <div className="p-4 bg-primary-50 rounded-xl flex-shrink-0">
          <FileStack size={28} className="text-primary-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900">Compile CTD Submission Package</h3>
          <p className="text-sm text-gray-500 mt-1">
            Compile all modules into the final CTD submission package with cover page, module overview, and table of contents.
          </p>

          {/* Status */}
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 size={14} className="text-green-500" />
              <span className="text-gray-700">
                <span className="font-semibold">{completedCount}</span> of {generableCount} sections generated
              </span>
            </div>
            {completedCount < generableCount && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertCircle size={12} />
                {generableCount - completedCount} sections remaining
              </div>
            )}
          </div>

          {/* Button */}
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={handleBuild}
              disabled={completedCount === 0 || building}
              className="inline-flex items-center gap-2 bg-primary-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-primary-700 shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {building ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              {building ? 'Compiling...' : 'Compile & Download CTD Package'}
            </button>
            {completedCount === 0 && (
              <span className="text-xs text-gray-400">Generate at least one section first</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProjectDashboard() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { current, selectById, loading } = useProject();
  const [runs, setRuns] = useState<GenerationRun[]>([]);
  const [activeModule, setActiveModule] = useState(3);
  const [projectDocs, setProjectDocs] = useState<DocumentFile[]>([]);

  useEffect(() => {
    if (projectId) selectById(projectId);
  }, [projectId, selectById]);

  useEffect(() => {
    if (!projectId) return;
    generation.list(projectId).then((data) => setRuns(data.items)).catch(() => {});
    documents.list(projectId).then((data) => setProjectDocs(data.items.filter((d: DocumentFile) => d.source !== 'veeva'))).catch(() => {});
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

  // Detect documents uploaded after the most recent generation run
  const newDocsInfo = useMemo(() => {
    const completedRuns = runs.filter((r) => r.status === 'completed' && r.completed_at);
    if (completedRuns.length === 0 || projectDocs.length === 0) return null;
    const lastGenTime = Math.max(...completedRuns.map((r) => new Date(r.completed_at!).getTime()));
    const newDocs = projectDocs.filter((d) => new Date(d.uploaded_at).getTime() > lastGenTime);
    if (newDocs.length === 0) return null;
    return { count: newDocs.length, names: newDocs.map((d) => d.original_filename) };
  }, [runs, projectDocs]);

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
              <p className="text-sm text-gray-500">{current.description || 'Common Technical Document'}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Module Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CTD_MODULES.map((mod) => {
            const ModIcon = mod.icon;
            const isActive = activeModule === mod.id;
            return (
              <button
                key={mod.id}
                onClick={() => mod.enabled && setActiveModule(mod.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? `${mod.bgColor} ${mod.borderColor} ${mod.color} shadow-sm`
                    : mod.enabled
                    ? 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:shadow-sm cursor-pointer'
                    : 'bg-gray-50 border-gray-100 text-gray-400 cursor-default'
                }`}
              >
                <ModIcon size={16} />
                <span>{mod.title}</span>
                {!mod.enabled && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500 font-medium">
                    SOON
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Module 3 Content */}
        {activeModule === 3 && (
          <>
            {/* Compile CTD Submission Package */}
            <BuildFinalCTD
              projectName={current.name}
              completedSections={completedSections}
              generableCount={generableCount}
              runs={runs}
            />

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
                <p className="text-primary-900 font-medium text-sm">Module 3 – Quality (CMC)</p>
                <p className="text-primary-700 text-xs mt-0.5">
                  Sections marked <span className="font-semibold text-green-700">Generated</span> are complete.
                  Sections marked <span className="font-semibold text-amber-700">AI Ready</span> can be generated from your uploaded documents.
                </p>
              </div>
            </div>

            {/* New documents notification */}
            {newDocsInfo && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <FileUp className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="text-amber-900 font-medium text-sm">
                    {newDocsInfo.count} new document{newDocsInfo.count > 1 ? 's' : ''} uploaded since last generation
                  </p>
                  <p className="text-amber-700 text-xs mt-0.5">
                    {newDocsInfo.names.join(', ')} — Consider re-generating affected sections to include the latest data.
                  </p>
                </div>
              </div>
            )}

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

          </>
        )}

        {/* Placeholder for other modules */}
        {activeModule !== 3 && (() => {
          const mod = CTD_MODULES.find(m => m.id === activeModule);
          if (!mod) return null;
          const ModIcon = mod.icon;
          return (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <div className={`inline-flex p-4 rounded-2xl ${mod.bgColor} mb-4`}>
                <ModIcon size={32} className={mod.color} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{mod.title} – {mod.subtitle}</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">{mod.description}</p>
              <span className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                <Lock size={14} />
                Coming Soon
              </span>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
