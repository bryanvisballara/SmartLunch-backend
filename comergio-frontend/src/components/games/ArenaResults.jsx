import { formatArenaSavedAt } from './arenaDraft';
import './arena.css';

export default function ArenaResults({ session, compact = false }) {
  const results = session?.results || {};
  const leaderboard = Array.isArray(results.leaderboard) && results.leaderboard.length
    ? results.leaderboard
    : (Array.isArray(session?.leaderboard) ? session.leaderboard : []);
  const podium = leaderboard.slice(0, 3);
  const questions = Array.isArray(results.questions) ? results.questions : [];

  if (!leaderboard.length && !questions.length) {
    return (
      <div className="arena-results">
        <p>Todavía no hay resultados. Cuando los alumnos respondan, aquí verás el ranking y los aciertos.</p>
      </div>
    );
  }

  return (
    <div className={`arena-results${compact ? ' is-compact' : ''}`}>
      {!compact ? (
        <>
          <header className="arena-results__head">
            <div>
              <p className="games-hub__kicker">Resultados</p>
              <h3>{session?.quizTitle || 'Partida'}</h3>
              <p>
                {leaderboard.length} alumno{leaderboard.length === 1 ? '' : 's'}
                {session?.endedAt ? ` · ${formatArenaSavedAt(session.endedAt)}` : ''}
              </p>
            </div>
          </header>
          <div className="arena-podium">
            {[podium[1], podium[0], podium[2]].map((row, index) => (
              <div
                className={`arena-podium__item${index === 1 ? ' is-first' : ''}`}
                key={row?.playerId || `empty-${index}`}
              >
                <strong>{index === 1 ? '1°' : index === 0 ? '2°' : '3°'}</strong>
                <span>{row?.displayName || '—'}</span>
                <span>{row ? row.totalScore : ''}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <h3>Ranking</h3>
      )}

      <div className="arena-rank">
        {leaderboard.map((row) => (
          <div className={`arena-rank__row${row.rank <= 3 ? ' is-top' : ''}`} key={row.playerId}>
            <strong>{row.rank}</strong>
            <span>
              {row.displayName}
              {Number.isFinite(row.correctCount)
                ? ` · ${row.correctCount}/${row.answeredCount || 0} aciertos`
                : ''}
            </span>
            <span>{row.totalScore}</span>
          </div>
        ))}
      </div>

      {!compact && questions.length ? (
        <div className="arena-results__questions">
          <h3>Por pregunta</h3>
          {questions.map((question) => (
            <div className="arena-results__question" key={question.key || question.index}>
              <strong>{question.index + 1}. {question.prompt || 'Pregunta'}</strong>
              <span>
                {question.correctCount}/{question.answeredCount || 0} correctas
                {session?.playerCount ? ` · ${session.playerCount} en la partida` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
