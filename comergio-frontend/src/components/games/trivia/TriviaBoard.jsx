import mapArt from '../../../assets/trivia/map.jpg';

function formatTurnDeadline(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

const STATIONS = [
  { id: 0, x: 50, y: 92 },
  { id: 1, x: 34, y: 84 },
  { id: 2, x: 58, y: 76 },
  { id: 3, x: 38, y: 68 },
  { id: 4, x: 61, y: 60 },
  { id: 5, x: 39, y: 52 },
  { id: 6, x: 60, y: 44 },
  { id: 7, x: 40, y: 36 },
  { id: 8, x: 59, y: 28 },
  { id: 9, x: 42, y: 19 },
  { id: 10, x: 50, y: 9 },
];

const PLAYER_COLORS = ['#1787d8', '#16a34a', '#0f766e', '#4f46e5'];

function nameParts(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean);
}

function twoLetterToken(name) {
  const parts = nameParts(name);
  if (!parts.length) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function disambiguatedToken(name, used) {
  const base = twoLetterToken(name);
  if (!used.has(base)) {
    return base;
  }
  const parts = nameParts(name);
  const fallback = `${(parts[0] || '').slice(0, 2)}${parts[1]?.charAt(0) || ''}`.toUpperCase();
  if (fallback && !used.has(fallback)) {
    return fallback;
  }
  let suffix = 2;
  let next = `${base}${suffix}`;
  while (used.has(next)) {
    suffix += 1;
    next = `${base}${suffix}`;
  }
  return next;
}

function decorateTokens(players) {
  const used = new Set();
  return players.map((player, index) => {
    const token = player.teamName
      ? String(player.teamName).slice(0, 2).toUpperCase()
      : disambiguatedToken(player.name, used);
    used.add(token);
    return {
      ...player,
      token,
      color: player.color && !/#f7bd32|#ffc|#e8b|gold/i.test(player.color)
        ? player.color
        : PLAYER_COLORS[index % PLAYER_COLORS.length],
    };
  });
}

export default function TriviaBoard({
  match,
  onContinue,
  onExit,
  waiting = false,
}) {
  const players = Array.isArray(match?.players) ? match.players : [];
  const tokens = decorateTokens(players.filter((player, index, list) => {
    return !player.teamId || list.findIndex((item) => item.teamId === player.teamId) === index;
  }));
  const currentPlayer = players.find((player) => player.isYou) || match?.you;
  const currentStation = Math.max(0, Math.min(10, Number(currentPlayer?.station || 0)));
  const streak = Math.max(0, Number(currentPlayer?.streak || 0));
  const streakNeeded = Math.max(1, Number(match?.advanceStreakNeeded || 3));
  const expiresLabel = formatTurnDeadline(match?.turnExpiresAt);

  return (
    <section className="trivia-screen trivia-board-screen">
      <header className="trivia-page-head trivia-page-head--overlay">
        <button className="trivia-icon-btn" onClick={onExit} type="button" aria-label="Volver al inicio">←</button>
        <div>
          <span className="trivia-kicker">{match?.mode === 'institutional' ? 'Institucional' : 'Global'} · {match?.gameMode || '1v1'}</span>
          <h1>La ruta del conocimiento</h1>
        </div>
        <span className="trivia-status-pill">{expiresLabel ? `Vence ${expiresLabel}` : `Ronda ${match?.round || 1}`}</span>
      </header>

      <div className="trivia-board" aria-label="Mapa de 10 estaciones">
        <img alt="" src={mapArt} />
        <div className="trivia-board__shade" aria-hidden="true" />
        {STATIONS.map((station) => {
          const stationPlayers = tokens.filter(
            (player) => Math.max(0, Math.min(10, Number(player.station || 0))) === station.id
          );
          const passed = station.id < currentStation;
          const current = station.id === currentStation;
          return (
            <div
              aria-label={`Estación ${station.id}${current ? ', tu posición actual' : ''}`}
              className={`trivia-station${passed ? ' is-passed' : ''}${current ? ' is-current' : ''}${station.id === 10 ? ' is-finish' : ''}`}
              key={station.id}
              style={{ '--station-x': `${station.x}%`, '--station-y': `${station.y}%` }}
            >
              <span>{station.id === 10 ? '🏆' : station.id === 0 ? '⚑' : station.id}</span>
              <div className="trivia-station__tokens">
                {stationPlayers.map((player, index) => (
                  <b
                    aria-label={`${player.teamName ? `Equipo ${player.teamName}` : player.name}, estación ${station.id}`}
                    className={player.isYou ? 'is-you' : ''}
                    key={player.id || player.teamId}
                    style={{
                      '--player-color': player.color,
                      '--token-index': index,
                    }}
                    title={player.teamName || player.name}
                  >
                    {player.token}
                  </b>
                ))}
              </div>
            </div>
          );
        })}

        <div className="trivia-board__legend">
          {tokens.map((player) => (
            <span key={player.id || player.teamId}>
              <b style={{ '--player-color': player.color }}>{player.token}</b>
              {player.teamName || player.name}{player.isYou ? ' · Tú' : ''}
            </span>
          ))}
        </div>
      </div>

      <div className="trivia-board__action">
        <div className="trivia-board__station">
          <span>Estación actual</span>
          <strong>{currentStation} <small>/ 10</small></strong>
          <ol aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => (
              <li className={index < currentStation ? 'is-done' : index === currentStation ? 'is-current' : ''} key={index} />
            ))}
          </ol>
          <div className="trivia-board__streak">
            <span>Para avanzar</span>
            <strong>{streak}/{streakNeeded}</strong>
            <ol aria-label={`${streak} de ${streakNeeded} correctas seguidas`}>
              {Array.from({ length: streakNeeded }, (_, index) => (
                <li className={index < streak ? 'is-done' : ''} key={index} />
              ))}
            </ol>
          </div>
        </div>
        <button className="trivia-board__spin" disabled={waiting} onClick={onContinue} type="button">
          <i className="trivia-board__roulette" aria-hidden="true" />
          <strong>{waiting ? 'Esperando rivales…' : 'Gira la ruleta'}</strong>
          <b aria-hidden="true">→</b>
        </button>
        {!waiting ? <em>{streak}/{streakNeeded} seguidas para avanzar</em> : null}
      </div>
    </section>
  );
}
