const crypto = require('crypto');
const { sendBrevoEmail } = require('./brevo.service');

const WHATSAPP_NUMBER = '573016214806';
const APP_STORE_URL = 'https://apps.apple.com/app/id6760672707';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.comergio.app&hl=es_CO';
const REPLY_TO_EMAIL = process.env.DEMO_REPLY_TO_EMAIL || 'gerencia@comergio.com';

function signUnsubscribeToken(leadId) {
  const id = String(leadId);
  const signature = crypto
    .createHmac('sha256', String(process.env.JWT_SECRET || 'comergio-demo'))
    .update(`demo-unsubscribe:${id}`)
    .digest('base64url')
    .slice(0, 24);
  return `${id}.${signature}`;
}

function verifyUnsubscribeToken(token) {
  const [id = ''] = String(token || '').split('.');
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    return '';
  }
  const expected = signUnsubscribeToken(id);
  const received = String(token);
  if (expected.length !== received.length) {
    return '';
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received)) ? id : '';
}

function buildUnsubscribeUrl(leadId) {
  const base = String(
    process.env.BACKEND_PUBLIC_URL || process.env.PUBLIC_BACKEND_URL || process.env.API_PUBLIC_URL || 'https://api.comergio.com',
  ).trim().replace(/\/+$/, '');
  return `${base}/public/demo/unsubscribe/${signUnsubscribeToken(leadId)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildWhatsappUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function button(href, label, { background = '#16a34a' } = {}) {
  return `
    <a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="display:inline-block;background:${background};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;line-height:1;padding:15px 26px;border-radius:999px;">${escapeHtml(label)}</a>
  `;
}

function buildDemoEmailShell({ eyebrow, title, intro, body, ctaHref, ctaLabel, unsubscribeUrl = '' }) {
  return `
    <div style="margin:0;padding:0;background:#eaf1fb;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eaf1fb;padding:24px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 40px rgba(15,23,42,0.18);">
              <tr>
                <td bgcolor="#071828" style="background:#071828;background-image:linear-gradient(120deg,#071828 0%,#0f2f4d 55%,#0e8f62 130%);padding:30px 28px 34px 28px;color:#ffffff;">
                  <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;opacity:0.9;">${escapeHtml(eyebrow)}</p>
                  <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:800;">${escapeHtml(title)}</h1>
                  ${intro ? `<p style="margin:12px 0 0 0;font-size:15px;line-height:1.5;opacity:0.95;">${escapeHtml(intro)}</p>` : ''}
                </td>
              </tr>
              <tr>
                <td style="padding:26px 28px 8px 28px;color:#0f172a;font-size:15px;line-height:1.6;">
                  ${body}
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:14px 28px 30px 28px;">
                  ${button(ctaHref, ctaLabel)}
                </td>
              </tr>
              <tr>
                <td style="padding:18px 28px 24px 28px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
                  Comergio · Una marca de WW TECNO S.A.S<br />
                  Recibes este correo porque creaste una demo en comergio.com.
                  ${unsubscribeUrl ? `<br /><a href="${escapeHtml(unsubscribeUrl)}" style="color:#64748b;">No quiero recibir más correos de seguimiento</a>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

async function sendDemoWelcomeEmail({ email, contactName, schoolName, children = [] }) {
  const name = firstName(contactName);
  const childrenLabel = children.map((child) => `${child.name} (${child.gradeLabel})`).join(', ');
  const whatsappUrl = buildWhatsappUrl(`Hola, soy ${contactName} de ${schoolName}. Creé una demo de Comergio y quiero probar los portales del colegio.`);

  const body = `
    <p style="margin:0 0 14px 0;">Hola${name ? ` ${escapeHtml(name)}` : ''},</p>
    <p style="margin:0 0 14px 0;">Ya creamos <strong>${escapeHtml(schoolName)}</strong> en Comergio. Tu demo estará disponible durante <strong>7 días</strong>; después la eliminamos automáticamente.</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:0 0 18px 0;">
      <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.6px;">Cómo entrar</p>
      <p style="margin:0 0 4px 0;">1. Descarga la app: <a href="${APP_STORE_URL}" style="color:#1b6fe8;">iPhone</a> · <a href="${PLAY_STORE_URL}" style="color:#1b6fe8;">Android</a></p>
      <p style="margin:0 0 4px 0;">2. Selecciona el colegio <strong>${escapeHtml(schoolName)}</strong></p>
      <p style="margin:0;">3. Usuario: <strong>${escapeHtml(email)}</strong> y la contraseña que definiste.</p>
    </div>

    <p style="margin:0 0 10px 0;">Entras como acudiente${childrenLabel ? ` de ${escapeHtml(childrenLabel)}` : ''}. Te recomendamos probar todo:</p>
    <ul style="margin:0 0 18px 0;padding-left:20px;color:#334155;">
      <li>Pagar la pensión con un solo botón.</li>
      <li>Recargar la cafetería y poner un tope diario.</li>
      <li>Ver notas, tareas y el ranking del curso.</li>
      <li>Revisar enfermería, bienestar y la ruta escolar.</li>
      <li>Leer y reaccionar a las noticias del colegio.</li>
    </ul>

    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:14px 16px;">
      <p style="margin:0;color:#065f46;">¿Quieres ver el otro lado? El <strong>portal del docente</strong>, <strong>cartera</strong>, <strong>coordinación</strong>, rectoría, enfermería y admisiones también están listos. Escríbenos y te damos acceso en una demo guiada.</p>
    </div>
  `;

  return sendBrevoEmail({
    toEmail: email,
    toName: contactName,
    subject: `Tu demo de ${schoolName} en Comergio está lista`,
    senderName: 'Comergio',
    replyToEmail: REPLY_TO_EMAIL,
    replyToName: 'Comergio',
    htmlContent: buildDemoEmailShell({
      eyebrow: 'Demo gratis · 7 días',
      title: `¡Bienvenido a Comergio${name ? `, ${name}` : ''}!`,
      intro: 'Has dado el primer paso para llevar a tu colegio a un siguiente nivel.',
      body,
      ctaHref: whatsappUrl,
      ctaLabel: 'Quiero probar los portales del colegio',
    }),
    textContent: [
      `Hola ${name},`,
      `Ya creamos ${schoolName} en Comergio. Tu demo estará disponible durante 7 días.`,
      `Descarga la app (iPhone: ${APP_STORE_URL} · Android: ${PLAY_STORE_URL}), selecciona ${schoolName} y entra con ${email} y la contraseña que definiste.`,
      'Prueba pagos, cafetería, notas, enfermería, bienestar, ruta y noticias del colegio.',
      `¿Quieres probar el portal del docente, cartera o coordinación? Escríbenos por WhatsApp: ${whatsappUrl}`,
    ].join('\n\n'),
  });
}

const paragraph = (html) => `<p style="margin:0 0 14px 0;">${html}</p>`;
const bulletList = (items) => `
  <ul style="margin:0 0 18px 0;padding-left:20px;color:#334155;">
    ${items.map((item) => `<li style="margin:0 0 6px 0;">${item}</li>`).join('')}
  </ul>
`;
const highlight = (html, { tone = 'green' } = {}) => {
  const palette = tone === 'amber'
    ? { background: '#fffbeb', border: '#fcd34d', color: '#92400e' }
    : { background: '#ecfdf5', border: '#a7f3d0', color: '#065f46' };
  return `<div style="background:${palette.background};border:1px solid ${palette.border};border-radius:12px;padding:14px 16px;margin:0 0 16px 0;color:${palette.color};">${html}</div>`;
};
const stats = (items) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
    <tr>
      ${items.map((item) => `
        <td align="center" style="padding:12px 6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;width:${Math.floor(100 / items.length)}%;">
          <div style="font-size:24px;font-weight:800;color:#0e8f62;">${item.value}</div>
          <div style="font-size:12px;color:#475569;line-height:1.35;">${item.label}</div>
        </td>
      `).join('<td style="width:8px;"></td>')}
    </tr>
  </table>
`;

const FOLLOW_UP_DAYS = [1, 2, 3, 4, 5, 6];

function buildFollowUpContent(day, { name, schoolName }) {
  const hello = paragraph(`Hola${name ? ` ${escapeHtml(name)}` : ''},`);
  const school = escapeHtml(schoolName);

  switch (day) {
    case 1:
      return {
        subject: '¿Ya pagaste tu primera pensión en 10 segundos?',
        eyebrow: 'Día 1 · Pagos',
        title: 'Pagar la pensión no debería ser un trámite',
        intro: 'Hoy un acudiente puede necesitar más de ocho pasos para pagar. Con Comergio es un botón.',
        body: [
          hello,
          paragraph(`En tu demo de <strong>${school}</strong> ya tienes una pensión pendiente. Entra a <strong>Pagos</strong> y mira lo que vive una familia:`),
          stats([
            { value: '10 s', label: 'para pagar desde el celular' },
            { value: '30%', label: 'menos cartera morosa' },
            { value: '24/7', label: 'recordatorios automáticos' },
          ]),
          bulletList([
            'Ve el valor exacto, con descuentos por pronto pago aplicados.',
            'Paga en línea sin salir de la app.',
            'Guarda la tarjeta para débito automático cada mes.',
          ]),
          paragraph('Cuando pagar es fácil, las familias pagan a tiempo.'),
        ].join(''),
        ctaLabel: 'Quiero reducir mi cartera',
        whatsappMessage: `Hola, soy ${name} de ${schoolName}. Vi el módulo de pagos en la demo y quiero saber cómo reducir la cartera.`,
      };
    case 2:
      return {
        subject: 'Adiós a los correos que nadie lee',
        eyebrow: 'Día 2 · Comunicación',
        title: 'Un feed que las familias sí leen',
        intro: 'Las circulares por correo se pierden; los grupos de WhatsApp se saturan.',
        body: [
          hello,
          paragraph(`Abre el inicio de la app en tu demo: ahí está el feed de <strong>${school}</strong>, con fotos, reacciones y comentarios.`),
          bulletList([
            'Cada publicación llega como notificación push al celular.',
            'Publicaciones generales, por grado o solo para un curso.',
            'Sin exponer el número personal de los docentes.',
          ]),
          highlight('<strong>Prueba esto:</strong> reacciona a la publicación de bienvenida y revisa las notificaciones de la campana.'),
        ].join(''),
        ctaLabel: 'Quiero comunicar mejor',
        whatsappMessage: `Hola, soy ${name} de ${schoolName}. Me interesa el feed de comunicaciones de Comergio.`,
      };
    case 3:
      return {
        subject: 'Así se ve tu colegio desde el lado del docente',
        eyebrow: 'Día 3 · Académico',
        title: 'Notas y tareas que llegan solas a casa',
        intro: 'Lo que el docente registra en clase, la familia lo ve al instante.',
        body: [
          hello,
          paragraph('En tu demo ya puedes ver las notas, tareas y el ranking del curso de tus hijos. Detrás de eso hay un portal para el docente donde:'),
          bulletList([
            'Califica desde el celular o el computador, por actividad.',
            'Publica tareas con adjuntos y fecha de entrega.',
            'Toma asistencia en segundos y avisa ausencias a la familia.',
            'Coordinación hace seguimiento a todos los cursos.',
          ]),
          highlight('El portal del docente no está en la demo de acudiente. <strong>Escríbenos y te lo mostramos</strong> con tu colegio.'),
        ].join(''),
        ctaLabel: 'Quiero ver el portal docente',
        whatsappMessage: `Hola, soy ${name} de ${schoolName}. Quiero ver el portal del docente de Comergio.`,
      };
    case 4:
      return {
        subject: 'Cafetería sin efectivo y sin filas',
        eyebrow: 'Día 4 · Cafetería',
        title: 'El acudiente sabe qué come su hijo',
        intro: 'El efectivo en la cafetería no deja rastro para la familia ni para el colegio.',
        body: [
          hello,
          paragraph('Entra a <strong>Cafetería</strong> en tu demo y prueba:'),
          bulletList([
            'Recargar saldo en un toque y activar la recarga automática.',
            'Poner un tope diario de consumo.',
            'Ver cada compra con hora, producto y valor.',
            'Preordenar la merienda para evitar filas en el descanso.',
          ]),
          paragraph('El colegio y el concesionario ganan control de inventario, cierres diarios y cero manejo de efectivo.'),
        ].join(''),
        ctaLabel: 'Quiero la cafetería conectada',
        whatsappMessage: `Hola, soy ${name} de ${schoolName}. Me interesa la cafetería conectada de Comergio.`,
      };
    case 5:
      return {
        subject: 'Cartera, coordinación y rectoría en un solo lugar',
        eyebrow: 'Día 5 · Gestión del colegio',
        title: 'Menos plataformas, más control',
        intro: 'Lo que viste como acudiente es la mitad. La otra mitad es la operación del colegio.',
        body: [
          hello,
          paragraph(`Además de la app de familias, <strong>${school}</strong> tendría portales para cada área:`),
          bulletList([
            '<strong>Cartera:</strong> estado de cuenta por familia, recordatorios automáticos y conciliación de pagos.',
            '<strong>Coordinación:</strong> convivencia, asistencia y seguimiento académico.',
            '<strong>Rectoría:</strong> indicadores del colegio en tiempo real.',
            '<strong>Enfermería, bienestar, admisiones y talento humano.</strong>',
          ]),
          highlight('Agenda una demo guiada de 20 minutos y te mostramos estos portales con datos de ejemplo.'),
        ].join(''),
        ctaLabel: 'Quiero una demo guiada',
        whatsappMessage: `Hola, soy ${name} de ${schoolName}. Quiero agendar una demo guiada de los portales del colegio.`,
      };
    case 6:
      return {
        subject: `Tu demo de ${schoolName} se elimina mañana`,
        eyebrow: 'Día 6 · Último día',
        title: 'Mañana se elimina tu demo',
        intro: 'Si quieres seguir explorando, todavía estás a tiempo.',
        body: [
          hello,
          paragraph(`Tu demo de <strong>${school}</strong> se elimina automáticamente mañana, junto con los datos de ejemplo.`),
          highlight('<strong>¿Quieres más tiempo?</strong> Podemos extender tu demo o montar un piloto con la información real de tu colegio: cursos, familias y pensiones.', { tone: 'amber' }),
          paragraph('Con Comergio, el colegio deja de cobrar con correos y llamadas: las familias pagan desde la app y reciben todo en un solo lugar.'),
        ].join(''),
        ctaLabel: 'Quiero extender mi demo',
        whatsappMessage: `Hola, soy ${name} de ${schoolName}. Mi demo se vence mañana y quiero extenderla o hablar de un piloto.`,
      };
    default:
      return null;
  }
}

function buildDemoFollowUpEmail(day, { email, contactName, schoolName, unsubscribeUrl = '' }) {
  const name = firstName(contactName);
  const content = buildFollowUpContent(day, { name, schoolName });
  if (!content) {
    return null;
  }
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
      unsubscribeUrl,
    }),
    textContent: [
      content.title,
      content.intro,
      content.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      `${content.ctaLabel}: ${ctaHref}`,
      unsubscribeUrl ? `Dejar de recibir estos correos: ${unsubscribeUrl}` : '',
    ].filter(Boolean).join('\n\n'),
  };
}

async function sendDemoFollowUpEmail(day, params) {
  const email = buildDemoFollowUpEmail(day, params);
  if (!email) {
    throw new Error(`No hay correo de seguimiento para el día ${day}`);
  }
  return sendBrevoEmail({
    ...email,
    senderName: 'Comergio',
    replyToEmail: REPLY_TO_EMAIL,
    replyToName: 'Comergio',
  });
}

module.exports = {
  FOLLOW_UP_DAYS,
  buildUnsubscribeUrl,
  verifyUnsubscribeToken,
  buildDemoEmailShell,
  buildDemoFollowUpEmail,
  buildWhatsappUrl,
  sendDemoFollowUpEmail,
  sendDemoWelcomeEmail,
};
