import { resolveApiAssetUrl } from '../../lib/api';
import './arena.css';

export default function ArenaDiscuss({ question, answeredCount = 0, playerCount = 0, isHost = false }) {
  return (
    <div className="arena-discuss">
      <p className="arena-discuss__kicker">Hora de socializar</p>
      <h2>¿Qué piensan?</h2>
      <p className="arena-discuss__lead">
        {isHost
          ? 'Comenten la pregunta con el curso. Cuando quieras, muestra la respuesta.'
          : 'Hablen con su docente y compañeros. La respuesta se revela cuando el docente lo indique.'}
      </p>
      <div className="arena-discuss__card">
        <span aria-hidden="true">💬</span>
        {question?.prompt ? <strong>{question.prompt}</strong> : <strong>Revisen la pregunta juntos.</strong>}
        {question?.imageUrl ? <img alt="" src={resolveApiAssetUrl(question.imageUrl)} /> : null}
      </div>
      {playerCount ? (
        <p className="arena-discuss__meta">
          {answeredCount} de {playerCount} respondieron
        </p>
      ) : null}
    </div>
  );
}
