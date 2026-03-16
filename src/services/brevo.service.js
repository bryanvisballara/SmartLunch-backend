async function sendRegistrationVerificationEmail({ toEmail, toName, code }) {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();
  const senderEmail = String(process.env.BREVO_SENDER_EMAIL || 'comergio@comergio.com').trim();
  const senderName = String(process.env.BREVO_SENDER_NAME || 'Comergio').trim();

  if (!apiKey) {
    // Development fallback so flow can be tested before Brevo credentials are configured.
    console.log(`[BREVO_DEV_FALLBACK] verification code for ${toEmail}: ${code}`);
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
          email: toEmail,
          name: toName || toEmail,
        },
      ],
      subject: 'Bienvenido a Comergio - Verifica tu correo',
      htmlContent: `
        <div style="margin:0;padding:0;background:#eaf1fb;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eaf1fb;padding:24px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 40px rgba(15,23,42,0.18);">
                  <tr>
                    <td bgcolor="#0f2749" style="background:#0f2749;background-image:linear-gradient(120deg,#0f172a 0%,#1d3557 45%,#334155 100%);padding:30px 28px 34px 28px;color:#ffffff;">
                      <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;opacity:0.9;">Comergio</p>
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
      textContent: `Bienvenido a Comergio. Estas a un paso de terminar tu registro. Ingresa el codigo de verificacion: ${code}. Importante: este codigo expira en 15 minutos desde la recepcion de este correo.`,
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

async function sendPasswordResetCodeEmail({ toEmail, toName, code }) {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();
  const senderEmail = String(process.env.BREVO_SENDER_EMAIL || 'comergio@comergio.com').trim();
  const senderName = String(process.env.BREVO_SENDER_NAME || 'Comergio').trim();

  if (!apiKey) {
    console.log(`[BREVO_DEV_FALLBACK] password reset code for ${toEmail}: ${code}`);
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
          email: toEmail,
          name: toName || toEmail,
        },
      ],
      subject: 'Comergio - Recuperacion de contrasena',
      htmlContent: `
        <div style="margin:0;padding:0;background:#eaf1fb;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eaf1fb;padding:24px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 40px rgba(15,23,42,0.18);">
                  <tr>
                    <td bgcolor="#0f2749" style="background:#0f2749;background-image:linear-gradient(120deg,#0f172a 0%,#1d3557 45%,#334155 100%);padding:30px 28px 34px 28px;color:#ffffff;">
                      <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;opacity:0.9;">Comergio</p>
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
      textContent: `Recibimos una solicitud para cambiar tu contrasena en Comergio. Ingresa este codigo de verificacion: ${code}. Importante: este codigo expira en 15 minutos.`,
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

module.exports = { sendRegistrationVerificationEmail, sendPasswordResetCodeEmail };
