import comergioLogo from '../assets/comergio.png';

function ParentPortalStateIcon({ variant = 'boot' }) {
  if (variant === 'feed-empty') {
    return (
      <div aria-hidden="true" className="parent-portal-state__visual is-feed">
        <span className="parent-portal-state__bubble is-one" />
        <span className="parent-portal-state__bubble is-two" />
        <span className="parent-portal-state__bubble is-three" />
        <span className="parent-portal-state__megaphone" aria-hidden="true">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 10v4h3l5 4V6L7 10H4zm11.5 2c0-1.77-1.02-3.29-2.5-4.03v8.06c1.48-.74 2.5-2.26 2.5-4.03zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="currentColor" />
          </svg>
        </span>
      </div>
    );
  }

  if (variant === 'no-students') {
    return (
      <div aria-hidden="true" className="parent-portal-state__visual is-students">
        <span className="parent-portal-state__avatar-ring" />
        <span className="parent-portal-state__avatar-core">+</span>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="parent-portal-state__visual is-boot">
      <img alt="" className="parent-portal-state__logo-mark" src={comergioLogo} />
      <span className="parent-portal-state__pulse" />
      <span className="parent-portal-state__pulse is-delayed" />
    </div>
  );
}

export function ParentPortalBootScreen({
  schoolName = 'Comergio',
  title = 'Preparando tu portal familiar',
  message = 'Estamos sincronizando la información de tus alumnos y comunicados.',
  onLogout,
}) {
  return (
    <section className="campus-page campus-parent-mobile-app parent-portal-state parent-portal-state--boot">
      <header className="campus-parent-mobile__app-header">
        <div className="campus-parent-mobile__app-brand">
          <img alt="Comergio" className="campus-parent-mobile__app-logo" src={comergioLogo} />
        </div>
        <div className="campus-parent-mobile__app-title-wrap">
          <span className="campus-parent-mobile__app-school-name">{schoolName}</span>
        </div>
        {onLogout ? (
          <button className="campus-parent-mobile__app-logout-button" onClick={onLogout} type="button">
            Salir
          </button>
        ) : null}
      </header>

      <div className="parent-portal-state__body">
        <article className="parent-portal-state__card">
          <ParentPortalStateIcon variant="boot" />
          <div className="parent-portal-state__copy">
            <span className="parent-portal-state__eyebrow">Portal de acudientes</span>
            <h2>{title}</h2>
            <p>{message}</p>
          </div>
          <div aria-hidden="true" className="parent-portal-state__skeleton-stack">
            <span className="parent-portal-state__skeleton-line is-wide" />
            <span className="parent-portal-state__skeleton-line" />
            <span className="parent-portal-state__skeleton-line is-short" />
          </div>
          <div aria-hidden="true" className="parent-portal-state__progress">
            <span className="parent-portal-state__progress-bar" />
          </div>
        </article>
      </div>
    </section>
  );
}

export function ParentPortalEmptyStudentsState({ onLogout }) {
  return (
    <section className="campus-page campus-parent-mobile-app parent-portal-state parent-portal-state--empty">
      <header className="campus-parent-mobile__app-header">
        <div className="campus-parent-mobile__app-brand">
          <img alt="Comergio" className="campus-parent-mobile__app-logo" src={comergioLogo} />
        </div>
        <div className="campus-parent-mobile__app-title-wrap">
          <span className="campus-parent-mobile__app-school-name">Portal de acudientes</span>
        </div>
        {onLogout ? (
          <button className="campus-parent-mobile__app-logout-button" onClick={onLogout} type="button">
            Salir
          </button>
        ) : null}
      </header>
      <div className="parent-portal-state__body">
        <article className="parent-portal-state__card">
          <ParentPortalStateIcon variant="no-students" />
          <div className="parent-portal-state__copy">
            <span className="parent-portal-state__eyebrow">Vinculación pendiente</span>
            <h2>Sin alumnos vinculados</h2>
            <p>Este usuario padre no tiene alumnos activos vinculados en este colegio. Si crees que es un error, contacta a la institución.</p>
          </div>
        </article>
      </div>
    </section>
  );
}

export function ParentFeedLoadingSkeleton({ count = 2 }) {
  return (
    <div aria-busy="true" aria-label="Cargando comunicados" className="parent-portal-state__feed-skeleton-list">
      {Array.from({ length: count }, (_, index) => (
        <article className="parent-portal-state__feed-skeleton-card" key={`feed-skeleton-${index}`}>
          <div className="parent-portal-state__feed-skeleton-head">
            <span className="parent-portal-state__feed-skeleton-avatar" />
            <div className="parent-portal-state__feed-skeleton-meta">
              <span className="parent-portal-state__skeleton-line is-wide" />
              <span className="parent-portal-state__skeleton-line is-short" />
            </div>
          </div>
          <span className="parent-portal-state__feed-skeleton-media" />
          <div className="parent-portal-state__feed-skeleton-actions">
            <span className="parent-portal-state__skeleton-pill" />
            <span className="parent-portal-state__skeleton-pill" />
            <span className="parent-portal-state__skeleton-pill is-wide" />
          </div>
        </article>
      ))}
    </div>
  );
}

export function ParentFeedEmptyState({ studentName = 'tu alumno' }) {
  return (
    <article className="parent-portal-state__card parent-portal-state__card--feed-empty">
      <ParentPortalStateIcon variant="feed-empty" />
      <div className="parent-portal-state__copy">
        <span className="parent-portal-state__eyebrow">{studentName}</span>
        <h2>Sin comunicados por ahora</h2>
        <p>Cuando el colegio publique información para este acudiente o alumno, la verás aquí al instante.</p>
      </div>
      <p className="parent-portal-state__hint">Desliza hacia abajo para actualizar el feed.</p>
    </article>
  );
}
