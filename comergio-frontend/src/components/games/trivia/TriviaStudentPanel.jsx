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
import { playTriviaHomeTheme, preloadTriviaAudio, stopAllTriviaAudio, stopTriviaHomeTheme, stopTriviaPodiumSound, stopTriviaQuestionEntrance, unlockTriviaAudio } from './triviaHomeAudio';
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
  const questionId = match?.question?.id;
  if (!questionId || !match?.turnToken) {
    return false;
  }
  if (match.phase !== 'question' && match.phase !== 'await_answer') {
    return false;
  }
  if (match.lastResult && String(match.lastResult.questionId) === String(questionId)) {
    return false;
  }
  return true;
}

function sameMatchId(left, right) {
  return Boolean(left && right && String(left.rawId || left.id) === String(right.rawId || right.id));
}

function preferFresherMatch(existing, incoming) {
  if (!incoming) {
    return incoming;
  }
  if (!existing || !sameMatchId(existing, incoming)) {
    return incoming;
  }
  const existingVersion = Number(existing.version);
  const incomingVersion = Number(incoming.version);
  if (Number.isFinite(existingVersion) && Number.isFinite(incomingVersion) && incomingVersion < existingVersion) {
    return existing;
  }
  return incoming;
}

function isRetryableAnswerError(error) {
  const message = errorMessage(error);
  return error?.response?.status === 409 && (
    /pregunta pendiente/i.test(message)
    || /turno cambió/i.test(message)
    || /ya fue procesada/i.test(message)
  );
}

function resultFromMatch(match, question) {
  const last = match?.lastResult;
  if (!last) {
    return null;
  }
  if (question?.id && String(last.questionId) !== String(question.id)) {
    return null;
  }
  return {
    correct: Boolean(last.correct),
    correctAnswer: last.answerKey,
    correctAnswerText: last.answerKey,
    streak: Number(last.streak || 0),
    streakNeeded: Number(match.advanceStreakNeeded || 3),
    stationsAdvanced: Math.max(0, Number(last.positionAfter || 0) - Number(last.positionBefore || 0)),
    keepsTurn: Boolean(match.isYourTurn && !match.question),
    matchEnded: match.phase === 'completed',
    positionBefore: last.positionBefore,
    positionAfter: last.positionAfter,
  };
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
  const requestSeq = useRef(0);
  const matchRef = useRef(null);
  const submitLockRef = useRef(false);

  const applyResponse = useCallback((response, { replaceMatch = false } = {}) => {
    const next = unwrap(response);
    setSnapshot((current) => {
      const incoming = next.currentMatch || next.match;
      const existing = current.currentMatch || current.match;
      const preserved = replaceMatch ? incoming : preferFresherMatch(existing, incoming);
      return {
        ...current,
        ...next,
        ...(Object.prototype.hasOwnProperty.call(next, 'currentMatch') || Object.prototype.hasOwnProperty.call(next, 'match') || preserved
          ? { currentMatch: preserved, match: preserved }
          : {}),
      };
    });
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
    const seq = ++requestSeq.current;
    const versionAtStart = Number(matchRef.current?.version);
    if (!quiet) {
      setLoading(true);
    }
    try {
      const response = await client.getStudentTriviaState(id ? { matchId: id } : {});
      if (seq !== requestSeq.current) {
        return;
      }
      const payload = unwrap(response);
      const incoming = payload.currentMatch || payload.match;
      const localVersion = Number(matchRef.current?.version);
      if (
        incoming
        && matchRef.current
        && sameMatchId(matchRef.current, incoming)
        && Number.isFinite(localVersion)
        && Number.isFinite(Number(incoming.version))
        && Number(incoming.version) < Math.max(localVersion, Number.isFinite(versionAtStart) ? versionAtStart : localVersion)
      ) {
        return;
      }
      applyResponse(response);
      setError('');
    } catch (requestError) {
      if (seq !== requestSeq.current) {
        return;
      }
      if (!quiet) {
        setError(errorMessage(requestError));
      }
    } finally {
      if (!quiet && seq === requestSeq.current) {
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

  useEffect(() => {
    unlockTriviaAudio();
    preloadTriviaAudio();
    return () => {
      stopAllTriviaAudio();
    };
  }, []);

  const currentMatch = snapshot.currentMatch
    || snapshot.match
    || (snapshot.activeMatches || []).find((match) => match.id === matchId)
    || null;
  const currentMatchId = currentMatch?.id || matchId;
  const screen = resolveScreen(snapshot, currentMatch, viewOverride);
  const shouldPoll = autoLoad && !spinning && (
    screen === 'home'
    || (
      currentMatchId
      && currentMatch?.rawId !== 'new'
      && !['onboarding', 'summary', 'result'].includes(screen)
    )
  );

  useEffect(() => {
    matchRef.current = currentMatch;
  }, [currentMatch]);

  useEffect(() => {
    const questionId = currentMatch?.question?.id || snapshot.question?.id;
    if (!questionId) {
      return;
    }
    setAnswerChoice((current) => (
      current.questionId && current.questionId !== questionId
        ? { questionId: '', answerId: '' }
        : current
    ));
  }, [currentMatch?.question?.id, snapshot.question?.id]);

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
    const seq = ++requestSeq.current;
    setLoading(true);
    setError('');
    try {
      const response = await request();
      if (seq !== requestSeq.current) {
        return unwrap(response);
      }
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
    setError('');
    setAnswerChoice({ questionId: '', answerId: '' });
    setSelectedSubjectId('');
    setSpinning(false);
    setSpinRevealComplete(false);
    setBoardAdvance(null);
    setMatchId(id);
    setViewOverride('');
    setLoading(true);
    try {
      const response = await client.getStudentTriviaState({ matchId: id });
      applyResponse(response, { replaceMatch: true });
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
    requestSeq.current += 1;
    setError('');
    setAnswerChoice({ questionId: '', answerId: '' });
    setViewOverride('wheel');
    setSelectedSubjectId('');
    setSpinRevealComplete(false);
    setSpinning(true);
    if (alreadySpun(currentMatch)) {
      await playWheelReveal(currentMatch);
      return;
    }
    setLoading(true);
    const seq = ++requestSeq.current;
    try {
      const response = await client.chooseTriviaSubject(currentMatchId, {
        match: currentMatch,
        turnToken: currentMatch.turnToken,
        version: currentMatch.version,
      });
      const next = unwrap(response);
      if (seq === requestSeq.current) {
        applyResponse(response);
      }
      await playWheelReveal(next.currentMatch || next.match || currentMatch);
    } catch (requestError) {
      if (isSpinAlreadyDone(requestError)) {
        try {
          const refreshed = unwrap(await client.getStudentTriviaState({ matchId: currentMatchId }));
          applyResponse(refreshed, { replaceMatch: true });
          const nextMatch = refreshed.currentMatch || refreshed.match;
          if (alreadySpun(nextMatch)) {
            await playWheelReveal(nextMatch);
            return;
          }
          setSpinning(false);
          setSpinRevealComplete(false);
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
    if (submitLockRef.current) {
      return;
    }
    submitLockRef.current = true;
    setError('');
    setLoading(true);
    const payload = {
      questionId: question?.id,
      answerId,
      match: currentMatch,
      question,
    };
    try {
      let response;
      try {
        response = await client.submitTriviaAnswer(currentMatchId, payload);
      } catch (firstError) {
        if (!isRetryableAnswerError(firstError)) {
          throw firstError;
        }
        const refreshed = unwrap(await client.getStudentTriviaState({ matchId: currentMatchId }));
        applyResponse(refreshed);
        const freshMatch = refreshed.currentMatch || refreshed.match;
        const recovered = resultFromMatch(freshMatch, question);
        if (recovered) {
          setSnapshot((current) => ({ ...current, result: recovered }));
          setViewOverride('result');
          return;
        }
        if (freshMatch?.question && (freshMatch.phase === 'question' || freshMatch.isYourTurn)) {
          response = await client.submitTriviaAnswer(currentMatchId, {
            ...payload,
            match: freshMatch,
          });
        } else {
          setViewOverride(freshMatch?.isYourTurn ? 'wheel' : 'board');
          return;
        }
      }
      applyResponse(response);
      setViewOverride('result');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      submitLockRef.current = false;
      setLoading(false);
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
          setAnswerChoice({ questionId: '', answerId: '' });
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
          requestSeq.current += 1;
          setError('');
          setAnswerChoice({ questionId: '', answerId: '' });
          setSpinRevealComplete(false);
          if (
            !currentMatch?.question
            || (currentMatch.lastResult && String(currentMatch.lastResult.questionId) === String(currentMatch.question.id))
          ) {
            setViewOverride('wheel');
            return;
          }
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
            setAnswerChoice({ questionId: '', answerId: '' });
            setSelectedSubjectId('');
            setSpinRevealComplete(false);
            setError('');
            setViewOverride('wheel');
            return;
          }
          setAnswerChoice({ questionId: '', answerId: '' });
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
    <div className="trivia-app" onPointerDown={unlockTriviaAudio}>
      {loading && screen === 'home' ? <div className="trivia-loading" aria-label="Cargando Trivia" /> : null}
      {content}
      {error && !['onboarding', 'lobby', 'question'].includes(screen) ? (
        <p className="trivia-alert trivia-alert--error" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
