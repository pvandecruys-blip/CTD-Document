import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import {
  ArrowLeft,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Play,
  Download,
  Eye,
  Sparkles,
  Clock,
  Loader2,
} from 'lucide-react';

// Mock data for different section types
const MOCK_SECTION_DATA: Record<string, {
  documents: { name: string; type: string; status: string }[];
  extractedItems: { label: string; value: string; confidence: number }[];
  generatedPreview: string;
}> = {
  s1: {
    documents: [
      { name: 'API_Specification_v3.2.pdf', type: 'Specification', status: 'processed' },
      { name: 'Structure_Elucidation_Report.pdf', type: 'Technical Report', status: 'processed' },
      { name: 'Nomenclature_Certificate.pdf', type: 'Certificate', status: 'processed' },
    ],
    extractedItems: [
      { label: 'INN Name', value: 'Amlodipine', confidence: 0.98 },
      { label: 'Chemical Name (IUPAC)', value: '3-ethyl 5-methyl 2-[(2-aminoethoxy)methyl]-4-(2-chlorophenyl)-6-methyl-1,4-dihydropyridine-3,5-dicarboxylate', confidence: 0.95 },
      { label: 'Molecular Formula', value: 'C20H25ClN2O5', confidence: 0.99 },
      { label: 'Molecular Weight', value: '408.88 g/mol', confidence: 0.99 },
      { label: 'CAS Number', value: '88150-42-9', confidence: 0.97 },
      { label: 'Structural Class', value: 'Dihydropyridine calcium channel blocker', confidence: 0.92 },
    ],
    generatedPreview: `
3.2.S.1 GENERAL INFORMATION

3.2.S.1.1 Nomenclature

The drug substance is identified by the following names:
• International Nonproprietary Name (INN): Amlodipine
• Chemical Name (IUPAC): 3-ethyl 5-methyl 2-[(2-aminoethoxy)methyl]-4-(2-chlorophenyl)-6-methyl-1,4-dihydropyridine-3,5-dicarboxylate
• CAS Registry Number: 88150-42-9

3.2.S.1.2 Structure

The molecular formula is C20H25ClN2O5 with a molecular weight of 408.88 g/mol. The compound exists as a white to off-white crystalline powder.

[Structure diagram would be inserted here]

3.2.S.1.3 General Properties

Amlodipine besylate is a dihydropyridine calcium channel blocker. The compound is slightly soluble in water and sparingly soluble in ethanol.
    `,
  },
  s2: {
    documents: [
      { name: 'Manufacturing_Process_Description.pdf', type: 'Process Document', status: 'processed' },
      { name: 'Batch_Records_Validation.pdf', type: 'Validation', status: 'processed' },
      { name: 'Process_Flow_Diagram.pdf', type: 'Diagram', status: 'processed' },
      { name: 'Critical_Process_Parameters.xlsx', type: 'Data', status: 'processed' },
    ],
    extractedItems: [
      { label: 'Manufacturer', value: 'PharmaChem GmbH, Basel, Switzerland', confidence: 0.97 },
      { label: 'Manufacturing Site', value: 'Site A - Industriestrasse 15, Basel', confidence: 0.96 },
      { label: 'Batch Size', value: '100 kg', confidence: 0.94 },
      { label: 'Number of Steps', value: '6 synthetic steps', confidence: 0.91 },
      { label: 'Critical Steps', value: 'Step 3 (Ring formation), Step 5 (Salt formation)', confidence: 0.88 },
      { label: 'Process Validation', value: '3 consecutive batches validated', confidence: 0.95 },
    ],
    generatedPreview: `
3.2.S.2 MANUFACTURE

3.2.S.2.1 Manufacturer(s)

Name: PharmaChem GmbH
Address: Industriestrasse 15, 4057 Basel, Switzerland
Responsibility: Manufacturing of drug substance from starting materials to final API

3.2.S.2.2 Description of Manufacturing Process and Process Controls

The manufacturing process consists of 6 synthetic steps starting from commercially available starting materials. The process has been validated on 3 consecutive batches at commercial scale (100 kg).

[Process flow diagram would be inserted here]

Critical process parameters have been identified and controlled:
• Step 3: Temperature (20-25°C), reaction time (4-6 hours)
• Step 5: pH control (6.8-7.2), crystallization temperature

3.2.S.2.3 Control of Materials

All starting materials and reagents are controlled according to internal specifications or pharmacopoeial monographs.
    `,
  },
  s3: {
    documents: [
      { name: 'Structure_Elucidation_Package.pdf', type: 'Analytical Report', status: 'processed' },
      { name: 'NMR_Spectra.pdf', type: 'Spectral Data', status: 'processed' },
      { name: 'Mass_Spec_Analysis.pdf', type: 'Spectral Data', status: 'processed' },
      { name: 'Impurity_Profile.pdf', type: 'Analytical Report', status: 'processed' },
    ],
    extractedItems: [
      { label: 'Structure Confirmed By', value: 'NMR, MS, IR, UV, Elemental Analysis', confidence: 0.96 },
      { label: 'Stereochemistry', value: 'Racemic mixture (R,S)', confidence: 0.94 },
      { label: 'Polymorphic Form', value: 'Form I (stable)', confidence: 0.92 },
      { label: 'Specified Impurities', value: '4 process-related, 2 degradation', confidence: 0.89 },
      { label: 'Unspecified Impurity Limit', value: 'NMT 0.10%', confidence: 0.95 },
      { label: 'Total Impurities Limit', value: 'NMT 1.0%', confidence: 0.97 },
    ],
    generatedPreview: `
3.2.S.3 CHARACTERISATION

3.2.S.3.1 Elucidation of Structure and Other Characteristics

The structure of amlodipine has been confirmed by comprehensive spectroscopic analysis:

• ¹H-NMR and ¹³C-NMR: Consistent with proposed structure
• Mass Spectrometry: M+H = 409 m/z
• IR Spectroscopy: Characteristic peaks at 3300, 1700, 1600 cm⁻¹
• UV Spectroscopy: λmax = 360 nm in methanol

The compound exists as a racemic mixture. Polymorphic screening identified Form I as the thermodynamically stable form.

3.2.S.3.2 Impurities

The following impurities have been identified and characterized:

Process-Related Impurities:
• Impurity A (desamino): ≤0.15%
• Impurity B (ethyl ester): ≤0.10%

Degradation Products:
• Impurity C (oxidative): ≤0.20%
    `,
  },
  s4: {
    documents: [
      { name: 'Drug_Substance_Specification.pdf', type: 'Specification', status: 'processed' },
      { name: 'Analytical_Methods.pdf', type: 'Methods', status: 'processed' },
      { name: 'Method_Validation_Report.pdf', type: 'Validation', status: 'processed' },
      { name: 'Batch_Analysis_Data.xlsx', type: 'Data', status: 'processed' },
    ],
    extractedItems: [
      { label: 'Appearance', value: 'White to off-white crystalline powder', confidence: 0.98 },
      { label: 'Identification', value: 'IR, HPLC-RT', confidence: 0.97 },
      { label: 'Assay', value: '98.0% - 102.0%', confidence: 0.99 },
      { label: 'Related Substances', value: 'Total NMT 1.0%', confidence: 0.96 },
      { label: 'Residual Solvents', value: 'Meets ICH Q3C', confidence: 0.94 },
      { label: 'Water Content', value: 'NMT 0.5%', confidence: 0.95 },
    ],
    generatedPreview: `
3.2.S.4 CONTROL OF DRUG SUBSTANCE

3.2.S.4.1 Specification

The drug substance specification includes the following tests:

| Test | Acceptance Criteria |
|------|-------------------|
| Appearance | White to off-white crystalline powder |
| Identification (IR) | Conforms to reference |
| Identification (HPLC) | RT matches reference |
| Assay (HPLC) | 98.0% - 102.0% |
| Related Substances | Individual: NMT 0.2%, Total: NMT 1.0% |
| Residual Solvents | Meets ICH Q3C limits |
| Water Content (KF) | NMT 0.5% |
| Heavy Metals | NMT 10 ppm |

3.2.S.4.2 Analytical Procedures

All analytical methods have been validated according to ICH Q2(R1) guidelines.
    `,
  },
  p1: {
    documents: [
      { name: 'Product_Description.pdf', type: 'Specification', status: 'processed' },
      { name: 'Formulation_Development.pdf', type: 'Development', status: 'processed' },
      { name: 'Composition_Table.xlsx', type: 'Data', status: 'processed' },
    ],
    extractedItems: [
      { label: 'Dosage Form', value: 'Film-coated tablet', confidence: 0.99 },
      { label: 'Strength', value: '5 mg, 10 mg', confidence: 0.98 },
      { label: 'Route', value: 'Oral', confidence: 0.99 },
      { label: 'Core Weight', value: '150 mg (5 mg), 200 mg (10 mg)', confidence: 0.95 },
      { label: 'Coating', value: 'Opadry II White', confidence: 0.93 },
      { label: 'Shape', value: 'Round, biconvex', confidence: 0.97 },
    ],
    generatedPreview: `
3.2.P.1 DESCRIPTION AND COMPOSITION OF THE DRUG PRODUCT

3.2.P.1.1 Description of the Dosage Form

Amlodipine tablets are immediate-release, film-coated tablets for oral administration available in two strengths: 5 mg and 10 mg.

The tablets are round, biconvex, white film-coated tablets. The 5 mg tablets are debossed with "AML 5" on one side.

3.2.P.1.2 Composition

Qualitative and Quantitative Composition (per tablet):

| Component | Function | 5 mg | 10 mg |
|-----------|----------|------|-------|
| Amlodipine besylate | Active | 6.93 mg* | 13.86 mg* |
| Microcrystalline cellulose | Diluent | 80 mg | 100 mg |
| Calcium hydrogen phosphate | Diluent | 50 mg | 70 mg |
| Sodium starch glycolate | Disintegrant | 8 mg | 10 mg |
| Magnesium stearate | Lubricant | 1.5 mg | 2 mg |

*Equivalent to 5 mg / 10 mg amlodipine free base
    `,
  },
  p2: {
    documents: [
      { name: 'Pharmaceutical_Development_Report.pdf', type: 'Development', status: 'processed' },
      { name: 'Formulation_Optimization.pdf', type: 'Development', status: 'processed' },
      { name: 'Dissolution_Studies.pdf', type: 'Analytical', status: 'processed' },
    ],
    extractedItems: [
      { label: 'Development Approach', value: 'Quality by Design (QbD)', confidence: 0.94 },
      { label: 'Critical Quality Attributes', value: 'Dissolution, Assay, Content Uniformity', confidence: 0.92 },
      { label: 'Design Space', value: 'Established for compression force and blending time', confidence: 0.88 },
      { label: 'Dissolution Target', value: 'Q=80% in 30 minutes (pH 6.8)', confidence: 0.96 },
      { label: 'Excipient Compatibility', value: 'No incompatibilities identified', confidence: 0.91 },
      { label: 'Manufacturing Process', value: 'Direct compression', confidence: 0.97 },
    ],
    generatedPreview: `
3.2.P.2 PHARMACEUTICAL DEVELOPMENT

3.2.P.2.1 Components of the Drug Product

Drug Substance:
The physicochemical properties relevant to formulation were characterized. The particle size specification (D90 < 150 µm) was established to ensure content uniformity and dissolution performance.

Excipients:
Excipient compatibility studies were performed and no significant interactions were observed.

3.2.P.2.2 Drug Product

Formulation Development:
A Quality by Design (QbD) approach was used. The Quality Target Product Profile (QTPP) defined an immediate-release tablet with >80% dissolution in 30 minutes.

Critical Quality Attributes identified:
• Dissolution
• Assay
• Content Uniformity

3.2.P.2.3 Manufacturing Process Development

Direct compression was selected based on API properties and scale-up considerations. A design space was established for critical process parameters.
    `,
  },
  p3: {
    documents: [
      { name: 'Batch_Formula.pdf', type: 'Manufacturing', status: 'processed' },
      { name: 'Process_Description.pdf', type: 'Manufacturing', status: 'processed' },
      { name: 'Process_Validation_Protocol.pdf', type: 'Validation', status: 'processed' },
      { name: 'Equipment_List.pdf', type: 'Manufacturing', status: 'processed' },
    ],
    extractedItems: [
      { label: 'Manufacturer', value: 'TabletCo Inc., New Jersey, USA', confidence: 0.97 },
      { label: 'Batch Size', value: '500,000 tablets', confidence: 0.95 },
      { label: 'Process Type', value: 'Direct compression', confidence: 0.98 },
      { label: 'Blending Time', value: '15-20 minutes', confidence: 0.92 },
      { label: 'Compression Force', value: '8-12 kN', confidence: 0.90 },
      { label: 'Coating Process', value: 'Pan coating, 3% weight gain', confidence: 0.93 },
    ],
    generatedPreview: `
3.2.P.3 MANUFACTURE

3.2.P.3.1 Manufacturer(s)

Name: TabletCo Inc.
Address: 500 Pharmaceutical Drive, Newark, NJ 07102, USA
Responsibility: Manufacture, packaging, and release of drug product

3.2.P.3.2 Batch Formula

| Material | Quantity per Tablet | Quantity per Batch (500,000) |
|----------|--------------------|-----------------------------|
| Amlodipine besylate | 6.93 mg | 3.465 kg |
| MCC | 80.00 mg | 40.00 kg |
| ... | ... | ... |

3.2.P.3.3 Description of Manufacturing Process

Step 1: Blending (15-20 min, V-blender)
Step 2: Compression (8-12 kN, rotary press)
Step 3: Film Coating (pan coater, 3% weight gain)
Step 4: Packaging (blisters, HDPE bottles)
    `,
  },
  p5: {
    documents: [
      { name: 'Product_Specification.pdf', type: 'Specification', status: 'processed' },
      { name: 'Finished_Product_Methods.pdf', type: 'Methods', status: 'processed' },
      { name: 'Batch_Release_Data.xlsx', type: 'Data', status: 'processed' },
    ],
    extractedItems: [
      { label: 'Appearance', value: 'White, round, film-coated tablet', confidence: 0.98 },
      { label: 'Identification', value: 'HPLC-RT, UV spectrum', confidence: 0.96 },
      { label: 'Assay', value: '95.0% - 105.0% of label claim', confidence: 0.97 },
      { label: 'Dissolution', value: 'NLT 80% (Q) in 30 min', confidence: 0.95 },
      { label: 'Content Uniformity', value: 'Meets USP <905>', confidence: 0.94 },
      { label: 'Microbial Limits', value: 'Meets USP <61>/<62>', confidence: 0.93 },
    ],
    generatedPreview: `
3.2.P.5 CONTROL OF DRUG PRODUCT

3.2.P.5.1 Specification

Release and Shelf-Life Specifications:

| Test | Method | Acceptance Criteria |
|------|--------|-------------------|
| Appearance | Visual | White film-coated tablet |
| Identification | HPLC | RT matches reference |
| Assay | HPLC | 95.0% - 105.0% |
| Dissolution | USP Apparatus II | Q ≥ 80% in 30 min |
| Related Substances | HPLC | Total NMT 2.0% |
| Content Uniformity | HPLC | Meets USP <905> |
| Microbial Limits | USP <61>/<62> | Meets criteria |

3.2.P.5.2 Analytical Procedures

All methods are validated per ICH Q2(R1).
    `,
  },
  p7: {
    documents: [
      { name: 'Container_Closure_Description.pdf', type: 'Packaging', status: 'processed' },
      { name: 'Packaging_Drawings.pdf', type: 'Specifications', status: 'processed' },
      { name: 'Extractables_Study.pdf', type: 'Testing', status: 'processed' },
    ],
    extractedItems: [
      { label: 'Primary Container', value: 'PVC/Aluminum blister', confidence: 0.97 },
      { label: 'Blister Film', value: '250 µm PVC', confidence: 0.95 },
      { label: 'Lidding Foil', value: '20 µm Aluminum', confidence: 0.94 },
      { label: 'Secondary Packaging', value: 'Cardboard carton', confidence: 0.98 },
      { label: 'Alternative', value: 'HDPE bottle with CRC', confidence: 0.93 },
      { label: 'Extractables', value: 'No significant extractables', confidence: 0.89 },
    ],
    generatedPreview: `
3.2.P.7 CONTAINER CLOSURE SYSTEM

The drug product is packaged in the following container closure systems:

Primary Packaging Option 1: Blister Pack
• Forming film: 250 µm PVC
• Lidding foil: 20 µm aluminum foil with heat-seal lacquer
• Pack sizes: 14, 28, 30, 56, 90, 100 tablets

Primary Packaging Option 2: HDPE Bottle
• Bottle: High-density polyethylene (HDPE)
• Closure: Child-resistant polypropylene cap
• Desiccant: Silica gel canister
• Pack sizes: 30, 90, 100, 500 tablets

Secondary Packaging:
Cardboard carton with patient information leaflet

The suitability of the container closure system has been demonstrated through stability studies and extractables/leachables assessment.
    `,
  },
  s5: {
    documents: [
      { name: 'Reference_Standard_CoA.pdf', type: 'Certificate', status: 'processed' },
      { name: 'Primary_Reference_Characterization.pdf', type: 'Analytical Report', status: 'processed' },
      { name: 'Working_Standard_Qualification.pdf', type: 'Qualification', status: 'processed' },
    ],
    extractedItems: [
      { label: 'Primary Reference', value: 'USP Amlodipine Besylate RS', confidence: 0.98 },
      { label: 'Lot Number', value: 'R0123456', confidence: 0.97 },
      { label: 'Purity', value: '99.8% (anhydrous basis)', confidence: 0.96 },
      { label: 'Source', value: 'United States Pharmacopeia', confidence: 0.99 },
      { label: 'Working Standard', value: 'WS-AML-001 (qualified against USP RS)', confidence: 0.94 },
      { label: 'Requalification', value: 'Annual requalification per SOP', confidence: 0.91 },
    ],
    generatedPreview: `
3.2.S.5 REFERENCE STANDARDS OR MATERIALS

3.2.S.5.1 Primary Reference Standard

The primary reference standard used for the identification and assay of amlodipine besylate is:

• Name: USP Amlodipine Besylate Reference Standard
• Lot Number: R0123456
• Purity: 99.8% (anhydrous basis)
• Source: United States Pharmacopeia (USP)
• Certificate of Analysis: Attached

3.2.S.5.2 Working Standards

Working Standard WS-AML-001 has been established and qualified against the USP primary reference standard.

Qualification includes:
• Identity by IR spectroscopy
• Purity by HPLC (98.5% minimum)
• Comparison of assay results with primary RS

Requalification is performed annually or when a new lot is prepared, in accordance with internal SOP-QC-045.
    `,
  },
  s6: {
    documents: [
      { name: 'DS_Container_Specification.pdf', type: 'Specification', status: 'processed' },
      { name: 'Polyethylene_Drum_Drawing.pdf', type: 'Technical Drawing', status: 'processed' },
      { name: 'Container_Compatibility_Study.pdf', type: 'Study Report', status: 'processed' },
    ],
    extractedItems: [
      { label: 'Primary Container', value: 'Double polyethylene bags in fiber drum', confidence: 0.97 },
      { label: 'Inner Bag', value: 'LDPE, 0.1 mm thickness', confidence: 0.95 },
      { label: 'Outer Bag', value: 'LDPE, 0.1 mm thickness, heat-sealed', confidence: 0.94 },
      { label: 'Drum', value: 'Fiber drum with steel ring closure', confidence: 0.96 },
      { label: 'Fill Weight', value: '25 kg per drum', confidence: 0.98 },
      { label: 'Compatibility', value: 'No interaction observed over 24 months', confidence: 0.92 },
    ],
    generatedPreview: `
3.2.S.6 CONTAINER CLOSURE SYSTEM

3.2.S.6.1 Description

The drug substance is packaged in a container closure system consisting of:

Primary Container:
• Double low-density polyethylene (LDPE) bags
• Inner bag: 0.1 mm thickness
• Outer bag: 0.1 mm thickness, heat-sealed

Secondary Container:
• Fiber drum with steel ring closure
• Drum capacity: 50 L
• Net fill weight: 25 kg

3.2.S.6.2 Suitability

The suitability of the container closure system has been demonstrated through:

• Compatibility studies: No significant interaction between the drug substance and LDPE over 24 months storage
• Protection from light: Fiber drum provides adequate light protection
• Protection from moisture: Heat-sealed inner bag maintains low moisture environment

The container closure system is consistent with that used for stability studies.
    `,
  },
  p4: {
    documents: [
      { name: 'Excipient_Specifications.pdf', type: 'Specification', status: 'processed' },
      { name: 'Vendor_Qualification_Reports.pdf', type: 'Qualification', status: 'processed' },
      { name: 'Excipient_CoAs.pdf', type: 'Certificates', status: 'processed' },
      { name: 'Novel_Excipient_Package.pdf', type: 'Technical Package', status: 'processed' },
    ],
    extractedItems: [
      { label: 'Microcrystalline Cellulose', value: 'NF grade, Avicel PH-102', confidence: 0.98 },
      { label: 'Lactose Monohydrate', value: 'NF grade, spray-dried', confidence: 0.97 },
      { label: 'Croscarmellose Sodium', value: 'NF grade', confidence: 0.96 },
      { label: 'Magnesium Stearate', value: 'NF grade, vegetable origin', confidence: 0.95 },
      { label: 'Opadry II White', value: 'Proprietary film coating system', confidence: 0.94 },
      { label: 'Novel Excipients', value: 'None - all compendial', confidence: 0.99 },
    ],
    generatedPreview: `
3.2.P.4 CONTROL OF EXCIPIENTS

3.2.P.4.1 Specifications

All excipients used in the manufacture of amlodipine tablets comply with their respective pharmacopoeial monographs:

| Excipient | Grade | Compendium |
|-----------|-------|------------|
| Microcrystalline Cellulose | Avicel PH-102 | NF |
| Lactose Monohydrate | Spray-dried | NF |
| Croscarmellose Sodium | Type A | NF |
| Magnesium Stearate | Vegetable | NF |
| Opadry II White | 85F18422 | Proprietary |

3.2.P.4.2 Analytical Procedures

Excipients are tested according to the current USP-NF monographs. Certificates of Analysis from approved vendors are reviewed for each lot.

3.2.P.4.3 Excipients of Human or Animal Origin

Lactose monohydrate is derived from bovine milk. TSE/BSE certificates are obtained from suppliers confirming compliance with EMEA/410/01.

Magnesium stearate is of vegetable origin.

3.2.P.4.4 Novel Excipients

No novel excipients are used in this formulation.
    `,
  },
  p6: {
    documents: [
      { name: 'DP_Reference_Standard_CoA.pdf', type: 'Certificate', status: 'processed' },
      { name: 'Impurity_Reference_Standards.pdf', type: 'Certificate', status: 'processed' },
      { name: 'Working_Standard_Protocol.pdf', type: 'Protocol', status: 'processed' },
    ],
    extractedItems: [
      { label: 'Assay Reference', value: 'USP Amlodipine Besylate RS', confidence: 0.98 },
      { label: 'Impurity A Standard', value: 'In-house qualified', confidence: 0.95 },
      { label: 'Impurity B Standard', value: 'In-house qualified', confidence: 0.94 },
      { label: 'Dissolution Standard', value: 'Same as assay RS', confidence: 0.97 },
      { label: 'System Suitability', value: 'USP Resolution Mixture', confidence: 0.93 },
      { label: 'Storage Conditions', value: '2-8°C, protected from light', confidence: 0.96 },
    ],
    generatedPreview: `
3.2.P.6 REFERENCE STANDARDS OR MATERIALS

3.2.P.6.1 Reference Standards

The following reference standards are used for drug product testing:

Assay and Content Uniformity:
• USP Amlodipine Besylate Reference Standard
• Current lot as per USP catalog
• Stored at 2-8°C, protected from light

Related Substances:
• Impurity A: In-house qualified standard (purity 98.5%)
• Impurity B: In-house qualified standard (purity 97.8%)
• Characterized by NMR, MS, and elemental analysis

Dissolution Testing:
• USP Amlodipine Besylate Reference Standard (same as assay)

System Suitability:
• USP Amlodipine Related Compound Mixture
• Used to verify chromatographic resolution

3.2.P.6.2 Qualification

All in-house reference standards are qualified against pharmacopoeial reference standards and requalified annually.
    `,
  },
};

// Default mock data for sections not specifically defined
const DEFAULT_MOCK = {
  documents: [
    { name: 'Source_Document_1.pdf', type: 'Technical Document', status: 'processed' },
    { name: 'Supporting_Data.pdf', type: 'Data Package', status: 'processed' },
  ],
  extractedItems: [
    { label: 'Key Parameter 1', value: 'Extracted value', confidence: 0.92 },
    { label: 'Key Parameter 2', value: 'Extracted value', confidence: 0.88 },
    { label: 'Key Parameter 3', value: 'Extracted value', confidence: 0.85 },
  ],
  generatedPreview: 'Preview content for this section would be generated based on uploaded documents and AI extraction.',
};

export default function SectionPreview() {
  const location = useLocation();
  const navigate = useNavigate();
  const section = location.state?.section;
  const [step, setStep] = useState<'upload' | 'extract' | 'generate'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!section) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Section not found</p>
          <Link to="/" className="text-primary-600 hover:underline">Return to Home</Link>
        </div>
      </div>
    );
  }

  const mockData = MOCK_SECTION_DATA[section.id] || DEFAULT_MOCK;
  const Icon = section.icon;

  const simulateProcessing = (nextStep: 'extract' | 'generate') => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setStep(nextStep);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} className="text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Icon size={20} className="text-amber-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-500">{section.number}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      Preview Mode
                    </span>
                  </div>
                  <h1 className="font-semibold text-gray-900">{section.title}</h1>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-center gap-8">
            {[
              { id: 'upload', label: 'Upload Documents', icon: Upload },
              { id: 'extract', label: 'AI Extraction', icon: Sparkles },
              { id: 'generate', label: 'Generate Section', icon: FileText },
            ].map((s, i) => (
              <div key={s.id} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step === s.id
                      ? 'bg-primary-600 text-white'
                      : ['upload'].indexOf(step) < ['upload', 'extract', 'generate'].indexOf(s.id)
                      ? 'bg-gray-200 text-gray-400'
                      : 'bg-green-100 text-green-600'
                  }`}
                >
                  {['upload', 'extract', 'generate'].indexOf(step) > ['upload', 'extract', 'generate'].indexOf(s.id) ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <s.icon size={16} />
                  )}
                </div>
                <span className={`text-sm font-medium ${step === s.id ? 'text-gray-900' : 'text-gray-500'}`}>
                  {s.label}
                </span>
                {i < 2 && <div className="w-16 h-0.5 bg-gray-200 ml-3" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Demo Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-amber-800 font-medium">Preview Mode - Demo Data</p>
            <p className="text-amber-700 text-sm mt-1">
              This section is under development. You're viewing a demonstration with mock data to preview the workflow.
              For a fully functional experience, try <Link to="/stability/ds" className="underline font-medium">3.2.S.7 Drug Substance Stability</Link> or <Link to="/stability/dp" className="underline font-medium">3.2.P.8 Drug Product Stability</Link>.
            </p>
          </div>
        </div>

        {/* Step Content */}
        {step === 'upload' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Source Documents</h2>
              <p className="text-gray-600 text-sm mb-6">
                Upload documents relevant to {section.number} {section.title}. The AI will extract key information automatically.
              </p>

              {/* Mock uploaded documents */}
              <div className="space-y-3 mb-6">
                {mockData.documents.map((doc, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <FileText className="text-gray-400" size={20} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                      <p className="text-xs text-gray-500">{doc.type}</p>
                    </div>
                    <CheckCircle2 className="text-green-500" size={18} />
                  </div>
                ))}
              </div>

              {/* Upload zone (mock) */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="mx-auto text-gray-400 mb-3" size={32} />
                <p className="text-gray-600 text-sm">Drag and drop files here, or click to browse</p>
                <p className="text-gray-400 text-xs mt-2">PDF, Word, Excel up to 50MB each</p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => simulateProcessing('extract')}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    Run Extraction
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'extract' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Extracted Information</h2>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  {mockData.extractedItems.length} items extracted
                </span>
              </div>

              <div className="space-y-3">
                {mockData.extractedItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-xs text-gray-500">{item.label}</p>
                      <p className="text-sm font-medium text-gray-900">{item.value}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            item.confidence >= 0.9 ? 'bg-green-500' : item.confidence >= 0.8 ? 'bg-amber-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${item.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-10">{Math.round(item.confidence * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep('upload')}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back to Documents
              </button>
              <button
                onClick={() => simulateProcessing('generate')}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Generate Section
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'generate' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Generated {section.number}</h2>
                <div className="flex items-center gap-2">
                  <button className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 border border-gray-300 rounded-lg">
                    <Eye size={16} />
                    Preview
                  </button>
                  <button className="inline-flex items-center gap-1.5 text-sm text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-lg">
                    <Download size={16} />
                    Download
                  </button>
                </div>
              </div>

              {/* Generated preview */}
              <div className="bg-gray-50 rounded-lg p-6 font-mono text-sm whitespace-pre-wrap text-gray-700 border border-gray-200 max-h-[500px] overflow-y-auto">
                {mockData.generatedPreview}
              </div>

              <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  Generated just now
                </span>
                <span>•</span>
                <span>~2,400 tokens used</span>
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep('extract')}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back to Extraction
              </button>
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 bg-gray-100 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-200"
              >
                Done - Return to Home
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
