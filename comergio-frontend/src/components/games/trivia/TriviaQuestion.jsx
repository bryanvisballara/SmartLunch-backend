import { useEffect, useRef, useState } from 'react';

const LETTERS = ['A', 'B', 'C', 'D'];
const CATEGORY_ICONS = {
  historia: '🏛️',
  ciencia: '⚗️',
  cultura: '🎭',
  arte: '🎨',
  deportes: '⚽',
};

export default function TriviaQuestion({
  disabled = false,
  error = '',
  onBack,
  onSelectAnswer,
  onSubmitAnswer,
  onTimeUp,
  question,
  selectedAnswerId = '',
  submitting = false,
}) {
  const answers = Array.isArray(question?.answers) ? question.answers.slice(0, 4) : [];
  const totalSeconds = Math.max(1, Number(question?.timeLimitSeconds || 20));
  const [seconds, setSeconds] = useState(totalSeconds);
  const timeUpSent = useRef(false);
  const categoryName = question?.subject?.name || question?.subjectName || 'Comergio Trivia';
  const categoryIcon = CATEGORY_ICONS[String(categoryName).trim().toLocaleLowerCase('es')] || '🧠';
  const timePercent = Math.min(100, (seconds / totalSeconds) * 100);

  useEffect(() => {
    if (disabled || submitting || seconds <= 0) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [disabled, seconds, submitting]);

  useEffect(() => {
    if (seconds === 0 && !timeUpSent.current && !submitting) {
      timeUpSent.current = true;
      onTimeUp?.();
    }
  }, [onTimeUp, seconds, submitting]);

  if (!question) {
    return null;
  }

  const submit = (event) => {
    event.preventDefault();
    if (selectedAnswerId && !disabled && !submitting) {
      onSubmitAnswer?.(selectedAnswerId);
    }
  };

  return (
    <section className="trivia-screen trivia-question">
      {onBack ? (
        <button className="trivia-question__back" onClick={onBack} type="button">
          <span aria-hidden="true">←</span> Volver a juegos
        </button>
      ) : null}
      <header className="trivia-question__head">
        <div>
          <span className="trivia-kicker">{categoryName}</span>
          <strong>Racha {Number(question.streak || 0)} <small>de {question.streakNeeded || 3}</small></strong>
        </div>
        <div className={`trivia-question__timer${seconds <= 5 ? ' is-urgent' : ''}`} aria-label={`${seconds} segundos restantes`}>
          <b aria-hidden="true">⏱</b>
          <span>{seconds}</span>
          <small>seg</small>
        </div>
      </header>

      <div className="trivia-timebar" aria-hidden="true">
        <span style={{ '--time-progress': `${timePercent}%` }} />
      </div>

      <form onSubmit={submit}>
        <article className="trivia-question__card">
          <span className="trivia-question__category">
            <b aria-hidden="true">{categoryIcon}</b> {categoryName}
          </span>
          {question.imageUrl ? <img alt={question.imageAlt || ''} src={question.imageUrl} /> : null}
          <h1>{question.prompt}</h1>
          {question.context ? <p>{question.context}</p> : null}
          <div className="trivia-question__illustration" aria-hidden="true">
            <span>{categoryIcon}</span>
            <i>?</i>
          </div>
        </article>

        <div className="trivia-answer-grid" role="radiogroup" aria-label="Opciones de respuesta">
          {answers.map((answer, index) => {
            const answerId = answer.id || answer.key;
            const selected = selectedAnswerId === answerId;
            return (
              <button
                aria-checked={selected}
                className={selected ? 'is-selected' : ''}
                disabled={disabled || submitting || seconds <= 0}
                key={answerId}
                onClick={() => onSelectAnswer?.(answerId)}
                role="radio"
                type="button"
              >
                <b>{LETTERS[index]}</b>
                <span>{answer.text}</span>
                <i aria-hidden="true">{selected ? '✓' : ''}</i>
              </button>
            );
          })}
        </div>

        {error ? <p className="trivia-alert trivia-alert--error" role="alert">{error}</p> : null}
        <button
          className="trivia-question__submit"
          disabled={!selectedAnswerId || disabled || submitting || seconds <= 0}
          type="submit"
        >
          <span>{submitting ? 'Enviando respuesta…' : seconds <= 0 ? 'Tiempo terminado' : 'Confirmar respuesta'}</span>
          <b aria-hidden="true">→</b>
        </button>
      </form>
    </section>
  );
}
