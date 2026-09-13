import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TriviaAdvanceContinue from './TriviaAdvanceContinue';
import TriviaBoard from './TriviaBoard';
import TriviaHome from './TriviaHome';
import TriviaInviteLobby from './TriviaInviteLobby';
import TriviaMatchSummary from './TriviaMatchSummary';
import TriviaOnboarding from './TriviaOnboarding';
import TriviaQuestion from './TriviaQuestion';
import TriviaResult from './TriviaResult';
import TriviaSubjectPicker from './TriviaSubjectPicker';
import TriviaSubjectWheel from './TriviaSubjectWheel';
import { playTriviaHomeTheme, stopAllTriviaAudio, stopTriviaHomeTheme, stopTriviaPodiumSound, stopTriviaQuestionEntrance } from './triviaHomeAudio';
import { createTriviaClient } from './triviaClient';
import './trivia.css';

function errorMessage(error) {
  return error?.response?.data?.message || error?.message || 'No pudimos completar la acción. Intenta de nuevo.';
}

function unwrap(response) {
  return response?.state || response?.data || response || {};
}

function matchSubjectId(match) {
  return match?.selectedSubjectId
    || match?.question?.subject?.id
    || match?.question?.subject?.name
    || match?.question?.subjectKey
    || match?.question?.category
    || match?.roulette?.selectedCategory
    || '';
}

function alreadySpun(match) {
  return Boolean(match?.question && (match.phase === 'question' || match.phase === 'await_answer'));
}

function isSpinAlreadyDone(error) {
  const message = errorMessage(error);
  return error?.response?.status === 409 && /giro ya fue realizado/i.test(message);
}

function resolveScreen(snapshot, match, override) {
  if (override) {
    return override;
  }
  if (!match) {
    return 'home';
  }
  const phase = match.phase || match.status;
  const phaseScreens = {
    invited: 'lobby',
    lobby: 'lobby',
    waiting: 'lobby',
    board: 'board',
    subject: 'wheel',
    choose_subject: 'wheel',
    question: 'question',
    result: 'result',
    reveal: 'result',
    ended: 'summary',
    completed: 'summary',
  };
  return phaseScreens[phase] || snapshot.screen || 'board';
}

export default function TriviaStudentPanel({
  api,
  autoLoad = true,
  initialState = null,
  playerName = '',
  pollInterval = 2500,
}) {
  const client = useMemo(() => createTriviaClient(api), [api]);
  const [snapshot, setSnapshot] = useState(initialState || {});
  const [matchId, setMatchId] = useState(initialState?.currentMatch?.id || initialState?.match?.id || '');
  const [viewOverride, setViewOverride] = useState('');
  const [ageFlow, setAgeFlow] = useState('');
  const [ageRange, setAgeRange] = useState(initialState?.profile?.ageRange || '');
  const [gameMode, setGameMode] = useState(initialState?.currentMatch?.gameMode || '1v1');
  const [candidateIds, setCandidateIds] = useState(initialState?.currentMatch?.invitedStudentIds || []);
  const [search, setSearch] = useState('');
  const [answerChoice, setAnswerChoice] = useState({ questionId: '', answerId: '' });
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [spinRevealComplete, setSpinRevealComplete] = useState(false);
  const [loading, setLoading] = useState(autoLoad && !Object.keys(initialState || {}).length);
  const [error, setError] = useState('');
  const [boardAdvance, setBoardAdvance] = useState(null);
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [selectedSubjectKeys, setSelectedSubjectKeys] = useState([]);
  const initialLoadStarted = useRef(false);

  const applyResponse = useCallback((response) => {
    const next = unwrap(response);
    setSnapshot((current) => ({ ...current, ...next }));
    if (next.profile?.ageRange) {
      setAgeRange(next.profile.ageRange);
    }
    const nextMatch = next.currentMatch || next.match;
    if (nextMatch?.id) {
      setMatchId(nextMatch.id);
      if (nextMatch.gameMode) {
        setGameMode(nextMatch.gameMode);
      }
      if (Array.isArray(nextMatch.invitedStudentIds)) {
        setCandidateIds(nextMatch.invitedStudentIds);
      }
    }
    return next;
  }, []);

  const refresh = useCallback(async ({ id = matchId, quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
    }
    try {
      const response = await client.getStudentTriviaState(id ? { matchId: id } : {});
      applyResponse(response);
      setError('');
    } catch (requestError) {
      if (!quiet) {
        setError(errorMessage(requestError));
      }
    } finally {
      if (!quiet) {
        setLoading(false);
      }
    }
  }, [applyResponse, client, matchId]);

  useEffect(() => {
    if (!autoLoad || initialLoadStarted.current) {
      return undefined;
    }
    initialLoadStarted.current = true;
    let active = true;
    const load = async () => {
      if (active) {
        await refresh({ quiet: Boolean(Object.keys(initialState || {}).length) });
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [autoLoad, initialState, refresh]);

  useEffect(() => () => {
    stopAllTriviaAudio();
  }, []);

  const currentMatch = snapshot.currentMatch
    || snapshot.match
    || (snapshot.activeMatches || []).find((match) => match.id === matchId)
    || null;
  const currentMatchId = currentMatch?.id || matchId;
  const screen = resolveScreen(snapshot, currentMatch, viewOverride);
  const shouldPoll = autoLoad && (
    screen === 'home'
    || (
      currentMatchId
      && currentMatch?.rawId !== 'new'
      && !['onboarding', 'summary'].includes(screen)
    )
  );

  useEffect(() => {
    const keepHomeTheme = screen === 'home'
      || screen === 'subjects'
      || screen === 'lobby'
      || screen === 'onboarding'
      || screen === 'board';
    if (keepHomeTheme) {
      stopTriviaQuestionEntrance();
      stopTriviaPodiumSound();
      // Keep the same home theme across mode pick → subjects/lobby → board.
      playTriviaHomeTheme();
      return undefined;
    }
    stopTriviaHomeTheme();
    if (screen !== 'question') {
      stopTriviaQuestionEntrance();
    }
    if (screen !== 'summary') {
      stopTriviaPodiumSound();
    }
    return undefined;
  }, [screen]);

  useEffect(() => {
    if (!shouldPoll) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      refresh({ id: screen === 'home' ? '' : currentMatchId, quiet: true });
    }, screen === 'home' ? Math.max(6000, pollInterval) : Math.max(1000, pollInterval));
    return () => window.clearInterval(intervalId);
  }, [currentMatchId, pollInterval, refresh, screen, shouldPoll]);

  const mutate = async (request, { clearOverride = true } = {}) => {
    setLoading(true);
    setError('');
    try {
      const response = await request();
      applyResponse(response);
      if (clearOverride) {
        setViewOverride('');
      }
      return unwrap(response);
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async (profile) => {
    const next = await mutate(
      () => client.saveTriviaProfile(profile),
      { clearOverride: false }
    );
    if (next) {
      setAgeRange(next.profile?.ageRange || profile.ageRange);
      const nextFlow = ageFlow;
      setAgeFlow('');
      if (nextFlow === 'start' || nextFlow === 'lobby') {
        setGameMode('1v1');
        setCandidateIds([]);
        setSearch('');
        await mutate(() => client.createTriviaMatch({ mode: 'global', gameMode: '1v1' }));
        return;
      }
      setViewOverride('home');
    }
  };

  const openAgeEditor = (flow = 'home') => {
    setAgeFlow(flow);
    setError('');
    setViewOverride('onboarding');
  };

  const openSubjectPicker = async () => {
    setError('');
    setLoading(true);
    setViewOverride('subjects');
    playTriviaHomeTheme();
    try {
      const response = await client.listTriviaSubjects({ mode: 'institutional' });
      const subjects = response.subjects || [];
      setAvailableSubjects(subjects);
      setSelectedSubjectKeys((current) => (
        current.length ? current.filter((key) => subjects.some((subject) => subject.key === key)) : []
      ));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const createMatch = async (mode, extra = {}) => {
    if (mode === 'institutional' && !(extra.rouletteCategories || []).length) {
      await openSubjectPicker();
      return;
    }
    setGameMode('1v1');
    setCandidateIds([]);
    setSearch('');
    const confirmedAge = Boolean(
      snapshot.profile?.ageBandConfirmed && (snapshot.profile?.ageRange || ageRange)
    );
    if (mode === 'global' && !confirmedAge) {
      openAgeEditor('start');
      return;
    }
    setAgeFlow('');
    setLoading(true);
    setError('');
    try {
      const response = await client.createTriviaMatch({ mode, gameMode: '1v1', ...extra });
      applyResponse(response);
      setViewOverride('');
    } catch (requestError) {
      if (mode === 'global' && (requestError?.response?.status === 409 || /rango de edad/i.test(errorMessage(requestError)))) {
        openAgeEditor('start');
        return;
      }
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const respondToInvite = async (id, accept) => {
    const next = await mutate(() => client.respondToTriviaInvite(id, { accept }));
    if (accept && next) {
      setMatchId(next.currentMatch?.id || next.match?.id || id);
    }
  };

  const startMatch = async () => {
    await mutate(() => client.startTriviaMatch(currentMatchId));
  };

  const openMatch = async (id) => {
    setMatchId(id);
    setLoading(true);
    setError('');
    try {
      const response = await client.getStudentTriviaState({ matchId: id });
      applyResponse(response);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const updateLobby = async (nextMode, nextCandidateIds) => {
    setGameMode(nextMode);
    setCandidateIds(nextCandidateIds);
    await mutate(
      () => client.updateTriviaLobby(currentMatchId, {
        gameMode: nextMode,
        invitedStudentIds: nextCandidateIds,
      }),
      { clearOverride: false }
    );
  };

  const toggleCandidate = (candidateId) => {
    const nextIds = candidateIds.includes(candidateId)
      ? candidateIds.filter((id) => id !== candidateId)
      : [...candidateIds, candidateId];
    updateLobby(gameMode, nextIds);
  };

  const blockCandidate = async (candidateId) => {
    setCandidateIds((current) => current.filter((id) => id !== candidateId));
    await mutate(() => client.blockTriviaCandidate(candidateId), { clearOverride: false });
  };

  const reportCandidate = async (candidateId) => {
    const details = window.prompt('Cuéntanos brevemente por qué reportas este perfil:');
    if (!details?.trim()) {
      return;
    }
    const next = await mutate(
      () => client.reportTriviaCandidate(candidateId, details.trim()),
      { clearOverride: false }
    );
    if (next) {
      window.alert('Gracias. Gerencia revisará el reporte.');
    }
  };

  const playWheelReveal = async (match) => {
    const subjectId = matchSubjectId(match);
    if (subjectId) {
      setSelectedSubjectId(subjectId);
    }
    setViewOverride('wheel');
    setSpinning(true);
    setSpinRevealComplete(false);
    await new Promise((resolve) => window.setTimeout(resolve, 3200));
    setSpinning(false);
    setSpinRevealComplete(true);
  };

  const chooseSubject = async () => {
    if (spinning) {
      return;
    }
    setError('');
    setViewOverride('wheel');
    setSelectedSubjectId('');
    setSpinRevealComplete(false);
    setSpinning(true);
    if (alreadySpun(currentMatch)) {
      await playWheelReveal(currentMatch);
      return;
    }
    setLoading(true);
    try {
      const response = await client.chooseTriviaSubject(currentMatchId, {
        match: currentMatch,
        turnToken: currentMatch.turnToken,
        version: currentMatch.version,
      });
      const next = unwrap(response);
      applyResponse(response);
      await playWheelReveal(next.currentMatch || next.match || currentMatch);
    } catch (requestError) {
      if (isSpinAlreadyDone(requestError)) {
        try {
          const refreshed = unwrap(await client.getStudentTriviaState({ matchId: currentMatchId }));
          applyResponse(refreshed);
          await playWheelReveal(refreshed.currentMatch || refreshed.match || currentMatch);
          return;
        } catch (refreshError) {
          setSpinning(false);
          setError(errorMessage(refreshError));
          return;
        }
      }
      setSpinning(false);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const question = currentMatch?.question || snapshot.question;
  const selectedAnswerId = answerChoice.questionId === question?.id ? answerChoice.answerId : '';

  const submitAnswer = async (answerId) => {
    const next = await mutate(() => client.submitTriviaAnswer(currentMatchId, {
      questionId: question?.id,
      answerId,
      match: currentMatch,
      question,
    }), { clearOverride: false });
    if (next) {
      setViewOverride('result');
    }
  };

  const goHome = () => {
    stopTriviaQuestionEntrance();
    stopTriviaPodiumSound();
    setMatchId('');
    setBoardAdvance(null);
    setViewOverride('home');
    refresh({ id: '' });
  };

  const leaveLobby = async () => {
    const leavingId = currentMatchId;
    setMatchId('');
    setViewOverride('home');
    await mutate(() => client.leaveTriviaMatch(leavingId));
  };

  let content = null;

  if (screen === 'subjects') {
    content = (
      <TriviaSubjectPicker
        error={error}
        loading={loading}
        onBack={() => {
          setViewOverride('home');
          setError('');
        }}
        onContinue={(keys) => createMatch('institutional', { rouletteCategories: keys })}
        onToggle={(key) => {
          setSelectedSubjectKeys((current) => (
            current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
          ));
        }}
        selectedKeys={selectedSubjectKeys}
        subjects={availableSubjects}
      />
    );
  } else if (screen === 'onboarding') {
    content = (
      <TriviaOnboarding
        ageRange={ageRange}
        error={error}
        loading={loading}
        onAgeRangeChange={setAgeRange}
        editing={ageFlow === 'home' || ageFlow === 'lobby'}
        onBack={() => {
          const nextScreen = ageFlow === 'lobby' ? 'lobby' : 'home';
          setAgeFlow('');
          setViewOverride(nextScreen);
          setError('');
        }}
        onSubmit={saveProfile}
        playerName={playerName || snapshot.profile?.name}
        submitLabel={ageFlow === 'home' || ageFlow === 'lobby' ? 'Guardar rango' : 'Continuar'}
      />
    );
  } else if (screen === 'lobby') {
    const normalizedSearch = search.trim().toLocaleLowerCase('es');
    const candidates = (snapshot.candidates || currentMatch?.candidates || []).filter((candidate) => {
      return !normalizedSearch
        || `${candidate.name || ''} ${candidate.grade || candidate.course || ''}`.toLocaleLowerCase('es').includes(normalizedSearch);
    });
    content = (
      <TriviaInviteLobby
        ageRange={ageRange}
        candidates={candidates}
        error={error}
        gameMode={gameMode}
        isHost={currentMatch?.isHost ?? currentMatch?.host?.isYou ?? true}
        loading={loading}
        match={currentMatch}
        onBack={leaveLobby}
        onBlockCandidate={blockCandidate}
        onGameModeChange={(mode) => {
          const inviteLimit = mode === '1v1' ? 1 : mode === '3' ? 2 : 3;
          updateLobby(mode, candidateIds.slice(0, inviteLimit));
        }}
        onChangeAgeRange={currentMatch?.invitationSent ? undefined : () => openAgeEditor('lobby')}
        onSearchChange={setSearch}
        onReportCandidate={reportCandidate}
        onChangeSubjects={currentMatch?.invitationSent || currentMatch?.mode !== 'institutional'
          ? undefined
          : openSubjectPicker}
        onStart={startMatch}
        onToggleCandidate={toggleCandidate}
        search={search}
        selectedCandidateIds={candidateIds}
        selectedSubjects={
          availableSubjects.filter((subject) => selectedSubjectKeys.includes(subject.key)).length
            ? availableSubjects.filter((subject) => selectedSubjectKeys.includes(subject.key))
            : currentMatch?.subjects
        }
      />
    );
  } else if (screen === 'board') {
    content = (
      <TriviaBoard
        advanceFrom={boardAdvance?.from}
        advanceTo={boardAdvance?.to}
        match={currentMatch}
        onAdvanceComplete={() => {
          const nextView = boardAdvance?.next || 'wheel';
          if (nextView === 'summary') {
            setBoardAdvance(null);
            setViewOverride('summary');
            return;
          }
          setViewOverride('advance');
        }}
        onContinue={() => {
          setError('');
          setBoardAdvance(null);
          setViewOverride('wheel');
          if (alreadySpun(currentMatch)) {
            playWheelReveal(currentMatch);
            return;
          }
          setSelectedSubjectId('');
          setSpinRevealComplete(false);
        }}
        onExit={goHome}
        waiting={!currentMatch?.isYourTurn}
      />
    );
  } else if (screen === 'advance') {
    content = (
      <TriviaAdvanceContinue
        from={boardAdvance?.from ?? Math.max(0, Number(currentMatch?.you?.station || 1) - 1)}
        onContinue={() => {
          setBoardAdvance(null);
          setSelectedSubjectId('');
          setSpinRevealComplete(false);
          setViewOverride('wheel');
        }}
        to={boardAdvance?.to ?? Number(currentMatch?.you?.station || 0)}
      />
    );
  } else if (screen === 'wheel') {
    content = (
      <TriviaSubjectWheel
        disabled={spinning || (!currentMatch?.isYourTurn && !alreadySpun(currentMatch))}
        mode={currentMatch?.mode}
        onBack={() => setViewOverride('board')}
        onContinue={() => {
          setSpinRevealComplete(false);
          setViewOverride('question');
        }}
        onSpin={chooseSubject}
        revealComplete={spinRevealComplete}
        selectedSubjectId={selectedSubjectId}
        spinning={spinning}
        subjects={currentMatch?.subjects || snapshot.subjects}
      />
    );
  } else if (screen === 'question') {
    content = (
      <TriviaQuestion
        disabled={Boolean(currentMatch?.you?.answered)}
        error={error}
        key={question?.id}
        onBack={() => {
          stopTriviaQuestionEntrance();
          stopTriviaPodiumSound();
          setMatchId('');
          setViewOverride('home');
          refresh({ id: '' });
        }}
        onSelectAnswer={(answerId) => setAnswerChoice({ questionId: question?.id, answerId })}
        onSubmitAnswer={submitAnswer}
        onTimeUp={() => submitAnswer('TIMEOUT')}
        question={question}
        selectedAnswerId={selectedAnswerId}
        submitting={loading}
      />
    );
  } else if (screen === 'result') {
    const result = currentMatch?.result || snapshot.result;
    content = (
      <TriviaResult
        onContinue={() => {
          const advanced = Number(result?.stationsAdvanced || 0) > 0;
          const from = Math.max(0, Number(result?.positionBefore ?? ((currentMatch?.you?.station || 1) - 1)));
          const to = Math.max(from, Number(result?.positionAfter ?? (currentMatch?.you?.station || from)));
          if (advanced) {
            setBoardAdvance({
              from,
              to,
              next: result?.matchEnded || currentMatch?.phase === 'completed' ? 'summary' : 'wheel',
            });
            setViewOverride('board');
            return;
          }
          if (result?.matchEnded || currentMatch?.phase === 'completed') {
            setViewOverride('summary');
            return;
          }
          if (result?.keepsTurn) {
            setSelectedSubjectId('');
            setSpinRevealComplete(false);
            setViewOverride('wheel');
            return;
          }
          setViewOverride('board');
        }}
        result={result}
        waiting={false}
      />
    );
  } else if (screen === 'summary') {
    const summary = currentMatch?.summary || snapshot.summary;
    content = (
      <TriviaMatchSummary
        onBackHome={() => {
          stopTriviaQuestionEntrance();
          stopTriviaPodiumSound();
          setMatchId('');
          setViewOverride('home');
          refresh({ id: '' });
        }}
        onRematch={() => createMatch(summary?.mode || currentMatch?.mode || 'global', {
          rematchOf: currentMatchId,
          rouletteCategories: (currentMatch?.subjects || []).map((subject) => subject.id || subject.name).filter(Boolean),
        })}
        summary={summary}
      />
    );
  } else {
    content = (
      <TriviaHome
        activeMatches={snapshot.activeMatches}
        invitedMatches={snapshot.invitedMatches}
        loading={loading}
        onAcceptInvite={(id) => respondToInvite(id, true)}
        onDeclineInvite={(id) => respondToInvite(id, false)}
        ageRange={snapshot.profile?.ageBandConfirmed ? (snapshot.profile?.ageRange || ageRange) : ''}
        onChangeAgeRange={() => openAgeEditor('home')}
        onOpenMatch={openMatch}
        onSelectMode={createMatch}
        playerName={playerName || snapshot.profile?.name}
      />
    );
  }

  return (
    <div className="trivia-app">
      {loading && screen === 'home' ? <div className="trivia-loading" aria-label="Cargando Trivia" /> : null}
      {content}
      {error && !['onboarding', 'lobby', 'question'].includes(screen) ? (
        <p className="trivia-alert trivia-alert--error" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
