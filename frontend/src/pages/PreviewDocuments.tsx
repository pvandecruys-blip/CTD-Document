import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Eye,
  Filter,
} from 'lucide-react';

// Section-specific document types and mock documents
const SECTION_DOCUMENTS: Record<string, {
  types: string[];
  documents: Array<{
    id: string;
    name: string;
    type: string;
    size: string;
    uploadedAt: string;
    status: 'processed' | 'pending' | 'error';
  }>;
}> = {
  s1: {
    types: ['Specification', 'Certificate', 'Technical Report', 'Nomenclature'],
    documents: [
      { id: '1', name: 'API_Specification_v3.2.pdf', type: 'Specification', size: '2.4 MB', uploadedAt: '2025-01-28', status: 'processed' },
      { id: '2', name: 'Structure_Elucidation_Report.pdf', type: 'Technical Report', size: '8.1 MB', uploadedAt: '2025-01-27', status: 'processed' },
      { id: '3', name: 'Nomenclature_Certificate.pdf', type: 'Certificate', size: '0.5 MB', uploadedAt: '2025-01-26', status: 'processed' },
      { id: '4', name: 'CAS_Registry_Confirmation.pdf', type: 'Certificate', size: '0.2 MB', uploadedAt: '2025-01-25', status: 'processed' },
      { id: '5', name: 'Physical_Properties_Data.xlsx', type: 'Technical Report', size: '1.1 MB', uploadedAt: '2025-01-24', status: 'processed' },
    ],
  },
  s2: {
    types: ['Process Description', 'Batch Records', 'Validation Report', 'Flow Diagram'],
    documents: [
      { id: '1', name: 'Manufacturing_Process_Description.pdf', type: 'Process Description', size: '5.2 MB', uploadedAt: '2025-01-30', status: 'processed' },
      { id: '2', name: 'Batch_Records_Validation.pdf', type: 'Batch Records', size: '12.4 MB', uploadedAt: '2025-01-29', status: 'processed' },
      { id: '3', name: 'Process_Flow_Diagram.pdf', type: 'Flow Diagram', size: '1.8 MB', uploadedAt: '2025-01-28', status: 'processed' },
      { id: '4', name: 'Critical_Process_Parameters.xlsx', type: 'Process Description', size: '0.8 MB', uploadedAt: '2025-01-27', status: 'processed' },
      { id: '5', name: 'Process_Validation_Protocol.pdf', type: 'Validation Report', size: '3.2 MB', uploadedAt: '2025-01-26', status: 'processed' },
      { id: '6', name: 'IPC_Testing_Results.pdf', type: 'Validation Report', size: '2.1 MB', uploadedAt: '2025-01-25', status: 'pending' },
    ],
  },
  s3: {
    types: ['Spectral Data', 'Analytical Report', 'Impurity Profile'],
    documents: [
      { id: '1', name: 'Structure_Elucidation_Package.pdf', type: 'Analytical Report', size: '15.3 MB', uploadedAt: '2025-01-29', status: 'processed' },
      { id: '2', name: 'NMR_Spectra_Complete.pdf', type: 'Spectral Data', size: '45.2 MB', uploadedAt: '2025-01-28', status: 'processed' },
      { id: '3', name: 'Mass_Spec_Analysis.pdf', type: 'Spectral Data', size: '8.7 MB', uploadedAt: '2025-01-27', status: 'processed' },
      { id: '4', name: 'IR_UV_Spectra.pdf', type: 'Spectral Data', size: '12.1 MB', uploadedAt: '2025-01-26', status: 'processed' },
      { id: '5', name: 'Impurity_Profile_Report.pdf', type: 'Impurity Profile', size: '6.4 MB', uploadedAt: '2025-01-25', status: 'processed' },
    ],
  },
  s4: {
    types: ['Specification', 'Analytical Methods', 'Validation Report', 'Batch Analysis'],
    documents: [
      { id: '1', name: 'Drug_Substance_Specification.pdf', type: 'Specification', size: '1.2 MB', uploadedAt: '2025-01-28', status: 'processed' },
      { id: '2', name: 'Analytical_Methods_Package.pdf', type: 'Analytical Methods', size: '8.5 MB', uploadedAt: '2025-01-27', status: 'processed' },
      { id: '3', name: 'Method_Validation_Report.pdf', type: 'Validation Report', size: '12.3 MB', uploadedAt: '2025-01-26', status: 'processed' },
      { id: '4', name: 'Batch_Analysis_Data.xlsx', type: 'Batch Analysis', size: '2.1 MB', uploadedAt: '2025-01-25', status: 'processed' },
    ],
  },
  s5: {
    types: ['Certificate of Analysis', 'Characterization Report', 'Qualification Protocol'],
    documents: [
      { id: '1', name: 'Reference_Standard_CoA.pdf', type: 'Certificate of Analysis', size: '0.8 MB', uploadedAt: '2025-01-26', status: 'processed' },
      { id: '2', name: 'Primary_Reference_Characterization.pdf', type: 'Characterization Report', size: '5.2 MB', uploadedAt: '2025-01-25', status: 'processed' },
      { id: '3', name: 'Working_Standard_Qualification.pdf', type: 'Qualification Protocol', size: '2.1 MB', uploadedAt: '2025-01-24', status: 'processed' },
    ],
  },
  s6: {
    types: ['Specification', 'Technical Drawing', 'Compatibility Study'],
    documents: [
      { id: '1', name: 'DS_Container_Specification.pdf', type: 'Specification', size: '1.5 MB', uploadedAt: '2025-01-24', status: 'processed' },
      { id: '2', name: 'Polyethylene_Drum_Drawing.pdf', type: 'Technical Drawing', size: '3.2 MB', uploadedAt: '2025-01-23', status: 'processed' },
      { id: '3', name: 'Container_Compatibility_Study.pdf', type: 'Compatibility Study', size: '4.8 MB', uploadedAt: '2025-01-22', status: 'processed' },
    ],
  },
  p1: {
    types: ['Formulation', 'Composition Table', 'Product Description'],
    documents: [
      { id: '1', name: 'Product_Description.pdf', type: 'Product Description', size: '1.8 MB', uploadedAt: '2025-01-29', status: 'processed' },
      { id: '2', name: 'Formulation_Development.pdf', type: 'Formulation', size: '4.2 MB', uploadedAt: '2025-01-28', status: 'processed' },
      { id: '3', name: 'Composition_Table.xlsx', type: 'Composition Table', size: '0.5 MB', uploadedAt: '2025-01-27', status: 'processed' },
    ],
  },
  p2: {
    types: ['Development Report', 'QbD Study', 'Dissolution Study', 'Optimization'],
    documents: [
      { id: '1', name: 'Pharmaceutical_Development_Report.pdf', type: 'Development Report', size: '18.5 MB', uploadedAt: '2025-01-30', status: 'processed' },
      { id: '2', name: 'QbD_Risk_Assessment.pdf', type: 'QbD Study', size: '6.2 MB', uploadedAt: '2025-01-29', status: 'processed' },
      { id: '3', name: 'Formulation_Optimization.pdf', type: 'Optimization', size: '8.1 MB', uploadedAt: '2025-01-28', status: 'processed' },
      { id: '4', name: 'Dissolution_Method_Development.pdf', type: 'Dissolution Study', size: '4.5 MB', uploadedAt: '2025-01-27', status: 'processed' },
    ],
  },
  p3: {
    types: ['Batch Formula', 'Process Description', 'Validation Report', 'Equipment List'],
    documents: [
      { id: '1', name: 'Batch_Formula.pdf', type: 'Batch Formula', size: '1.2 MB', uploadedAt: '2025-01-29', status: 'processed' },
      { id: '2', name: 'Manufacturing_Process_Description.pdf', type: 'Process Description', size: '5.8 MB', uploadedAt: '2025-01-28', status: 'processed' },
      { id: '3', name: 'Process_Validation_Report.pdf', type: 'Validation Report', size: '15.2 MB', uploadedAt: '2025-01-27', status: 'processed' },
      { id: '4', name: 'Equipment_Qualification.pdf', type: 'Equipment List', size: '3.4 MB', uploadedAt: '2025-01-26', status: 'processed' },
    ],
  },
  p4: {
    types: ['Specification', 'Vendor Qualification', 'Certificate of Analysis'],
    documents: [
      { id: '1', name: 'Excipient_Specifications.pdf', type: 'Specification', size: '2.8 MB', uploadedAt: '2025-01-27', status: 'processed' },
      { id: '2', name: 'Vendor_Qualification_Reports.pdf', type: 'Vendor Qualification', size: '8.5 MB', uploadedAt: '2025-01-26', status: 'processed' },
      { id: '3', name: 'Excipient_CoAs_Package.pdf', type: 'Certificate of Analysis', size: '4.2 MB', uploadedAt: '2025-01-25', status: 'processed' },
      { id: '4', name: 'TSE_BSE_Certificates.pdf', type: 'Certificate of Analysis', size: '1.1 MB', uploadedAt: '2025-01-24', status: 'processed' },
    ],
  },
  p5: {
    types: ['Specification', 'Analytical Methods', 'Validation Report', 'Batch Data'],
    documents: [
      { id: '1', name: 'Product_Specification.pdf', type: 'Specification', size: '1.5 MB', uploadedAt: '2025-01-28', status: 'processed' },
      { id: '2', name: 'Finished_Product_Methods.pdf', type: 'Analytical Methods', size: '9.2 MB', uploadedAt: '2025-01-27', status: 'processed' },
      { id: '3', name: 'Method_Validation_Package.pdf', type: 'Validation Report', size: '14.5 MB', uploadedAt: '2025-01-26', status: 'processed' },
      { id: '4', name: 'Batch_Release_Data.xlsx', type: 'Batch Data', size: '2.8 MB', uploadedAt: '2025-01-25', status: 'processed' },
    ],
  },
  p6: {
    types: ['Certificate of Analysis', 'Qualification Report', 'Protocol'],
    documents: [
      { id: '1', name: 'DP_Reference_Standard_CoA.pdf', type: 'Certificate of Analysis', size: '0.9 MB', uploadedAt: '2025-01-25', status: 'processed' },
      { id: '2', name: 'Impurity_Reference_Standards.pdf', type: 'Certificate of Analysis', size: '2.1 MB', uploadedAt: '2025-01-24', status: 'processed' },
      { id: '3', name: 'Working_Standard_Protocol.pdf', type: 'Protocol', size: '1.5 MB', uploadedAt: '2025-01-23', status: 'processed' },
    ],
  },
  p7: {
    types: ['Specification', 'Technical Drawing', 'Extractables Study', 'Compatibility'],
    documents: [
      { id: '1', name: 'Container_Closure_Description.pdf', type: 'Specification', size: '2.2 MB', uploadedAt: '2025-01-26', status: 'processed' },
      { id: '2', name: 'Blister_Pack_Drawings.pdf', type: 'Technical Drawing', size: '5.8 MB', uploadedAt: '2025-01-25', status: 'processed' },
      { id: '3', name: 'Extractables_Leachables_Study.pdf', type: 'Extractables Study', size: '8.5 MB', uploadedAt: '2025-01-24', status: 'processed' },
      { id: '4', name: 'Packaging_Compatibility.pdf', type: 'Compatibility', size: '3.2 MB', uploadedAt: '2025-01-23', status: 'processed' },
    ],
  },
};

export default function PreviewDocuments() {
  const location = useLocation();
  const sectionId = location.pathname.split('/')[2] || 's1';
  const sectionData = SECTION_DOCUMENTS[sectionId] || SECTION_DOCUMENTS['s1'];
  const [filter, setFilter] = useState<string>('all');

  const filteredDocs = filter === 'all'
    ? sectionData.documents
    : sectionData.documents.filter(d => d.type === filter);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
        return <CheckCircle2 size={16} className="text-green-500" />;
      case 'pending':
        return <AlertTriangle size={16} className="text-amber-500" />;
      default:
        return <AlertTriangle size={16} className="text-red-500" />;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload and manage source documents for this section
          </p>
        </div>
        <button className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700">
          <Upload size={16} />
          Upload Documents
        </button>
      </div>

      {/* Demo Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-center gap-2">
        <AlertTriangle className="text-amber-500" size={16} />
        <p className="text-amber-700 text-sm">
          <strong>Preview Mode</strong> - This is a demonstration with mock data.
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4">
        <Filter size={16} className="text-gray-400" />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Types</option>
          {sectionData.types.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500 ml-2">
          {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredDocs.map((doc) => (
              <tr key={doc.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FileText size={20} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">{doc.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{doc.type}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{doc.size}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{doc.uploadedAt}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {getStatusIcon(doc.status)}
                    <span className="text-xs text-gray-600 capitalize">{doc.status}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-1 hover:bg-gray-100 rounded">
                      <Eye size={16} className="text-gray-400" />
                    </button>
                    <button className="p-1 hover:bg-gray-100 rounded">
                      <Trash2 size={16} className="text-gray-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Upload Zone */}
      <div className="mt-6 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer">
        <Upload className="mx-auto text-gray-400 mb-3" size={32} />
        <p className="text-gray-600 text-sm">Drag and drop files here, or click to browse</p>
        <p className="text-gray-400 text-xs mt-2">PDF, Word, Excel up to 50MB each</p>
      </div>
    </div>
  );
}
