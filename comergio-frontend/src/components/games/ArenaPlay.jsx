import { useEffect, useMemo, useState } from 'react';
import { submitStudentArenaAnswer } from '../../services/studentPortal.service';
import { ARENA_CHOICE_COLORS, getArenaRemainingMs } from './arenaDraft';
import { resolveApiAssetUrl } from '../../lib/api';
import ArenaDiscuss from './ArenaDiscuss';
import ArenaReveal from './ArenaReveal';
import './arena.css';

function secondsLeft(remainingMs) {
  return Math.max(0, Math.ceil(Number(remainingMs || 0) / 1000));
}

function playerInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) {
    return '?';
  }
  return `${parts[0][0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}

export default function ArenaPlay({ session, onLeave }) {
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [orderedKeys, setOrderedKeys] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [nowTick, setNowTick] = useState(0);
  const question = session?.question || null;
  const hasAnswer = Boolean(session?.you?.answered);
  const remaining = useMemo(
    () => (session?.status === 'question' ? secondsLeft(getArenaRemainingMs(session)) : 0),
    [nowTick, session]
  );
  const timeUp = session?.status === 'question' && remaining <= 0;
  const canAnswer = session?.status === 'question' && !timeUp && !submitting;

  useEffect(() => {
    setError('');
  }, [question?.key]);

  useEffect(() => {
    setSelectedKeys(session?.you?.lastAnswer?.selectedAnswerKeys || []);
    setOrderedKeys(
      session?.you?.lastAnswer?.orderedAnswerKeys?.length
        ? session.you.lastAnswer.orderedAnswerKeys
        : (question?.type === 'puzzle' ? (question.answers || []).map((answer) => answer.key) : [])
    );
  }, [question?.key, session?.status, session?.you?.answered]);

  useEffect(() => {
    if (session?.status !== 'question') {
      return undefined;
    }
    const timerId = window.setInterval(() => setNowTick((value) => value + 1), 250);
    return () => window.clearInterval(timerId);
  }, [session?.status, session?.questionStartedAt]);

  const sendAnswer = async (nextSelected = selectedKeys, nextOrdered = orderedKeys) => {
    if (!session?.sessionId || !canAnswer) {
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitStudentArenaAnswer(session.sessionId, {
        selectedAnswerKeys: nextSelected,
        orderedAnswerKeys: nextOrdered,
      });
    } catch (submitError) {
      setError(submitError?.response?.data?.message || 'No se pudo enviar la respuesta.');
    } finally {
      setSubmitting(false);
    }
  };

  const onChoose = (answerKey) => {
    if (!canAnswer) {
      return;
    }
    if (question?.type === 'quiz' && question.selectionMode === 'multiple') {
      const next = selectedKeys.includes(answerKey)
        ? selectedKeys.filter((key) => key !== answerKey)
        : [...selectedKeys, answerKey];
      setSelectedKeys(next);
      sendAnswer(next, []);
      return;
    }
    setSelectedKeys([answerKey]);
    sendAnswer([answerKey], []);
  };

  const movePuzzle = (answerKey, direction) => {
    if (!canAnswer) {
      return;
    }
    const next = [...orderedKeys];
    const index = next.indexOf(answerKey);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= next.length) {
      return;
    }
    const current = next[index];
    next[index] = next[nextIndex];
    next[nextIndex] = current;
    setOrderedKeys(next);
  };

  if (!session) {
    return null;
  }

  const leaderboard = Array.isArray(session.leaderboard) ? session.leaderboard : [];
  const lobbyPlayers = [...(Array.isArray(session.players) ? session.players : [])]
    .sort((left, right) => String(left.playerId).localeCompare(String(right.playerId)));
  const playerCount = session.playerCount || lobbyPlayers.length;

  return (
    <section className="arena-play">
      <div className="arena-library__head">
        <div>
          <p className="games-hub__kicker">Comergio Arena</p>
          <h2>{session.quizTitle}</h2>
        </div>
        <button className="games-back" onClick={onLeave} type="button">Salir</button>
      </div>

      {session.status === 'lobby' ? (
        <div className="arena-play__wait">
          <strong>Estás dentro</strong>
          <p>
            {playerCount === 1
              ? 'Eres el primero. Esperando a tus compañeros...'
              : `${playerCount} en la sala. Esperando a que tu docente empiece.`}
          </p>
          <div className="arena-play__roster" aria-live="polite">
            {lobbyPlayers.map((player) => {
              const isYou = Boolean(session.you?.playerId && player.playerId === session.you.playerId);
              return (
                <div className={`arena-play__peer${isYou ? ' is-you' : ''}`} key={player.playerId}>
                  <span>{playerInitials(player.displayName)}</span>
                  <strong>
                    {player.displayName}
                    {isYou ? ' · Tú' : ''}
                  </strong>
                </div>
              );
            })}
          </div>
          <p className="arena-play__incoming">Van entrando más alumnos...</p>
        </div>
      ) : null}

      {question && session.status === 'question' ? (
        <div className="arena-host__question">
          <div className="arena-host__question-head">
            <p className="arena-play__prompt">{question.prompt}</p>
            <div className="arena-timer">{remaining}</div>
          </div>
          {question.imageUrl ? <img alt="" className="arena-play__image" src={resolveApiAssetUrl(question.imageUrl)} /> : null}

          {question.type === 'puzzle' ? (
            <div className="arena-puzzle-list">
              {orderedKeys.map((key) => {
                const answer = (question.answers || []).find((item) => item.key === key);
                return (
                  <div className="arena-puzzle-item" key={key}>
                    <span />
                    <strong>{answer?.text || ''}</strong>
                    <div className="arena-library__actions">
                      <button className="arena-btn-ghost" disabled={!canAnswer} onClick={() => movePuzzle(key, -1)} type="button">↑</button>
                      <button className="arena-btn-ghost" disabled={!canAnswer} onClick={() => movePuzzle(key, 1)} type="button">↓</button>
                    </div>
                  </div>
                );
              })}
              <button className="arena-btn" disabled={!canAnswer} onClick={() => sendAnswer([], orderedKeys)} type="button">
                {submitting ? 'Guardando...' : (hasAnswer ? 'Actualizar orden' : 'Enviar orden')}
              </button>
              {hasAnswer && !timeUp ? (
                <p className="arena-result">Puedes cambiar el orden hasta que se acabe el tiempo.</p>
              ) : null}
            </div>
          ) : (
            <>
              <div className="arena-play-choices">
                {(question.answers || []).map((answer, index) => (
                  <button
                    className={`arena-play-choice${selectedKeys.includes(answer.key) ? ' is-selected' : ''}`}
                    disabled={!canAnswer}
                    key={answer.key}
                    onClick={() => onChoose(answer.key)}
                    style={{ background: ARENA_CHOICE_COLORS[index % ARENA_CHOICE_COLORS.length] }}
                    type="button"
                  >
                    {answer.text}
                  </button>
                ))}
              </div>
              {hasAnswer && !timeUp ? (
                <p className="arena-result">Puedes cambiar tu respuesta hasta que se acabe el tiempo.</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {session.status === 'discuss' ? (
        <ArenaDiscuss
          answeredCount={session.answerCount || 0}
          playerCount={playerCount}
          question={question}
        />
      ) : null}

      {session.status === 'reveal' || session.status === 'leaderboard' ? (
        <ArenaReveal
          leaderboard={leaderboard}
          question={question}
          resultText={session.you?.lastAnswer
            ? (session.you.lastAnswer.correct
              ? `¡Correcto! +${session.you.lastAnswer.pointsEarned} pts`
              : 'No fue la respuesta correcta')
            : (session.you ? 'No alcanzaste a responder.' : '')}
          resultWrong={Boolean(session.you) && !session.you?.lastAnswer?.correct}
          youPlayerId={session.you?.playerId || ''}
        />
      ) : null}

      {session.status === 'ended' ? (
        <div className="arena-play__wait">
          <strong>Partida terminada</strong>
          <p>El código ya no está activo.</p>
          {leaderboard.length ? (
            <ArenaReveal
              leaderboard={leaderboard}
              question={question}
              youPlayerId={session.you?.playerId || ''}
            />
          ) : null}
        </div>
      ) : null}

      {error ? <p className="arena-error">{error}</p> : null}
    </section>
  );
}
