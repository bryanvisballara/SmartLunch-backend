import comergioLogo from '../../assets/comergio.png';

function getReasonMessage(reason) {
  if (reason === 'feature_not_enabled') {
    return 'Campus sigue apagado para esta sesion. Habilitalo por feature flag antes de pilotearlo.';
  }

  if (reason === 'no_memberships') {
    return 'El usuario esta autenticado, pero todavia no tiene membresias activas de Campus.';
  }

  return 'Campus no esta disponible en este momento.';
}

function CampusUnavailable({ campusContext, errorMessage }) {
  const steps = [
    'Activar CAMPUS_ENABLED=true o incluir escuela o usuario en allowlist',
    'Crear una membresía CampusMembership activa',
    'Opcional: activar CAMPUS_ALLOW_PARENT_FALLBACK=true para pilotos de padres',
  ];

  return (
    <section className="campus-unavailable">
      <div className="campus-unavailable__modal" role="dialog" aria-modal="true" aria-labelledby="campus-unavailable-title">
        <div className="campus-unavailable__brand-panel">
          <span className="campus-unavailable__logo-ring">
            <img alt="Comergio" src={comergioLogo} />
          </span>
          <span className="campus-unavailable__status">Campus en espera</span>
          <h1 id="campus-unavailable-title">El módulo Campus aún no está disponible</h1>
          <p>{errorMessage || getReasonMessage(campusContext?.reason)}</p>
        </div>

        <div className="campus-unavailable__details">
          <article className="campus-unavailable__info-card">
            <span className="campus-unavailable__info-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3 4.5 6.2v5.6c0 4.3 3 7.6 7.5 9.2 4.5-1.6 7.5-4.9 7.5-9.2V6.2L12 3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <div>
              <h2>Estado actual</h2>
              <p>Este bloqueo es intencional para proteger cafeterías y portales que ya están en uso.</p>
            </div>
          </article>

          <article className="campus-unavailable__steps-card">
            <h2>Cómo habilitar el piloto</h2>
            <ol>
              {steps.map((step, index) => (
                <li key={step}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </div>
    </section>
  );
}

export default CampusUnavailable;