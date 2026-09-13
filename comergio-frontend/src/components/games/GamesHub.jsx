import flyCover from '../../assets/comergio-fly.jpg';
import arenaCover from '../../assets/comergio-arena.jpg';
import triviaCover from '../../assets/comergio-trivia.jpg';
import mathRushCover from '../../assets/comergio-math-rush.jpg';
import letsTalkCover from '../../assets/comergio-lets-talk.jpg';
import './games-hub.css';

const COVERS = {
  fly: flyCover,
  arena: arenaCover,
  trivia: triviaCover,
  'math-rush': mathRushCover,
  'lets-talk': letsTalkCover,
};

const GAMES = [
  {
    key: 'fly',
    name: 'FLY',
    slogan: 'Vuela, esquiva y sube en el ranking.',
    status: 'live',
  },
  {
    key: 'arena',
    name: 'Comergio Arena',
    slogan: 'Juega · Aprende · Compite',
    status: 'live',
  },
  {
    key: 'trivia',
    name: 'Comergio Trivia',
    slogan: 'Agrega preguntas para la trivia.',
    studentSlogan: 'Completa el mapa antes que tu contrincante.',
    status: 'live',
  },
  {
    key: 'math-rush',
    name: 'Comergio Math Rush',
    slogan: 'Pequeños números, grandes mentes.',
    status: 'soon',
  },
  {
    key: 'lets-talk',
    name: "Let's Talk",
    slogan: '¡Refuerza tu inglés!',
    status: 'soon',
  },
];

export default function GamesHub({
  variant = 'student',
  flyLocked = false,
  flyLockReason = '',
  onOpenFly,
  onOpenArena,
  onOpenTrivia,
}) {
  const isTeacher = variant === 'teacher';

  const cards = GAMES.map((game) => {
    const isSoon = game.status === 'soon';
    const isFlyLocked = game.key === 'fly' && flyLocked && !isTeacher;
    const disabled = isSoon || isFlyLocked;
    const action = game.key === 'fly'
      ? onOpenFly
      : game.key === 'arena'
        ? onOpenArena
        : game.key === 'trivia'
          ? onOpenTrivia
          : undefined;
    const cta = isSoon
      ? 'Próximamente'
      : isFlyLocked
        ? 'Pausado'
        : isTeacher && game.key === 'fly'
          ? 'Ir al bloqueo'
          : isTeacher && game.key === 'arena'
            ? 'Abrir Arena'
            : isTeacher && game.key === 'trivia'
              ? 'Gestionar Trivia'
            : game.key === 'arena'
              ? 'Entrar'
              : game.key === 'trivia'
                ? 'Competir'
              : 'Jugar';

    const body = (
      <>
        <div className="games-hub__card-art" aria-hidden="true">
          <img alt="" src={COVERS[game.key]} />
        </div>
        <div className="games-hub__card-copy">
          <strong>{game.name}</strong>
          <span>{!isTeacher && game.studentSlogan ? game.studentSlogan : game.slogan}</span>
          {isFlyLocked ? (
            <small>{flyLockReason || 'FLY está pausado durante la clase.'}</small>
          ) : null}
          {isSoon ? <small>Próximamente</small> : null}
        </div>
      </>
    );

    if (!isTeacher) {
      return (
        <button
          className={`games-hub__card is-${game.key}${disabled ? ' is-disabled' : ''}`}
          disabled={disabled}
          key={game.key}
          onClick={action}
          type="button"
        >
          {body}
        </button>
      );
    }

    return (
      <article className={`games-hub__card is-${game.key}${disabled ? ' is-disabled' : ''}`} key={game.key}>
        {body}
        <button className="games-hub__card-cta" disabled={disabled} onClick={action} type="button">
          {cta}
        </button>
      </article>
    );
  });

  return (
    <section className={`games-hub games-hub--${variant}`}>
      {isTeacher ? (
        <header className="games-hub__hero">
          <p className="games-hub__kicker">Juegos Comergio</p>
          <h2>Elige cómo jugar con tu curso</h2>
          <p>FLY se bloquea desde la clase. Arena es el quiz en vivo y Trivia convierte tus materias en una competencia por turnos.</p>
        </header>
      ) : (
        <header className="games-hub__head">
          <h2>Juegos</h2>
          <p>Elige un juego, únete a Comergio Arena o reta a otros estudiantes en Comergio Trivia.</p>
          <span className="games-hub__chip">Todos</span>
        </header>
      )}

      {isTeacher ? (
        <div className="games-hub__grid">{cards}</div>
      ) : (
        <div className="games-hub__grid" aria-label="Juegos">{cards}</div>
      )}
    </section>
  );
}
