import { useEffect, useMemo, useState } from 'react';
import { getStudentArenaSession, joinArenaSession } from '../../services/studentPortal.service';
import { createStudentTriviaApi } from '../../services/trivia.service';
import ColibriFlappyGame from './ColibriFlappyGame';
import ArenaPlay from './ArenaPlay';
import GamesHub from './GamesHub';
import TriviaStudentPanel from './trivia/TriviaStudentPanel';
import { playTriviaHomeTheme, preloadTriviaAudio, stopAllTriviaAudio, unlockTriviaAudio } from './trivia/triviaHomeAudio';
import { formatArenaPin } from './arenaDraft';
import arenaCover from '../../assets/comergio-arena.jpg';
import './arena.css';

export default function StudentGamesPanel({
  playerName = '',
  flyLocked = false,
  flyLockReason = '',
}) {
  const initialTriviaState = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const matchId = params.get('matchId');
    const scope = params.get('scope') || 'institutional';
    return matchId
      ? { currentMatch: { id: `${scope}:${matchId}`, mode: scope, scope } }
      : null;
  }, []);
  const [view, setView] = useState(() => (
    new URLSearchParams(window.location.search).get('game') === 'trivia' ? 'trivia' : 'hub'
  ));
  const [pin, setPin] = useState('');
  const [session, setSession] = useState(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const triviaApi = useMemo(() => createStudentTriviaApi(), []);

  const leaveTrivia = () => {
    stopAllTriviaAudio();
    setView('hub');
  };

  useEffect(() => {
    preloadTriviaAudio();
    return () => {
      stopAllTriviaAudio();
    };
  }, []);

  useEffect(() => {
    if (view !== 'arena' || !session?.sessionId || session.status === 'ended') {
      return undefined;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        const payload = await getStudentArenaSession(session.sessionId);
        if (!cancelled && payload?.session) {
          setSession(payload.session);
        }
      } catch (pollError) {
        if (!cancelled && pollError?.response?.status === 404) {
          setError('La partida ya no está activa.');
          setSession((current) => (current ? { ...current, status: 'ended' } : current));
        }
      }
    };

    const intervalId = window.setInterval(tick, 1000);
    tick();
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [session?.sessionId, session?.status, view]);

  const onJoin = async (event) => {
    event.preventDefault();
    setJoining(true);
    setError('');
    try {
      const payload = await joinArenaSession(pin.replace(/\D/g, ''));
      setSession(payload.session);
    } catch (joinError) {
      setError(joinError?.response?.data?.message || 'No se pudo entrar con ese código.');
    } finally {
      setJoining(false);
    }
  };

  if (view === 'fly') {
    return (
      <div className="arena-join arena-join--fly">
        <button className="games-back" onClick={() => setView('hub')} type="button">Volver a juegos</button>
        <ColibriFlappyGame playerName={playerName} />
      </div>
    );
  }

  if (view === 'arena') {
    if (session) {
      return (
        <ArenaPlay
          onLeave={() => {
            setSession(null);
            setPin('');
            setView('hub');
          }}
          session={session}
        />
      );
    }

    return (
      <section className="arena-join">
        <button className="games-back" onClick={() => setView('hub')} type="button">Volver a juegos</button>
        <form className="arena-join__panel" onSubmit={onJoin}>
          <img alt="Comergio Arena" className="arena-join__cover" src={arenaCover} />
          <div className="arena-join__copy">
            <p className="games-hub__kicker">Comergio Arena</p>
            <h2>Código de partida</h2>
            <p>Pídele a tu docente el código de 6 dígitos.</p>
          </div>
          <input
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={7}
            onChange={(event) => setPin(formatArenaPin(event.target.value))}
            placeholder="000 000"
            value={pin}
          />
          {error ? <p className="arena-error">{error}</p> : null}
          <button className="arena-btn" disabled={joining || pin.replace(/\D/g, '').length !== 6} type="submit">
            {joining ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    );
  }

  if (view === 'trivia') {
    return (
      <div className="arena-join arena-join--trivia">
        <button className="games-back" onClick={leaveTrivia} type="button">Volver a juegos</button>
        <TriviaStudentPanel api={triviaApi} initialState={initialTriviaState} playerName={playerName} />
      </div>
    );
  }

  return (
    <GamesHub
      flyLockReason={flyLockReason}
      flyLocked={flyLocked}
      onOpenArena={() => {
        setError('');
        setView('arena');
      }}
      onOpenTrivia={() => {
        unlockTriviaAudio();
        playTriviaHomeTheme();
        setError('');
        setView('trivia');
      }}
      onOpenFly={() => {
        if (!flyLocked) {
          setView('fly');
        }
      }}
      variant="student"
    />
  );
}
