import api from '../lib/api';

export const getSuperAdminSummary = () => api.get('/super-admin/summary');

export const updateSuperAdminSchoolSettings = (schoolId, data) => (
  api.patch(`/super-admin/schools/${encodeURIComponent(schoolId)}/settings`, data)
);

export const deleteSuperAdminSchool = (schoolId) => (
  api.delete(`/super-admin/schools/${encodeURIComponent(schoolId)}`)
);