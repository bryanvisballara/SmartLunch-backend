import triviaHomeHero from '../../../assets/trivia/home-hero.jpg';

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
import institutionalCardArt from '../../../assets/trivia/institutional-card-art.png';
import globalCardArt from '../../../assets/trivia/global-card-art.png';

const MODE_COPY = {
  institutional: {
    eyebrow: 'Modo institucional',
    title: 'Reta a tu colegio',
    description: 'Compite con preguntas creadas a partir de las materias que ves en clase.',
    art: institutionalCardArt,
  },
  global: {
    eyebrow: 'Modo global',
    title: 'Explora el mundo',
    description: 'Pon a prueba tu cultura general con estudiantes de toda la comunidad.',
    art: globalCardArt,
  },
};

function PlayerStack({ players = [] }) {
  return (
    <span className="trivia-avatar-stack" aria-label={players.map((player) => player.name).join(', ')}>
      {players.slice(0, 3).map((player, index) => (
        <span key={player.id || player.name || index} style={{ '--avatar-index': index }}>
          {String(player.name || '?').trim().charAt(0).toUpperCase()}
        </span>
      ))}
    </span>
  );
}

export default function TriviaHome({
  activeMatches = [],
  ageRange = '',
  invitedMatches = [],
  loading = false,
  playerName = '',
  onAcceptInvite,
  onChangeAgeRange,
  onDeclineInvite,
  onOpenMatch,
  onSelectMode,
}) {
  const firstName = String(playerName || '').trim().split(/\s+/)[0];

  return (
    <section className="trivia-screen trivia-home">
      <header
        className="trivia-home__hero"
        style={{ '--trivia-home-hero': `url(${triviaHomeHero})` }}
      >
        <div className="trivia-home__hero-copy">
          <span className="trivia-home__brand">
            <b aria-hidden="true">C</b>
            <span>Comergio <strong>Trivia</strong></span>
          </span>
          <h1>
            Hola{firstName ? `, ${firstName}` : ''}.
            <span>¿Listo para avanzar?</span>
          </h1>
          <p>Conquista las 10 estaciones y llega primero al trofeo.</p>
        </div>
      </header>

      {invitedMatches.length ? (
        <div className="trivia-section">
          <div className="trivia-section__title">
            <div>
              <span className="trivia-kicker">Te están esperando</span>
              <h2>Invitaciones</h2>
            </div>
            <span className="trivia-count">{invitedMatches.length}</span>
          </div>
          <div className="trivia-match-list">
            {invitedMatches.map((match) => (
              <article className="trivia-invite-card" key={match.id}>
                <PlayerStack players={match.players} />
                <div>
                  <strong>{match.host?.name || 'Un compañero'} te retó</strong>
                  <span>{match.mode === 'institutional' ? 'Institucional' : 'Global'} · {match.gameMode || '1v1'}</span>
                </div>
                <div className="trivia-inline-actions">
                  <button className="trivia-btn trivia-btn--ghost" onClick={() => onDeclineInvite?.(match.id)} type="button">
                    Ahora no
                  </button>
                  <button className="trivia-btn trivia-btn--small" onClick={() => onAcceptInvite?.(match.id)} type="button">
                    Jugar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="trivia-section">
        <div className="trivia-section__title">
          <div>
            <span className="trivia-kicker">Elige tu aventura</span>
            <h2>¿Cómo quieres jugar?</h2>
          </div>
        </div>
        <div className="trivia-mode-grid">
          {Object.entries(MODE_COPY).map(([mode, copy]) => (
            <button
              className={`trivia-mode-card trivia-mode-card--${mode}`}
              disabled={loading}
              key={mode}
              onClick={() => onSelectMode?.(mode)}
              type="button"
            >
              <img
                alt=""
                aria-hidden="true"
                className="trivia-mode-card__art"
                src={copy.art}
              />
              <span className="trivia-mode-card__content">
                <span className="trivia-mode-card__eyebrow">{copy.eyebrow}</span>
                <strong>{copy.title}</strong>
                <span className="trivia-mode-card__description">{copy.description}</span>
              </span>
            </button>
          ))}
        </div>
        {ageRange ? (
          <button className="trivia-home__age" onClick={onChangeAgeRange} type="button">
            <span>
              <small>Tu rango en modo global</small>
              <strong>{ageRange} años</strong>
            </span>
            <b>Cambiar</b>
          </button>
        ) : null}
      </div>

      {activeMatches.length ? (
        <div className="trivia-section">
          <div className="trivia-section__title">
            <div>
              <span className="trivia-kicker">Sigue jugando</span>
              <h2>Partidas activas</h2>
            </div>
          </div>
          <div className="trivia-active-grid">
            {activeMatches.map((match) => {
              const yourTurn = match.isYourTurn ?? !match.waitingForPlayers;
              const rival = (match.players || []).find((player) => !player.isYou);
              return (
                <button
                  className={`trivia-active-card${yourTurn ? ' is-your-turn' : ' is-rival-turn'}`}
                  key={match.id}
                  onClick={() => onOpenMatch?.(match.id)}
                  type="button"
                >
                  <span className={`trivia-active-card__turn${yourTurn ? ' is-you' : ' is-rival'}`}>
                    <i aria-hidden="true" />
                    {yourTurn ? 'Tu turno' : 'Turno del rival'}
                  </span>
                  <div>
                    <span>{match.mode === 'institutional' ? 'Institucional' : 'Global'} · {match.gameMode || '1v1'}</span>
                    <strong>Estación {Math.min(10, (match.you?.station || 0) + 1)} de 10</strong>
                    <small>
                      {yourTurn
                        ? `Te toca · ${Number(match.you?.streak || 0)}/3 para avanzar`
                        : `Esperando a ${rival?.name || 'tu rival'}`}
                      {match.turnExpiresAt ? ` · Vence ${formatTurnDeadline(match.turnExpiresAt)}` : ''}
                    </small>
                  </div>
                  <PlayerStack players={match.players} />
                  <b aria-hidden="true">›</b>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
