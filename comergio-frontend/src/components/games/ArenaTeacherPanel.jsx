import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  advanceArenaHostSession,
  createArenaQuiz,
  deleteArenaQuiz,
  endArenaHostSession,
  getArenaHostSession,
  listArenaQuizzes,
  playArenaQuiz,
  updateArenaQuiz,
} from '../../campus/services/campus.service';
import { triviaTeacherApi } from '../../services/trivia.service';
import { createArenaDraft, copyArenaPin, formatArenaPin, formatArenaSavedAt } from './arenaDraft';
import { getArenaHostAudio } from './arenaHostAudio';
import ArenaEditor from './ArenaEditor';
import ArenaHost from './ArenaHost';
import GamesHub from './GamesHub';
import TriviaTeacherPanel from './trivia/TriviaTeacherPanel';
import arenaColibri from '../../assets/arena-colibri.png';
import arenaLogo from '../../assets/comergio-arena-logo.png';
import './arena.css';

function IconGames() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M7 9.5h3M6.2 14.5h2.2M15.8 10.2v.01M18.2 13.2v.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M8.2 5.5h7.6c2.6 0 4.7 2.2 4.5 4.8l-.5 6.2c-.2 2.2-2.1 3.9-4.3 3.9h-7c-2.2 0-4.1-1.7-4.3-3.9L3.7 10.3C3.5 7.7 5.6 5.5 8.2 5.5Z" stroke="currentColor" strokeWidth="1.7" />
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

function IconPlus() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <rect height="13" rx="2" stroke="currentColor" strokeWidth="1.8" width="13" x="8" y="8" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M4 16.8V20h3.2L18.6 8.6a1.8 1.8 0 0 0 0-2.5l-1.7-1.7a1.8 1.8 0 0 0-2.5 0L4 16.8Z" stroke="currentColor" strokeWidth="1.7" />
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

function IconTrash() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M5 7h14M10 7V5h4v2M8 7l.7 12h6.6L16 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}


export default function ArenaTeacherPanel({ onOpenFlyLock }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState('hub');
  const [draft, setDraft] = useState(() => createArenaDraft());
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [shareBlocked, setShareBlocked] = useState('');
  const [copiedPin, setCopiedPin] = useState('');

  const quizzesQuery = useQuery({
    queryKey: ['arena', 'teacher', 'quizzes'],
    queryFn: listArenaQuizzes,
    enabled: view === 'library' || view === 'editor',
  });

  const hostQuery = useQuery({
    queryKey: ['arena', 'teacher', 'session', sessionId],
    queryFn: () => getArenaHostSession(sessionId),
    enabled: view === 'host' && Boolean(sessionId),
    refetchInterval: (query) => {
      if (view !== 'host' || !sessionId) {
        return false;
      }
      return query.state.data?.session?.status === 'ended' ? false : 1000;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (payload.id) {
        return updateArenaQuiz(payload.id, payload);
      }
      return createArenaQuiz(payload);
    },
    onSuccess: (data) => {
      const quiz = data?.quiz;
      if (quiz?.id) {
        setDraft((current) => ({
          ...current,
          id: quiz.id,
          activePin: quiz.activePin || current.activePin || '',
          activeSessionId: quiz.activeSessionId || current.activeSessionId || '',
        }));
      }
      if (data?.session?.sessionId) {
        setSessionId(data.session.sessionId);
        queryClient.setQueryData(['arena', 'teacher', 'session', data.session.sessionId], {
          session: data.session,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['arena', 'teacher', 'quizzes'] });
      queryClient.invalidateQueries({ queryKey: ['arena', 'teacher', 'active-session'] });
      setError('');
      setShareBlocked(data?.shareBlocked || '');
      setSavedMessage(
        quiz?.activePin
          ? 'Guardado. Comparte el código con tus alumnos; el set queda en tu biblioteca para clase.'
          : 'Guardado en tu biblioteca. Completa el set y vuelve a guardar para obtener el código.'
      );
    },
    onError: (saveError) => {
      setSavedMessage('');
      setError(saveError?.response?.data?.message || 'No se pudo guardar el set.');
    },
  });

  const playMutation = useMutation({
    mutationFn: async (incomingDraft) => {
      getArenaHostAudio().playQuestionLoop();
      const source = incomingDraft || draft;
      let quizId = source.id;
      if (!quizId) {
        const created = await createArenaQuiz(source);
        quizId = created?.quiz?.id;
        if (quizId) {
          setDraft((current) => ({ ...current, id: quizId }));
        }
      } else {
        await updateArenaQuiz(quizId, source);
      }
      if (!quizId) {
        throw new Error('No se pudo crear el set.');
      }
      return playArenaQuiz(quizId);
    },
    onSuccess: (data) => {
      const nextSessionId = data?.session?.sessionId;
      if (nextSessionId) {
        setSessionId(nextSessionId);
        setView('host');
        queryClient.setQueryData(['arena', 'teacher', 'session', nextSessionId], data);
      }
      if (data?.session?.pin) {
        setDraft((current) => ({
          ...current,
          activePin: data.session.pin,
          activeSessionId: nextSessionId || current.activeSessionId,
        }));
      }
      queryClient.invalidateQueries({ queryKey: ['arena', 'teacher', 'quizzes'] });
      queryClient.invalidateQueries({ queryKey: ['arena', 'teacher', 'active-session'] });
      setError('');
    },
    onError: (playError) => {
      setError(playError?.response?.data?.message || playError.message || 'No se pudo iniciar la partida.');
    },
  });

  const advanceMutation = useMutation({
    mutationFn: (action) => advanceArenaHostSession(sessionId, action),
    onSuccess: (data) => {
      queryClient.setQueryData(['arena', 'teacher', 'session', sessionId], data);
      if (data?.session?.status === 'ended') {
        queryClient.invalidateQueries({ queryKey: ['arena', 'teacher', 'quizzes'] });
        queryClient.invalidateQueries({ queryKey: ['arena', 'teacher', 'active-session'] });
      }
    },
  });

  const endMutation = useMutation({
    mutationFn: () => endArenaHostSession(sessionId),
    onSuccess: (data) => {
      queryClient.setQueryData(['arena', 'teacher', 'session', sessionId], data);
      queryClient.invalidateQueries({ queryKey: ['arena', 'teacher', 'quizzes'] });
      queryClient.invalidateQueries({ queryKey: ['arena', 'teacher', 'active-session'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteArenaQuiz,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arena', 'teacher', 'quizzes'] });
    },
  });

  const openEditor = (quiz) => {
    setError('');
    setSavedMessage('');
    setShareBlocked('');
    setDraft(quiz ? { ...createArenaDraft(), ...quiz, id: quiz.id } : createArenaDraft());
    setView('editor');
    if (quiz?.activeSessionId) {
      setSessionId(quiz.activeSessionId);
    }
  };

  const session = hostQuery.data?.session || null;
  const quizzes = Array.isArray(quizzesQuery.data?.quizzes) ? quizzesQuery.data.quizzes : [];

  if (view === 'host') {
    if (hostQuery.isError) {
      return (
        <section className="arena-library">
          <p className="arena-error">No se pudo cargar la partida.</p>
          <button className="arena-btn-ghost" onClick={() => { setView('library'); setSessionId(''); }} type="button">
            Volver a la biblioteca
          </button>
        </section>
      );
    }
    if (!session) {
      return <p>Cargando partida...</p>;
    }
    return (
      <ArenaHost
        advancing={advanceMutation.isPending}
        ending={endMutation.isPending}
        onLeave={() => {
          queryClient.invalidateQueries({ queryKey: ['arena', 'teacher', 'quizzes'] });
          queryClient.invalidateQueries({ queryKey: ['arena', 'teacher', 'active-session'] });
          setView('library');
        }}
        onAdvance={(action) => advanceMutation.mutate(action)}
        onEnd={() => {
          if (session?.status === 'ended') {
            queryClient.invalidateQueries({ queryKey: ['arena', 'teacher', 'quizzes'] });
            setView('library');
            return;
          }
          endMutation.mutate();
        }}
        session={session}
      />
    );
  }

  if (view === 'editor') {
    return (
      <ArenaEditor
        draft={draft}
        error={error}
        savedMessage={savedMessage}
        shareBlocked={shareBlocked}
        sharePin={draft.activePin || ''}
        onOpenLobby={draft.activeSessionId ? () => {
          getArenaHostAudio().playQuestionLoop();
          setSessionId(draft.activeSessionId);
          setView('host');
        } : undefined}
        onBack={() => setView('library')}
        onChange={setDraft}
        onPlay={() => playMutation.mutate(draft)}
        onSave={() => saveMutation.mutate(draft)}
        playing={playMutation.isPending}
        saving={saveMutation.isPending}
      />
    );
  }

  if (view === 'library') {
    return (
      <section className="arena-library">
        <header className="arena-hero">
          <div className="arena-hero__swoosh arena-hero__swoosh--left" aria-hidden="true" />
          <div className="arena-hero__swoosh arena-hero__swoosh--right" aria-hidden="true" />

          <div className="arena-hero__brand">
            <img alt="Comergio Arena" src={arenaLogo} />
          </div>

          <div className="arena-hero__copy">
            <h2>
              Crea competencias, reta a <span>tus estudiantes</span> y convierte el aprendizaje <b>en juego.</b>
            </h2>
          </div>

          <div className="arena-hero__mascot">
            <img alt="" src={arenaColibri} />
            <p>¡Pequeñas preguntas, grandes logros!</p>
          </div>
        </header>

        <div className="arena-library__toolbar">
          <div className="arena-library__toolbar-copy">
            <span className="arena-library__toolbar-icon" aria-hidden="true">
              <IconGames />
            </span>
            <div>
              <h3>Mis partidas</h3>
              <p>Guárdalas en casa y, en clase, comparte el código. Jugar reabre el mismo lobby.</p>
            </div>
          </div>
          <div className="arena-library__toolbar-actions">
            <button className="arena-btn-ghost" onClick={() => setView('hub')} type="button">
              <IconGames />
              Juegos
            </button>
            <button className="arena-btn-ghost is-current" type="button">
              <IconChart />
              Mis partidas
            </button>
            <button className="arena-btn" onClick={() => openEditor()} type="button">
              <IconPlus />
              Nuevo set
            </button>
          </div>
        </div>

        {quizzesQuery.isLoading ? <p>Cargando sets...</p> : null}
        {error ? <p className="arena-error">{error}</p> : null}
        {!quizzesQuery.isLoading && !quizzes.length ? (
          <div className="arena-library__empty">Todavía no tienes sets. Créalos, pulsa Guardar y el código queda listo para compartir en clase.</div>
        ) : null}

        <div className="arena-library__grid">
          {quizzes.map((quiz) => (
            <article className="arena-library__card" key={quiz.id}>
              <div className="arena-library__card-copy">
                <strong>{quiz.title}</strong>
                <span>
                  {quiz.questions?.length || 0} pregunta{(quiz.questions?.length || 0) === 1 ? '' : 's'}
                  {quiz.updatedAt ? ` · ${formatArenaSavedAt(quiz.updatedAt)}` : ''}
                </span>
              </div>
              {quiz.activePin ? (
                <div className="arena-library__pin">
                  <small>Código de clase</small>
                  <div>
                    <strong>{formatArenaPin(quiz.activePin)}</strong>
                    <button
                      onClick={async () => {
                        const ok = await copyArenaPin(quiz.activePin);
                        setCopiedPin(ok ? quiz.id : '');
                      }}
                      type="button"
                    >
                      <IconCopy />
                      {copiedPin === quiz.id ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="arena-library__draft">
                  {quiz.canPlay ? 'Pulsa Jugar o Guardar para el código.' : 'Borrador: completa el set para compartir código.'}
                </p>
              )}
              {quiz.lastResult?.sessionId ? (
                <p className="arena-library__last">
                  Última partida
                  {quiz.lastResult.winnerName
                    ? `: ${quiz.lastResult.winnerName} · ${quiz.lastResult.winnerScore} pts`
                    : ` · ${quiz.lastResult.playerCount || 0} alumnos`}
                </p>
              ) : null}
              <div className="arena-library__card-actions">
                <button
                  className="arena-btn-secondary"
                  disabled={!quiz.canPlay || playMutation.isPending}
                  onClick={() => playMutation.mutate(quiz)}
                  type="button"
                >
                  <IconPlay />
                  {quiz.activePin ? 'Abrir lobby' : 'Jugar'}
                </button>
                <button className="arena-btn-ghost" onClick={() => openEditor(quiz)} type="button">
                  <IconEdit />
                  Editar
                </button>
                {quiz.lastResult?.sessionId ? (
                  <button
                    className="arena-btn-ghost"
                    onClick={() => {
                      setSessionId(quiz.lastResult.sessionId);
                      setView('host');
                    }}
                    type="button"
                  >
                    <IconChart />
                    Resultados
                  </button>
                ) : null}
                <button className="arena-library__delete" onClick={() => deleteMutation.mutate(quiz.id)} type="button">
                  <IconTrash />
                  Borrar
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (view === 'trivia') {
    return (
      <section className="arena-library">
        <button className="games-back" onClick={() => setView('hub')} type="button">Volver a juegos</button>
        <TriviaTeacherPanel api={triviaTeacherApi} />
      </section>
    );
  }

  return (
    <GamesHub
      onOpenArena={() => setView('library')}
      onOpenFly={onOpenFlyLock}
      onOpenTrivia={() => setView('trivia')}
      variant="teacher"
    />
  );
}
