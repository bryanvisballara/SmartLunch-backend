import api from '../lib/api';

const GLOBAL_SUBJECTS = [
  { id: 'historia', name: 'Historia', icon: '🏛️', color: '#d89e00' },
  { id: 'ciencia', name: 'Ciencia', icon: '⚗️', color: '#168b66' },
  { id: 'cultura', name: 'Cultura', icon: '🎭', color: '#7c3db5' },
  { id: 'arte', name: 'Arte', icon: '🎨', color: '#d92c8a' },
  { id: 'deportes', name: 'Deportes', icon: '🏅', color: '#e87918' },
];

function data(response) {
  return response?.data || response || {};
}

function editorQuestion(question = {}) {
  const options = Array.isArray(question.options) ? question.options : [];
  const correctKey = question.correctAnswer || '';
  return {
    ...question,
    id: question.id || question._id,
    answers: options.map((option) => ({
      id: option.key,
      text: option.text,
      isCorrect: option.key === correctKey,
    })),
    correctAnswerIndex: Math.max(0, options.findIndex((option) => option.key === correctKey)),
    subjectId: question.subjectKey || question.subjectId || '',
    gradeId: question.gradeKey || question.gradeId || '',
    category: question.category || question.subjectLabel || question.subjectKey || '',
    ageBand: question.ageBand || question.gradeKey || '',
    status: question.status === 'active' ? 'published' : question.status === 'archived' ? 'draft' : question.status,
  };
}

function compareGradeLabels(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'es', { numeric: true, sensitivity: 'base' });
}

function uniqueTeacherGrades(assignments = []) {
  const grades = [];
  const seen = new Set();
  assignments.forEach((assignment) => {
    const gradeKey = String(assignment.gradeKey || assignment.gradeLabel || assignment.grade || assignment.studentGradeKey || '').trim();
    if (!gradeKey) {
      return;
    }
    const subjectId = String(assignment.subjectKey || assignment.subjectId || assignment.subject || '');
    const existing = grades.find((grade) => grade.id === gradeKey);
    if (existing) {
      if (subjectId && !existing.subjectIds.includes(subjectId)) {
        existing.subjectIds.push(subjectId);
      }
      return;
    }
    if (seen.has(gradeKey)) {
      return;
    }
    seen.add(gradeKey);
    grades.push({
      id: gradeKey,
      label: assignment.gradeLabel || assignment.grade || assignment.studentGradeKey || gradeKey,
      subjectId: '',
      subjectIds: subjectId ? [subjectId] : [],
    });
  });
  return grades.sort((left, right) => compareGradeLabels(left.label, right.label));
}

function questionPayload(payload = {}, extra = {}) {
  const answers = Array.isArray(payload.answers) ? payload.answers : [];
  const correctIndex = Number.isInteger(payload.correctAnswerIndex)
    ? payload.correctAnswerIndex
    : answers.findIndex((answer) => answer.isCorrect);
  return {
    prompt: payload.prompt,
    options: answers.map((answer, index) => ({
      key: String.fromCharCode(65 + index),
      text: answer.text,
    })),
    correctAnswer: String.fromCharCode(65 + Math.max(0, correctIndex)),
    difficulty: payload.difficulty || 'medium',
    explanation: payload.explanation || '',
    status: payload.status === 'published' ? 'published' : 'draft',
    ...extra,
  };
}

export const triviaTeacherApi = {
  async getTeacherTriviaOptions() {
    const response = data(await api.get('/trivia/teacher/options'));
    const assignments = Array.isArray(response.options)
      ? response.options
      : response.assignments || response.courses || [];
    const subjects = [];
    const seenSubjects = new Set();
    assignments.forEach((assignment) => {
      const subjectId = String(assignment.subjectKey || assignment.subjectId || assignment.subject || '');
      if (subjectId && !seenSubjects.has(subjectId)) {
        seenSubjects.add(subjectId);
        subjects.push({ id: subjectId, label: assignment.subjectLabel || assignment.subject || assignment.title || subjectId });
      }
    });
    const mappedAssignments = assignments.map((assignment) => ({
      courseId: String(assignment.courseId || assignment.id || assignment._id || ''),
      subjectId: String(assignment.subjectKey || assignment.subjectId || assignment.subject || ''),
      gradeKey: String(assignment.gradeKey || assignment.gradeLabel || assignment.grade || assignment.studentGradeKey || '').trim(),
      gradeLabel: assignment.gradeLabel || assignment.grade || assignment.studentGradeKey || '',
      subjectKey: assignment.subjectKey || assignment.subjectId || assignment.subject || '',
      subjectLabel: assignment.subjectLabel || assignment.subject || assignment.title || '',
      studentGradeKey: assignment.studentGradeKey || assignment.gradeKey || '',
      grade: assignment.gradeLabel || assignment.grade || '',
    }));
    return {
      subjects,
      grades: uniqueTeacherGrades(mappedAssignments),
      assignments: mappedAssignments,
    };
  },
  async listTeacherTriviaQuestions(params = {}) {
    const response = data(await api.get('/trivia/teacher/questions', {
      params: {
        gradeKey: params.gradeId || undefined,
        subjectKey: params.subjectId || undefined,
        status: params.status || undefined,
      },
    }));
    return { questions: (response.questions || []).map(editorQuestion) };
  },
  async createTeacherTriviaQuestion(payload) {
    return data(await api.post('/trivia/teacher/questions', questionPayload(payload, {
      courseId: payload.courseId || payload.gradeId,
    })));
  },
  async updateTeacherTriviaQuestion(questionId, payload) {
    return data(await api.put(`/trivia/teacher/questions/${questionId}`, questionPayload(payload, {
      courseId: payload.courseId || payload.gradeId,
    })));
  },
  async publishTeacherTriviaQuestion(questionId, question) {
    return data(await api.put(`/trivia/teacher/questions/${questionId}`, questionPayload({
      ...question,
      status: 'published',
    }, {
      courseId: question.courseId,
    })));
  },
  async deleteTeacherTriviaQuestion(questionId) {
    return data(await api.delete(`/trivia/teacher/questions/${questionId}`));
  },
};

export const triviaAdminApi = {
  async listAdminTriviaQuestions(params = {}) {
    const response = data(await api.get('/trivia/super-admin/questions', { params }));
    return { questions: (response.questions || []).map(editorQuestion) };
  },
  createAdminTriviaQuestion(payload) {
    return api.post('/trivia/super-admin/questions', questionPayload(payload, {
      category: payload.category,
      ageBand: payload.ageBand,
      subjectKey: payload.category,
      gradeKey: payload.ageBand,
    })).then(data);
  },
  updateAdminTriviaQuestion(questionId, payload) {
    return api.put(`/trivia/super-admin/questions/${questionId}`, questionPayload(payload, {
      category: payload.category,
      ageBand: payload.ageBand,
      subjectKey: payload.category,
      gradeKey: payload.ageBand,
    })).then(data);
  },
  setAdminTriviaQuestionStatus(questionId, status, question = {}) {
    return api.put(`/trivia/super-admin/questions/${questionId}`, questionPayload({
      ...question,
      status,
    }, {
      category: question.category,
      ageBand: question.ageBand,
      subjectKey: question.category,
      gradeKey: question.ageBand,
    })).then(data);
  },
  deleteAdminTriviaQuestion(questionId) {
    return api.delete(`/trivia/super-admin/questions/${questionId}`).then(data);
  },
  async listTriviaModerationReports(params = {}) {
    const [questionResponse, safetyResponse] = await Promise.all([
      api.get('/trivia/super-admin/reports', { params }).then(data),
      api.get('/trivia/super-admin/safety-reports', { params }).then(data),
    ]);
    return {
      reports: [
        ...(questionResponse.reports || []).map((report) => ({
          ...report,
          id: `question:${report.id || report._id}`,
          targetType: 'question',
          createdAt: report.createdAt || report.reportedAt,
          questionSnapshot: {
            prompt: report.prompt,
            category: report.category || report.subjectKey,
            ageBand: report.ageBand || report.gradeKey,
          },
        })),
        ...(safetyResponse.reports || []).map((report) => ({
          ...report,
          id: `safety:${report.id || report._id}`,
          createdAt: report.createdAt,
          questionSnapshot: {
            ...(report.context || {}),
            prompt: [
              report.context?.displayName || 'Perfil de estudiante',
              report.context?.schoolName,
            ].filter(Boolean).join(' · '),
          },
        })),
      ],
    };
  },
  moderateTriviaReport(reportId, { action }) {
    const parsed = splitScopedId(reportId, 'question');
    if (parsed.scope === 'safety') {
      return api.patch(`/trivia/super-admin/safety-reports/${parsed.id}`, {
        status: action === 'dismiss' ? 'dismissed' : 'resolved',
        action: action === 'remove_question' ? 'profile_disabled' : 'none',
      }).then(data);
    }
    return api.patch(`/trivia/super-admin/reports/${parsed.id}`, {
      status: action === 'dismiss' ? 'dismissed' : 'resolved',
      hideQuestion: action === 'remove_question',
    }).then(data);
  },
};

function splitScopedId(value, fallbackScope = 'institutional') {
  const normalized = String(value || '');
  const separator = normalized.indexOf(':');
  if (separator < 0) {
    return { scope: fallbackScope, id: normalized };
  }
  return {
    scope: normalized.slice(0, separator),
    id: normalized.slice(separator + 1),
  };
}

function scopedId(scope, id) {
  return `${scope}:${id}`;
}

function normalizeSubjects(match = {}) {
  const roulette = match.roulette || {};
  const incoming = match.subjects
    || match.categories
    || roulette.subjects
    || roulette.categories
    || roulette.options
    || [];
  if (incoming.length) {
    return incoming.map((subject) => ({
      id: typeof subject === 'string'
        ? subject
        : subject.id || subject.key || subject.subjectKey || subject.category,
      name: typeof subject === 'string'
        ? subject
        : subject.name || subject.label || subject.subjectLabel || subject.category,
      icon: subject.icon,
      color: subject.color,
    }));
  }
  return match.scope === 'global' ? GLOBAL_SUBJECTS : [];
}

function normalizeMatch(match = {}, scopeHint) {
  const scope = match.scope || scopeHint || 'institutional';
  const teams = new Map((match.teams || []).map((team) => [Number(team.index), team]));
  const participants = match.participants || match.players || [];
  const players = participants.map((participant, index) => {
    const teamIndex = Number(participant.teamIndex ?? index);
    const team = teams.get(teamIndex) || {};
    return {
      id: `${participant.schoolId || match.schoolId}:${participant.studentId || participant.id || index}`,
      studentId: participant.studentId || participant.id,
      schoolId: participant.schoolId || match.schoolId,
      name: participant.displayName || participant.name || 'Jugador',
      avatarUrl: participant.avatarUrl || '',
      schoolName: participant.schoolName || '',
      ageRange: participant.ageBand || '',
      isYou: Boolean(participant.isYou)
        || (match.currentViewerStudentId && participant.studentId === match.currentViewerStudentId),
      ready: true,
      station: Math.max(0, Math.min(10, Number(team.position ?? participant.station ?? 0))),
      score: Number(participant.correctAnswers || participant.score || 0),
      streak: Number(participant.correctStreak || participant.streak || 0),
      color: participant.color,
      teamId: match.mode === '2v2' ? `team-${teamIndex}` : '',
      teamName: match.mode === '2v2' ? `Equipo ${teamIndex + 1}` : '',
    };
  });
  if (!players.some((player) => player.isYou) && Number.isInteger(match.viewerIndex)) {
    players[match.viewerIndex].isYou = true;
  }
  const you = players.find((player) => player.isYou) || players.find((player) => (
    player.studentId === match.viewerStudentId
  )) || null;
  const options = match.question?.options || match.question?.answers || [];
  const phase = match.status === 'finished' || match.phase === 'finished'
    ? 'completed'
    : match.phase === 'await_answer' && match.isYourTurn && match.question
      ? 'question'
      : 'board';
  return {
    ...match,
    id: scopedId(scope, match.id || match._id),
    rawId: match.id || match._id,
    mode: scope,
    scope,
    gameMode: match.mode || match.gameMode || '1v1',
    phase,
    round: match.turnNumber || match.round || 1,
    players,
    you,
    subjects: normalizeSubjects({ ...match, scope }),
    advanceStreakNeeded: Number(match.advanceStreakNeeded || 3),
    turnExpiresAt: match.turnExpiresAt || null,
    finishReason: match.finishReason || '',
    isYourTurn: Boolean(match.isYourTurn),
    waitingForPlayers: !match.isYourTurn,
    selectedSubjectId: match.roulette?.selectedCategory
      || match.roulette?.selectedSubject
      || match.selectedSubjectKey
      || match.question?.subjectKey
      || match.question?.category
      || '',
    question: match.question ? {
      id: match.question.id || match.question.questionId,
      prompt: match.question.prompt,
      context: match.question.context || '',
      subject: {
        id: match.question.category || match.question.subjectKey || '',
        name: match.question.subjectLabel || match.question.category || match.question.subjectKey || '',
      },
      number: match.turnNumber || 1,
      total: 10,
      streak: Number(you?.streak || 0),
      streakNeeded: Number(match.advanceStreakNeeded || 3),
      answers: options.map((option) => ({ id: option.key || option.id, text: option.text })),
    } : null,
    summary: phase === 'completed' ? {
      mode: scope,
      gameMode: match.mode,
      questionCount: match.history?.length || match.turnNumber || 0,
      ranking: [...players].sort((left, right) => right.station - left.station),
      canRematch: true,
      finishReason: match.finishReason || '',
    } : null,
  };
}

function normalizeInvitation(invitation = {}, scopeHint) {
  const scope = invitation.scope || scopeHint || 'institutional';
  const invited = invitation.invited || [];
  return {
    id: scopedId(scope, invitation.id || invitation._id),
    rawId: invitation.id || invitation._id,
    mode: scope,
    gameMode: invitation.mode,
    host: {
      name: invitation.createdBy?.displayName || invitation.createdByDisplayName || 'Un compañero',
    },
    players: invited.map((player, index) => ({
      id: `${player.schoolId || ''}:${player.studentId || index}`,
      name: player.displayName || player.name,
      ready: player.status === 'accepted',
    })),
    status: invitation.status,
    isCreator: invitation.isCreator,
  };
}

function normalizeCandidate(candidate = {}) {
  const id = `${candidate.schoolId || ''}::${candidate.studentId || candidate.id || candidate._id}`;
  return {
    ...candidate,
    id,
    name: candidate.displayName || candidate.name || 'Estudiante',
    grade: candidate.gradeLabel || candidate.gradeKey || candidate.grade || '',
    ageRange: candidate.ageBand || '',
  };
}

export function createStudentTriviaApi() {
  let draft = null;
  let candidateMap = new Map();
  let lastScope = 'institutional';
  let currentProfile = null;

  async function loadHome() {
    const [profileResponse, institutionalMatches, globalMatches, institutionalInvites, globalInvites] = await Promise.all([
      api.get('/trivia/student/profile', { params: { scope: 'global' } }).then(data),
      api.get('/trivia/student/matches', { params: { scope: 'institutional' } }).then(data),
      api.get('/trivia/student/matches', { params: { scope: 'global' } }).then(data),
      api.get('/trivia/student/invitations', { params: { scope: 'institutional' } }).then(data),
      api.get('/trivia/student/invitations', { params: { scope: 'global' } }).then(data),
    ]);
    const matches = [
      ...(institutionalMatches.matches || []).map((match) => normalizeMatch(match, 'institutional')),
      ...(globalMatches.matches || []).map((match) => normalizeMatch(match, 'global')),
    ];
    const invitations = [
      ...(institutionalInvites.invitations || []).map((invite) => normalizeInvitation(invite, 'institutional')),
      ...(globalInvites.invitations || []).map((invite) => normalizeInvitation(invite, 'global')),
    ];
    currentProfile = {
      ...profileResponse.profile,
      name: profileResponse.profile?.displayName,
      ageRange: profileResponse.profile?.ageBand || profileResponse.profile?.ageRange || '',
      ageBandConfirmed: Boolean(profileResponse.profile?.ageBandConfirmed),
    };
    return {
      profile: {
        ...currentProfile,
      },
      activeMatches: matches.filter((match) => match.phase !== 'completed'),
      invitedMatches: invitations.filter((invite) => invite.status === 'pending' && !invite.isCreator),
      currentMatch: null,
    };
  }

  return {
    async getStudentTriviaState({ matchId } = {}) {
      if (!matchId) {
        return loadHome();
      }
      const parsed = splitScopedId(matchId, lastScope);
      lastScope = parsed.scope;
      const [response, profileResponse] = await Promise.all([
        api.get(`/trivia/student/matches/${parsed.id}`, {
          params: { scope: parsed.scope },
        }).then(data),
        api.get('/trivia/student/profile', {
          params: { scope: 'global' },
        }).then(data),
      ]);
      return {
        profile: {
          ...profileResponse.profile,
          name: profileResponse.profile?.displayName,
          ageRange: profileResponse.profile?.ageBand || '',
          ageBandConfirmed: Boolean(profileResponse.profile?.ageBandConfirmed),
        },
        currentMatch: normalizeMatch(response.match, parsed.scope),
      };
    },
    async saveTriviaProfile({ ageRange }) {
      const response = data(await api.patch('/trivia/student/profile', {
        scope: 'global',
        ageBand: ageRange,
      }));
      currentProfile = {
        ...response.profile,
        name: response.profile?.displayName,
        ageRange: response.profile?.ageBand || ageRange,
        ageBandConfirmed: Boolean(response.profile?.ageBandConfirmed ?? true),
      };
      return {
        profile: currentProfile,
      };
    },
    async listTriviaSubjects({ mode = 'institutional' } = {}) {
      const response = data(await api.get('/trivia/student/subjects', {
        params: { scope: mode },
      }));
      return {
        subjects: (response.subjects || []).map((subject) => ({
          key: subject.key || subject.id || subject.subjectKey,
          label: subject.label || subject.name || subject.subjectLabel || subject.key,
        })).filter((subject) => subject.key),
      };
    },
    async createTriviaMatch({ mode, gameMode = '1v1', rouletteCategories = [] } = {}) {
      lastScope = mode;
      const response = data(await api.get('/trivia/student/eligible', {
        params: { scope: mode, limit: 100 },
      }));
      const candidates = (response.candidates || response.profiles || []).map(normalizeCandidate);
      candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      draft = { scope: mode, gameMode, invitedStudentIds: [], rouletteCategories };
      return {
        candidates,
        currentMatch: {
          id: scopedId(mode, 'new'),
          rawId: 'new',
          mode,
          scope: mode,
          gameMode,
          phase: 'lobby',
          isHost: true,
          host: { name: currentProfile?.name || 'Tú', isYou: true },
          players: [{
            id: currentProfile?.studentId || 'me',
            name: currentProfile?.name || 'Tú',
            isYou: true,
            ready: true,
          }],
          invitedStudentIds: [],
          rouletteCategories,
          subjects: rouletteCategories.map((key) => ({ id: key, name: key })),
        },
      };
    },
    async updateTriviaLobby(_matchId, nextDraft) {
      draft = { ...(draft || {}), ...nextDraft };
      return {};
    },
    async startTriviaMatch() {
      if (!draft) {
        throw new Error('La invitación ya no está disponible.');
      }
      if (draft.invitationSent) {
        return draft.pendingState;
      }
      const invitees = (draft.invitedStudentIds || []).map((id) => {
        const candidate = candidateMap.get(id);
        return { schoolId: candidate?.schoolId, studentId: candidate?.studentId || String(id).split('::').at(-1) };
      });
      const response = data(await api.post('/trivia/student/invitations', {
        scope: draft.scope,
        mode: draft.gameMode === '3' ? 'ffa3' : draft.gameMode === '4' ? 'ffa4' : draft.gameMode,
        invitees,
        rouletteCategories: draft.rouletteCategories || [],
      }));
      const selectedCandidates = (draft.invitedStudentIds || [])
        .map((id) => candidateMap.get(id))
        .filter(Boolean);
      const pendingState = {
        candidates: [...candidateMap.values()],
        currentMatch: {
          id: scopedId(draft.scope, 'new'),
          rawId: 'new',
          mode: draft.scope,
          scope: draft.scope,
          gameMode: draft.gameMode,
          phase: 'lobby',
          invitationId: response.invitation?.id || '',
          invitationSent: true,
          isHost: true,
          host: { name: currentProfile?.name || 'Tú', isYou: true },
          players: [
            {
              id: currentProfile?.studentId || 'me',
              name: currentProfile?.name || 'Tú',
              isYou: true,
              ready: true,
            },
            ...selectedCandidates.map((candidate) => ({
              id: candidate.id,
              name: candidate.name,
              ready: false,
            })),
          ],
          invitedStudentIds: [...(draft.invitedStudentIds || [])],
          rouletteCategories: draft.rouletteCategories || [],
          subjects: (draft.rouletteCategories || []).map((key) => ({ id: key, name: key })),
        },
      };
      draft = { ...draft, invitationSent: true, pendingState };
      return pendingState;
    },
    async respondToTriviaInvite(invitationId, { accept }) {
      const parsed = splitScopedId(invitationId, lastScope);
      lastScope = parsed.scope;
      const response = data(await api.post(`/trivia/student/invitations/${parsed.id}/respond`, {
        scope: parsed.scope,
        accept,
      }));
      if (response.match) {
        return { currentMatch: normalizeMatch(response.match, parsed.scope) };
      }
      return loadHome();
    },
    async chooseTriviaSubject(matchId, payload = {}) {
      const parsed = splitScopedId(matchId, lastScope);
      const match = payload.match || {};
      const response = data(await api.post(`/trivia/student/matches/${parsed.id}/spin`, {
        scope: parsed.scope,
        turnToken: payload.turnToken || match.turnToken,
        version: payload.version ?? match.version,
      }));
      return { currentMatch: normalizeMatch(response.match, parsed.scope) };
    },
    async submitTriviaAnswer(matchId, payload = {}) {
      const parsed = splitScopedId(matchId, lastScope);
      const match = payload.match || {};
      const response = data(await api.post(`/trivia/student/matches/${parsed.id}/answer`, {
        scope: parsed.scope,
        turnToken: payload.turnToken || match.turnToken,
        version: payload.version ?? match.version,
        answerKey: payload.answerId,
        questionId: payload.questionId || payload.question?.id || '',
      }));
      const normalized = normalizeMatch(response.match, parsed.scope);
      const correctOption = payload.question?.answers?.find((answer) => answer.id === response.result?.correctAnswer);
      return {
        currentMatch: normalized,
        result: {
          ...response.result,
          correctAnswerText: correctOption?.text || response.result?.correctAnswer || '',
          streak: Number(response.result?.streak || 0),
          streakNeeded: Number(response.result?.streakNeeded || 3),
          stationsAdvanced: Number(response.result?.stationsAdvanced ?? Math.max(0, Number(response.result?.positionAfter || 0) - Number(response.result?.positionBefore || 0))),
          keepsTurn: Boolean(response.result?.keepsTurn),
          matchEnded: normalized.phase === 'completed',
        },
      };
    },
    async blockTriviaCandidate(candidateId) {
      const candidate = candidateMap.get(candidateId);
      if (!candidate) {
        throw new Error('El perfil ya no está disponible.');
      }
      await api.put('/trivia/student/global-profiles/block', {
        schoolId: candidate.schoolId,
        studentId: candidate.studentId,
        blocked: true,
      });
      candidateMap.delete(candidateId);
      return { candidates: [...candidateMap.values()] };
    },
    async reportTriviaCandidate(candidateId, details = '') {
      const candidate = candidateMap.get(candidateId);
      if (!candidate) {
        throw new Error('El perfil ya no está disponible.');
      }
      await api.post('/trivia/student/global-profiles/report', {
        schoolId: candidate.schoolId,
        studentId: candidate.studentId,
        reason: 'other',
        details,
      });
      return {};
    },
    async leaveTriviaMatch(matchId) {
      draft = null;
      const parsed = splitScopedId(matchId, lastScope);
      return loadHome();
    },
  };
}
