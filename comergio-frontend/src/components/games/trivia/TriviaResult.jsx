import { useEffect, useRef } from 'react';
import { playTriviaCorrectSound, playTriviaWrongOrTimeoutSound } from './triviaHomeAudio';

export default function TriviaResult({
  onContinue,
  result,
  waiting = false,
}) {
  const playedKeyRef = useRef('');

  useEffect(() => {
    if (!result) {
      return undefined;
    }
    const key = [
      result.correct ? 'ok' : 'no',
      result.correctAnswerText || '',
      result.streak || 0,
      result.stationsAdvanced || 0,
      result.matchEnded ? 'end' : 'go',
    ].join('|');
    if (playedKeyRef.current === key) {
      return undefined;
    }
    playedKeyRef.current = key;
    if (result.correct) {
      playTriviaCorrectSound();
    } else {
      playTriviaWrongOrTimeoutSound();
    }
    return undefined;
  }, [result]);

  if (!result) {
    return null;
  }

  const correct = Boolean(result.correct);
  const keepsTurn = Boolean(result.keepsTurn);
  const advanced = Number(result.stationsAdvanced || 0) > 0;
  const streak = Number(result.streak || 0);
  const streakNeeded = Number(result.streakNeeded || 3);
  const kicker = !correct
    ? 'Perdiste el turno'
    : advanced
      ? '¡Racha completa!'
      : '¡Sigue así!';
  const title = !correct
    ? 'Esta vez no fue'
    : advanced
      ? 'Avanzaste una estación'
      : `Correcta · ${streak} de ${streakNeeded}`;

  return (
    <section className={`trivia-screen trivia-result${correct ? ' is-correct' : ' is-wrong'}`}>
      <div className="trivia-result__burst" aria-hidden="true">
        <span>{correct ? '★' : '!'}</span>
      </div>
      <span className="trivia-kicker">{kicker}</span>
      <h1>{title}</h1>
      <p className="trivia-result__answer">
        <small>La respuesta correcta es</small>
        <strong>{result.correctAnswerText}</strong>
      </p>

      {result.explanation ? (
        <div className="trivia-result__explanation">
          <span aria-hidden="true">💡</span>
          <p>{result.explanation}</p>
        </div>
      ) : null}

      <div className="trivia-result__rewards">
        <div>
          <span aria-hidden="true">⚡</span>
          <small>Puntos</small>
          <strong>+{Number(result.pointsEarned || 0)}</strong>
        </div>
        <div>
          <span aria-hidden="true">📍</span>
          <small>Avance</small>
          <strong>{Number(result.stationsAdvanced || 0) ? `+${result.stationsAdvanced}` : '—'}</strong>
        </div>
        <div>
          <span aria-hidden="true">🔥</span>
          <small>Racha</small>
          <strong>{streak} / {streakNeeded}</strong>
        </div>
      </div>

      <p className="trivia-result__hint">
        {!correct
          ? 'El turno pasa al siguiente. Cuando te toque, empiezas la racha de 0.'
          : advanced
            ? 'Sigues tú. Primero verás cómo avanza tu ficha y después giras otra vez.'
            : `Necesitas ${streakNeeded} seguidas. Llevas ${streak}. Gira la ruleta otra vez.`}
      </p>

      <button className="trivia-btn trivia-btn--wide" disabled={waiting} onClick={onContinue} type="button">
        {waiting
          ? 'Esperando a los demás…'
          : result.matchEnded
            ? 'Ver resultados'
            : advanced
              ? 'Ver el avance'
              : keepsTurn
                ? 'Gira otra vez'
                : 'Volver al mapa'}
      </button>
    </section>
  );
}
