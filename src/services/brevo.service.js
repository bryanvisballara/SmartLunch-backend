function resolveSenderName(senderName = '') {
  const requestedName = String(senderName || '').trim();
  if (requestedName) return requestedName;

  const configuredName = String(process.env.BREVO_SENDER_NAME || '').trim();
  if (!configuredName || /smart\s*lunch|comergio/i.test(configuredName)) {
    return 'Comergio App';
  }

  return configuredName;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendBrevoEmail({ toEmail, toName, subject, htmlContent, textContent, senderEmail: requestedSenderEmail = '', senderName: requestedSenderName = '' }) {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();
  const senderEmail = String(requestedSenderEmail || process.env.BREVO_SENDER_EMAIL || 'verify@comergio.com').trim();
  const senderName = resolveSenderName(requestedSenderName);
  const safeEmail = String(toEmail || '').trim().toLowerCase();

  if (!safeEmail || !subject || !htmlContent || !textContent) {
    throw new Error('Missing email payload for Brevo');
  }

  if (!apiKey) {
    console.log(`[BREVO_DEV_FALLBACK] ${subject} -> ${safeEmail}`);
    return { mocked: true };
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: senderEmail,
        name: senderName,
      },
      to: [
        {
          email: safeEmail,
          name: toName || safeEmail,
        },
      ],
      subject,
      htmlContent,
      textContent,
    }),
  });

  if (!response.ok) {
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    const message = payload?.message || `Brevo request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return { sent: true };
}

function buildAcademicEmailShell({ eyebrow, title, intro, body, footer }) {
  return `
    <div style="margin:0;padding:0;background:#eef3f8;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef3f8;padding:24px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 16px 40px rgba(15,23,42,0.16);">
              <tr>
                <td style="background:linear-gradient(135deg,#0f172a 0%,#12345a 55%,#1d4e89 100%);padding:30px 28px 34px 28px;color:#ffffff;">
                  <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;opacity:0.9;">${eyebrow}</p>
                  <h1 style="margin:0;font-size:30px;line-height:1.15;font-weight:800;">${title}</h1>
                  <p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;opacity:0.95;">${intro}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:28px;color:#0f172a;font-size:15px;line-height:1.7;">
                  ${body}
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 28px 28px;color:#64748b;font-size:12px;line-height:1.6;">
                  ${footer}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function sendRegistrationVerificationEmail({ toEmail, toName, code }) {
  return sendBrevoEmail({
    toEmail,
    toName,
    subject: 'Bienvenido a Comergio App - Verifica tu correo',
    htmlContent: `
        <div style="margin:0;padding:0;background:#eaf1fb;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eaf1fb;padding:24px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 40px rgba(15,23,42,0.18);">
                  <tr>
                    <td bgcolor="#0f2749" style="background:#0f2749;background-image:linear-gradient(120deg,#0f172a 0%,#1d3557 45%,#334155 100%);padding:30px 28px 34px 28px;color:#ffffff;">
                      <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;opacity:0.9;">Comergio App</p>
                      <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:800;">Verifica tu correo</h1>
                      <p style="margin:12px 0 0 0;font-size:15px;line-height:1.5;opacity:0.95;">Estas a un paso de terminar tu registro.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:26px 28px 10px 28px;color:#0f172a;">
                      <p style="margin:0 0 14px 0;font-size:16px;line-height:1.55;">Hola${toName ? ` ${toName}` : ''},</p>
                      <p style="margin:0;font-size:15px;line-height:1.55;color:#334155;">Ingresa este codigo en la app para confirmar tu cuenta:</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 28px 8px 28px;">
                      <div style="display:inline-block;background:#eef4ff;border:1px solid #bfdbfe;color:#0f2749;font-size:34px;line-height:1;letter-spacing:10px;font-weight:800;border-radius:12px;padding:16px 20px;">${code}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 28px 26px 28px;">
                      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.5;color:#475569;">
                        <strong style="color:#0f172a;">Importante:</strong> este codigo expira en <strong>15 minutos</strong> desde la recepcion de este correo.
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 24px 28px;font-size:12px;line-height:1.5;color:#64748b;">
                      Si no solicitaste este registro, puedes ignorar este mensaje.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `,
    textContent: `Bienvenido a Comergio App. Estas a un paso de terminar tu registro. Ingresa el codigo de verificacion: ${code}. Importante: este codigo expira en 15 minutos desde la recepcion de este correo.`,
  });
}

async function sendPasswordResetCodeEmail({ toEmail, toName, code }) {
  return sendBrevoEmail({
    toEmail,
    toName,
    subject: 'Comergio App - Recuperacion de contrasena',
    htmlContent: `
        <div style="margin:0;padding:0;background:#eaf1fb;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eaf1fb;padding:24px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 40px rgba(15,23,42,0.18);">
                  <tr>
                    <td bgcolor="#0f2749" style="background:#0f2749;background-image:linear-gradient(120deg,#0f172a 0%,#1d3557 45%,#334155 100%);padding:30px 28px 34px 28px;color:#ffffff;">
                      <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;opacity:0.9;">Comergio App</p>
                      <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:800;">Recupera tu contrasena</h1>
                      <p style="margin:12px 0 0 0;font-size:15px;line-height:1.5;opacity:0.95;">Recibimos una solicitud para cambiar tu contrasena.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:26px 28px 10px 28px;color:#0f172a;">
                      <p style="margin:0 0 14px 0;font-size:16px;line-height:1.55;">Hola${toName ? ` ${toName}` : ''},</p>
                      <p style="margin:0;font-size:15px;line-height:1.55;color:#334155;">Ingresa este codigo en la app para crear una nueva contrasena:</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 28px 8px 28px;">
                      <div style="display:inline-block;background:#eef4ff;border:1px solid #bfdbfe;color:#0f2749;font-size:34px;line-height:1;letter-spacing:10px;font-weight:800;border-radius:12px;padding:16px 20px;">${code}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 28px 26px 28px;">
                      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.5;color:#475569;">
                        <strong style="color:#0f172a;">Importante:</strong> este codigo expira en <strong>15 minutos</strong>.
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 24px 28px;font-size:12px;line-height:1.5;color:#64748b;">
                      Si no solicitaste este cambio, puedes ignorar este mensaje.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `,
    textContent: `Recibimos una solicitud para cambiar tu contrasena en Comergio App. Ingresa este codigo de verificacion: ${code}. Importante: este codigo expira en 15 minutos.`,
  });
}

async function sendAcademicCommunicationEmail({ toEmail, toName, schoolName, title, body, authorName }) {
  const subject = `${schoolName || 'Comergio'} | ${title}`;
  const htmlContent = buildAcademicEmailShell({
    eyebrow: 'Comunicado a familias',
    title,
    intro: `La secretaría académica ha compartido un nuevo mensaje para tu familia${authorName ? ` por ${authorName}` : ''}.`,
    body: `
      <p style="margin:0 0 16px 0;">Hola${toName ? ` ${toName}` : ''},</p>
      <div style="background:#f8fafc;border:1px solid #dbe7f3;border-radius:16px;padding:18px 20px;white-space:pre-line;">${String(body || '').replace(/\n/g, '<br/>')}</div>
    `,
    footer: 'Este correo fue enviado automaticamente por Comergio para mantener informada a tu familia.',
  });

  return sendBrevoEmail({
    toEmail,
    toName,
    subject,
    htmlContent,
    textContent: `${schoolName || 'Comergio'}\n\n${title}\n\n${body}`,
  });
}

async function sendAcademicBillingEmail({ toEmail, toName, schoolName, title, intro, charges = [] }) {
  const subject = `${schoolName || 'Comergio'} | ${title}`;
  const chargeRows = (Array.isArray(charges) ? charges : []).map((charge) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${charge.concept}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${charge.studentName || 'Familia'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${charge.dueDateLabel}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${charge.amountLabel}</td>
    </tr>
  `).join('');

  const htmlContent = buildAcademicEmailShell({
    eyebrow: 'Cartera académica',
    title,
    intro,
    body: `
      <p style="margin:0 0 16px 0;">Hola${toName ? ` ${toName}` : ''},</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
        <thead>
          <tr style="background:#eff6ff;color:#0f172a;">
            <th align="left" style="padding:12px;">Concepto</th>
            <th align="left" style="padding:12px;">Alumno</th>
            <th align="left" style="padding:12px;">Vence</th>
            <th align="right" style="padding:12px;">Valor</th>
          </tr>
        </thead>
        <tbody>${chargeRows}</tbody>
      </table>
    `,
    footer: 'Puedes revisar el detalle actualizado desde la sección de pagos en la app del acudiente.',
  });

  return sendBrevoEmail({
    toEmail,
    toName,
    subject,
    htmlContent,
    textContent: `${intro}\n\n${(charges || []).map((charge) => `${charge.concept} | ${charge.studentName || 'Familia'} | ${charge.dueDateLabel} | ${charge.amountLabel}`).join('\n')}`,
  });
}

function buildGoogleCalendarLink({ title, details, location, date, time, durationMinutes = 60 }) {
  const [year, month, day] = String(date || '').split('-');
  const [hour = '00', minute = '00'] = String(time || '').split(':');
  if (!year || !month || !day) return '';

  const start = `${year}${month}${day}T${hour.padStart(2, '0')}${minute.padStart(2, '0')}00`;
  const startDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (Number.isNaN(startDate.getTime())) return '';

  const endDate = new Date(startDate.getTime() + Number(durationMinutes || 60) * 60 * 1000);
  const end = `${endDate.getFullYear()}${String(endDate.getMonth() + 1).padStart(2, '0')}${String(endDate.getDate()).padStart(2, '0')}T${String(endDate.getHours()).padStart(2, '0')}${String(endDate.getMinutes()).padStart(2, '0')}00`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details,
    location,
    ctz: 'America/Bogota',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function sendAdmissionAppointmentEmail({ toEmail, toName, schoolName, applicantName, grade, appointmentTypeLabel, appointmentDateLabel, appointmentDate, appointmentTime, notes, calendarLocation }) {
  const safeSchoolName = schoolName || 'Colegio';
  const safeApplicantName = applicantName || 'Aspirante';
  const safeAppointmentType = appointmentTypeLabel || 'Cita de admisiones';
  const safeDateLabel = appointmentDateLabel || appointmentDate || 'Fecha por confirmar';
  const safeTime = appointmentTime || 'Hora por confirmar';
  const safeLocation = calendarLocation || safeSchoolName;
  const subject = `${safeSchoolName} | Cita de admisiones confirmada`;
  const calendarDetails = [
    `Cita de admisiones para ${safeApplicantName}`,
    `Colegio: ${safeSchoolName}`,
    grade ? `Grado/programa: ${grade}` : '',
    `Tipo de cita: ${safeAppointmentType}`,
    notes ? `Notas: ${notes}` : '',
    'Este evento fue generado desde Comergio.',
  ].filter(Boolean).join('\n');
  const calendarLink = buildGoogleCalendarLink({
    title: `${safeSchoolName} - Cita de admisiones`,
    details: calendarDetails,
    location: safeLocation,
    date: appointmentDate,
    time: appointmentTime,
    durationMinutes: 60,
  });
  const notesBlock = notes ? `
    <div style="margin-top:18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:18px;padding:16px 18px;color:#7c2d12;">
      <p style="margin:0 0 6px 0;font-size:12px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#9a3412;">Mensaje de admisiones</p>
      <p style="margin:0;font-size:14px;line-height:1.65;">${escapeHtml(notes)}</p>
    </div>
  ` : '';
  const calendarButton = calendarLink ? `
    <a href="${calendarLink}" style="display:inline-block;margin-top:22px;background:#155e75;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-size:14px;font-weight:900;box-shadow:0 12px 24px rgba(21,94,117,0.24);">Añadir a Google Calendar</a>
  ` : '';
  const htmlContent = `
    <div style="margin:0;padding:0;background:#eef4f7;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef4f7;padding:28px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:650px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 55px rgba(15,23,42,0.18);">
              <tr>
                <td style="background:#0f2f3d;background-image:linear-gradient(135deg,#0f172a 0%,#155e75 56%,#2dd4bf 120%);padding:34px 30px 38px;color:#ffffff;">
                  <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;opacity:0.9;">Proceso de admisiones</p>
                  <h1 style="margin:0;font-size:32px;line-height:1.12;font-weight:900;">${escapeHtml(safeSchoolName)}</h1>
                  <p style="margin:14px 0 0 0;font-size:16px;line-height:1.6;opacity:0.96;">Tu cita de admisiones ha sido registrada. Te compartimos los detalles para que puedas asistir con tranquilidad.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:30px;color:#102033;">
                  <p style="margin:0 0 18px 0;font-size:16px;line-height:1.65;">Hola${toName ? ` ${escapeHtml(toName)}` : ''},</p>
                  <p style="margin:0 0 22px 0;font-size:15px;line-height:1.7;color:#3b4a5f;">La cita para el proceso de admisión de <strong style="color:#0f172a;">${escapeHtml(safeApplicantName)}</strong>${grade ? `, aspirante a <strong style="color:#0f172a;">${escapeHtml(grade)}</strong>` : ''}, quedó programada con la siguiente información:</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0 10px;">
                    <tr>
                      <td style="width:34%;padding:14px 16px;background:#f8fafc;border:1px solid #dbe7ef;border-right:0;border-radius:16px 0 0 16px;color:#64748b;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;">Tipo</td>
                      <td style="padding:14px 16px;background:#ffffff;border:1px solid #dbe7ef;border-left:0;border-radius:0 16px 16px 0;color:#0f172a;font-size:15px;font-weight:800;">${escapeHtml(safeAppointmentType)}</td>
                    </tr>
                    <tr>
                      <td style="width:34%;padding:14px 16px;background:#f8fafc;border:1px solid #dbe7ef;border-right:0;border-radius:16px 0 0 16px;color:#64748b;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;">Fecha</td>
                      <td style="padding:14px 16px;background:#ffffff;border:1px solid #dbe7ef;border-left:0;border-radius:0 16px 16px 0;color:#0f172a;font-size:15px;font-weight:800;">${escapeHtml(safeDateLabel)}</td>
                    </tr>
                    <tr>
                      <td style="width:34%;padding:14px 16px;background:#f8fafc;border:1px solid #dbe7ef;border-right:0;border-radius:16px 0 0 16px;color:#64748b;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;">Hora</td>
                      <td style="padding:14px 16px;background:#ffffff;border:1px solid #dbe7ef;border-left:0;border-radius:0 16px 16px 0;color:#0f172a;font-size:15px;font-weight:800;">${escapeHtml(safeTime)}</td>
                    </tr>
                    <tr>
                      <td style="width:34%;padding:14px 16px;background:#f8fafc;border:1px solid #dbe7ef;border-right:0;border-radius:16px 0 0 16px;color:#64748b;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;">Lugar</td>
                      <td style="padding:14px 16px;background:#ffffff;border:1px solid #dbe7ef;border-left:0;border-radius:0 16px 16px 0;color:#0f172a;font-size:15px;font-weight:800;">${escapeHtml(safeLocation)}</td>
                    </tr>
                  </table>
                  ${notesBlock}
                  ${calendarButton}
                </td>
              </tr>
              <tr>
                <td style="padding:0 30px 30px;color:#64748b;font-size:12px;line-height:1.65;">
                  Este correo fue enviado automaticamente por el equipo de admisiones a traves de Comergio. Si necesitas reprogramar, responde este mensaje o contacta al colegio.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return sendBrevoEmail({
    toEmail,
    toName,
    subject,
    senderEmail: process.env.ADMISSIONS_SENDER_EMAIL || 'berckley@comergio.com',
    senderName: `${safeSchoolName} Admisiones`,
    htmlContent,
    textContent: `${safeSchoolName}\n\nCita de admisiones confirmada\n\nAspirante: ${safeApplicantName}\nGrado/programa: ${grade || '-'}\nTipo: ${safeAppointmentType}\nFecha: ${safeDateLabel}\nHora: ${safeTime}\nLugar: ${safeLocation}${calendarLink ? `\n\nGoogle Calendar: ${calendarLink}` : ''}`,
  });
}

module.exports = {
  sendRegistrationVerificationEmail,
  sendPasswordResetCodeEmail,
  sendBrevoEmail,
  sendAcademicCommunicationEmail,
  sendAcademicBillingEmail,
  sendAdmissionAppointmentEmail,
};
