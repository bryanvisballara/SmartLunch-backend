import { useEffect, useState } from 'react';

export function ColibriBootSplash({
  progress,
  onVideoReady,
  ariaLabel = 'Cargando',
  indeterminate = false,
  embedded = false,
  minimal = false,
  eyebrow = 'Portal de acudientes',
  title = 'Cargando alumnos vinculados',
  message = 'Estamos consultando la información real del acudiente y preparando tu experiencia.',
}) {
  const [indeterminateProgress, setIndeterminateProgress] = useState(18);

  useEffect(() => {
    if (!indeterminate || typeof progress === 'number') {
      return undefined;
    }

    const timer = setInterval(() => {
      setIndeterminateProgress((currentValue) => (currentValue >= 92 ? 92 : currentValue + 3));
    }, 70);

    return () => clearInterval(timer);
  }, [indeterminate, progress]);

  const resolvedProgress = typeof progress === 'number'
    ? progress
    : indeterminateProgress;

  return (
    <div
      aria-busy="true"
      aria-label={ariaLabel}
      className={`login-boot-splash${embedded ? ' is-embedded' : ''}${minimal ? ' is-minimal' : ''}`}
    >
      <div className="login-boot-video-wrap">
        <video
          autoPlay
          className="login-boot-video"
          loop
          muted
          playsInline
          preload="auto"
          src="/videocolibri.mp4"
          onCanPlay={() => onVideoReady?.()}
          onLoadedData={() => onVideoReady?.()}
        />
      </div>

      {minimal ? (
        <p className="login-boot-caption">{title}</p>
      ) : (
        <article className="login-boot-card">
          <div className="login-boot-card-copy">
            <span className="login-boot-card-eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
            <p>{message}</p>
          </div>

          <div aria-hidden="true" className="login-boot-card-lines">
            <span className="login-boot-card-line is-wide" />
            <span className="login-boot-card-line is-wide" />
            <span className="login-boot-card-line is-short" />
          </div>

          <div className="login-boot-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={resolvedProgress}>
            <div className="login-boot-progress-bar" style={{ width: `${resolvedProgress}%` }} />
          </div>
        </article>
      )}
    </div>
  );
}
