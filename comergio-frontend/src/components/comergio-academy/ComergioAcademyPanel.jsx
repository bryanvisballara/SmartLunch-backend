import { useEffect, useMemo, useState } from 'react';
import {
  COMERGIO_ACADEMY_CHILDREN,
  COMERGIO_ACADEMY_PARENT,
  isComergioAcademySection,
} from './academyNav';
import { AcademyNotificationBadge } from './AcademyNotificationBadge';
import ConectaPanel from './ConectaPanel';
import InformaPanel from './InformaPanel';
import { useComergioAcademyNotificationCounts } from './useComergioAcademyNotificationCounts';
import {
  ACADEMY_TUTORIAL_PORTALS,
  getAcademyPopularVideos,
  getAcademyPortalByKey,
  getAcademyPortalVideoCount,
  getAcademyVideoThumb,
  getAcademyVideosForPortal,
} from './academyVideos';
import './ComergioAcademyPanel.css';

function AcademyChildIcon({ icon }) {
  const common = {
    fill: 'none',
    viewBox: '0 0 24 24',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  };

  switch (icon) {
    case 'video':
      return (
        <svg {...common}>
          <path d="M5 6.5h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M17 10.2 21 8v8l-4-2.2" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'connect':
      return (
        <svg {...common}>
          <path d="M9.5 14.5 14.5 9.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <path d="M11 7.5 12.2 6.3a3.5 3.5 0 1 1 5 5L16 12.5M13 16.5 11.8 17.7a3.5 3.5 0 1 1-5-5L8 11.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'informa':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 11v5M12 8h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M4 10.5 12 6l8 4.5-8 4.5-8-4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
  }
}

function PortalToneIcon({ icon }) {
  const common = {
    fill: 'none',
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  };

  switch (icon) {
    case 'grad':
      return (
        <svg {...common}>
          <path d="M3 10.5 12 6l9 4.5-9 4.5-9-4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M7 13.2v3.3c0 .8 2.2 2 5 2s5-1.2 5-2v-3.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case 'building':
      return (
        <svg {...common}>
          <path d="M5 20V6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V20" stroke="currentColor" strokeWidth="1.7" />
          <path d="M9 9h2M13 9h2M9 13h2M13 13h2M9 17h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case 'people':
    case 'team':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="16.5" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.7" />
          <path d="M3.8 18.5a5.2 5.2 0 0 1 10.4 0M13.2 18.5a4.2 4.2 0 0 1 7 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...common}>
          <path d="M4 8.5h5l1.5 1.5H20v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V8.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'person':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case 'wallet':
      return (
        <svg {...common}>
          <path d="M4 8.5h14.5A1.5 1.5 0 0 1 20 10v8.5A1.5 1.5 0 0 1 18.5 20H5.5A1.5 1.5 0 0 1 4 18.5V8.5Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M4 8.5 6.2 5.8A1.5 1.5 0 0 1 7.4 5.3H17" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <circle cx="15.5" cy="14.2" fill="currentColor" r="1.1" />
        </svg>
      );
    case 'food':
      return (
        <svg {...common}>
          <path d="M8 4v7.5a2 2 0 0 0 2 2V20" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <path d="M6 4v5.5M10 4v5.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <path d="M16 4v6c0 1.5.8 2.5 2 2.8V20" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <path d="M16 4c1.8 0 3 1.2 3 3.2V10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case 'bus':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M7 16.5v2M17 16.5v2M4 12h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <circle cx="8" cy="14" fill="currentColor" r="1.1" />
          <circle cx="16" cy="14" fill="currentColor" r="1.1" />
        </svg>
      );
    case 'cross':
      return (
        <svg {...common}>
          <path d="M9 4.5h6v4.5h4.5v6H15V20H9v-4.5H4.5v-6H9V4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'brain':
      return (
        <svg {...common}>
          <path d="M9.5 5.5a3 3 0 0 0-3 3v1.2A2.8 2.8 0 0 0 5 12.3c0 1.2.7 2.2 1.7 2.6V17a2 2 0 0 0 2 2h1.3M14.5 5.5a3 3 0 0 1 3 3v1.2A2.8 2.8 0 0 1 19 12.3c0 1.2-.7 2.2-1.7 2.6V17a2 2 0 0 1-2 2H14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <path d="M12 5.5V19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
  }
}

function TutorialsHeroArt() {
  return (
    <svg aria-hidden="true" className="academy-videos__hero-art" fill="none" viewBox="0 0 180 120">
      <rect fill="#dbeafe" height="70" rx="10" width="110" x="28" y="34" />
      <rect fill="#fff" height="52" rx="6" width="94" x="36" y="42" />
      <circle cx="83" cy="68" fill="#3b82f6" r="14" />
      <path d="M79 61.5v13l12-6.5-12-6.5Z" fill="#fff" />
      <path d="M118 28c8-2 16 2 18 9" stroke="#60a5fa" strokeDasharray="3 4" strokeLinecap="round" strokeWidth="2" />
      <path d="M122 18h18l-3 8h-6l-2 7-4-4-3 3-4-5 4-3-4-6Z" fill="#2563eb" />
      <rect fill="#93c5fd" height="6" rx="3" width="42" x="62" y="108" />
    </svg>
  );
}

const CHILD_ICONS = {
  video_tutoriales: 'video',
  conecta: 'connect',
  informa: 'informa',
};

const CHILD_TONE = {
  video_tutoriales: 'video',
  conecta: 'conecta',
  informa: 'informa',
};

const COMERGIO_SUPPORT_WHATSAPP = '573016214806';
const COMERGIO_SUPPORT_WHATSAPP_BASE = `https://wa.me/${COMERGIO_SUPPORT_WHATSAPP}`;
const TUTORIAL_REQUEST_WHATSAPP = `${COMERGIO_SUPPORT_WHATSAPP_BASE}?text=${encodeURIComponent('Hola, quiero solicitar un tutorial de Comergio Academy.')}`;
export const COMERGIO_TEACHER_SUPPORT_WHATSAPP_URL = `${COMERGIO_SUPPORT_WHATSAPP_BASE}?text=${encodeURIComponent('Hola, necesito ayuda con el portal docente de Comergio / quiero reportar una inconsistencia.')}`;
// Kept for compatibility; staff portals use StaffSupportWhatsAppFab.

function formatDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (total <= 0) return '';
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function VideoTutorialesSection() {
  const [selectedPortalKey, setSelectedPortalKey] = useState('');
  const popularVideos = useMemo(() => getAcademyPopularVideos(3), []);
  const selectedPortal = getAcademyPortalByKey(selectedPortalKey);
  const selectedVideos = selectedPortalKey ? getAcademyVideosForPortal(selectedPortalKey) : [];

  const openPortal = (portalKey) => {
    setSelectedPortalKey(portalKey);
    window.requestAnimationFrame(() => {
      document.getElementById('academy-videos-detail')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="academy-videos">
      <header className="academy-videos__hero">
        <div>
          <span className="academy-videos__kicker">Video tutoriales</span>
          <h2>Aprende a usar el portal con guías en video.</h2>
          <p>Elige un portal para ver sus tutoriales. Los de padres y alumnos no aparecen aquí.</p>
        </div>
        <TutorialsHeroArt />
      </header>

      <div className="academy-videos__layout">
        <div className="academy-videos__main">
          {!selectedPortalKey ? (
            <>
              <div className="academy-videos__portal-grid">
                {ACADEMY_TUTORIAL_PORTALS.map((portal) => {
                  const readyCount = getAcademyPortalVideoCount(portal.key);
                  return (
                    <button
                      className={`academy-videos__portal-card tone-${portal.tone}`}
                      key={portal.key}
                      onClick={() => openPortal(portal.key)}
                      type="button"
                    >
                      <span className="academy-videos__portal-icon" aria-hidden="true">
                        <PortalToneIcon icon={portal.icon} />
                      </span>
                      <span className="academy-videos__portal-copy">
                        <strong>{portal.label}</strong>
                        <em>
                          {readyCount > 0
                            ? `${readyCount} video${readyCount === 1 ? '' : 's'} disponible${readyCount === 1 ? '' : 's'}`
                            : 'Sin videos aún'}
                        </em>
                      </span>
                      <span className="academy-videos__portal-chevron" aria-hidden="true">›</span>
                    </button>
                  );
                })}
              </div>

              <div className="academy-videos__banner">
                <span aria-hidden="true">i</span>
                <p>
                  Los tutoriales te ayudarán a aprovechar al máximo todas las herramientas del portal.
                  {' '}
                  ¿No encuentras lo que buscas?
                  {' '}
                  <a href={TUTORIAL_REQUEST_WHATSAPP} rel="noopener noreferrer" target="_blank">Solicita un tutorial aquí.</a>
                </p>
              </div>
            </>
          ) : (
            <section className="academy-videos__detail" id="academy-videos-detail">
              <div className="academy-videos__detail-head">
                <button className="academy-videos__back" onClick={() => setSelectedPortalKey('')} type="button">
                  ← Volver a portales
                </button>
                <div>
                  <span className="academy-videos__kicker">{selectedPortal?.label || 'Portal'}</span>
                  <h3>Tutoriales de {selectedPortal?.label || 'este portal'}</h3>
                </div>
              </div>

              {selectedVideos.length === 0 ? (
                <div className="academy-videos__empty">
                  <strong>Pronto habrá tutoriales aquí</strong>
                  <p>Estamos preparando los videos de este portal. Mientras tanto puedes solicitar uno personalizado.</p>
                  <a className="academy-videos__request-btn" href={TUTORIAL_REQUEST_WHATSAPP} rel="noopener noreferrer" target="_blank">Solicitar tutorial</a>
                </div>
              ) : (
                <div className="academy-videos__video-list">
                  {selectedVideos.map((video) => (
                    <article className="academy-videos__video-card" key={video.id}>
                      <div className="academy-videos__video-head">
                        <div>
                          <strong>{video.title}</strong>
                          {video.description ? <p>{video.description}</p> : null}
                        </div>
                        {video.durationLabel || video.duration ? (
                          <span className="academy-videos__video-duration">
                            {video.durationLabel || formatDuration(video.duration)}
                          </span>
                        ) : null}
                      </div>
                      {video.url ? (
                        <video
                          className="academy-videos__player"
                          controls
                          playsInline
                          preload="metadata"
                          poster={getAcademyVideoThumb(video)}
                          src={video.url}
                        >
                          Tu navegador no reproduce este video.
                        </video>
                      ) : (
                        <div className="academy-videos__empty is-compact">
                          <p>Video en proceso de publicación.</p>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="academy-videos__sidebar">
          <section className="academy-videos__side-card">
            <div className="academy-videos__side-head">
              <span aria-hidden="true">🛟</span>
              <h3>¿Necesitas ayuda?</h3>
            </div>
            <p>Consulta nuestras guías o solicita un tutorial personalizado.</p>
            <a className="academy-videos__request-btn" href={TUTORIAL_REQUEST_WHATSAPP} rel="noopener noreferrer" target="_blank">Solicitar tutorial</a>
          </section>

          <section className="academy-videos__side-card">
            <div className="academy-videos__side-head">
              <span aria-hidden="true">▶</span>
              <h3>Tutoriales populares</h3>
            </div>
            {popularVideos.length === 0 ? (
              <p className="academy-videos__side-empty">Pronto verás aquí los tutoriales más vistos.</p>
            ) : (
              <div className="academy-videos__popular-list">
                {popularVideos.map((video) => (
                  <button
                    className="academy-videos__popular-item"
                    key={video.id}
                    onClick={() => openPortal(video.portalKey)}
                    type="button"
                  >
                    <span className="academy-videos__popular-thumb">
                      {video.thumbUrl ? <img alt="" src={video.thumbUrl} /> : null}
                      <em>{video.durationLabel || formatDuration(video.duration) || 'Video'}</em>
                    </span>
                    <span>
                      <strong>{video.title}</strong>
                      <small>{video.portalLabel}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button
              className="academy-videos__side-link"
              onClick={() => {
                setSelectedPortalKey('');
                window.requestAnimationFrame(() => {
                  document.querySelector('.academy-videos__portal-grid')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
                });
              }}
              type="button"
            >
              Ver todos los tutoriales →
            </button>
          </section>

          <section className="academy-videos__side-card">
            <div className="academy-videos__side-head">
              <span aria-hidden="true">📦</span>
              <h3>Novedades</h3>
              <em className="academy-videos__new-pill">Nuevo</em>
            </div>
            <p>Nuevos tutoriales disponibles. Revisa los últimos videos agregados este mes.</p>
            <button
              className="academy-videos__side-link"
              onClick={() => openPortal(popularVideos[0]?.portalKey || 'teacher')}
              type="button"
            >
              Ver novedades →
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function ComergioAcademyPanel({
  activeKey = COMERGIO_ACADEMY_PARENT.key,
  className = '',
  notificationCounts,
  onNavigate,
  showLandingCards = true,
  showInternalNav = false,
}) {
  const liveCounts = useComergioAcademyNotificationCounts(!notificationCounts);
  const counts = notificationCounts
    ? {
        conecta: Number(notificationCounts.conecta || 0),
        informa: Number(notificationCounts.informa || 0),
        total: Number(notificationCounts.conecta || 0) + Number(notificationCounts.informa || 0),
      }
    : liveCounts;
  const [internalKey, setInternalKey] = useState(
    isComergioAcademySection(activeKey) ? activeKey : COMERGIO_ACADEMY_PARENT.key,
  );

  useEffect(() => {
    if (isComergioAcademySection(activeKey)) {
      setInternalKey(activeKey);
    }
  }, [activeKey]);

  const resolvedKey = onNavigate ? activeKey : internalKey;
  const selectKey = (nextKey) => {
    if (onNavigate) {
      onNavigate(nextKey);
      return;
    }
    setInternalKey(nextKey);
  };

  const activeChild = COMERGIO_ACADEMY_CHILDREN.find((child) => child.key === resolvedKey) || null;
  const showLanding = resolvedKey === COMERGIO_ACADEMY_PARENT.key || (!activeChild && showLandingCards);
  const childCount = (key) => (key === 'conecta' ? counts.conecta : key === 'informa' ? counts.informa : 0);

  return (
    <article className={`comergio-academy-panel${className ? ` ${className}` : ''}`}>
      {showInternalNav ? (
        <div className="comergio-academy-panel__tabs" role="tablist" aria-label="Comergio Academy">
          <button
            className={`comergio-academy-panel__tab tone-academy${resolvedKey === COMERGIO_ACADEMY_PARENT.key ? ' is-active' : ''}`}
            onClick={() => selectKey(COMERGIO_ACADEMY_PARENT.key)}
            type="button"
          >
            {COMERGIO_ACADEMY_PARENT.label}
            <AcademyNotificationBadge count={counts.total} />
          </button>
          {COMERGIO_ACADEMY_CHILDREN.map((child) => (
            <button
              className={`comergio-academy-panel__tab tone-${CHILD_TONE[child.key]}${resolvedKey === child.key ? ' is-active' : ''}`}
              key={child.key}
              onClick={() => selectKey(child.key)}
              type="button"
            >
              {child.label}
              <AcademyNotificationBadge count={childCount(child.key)} />
            </button>
          ))}
        </div>
      ) : null}

      {showLanding ? (
        <div className="comergio-academy-panel__landing">
          {showLandingCards ? (
            <div className="comergio-academy-panel__card-grid">
              {COMERGIO_ACADEMY_CHILDREN.map((child) => (
                <button
                  className={`comergio-academy-panel__card tone-${CHILD_TONE[child.key]}`}
                  key={child.key}
                  onClick={() => selectKey(child.key)}
                  type="button"
                >
                  <span className="comergio-academy-panel__card-icon" aria-hidden="true">
                    <AcademyChildIcon icon={CHILD_ICONS[child.key]} />
                  </span>
                  <strong>
                    {child.label}
                    <AcademyNotificationBadge count={childCount(child.key)} />
                  </strong>
                  <span>{child.description}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="comergio-academy-panel__empty">
              <p>Elige Video tutoriales, Conecta o Comergio Informa en el menú.</p>
            </div>
          )}
        </div>
      ) : null}

      {activeChild?.key === 'video_tutoriales' ? <VideoTutorialesSection /> : null}

      {activeChild?.key === 'conecta' ? (
        <ConectaPanel onUnreadChange={() => {}} />
      ) : null}

      {activeChild?.key === 'informa' ? (
        <InformaPanel onUnreadChange={() => {}} />
      ) : null}
    </article>
  );
}
