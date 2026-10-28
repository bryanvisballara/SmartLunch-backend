const crypto = require('crypto');
const SalesProspect = require('../models/salesProspect.model');
const { sendBrevoEmail } = require('./brevo.service');
const { buildDemoEmailShell, buildWhatsappUrl } = require('./demoEmails.service');
const { bogotaDayNumber, bogotaHour } = require('./demoDailyFeed.service');
const {
  SALES_NURTURE_MAX_SEQUENCE,
  SALES_NURTURE_SENDER_EMAIL,
  SALES_NURTURE_SENDER_NAME,
  getSalesNurtureEmailTemplate,
  listSalesNurtureEmailTemplates,
  renderTemplateForProspect,
} = require('./salesNurtureTemplate.service');

const REPLY_TO_EMAIL = process.env.SALES_NURTURE_REPLY_TO_EMAIL
  || process.env.DEMO_REPLY_TO_EMAIL
  || 'alianzaseducativas@comergio.com';
const SALES_NURTURE_SEND_HOUR = 9;

function normalizeText(value) {
  return String(value || '').trim();
}

const SALES_NURTURE_LABELS = {
  1: 'Correo 1 · Presentación Comergio',
  2: 'Correo 2 · Pagos y cartera',
  3: 'Correo 3 · Comunicación con familias',
  4: 'Correo 4 · Portal académico',
  5: 'Correo 5 · Cafetería y servicios',
  6: 'Correo 6 · Gestión del colegio',
  7: 'Correo 7 · Invitación a reunión',
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function paragraph(html) {
  return `<p style="margin:0 0 14px 0;">${html}</p>`;
}

function bulletList(items) {
  return `<ul style="margin:0 0 16px 0;padding-left:20px;color:#334155;">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function signSalesEmailOpenToken(prospectId, sequence) {
  const id = String(prospectId);
  const seq = String(sequence);
  const signature = crypto
    .createHmac('sha256', String(process.env.JWT_SECRET || 'comergio-demo'))
    .update(`sales-nurture-open:${id}:${seq}`)
    .digest('base64url')
    .slice(0, 24);
  return `${id}.${seq}.${signature}`;
}

function verifySalesEmailOpenToken(token) {
  const parts = String(token || '').split('.');
  const id = parts[0] || '';
  const seq = parts[1] || '';
  const sig = parts[2] || '';
  if (!/^[a-f0-9]{24}$/i.test(id) || !/^[1-7]$/.test(seq) || !sig) {
    return null;
  }
  const expected = signSalesEmailOpenToken(id, seq);
  const received = `${id}.${seq}.${sig}`;
  if (expected.length !== received.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
    return null;
  }
  return { prospectId: id, sequence: Number(seq) };
}

function buildSalesEmailOpenUrl(prospectId, sequence) {
  const base = String(
    process.env.BACKEND_PUBLIC_URL || process.env.PUBLIC_BACKEND_URL || process.env.API_PUBLIC_URL || 'https://api.comergio.com',
  ).trim().replace(/\/+$/, '');
  return `${base}/public/sales-crm/email-open/${signSalesEmailOpenToken(prospectId, sequence)}`;
}

async function buildSalesNurtureEmail(sequence, { prospectId, email, contactName, schoolName }) {
  const template = await getSalesNurtureEmailTemplate(sequence);
  if (!template || template.enabled === false) {
    return null;
  }
  const content = renderTemplateForProspect(template, { contactName, schoolName });
  const ctaHref = buildWhatsappUrl(content.whatsappMessage);
  return {
    toEmail: email,
    toName: contactName,
    subject: content.subject,
    htmlContent: buildDemoEmailShell({
      eyebrow: content.eyebrow,
      title: content.title,
      intro: content.intro,
      body: content.body,
      ctaHref,
      ctaLabel: content.ctaLabel,
      trackingPixelUrl: prospectId ? buildSalesEmailOpenUrl(prospectId, sequence) : '',
    }),
    textContent: [
      content.title,
      content.intro,
      content.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      `${content.ctaLabel}: ${ctaHref}`,
    ].filter(Boolean).join('\n\n'),
  };
}

async function sendSalesNurtureEmail(sequence, params) {
  const payload = await buildSalesNurtureEmail(sequence, params);
  if (!payload) {
    throw new Error(`No hay plantilla activa para el correo ${sequence}.`);
  }
  return sendBrevoEmail({
    ...payload,
    senderEmail: SALES_NURTURE_SENDER_EMAIL,
    senderName: SALES_NURTURE_SENDER_NAME,
    replyToEmail: REPLY_TO_EMAIL,
    replyToName: SALES_NURTURE_SENDER_NAME,
  });
}

function nurtureEmailsSentCount(prospect) {
  const emails = Array.isArray(prospect?.emailNurture?.emails) ? prospect.emailNurture.emails : [];
  return emails.filter((entry) => entry?.sentAt).length;
}

async function buildEmailNurtureCatalog(prospect = {}) {
  const templates = await listSalesNurtureEmailTemplates();
  const labelBySequence = new Map(templates.map((item) => [item.sequence, item.label]));
  const emails = Array.isArray(prospect?.emailNurture?.emails) ? prospect.emailNurture.emails : [];
  return Array.from({ length: SALES_NURTURE_MAX_SEQUENCE }, (_, index) => {
    const sequence = index + 1;
    const entry = emails.find((item) => Number(item.sequence) === sequence);
    const sentAt = entry?.sentAt || null;
    const openedAt = entry?.openedAt || null;
    const openCount = Number(entry?.openCount || 0);
    return {
      sequence,
      label: labelBySequence.get(sequence) || SALES_NURTURE_LABELS[sequence] || `Correo ${sequence}`,
      sentAt,
      openedAt,
      openCount,
      openStatus: !sentAt ? 'not_sent' : (openedAt || openCount > 0 ? 'opened' : 'not_opened'),
    };
  });
}

async function getSalesNurtureEmailPreviewForProspect(prospect, sequence) {
  const normalizedSequence = Number(sequence);
  if (normalizedSequence < 1 || normalizedSequence > SALES_NURTURE_MAX_SEQUENCE) {
    const error = new Error('Secuencia de correo no válida.');
    error.statusCode = 400;
    throw error;
  }
  const template = await getSalesNurtureEmailTemplate(normalizedSequence);
  if (!template) {
    const error = new Error('Plantilla no encontrada.');
    error.statusCode = 404;
    throw error;
  }
  const payload = await buildSalesNurtureEmail(normalizedSequence, {
    prospectId: prospect._id,
    email: String(prospect.contactEmail || 'preview@comergio.com').trim(),
    contactName: prospect.contactName,
    schoolName: prospect.schoolName,
  });
  if (!payload) {
    const error = new Error(`El correo ${normalizedSequence} está desactivado en plantillas.`);
    error.statusCode = 400;
    throw error;
  }
  return {
    sequence: normalizedSequence,
    label: template.label || SALES_NURTURE_LABELS[normalizedSequence] || `Correo ${normalizedSequence}`,
    subject: payload.subject,
    htmlContent: payload.htmlContent,
    textContent: payload.textContent,
    toEmail: String(prospect.contactEmail || '').trim(),
    toName: prospect.contactName || '',
    senderEmail: SALES_NURTURE_SENDER_EMAIL,
    senderName: SALES_NURTURE_SENDER_NAME,
  };
}

async function sendSalesNurtureEmailForProspect(prospect, sequence, { forceResend = false } = {}) {
  const normalizedSequence = Number(sequence);
  if (normalizedSequence < 1 || normalizedSequence > SALES_NURTURE_MAX_SEQUENCE) {
    const error = new Error('Secuencia de correo no válida.');
    error.statusCode = 400;
    throw error;
  }
  const email = String(prospect.contactEmail || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('El contacto no tiene un correo con formato válido.');
    error.statusCode = 400;
    throw error;
  }
  if (!prospect.emailNurture) {
    prospect.emailNurture = { emails: [] };
  }
  if (!Array.isArray(prospect.emailNurture.emails)) {
    prospect.emailNurture.emails = [];
  }
  const existing = prospect.emailNurture.emails.find((item) => Number(item.sequence) === normalizedSequence);
  if (existing?.sentAt && !forceResend) {
    const error = new Error(`El correo ${normalizedSequence} ya fue enviado.`);
    error.statusCode = 409;
    throw error;
  }
  await sendSalesNurtureEmail(normalizedSequence, {
    prospectId: prospect._id,
    email,
    contactName: prospect.contactName,
    schoolName: prospect.schoolName,
  });
  const sentAt = new Date();
  if (existing) {
    existing.sentAt = sentAt;
    existing.openedAt = null;
    existing.openCount = 0;
  } else {
    prospect.emailNurture.emails = prospect.emailNurture.emails || [];
    prospect.emailNurture.emails.push({
      sequence: normalizedSequence,
      sentAt,
      openCount: 0,
    });
  }
  prospect.markModified('emailNurture');
  return sentAt;
}

async function recordSalesEmailOpen({ prospectId, sequence }) {
  const now = new Date();
  const prospect = await SalesProspect.findById(prospectId).select('emailNurture.emails').lean();
  const entry = (prospect?.emailNurture?.emails || []).find((item) => Number(item.sequence) === sequence);
  if (!entry?.sentAt) {
    return;
  }
  const update = {
    $inc: { 'emailNurture.emails.$.openCount': 1 },
  };
  if (!entry.openedAt) {
    update.$set = { 'emailNurture.emails.$.openedAt': now };
  }
  await SalesProspect.updateOne(
    { _id: prospectId, 'emailNurture.emails.sequence': sequence },
    update,
  );
}

async function claimNurtureEmailSend(prospectId, sequence) {
  const claimed = await SalesProspect.updateOne(
    {
      _id: prospectId,
      salesStatus: 'email_nurture',
      'emailNurture.emails.sequence': { $ne: sequence },
    },
    {
      $push: { 'emailNurture.emails': { sequence, sentAt: new Date() } },
    },
  );
  return Boolean(claimed.modifiedCount);
}

async function rollbackNurtureEmailSend(prospectId, sequence) {
  await SalesProspect.updateOne(
    { _id: prospectId },
    { $pull: { 'emailNurture.emails': { sequence } } },
  );
}

function nurtureSequenceForDay(startedAt, now = new Date()) {
  const dayIndex = bogotaDayNumber(now) - bogotaDayNumber(startedAt);
  if (dayIndex < 0 || dayIndex >= SALES_NURTURE_MAX_SEQUENCE) {
    return null;
  }
  return dayIndex + 1;
}

async function sendDueSalesNurtureEmails() {
  const now = new Date();
  if (bogotaHour(now) < SALES_NURTURE_SEND_HOUR) {
    return;
  }

  const prospects = await SalesProspect.find({
    deletedAt: null,
    salesStatus: 'email_nurture',
    'emailNurture.respondedAt': null,
    'emailNurture.startedAt': { $ne: null },
  })
    .select('contactEmail contactName schoolName emailNurture startedAt')
    .limit(80)
    .lean();

  for (const prospect of prospects) {
    const startedAt = prospect.emailNurture?.startedAt;
    if (!startedAt) {
      continue;
    }
    const sequence = nurtureSequenceForDay(startedAt, now);
    if (!sequence) {
      continue;
    }
    const alreadySent = (prospect.emailNurture?.emails || []).some(
      (entry) => Number(entry.sequence) === sequence && entry.sentAt,
    );
    if (alreadySent) {
      continue;
    }
    const email = normalizeText(prospect.contactEmail).toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      continue;
    }
    const claimed = await claimNurtureEmailSend(prospect._id, sequence);
    if (!claimed) {
      continue;
    }
    try {
      await sendSalesNurtureEmail(sequence, {
        prospectId: prospect._id,
        email,
        contactName: prospect.contactName,
        schoolName: prospect.schoolName,
      });
      console.info(`[SALES_NURTURE] correo ${sequence} enviado a ${prospect.contactEmail}`);
    } catch (error) {
      await rollbackNurtureEmailSend(prospect._id, sequence);
      console.warn(`[SALES_NURTURE] correo ${sequence} falló para ${prospect.contactEmail}: ${error.message || error}`);
    }
  }
}

module.exports = {
  SALES_NURTURE_MAX_SEQUENCE,
  SALES_NURTURE_LABELS,
  SALES_NURTURE_SENDER_EMAIL,
  buildEmailNurtureCatalog,
  nurtureEmailsSentCount,
  nurtureSequenceForDay,
  sendSalesNurtureEmail,
  getSalesNurtureEmailPreviewForProspect,
  sendSalesNurtureEmailForProspect,
  sendDueSalesNurtureEmails,
  verifySalesEmailOpenToken,
  recordSalesEmailOpen,
  claimNurtureEmailSend,
  rollbackNurtureEmailSend,
};
