import api from '../lib/api';

export function createDemoSchool(payload) {
  return api.post('/public/demo', payload, { timeout: 180000 });
}
