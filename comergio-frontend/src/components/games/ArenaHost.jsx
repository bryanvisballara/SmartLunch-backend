import { useEffect, useMemo, useRef, useState } from 'react';
import { ARENA_CHOICE_COLORS, copyArenaPin, formatArenaPin, getArenaRemainingMs } from './arenaDraft';
import { ARENA_GAME_START_MS, ARENA_TIME_UP_MS, getArenaHostAudio } from './arenaHostAudio';
import { resolveApiAssetUrl } from '../../lib/api';
import ArenaDiscuss from './ArenaDiscuss';
import ArenaResults from './ArenaResults';
import ArenaReveal from './ArenaReveal';
import arenaHero from '../../assets/comergio-arena-hero.jpg';
import arenaLogo from '../../assets/comergio-arena-logo.png';
import './arena.css';

const LOBBY_SLOT_COUNT = 8;

function IconCopy() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <rect height="13" rx="2" stroke="currentColor" strokeWidth="1.8" width="13" x="8" y="8" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5.5v13l11-6.5L8 5.5z" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.4-3.2 3.8-4.8 7-4.8s5.6 1.6 7 4.8" />
    </svg>
  );
}

function IconExpand() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function IconCompress() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function playerInitials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function secondsLeft(remainingMs) {
  return Math.max(0, Math.ceil(Number(remainingMs || 0) / 1000));
}

function advanceLabel(status, isLast) {
  if (status === 'lobby') return 'Empezar';
  if (status === 'question') return 'Socializar';
  if (status === 'discuss') return 'Mostrar respuesta';
  if (status === 'reveal' || status === 'leaderboard') return isLast ? 'Ver podio' : 'Siguiente pregunta';
  return 'Cerrar';
}

export default function ArenaHost({
  session,
  onAdvance,
  onEnd,
  onLeave,
  advancing = false,
  ending = false,
}) {
  const [nowTick, setNowTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [projected, setProjected] = useState(false);
  const [introPhase, setIntroPhase] = useState('');
  const [countdownValue, setCountdownValue] = useState(3);
  const stageRef = useRef(null);
  const autoRevealKeyRef = useRef('');
  const introTimersRef = useRef([]);
  const onAdvanceRef = useRef(onAdvance);
  const hostAudioRef = useRef(null);
  if (!hostAudioRef.current) {
    hostAudioRef.current = getArenaHostAudio();
  }
  const hostAudio = hostAudioRef.current;
  onAdvanceRef.current = onAdvance;
  const question = session?.question || null;
  const isLast = Number(session?.currentIndex || 0) >= Number(session?.totalQuestions || 1) - 1;
  const remaining = useMemo(() => {
    if (session?.status !== 'question') {
      return 0;
    }
    return secondsLeft(getArenaRemainingMs(session));
  }, [nowTick, session]);

  useEffect(() => {
    if (session?.status !== 'question') {
      return undefined;
    }
    const timerId = window.setInterval(() => setNowTick((value) => value + 1), 250);
    return () => window.clearInterval(timerId);
  }, [session?.status, session?.questionStartedAt]);

  useEffect(() => {
    hostAudio.preload();
    return () => {
      introTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      introTimersRef.current = [];
      hostAudio.stopAll();
    };
  }, [hostAudio]);

  useEffect(() => {
    if (introPhase) {
      return;
    }
    if (session?.status === 'lobby') {
      hostAudio.playQuestionLoop();
      return;
    }
    if (session?.status === 'question') {
      hostAudio.playQuestionStart();
      return;
    }
    if (session?.status === 'discuss' || session?.status === 'reveal' || session?.status === 'leaderboard') {
      hostAudio.playSocializeLoop();
      return;
    }
    if (session?.status === 'ended') {
      hostAudio.playPodium();
      return;
    }
    hostAudio.stopAll();
  }, [hostAudio, introPhase, session?.currentIndex, session?.questionStartedAt, session?.status]);

  useEffect(() => {
    if (introPhase && session?.status && session.status !== 'lobby') {
      setIntroPhase('');
    }
  }, [introPhase, session?.status]);

  useEffect(() => {
    const syncProjected = () => {
      const active = document.fullscreenElement || document.webkitFullscreenElement;
      setProjected(Boolean(active && stageRef.current && active === stageRef.current));
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setProjected(false);
      }
    };
    document.addEventListener('fullscreenchange', syncProjected);
    document.addEventListener('webkitfullscreenchange', syncProjected);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', syncProjected);
      document.removeEventListener('webkitfullscreenchange', syncProjected);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (session?.status !== 'question') {
      autoRevealKeyRef.current = false;
      return undefined;
    }
    if (remaining > 0) {
      autoRevealKeyRef.current = true;
      return undefined;
    }
    if (!autoRevealKeyRef.current || advancing || !onAdvanceRef.current) {
      return undefined;
    }
    autoRevealKeyRef.current = false;
    hostAudio.playTimeUp();
    const timeoutId = window.setTimeout(() => {
      onAdvanceRef.current?.('discuss');
    }, ARENA_TIME_UP_MS);
    return () => window.clearTimeout(timeoutId);
  }, [advancing, hostAudio, remaining, session?.status]);

  if (!session) {
    return null;
  }

  const players = Array.isArray(session.players) ? session.players : [];
  const playerCount = session.playerCount || players.length || 0;
  const pinLabel = formatArenaPin(session.pin);
  const copyPin = async () => {
    const ok = await copyArenaPin(session.pin);
    setCopied(ok);
  };

  const clearIntroTimers = () => {
    introTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    introTimersRef.current = [];
  };

  const beginGameIntro = () => {
    if (introPhase || advancing) {
      return;
    }
    hostAudio.unlock();
    hostAudio.playGameStart();
    setIntroPhase('preview');
    setCountdownValue(3);
    clearIntroTimers();
    introTimersRef.current.push(window.setTimeout(() => {
      setIntroPhase('countdown');
      setCountdownValue(3);
    }, ARENA_GAME_START_MS));
    introTimersRef.current.push(window.setTimeout(() => setCountdownValue(2), ARENA_GAME_START_MS + 1000));
    introTimersRef.current.push(window.setTimeout(() => setCountdownValue(1), ARENA_GAME_START_MS + 2000));
    introTimersRef.current.push(window.setTimeout(() => {
      setIntroPhase('launching');
      onAdvanceRef.current?.();
    }, ARENA_GAME_START_MS + 3000));
  };

  const handleAdvance = (action) => {
    hostAudio.unlock();
    if (session.status === 'lobby') {
      beginGameIntro();
      return;
    }
    if (session.status === 'discuss') {
      hostAudio.playRevealAnswer();
    }
    onAdvance?.(action);
  };

  const toggleProject = async () => {
    const node = stageRef.current;
    if (!node) {
      return;
    }
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (active || projected) {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      } catch (_error) {
        /* CSS fallback still closes below */
      }
      setProjected(false);
      return;
    }
    try {
      if (node.requestFullscreen) {
        await node.requestFullscreen();
        return;
      }
      if (node.webkitRequestFullscreen) {
        node.webkitRequestFullscreen();
        return;
      }
    } catch (_error) {
      /* Some browsers block fullscreen inside the campus iframe. */
    }
    setProjected(true);
  };

  const hostActions = (
    <div className="arena-host__actions">
      {session.status === 'lobby' && onLeave ? (
        <button className="arena-btn-ghost" onClick={onLeave} type="button">
          Salir del lobby
        </button>
      ) : null}
      {session.pin && session.status !== 'ended' ? (
        <button className="arena-btn-ghost" onClick={copyPin} type="button">
          <IconCopy />
          {copied ? 'Código copiado' : `Copiar ${pinLabel}`}
        </button>
      ) : null}
      {session.status !== 'ended' ? (
        <button className="arena-btn-secondary" disabled={advancing || Boolean(introPhase)} onClick={() => handleAdvance()} type="button">
          <IconPlay />
          {advancing || introPhase ? 'Preparando...' : advanceLabel(session.status, isLast)}
        </button>
      ) : null}
      <button className="arena-btn-ghost" disabled={ending} onClick={onEnd} type="button">
        <IconChart />
        {session.status === 'ended' ? 'Volver a la biblioteca' : 'Cerrar y ver resultados'}
      </button>
      <button className="arena-btn-ghost" onClick={toggleProject} type="button">
        {projected ? <IconCompress /> : <IconExpand />}
        {projected ? 'Salir de pantalla' : 'Proyectar'}
      </button>
    </div>
  );

  if (session.status === 'lobby') {
    const visiblePlayers = players.slice(0, LOBBY_SLOT_COUNT);
    const extraPlayers = Math.max(0, players.length - LOBBY_SLOT_COUNT);
    const slots = Array.from({ length: LOBBY_SLOT_COUNT }, (_, index) => visiblePlayers[index] || null);

    return (
      <section
        className={`arena-host arena-host--lobby${projected ? ' is-projected' : ''}${introPhase ? ' is-intro' : ''}`}
        onPointerDown={() => {
          hostAudio.unlock();
          if (!introPhase) {
            hostAudio.playQuestionLoop();
          }
        }}
        ref={stageRef}
      >
        {hostActions}
        {introPhase ? (
          <div className="arena-intro" aria-live="polite">
            {introPhase === 'preview' ? (
              <div className="arena-intro__preview">
                <img alt="Comergio Arena" className="arena-intro__hero" src={arenaHero} />
                <img alt="" className="arena-intro__logo" src={arenaLogo} />
                <p>La competencia está por empezar</p>
                <strong>{session.quizTitle || 'Comergio Arena'}</strong>
              </div>
            ) : (
              <div className="arena-intro__count" key={introPhase === 'launching' ? 'go' : countdownValue}>
                {introPhase === 'launching' ? 1 : countdownValue}
              </div>
            )}
          </div>
        ) : null}
        <div className="arena-lobby">
          <div className="arena-lobby__scene" aria-hidden="true">
            <span className="arena-lobby__crowd" />
            <span className="arena-lobby__beam arena-lobby__beam--left" />
            <span className="arena-lobby__beam arena-lobby__beam--right" />
            <span className="arena-lobby__ring" />
          </div>

          <header className="arena-lobby__top">
            <div className="arena-lobby__identity">
              <img alt="Comergio Arena" className="arena-lobby__logo" src={arenaLogo} />
              <div className="arena-lobby__room">
                <IconPlay />
                <em>{session.quizTitle || 'Partida en vivo'}</em>
                <small>
                  {playerCount} alumno{playerCount === 1 ? '' : 's'}
                </small>
              </div>
            </div>
          </header>

          <div className="arena-lobby__mid">
            <div className="arena-lobby__hero">
              <div className="arena-lobby__board">
                <p className="arena-lobby__kicker">Únete a la arena</p>
                <p className="arena-lobby__help">Comparte este código con tus alumnos</p>
                <button className="arena-lobby__pin" onClick={copyPin} type="button">
                  {pinLabel}
                  <IconCopy />
                </button>
              </div>
            </div>
          </div>

          <div className="arena-lobby__floor">
            <div className="arena-lobby__pods">
              {slots.map((player, index) => (
                <div className={`arena-lobby__pod${player ? ' is-filled' : ''}`} key={player?.playerId || `slot-${index}`}>
                  <span>{player ? playerInitials(player.displayName) : <IconUser />}</span>
                  <small>{player?.displayName || 'Libre'}</small>
                </div>
              ))}
              {extraPlayers ? (
                <div className="arena-lobby__pod is-filled">
                  <span>+{extraPlayers}</span>
                  <small>más</small>
                </div>
              ) : null}
            </div>
            <div className="arena-lobby__wait">
              <i />
              <span>Esperando alumnos...</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`arena-host arena-host--live${session.status === 'discuss' ? ' is-discuss' : ''}${session.status === 'reveal' || session.status === 'leaderboard' ? ' is-reveal' : ''}${session.status === 'ended' ? ' is-ended' : ''}${projected ? ' is-projected' : ''}`} onPointerDown={() => hostAudio.unlock()} ref={stageRef}>
      {hostActions}
      <div className="arena-live__scene" aria-hidden="true">
        <span className="arena-live__glow arena-live__glow--gold" />
        <span className="arena-live__glow arena-live__glow--blue" />
        <span className="arena-lobby__crowd" />
        <span className="arena-lobby__beam arena-lobby__beam--left" />
        <span className="arena-lobby__beam arena-lobby__beam--right" />
      </div>

      <div className="arena-live__top">
        <div className="arena-live__brand">
          <img alt="Comergio Arena" src={arenaLogo} />
          <div className="arena-lobby__room">
            <IconPlay />
            <em>{session.quizTitle || 'Partida en vivo'}</em>
            <small>
              {playerCount} alumno{playerCount === 1 ? '' : 's'}
              {` · Pregunta ${(session.currentIndex || 0) + 1}/${session.totalQuestions || 0}`}
              {session.status === 'question' ? ` · ${session.answerCount || 0} respuestas` : ''}
            </small>
          </div>
        </div>
      </div>

      <div className="arena-live__stage">
        {question && session.status === 'question' ? (
          <div className="arena-host__question">
            <div className="arena-host__question-head">
              <p className="arena-host__prompt">{question.prompt}</p>
              <div className={`arena-timer${remaining <= 5 ? ' is-urgent' : ''}`}>{remaining}</div>
            </div>
            {question.imageUrl ? <img alt="" className="arena-host__image" src={resolveApiAssetUrl(question.imageUrl)} /> : null}
            <div className="arena-host-choices">
              {(question.answers || []).map((answer, index) => (
                <div
                  className="arena-host-choice"
                  key={answer.key}
                  style={{ background: ARENA_CHOICE_COLORS[index % ARENA_CHOICE_COLORS.length] }}
                >
                  {answer.text}
                  {session.answerCounts?.[answer.key] ? ` · ${session.answerCounts[answer.key]}` : ''}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {session.status === 'discuss' ? (
          <ArenaDiscuss
            answeredCount={session.answerCount || 0}
            isHost
            playerCount={playerCount}
            question={question}
          />
        ) : null}

        {session.status === 'reveal' || session.status === 'leaderboard' ? (
          <ArenaReveal
            leaderboard={session.leaderboard}
            question={question}
          />
        ) : null}

        {session.status === 'ended' ? <ArenaResults session={session} /> : null}
      </div>
    </section>
  );
}
