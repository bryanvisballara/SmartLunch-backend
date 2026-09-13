import duelArt from '../../../assets/trivia/duel.jpg';
import lobbyGamepad from '../../../assets/trivia/lobby-gamepad.png';

const GAME_MODES = [
  { id: '1v1', label: '1 vs 1', description: 'Un duelo directo', slots: 2, icon: '⚔️' },
  { id: '3', label: '3 jugadores', description: 'Más diversión', slots: 3, icon: '👥' },
  { id: '4', label: '4 jugadores', description: 'Juego en equipo', slots: 4, icon: '👥' },
  { id: '2v2', label: '2 vs 2', description: 'Forma tu equipo', slots: 4, icon: '🛡️' },
];

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

export default function TriviaInviteLobby({
  ageRange = '',
  candidates = [],
  error = '',
  gameMode = '1v1',
  isHost = true,
  loading = false,
  match = null,
  onBack,
  onBlockCandidate,
  onChangeAgeRange,
  onGameModeChange,
  onReportCandidate,
  onSearchChange,
  onStart,
  onToggleCandidate,
  onChangeSubjects,
  search = '',
  selectedCandidateIds = [],
  selectedSubjects = [],
}) {
  const selectedMode = GAME_MODES.find((mode) => mode.id === gameMode) || GAME_MODES[0];
  const hostCount = match?.host ? 1 : 0;
  const roster = Array.isArray(match?.players) ? match.players : [];
  const invitationSent = Boolean(match?.invitationSent);
  const readyCount = Math.max(roster.length, hostCount + selectedCandidateIds.length);
  const canStart = isHost && readyCount === selectedMode.slots && !loading && !invitationSent;

  return (
    <section className="trivia-screen trivia-lobby">
      <header className="trivia-lobby__header">
        <div className="trivia-lobby__topbar">
          <button className="trivia-lobby__back" onClick={onBack} type="button">
            <span aria-hidden="true">←</span> Volver a juegos
          </button>
          <span className="trivia-lobby__step" aria-label={`Paso ${invitationSent ? 2 : 1} de 2`}>
            {invitationSent ? '2/2' : '1/2'}
          </span>
        </div>
        <div className="trivia-lobby__heading">
          <div>
            <span className="trivia-kicker">{match?.mode === 'institutional' ? 'Estudia de manera divertida' : 'Modo global'}</span>
            <h1>Arma tu partida</h1>
            <p>
              {invitationSent
                ? 'Invitaciones enviadas. Espera a que tus compañeros acepten.'
                : 'Elige el formato, invita a tus compañeros y prepárate para jugar.'}
            </p>
            {match?.mode === 'global' && ageRange ? (
              onChangeAgeRange ? (
                <button className="trivia-lobby__age" onClick={onChangeAgeRange} type="button">
                  Rango {ageRange} años · Cambiar
                </button>
              ) : (
                <span className="trivia-lobby__age is-static">Rango {ageRange} años</span>
              )
            ) : null}
          </div>
          <img alt="" aria-hidden="true" src={lobbyGamepad} />
        </div>
      </header>

      <div className="trivia-lobby__hero">
        <img alt="" src={duelArt} />
        <div>
          <span>Elige cómo competir</span>
          <strong>Todos recorren el mismo mapa de <b>10 estaciones.</b></strong>
        </div>
        <span className="trivia-lobby__route" aria-hidden="true">· · · 🏁</span>
      </div>

      {match?.mode === 'institutional' ? (
        <div className="trivia-panel trivia-lobby__panel trivia-lobby__subjects">
          <div className="trivia-lobby__panel-title">
            <span aria-hidden="true">📘</span>
            <div>
              <h2>Materias de la ruleta</h2>
              <p>Solo girarán las materias que elegiste para estudiar.</p>
            </div>
          </div>
          <div className="trivia-subjects__pills">
            {(selectedSubjects || []).map((subject) => (
              <span key={subject.id || subject.key || subject.name}>
                {subject.name || subject.label || subject.key}
              </span>
            ))}
            {!selectedSubjects?.length ? <span>Todas las materias con preguntas</span> : null}
          </div>
          {onChangeSubjects ? (
            <button className="trivia-lobby__age" onClick={onChangeSubjects} type="button">
              Cambiar materias
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="trivia-panel trivia-lobby__panel trivia-lobby__format">
        <div className="trivia-lobby__panel-title">
          <span aria-hidden="true">🎮</span>
          <div>
            <h2>Formato</h2>
            <p>Selecciona el formato de tu partida.</p>
          </div>
        </div>
        <div className="trivia-game-modes" role="radiogroup" aria-label="Formato de partida">
          {GAME_MODES.map((mode) => (
            <button
              aria-checked={gameMode === mode.id}
              className={gameMode === mode.id ? 'is-selected' : ''}
              disabled={!isHost || loading || invitationSent}
              key={mode.id}
              onClick={() => onGameModeChange?.(mode.id)}
              role="radio"
              type="button"
            >
              <span className="trivia-game-modes__icon" aria-hidden="true">{mode.icon}</span>
              <span>
                <strong>{mode.label}</strong>
                <small>{mode.description}</small>
              </span>
              {gameMode === mode.id ? <i aria-hidden="true">✓</i> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="trivia-panel trivia-lobby__panel trivia-candidates">
        <div className="trivia-candidates__head">
          <div className="trivia-lobby__panel-title">
            <span aria-hidden="true">👥</span>
            <div>
              <h2>{isHost ? 'Invita a tus compañeros' : 'Jugadores invitados'}</h2>
              <p>{gameMode === '2v2' ? 'Los equipos se equilibrarán al iniciar.' : `Elige ${Math.max(0, selectedMode.slots - 1)} rival${selectedMode.slots > 2 ? 'es' : ''}.`}</p>
            </div>
          </div>
          {isHost ? (
            <label className="trivia-search">
              <span aria-hidden="true">⌕</span>
              <input
                onChange={(event) => onSearchChange?.(event.target.value)}
                placeholder="Buscar por nombre o curso..."
                type="search"
                value={search}
              />
            </label>
          ) : null}
        </div>

        <div className="trivia-candidate-list">
          {candidates.map((candidate) => {
            const selected = selectedCandidateIds.includes(candidate.id);
            const selectionFull = selectedCandidateIds.length >= selectedMode.slots - 1;
            return (
              <div className={`trivia-candidate-row${selected ? ' is-selected' : ''}`} key={candidate.id}>
                <button
                  aria-pressed={selected}
                  className="trivia-candidate-row__select"
                  disabled={!isHost || loading || invitationSent || (!selected && selectionFull)}
                  onClick={() => onToggleCandidate?.(candidate.id)}
                  type="button"
                >
                  <span className="trivia-avatar" style={{ '--avatar-color': candidate.color || '#13a8c7' }}>
                    {initials(candidate.name)}
                  </span>
                  <span>
                    <strong>{candidate.name}</strong>
                    <small>
                      {match?.mode === 'global'
                        ? [candidate.schoolName || candidate.schoolId, candidate.ageRange ? `${candidate.ageRange} años` : ''].filter(Boolean).join(' · ')
                        : candidate.grade || candidate.course || 'Comergio'}
                    </small>
                  </span>
                  <i aria-hidden="true">{selected ? '✓' : '+'}</i>
                </button>
                {match?.mode === 'global' ? (
                  <div className="trivia-candidate-row__safety">
                    <button disabled={loading} onClick={() => onReportCandidate?.(candidate.id)} type="button">Reportar</button>
                    <button disabled={loading} onClick={() => onBlockCandidate?.(candidate.id)} type="button">Ocultar</button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!candidates.length ? (
            <p className="trivia-empty">
              {match?.mode === 'global' && ageRange
                ? `Aún no hay otros alumnos en el rango ${ageRange}. Aparecerán aquí cuando elijan el mismo rango.`
                : 'No encontramos estudiantes disponibles.'}
            </p>
          ) : null}
        </div>
      </div>

      {roster.length ? (
        <div className="trivia-roster" aria-live="polite">
          {roster.map((player) => (
            <span key={player.id}>
              <span className="trivia-avatar">{initials(player.name)}</span>
          <div>
                <strong>{player.name}{player.isYou ? ' · Tú' : ''}</strong>
                <small>{player.ready === false ? 'Invitado' : 'Listo para jugar'}</small>
              </div>
              <i aria-hidden="true">{player.ready === false ? '…' : '✓'}</i>
            </span>
          ))}
          <em>¡Vas muy bien!</em>
        </div>
      ) : null}

      {error ? (
        <p className="trivia-alert trivia-alert--error trivia-lobby__error" role="alert">
          <span aria-hidden="true">!</span> {error}
        </p>
      ) : null}
      {isHost ? (
        <button className="trivia-btn trivia-btn--wide trivia-lobby__start" disabled={!canStart} onClick={onStart} type="button">
          {loading
            ? 'Preparando partida…'
            : invitationSent
              ? 'Esperando confirmación de los jugadores…'
              : canStart
                ? 'Empezar partida'
                : `Faltan ${Math.max(0, selectedMode.slots - readyCount)} jugadores`}
        </button>
      ) : (
        <p className="trivia-alert">Esperando a que el anfitrión inicie la partida…</p>
      )}
    </section>
  );
}
