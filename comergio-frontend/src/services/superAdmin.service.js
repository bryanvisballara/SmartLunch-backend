import api from '../lib/api';

export const getSuperAdminSummary = () => api.get('/super-admin/summary');

export const createSuperAdminSchool = (data) => api.post('/super-admin/schools', data);

export const updateSuperAdminSchoolSettings = (schoolId, data) => (
  api.patch(`/super-admin/schools/${encodeURIComponent(schoolId)}/settings`, data)
);

export const deleteSuperAdminSchool = (schoolId) => (
  api.delete(`/super-admin/schools/${encodeURIComponent(schoolId)}`)
);

export const getSuperAdminRectoriaUser = (schoolId) => (
  api.get(`/super-admin/schools/${encodeURIComponent(schoolId)}/rectoria`)
);

export const saveSuperAdminRectoriaUser = (schoolId, data) => (
  api.post(`/super-admin/schools/${encodeURIComponent(schoolId)}/rectoria`, data)
);

export const getDianConfig = () => api.get('/super-admin/dian/config');

export const saveDianConfig = (data) => api.put('/super-admin/dian/config', data);

export const uploadDianCertificate = (file, password) => {
  const formData = new FormData();
  formData.append('certificate', file);
  if (password) {
    formData.append('password', password);
  }
  return api.post('/super-admin/dian/config/certificate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const listDianInvoices = (params = {}) => api.get('/super-admin/dian/invoices', { params });

export const createDianInvoice = (data) => api.post('/super-admin/dian/invoices', data);

export const sendDianInvoice = (invoiceId) => (
  api.post(`/super-admin/dian/invoices/${encodeURIComponent(invoiceId)}/send`)
);

export const downloadDianInvoiceXmlUrl = (invoiceId) => (
  `/super-admin/dian/invoices/${encodeURIComponent(invoiceId)}/xml`
);