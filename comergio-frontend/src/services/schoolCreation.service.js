import api from '../lib/api';

export const completeSchoolCreation = (data) => api.post('/school-creation/complete', data);
