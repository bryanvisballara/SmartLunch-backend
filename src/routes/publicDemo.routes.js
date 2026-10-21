const express = require('express');
const rateLimit = require('express-rate-limit');
const DemoLead = require('../models/demoLead.model');
const { createDemoSchool } = require('../services/demoSchool.service');
const { verifyUnsubscribeToken } = require('../services/demoEmails.service');

const router = express.Router();

const MAX_DEMOS_PER_EMAIL_PER_DAY = Number(process.env.DEMO_MAX_PER_EMAIL_PER_DAY || 2);
const MAX_CHILDREN = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const demoIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.DEMO_MAX_PER_IP_PER_HOUR || 3),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Ya creaste varias demos desde esta conexión. Intenta de nuevo en una hora.' },
});

function cleanText(value, max = 120) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

router.post('/', demoIpLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const schoolName = cleanText(body.schoolName, 90);
    const city = cleanText(body.city, 80);
    const contactName = cleanText(body.contactName, 90);
    const email = cleanText(body.email, 160).toLowerCase();
    const phone = cleanText(body.phone, 30);
    const password = String(body.password || '').trim();
    const children = (Array.isArray(body.children) ? body.children : [])
      .map((child) => cleanText(child, 80))
      .filter(Boolean)
      .slice(0, MAX_CHILDREN);

    if (!schoolName || !city || !contactName || !email || !phone) {
      return res.status(400).json({ message: 'Completa los datos del colegio y de contacto.' });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: 'Escribe un correo electrónico válido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    if (!children.length) {
      return res.status(400).json({ message: 'Escribe el nombre de al menos un hijo.' });
    }

    const recentForEmail = await DemoLead.countDocuments({
      email,
      status: { $in: ['provisioning', 'ready'] },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    if (recentForEmail >= MAX_DEMOS_PER_EMAIL_PER_DAY) {
      return res.status(429).json({ message: 'Ya creaste demos con este correo hoy. Usa la que ya tienes o intenta mañana.' });
    }

    const demo = await createDemoSchool({
      schoolName,
      city,
      contactName,
      email,
      phone,
      password,
      children,
      requestIp: String(req.ip || ''),
    });

    return res.status(201).json(demo);
  } catch (error) {
    console.error(`[DEMO] creation failed: ${error.stack || error.message}`);
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : 'No pudimos crear tu demo en este momento. Intenta de nuevo en unos minutos.',
    });
  }
});

function renderUnsubscribePage({ title, body, form = '' }) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Comergio</title></head>
<body style="margin:0;background:#eaf1fb;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
<div style="max-width:480px;margin:48px auto;background:#fff;border-radius:18px;padding:32px 28px;box-shadow:0 14px 40px rgba(15,23,42,0.15);text-align:center;">
<h1 style="margin:0 0 12px;font-size:22px;">${title}</h1>
<p style="margin:0 0 20px;color:#475569;line-height:1.5;">${body}</p>
${form}
</div></body></html>`;
}

router.get('/unsubscribe/:token', (req, res) => {
  if (!verifyUnsubscribeToken(req.params.token)) {
    return res.status(404).send(renderUnsubscribePage({ title: 'Enlace no válido', body: 'Este enlace ya no es válido.' }));
  }
  return res.status(200).send(renderUnsubscribePage({
    title: 'Dejar de recibir correos',
    body: 'Confirma y no te enviaremos más correos de seguimiento sobre tu demo.',
    form: `<form method="post"><button type="submit" style="background:#1b6fe8;color:#fff;border:0;border-radius:999px;padding:13px 24px;font-size:15px;font-weight:700;cursor:pointer;">Confirmar</button></form>`,
  }));
});

router.post('/unsubscribe/:token', async (req, res) => {
  const leadId = verifyUnsubscribeToken(req.params.token);
  if (!leadId) {
    return res.status(404).send(renderUnsubscribePage({ title: 'Enlace no válido', body: 'Este enlace ya no es válido.' }));
  }
  await DemoLead.updateOne(
    { _id: leadId, followUpUnsubscribedAt: null },
    { $set: { followUpUnsubscribedAt: new Date() } },
  );
  return res.status(200).send(renderUnsubscribePage({
    title: 'Listo',
    body: 'No te enviaremos más correos de seguimiento. Si quieres hablar con nosotros, escríbenos por WhatsApp al +57 301 621 4806.',
  }));
});

module.exports = router;
