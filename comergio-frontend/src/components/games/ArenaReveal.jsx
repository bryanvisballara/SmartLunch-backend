import { getArenaChoiceColor, getArenaCorrectAnswers } from './arenaDraft';
import './arena.css';

function playerInitials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function medalFor(index) {
  if (index === 0) return '1°';
  if (index === 1) return '2°';
  if (index === 2) return '3°';
  return String(index + 1);
}

export default function ArenaReveal({
  question,
  leaderboard = [],
  youPlayerId = '',
  resultText = '',
  resultWrong = false,
}) {
  const answers = getArenaCorrectAnswers(question);
  const ranked = [...leaderboard].sort((left, right) => {
    if (Number(right.totalScore || 0) !== Number(left.totalScore || 0)) {
      return Number(right.totalScore || 0) - Number(left.totalScore || 0);
    }
    return String(left.displayName || '').localeCompare(String(right.displayName || ''), 'es');
  });

  return (
    <div className="arena-reveal">
      <div className="arena-answer-board">
        <p className="arena-answer-board__kicker">¡Respuesta correcta!</p>
        {question?.prompt ? <p className="arena-answer-board__prompt">{question.prompt}</p> : null}
        <div className="arena-answer-board__box">
          {answers.length ? answers.map((answer) => (
            <strong
              key={answer.key}
              className="arena-answer-board__choice"
              style={{ background: getArenaChoiceColor(question, answer.key) }}
            >
              {answer.order ? `${answer.order}. ` : ''}
              {answer.text}
            </strong>
          )) : (
            <strong className="arena-answer-board__choice">La respuesta se revelará en un momento.</strong>
          )}
        </div>
      </div>

      {resultText ? (
        <p className={`arena-result arena-reveal__result${resultWrong ? ' is-wrong' : ''}`}>{resultText}</p>
      ) : null}

      <div className="arena-reveal__rank">
        <h3>Marcador</h3>
        {ranked.length ? (
          <div className="arena-scoreboard">
            {ranked.map((row, index) => {
              const isYou = Boolean(youPlayerId && row.playerId === youPlayerId);
              const place = Math.min(index, 3);
              return (
                <div
                  className={`arena-scoreboard__row is-place-${place}${isYou ? ' is-you' : ''}`}
                  key={row.playerId}
                >
                  <em>{medalFor(index)}</em>
                  <span className="arena-scoreboard__avatar">{playerInitials(row.displayName)}</span>
                  <strong>
                    {row.displayName}
                    {isYou ? ' · Tú' : ''}
                  </strong>
                  <b>{Number(row.totalScore || 0).toLocaleString('es-CO')}</b>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="arena-reveal__empty">Aún no hay puntajes en esta partida.</p>
        )}
      </div>
    </div>
  );
}
