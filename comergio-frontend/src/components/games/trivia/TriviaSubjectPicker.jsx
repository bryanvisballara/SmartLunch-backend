import bookStackArt from '../../../assets/trivia/subjects-book-stack.png';
import stillLifeArt from '../../../assets/trivia/subjects-still-life.png';

const SUBJECT_ICONS = ['📘', '🧠', '🔬', '✏️', '🌱', '🔢', '🌐', '💡', '🧪', '📚', '🎵', '🗺️'];

function subjectIcon(subject, index) {
  return subject.icon || SUBJECT_ICONS[index % SUBJECT_ICONS.length];
}

function LightbulbIcon() {
  return (
    <svg aria-hidden="true" className="trivia-subjects__bulb-icon" fill="none" viewBox="0 0 48 48">
      <ellipse cx="24" cy="44" fill="#d7e4f4" rx="9" ry="2.2" />
      <path
        d="M24 4c-7.4 0-13.4 6-13.4 13.4 0 5.2 3 9.7 7.3 11.9v4.2c0 1.3 1 2.4 2.3 2.4h7.6c1.3 0 2.3-1.1 2.3-2.4v-4.2c4.3-2.2 7.3-6.7 7.3-11.9C37.4 10 31.4 4 24 4Z"
        fill="#ffe566"
      />
      <path
        d="M17.2 15.4c1.8-3.2 5-5.2 8.6-5.5"
        stroke="#fff6b0"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <rect x="19.2" y="35.8" width="9.6" height="3.2" fill="#e8eef6" rx="1.2" />
      <rect x="19.6" y="38.6" width="8.8" height="2.4" fill="#d5deea" rx="1" />
    </svg>
  );
}

export default function TriviaSubjectPicker({
  error = '',
  loading = false,
  onBack,
  onContinue,
  onToggle,
  selectedKeys = [],
  subjects = [],
}) {
  const selected = new Set(selectedKeys);
  const canContinue = selected.size > 0 && !loading;
  const empty = !subjects.length && !loading;

  return (
    <section className="trivia-screen trivia-subjects">
      <i className="trivia-subjects__glow trivia-subjects__glow--one" aria-hidden="true" />
      <i className="trivia-subjects__glow trivia-subjects__glow--two" aria-hidden="true" />

      <header className="trivia-subjects__header">
        {onBack ? (
          <button className="trivia-subjects__back" onClick={onBack} type="button">
            <span aria-hidden="true">←</span> Volver
          </button>
        ) : null}

        <div className="trivia-subjects__hero">
          <div className="trivia-subjects__copy">
            <span className="trivia-subjects__kicker">Estudia de manera divertida</span>
            <h1>
              <i className="trivia-subjects__spark trivia-subjects__spark--one" aria-hidden="true" />
              <i className="trivia-subjects__spark trivia-subjects__spark--two" aria-hidden="true" />
              ¿Qué quieres
              <span>estudiar hoy?</span>
              <i className="trivia-subjects__spark trivia-subjects__spark--three" aria-hidden="true" />
            </h1>
            <p>
              Elige una o varias materias para la ruleta. Si tienes examen de Historia y Ciencias,
              marca solo esas y practicarás con ellas.
            </p>
          </div>

          <aside className="trivia-subjects__aside">
            <img alt="Historia, Ciencias, Arte y Deportes" className="trivia-subjects__books" src={bookStackArt} />
            <p className="trivia-subjects__aside-caption">
              Tú eliges
              <span>tu aventura</span>
            </p>
          </aside>
        </div>
      </header>

      {subjects.length ? (
        <div className="trivia-subjects__grid" role="group" aria-label="Materias de la ruleta">
          {subjects.map((subject, index) => {
            const key = subject.key || subject.id;
            const active = selected.has(key);
            return (
              <button
                aria-pressed={active}
                className={`trivia-subject-chip${active ? ' is-selected' : ''}`}
                disabled={loading}
                key={key}
                onClick={() => onToggle?.(key)}
                style={{ '--chip-index': index }}
                type="button"
              >
                <span className="trivia-subject-chip__icon" aria-hidden="true">
                  {subjectIcon(subject, index)}
                </span>
                <strong>{subject.label || subject.name || key}</strong>
                <i aria-hidden="true">{active ? '✓' : '+'}</i>
              </button>
            );
          })}
        </div>
      ) : null}

      {empty ? (
        <div className="trivia-subjects__decide">
          <LightbulbIcon />
          <div>
            <strong>¡Tú decides!</strong>
            <p>
              Aún no hay materias con preguntas publicadas para tu grado. Pídele a un docente que publique algunas.
            </p>
          </div>
        </div>
      ) : null}

      {loading && !subjects.length ? (
        <p className="trivia-subjects__loading">Buscando materias de tu grado…</p>
      ) : null}

      {error ? <p className="trivia-alert trivia-alert--error" role="alert">{error}</p> : null}

      {empty || (loading && !subjects.length) ? (
        <div className="trivia-subjects__still-life" aria-hidden="true">
          <img alt="" src={stillLifeArt} />
        </div>
      ) : null}

      <footer className="trivia-subjects__footer">
        <div className="trivia-subjects__status">
          <span className="trivia-subjects__plus" aria-hidden="true">+</span>
          <div>
            <strong>
              {selected.size
                ? `${selected.size} materia${selected.size === 1 ? '' : 's'} en la ruleta`
                : 'Elige al menos una materia'}
            </strong>
            <small>
              {selected.size
                ? 'Listo para armar tu partida.'
                : 'Selecciona las materias que quieres estudiar.'}
            </small>
          </div>
        </div>
        <button
          className="trivia-subjects__continue"
          disabled={!canContinue}
          onClick={() => onContinue?.(selectedKeys)}
          type="button"
        >
          <span>{loading ? 'Preparando…' : 'Continuar a la partida'}</span>
          <b aria-hidden="true">→</b>
        </button>
      </footer>
    </section>
  );
}
