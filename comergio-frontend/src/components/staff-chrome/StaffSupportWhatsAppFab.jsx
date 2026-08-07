import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './StaffSupportWhatsAppFab.css';

const COMERGIO_SUPPORT_WHATSAPP = '573016214806';
const COMERGIO_SUPPORT_WHATSAPP_BASE = `https://wa.me/${COMERGIO_SUPPORT_WHATSAPP}`;

export const COMERGIO_TEACHER_SUPPORT_WHATSAPP_URL = `${COMERGIO_SUPPORT_WHATSAPP_BASE}?text=${encodeURIComponent('Hola, necesito ayuda con el portal docente de Comergio / quiero reportar una inconsistencia.')}`;

function resolveStaffPortalLabel(pathname = '') {
  const path = String(pathname || '').toLowerCase();
  if (path.startsWith('/campus/teacher')) return 'portal docente';
  if (path.startsWith('/rectoria')) return 'portal de rectoría';
  if (path.startsWith('/direccion')) return 'portal de dirección';
  if (path.startsWith('/coordinacion')) return 'portal de coordinación';
  if (path.startsWith('/academic-secretary/admissions')) return 'portal de admisiones';
  if (path.startsWith('/academic-secretary')) return 'portal de secretaría académica';
  if (path.startsWith('/cartera')) return 'portal de cartera';
  if (path.startsWith('/enfermeria')) return 'portal de enfermería';
  if (path.startsWith('/psicologia')) return 'portal de psicología';
  if (path.startsWith('/recursos-humanos')) return 'portal de recursos humanos';
  if (path.startsWith('/admin')) return 'portal de administración';
  return 'portal de staff de Comergio';
}

export function buildStaffSupportWhatsAppUrl(pathname = '') {
  const portalLabel = resolveStaffPortalLabel(pathname);
  return `${COMERGIO_SUPPORT_WHATSAPP_BASE}?text=${encodeURIComponent(`Hola, necesito ayuda con el ${portalLabel} de Comergio / quiero reportar una inconsistencia.`)}`;
}

export default function StaffSupportWhatsAppFab() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const whatsappUrl = useMemo(
    () => buildStaffSupportWhatsAppUrl(location.pathname),
    [location.pathname]
  );
  const portalLabel = useMemo(
    () => resolveStaffPortalLabel(location.pathname),
    [location.pathname]
  );

  return (
    <>
      <button
        aria-label="Abrir ayuda por WhatsApp"
        className="staff-support-whatsapp-fab"
        onClick={() => setOpen(true)}
        title="Ayuda / reportar inconsistencia"
        type="button"
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M12 21a9 9 0 1 0-7.8-4.5L3 21l4.6-1.2A8.9 8.9 0 0 0 12 21Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M8.4 10.2c.4-1 1.1-1.7 2-1.9.5-.1 1 .2 1.1.7l.3 1.1c.1.4 0 .8-.3 1L10.8 12c.5 1 1.4 1.9 2.4 2.4l.9-.7c.3-.2.7-.3 1-.3l1.1.3c.5.1.8.6.7 1.1-.2.9-.9 1.6-1.9 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
        <span>Ayuda</span>
      </button>

      {open ? (
        <div
          className="staff-support-whatsapp-fab__backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            aria-labelledby="staff-support-whatsapp-title"
            aria-modal="true"
            className="staff-support-whatsapp-fab__modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <span className="staff-support-whatsapp-fab__kicker">Soporte Comergio</span>
            <h3 id="staff-support-whatsapp-title">¿Para qué es este botón?</h3>
            <p>
              Úsalo para pedir ayuda con el {portalLabel} o para reportar una inconsistencia del software.
              Te llevaremos a WhatsApp para escribirle al equipo de soporte.
            </p>
            <ul>
              <li>Dudas de uso del portal</li>
              <li>Errores o comportamientos inesperados</li>
              <li>Sugerencias rápidas de mejora</li>
            </ul>
            <div className="staff-support-whatsapp-fab__actions">
              <button
                className="staff-support-whatsapp-fab__cancel"
                onClick={() => setOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <a
                className="staff-support-whatsapp-fab__continue"
                href={whatsappUrl}
                onClick={() => setOpen(false)}
                rel="noopener noreferrer"
                target="_blank"
              >
                Continuar a WhatsApp
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
