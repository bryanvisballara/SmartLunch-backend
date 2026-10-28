const express = require('express');
const mongoose = require('mongoose');

const SalesProspect = require('../models/salesProspect.model');
const SalesContactTemplate = require('../models/salesContactTemplate.model');
const {
  getSalesAgendaSettings,
  saveSalesAgendaWindows,
  addSalesAgendaBlock,
  removeSalesAgendaBlock,
  setSalesAgendaClosedDate,
} = require('../services/salesAgenda.service');
const {
  SALES_NURTURE_MAX_SEQUENCE,
  SALES_NURTURE_SENDER_EMAIL,
  buildEmailNurtureCatalog,
  nurtureEmailsSentCount,
  getSalesNurtureEmailPreviewForProspect,
  sendSalesNurtureEmailForProspect,
} = require('../services/salesCrmEmails.service');
const {
  listSalesNurtureEmailTemplates,
  updateSalesNurtureEmailTemplate,
  SALES_NURTURE_SENDER_NAME,
} = require('../services/salesNurtureTemplate.service');
const { bogotaDayNumber } = require('../services/demoDailyFeed.service');

const router = express.Router();

const salesStageTemplates = [
  { key: 'creado', code: 'E1', label: 'Creado' },
  { key: 'intento-contacto', code: 'E2', label: 'Intento de contacto' },
  { key: 'contactado', code: 'E3', label: 'Contactado' },
  { key: 'agendado', code: 'E4', label: 'Agendado' },
  { key: 'seguimiento-post-reunion', code: 'E5', label: 'Seguimiento post reunión' },
  { key: 'contratado', code: 'E6', label: 'Contratado' },
  { key: 'en-produccion', code: 'E7', label: 'En producción' },
];

const contactMethodLabels = {
  instagram: 'Instagram',
  meta: 'Meta',
  whatsapp: 'WhatsApp',
  google: 'Google',
  recomendado: 'Recomendado',
  llamada: 'Llamada',
  demo_web: 'Demo web (7 días)',
};

const appointmentTypeLabels = {
  virtual: 'Cita virtual',
  phone: 'Llamada telefónica',
  in_person: 'Cita presencial',
};

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function normalizeOptionalContactField(value) {
  const text = normalizeText(value);
  if (!text || text === '-' || text === '—') {
    return '';
  }
  return text;
}

function normalizeOptionalContactEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email === '-' || email === '—') {
    return '';
  }
  return isValidEmail(email) ? email : '';
}

const SALES_PROSPECT_STATUS_WITHDRAWN = 'withdrawn';
const SALES_PROSPECT_STATUS_EMAIL_NURTURE = 'email_nurture';

function isWithdrawnProspect(prospect) {
  return normalizeText(prospect?.salesStatus).toLowerCase() === SALES_PROSPECT_STATUS_WITHDRAWN;
}

function isEmailNurtureProspect(prospect) {
  return normalizeText(prospect?.salesStatus).toLowerCase() === SALES_PROSPECT_STATUS_EMAIL_NURTURE;
}

async function serializeEmailNurture(prospect) {
  const source = prospect?.emailNurture || {};
  const emailsSent = nurtureEmailsSentCount(prospect);
  const dayIndex = source.startedAt
    ? bogotaDayNumber(new Date()) - bogotaDayNumber(source.startedAt) + 1
    : 0;
  return {
    startedAt: source.startedAt || null,
    startedByName: normalizeText(source.startedByName),
    respondedAt: source.respondedAt || null,
    respondedByName: normalizeText(source.respondedByName),
    emailsSent,
    maxEmails: SALES_NURTURE_MAX_SEQUENCE,
    pipelineDay: Math.max(0, dayIndex),
    canWithdraw: emailsSent >= SALES_NURTURE_MAX_SEQUENCE || dayIndex >= SALES_NURTURE_MAX_SEQUENCE,
    senderEmail: SALES_NURTURE_SENDER_EMAIL,
    senderName: SALES_NURTURE_SENDER_NAME,
    emails: await buildEmailNurtureCatalog(prospect),
  };
}

function normalizeStageKey(value) {
  const requestedKey = normalizeText(value).toLowerCase();
  return salesStageTemplates.some((stage) => stage.key === requestedKey)
    ? requestedKey
    : salesStageTemplates[0].key;
}

function getStageIndex(stageKey) {
  return salesStageTemplates.findIndex((stage) => stage.key === stageKey);
}

function getStageTemplate(stageKey) {
  return salesStageTemplates.find((stage) => stage.key === stageKey) || salesStageTemplates[0];
}

function buildDefaultStages(currentStageKey = 'creado', existingStages = []) {
  const existingByKey = new Map((Array.isArray(existingStages) ? existingStages : []).map((stage) => [String(stage?.key || ''), stage]));
  const currentIndex = Math.max(0, getStageIndex(currentStageKey));

  return salesStageTemplates.map((template, index) => {
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

function normalizeContactMethod(value) {
  const raw = normalizeText(value).toLowerCase();
  return Object.prototype.hasOwnProperty.call(contactMethodLabels, raw) ? raw : '';
}

function buildProspectPayload(body = {}, existing = null) {
  const contactMethod = normalizeContactMethod(body.contactMethod ?? existing?.contactMethod);
  return {
    schoolName: normalizeText(body.schoolName ?? existing?.schoolName),
    city: normalizeText(body.city ?? existing?.city),
    address: normalizeText(body.address ?? existing?.address),
    contactMethod,
    contactName: normalizeOptionalContactField(body.contactName ?? existing?.contactName),
    contactEmail: normalizeOptionalContactEmail(body.contactEmail ?? existing?.contactEmail),
    contactPhone: normalizeOptionalContactField(body.contactPhone ?? existing?.contactPhone),
    instagram: normalizeOptionalContactField(body.instagram ?? existing?.instagram),
    website: normalizeOptionalContactField(body.website ?? existing?.website),
    currentStageKey: normalizeStageKey(body.currentStageKey ?? body.stageKey ?? existing?.currentStageKey),
  };
}

async function serializeProspect(prospect) {
  const source = prospect.toObject?.() || prospect;
  const emailNurture = (isEmailNurtureProspect(source) || source.emailNurture?.startedAt)
    ? await serializeEmailNurture(source)
    : null;
  return {
    id: String(source._id),
    _id: String(source._id),
    schoolName: source.schoolName || '',
    city: source.city || '',
    address: source.address || '',
    contactMethod: source.contactMethod || '',
    contactMethodLabel: contactMethodLabels[source.contactMethod] || source.contactMethod || '',
    contactName: source.contactName || '',
    contactEmail: source.contactEmail || '',
    contactPhone: source.contactPhone || '',
    instagram: source.instagram || '',
    website: source.website || '',
    currentStageKey: source.currentStageKey || 'creado',
    salesStatus: source.salesStatus || 'active',
    withdrawnAt: source.withdrawnAt || null,
    withdrawnReason: source.withdrawnReason || '',
    withdrawnFromStageKey: source.withdrawnFromStageKey || '',
    emailNurture,
    salesStages: source.salesStages || [],
    salesEvents: (source.salesEvents || []).map((event) => ({
      ...event,
      _id: String(event._id || ''),
      id: String(event._id || ''),
    })),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function normalizeAppointmentType(value) {
  const rawType = normalizeText(value).toLowerCase().replace(/-/g, '_');
  if (['virtual', 'cita_virtual'].includes(rawType)) return 'virtual';
  if (['phone', 'llamada', 'llamada_telefonica', 'telefono'].includes(rawType)) return 'phone';
  if (['in_person', 'presencial', 'cita_presencial'].includes(rawType)) return 'in_person';
  return '';
}

function buildAppointmentPayload(body = {}) {
  const type = normalizeAppointmentType(body.appointment?.type || body.appointmentType);
  const date = normalizeText(body.appointment?.date || body.appointmentDate);
  const time = normalizeText(body.appointment?.time || body.appointmentTime);
  const contactEmail = normalizeEmail(body.appointment?.contactEmail || body.contactEmail || body.guardianEmail);

  if (!type && !date && !time) {
    return { type: '', label: '', date: '', time: '', contactEmail: '', scheduledAt: null };
  }

  if (!type || !date || !time) {
    const error = new Error('Tipo, fecha y hora de la cita son requeridos.');
    error.statusCode = 400;
    throw error;
  }

  const scheduledAt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(scheduledAt.getTime())) {
    const error = new Error('Fecha u hora de la cita inválida.');
    error.statusCode = 400;
    throw error;
  }

  return {
    type,
    label: appointmentTypeLabels[type] || '',
    date,
    time,
    contactEmail,
    scheduledAt,
  };
}

function buildEventPayload(body, req) {
  const stageKey = normalizeStageKey(body.stageKey || body.currentStageKey || 'intento-contacto');
  const stage = getStageTemplate(stageKey);
  let appointment;
  try {
    appointment = buildAppointmentPayload(body);
  } catch (error) {
    if (error.statusCode === 400 && !body.appointmentType && !body.appointmentDate) {
      appointment = { type: '', label: '', date: '', time: '', contactEmail: '', scheduledAt: null };
    } else {
      throw error;
    }
  }

  return {
    title: normalizeText(body.title),
    notes: normalizeText(body.notes || body.description),
    stageKey,
    stageLabel: stage.label,
    responsible: normalizeText(body.responsible || req.user?.name || req.user?.username),
    appointment,
    completed: Boolean(body.completed),
    inProgress: Boolean(body.inProgress),
    createdByName: normalizeText(req.user?.name || req.user?.username),
  };
}

function buildQuery(req) {
  const query = { deletedAt: null };
  const search = normalizeText(req.query.search);
  const city = normalizeText(req.query.city);
  const stage = normalizeText(req.query.stage || req.query.stageKey);
  const contactMethod = normalizeContactMethod(req.query.contactMethod);
  const from = normalizeText(req.query.from);
  const to = normalizeText(req.query.to);
  const status = normalizeText(req.query.status).toLowerCase();

  if (status === SALES_PROSPECT_STATUS_WITHDRAWN) {
    query.salesStatus = SALES_PROSPECT_STATUS_WITHDRAWN;
  } else if (status === SALES_PROSPECT_STATUS_EMAIL_NURTURE) {
    query.salesStatus = SALES_PROSPECT_STATUS_EMAIL_NURTURE;
  } else {
    query.salesStatus = { $nin: [SALES_PROSPECT_STATUS_WITHDRAWN, SALES_PROSPECT_STATUS_EMAIL_NURTURE] };
  }

  if (search) {
    query.$or = [
      { schoolName: { $regex: search, $options: 'i' } },
      { contactName: { $regex: search, $options: 'i' } },
      { contactEmail: { $regex: search, $options: 'i' } },
    ];
  }
  if (city) {
    query.city = { $regex: city, $options: 'i' };
  }
  if (stage) {
    query.currentStageKey = normalizeStageKey(stage);
  }
  if (contactMethod) {
    query.contactMethod = contactMethod;
  }
  if (from || to) {
    query.createdAt = {};
    if (from) {
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);
      query.createdAt.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      query.createdAt.$lte = toDate;
    }
  }
  return query;
}

function getProspectEvents(prospect) {
  return (Array.isArray(prospect?.salesEvents) ? prospect.salesEvents : [])
    .map((event) => ({
      ...event.toObject?.() || event,
      prospectId: String(prospect._id || prospect.id || ''),
      schoolName: prospect.schoolName || '',
      contactName: prospect.contactName || '',
    }))
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));
}

async function buildSalesSummary() {
  const prospects = await SalesProspect.find({ deletedAt: null }).sort({ updatedAt: -1 }).limit(500).lean();
  const stageCounts = salesStageTemplates.reduce((accumulator, stage) => ({ ...accumulator, [stage.key]: 0 }), {});
  const metrics = {
    total: 0,
    inProcess: 0,
    contracted: 0,
    inProduction: 0,
    withdrawn: 0,
    emailNurture: 0,
  };

  prospects.forEach((prospect) => {
    if (isWithdrawnProspect(prospect)) {
      metrics.withdrawn += 1;
      return;
    }
    if (isEmailNurtureProspect(prospect)) {
      metrics.emailNurture += 1;
      return;
    }
    metrics.total += 1;
    if (stageCounts[prospect.currentStageKey] !== undefined) {
      stageCounts[prospect.currentStageKey] += 1;
    }
    const stageIndex = getStageIndex(prospect.currentStageKey);
    if (stageIndex >= 2 && stageIndex <= 5) metrics.inProcess += 1;
    if (prospect.currentStageKey === 'contratado') metrics.contracted += 1;
    if (prospect.currentStageKey === 'en-produccion') metrics.inProduction += 1;
  });

  const activeProspects = prospects.filter((prospect) => (
    !isWithdrawnProspect(prospect) && !isEmailNurtureProspect(prospect)
  ));
  const globalEvents = activeProspects.flatMap(getProspectEvents).slice(0, 12);
  const scheduledEvents = activeProspects
    .flatMap(getProspectEvents)
    .filter((event) => event?.appointment?.scheduledAt)
    .sort((left, right) => new Date(left.appointment.scheduledAt || 0) - new Date(right.appointment.scheduledAt || 0))
    .slice(0, 120);

  return { metrics, stageCounts, globalEvents, scheduledEvents };
}

function assertProspectCanMoveStages(prospect) {
  if (isWithdrawnProspect(prospect)) {
    const error = new Error('Este cliente está marcado como desistido. No puedes cambiar su etapa.');
    error.statusCode = 409;
    throw error;
  }
  if (isEmailNurtureProspect(prospect)) {
    const error = new Error('Este cliente está en el pipeline de correos. Márcalo como respondido o espera a completar la secuencia.');
    error.statusCode = 409;
    throw error;
  }
}

async function findProspect(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.prospectId)) {
    res.status(400).json({ message: 'Invalid prospectId' });
    return null;
  }
  const prospect = await SalesProspect.findOne({ _id: req.params.prospectId, deletedAt: null });
  if (!prospect) {
    res.status(404).json({ message: 'Cliente no encontrado' });
    return null;
  }
  return prospect;
}

router.get('/', async (req, res) => {
  try {
    const query = buildQuery(req);
    const prospects = await SalesProspect.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(250);
    const summary = await buildSalesSummary();
    return res.status(200).json({
      prospects: await Promise.all(prospects.map((item) => serializeProspect(item))),
      stageTemplates: salesStageTemplates,
      contactMethodOptions: Object.entries(contactMethodLabels).map(([value, label]) => ({ value, label })),
      ...summary,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo cargar el CRM.' });
  }
});

router.get('/agenda-settings', async (_req, res) => {
  try {
    const settings = await getSalesAgendaSettings();
    return res.status(200).json(settings);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo cargar la agenda.' });
  }
});

router.put('/agenda-settings', async (req, res) => {
  try {
    const windows = Array.isArray(req.body?.windows) && req.body.windows.length
      ? req.body.windows
      : [{ start: req.body?.availableFrom, end: req.body?.availableTo }];
    const settings = await saveSalesAgendaWindows(null, windows);
    return res.status(200).json(settings);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo guardar la agenda.' });
  }
});

router.post('/agenda-settings/blocks', async (req, res) => {
  try {
    const settings = await addSalesAgendaBlock(null, {
      scope: req.body?.scope,
      date: req.body?.date,
      time: req.body?.time,
    }, req.user?.name || req.user?.username || '');
    return res.status(200).json(settings);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo bloquear esa hora.' });
  }
});

router.delete('/agenda-settings/blocks/:blockId', async (req, res) => {
  try {
    const settings = await removeSalesAgendaBlock(null, req.params.blockId);
    return res.status(200).json(settings);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo quitar el bloqueo.' });
  }
});

const CONTACT_TEMPLATE_CHANNELS = new Set(['whatsapp', 'email', 'both']);

function serializeContactTemplate(doc) {
  const source = doc?.toObject?.() || doc || {};
  return {
    id: String(source._id || ''),
    name: source.name || '',
    body: source.body || '',
    channel: CONTACT_TEMPLATE_CHANNELS.has(source.channel) ? source.channel : 'both',
    sortOrder: Number(source.sortOrder) || 0,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function normalizeContactTemplateChannel(value) {
  const raw = normalizeText(value).toLowerCase();
  return CONTACT_TEMPLATE_CHANNELS.has(raw) ? raw : 'both';
}

router.get('/contact-templates', async (_req, res) => {
  try {
    const templates = await SalesContactTemplate.find({ deletedAt: null })
      .sort({ sortOrder: 1, name: 1, createdAt: -1 })
      .limit(200);
    return res.status(200).json({ templates: templates.map(serializeContactTemplate) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudieron cargar las plantillas.' });
  }
});

router.post('/contact-templates', async (req, res) => {
  try {
    const name = normalizeText(req.body?.name);
    const body = normalizeText(req.body?.body);
    if (!name) {
      return res.status(400).json({ message: 'El nombre de la plantilla es requerido.' });
    }
    if (!body) {
      return res.status(400).json({ message: 'El mensaje de la plantilla es requerido.' });
    }
    const template = await SalesContactTemplate.create({
      name,
      body,
      channel: normalizeContactTemplateChannel(req.body?.channel),
      sortOrder: Number(req.body?.sortOrder) || 0,
    });
    return res.status(201).json({ template: serializeContactTemplate(template) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo crear la plantilla.' });
  }
});

router.patch('/contact-templates/:templateId', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.templateId)) {
      return res.status(400).json({ message: 'Plantilla no válida.' });
    }
    const template = await SalesContactTemplate.findOne({ _id: req.params.templateId, deletedAt: null });
    if (!template) {
      return res.status(404).json({ message: 'Plantilla no encontrada.' });
    }
    if (req.body?.name !== undefined) {
      const name = normalizeText(req.body.name);
      if (!name) {
        return res.status(400).json({ message: 'El nombre de la plantilla es requerido.' });
      }
      template.name = name;
    }
    if (req.body?.body !== undefined) {
      const body = normalizeText(req.body.body);
      if (!body) {
        return res.status(400).json({ message: 'El mensaje de la plantilla es requerido.' });
      }
      template.body = body;
    }
    if (req.body?.channel !== undefined) {
      template.channel = normalizeContactTemplateChannel(req.body.channel);
    }
    if (req.body?.sortOrder !== undefined) {
      template.sortOrder = Number(req.body.sortOrder) || 0;
    }
    await template.save();
    return res.status(200).json({ template: serializeContactTemplate(template) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo actualizar la plantilla.' });
  }
});

router.delete('/contact-templates/:templateId', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.templateId)) {
      return res.status(400).json({ message: 'Plantilla no válida.' });
    }
    const template = await SalesContactTemplate.findOne({ _id: req.params.templateId, deletedAt: null });
    if (!template) {
      return res.status(404).json({ message: 'Plantilla no encontrada.' });
    }
    template.deletedAt = new Date();
    await template.save();
    return res.status(200).json({ message: 'Plantilla eliminada.' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo eliminar la plantilla.' });
  }
});

router.post('/agenda-settings/closed-dates', async (req, res) => {
  try {
    const settings = await setSalesAgendaClosedDate(null, req.body?.date, Boolean(req.body?.closed));
    return res.status(200).json(settings);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo bloquear ese día.' });
  }
});

router.get('/nurture-email-templates', async (_req, res) => {
  try {
    const templates = await listSalesNurtureEmailTemplates();
    return res.status(200).json({
      templates,
      senderEmail: SALES_NURTURE_SENDER_EMAIL,
      senderName: SALES_NURTURE_SENDER_NAME,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudieron cargar las plantillas de correo.' });
  }
});

router.patch('/nurture-email-templates/:sequence', async (req, res) => {
  try {
    const template = await updateSalesNurtureEmailTemplate(req.params.sequence, req.body || {});
    return res.status(200).json({ template });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo guardar la plantilla.' });
  }
});

router.get('/:prospectId', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    return res.status(200).json({ prospect: await serializeProspect(prospect) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo cargar el cliente.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = buildProspectPayload(req.body);
    if (!payload.schoolName) {
      return res.status(400).json({ message: 'El nombre del colegio es requerido.' });
    }
    const stageKey = payload.currentStageKey || 'creado';
    const prospect = await SalesProspect.create({
      ...payload,
      salesStages: buildDefaultStages(stageKey),
      salesEvents: [{
        title: 'Cliente registrado',
        notes: 'Alta manual en CRM ventas.',
        stageKey,
        stageLabel: getStageTemplate(stageKey).label,
        responsible: normalizeText(req.user?.name || req.user?.username),
        inProgress: true,
        createdByName: normalizeText(req.user?.name || req.user?.username),
      }],
    });
    return res.status(201).json({ prospect: await serializeProspect(prospect), summary: await buildSalesSummary() });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo crear el cliente.' });
  }
});

router.patch('/:prospectId', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    const payload = buildProspectPayload(req.body, prospect);
    Object.assign(prospect, payload);
    prospect.salesStages = buildDefaultStages(payload.currentStageKey, prospect.salesStages);
    await prospect.save();
    return res.status(200).json({ prospect: await serializeProspect(prospect), summary: await buildSalesSummary() });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo actualizar el cliente.' });
  }
});

router.delete('/:prospectId', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    prospect.deletedAt = new Date();
    await prospect.save();
    return res.status(200).json({ message: 'Cliente eliminado.', summary: await buildSalesSummary() });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo eliminar el cliente.' });
  }
});

router.patch('/:prospectId/start-email-nurture', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    if (isWithdrawnProspect(prospect)) {
      return res.status(409).json({ message: 'Este cliente está desistido.' });
    }
    if (isEmailNurtureProspect(prospect)) {
      return res.status(409).json({ message: 'Este cliente ya está en el pipeline de correos.' });
    }
    if (prospect.currentStageKey !== 'contactado') {
      return res.status(400).json({
        message: 'Solo puedes enviar al pipeline de correos clientes en etapa Contactado (E3).',
      });
    }
    const startedAt = new Date();
    const startedByName = normalizeText(req.user?.name || req.user?.username);
    let nurtureNotes = 'Secuencia automática de 7 correos iniciada.';
    prospect.salesStatus = SALES_PROSPECT_STATUS_EMAIL_NURTURE;
    prospect.emailNurture = {
      startedAt,
      startedByName,
      respondedAt: null,
      respondedByName: '',
      emails: [],
    };
    if (isValidEmail(prospect.contactEmail)) {
      try {
        await sendSalesNurtureEmailForProspect(prospect, 1);
        nurtureNotes = 'Secuencia de 7 correos iniciada (correo 1 enviado).';
      } catch (error) {
        nurtureNotes = `Secuencia iniciada; el correo 1 no se pudo enviar (${normalizeText(error.message) || 'error de envío'}).`;
      }
    } else {
      nurtureNotes = 'Secuencia iniciada sin envío automático: el contacto no tiene un correo con formato válido. Puedes enviar manualmente después.';
    }
    const fromStage = getStageTemplate(prospect.currentStageKey);
    prospect.salesEvents.push({
      title: 'Dirigido al pipeline de correos',
      notes: nurtureNotes,
      stageKey: fromStage.key,
      stageLabel: fromStage.label,
      responsible: startedByName,
      completed: false,
      inProgress: true,
      createdByName: startedByName,
    });
    await prospect.save();

    return res.status(200).json({
      prospect: await serializeProspect(prospect),
      summary: await buildSalesSummary(),
      message: 'Cliente en pipeline de correos. Se enviarán hasta 7 correos hasta obtener respuesta.',
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo iniciar el pipeline de correos.' });
  }
});

router.get('/:prospectId/nurture-emails/:sequence/preview', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    const sequence = Number(req.params.sequence);
    const preview = await getSalesNurtureEmailPreviewForProspect(prospect, sequence);
    return res.status(200).json({ preview });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo cargar la vista previa.' });
  }
});

router.post('/:prospectId/nurture-emails/:sequence/send', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    if (!isEmailNurtureProspect(prospect)) {
      return res.status(400).json({ message: 'Este cliente no está en el pipeline de correos.' });
    }
    const sequence = Number(req.params.sequence);
    const forceResend = Boolean(req.body?.forceResend);
    const senderName = normalizeText(req.user?.name || req.user?.username);
    await sendSalesNurtureEmailForProspect(prospect, sequence, { forceResend });
    prospect.salesEvents.push({
      title: `Correo ${sequence} enviado`,
      notes: forceResend ? 'Reenvío manual desde CRM ventas.' : 'Envío manual desde CRM ventas.',
      stageKey: prospect.currentStageKey,
      stageLabel: getStageTemplate(prospect.currentStageKey).label,
      responsible: senderName,
      completed: true,
      inProgress: false,
      createdByName: senderName,
    });
    await prospect.save();
    return res.status(200).json({
      prospect: await serializeProspect(prospect),
      summary: await buildSalesSummary(),
      message: `Correo ${sequence} enviado desde ${SALES_NURTURE_SENDER_EMAIL}.`,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo enviar el correo.' });
  }
});

router.patch('/:prospectId/email-nurture/response', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    if (!isEmailNurtureProspect(prospect)) {
      return res.status(400).json({ message: 'Este cliente no está en el pipeline de correos.' });
    }
    if (prospect.emailNurture?.respondedAt) {
      return res.status(409).json({ message: 'Ya registraste respuesta para este cliente.' });
    }
    const notes = normalizeText(req.body?.notes);
    const responderName = normalizeText(req.user?.name || req.user?.username);
    prospect.salesStatus = 'active';
    prospect.emailNurture.respondedAt = new Date();
    prospect.emailNurture.respondedByName = responderName;
    const fromStage = getStageTemplate(prospect.currentStageKey);
    prospect.salesEvents.push({
      title: 'Respuesta recibida (pipeline de correos)',
      notes: notes || 'El colegio respondió durante la secuencia de correos.',
      stageKey: fromStage.key,
      stageLabel: fromStage.label,
      responsible: responderName,
      completed: true,
      inProgress: false,
      createdByName: responderName,
    });
    await prospect.save();
    return res.status(200).json({
      prospect: await serializeProspect(prospect),
      summary: await buildSalesSummary(),
      message: 'Respuesta registrada. El cliente vuelve al pipeline activo en E3.',
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo registrar la respuesta.' });
  }
});

router.patch('/:prospectId/withdraw', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    if (isWithdrawnProspect(prospect)) {
      return res.status(409).json({ message: 'Este cliente ya está marcado como desistido.' });
    }
    if (isEmailNurtureProspect(prospect)) {
      const sent = nurtureEmailsSentCount(prospect);
      const startedAt = prospect.emailNurture?.startedAt;
      const dayIndex = startedAt
        ? bogotaDayNumber(new Date()) - bogotaDayNumber(startedAt) + 1
        : 0;
      if (sent < SALES_NURTURE_MAX_SEQUENCE && dayIndex < SALES_NURTURE_MAX_SEQUENCE) {
        return res.status(400).json({
          message: `En pipeline de correos solo puedes desistir tras 7 días o 7 correos enviados (${sent}/${SALES_NURTURE_MAX_SEQUENCE} correos, día ${Math.max(0, dayIndex)}/7).`,
        });
      }
    } else if (prospect.currentStageKey !== 'contactado') {
      return res.status(400).json({
        message: 'Solo puedes marcar como desistido a clientes en etapa Contactado (E3).',
      });
    }
    const reason = normalizeText(req.body?.reason || req.body?.withdrawnReason);
    if (!reason) {
      return res.status(400).json({ message: 'Indica el motivo del desistimiento.' });
    }
    const fromStage = getStageTemplate(prospect.currentStageKey);
    prospect.salesStatus = SALES_PROSPECT_STATUS_WITHDRAWN;
    prospect.withdrawnAt = new Date();
    prospect.withdrawnReason = reason;
    prospect.withdrawnFromStageKey = prospect.currentStageKey;
    prospect.salesEvents.push({
      title: 'Cliente desistido',
      notes: reason,
      stageKey: fromStage.key,
      stageLabel: fromStage.label,
      responsible: normalizeText(req.user?.name || req.user?.username),
      completed: true,
      inProgress: false,
      createdByName: normalizeText(req.user?.name || req.user?.username),
    });
    await prospect.save();
    return res.status(200).json({
      prospect: await serializeProspect(prospect),
      summary: await buildSalesSummary(),
      message: 'Cliente marcado como desistido.',
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo marcar como desistido.' });
  }
});

router.patch('/:prospectId/stages/:stageKey', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    assertProspectCanMoveStages(prospect);
    const previousStageIndex = getStageIndex(prospect.currentStageKey);
    const stageKey = normalizeStageKey(req.params.stageKey);
    const nextStage = getStageTemplate(stageKey);
    const nextStageIndex = getStageIndex(stageKey);
    const movedStage = prospect.currentStageKey !== stageKey;
    prospect.currentStageKey = stageKey;
    prospect.salesStages = buildDefaultStages(stageKey, prospect.salesStages);
    if (movedStage) {
      const direction = nextStageIndex < previousStageIndex ? 'previous' : 'next';
      const action = direction === 'previous' ? 'Retroceso' : 'Avance';
      prospect.salesEvents.push({
        title: `${action} a ${nextStage.code}`,
        notes: `El cliente ${direction === 'previous' ? 'retrocedió' : 'avanzó'} a ${nextStage.label}.`,
        stageKey: nextStage.key,
        stageLabel: nextStage.label,
        responsible: normalizeText(req.user?.name || req.user?.username),
        inProgress: nextStage.key !== 'en-produccion',
        completed: nextStage.key === 'en-produccion',
        createdByName: normalizeText(req.user?.name || req.user?.username),
      });
    }
    await prospect.save();
    return res.status(200).json({ prospect: await serializeProspect(prospect), summary: await buildSalesSummary() });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo actualizar la etapa.' });
  }
});

router.patch('/:prospectId/stage-transition', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    assertProspectCanMoveStages(prospect);
    const direction = normalizeText(req.body.direction || 'next');
    const currentIndex = Math.max(0, getStageIndex(prospect.currentStageKey));
    const nextIndex = Math.min(salesStageTemplates.length - 1, Math.max(0, currentIndex + (direction === 'previous' ? -1 : 1)));
    const nextStage = salesStageTemplates[nextIndex];
    prospect.currentStageKey = nextStage.key;
    prospect.salesStages = buildDefaultStages(nextStage.key, prospect.salesStages);
    prospect.salesEvents.push({
      title: direction === 'previous' ? `Retroceso a ${nextStage.code}` : `Avance a ${nextStage.code}`,
      notes: `Cambio de etapa a ${nextStage.label}.`,
      stageKey: nextStage.key,
      stageLabel: nextStage.label,
      responsible: normalizeText(req.user?.name || req.user?.username),
      inProgress: nextStage.key !== 'en-produccion',
      completed: nextStage.key === 'en-produccion',
      createdByName: normalizeText(req.user?.name || req.user?.username),
    });
    await prospect.save();
    return res.status(200).json({ prospect: await serializeProspect(prospect), summary: await buildSalesSummary() });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo mover la etapa.' });
  }
});

router.post('/:prospectId/events', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    assertProspectCanMoveStages(prospect);
    const eventPayload = buildEventPayload(req.body, req);
    if (!eventPayload.title) {
      return res.status(400).json({ message: 'El título del evento es requerido.' });
    }
    prospect.salesEvents.push(eventPayload);
    if (eventPayload.stageKey && eventPayload.stageKey !== prospect.currentStageKey) {
      prospect.currentStageKey = eventPayload.stageKey;
      prospect.salesStages = buildDefaultStages(eventPayload.stageKey, prospect.salesStages);
    }
    await prospect.save();
    return res.status(201).json({ prospect: await serializeProspect(prospect), summary: await buildSalesSummary() });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo registrar el evento.' });
  }
});

router.patch('/:prospectId/events/:eventId', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    const event = (prospect.salesEvents || []).find((item) => String(item._id) === String(req.params.eventId));
    if (!event) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }
    const eventPayload = buildEventPayload(req.body, req);
    if (eventPayload.title) event.title = eventPayload.title;
    if (req.body.notes !== undefined || req.body.description !== undefined) event.notes = eventPayload.notes;
    if (req.body.stageKey) {
      event.stageKey = eventPayload.stageKey;
      event.stageLabel = eventPayload.stageLabel;
    }
    if (req.body.responsible !== undefined) event.responsible = eventPayload.responsible;
    if (req.body.completed !== undefined) event.completed = eventPayload.completed;
    if (req.body.inProgress !== undefined) event.inProgress = eventPayload.inProgress;
    if (req.body.appointmentType || req.body.appointmentDate || req.body.appointmentTime) {
      event.appointment = eventPayload.appointment;
    }
    prospect.markModified('salesEvents');
    await prospect.save();
    return res.status(200).json({ prospect: await serializeProspect(prospect), summary: await buildSalesSummary() });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo actualizar el evento.' });
  }
});

router.delete('/:prospectId/events/:eventId', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    prospect.salesEvents = (prospect.salesEvents || []).filter((item) => String(item._id) !== String(req.params.eventId));
    await prospect.save();
    return res.status(200).json({ prospect: await serializeProspect(prospect), summary: await buildSalesSummary() });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo eliminar el evento.' });
  }
});

module.exports = router;
module.exports.salesStageTemplates = salesStageTemplates;
