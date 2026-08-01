import api from '../lib/api';

export const getConectaMeta = () => api.get('/conecta/meta');
export const getConectaUnreadCount = () => api.get('/conecta/unread-count');
export const getConectaCases = (params = {}) => api.get('/conecta/cases', { params });
export const getConectaStats = () => api.get('/conecta/stats');
export const createConectaCase = (data) => api.post('/conecta/cases', data);
export const likeConectaCase = (caseId) => api.post(`/conecta/cases/${caseId}/like`);
export const commentConectaCase = (caseId, data) => api.post(`/conecta/cases/${caseId}/comments`, data);
export const likeConectaComment = (caseId, commentId) => api.post(`/conecta/cases/${caseId}/comments/${commentId}/like`);

export const uploadConectaImage = (file, preferredName = '') => {
  const formData = new FormData();
  formData.append('image', file);
  if (preferredName) {
    formData.append('preferredName', preferredName);
  }
  return api.post('/conecta/uploads/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
