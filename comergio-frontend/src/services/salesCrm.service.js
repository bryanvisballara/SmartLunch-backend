import api from '../lib/api';

const basePath = '/super-admin/sales-crm';

export const getSalesCrm = (params = {}) => api.get(basePath, { params });
export const getSalesProspect = (prospectId) => api.get(`${basePath}/${prospectId}`);
export const createSalesProspect = (data) => api.post(basePath, data);
export const updateSalesProspect = (prospectId, data) => api.patch(`${basePath}/${prospectId}`, data);
export const deleteSalesProspect = (prospectId) => api.delete(`${basePath}/${prospectId}`);
export const setSalesProspectStage = (prospectId, stageKey, data = {}) => (
  api.patch(`${basePath}/${prospectId}/stages/${encodeURIComponent(stageKey)}`, data)
);
export const transitionSalesProspectStage = (prospectId, data) => (
  api.patch(`${basePath}/${prospectId}/stage-transition`, data)
);
export const withdrawSalesProspect = (prospectId, data) => (
  api.patch(`${basePath}/${prospectId}/withdraw`, data)
);
export const startSalesProspectEmailNurture = (prospectId) => (
  api.patch(`${basePath}/${prospectId}/start-email-nurture`, {})
);
export const markSalesProspectEmailNurtureResponse = (prospectId, data = {}) => (
  api.patch(`${basePath}/${prospectId}/email-nurture/response`, data)
);
export const getSalesNurtureEmailTemplates = () => api.get(`${basePath}/nurture-email-templates`);
export const updateSalesNurtureEmailTemplate = (sequence, data) => (
  api.patch(`${basePath}/nurture-email-templates/${sequence}`, data)
);
export const sendSalesProspectNurtureEmail = (prospectId, sequence, data = {}) => (
  api.post(`${basePath}/${prospectId}/nurture-emails/${sequence}/send`, data)
);
export const getSalesProspectNurtureEmailPreview = (prospectId, sequence) => (
  api.get(`${basePath}/${prospectId}/nurture-emails/${sequence}/preview`)
);
export const createSalesEvent = (prospectId, data) => api.post(`${basePath}/${prospectId}/events`, data);
export const updateSalesEvent = (prospectId, eventId, data) => (
  api.patch(`${basePath}/${prospectId}/events/${eventId}`, data)
);
export const deleteSalesEvent = (prospectId, eventId) => (
  api.delete(`${basePath}/${prospectId}/events/${eventId}`)
);
export const getSalesAgendaSettings = () => api.get(`${basePath}/agenda-settings`);
export const saveSalesAgendaSettings = (data) => api.put(`${basePath}/agenda-settings`, data);
export const blockSalesAgendaSlot = (data) => api.post(`${basePath}/agenda-settings/blocks`, data);
export const unblockSalesAgendaSlot = (blockId) => api.delete(`${basePath}/agenda-settings/blocks/${blockId}`);
export const setSalesAgendaClosedDate = (date, closed) => (
  api.post(`${basePath}/agenda-settings/closed-dates`, { date, closed })
);

export const getSalesContactTemplates = () => api.get(`${basePath}/contact-templates`);
export const createSalesContactTemplate = (data) => api.post(`${basePath}/contact-templates`, data);
export const updateSalesContactTemplate = (templateId, data) => (
  api.patch(`${basePath}/contact-templates/${templateId}`, data)
);
export const deleteSalesContactTemplate = (templateId) => (
  api.delete(`${basePath}/contact-templates/${templateId}`)
);
