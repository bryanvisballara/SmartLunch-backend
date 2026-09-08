import { useEffect, useState } from 'react';
import { getStudentArenaSession, joinArenaSession } from '../../services/studentPortal.service';
import ColibriFlappyGame from './ColibriFlappyGame';
import ArenaPlay from './ArenaPlay';
import GamesHub from './GamesHub';
import { formatArenaPin } from './arenaDraft';
import arenaCover from '../../assets/comergio-arena.jpg';
import './arena.css';

export default function StudentGamesPanel({
  playerName = '',
  flyLocked = false,
  flyLockReason = '',
}) {
  const [view, setView] = useState('hub');
  const [pin, setPin] = useState('');
  const [session, setSession] = useState(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <GamesHub
      flyLockReason={flyLockReason}
      flyLocked={flyLocked}
      onOpenArena={() => {
        setError('');
        setView('arena');
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
