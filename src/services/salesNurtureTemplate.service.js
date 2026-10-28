const SalesNurtureEmailTemplate = require('../models/salesNurtureEmailTemplate.model');

const SALES_NURTURE_MAX_SEQUENCE = 7;

const SALES_NURTURE_SENDER_EMAIL = String(
  process.env.SALES_NURTURE_SENDER_EMAIL || 'alianzaseducativas@comergio.com',
).trim().toLowerCase();

const SALES_NURTURE_SENDER_NAME = String(
  process.env.SALES_NURTURE_SENDER_NAME || 'Alianzas Educativas Comergio',
).trim();

function normalizeText(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstName(name) {
  return normalizeText(name).split(/\s+/)[0] || '';
}

function buildPlaceholderVars({ contactName = '', schoolName = '' } = {}) {
  return {
    firstName: firstName(contactName),
    contactName: normalizeText(contactName),
    schoolName: normalizeText(schoolName),
  };
}

function applyPlaceholders(value, vars, { htmlEscape = true } = {}) {
  return String(value || '').replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const raw = vars[key] ?? '';
    return htmlEscape ? escapeHtml(raw) : String(raw);
  });
}

function getDefaultTemplateDefinitions() {
  return [
    {
      sequence: 1,
      label: 'Correo 1 · Presentación Comergio',
      subject: '{{schoolName}}: conozca Comergio en 3 minutos',
      eyebrow: 'Comergio · Alianzas educativas',
      title: 'Una sola plataforma para su colegio y las familias',
      intro: 'Pagos, comunicación y académico conectados, sin depender de diez herramientas distintas.',
      bodyHtml: '<p>Hola{{firstName}},</p><p>Gracias por el contacto con <strong>{{schoolName}}</strong>. Queremos mostrarle cómo otros colegios están reduciendo cartera morosa y mejorando la experiencia de las familias.</p><ul><li>Familias pagan pensión y servicios desde el celular.</li><li>Docentes califican y publican tareas en minutos.</li><li>Rectoría y cartera ven indicadores en tiempo real.</li></ul>',
      ctaLabel: 'Quiero una llamada de 15 minutos',
      whatsappMessage: 'Hola, soy {{contactName}} de {{schoolName}}. Recibí su correo sobre Comergio y quiero agendar una llamada corta.',
    },
    {
      sequence: 2,
      label: 'Correo 2 · Pagos y cartera',
      subject: '¿Cuánto tiempo pierde cartera persiguiendo pagos?',
      eyebrow: 'Correo 2 · Pagos',
      title: 'Cobrar no debería ser el trabajo más pesado del mes',
      intro: 'Recordatorios automáticos y pagos en línea 24/7.',
      bodyHtml: '<p>Hola{{firstName}},</p><p>En <strong>{{schoolName}}</strong> puede ofrecer a las familias pagar pensión, matrícula y servicios con un botón, mientras cartera ve el estado de cada cuenta al día.</p>',
      ctaLabel: 'Hablemos de cartera',
      whatsappMessage: 'Hola, soy {{contactName}} de {{schoolName}}. Me interesa cómo Comergio ayuda con pagos y cartera.',
    },
    {
      sequence: 3,
      label: 'Correo 3 · Comunicación',
      subject: 'Comunicados que las familias sí leen',
      eyebrow: 'Correo 3 · Comunicación',
      title: 'Un feed que las familias sí leen',
      intro: 'Las circulares por correo se pierden; los grupos de WhatsApp se saturan.',
      bodyHtml: '<p>Hola{{firstName}},</p><p>Comergio centraliza circulares, fotos y avisos por grado o curso para <strong>{{schoolName}}</strong>, con notificaciones push al celular.</p>',
      ctaLabel: 'Quiero comunicar mejor',
      whatsappMessage: 'Hola, soy {{contactName}} de {{schoolName}}. Me interesa el feed de comunicaciones de Comergio.',
    },
    {
      sequence: 4,
      label: 'Correo 4 · Académico',
      subject: 'Notas y tareas visibles para las familias al instante',
      eyebrow: 'Correo 4 · Académico',
      title: 'El docente registra; la familia lo ve en segundos',
      intro: 'Lo que el docente registra en clase, la familia lo ve al instante.',
      bodyHtml: '<p>Hola{{firstName}},</p><p>Con Comergio, <strong>{{schoolName}}</strong> conecta calificaciones, tareas, asistencia y boletines sin duplicar trabajo administrativo.</p>',
      ctaLabel: 'Agendar demo académica',
      whatsappMessage: 'Hola, soy {{contactName}} de {{schoolName}}. Me interesa el portal académico de Comergio.',
    },
    {
      sequence: 5,
      label: 'Correo 5 · Cafetería',
      subject: 'Cafetería con control para familias y concesionario',
      eyebrow: 'Correo 5 · Servicios',
      title: 'El acudiente sabe qué come su hijo',
      intro: 'Menos efectivo, más tranquilidad para las familias.',
      bodyHtml: '<p>Hola{{firstName}},</p><p>Las familias de <strong>{{schoolName}}</strong> pueden recargar saldo, poner topes diarios y ver cada compra en tiempo real.</p>',
      ctaLabel: 'Quiero ver cafetería',
      whatsappMessage: 'Hola, soy {{contactName}} de {{schoolName}}. Quiero saber cómo funciona la cafetería en Comergio.',
    },
    {
      sequence: 6,
      label: 'Correo 6 · Gestión',
      subject: 'Rectoría, cartera y coordinación en un solo lugar',
      eyebrow: 'Correo 6 · Gestión',
      title: 'Menos plataformas, más control',
      intro: 'Portales por rol con la misma base de datos.',
      bodyHtml: '<p>Hola{{firstName}},</p><p>Además de la app de familias, <strong>{{schoolName}}</strong> puede operar cartera, coordinación, admisiones y rectoría en Comergio.</p>',
      ctaLabel: 'Solicitar demo guiada',
      whatsappMessage: 'Hola, soy {{contactName}} de {{schoolName}}. Quiero una demo guiada de los portales de gestión.',
    },
    {
      sequence: 7,
      label: 'Correo 7 · Cierre',
      subject: '¿Agendamos 20 minutos con {{schoolName}}?',
      eyebrow: 'Correo 7 · Cierre',
      title: 'Siguiente paso: una reunión corta',
      intro: 'Este es nuestro último correo de la secuencia automática.',
      bodyHtml: '<p>Hola{{firstName}},</p><p>Si aún no hemos conectado, nos encantaría una videollamada de 20 minutos para mostrar Comergio aplicado a <strong>{{schoolName}}</strong>.</p><p>Puede responder a este correo o escribirnos por WhatsApp.</p>',
      ctaLabel: 'Agendar reunión',
      whatsappMessage: 'Hola, soy {{contactName}} de {{schoolName}}. Vi su secuencia de correos y quiero agendar una reunión.',
    },
  ];
}

async function ensureSalesNurtureEmailTemplates() {
  const existing = await SalesNurtureEmailTemplate.countDocuments({});
  if (existing >= SALES_NURTURE_MAX_SEQUENCE) {
    return;
  }
  for (const template of getDefaultTemplateDefinitions()) {
    await SalesNurtureEmailTemplate.updateOne(
      { sequence: template.sequence },
      { $setOnInsert: template },
      { upsert: true },
    );
  }
}

function serializeTemplate(doc) {
  const source = doc?.toObject?.() || doc || {};
  return {
    id: String(source._id || ''),
    sequence: Number(source.sequence) || 0,
    label: source.label || '',
    subject: source.subject || '',
    eyebrow: source.eyebrow || '',
    title: source.title || '',
    intro: source.intro || '',
    bodyHtml: source.bodyHtml || '',
    ctaLabel: source.ctaLabel || '',
    whatsappMessage: source.whatsappMessage || '',
    enabled: source.enabled !== false,
    updatedAt: source.updatedAt || null,
  };
}

async function listSalesNurtureEmailTemplates() {
  await ensureSalesNurtureEmailTemplates();
  const templates = await SalesNurtureEmailTemplate.find({}).sort({ sequence: 1 }).lean();
  return templates.map(serializeTemplate);
}

async function getSalesNurtureEmailTemplate(sequence) {
  await ensureSalesNurtureEmailTemplates();
  const normalizedSequence = Number(sequence);
  const template = await SalesNurtureEmailTemplate.findOne({ sequence: normalizedSequence }).lean();
  if (!template) {
    return null;
  }
  return serializeTemplate(template);
}

async function updateSalesNurtureEmailTemplate(sequence, payload = {}) {
  await ensureSalesNurtureEmailTemplates();
  const normalizedSequence = Number(sequence);
  if (normalizedSequence < 1 || normalizedSequence > SALES_NURTURE_MAX_SEQUENCE) {
    const error = new Error('Secuencia de correo no válida.');
    error.statusCode = 400;
    throw error;
  }
  const template = await SalesNurtureEmailTemplate.findOne({ sequence: normalizedSequence });
  if (!template) {
    const error = new Error('Plantilla no encontrada.');
    error.statusCode = 404;
    throw error;
  }
  if (payload.label !== undefined) template.label = normalizeText(payload.label) || template.label;
  if (payload.subject !== undefined) {
    const subject = normalizeText(payload.subject);
    if (!subject) {
      const error = new Error('El asunto es requerido.');
      error.statusCode = 400;
      throw error;
    }
    template.subject = subject;
  }
  if (payload.eyebrow !== undefined) template.eyebrow = normalizeText(payload.eyebrow);
  if (payload.title !== undefined) {
    const title = normalizeText(payload.title);
    if (!title) {
      const error = new Error('El título es requerido.');
      error.statusCode = 400;
      throw error;
    }
    template.title = title;
  }
  if (payload.intro !== undefined) template.intro = normalizeText(payload.intro);
  if (payload.bodyHtml !== undefined) {
    const bodyHtml = normalizeText(payload.bodyHtml);
    if (!bodyHtml) {
      const error = new Error('El cuerpo del correo es requerido.');
      error.statusCode = 400;
      throw error;
    }
    template.bodyHtml = bodyHtml;
  }
  if (payload.ctaLabel !== undefined) template.ctaLabel = normalizeText(payload.ctaLabel);
  if (payload.whatsappMessage !== undefined) template.whatsappMessage = normalizeText(payload.whatsappMessage);
  if (payload.enabled !== undefined) template.enabled = Boolean(payload.enabled);
  await template.save();
  return serializeTemplate(template);
}

function renderTemplateForProspect(template, { contactName = '', schoolName = '' } = {}) {
  const vars = buildPlaceholderVars({ contactName, schoolName });
  const firstNameSuffix = vars.firstName ? ` ${vars.firstName}` : '';
  const bodyHtml = applyPlaceholders(template.bodyHtml, vars)
    .replace(/Hola{{firstName}}/g, `Hola${firstNameSuffix}`)
    .replace(/Hola \{\{firstName\}\}/g, `Hola${firstNameSuffix}`);
  return {
    subject: applyPlaceholders(template.subject, vars, { htmlEscape: false }),
    eyebrow: applyPlaceholders(template.eyebrow, vars, { htmlEscape: false }),
    title: applyPlaceholders(template.title, vars, { htmlEscape: false }),
    intro: applyPlaceholders(template.intro, vars, { htmlEscape: false }),
    body: bodyHtml,
    ctaLabel: applyPlaceholders(template.ctaLabel, vars, { htmlEscape: false }),
    whatsappMessage: applyPlaceholders(template.whatsappMessage, vars, { htmlEscape: false }),
  };
}

module.exports = {
  SALES_NURTURE_MAX_SEQUENCE,
  SALES_NURTURE_SENDER_EMAIL,
  SALES_NURTURE_SENDER_NAME,
  ensureSalesNurtureEmailTemplates,
  listSalesNurtureEmailTemplates,
  getSalesNurtureEmailTemplate,
  updateSalesNurtureEmailTemplate,
  serializeTemplate,
  renderTemplateForProspect,
  buildPlaceholderVars,
};
