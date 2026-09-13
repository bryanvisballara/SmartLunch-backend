const AGE_RANGES = [
  { id: '6-8', label: '6–8 años', note: 'Explorador', icon: '🌱' },
  { id: '9-11', label: '9–11 años', note: 'Aventurero', icon: '🧭' },
  { id: '12-14', label: '12–14 años', note: 'Estratega', icon: '👑' },
  { id: '15-17', label: '15–17 años', note: 'Experto', icon: '🚀' },
];

export default function TriviaOnboarding({
  ageRange = '',
  editing = false,
  error = '',
  loading = false,
  onAgeRangeChange,
  onBack,
  onSubmit,
  playerName = '',
  submitLabel = 'Comenzar mi aventura',
}) {
  const submit = (event) => {
    event.preventDefault();
    if (ageRange) {
      onSubmit?.({ ageRange });
    }
  };
  const firstName = String(playerName || '').trim().split(/\s+/)[0];

  return (
    <section className="trivia-screen trivia-onboarding">
      <form className="trivia-onboarding__form" onSubmit={submit}>
        {onBack ? (
          <button className="trivia-onboarding__back" disabled={loading} onClick={onBack} type="button">
            <span aria-hidden="true">←</span> Volver
          </button>
        ) : null}
        <div className="trivia-onboarding__progress">
          <strong>Paso 1 de 1</strong>
          <span><i /></span>
        </div>
        <div className="trivia-onboarding__intro">
          <h1>
            {editing
              ? 'Cambia tu rango de edad'
              : <>{firstName ? <strong>{firstName},</strong> : null} ¿cuál es tu rango de edad?</>}
          </h1>
          <p>
            {editing
              ? 'Úsalo solo si te equivocaste. En el modo global te emparejamos con alumnos de tu mismo rango.'
              : 'Solo te lo preguntamos una vez. En el modo global se mostrará junto con tu nombre, avatar y colegio.'}
          </p>
          <span aria-hidden="true">〽</span>
        </div>
        <div className="trivia-age-grid" role="radiogroup" aria-label="Rango de edad">
          {AGE_RANGES.map((range) => (
            <button
              aria-checked={ageRange === range.id}
              className={`trivia-age-option${ageRange === range.id ? ' is-selected' : ''}`}
              key={range.id}
              onClick={() => onAgeRangeChange?.(range.id)}
              role="radio"
              type="button"
            >
              <span className="trivia-age-option__icon" aria-hidden="true">{range.icon}</span>
              <span className="trivia-age-option__copy">
                <strong>{range.label}</strong>
                <small>{range.note}</small>
              </span>
              <i aria-hidden="true">{ageRange === range.id ? '✓' : ''}</i>
            </button>
          ))}
        </div>
        {error ? <p className="trivia-alert trivia-alert--error" role="alert">{error}</p> : null}
        <button className="trivia-onboarding__continue" disabled={!ageRange || loading} type="submit">
          <span>{loading ? 'Buscando jugadores…' : submitLabel}</span>
          <b aria-hidden="true">→</b>
        </button>
      </form>
    </section>
  );
}
