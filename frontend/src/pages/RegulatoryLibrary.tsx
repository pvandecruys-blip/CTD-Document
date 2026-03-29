import { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Info,
  Search,
  Filter,
} from 'lucide-react';
import { getICHGuidelines, type ICHGuideline, type ICHRule } from '../api/client';

const SEVERITY_COLORS = {
  BLOCK: 'bg-red-100 text-red-700 border-red-200',
  WARN: 'bg-amber-100 text-amber-700 border-amber-200',
};

const LEVEL_COLORS = {
  MUST: 'bg-red-50 text-red-600',
  SHOULD: 'bg-amber-50 text-amber-600',
  MAY: 'bg-blue-50 text-blue-600',
};

function RuleRow({ rule }: { rule: ICHRule }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="w-4 flex-shrink-0">
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </div>

        <span className="font-mono text-xs text-gray-500 w-20 flex-shrink-0">{rule.rule_id_code}</span>

        <span className="text-sm text-gray-800 flex-1 line-clamp-1">{rule.rule_text}</span>

        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LEVEL_COLORS[rule.requirement_level]}`}>
          {rule.requirement_level}
        </span>

        <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${SEVERITY_COLORS[rule.severity]}`}>
          {rule.severity}
        </span>

        <div className="flex gap-1">
          {rule.applies_to.map((a) => (
            <span key={a} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              {a}
            </span>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-2">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="font-medium text-gray-500">CTD Sections:</span>
              <span className="ml-2 text-gray-700">{rule.ctd_sections.map((s) => `3.2.${s}`).join(', ')}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">Category:</span>
              <span className="ml-2 text-gray-700">{rule.category}</span>
            </div>
          </div>
          <div className="text-xs">
            <span className="font-medium text-gray-500">Evidence Expected:</span>
            <span className="ml-2 text-gray-700">{rule.evidence_expected}</span>
          </div>
          <div className="text-xs text-gray-700 mt-1 p-2 bg-white rounded border border-gray-200">
            {rule.rule_text}
          </div>
        </div>
      )}
    </div>
  );
}

function GuidelineCard({ guideline }: { guideline: ICHGuideline }) {
  const [expanded, setExpanded] = useState(false);
  const blockCount = guideline.rules.filter((r) => r.severity === 'BLOCK').length;
  const warnCount = guideline.rules.filter((r) => r.severity === 'WARN').length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="p-2.5 bg-indigo-50 rounded-lg flex-shrink-0">
          <BookOpen size={20} className="text-indigo-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900">{guideline.code}</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Active</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{guideline.title}</p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900">{guideline.rules.length}</div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wider">Rules</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">{blockCount}</div>
            <div className="text-[9px] text-red-500 uppercase tracking-wider">Block</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-amber-600">{warnCount}</div>
            <div className="text-[9px] text-amber-500 uppercase tracking-wider">Warn</div>
          </div>
        </div>

        <div className="w-5 flex-shrink-0">
          {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100">
          <div className="px-5 py-3 bg-gray-50">
            <p className="text-xs text-gray-600">{guideline.description}</p>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
              <span>Agency: <strong>{guideline.agency}</strong></span>
              <span>Version: <strong>{guideline.version}</strong></span>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {guideline.rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegulatoryLibrary() {
  const guidelines = getICHGuidelines();
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'BLOCK' | 'WARN'>('all');

  const totalRules = guidelines.reduce((n, g) => n + g.rules.length, 0);
  const blockRules = guidelines.reduce((n, g) => n + g.rules.filter((r) => r.severity === 'BLOCK').length, 0);
  const warnRules = guidelines.reduce((n, g) => n + g.rules.filter((r) => r.severity === 'WARN').length, 0);
  const mustRules = guidelines.reduce((n, g) => n + g.rules.filter((r) => r.requirement_level === 'MUST').length, 0);

  // Filter guidelines based on search
  const filteredGuidelines = guidelines.map((g) => ({
    ...g,
    rules: g.rules.filter((r) => {
      const matchSearch = !search || r.rule_text.toLowerCase().includes(search.toLowerCase()) || r.rule_id_code.toLowerCase().includes(search.toLowerCase()) || r.category.toLowerCase().includes(search.toLowerCase());
      const matchSeverity = filterSeverity === 'all' || r.severity === filterSeverity;
      return matchSearch && matchSeverity;
    }),
  })).filter((g) => g.rules.length > 0 || !search);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Regulatory Library</h1>
        <p className="text-sm text-gray-500 mt-1">
          ICH Quality Guidelines — rules used for gap assessment
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{guidelines.length}</div>
          <div className="text-xs text-gray-500 mt-1">ICH Guidelines</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-indigo-600">{totalRules}</div>
          <div className="text-xs text-gray-500 mt-1">Total Rules</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{mustRules}</div>
          <div className="text-xs text-gray-500 mt-1">MUST Requirements</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="flex items-center justify-center gap-3">
            <span className="text-lg font-bold text-red-600">{blockRules}</span>
            <span className="text-gray-300">/</span>
            <span className="text-lg font-bold text-amber-600">{warnRules}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">Block / Warn</div>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800 space-y-1">
          <p><strong>BLOCK</strong> rules will flag a gap as a critical failure in the assessment. <strong>WARN</strong> rules flag warnings that should be reviewed.</p>
          <p><strong>MUST</strong> = mandatory requirement, <strong>SHOULD</strong> = recommended, <strong>MAY</strong> = optional but good practice.</p>
          <p>Run a <strong>Gap Assessment</strong> from the Validation tab to check your project against these rules.</p>
        </div>
      </div>

      {/* Search and filter */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules by text, code, or category..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200"
          />
        </div>
        <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5">
          <Filter size={14} className="text-gray-400 ml-2" />
          {(['all', 'BLOCK', 'WARN'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                filterSeverity === sev
                  ? sev === 'BLOCK' ? 'bg-red-100 text-red-700' : sev === 'WARN' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-800'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {sev === 'all' ? 'All' : sev}
            </button>
          ))}
        </div>
      </div>

      {/* Guidelines */}
      <div className="space-y-4">
        {filteredGuidelines.map((g) => (
          <GuidelineCard key={g.id} guideline={g} />
        ))}
      </div>
    </div>
  );
}
