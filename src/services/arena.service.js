const crypto = require('crypto');
const mongoose = require('mongoose');

const ArenaQuiz = require('../models/arenaQuiz.model');
const ArenaSession = require('../models/arenaSession.model');
const ArenaPlayer = require('../models/arenaPlayer.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');

const JOINABLE_STATUSES = ['lobby', 'question', 'discuss', 'reveal', 'leaderboard'];
const POINT_OPTIONS = new Set([0, 1000, 2000]);
const QUESTION_TYPES = new Set(['quiz', 'true_false', 'puzzle']);

class ArenaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ArenaError';
    this.status = status;
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function createKey() {
  return crypto.randomBytes(8).toString('hex');
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function clampTimeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 20;
  }
  return Math.min(240, Math.max(5, Math.round(parsed)));
}

function normalizePoints(value) {
  const parsed = Number(value);
  return POINT_OPTIONS.has(parsed) ? parsed : 1000;
}

function isPublicMediaUrl(url) {
  const normalized = normalizeText(url);
  return /^https?:\/\//i.test(normalized) || normalized.startsWith('/assets/') || normalized.startsWith('/campus/');
}

function computeKahootPoints({ maxPoints, responseTimeMs, timerSec, correct }) {
  if (!correct || maxPoints <= 0) {
    return 0;
  }
  const timerMs = Math.max(1, Number(timerSec || 20) * 1000);
  const elapsed = Math.max(0, Number(responseTimeMs || 0));
  if (elapsed <= 500) {
    return maxPoints;
  }
  const ratio = Math.min(1, elapsed / timerMs);
  return Math.round(maxPoints * (1 - (ratio / 2)));
}

function hashSeed(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleWithSeed(items, seed) {
  const copy = [...items];
  let hash = hashSeed(seed);
  for (let index = copy.length - 1; index > 0; index -= 1) {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    const swapIndex = hash % (index + 1);
    const current = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = current;
  }
  return copy;
}

function serializeAnswer(answer = {}, { includeCorrect = false } = {}) {
  const payload = {
    key: String(answer.key || answer._id || ''),
    text: normalizeText(answer.text),
  };
  if (includeCorrect) {
    payload.correct = Boolean(answer.correct);
    payload.correctOrder = Number(answer.correctOrder || 0);
  }
  return payload;
}

function serializeQuestion(question = {}, { includeCorrect = false, shuffleSeed = '' } = {}) {
  const answers = Array.isArray(question.answers) ? question.answers : [];
  const visibleAnswers = question.type === 'puzzle' && shuffleSeed
    ? shuffleWithSeed(answers, shuffleSeed)
    : answers;

  return {
    key: String(question.key || question._id || ''),
    type: question.type || 'quiz',
    prompt: normalizeText(question.prompt),
    imageUrl: isPublicMediaUrl(question.imageUrl) ? normalizeText(question.imageUrl) : '',
    timeLimitSec: clampTimeLimit(question.timeLimitSec),
    points: normalizePoints(question.points),
    selectionMode: question.type === 'quiz' && question.selectionMode === 'multiple' ? 'multiple' : 'single',
    answers: visibleAnswers.map((answer) => serializeAnswer(answer, { includeCorrect })),
  };
}

function serializeQuiz(quiz, share = {}) {
  return {
    id: String(quiz._id),
    title: normalizeText(quiz.title),
    courseId: quiz.courseId ? String(quiz.courseId) : '',
    teacherUserId: String(quiz.teacherUserId || ''),
    questions: (quiz.questions || []).map((question) => serializeQuestion(question, { includeCorrect: true })),
    playErrors: getQuizPlayErrors(quiz),
    canPlay: getQuizPlayErrors(quiz).length === 0,
    activePin: share.pin || '',
    activeSessionId: share.sessionId ? String(share.sessionId) : '',
    activeStatus: share.status || '',
    lastResult: share.lastResult || null,
    updatedAt: quiz.updatedAt || null,
    createdAt: quiz.createdAt || null,
  };
}

function getQuestionPlayError(question, index) {
  const label = `Pregunta ${index + 1}`;
  const prompt = normalizeText(question?.prompt);
  const answers = Array.isArray(question?.answers) ? question.answers : [];
  const type = question?.type;

  if (!QUESTION_TYPES.has(type)) {
    return `${label}: tipo no válido.`;
  }
  if (!prompt) {
    return `${label}: falta el enunciado.`;
  }

  if (type === 'true_false') {
    if (answers.length !== 2) {
      return `${label}: verdadero o falso necesita dos opciones.`;
    }
    if (answers.filter((answer) => answer.correct).length !== 1) {
      return `${label}: marca una sola respuesta correcta.`;
    }
    if (answers.some((answer) => !normalizeText(answer.text))) {
      return `${label}: las opciones no pueden estar vacías.`;
    }
    return '';
  }

  if (type === 'puzzle') {
    if (answers.length < 3 || answers.length > 4) {
      return `${label}: el puzzle debe tener 3 o 4 ítems.`;
    }
    if (answers.some((answer) => !normalizeText(answer.text))) {
      return `${label}: cada ítem del puzzle necesita texto.`;
    }
    const orders = answers.map((answer) => Number(answer.correctOrder));
    const uniqueOrders = new Set(orders);
    if (uniqueOrders.size !== answers.length) {
      return `${label}: define un orden único para el puzzle.`;
    }
    return '';
  }

  if (answers.length < 2) {
    return `${label}: el quiz necesita al menos dos respuestas.`;
  }
  if (answers.some((answer) => !normalizeText(answer.text))) {
    return `${label}: hay respuestas vacías.`;
  }
  const correctCount = answers.filter((answer) => answer.correct).length;
  if (correctCount < 1) {
    return `${label}: marca al menos una respuesta correcta.`;
  }
  if (question.selectionMode !== 'multiple' && correctCount !== 1) {
    return `${label}: en modo simple marca una sola correcta.`;
  }
  return '';
}

function getQuizPlayErrors(quiz) {
  const errors = [];
  if (!normalizeText(quiz?.title)) {
    errors.push('El set necesita un título.');
  }
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  if (!questions.length) {
    errors.push('Añade al menos una pregunta.');
  }
  questions.forEach((question, index) => {
    const error = getQuestionPlayError(question, index);
    if (error) {
      errors.push(error);
    }
  });
  return errors;
}

function sanitizeAnswers(rawAnswers, type) {
  const incoming = Array.isArray(rawAnswers) ? rawAnswers : [];
  return incoming.slice(0, type === 'puzzle' ? 4 : 6).map((answer, index) => ({
    key: normalizeText(answer?.key) || createKey(),
    text: normalizeText(answer?.text).slice(0, 280),
    correct: Boolean(answer?.correct),
    correctOrder: Number.isFinite(Number(answer?.correctOrder)) ? Number(answer.correctOrder) : index,
  }));
}

function sanitizeQuestion(rawQuestion) {
  const type = QUESTION_TYPES.has(rawQuestion?.type) ? rawQuestion.type : 'quiz';
  const selectionMode = type === 'quiz' && rawQuestion?.selectionMode === 'multiple' ? 'multiple' : 'single';
  const answers = sanitizeAnswers(rawQuestion?.answers, type);
  const imageUrl = isPublicMediaUrl(rawQuestion?.imageUrl) ? normalizeText(rawQuestion.imageUrl) : '';

  if (type === 'true_false' && answers.length === 0) {
    answers.push(
      { key: createKey(), text: 'Verdadero', correct: true, correctOrder: 0 },
      { key: createKey(), text: 'Falso', correct: false, correctOrder: 1 }
    );
  }

  return {
    key: normalizeText(rawQuestion?.key) || createKey(),
    type,
    prompt: normalizeText(rawQuestion?.prompt).slice(0, 500),
    imageUrl,
    timeLimitSec: clampTimeLimit(rawQuestion?.timeLimitSec),
    points: normalizePoints(rawQuestion?.points),
    selectionMode,
    answers,
  };
}

function sanitizeQuizInput(body = {}, { teacherUserId, schoolId } = {}) {
  const courseId = isValidObjectId(body.courseId) ? body.courseId : null;
  return {
    schoolId,
    teacherUserId,
    courseId,
    title: normalizeText(body.title).slice(0, 140) || 'Set sin título',
    questions: (Array.isArray(body.questions) ? body.questions : []).slice(0, 40).map(sanitizeQuestion),
  };
}

function generatePin() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function allocatePin(schoolId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const pin = generatePin();
    const existing = await ArenaSession.exists({
      schoolId,
      pin,
      status: { $in: JOINABLE_STATUSES },
    });
    if (!existing) {
      return pin;
    }
  }
  throw new ArenaError('No se pudo generar un código Arena. Intenta de nuevo.', 500);
}

function isQuestionCorrect(question, payload = {}) {
  const answers = Array.isArray(question?.answers) ? question.answers : [];

  if (question.type === 'puzzle') {
    const expected = [...answers]
      .sort((left, right) => Number(left.correctOrder) - Number(right.correctOrder))
      .map((answer) => String(answer.key));
    const received = (Array.isArray(payload.orderedAnswerKeys) ? payload.orderedAnswerKeys : []).map(String);
    return expected.length === received.length && expected.every((key, index) => key === received[index]);
  }

  const correctKeys = answers.filter((answer) => answer.correct).map((answer) => String(answer.key));
  const selected = [...new Set((Array.isArray(payload.selectedAnswerKeys) ? payload.selectedAnswerKeys : []).map(String))];
  if (question.selectionMode === 'multiple' || question.type === 'true_false') {
    if (selected.length !== correctKeys.length) {
      return false;
    }
    return correctKeys.every((key) => selected.includes(key));
  }
  return selected.length === 1 && correctKeys.includes(selected[0]);
}

function remainingMsForQuestion(session, question) {
  if (session.status !== 'question' || !session.questionStartedAt || !question) {
    return 0;
  }
  const startedAt = new Date(session.questionStartedAt).getTime();
  const limitMs = clampTimeLimit(question.timeLimitSec) * 1000;
  return Math.max(0, startedAt + limitMs - Date.now());
}

function allPlayersAnsweredQuestion(players, questionKey) {
  if (!questionKey || !Array.isArray(players) || players.length < 1) {
    return false;
  }
  return players.every((player) => (
    (player.answers || []).some((item) => item.questionKey === questionKey)
  ));
}

async function expireQuestionIfNeeded(session, quiz, players = []) {
  if (!session || session.status !== 'question') {
    return session;
  }
  const question = quiz?.questions?.[session.currentIndex];
  if (!question) {
    return session;
  }
  const timeUp = remainingMsForQuestion(session, question) <= 0;
  const everyoneAnswered = allPlayersAnsweredQuestion(players, question.key);
  if (!timeUp && !everyoneAnswered) {
    return session;
  }
  session.status = 'discuss';
  session.questionEndedAt = new Date();
  await session.save();
  return session;
}

function serializeLeaderboard(players = [], { includeDetail = false } = {}) {
  return [...players]
    .sort((left, right) => {
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }
      return String(left.displayName || '').localeCompare(String(right.displayName || ''), 'es');
    })
    .map((player, index) => {
      const answers = Array.isArray(player.answers) ? player.answers : [];
      const row = {
        rank: index + 1,
        playerId: String(player._id),
        studentId: String(player.studentId),
        displayName: player.displayName,
        totalScore: Number(player.totalScore || 0),
      };
      if (includeDetail) {
        row.correctCount = answers.filter((answer) => answer.correct).length;
        row.answeredCount = answers.length;
      }
      return row;
    });
}

function serializeHostResults(quiz, players = []) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  return {
    questionCount: questions.length,
    playerCount: players.length,
    questions: questions.map((question, index) => {
      const { answered } = countAnswersForQuestion(players, question.key);
      const correctCount = players.filter((player) => (
        (player.answers || []).some((answer) => answer.questionKey === question.key && answer.correct)
      )).length;
      return {
        index,
        key: String(question.key || ''),
        prompt: normalizeText(question.prompt),
        type: question.type || 'quiz',
        answeredCount: answered,
        correctCount,
      };
    }),
    leaderboard: serializeLeaderboard(players, { includeDetail: true }),
  };
}

function countAnswersForQuestion(players, questionKey) {
  const counts = {};
  let answered = 0;
  players.forEach((player) => {
    const answer = (player.answers || []).find((item) => item.questionKey === questionKey);
    if (!answer) {
      return;
    }
    answered += 1;
    const keys = questionKey && Array.isArray(answer.orderedAnswerKeys) && answer.orderedAnswerKeys.length
      ? answer.orderedAnswerKeys
      : (answer.selectedAnswerKeys || []);
    keys.forEach((key) => {
      counts[key] = (counts[key] || 0) + 1;
    });
  });
  return { answered, counts };
}

function serializeSession({ session, quiz, players, viewer, studentId }) {
  const questions = quiz?.questions || [];
  const question = questions[session.currentIndex] || null;
  const includeCorrect = session.status === 'reveal' || session.status === 'leaderboard' || session.status === 'ended';
  const shuffleSeed = studentId && question?.type === 'puzzle'
    ? `${studentId}:${question.key}`
    : '';
  const { answered, counts } = question
    ? countAnswersForQuestion(players, question.key)
    : { answered: 0, counts: {} };
  const you = studentId
    ? players.find((player) => String(player.studentId) === String(studentId))
    : null;
  const yourAnswer = you && question
    ? (you.answers || []).find((item) => item.questionKey === question.key) || null
    : null;

  return {
    sessionId: String(session._id),
    quizId: String(session.quizId),
    quizTitle: normalizeText(quiz?.title),
    pin: viewer === 'host' || session.status === 'lobby' ? session.pin : '',
    status: session.status,
    currentIndex: session.currentIndex,
    totalQuestions: questions.length,
    remainingMs: remainingMsForQuestion(session, question),
    questionStartedAt: session.questionStartedAt,
    endedAt: session.endedAt,
    players: players.map((player) => ({
      playerId: String(player._id),
      displayName: player.displayName,
      totalScore: viewer === 'host' || includeCorrect ? Number(player.totalScore || 0) : 0,
    })),
    playerCount: players.length,
    answerCount: answered,
    answerCounts: includeCorrect || viewer === 'host' ? counts : {},
    question: question
      ? {
          ...serializeQuestion(question, { includeCorrect, shuffleSeed }),
          correctAnswerKeys: includeCorrect
            ? (question.type === 'puzzle'
              ? [...question.answers]
                  .sort((left, right) => Number(left.correctOrder) - Number(right.correctOrder))
                  .map((answer) => String(answer.key))
              : question.answers.filter((answer) => answer.correct).map((answer) => String(answer.key)))
            : [],
        }
      : null,
    leaderboard: includeCorrect || session.status === 'lobby' || viewer === 'host'
      ? serializeLeaderboard(players, { includeDetail: viewer === 'host' })
      : [],
    results: viewer === 'host' ? serializeHostResults(quiz, players) : null,
    you: you
      ? {
          playerId: String(you._id),
          displayName: you.displayName,
          totalScore: Number(you.totalScore || 0),
          answered: Boolean(yourAnswer),
          lastAnswer: yourAnswer
            ? {
                correct: includeCorrect ? Boolean(yourAnswer.correct) : null,
                pointsEarned: includeCorrect ? Number(yourAnswer.pointsEarned || 0) : 0,
                selectedAnswerKeys: yourAnswer.selectedAnswerKeys || [],
                orderedAnswerKeys: yourAnswer.orderedAnswerKeys || [],
              }
            : null,
        }
      : null,
  };
}

async function loadSessionBundle(sessionId, schoolId) {
  const session = await ArenaSession.findOne({ _id: sessionId, schoolId });
  if (!session) {
    throw new ArenaError('No encontramos esta partida de Arena.', 404);
  }
  const quiz = await ArenaQuiz.findOne({ _id: session.quizId, schoolId }).lean();
  if (!quiz) {
    throw new ArenaError('El set de Arena ya no existe.', 404);
  }
  const players = await ArenaPlayer.find({ schoolId, sessionId: session._id }).lean();
  await expireQuestionIfNeeded(session, quiz, players);
  return { session, quiz, players };
}

async function listQuizzes({ schoolId, teacherUserId }) {
  const [quizzes, sessions, endedSessions] = await Promise.all([
    ArenaQuiz.find({ schoolId, teacherUserId }).sort({ updatedAt: -1 }).lean(),
    ArenaSession.find({
      schoolId,
      createdByUserId: teacherUserId,
      status: { $in: JOINABLE_STATUSES },
    })
      .select('quizId pin status')
      .lean(),
    ArenaSession.find({
      schoolId,
      createdByUserId: teacherUserId,
      status: 'ended',
    })
      .select('quizId endedAt')
      .sort({ endedAt: -1, updatedAt: -1 })
      .lean(),
  ]);

  const latestEndedByQuiz = new Map();
  endedSessions.forEach((session) => {
    const quizId = String(session.quizId);
    if (!latestEndedByQuiz.has(quizId)) {
      latestEndedByQuiz.set(quizId, session);
    }
  });
  const endedIds = [...latestEndedByQuiz.values()].map((session) => session._id);
  const endedPlayers = endedIds.length
    ? await ArenaPlayer.find({ schoolId, sessionId: { $in: endedIds } }).select('sessionId displayName totalScore').lean()
    : [];
  const playersBySession = new Map();
  endedPlayers.forEach((player) => {
    const key = String(player.sessionId);
    const list = playersBySession.get(key) || [];
    list.push(player);
    playersBySession.set(key, list);
  });

  const shareByQuizId = new Map();
  sessions.forEach((session) => {
    shareByQuizId.set(String(session.quizId), {
      pin: session.pin,
      sessionId: session._id,
      status: session.status,
    });
  });
  latestEndedByQuiz.forEach((session, quizId) => {
    const current = shareByQuizId.get(quizId) || {};
    const ranking = serializeLeaderboard(playersBySession.get(String(session._id)) || []);
    current.lastResult = {
      sessionId: String(session._id),
      endedAt: session.endedAt || null,
      playerCount: ranking.length,
      winnerName: ranking[0]?.displayName || '',
      winnerScore: Number(ranking[0]?.totalScore || 0),
    };
    shareByQuizId.set(quizId, current);
  });

  return quizzes.map((quiz) => serializeQuiz(quiz, shareByQuizId.get(String(quiz._id)) || {}));
}

async function findShareForQuiz({ schoolId, teacherUserId, quizId }) {
  const session = await ArenaSession.findOne({
    schoolId,
    quizId,
    createdByUserId: teacherUserId,
    status: { $in: JOINABLE_STATUSES },
  }).select('pin status _id').lean();
  if (!session) {
    return {};
  }
  return { pin: session.pin, sessionId: session._id, status: session.status };
}

async function getQuiz({ schoolId, teacherUserId, quizId }) {
  if (!isValidObjectId(quizId)) {
    throw new ArenaError('Set de Arena no válido.', 400);
  }
  const quiz = await ArenaQuiz.findOne({ _id: quizId, schoolId, teacherUserId });
  if (!quiz) {
    throw new ArenaError('No encontramos este set de Arena.', 404);
  }
  const share = await findShareForQuiz({ schoolId, teacherUserId, quizId: quiz._id });
  return serializeQuiz(quiz, share);
}

async function ensureLobbyForQuiz({ schoolId, teacherUserId, quiz }) {
  const playErrors = getQuizPlayErrors(quiz);
  if (playErrors.length) {
    return { session: null, playErrors, blockedByLiveGame: false };
  }

  const existingForQuiz = await ArenaSession.findOne({
    schoolId,
    quizId: quiz._id,
    createdByUserId: teacherUserId,
    status: { $in: JOINABLE_STATUSES },
  });
  if (existingForQuiz) {
    return { session: existingForQuiz, playErrors: [], blockedByLiveGame: false };
  }

  const liveGame = await ArenaSession.findOne({
    schoolId,
    createdByUserId: teacherUserId,
    status: { $in: ['question', 'discuss', 'reveal', 'leaderboard'] },
  });
  if (liveGame) {
    return { session: null, playErrors: [], blockedByLiveGame: true };
  }

  await ArenaSession.updateMany(
    {
      schoolId,
      createdByUserId: teacherUserId,
      status: 'lobby',
    },
    { $set: { status: 'ended', endedAt: new Date() } }
  );

  const pin = await allocatePin(schoolId);
  const session = await ArenaSession.create({
    schoolId,
    quizId: quiz._id,
    createdByUserId: teacherUserId,
    pin,
    status: 'lobby',
    currentIndex: 0,
    questionStartedAt: null,
    questionEndedAt: null,
    endedAt: null,
  });
  return { session, playErrors: [], blockedByLiveGame: false };
}

async function serializeSavedQuiz({ schoolId, teacherUserId, quiz, shareCode = true }) {
  let session = null;
  let shareBlocked = '';
  if (shareCode) {
    const ensured = await ensureLobbyForQuiz({ schoolId, teacherUserId, quiz });
    session = ensured.session;
    if (ensured.blockedByLiveGame) {
      shareBlocked = 'El set quedó guardado. Hay una partida en curso; el código se genera cuando termine.';
    }
  }
  const share = session
    ? { pin: session.pin, sessionId: session._id, status: session.status }
    : await findShareForQuiz({ schoolId, teacherUserId, quizId: quiz._id });
  return {
    quiz: serializeQuiz(quiz, share),
    session: session
      ? serializeSession({
        session,
        quiz: typeof quiz.toObject === 'function' ? quiz.toObject() : quiz,
        players: [],
        viewer: 'host',
      })
      : null,
    shareBlocked,
  };
}

async function createQuiz({ schoolId, teacherUserId, body }) {
  const payload = sanitizeQuizInput(body, { schoolId, teacherUserId });
  const quiz = await ArenaQuiz.create(payload);
  return serializeSavedQuiz({ schoolId, teacherUserId, quiz, shareCode: true });
}

async function updateQuiz({ schoolId, teacherUserId, quizId, body }) {
  if (!isValidObjectId(quizId)) {
    throw new ArenaError('Set de Arena no válido.', 400);
  }
  const quiz = await ArenaQuiz.findOne({ _id: quizId, schoolId, teacherUserId });
  if (!quiz) {
    throw new ArenaError('No encontramos este set de Arena.', 404);
  }
  const payload = sanitizeQuizInput(body, { schoolId, teacherUserId });
  quiz.title = payload.title;
  quiz.courseId = payload.courseId;
  quiz.questions = payload.questions;
  await quiz.save();
  return serializeSavedQuiz({ schoolId, teacherUserId, quiz, shareCode: true });
}

async function deleteQuiz({ schoolId, teacherUserId, quizId }) {
  if (!isValidObjectId(quizId)) {
    throw new ArenaError('Set de Arena no válido.', 400);
  }
  const quiz = await ArenaQuiz.findOneAndDelete({ _id: quizId, schoolId, teacherUserId });
  if (!quiz) {
    throw new ArenaError('No encontramos este set de Arena.', 404);
  }
  const sessions = await ArenaSession.find({ schoolId, quizId: quiz._id, status: { $in: JOINABLE_STATUSES } });
  await Promise.all(sessions.map(async (session) => {
    session.status = 'ended';
    session.endedAt = new Date();
    await session.save();
  }));
  return { ok: true };
}

async function playQuiz({ schoolId, teacherUserId, quizId }) {
  if (!isValidObjectId(quizId)) {
    throw new ArenaError('Set de Arena no válido.', 400);
  }
  const quiz = await ArenaQuiz.findOne({ _id: quizId, schoolId, teacherUserId });
  if (!quiz) {
    throw new ArenaError('No encontramos este set de Arena.', 404);
  }

  const { session, playErrors, blockedByLiveGame } = await ensureLobbyForQuiz({
    schoolId,
    teacherUserId,
    quiz,
  });
  if (playErrors.length) {
    throw new ArenaError(playErrors[0], 400);
  }
  if (blockedByLiveGame) {
    const liveSameQuiz = await ArenaSession.findOne({
      schoolId,
      quizId: quiz._id,
      createdByUserId: teacherUserId,
      status: { $in: JOINABLE_STATUSES },
    });
    if (!liveSameQuiz) {
      throw new ArenaError('Ya hay otra partida en curso. Ciérrala para generar un código nuevo.', 409);
    }
    const players = await ArenaPlayer.find({ schoolId, sessionId: liveSameQuiz._id }).lean();
    await expireQuestionIfNeeded(liveSameQuiz, quiz, players);
    return serializeSession({ session: liveSameQuiz, quiz: quiz.toObject(), players, viewer: 'host' });
  }
  if (!session) {
    throw new ArenaError('No se pudo abrir el lobby de Arena.', 500);
  }

  const players = await ArenaPlayer.find({ schoolId, sessionId: session._id }).lean();
  await expireQuestionIfNeeded(session, quiz, players);
  return serializeSession({
    session,
    quiz: typeof quiz.toObject === 'function' ? quiz.toObject() : quiz,
    players,
    viewer: 'host',
  });
}

async function getHostSession({ schoolId, teacherUserId, sessionId }) {
  const { session, quiz, players } = await loadSessionBundle(sessionId, schoolId);
  if (String(session.createdByUserId) !== String(teacherUserId)) {
    throw new ArenaError('Esta partida pertenece a otro docente.', 403);
  }
  return serializeSession({ session, quiz, players, viewer: 'host' });
}

async function getActiveHostSession({ schoolId, teacherUserId }) {
  const session = await ArenaSession.findOne({
    schoolId,
    createdByUserId: teacherUserId,
    status: { $in: JOINABLE_STATUSES },
  }).sort({ updatedAt: -1 });
  if (!session) {
    return null;
  }
  return getHostSession({ schoolId, teacherUserId, sessionId: session._id });
}

async function advanceSession({ schoolId, teacherUserId, sessionId, action = '' }) {
  const { session, quiz, players } = await loadSessionBundle(sessionId, schoolId);
  if (String(session.createdByUserId) !== String(teacherUserId)) {
    throw new ArenaError('Esta partida pertenece a otro docente.', 403);
  }
  if (session.status === 'ended') {
    throw new ArenaError('Esta partida ya terminó.', 409);
  }

  const step = String(action || '').trim();
  const goToNextQuestion = () => {
    const nextIndex = session.currentIndex + 1;
    if (nextIndex >= (quiz.questions || []).length) {
      session.status = 'ended';
      session.endedAt = new Date();
      return;
    }
    session.status = 'question';
    session.currentIndex = nextIndex;
    session.questionStartedAt = new Date();
    session.questionEndedAt = null;
  };
  const openDiscuss = () => {
    session.status = 'discuss';
    session.questionEndedAt = new Date();
  };

  if (step === 'discuss') {
    if (session.status === 'question') {
      openDiscuss();
      await session.save();
    }
    const freshPlayers = await ArenaPlayer.find({ schoolId, sessionId: session._id }).lean();
    return serializeSession({ session, quiz, players: freshPlayers, viewer: 'host' });
  }

  if (step === 'reveal') {
    if (session.status === 'question') {
      openDiscuss();
    } else if (session.status === 'discuss') {
      session.status = 'reveal';
    }
    await session.save();
    const freshPlayers = await ArenaPlayer.find({ schoolId, sessionId: session._id }).lean();
    return serializeSession({ session, quiz, players: freshPlayers, viewer: 'host' });
  }

  if (step === 'next') {
    if (session.status === 'question') {
      openDiscuss();
    } else if (session.status === 'discuss') {
      session.status = 'reveal';
    } else if (session.status === 'reveal' || session.status === 'leaderboard') {
      goToNextQuestion();
    } else if (session.status === 'lobby') {
      session.status = 'question';
      session.currentIndex = 0;
      session.questionStartedAt = new Date();
      session.questionEndedAt = null;
    }
  } else if (session.status === 'lobby') {
    session.status = 'question';
    session.currentIndex = 0;
    session.questionStartedAt = new Date();
    session.questionEndedAt = null;
  } else if (session.status === 'question') {
    openDiscuss();
  } else if (session.status === 'discuss') {
    session.status = 'reveal';
  } else if (session.status === 'reveal' || session.status === 'leaderboard') {
    goToNextQuestion();
  }

  await session.save();
  const freshPlayers = await ArenaPlayer.find({ schoolId, sessionId: session._id }).lean();
  return serializeSession({ session, quiz, players: freshPlayers, viewer: 'host' });
}

async function endSession({ schoolId, teacherUserId, sessionId }) {
  const { session, quiz, players } = await loadSessionBundle(sessionId, schoolId);
  if (String(session.createdByUserId) !== String(teacherUserId)) {
    throw new ArenaError('Esta partida pertenece a otro docente.', 403);
  }
  session.status = 'ended';
  session.endedAt = new Date();
  await session.save();
  return serializeSession({ session, quiz, players, viewer: 'host' });
}

async function resolveStudentRecord({ schoolId, userId, linkedStudentId, requestedStudentId }) {
  const studentSelect = 'name schoolCode grade course';
  let studentId = linkedStudentId || requestedStudentId;
  if (!studentId && userId && isValidObjectId(userId)) {
    const user = await User.findOne({ _id: userId, schoolId, deletedAt: null })
      .select('linkedStudentId')
      .lean();
    studentId = user?.linkedStudentId ? String(user.linkedStudentId) : '';
  }
  if (studentId && isValidObjectId(studentId)) {
    const byLink = await Student.findOne({
      _id: studentId,
      schoolId,
      deletedAt: null,
      status: 'active',
    })
      .select(studentSelect)
      .lean();
    if (byLink) {
      return byLink;
    }
  }
  if (userId && isValidObjectId(userId)) {
    return Student.findOne({
      userId,
      schoolId,
      deletedAt: null,
      status: 'active',
    })
      .select(studentSelect)
      .lean();
  }
  return null;
}

async function joinSession({ schoolId, userId, linkedStudentId, pin, requestedStudentId }) {
  const normalizedPin = String(pin || '').replace(/\D/g, '').slice(0, 6);
  if (normalizedPin.length !== 6) {
    throw new ArenaError('Ingresa el código de 6 dígitos.', 400);
  }
  const student = await resolveStudentRecord({ schoolId, userId, linkedStudentId, requestedStudentId });
  if (!student) {
    throw new ArenaError('No encontramos tu perfil de alumno.', 404);
  }

  const session = await ArenaSession.findOne({
    schoolId,
    pin: normalizedPin,
    status: { $in: JOINABLE_STATUSES },
  });
  if (!session) {
    const endedSession = await ArenaSession.findOne({
      schoolId,
      pin: normalizedPin,
      status: 'ended',
    }).sort({ endedAt: -1, updatedAt: -1 });
    throw new ArenaError(
      endedSession
        ? 'Ese código ya se cerró. Pídele el código nuevo a tu docente.'
        : 'Ese código no está activo. Pídele uno nuevo a tu docente.',
      404
    );
  }

  const quiz = await ArenaQuiz.findOne({ _id: session.quizId, schoolId }).lean();
  if (!quiz) {
    throw new ArenaError('El set de Arena ya no existe.', 404);
  }

  const displayName = normalizeText(student.name) || 'Alumno';
  let player;
  try {
    player = await ArenaPlayer.findOneAndUpdate(
      { schoolId, sessionId: session._id, studentId: student._id },
      {
        $setOnInsert: {
          schoolId,
          sessionId: session._id,
          studentId: student._id,
          totalScore: 0,
          answers: [],
        },
        $set: { displayName },
      },
      { new: true, upsert: true }
    );
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
    player = await ArenaPlayer.findOne({ schoolId, sessionId: session._id, studentId: student._id });
    if (player && player.displayName !== displayName) {
      player.displayName = displayName;
      await player.save();
    }
  }
  if (!player) {
    throw new ArenaError('No se pudo unir a la partida.', 500);
  }

  const players = await ArenaPlayer.find({ schoolId, sessionId: session._id }).lean();
  await expireQuestionIfNeeded(session, quiz, players);
  return serializeSession({
    session,
    quiz,
    players,
    viewer: 'student',
    studentId: student._id,
  });
}

async function getStudentSession({ schoolId, userId, linkedStudentId, sessionId, requestedStudentId }) {
  const student = await resolveStudentRecord({ schoolId, userId, linkedStudentId, requestedStudentId });
  if (!student) {
    throw new ArenaError('No encontramos tu perfil de alumno.', 404);
  }
  const { session, quiz, players } = await loadSessionBundle(sessionId, schoolId);
  const you = players.find((player) => String(player.studentId) === String(student._id));
  if (!you) {
    throw new ArenaError('Aún no te uniste a esta partida.', 403);
  }
  return serializeSession({ session, quiz, players, viewer: 'student', studentId: student._id });
}

async function submitAnswer({
  schoolId,
  userId,
  linkedStudentId,
  sessionId,
  selectedAnswerKeys,
  orderedAnswerKeys,
  requestedStudentId,
}) {
  const student = await resolveStudentRecord({ schoolId, userId, linkedStudentId, requestedStudentId });
  if (!student) {
    throw new ArenaError('No encontramos tu perfil de alumno.', 404);
  }

  const { session, quiz, players } = await loadSessionBundle(sessionId, schoolId);
  const player = await ArenaPlayer.findOne({ schoolId, sessionId: session._id, studentId: student._id });
  if (!player) {
    throw new ArenaError('Aún no te uniste a esta partida.', 403);
  }
  if (session.status !== 'question') {
    throw new ArenaError('Ahora no se pueden enviar respuestas.', 409);
  }

  const question = quiz.questions[session.currentIndex];
  if (!question) {
    throw new ArenaError('No hay una pregunta activa.', 409);
  }
  const remaining = remainingMsForQuestion(session, question);
  if (remaining <= 0) {
    await expireQuestionIfNeeded(session, quiz);
    throw new ArenaError('Se acabó el tiempo de esta pregunta.', 409);
  }

  const payload = {
    selectedAnswerKeys: Array.isArray(selectedAnswerKeys) ? selectedAnswerKeys.map(String) : [],
    orderedAnswerKeys: Array.isArray(orderedAnswerKeys) ? orderedAnswerKeys.map(String) : [],
  };
  const correct = isQuestionCorrect(question, payload);
  const responseTimeMs = Math.max(0, Date.now() - new Date(session.questionStartedAt).getTime());
  const pointsEarned = computeKahootPoints({
    maxPoints: normalizePoints(question.points),
    responseTimeMs,
    timerSec: question.timeLimitSec,
    correct,
  });

  const existingIndex = (player.answers || []).findIndex((item) => item.questionKey === question.key);
  if (existingIndex >= 0) {
    const previous = player.answers[existingIndex];
    player.totalScore = Math.max(0, Number(player.totalScore || 0) - Number(previous.pointsEarned || 0) + pointsEarned);
    previous.selectedAnswerKeys = payload.selectedAnswerKeys;
    previous.orderedAnswerKeys = payload.orderedAnswerKeys;
    previous.correct = correct;
    previous.pointsEarned = pointsEarned;
    previous.responseTimeMs = responseTimeMs;
    previous.answeredAt = new Date();
    player.markModified('answers');
  } else {
    player.answers.push({
      questionKey: question.key,
      selectedAnswerKeys: payload.selectedAnswerKeys,
      orderedAnswerKeys: payload.orderedAnswerKeys,
      correct,
      pointsEarned,
      responseTimeMs,
      answeredAt: new Date(),
    });
    player.totalScore += pointsEarned;
  }
  await player.save();

  const freshPlayers = await ArenaPlayer.find({ schoolId, sessionId: session._id }).lean();
  await expireQuestionIfNeeded(session, quiz, freshPlayers);
  return serializeSession({
    session,
    quiz,
    players: freshPlayers,
    viewer: 'student',
    studentId: student._id,
  });
}

module.exports = {
  ArenaError,
  computeKahootPoints,
  listQuizzes,
  getQuiz,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  playQuiz,
  getHostSession,
  getActiveHostSession,
  advanceSession,
  endSession,
  joinSession,
  getStudentSession,
  submitAnswer,
};
