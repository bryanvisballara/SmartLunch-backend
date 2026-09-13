import { useEffect, useRef } from 'react';

const AUTO_CONTINUE_MS = 4200;

export default function TriviaAdvanceContinue({
  from = 0,
  onContinue,
  to = 1,
}) {
  const fromStation = Math.max(0, Math.min(10, Number(from) || 0));
  const toStation = Math.max(fromStation, Math.min(10, Number(to) || fromStation));
  const remaining = Math.max(0, 10 - toStation);
  const continueRef = useRef(onContinue);
  continueRef.current = onContinue;

  useEffect(() => {
    const timerId = window.setTimeout(() => continueRef.current?.(), AUTO_CONTINUE_MS);
    return () => window.clearTimeout(timerId);
  }, [fromStation, toStation]);

  return (
    <section className="trivia-screen trivia-advance">
      <div className="trivia-advance__hero">
        <span className="trivia-kicker">Sigue tu racha</span>
        <div className="trivia-advance__move" aria-hidden="true">
          <b>{fromStation}</b>
          <i />
          <strong>{toStation}</strong>
        </div>
        <h1>Continúa avanzando</h1>
        <p>
          Llegaste a la estación {toStation}.
          {remaining
            ? ` Te faltan ${remaining} para el trofeo.`
            : ' Estás en la cima del mapa.'}
        </p>
      </div>

      <ol className="trivia-advance__path" aria-label={`Estación ${toStation} de 10`}>
        {Array.from({ length: 11 }, (_, index) => (
          <li
            className={
              index < toStation
                ? 'is-done'
                : index === toStation
                  ? 'is-current'
                  : ''
            }
            key={index}
          >
            <span>{index === 10 ? '🏆' : index}</span>
          </li>
        ))}
      </ol>

      <div className="trivia-advance__stats">
        <div>
          <small>Avance</small>
          <strong>+1</strong>
        </div>
        <div>
          <small>Nueva racha</small>
          <strong>0 / 3</strong>
        </div>
        <div>
          <small>Meta</small>
          <strong>{remaining ? `${remaining} más` : '¡Cima!'}</strong>
        </div>
      </div>

      <button className="trivia-btn trivia-btn--wide trivia-advance__cta" onClick={onContinue} type="button">
        <i className="trivia-board__roulette" aria-hidden="true" />
        <span>Gira la ruleta</span>
        <b aria-hidden="true">→</b>
      </button>
      <em className="trivia-advance__wait">La ruleta se abre sola en un momento</em>
    </section>
  );
}
