const SalesProspect = require('../models/salesProspect.model');

const SALES_STAGE_TEMPLATES = [
  { key: 'intento-contacto', code: 'E1', label: 'Intento de contacto' },
  { key: 'contactado', code: 'E2', label: 'Contactado' },
  { key: 'agendado', code: 'E3', label: 'Agendado' },
  { key: 'seguimiento-post-reunion', code: 'E4', label: 'Seguimiento post reunión' },
  { key: 'contratado', code: 'E5', label: 'Contratado' },
  { key: 'en-produccion', code: 'E6', label: 'En producción' },
];

function getStageIndex(stageKey) {
  return SALES_STAGE_TEMPLATES.findIndex((stage) => stage.key === stageKey);
}

function buildDefaultStages(currentStageKey = 'intento-contacto', existingStages = []) {
  const existingByKey = new Map((Array.isArray(existingStages) ? existingStages : []).map((stage) => [String(stage?.key || ''), stage]));
  const currentIndex = Math.max(0, getStageIndex(currentStageKey));

  return SALES_STAGE_TEMPLATES.map((template, index) => {
    const existing = existingByKey.get(template.key) || {};
    const isConfirmed = index < currentIndex
      || (currentStageKey === 'en-produccion' && index === currentIndex);

    return {
      key: template.key,
      label: template.label,
      confirmed: isConfirmed,
      inProgress: Boolean(index === currentIndex && currentStageKey !== 'en-produccion'),
      updatedAt: existing.updatedAt || new Date(),
      confirmedAt: isConfirmed ? (existing.confirmedAt || new Date()) : null,
    };
  });
}

function getStageTemplate(stageKey) {
  return SALES_STAGE_TEMPLATES.find((stage) => stage.key === stageKey) || SALES_STAGE_TEMPLATES[0];
}

/**
 * Creates (or returns) a CRM prospect when someone starts the 7-day demo flow.
 */
async function ensureSalesProspectFromDemoLead(lead) {
  const leadId = lead?._id;
  if (!leadId) {
    return null;
  }

  const existing = await SalesProspect.findOne({ demoLeadId: leadId, deletedAt: null });
  if (existing) {
    return existing;
  }

  const stageKey = 'intento-contacto';
  const stage = getStageTemplate(stageKey);

  return SalesProspect.create({
    demoLeadId: leadId,
    schoolName: String(lead.schoolName || '').trim(),
    city: String(lead.city || '').trim(),
    address: '',
    contactMethod: 'demo_web',
    contactName: String(lead.contactName || '').trim(),
    contactEmail: String(lead.email || '').trim().toLowerCase(),
    contactPhone: String(lead.phone || '').trim(),
    currentStageKey: stageKey,
    salesStages: buildDefaultStages(stageKey),
    salesEvents: [{
      title: 'Demo de 7 días solicitada',
      notes: 'Registro automático desde comergio.com (Probar 7 días sin costo).',
      stageKey: stage.key,
      stageLabel: stage.label,
      responsible: 'Sistema',
      inProgress: true,
      createdByName: 'Sistema',
    }],
  });
}

module.exports = {
  ensureSalesProspectFromDemoLead,
  SALES_STAGE_TEMPLATES,
};
