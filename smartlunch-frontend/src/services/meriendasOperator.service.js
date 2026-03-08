import api from '../lib/api';

export const getMeriendaOperatorSubscriptions = (params = {}) =>
  api.get('/meriendas/operator/subscriptions', { params });

export const saveMeriendaOperatorIntake = (subscriptionId, data) =>
  api.put(`/meriendas/operator/intake/${subscriptionId}`, data);
