import type { Modality } from '../types';

/**
 * Product modality metadata. Single source of truth for the modality dropdown,
 * project badges, and the compliance dashboard. Descriptions are drawn from the
 * regulatory mapping email (Scout Van den Bergh, Jun 2026).
 */
export interface ModalityMeta {
  id: Modality;
  /** Short label shown in dropdowns/badges, e.g. "NCE". */
  label: string;
  /** Plain-language name, e.g. "Small Molecule". */
  name: string;
  /** One-line description of what the modality enables/disables. */
  description: string;
  /** Tailwind classes for the badge. */
  badgeClass: string;
}

export const MODALITY_META: Record<Modality, ModalityMeta> = {
  NCE: {
    id: 'NCE',
    label: 'NCE',
    name: 'Small Molecule',
    description: 'Disables biologics-specific rules; enforces standard 3-batch validation and chemical stability.',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  NBE: {
    id: 'NBE',
    label: 'NBE',
    name: 'Biologics',
    description: 'Enables chromatography validation, potency assays, host cell impurities and viral clearance.',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  ATMP: {
    id: 'ATMP',
    label: 'ATMP',
    name: 'Cell & Gene Therapy',
    description: 'Focus on aseptic validation, cryogenic stability, post-thaw viability and VCN checks.',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  SYNTHETIC_HYBRID: {
    id: 'SYNTHETIC_HYBRID',
    label: 'Hybrid',
    name: 'Synthetic Hybrids (Oligos/Peptides)',
    description: 'Combines chemical validation with biological degradation and structure checks.',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  VACCINE: {
    id: 'VACCINE',
    label: 'Vaccine',
    name: 'Vaccines',
    description: 'Enforces adjuvant/formulation consistency and antigen stability requirements.',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

/** Ordered list for rendering dropdowns. */
export const MODALITY_OPTIONS: ModalityMeta[] = [
  MODALITY_META.NCE,
  MODALITY_META.NBE,
  MODALITY_META.ATMP,
  MODALITY_META.SYNTHETIC_HYBRID,
  MODALITY_META.VACCINE,
];

/** Resolve a project's modality, defaulting legacy/undefined projects to NCE. */
export function resolveModality(modality?: Modality): ModalityMeta {
  return MODALITY_META[modality ?? 'NCE'];
}
