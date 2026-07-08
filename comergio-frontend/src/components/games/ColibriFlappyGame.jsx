import { useCallback, useEffect, useRef, useState } from 'react';
import flyGameLogo from '../../assets/fly-game-logo.png';
import { getColibriGameLeaderboard, submitColibriGameScore } from '../../services/studentPortal.service';
import { createColibriFlappyGame } from './colibriFlappyEngine';
import './ColibriFlappyGame.css';

export default function ColibriFlappyGame({ playerName = '' }) {
  const gameMountRef = useRef(null);
  const gameInstanceRef = useRef(null);
  const [screen, setScreen] = useState('menu');
  const [gameSession, setGameSession] = useState(0);
  const [rankingEntries, setRankingEntries] = useState([]);
  const [rankingState, setRankingState] = useState('idle');
  const [rankingError, setRankingError] = useState('');

  const stopGame = useCallback(() => {
    if (gameInstanceRef.current) {
      gameInstanceRef.current.destroy();
      gameInstanceRef.current = null;
    }
  }, []);

  const startGame = useCallback(() => {
    stopGame();
    setScreen('game');
    setGameSession((current) => current + 1);
  }, [stopGame]);

  const loadRanking = useCallback(async () => {
    setRankingState('loading');
    setRankingError('');

    try {
      const response = await getColibriGameLeaderboard();
      setRankingEntries(Array.isArray(response.data?.entries) ? response.data.entries : []);
      setRankingState('ready');
    } catch (error) {
      setRankingEntries([]);
      setRankingState('error');
      setRankingError(error?.response?.data?.message || error?.message || 'No se pudo cargar el ranking.');
    }
  }, []);

  const openRanking = useCallback(() => {
    setScreen('ranking');
    loadRanking();
  }, [loadRanking]);

  useEffect(() => () => {
    stopGame();
  }, [stopGame]);

  useEffect(() => {
    if (screen !== 'game' || !gameMountRef.current) {
      return undefined;
    }

    let cancelled = false;
    let instance = null;
    let frameId = 0;

    frameId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (cancelled || !gameMountRef.current) {
          return;
        }

        stopGame();
        instance = createColibriFlappyGame(gameMountRef.current, {
          onGameOver(score) {
            submitColibriGameScore(score).catch(() => null);
          },
          onExit() {
            stopGame();
            setScreen('menu');
          },
        });
        gameInstanceRef.current = instance;
        instance.resize();

        const resizeGame = () => {
          gameInstanceRef.current?.resize?.();
        };

        window.addEventListener('resize', resizeGame);
        window.visualViewport?.addEventListener('resize', resizeGame);
        instance.__resizeHandler = resizeGame;
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      if (instance?.__resizeHandler) {
        window.removeEventListener('resize', instance.__resizeHandler);
        window.visualViewport?.removeEventListener('resize', instance.__resizeHandler);
      }
      instance?.destroy();
      if (gameInstanceRef.current === instance) {
        gameInstanceRef.current = null;
      }
    };
  }, [screen, gameSession, stopGame]);

  useEffect(() => {
    if (screen === 'game') {
      gameInstanceRef.current?.resume();
      return undefined;
    }

    gameInstanceRef.current?.pause();
    return undefined;
  }, [screen]);

  return (
    <section className={`colibri-flappy-view${screen === 'game' ? ' is-playing' : ''}`} aria-label="Fly">
      <div className={`colibri-flappy-screen colibri-flappy-menu${screen === 'menu' ? ' is-active' : ''}`}>
        <div className="colibri-flappy-menu-card">
          <div className="colibri-flappy-menu-hero">
            <img
              alt="Fly"
              className="colibri-flappy-logo"
              decoding="async"
              loading="eager"
              src={flyGameLogo}
            />
          </div>
          <div className="colibri-flappy-menu-copy">
            <p>
              Vuela por el colegio esquivando postes digitales.
              Recoge insignias y descubre 3 mundos cada 20 puntos.
            </p>
            {playerName ? <span className="colibri-flappy-player">Jugando como {playerName}</span> : null}
          </div>
          <div className="colibri-flappy-menu-actions">
            <button className="colibri-flappy-play-button" onClick={startGame} type="button">
              Jugar ahora
            </button>
            <button className="colibri-flappy-ranking-button" onClick={openRanking} type="button">
              Ranking
            </button>
          </div>
        </div>
      </div>

      <div className={`colibri-flappy-screen colibri-flappy-game${screen === 'game' ? ' is-active' : ''}`}>
        <div className="colibri-flappy-game-mount" ref={gameMountRef} />
      </div>

      <div className={`colibri-flappy-screen colibri-flappy-ranking${screen === 'ranking' ? ' is-active' : ''}`}>
        <header className="colibri-flappy-ranking-header">
          <button className="colibri-flappy-back-button" onClick={() => setScreen('menu')} type="button">
            ← Volver
          </button>
          <h3>Top 50 ranking</h3>
          <p>Más puntos = mejor posición entre todos los colegios.</p>
        </header>

        {rankingState === 'loading' ? (
          <p className="colibri-flappy-ranking-empty">Cargando ranking...</p>
        ) : null}

        {rankingState === 'error' ? (
          <p className="colibri-flappy-ranking-empty">{rankingError}</p>
        ) : null}

        {rankingState === 'ready' && !rankingEntries.length ? (
          <p className="colibri-flappy-ranking-empty">Aún no hay puntajes registrados.</p>
        ) : null}

        {rankingState === 'ready' && rankingEntries.length ? (
          <ol className="colibri-flappy-ranking-list">
            {rankingEntries.map((entry) => (
              <li className="colibri-flappy-ranking-item" key={`${entry.rank}-${entry.playerName}`}>
                <span className="colibri-flappy-ranking-rank">#{entry.rank}</span>
                <span className="colibri-flappy-ranking-name">{entry.playerName}</span>
                <span className="colibri-flappy-ranking-score">{entry.score} pts</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
