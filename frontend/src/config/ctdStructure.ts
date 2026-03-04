/**
 * ICH CTD Module 3 – Quality (M4Q) complete structure.
 *
 * Each leaf section can potentially be generated independently.
 * `isGenerable` marks sections with working AI generation.
 * `promptKey` maps to the backend system prompt identifier.
 */

export interface CTDSection {
  id: string;
  number: string;
  title: string;
  children?: CTDSection[];
  isGenerable: boolean;
  promptKey?: string;
}

export const CTD_STRUCTURE: CTDSection[] = [
  {
    id: 'S',
    number: '3.2.S',
    title: 'Drug Substance',
    isGenerable: false,
    children: [
      {
        id: 'S.1',
        number: '3.2.S.1',
        title: 'General Information',
        isGenerable: false,
        children: [
          { id: 'S.1.1', number: '3.2.S.1.1', title: 'Nomenclature', isGenerable: false },
          { id: 'S.1.2', number: '3.2.S.1.2', title: 'Structure', isGenerable: false },
          { id: 'S.1.3', number: '3.2.S.1.3', title: 'General Properties', isGenerable: false },
        ],
      },
      {
        id: 'S.2',
        number: '3.2.S.2',
        title: 'Manufacture',
        isGenerable: false,
        children: [
          { id: 'S.2.1', number: '3.2.S.2.1', title: 'Manufacturer(s)', isGenerable: false },
          { id: 'S.2.2', number: '3.2.S.2.2', title: 'Description of Manufacturing Process and Process Controls', isGenerable: false },
          { id: 'S.2.3', number: '3.2.S.2.3', title: 'Control of Materials', isGenerable: false },
          { id: 'S.2.4', number: '3.2.S.2.4', title: 'Controls of Critical Steps and Intermediates', isGenerable: false },
          { id: 'S.2.5', number: '3.2.S.2.5', title: 'Process Validation and/or Evaluation', isGenerable: true, promptKey: 'S.2.5' },
          { id: 'S.2.6', number: '3.2.S.2.6', title: 'Manufacturing Process Development', isGenerable: false },
        ],
      },
      {
        id: 'S.3',
        number: '3.2.S.3',
        title: 'Characterisation',
        isGenerable: false,
        children: [
          { id: 'S.3.1', number: '3.2.S.3.1', title: 'Elucidation of Structure and Other Characteristics', isGenerable: false },
          { id: 'S.3.2', number: '3.2.S.3.2', title: 'Impurities', isGenerable: false },
        ],
      },
      {
        id: 'S.4',
        number: '3.2.S.4',
        title: 'Control of Drug Substance',
        isGenerable: false,
        children: [
          { id: 'S.4.1', number: '3.2.S.4.1', title: 'Specification', isGenerable: false },
          { id: 'S.4.2', number: '3.2.S.4.2', title: 'Analytical Procedures', isGenerable: false },
          { id: 'S.4.3', number: '3.2.S.4.3', title: 'Validation of Analytical Procedures', isGenerable: false },
          { id: 'S.4.4', number: '3.2.S.4.4', title: 'Batch Analyses', isGenerable: false },
          { id: 'S.4.5', number: '3.2.S.4.5', title: 'Justification of Specification', isGenerable: false },
        ],
      },
      {
        id: 'S.5',
        number: '3.2.S.5',
        title: 'Reference Standards or Materials',
        isGenerable: false,
      },
      {
        id: 'S.6',
        number: '3.2.S.6',
        title: 'Container Closure System',
        isGenerable: false,
      },
      {
        id: 'S.7',
        number: '3.2.S.7',
        title: 'Stability',
        isGenerable: false,
        children: [
          { id: 'S.7.1', number: '3.2.S.7.1', title: 'Stability Summary and Conclusions', isGenerable: true, promptKey: 'S.7.1' },
          { id: 'S.7.2', number: '3.2.S.7.2', title: 'Post-Approval Stability Protocol and Stability Commitment', isGenerable: true, promptKey: 'S.7.2' },
          { id: 'S.7.3', number: '3.2.S.7.3', title: 'Stability Data', isGenerable: true, promptKey: 'S.7.3' },
        ],
      },
    ],
  },
  {
    id: 'P',
    number: '3.2.P',
    title: 'Drug Product',
    isGenerable: false,
    children: [
      {
        id: 'P.1',
        number: '3.2.P.1',
        title: 'Description and Composition of the Drug Product',
        isGenerable: false,
      },
      {
        id: 'P.2',
        number: '3.2.P.2',
        title: 'Pharmaceutical Development',
        isGenerable: false,
        children: [
          { id: 'P.2.1', number: '3.2.P.2.1', title: 'Components of the Drug Product', isGenerable: false },
          { id: 'P.2.2', number: '3.2.P.2.2', title: 'Drug Product (Formulation, CQAs, QTPP)', isGenerable: false },
          { id: 'P.2.3', number: '3.2.P.2.3', title: 'Manufacturing Process Development', isGenerable: false },
          { id: 'P.2.4', number: '3.2.P.2.4', title: 'Container Closure System', isGenerable: false },
          { id: 'P.2.5', number: '3.2.P.2.5', title: 'Microbiological Attributes', isGenerable: false },
          { id: 'P.2.6', number: '3.2.P.2.6', title: 'Compatibility', isGenerable: false },
        ],
      },
      {
        id: 'P.3',
        number: '3.2.P.3',
        title: 'Manufacture',
        isGenerable: false,
        children: [
          { id: 'P.3.1', number: '3.2.P.3.1', title: 'Manufacturer(s)', isGenerable: false },
          { id: 'P.3.2', number: '3.2.P.3.2', title: 'Batch Formula', isGenerable: false },
          { id: 'P.3.3', number: '3.2.P.3.3', title: 'Description of Manufacturing Process and Process Controls', isGenerable: false },
          { id: 'P.3.4', number: '3.2.P.3.4', title: 'Controls of Critical Steps and Intermediates', isGenerable: false },
          { id: 'P.3.5', number: '3.2.P.3.5', title: 'Process Validation and/or Evaluation', isGenerable: false },
        ],
      },
      {
        id: 'P.4',
        number: '3.2.P.4',
        title: 'Control of Excipients',
        isGenerable: false,
        children: [
          { id: 'P.4.1', number: '3.2.P.4.1', title: 'Specifications', isGenerable: false },
          { id: 'P.4.2', number: '3.2.P.4.2', title: 'Analytical Procedures', isGenerable: false },
          { id: 'P.4.3', number: '3.2.P.4.3', title: 'Validation of Analytical Procedures', isGenerable: false },
          { id: 'P.4.4', number: '3.2.P.4.4', title: 'Justification of Specifications', isGenerable: false },
          { id: 'P.4.5', number: '3.2.P.4.5', title: 'Excipients of Human or Animal Origin', isGenerable: false },
          { id: 'P.4.6', number: '3.2.P.4.6', title: 'Novel Excipients', isGenerable: false },
        ],
      },
      {
        id: 'P.5',
        number: '3.2.P.5',
        title: 'Control of Drug Product',
        isGenerable: false,
        children: [
          { id: 'P.5.1', number: '3.2.P.5.1', title: 'Specification', isGenerable: false },
          { id: 'P.5.2', number: '3.2.P.5.2', title: 'Analytical Procedures', isGenerable: false },
          { id: 'P.5.3', number: '3.2.P.5.3', title: 'Validation of Analytical Procedures', isGenerable: false },
          { id: 'P.5.4', number: '3.2.P.5.4', title: 'Batch Analyses', isGenerable: false },
          { id: 'P.5.5', number: '3.2.P.5.5', title: 'Characterisation of Impurities', isGenerable: false },
          { id: 'P.5.6', number: '3.2.P.5.6', title: 'Justification of Specification', isGenerable: false },
        ],
      },
      {
        id: 'P.6',
        number: '3.2.P.6',
        title: 'Reference Standards or Materials',
        isGenerable: false,
      },
      {
        id: 'P.7',
        number: '3.2.P.7',
        title: 'Container Closure System',
        isGenerable: false,
      },
      {
        id: 'P.8',
        number: '3.2.P.8',
        title: 'Stability',
        isGenerable: false,
        children: [
          { id: 'P.8.1', number: '3.2.P.8.1', title: 'Stability Summary and Conclusions', isGenerable: false },
          { id: 'P.8.2', number: '3.2.P.8.2', title: 'Post-Approval Stability Protocol and Stability Commitment', isGenerable: false },
          { id: 'P.8.3', number: '3.2.P.8.3', title: 'Stability Data', isGenerable: false },
        ],
      },
    ],
  },
];

/** Flatten the tree to find a section by ID */
export function findSection(id: string, sections: CTDSection[] = CTD_STRUCTURE): CTDSection | undefined {
  for (const s of sections) {
    if (s.id === id) return s;
    if (s.children) {
      const found = findSection(id, s.children);
      if (found) return found;
    }
  }
  return undefined;
}

/** Get all generable (leaf) sections */
export function getGenerableSections(sections: CTDSection[] = CTD_STRUCTURE): CTDSection[] {
  const result: CTDSection[] = [];
  for (const s of sections) {
    if (s.isGenerable) result.push(s);
    if (s.children) result.push(...getGenerableSections(s.children));
  }
  return result;
}

/** Get all leaf sections (no children) */
export function getLeafSections(sections: CTDSection[] = CTD_STRUCTURE): CTDSection[] {
  const result: CTDSection[] = [];
  for (const s of sections) {
    if (!s.children || s.children.length === 0) {
      result.push(s);
    } else {
      result.push(...getLeafSections(s.children));
    }
  }
  return result;
}
