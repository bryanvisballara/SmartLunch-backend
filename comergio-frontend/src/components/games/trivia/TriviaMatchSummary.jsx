function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

export default function TriviaMatchSummary({
  onBackHome,
  onRematch,
  summary,
}) {
  if (!summary) {
    return null;
  }

  const ranking = Array.isArray(summary.ranking) ? summary.ranking : [];
  const winner = ranking[0];
  const you = ranking.find((player) => player.isYou);

  return (
    <section className="trivia-screen trivia-summary">
      <header className="trivia-summary__hero">
        <div className="trivia-summary__trophy" aria-hidden="true">🏆</div>
        <span className="trivia-kicker">Partida terminada</span>
        <h1>{winner?.isYou ? '¡Llegaste a la cima!' : `${winner?.name || 'El ganador'} conquistó el mapa`}</h1>
        <p>
          {summary.finishReason === 'turn_expired'
            ? 'Un jugador no respondió en 3 días y perdió la partida.'
            : `${summary.mode === 'institutional' ? 'Modo institucional' : 'Modo global'} · ${summary.gameMode || '1v1'}`}
        </p>
      </header>

      <div className="trivia-summary__stats">
        <div>
          <small>Tu posición</small>
          <strong>#{you?.position || '—'}</strong>
        </div>
        <div>
          <small>Aciertos</small>
          <strong>{you?.correctAnswers ?? '—'}<span>/{you?.answerCount || summary.questionCount || 10}</span></strong>
        </div>
        <div>
          <small>Puntos</small>
          <strong>{Number(you?.score || 0).toLocaleString('es-CO')}</strong>
        </div>
      </div>

      <div className="trivia-panel trivia-ranking">
        <div className="trivia-section__title">
          <div>
            <span className="trivia-kicker">Clasificación final</span>
            <h2>Podio</h2>
          </div>
        </div>
        <ol>
          {ranking.map((player, index) => (
            <li className={player.isYou ? 'is-you' : ''} key={player.id || player.teamId}>
              <span className="trivia-ranking__position">{player.position || index + 1}</span>
              <span className="trivia-avatar" style={{ '--avatar-color': player.color || '#13a8c7' }}>
                {initials(player.teamName || player.name)}
              </span>
              <span>
                <strong>{player.teamName || player.name}{player.isYou ? ' · Tú' : ''}</strong>
                <small>{player.correctAnswers || 0} respuestas correctas</small>
              </span>
              <b>{Number(player.score || 0).toLocaleString('es-CO')} pts</b>
            </li>
          ))}
        </ol>
      </div>

      <div className="trivia-summary__actions">
        <button className="trivia-btn trivia-btn--ghost" onClick={onBackHome} type="button">Volver al inicio</button>
        {summary.canRematch !== false ? (
          <button className="trivia-btn" onClick={onRematch} type="button">Jugar otra vez</button>
        ) : null}
      </div>
    </section>
  );
}
