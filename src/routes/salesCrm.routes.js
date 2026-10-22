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

function serializeProspect(prospect) {
  const source = prospect.toObject?.() || prospect;
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
  const metrics = { total: prospects.length, inProcess: 0, contracted: 0, inProduction: 0 };

  prospects.forEach((prospect) => {
    if (stageCounts[prospect.currentStageKey] !== undefined) {
      stageCounts[prospect.currentStageKey] += 1;
    }
    const stageIndex = getStageIndex(prospect.currentStageKey);
    if (stageIndex >= 2 && stageIndex <= 5) metrics.inProcess += 1;
    if (prospect.currentStageKey === 'contratado') metrics.contracted += 1;
    if (prospect.currentStageKey === 'en-produccion') metrics.inProduction += 1;
  });

  const globalEvents = prospects.flatMap(getProspectEvents).slice(0, 12);
  const scheduledEvents = prospects
    .flatMap(getProspectEvents)
    .filter((event) => event?.appointment?.scheduledAt)
    .sort((left, right) => new Date(left.appointment.scheduledAt || 0) - new Date(right.appointment.scheduledAt || 0))
    .slice(0, 120);

  return { metrics, stageCounts, globalEvents, scheduledEvents };
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
      prospects: prospects.map(serializeProspect),
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

router.get('/:prospectId', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
    return res.status(200).json({ prospect: serializeProspect(prospect) });
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
    return res.status(201).json({ prospect: serializeProspect(prospect), summary: await buildSalesSummary() });
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
    return res.status(200).json({ prospect: serializeProspect(prospect), summary: await buildSalesSummary() });
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

router.patch('/:prospectId/stages/:stageKey', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
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
    return res.status(200).json({ prospect: serializeProspect(prospect), summary: await buildSalesSummary() });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo actualizar la etapa.' });
  }
});

router.patch('/:prospectId/stage-transition', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
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
    return res.status(200).json({ prospect: serializeProspect(prospect), summary: await buildSalesSummary() });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo mover la etapa.' });
  }
});

router.post('/:prospectId/events', async (req, res) => {
  try {
    const prospect = await findProspect(req, res);
    if (!prospect) return null;
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
    return res.status(201).json({ prospect: serializeProspect(prospect), summary: await buildSalesSummary() });
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
    return res.status(200).json({ prospect: serializeProspect(prospect), summary: await buildSalesSummary() });
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
    return res.status(200).json({ prospect: serializeProspect(prospect), summary: await buildSalesSummary() });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo eliminar el evento.' });
  }
});

module.exports = router;
module.exports.salesStageTemplates = salesStageTemplates;
