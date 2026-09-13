const crypto = require('crypto');
const mongoose = require('mongoose');

const { listTenantSchoolContexts, runInControlDb, runWithSchoolContext } = require('../config/db');
const CampusCourse = require('../models/campusCourse.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const { TriviaQuestion, GlobalTriviaQuestion } = require('../models/triviaQuestion.model');
const { TriviaProfile, GlobalTriviaProfile } = require('../models/triviaProfile.model');
const { TriviaCandidate, GlobalTriviaCandidate } = require('../models/triviaCandidate.model');
const { TriviaInvitation, GlobalTriviaInvitation } = require('../models/triviaInvitation.model');
const { TriviaMatch, GlobalTriviaMatch } = require('../models/triviaMatch.model');
const TriviaSafetyReport = require('../models/triviaSafetyReport.model');
const { queueStudentUserNotification } = require('./notification.service');
const { getSchoolDisplayName } = require('../utils/schoolDisplayName');

const MODES = Object.freeze({ '1v1': 2, ffa3: 3, ffa4: 4, '2v2': 4 });
const SCOPES = new Set(['institutional', 'global']);
const ANSWER_KEYS = ['A', 'B', 'C', 'D'];
const CANDIDATE_TTL_MS = 10 * 60 * 1000;
const INVITATION_TTL_MS = 30 * 60 * 1000;
const TURN_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const BOARD_END = 10;
const ADVANCE_STREAK = 3;
const AGE_BANDS = ['6-8', '9-11', '12-14', '15-17'];
const GLOBAL_CATEGORIES = ['Historia', 'Ciencia', 'Cultura', 'Arte', 'Deportes'];
const PUBLISHED_STATUSES = ['published', 'active'];
const SAFETY_REASONS = new Set([
  'harassment',
  'inappropriate_name',
  'inappropriate_avatar',
  'cheating',
  'unsafe_content',
  'other',
]);

class TriviaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'TriviaError';
    this.status = status;
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeScope(value) {
  const scope = normalizeText(value || 'institutional').toLowerCase();
  if (!SCOPES.has(scope)) {
    throw new TriviaError('El alcance debe ser institutional o global.', 400);
  }
  return scope;
}

function normalizeMode(value) {
  const mode = normalizeText(value).toLowerCase();
  if (!MODES[mode]) {
    throw new TriviaError('Modo de Trivia no válido.', 400);
  }
  return mode;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function createToken() {
  return crypto.randomBytes(18).toString('hex');
}

function nextTurnDeadline(from = new Date()) {
  return new Date(new Date(from).getTime() + TURN_TTL_MS);
}

function resolveTurnDeadline(match, now = new Date()) {
  if (match?.turnExpiresAt) {
    const deadline = new Date(match.turnExpiresAt);
    if (!Number.isNaN(deadline.getTime())) {
      return deadline;
    }
  }
  const base = match?.updatedAt || match?.createdAt || now;
  return nextTurnDeadline(base);
}

function winnersAfterTurnForfeit(match) {
  const current = match?.participants?.[match.currentTurnIndex];
  const lostTeam = Number(current?.teamIndex);
  const others = (match?.teams || []).filter((team) => Number(team.index) !== lostTeam);
  if (!others.length) {
    return [];
  }
  const best = Math.max(...others.map((team) => Number(team.position || 0)));
  return others
    .filter((team) => Number(team.position || 0) === best)
    .map((team) => Number(team.index));
}

function createDuelKey(firstPlayer, secondPlayer) {
  const participantKeys = [firstPlayer, secondPlayer]
    .map((player) => `${normalizeText(player?.schoolId)}:${normalizeText(player?.studentId)}`)
    .sort();
  return crypto.createHash('sha256').update(participantKeys.join('|')).digest('hex');
}

function modelsForScope(scope) {
  return scope === 'global'
    ? {
        Question: GlobalTriviaQuestion,
        Profile: GlobalTriviaProfile,
        Candidate: GlobalTriviaCandidate,
        Invitation: GlobalTriviaInvitation,
        Match: GlobalTriviaMatch,
      }
    : {
        Question: TriviaQuestion,
        Profile: TriviaProfile,
        Candidate: TriviaCandidate,
        Invitation: TriviaInvitation,
        Match: TriviaMatch,
      };
}

function inScope(scope, schoolId, callback) {
  return scope === 'global'
    ? runInControlDb(callback)
    : runWithSchoolContext(schoolId, callback);
}

function resolveAgeBand(birthDate, now = new Date()) {
  const birth = birthDate ? new Date(birthDate) : null;
  if (!birth || Number.isNaN(birth.getTime()) || birth > now) {
    return '';
  }
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return AGE_BANDS.find((band) => {
    const [min, max] = band.split('-').map(Number);
    return age >= min && age <= max;
  }) || '';
}

function studentIdentity(student, userId, schoolId, displayName = '', schoolName = '') {
  return {
    schoolId,
    schoolName,
    studentId: String(student._id),
    userId: String(userId || student.userId || ''),
    displayName: normalizeText(displayName || student.name).slice(0, 80) || 'Alumno',
    avatarUrl: normalizeText(student.thumbUrl || student.imageUrl),
    gradeKey: normalizeText(student.grade || student.course),
    ageBand: resolveAgeBand(student.birthDate),
  };
}

async function resolveStudent({ schoolId, userId, linkedStudentId, requestedStudentId = '' }) {
  return runWithSchoolContext(schoolId, async () => {
    let studentId = linkedStudentId || requestedStudentId;
    if (!studentId && isValidObjectId(userId)) {
      const user = await User.findOne({ _id: userId, schoolId, status: 'active', deletedAt: null })
        .select('linkedStudentId')
        .lean();
      studentId = user?.linkedStudentId ? String(user.linkedStudentId) : '';
    }

    if (studentId && isValidObjectId(studentId)) {
      const student = await Student.findOne({
        _id: studentId,
        schoolId,
        status: 'active',
        deletedAt: null,
      }).select('name grade course imageUrl thumbUrl userId birthDate').lean();
      if (student) {
        return student;
      }
    }

    if (isValidObjectId(userId)) {
      return Student.findOne({
        userId,
        schoolId,
        status: 'active',
        deletedAt: null,
      }).select('name grade course imageUrl thumbUrl userId birthDate').lean();
    }
    return null;
  });
}

async function resolveStudentUserId(schoolId, student) {
  if (student?.userId) {
    return String(student.userId);
  }
  return runWithSchoolContext(schoolId, async () => {
    const user = await User.findOne({
      schoolId,
      role: 'student',
      linkedStudentId: student._id,
      status: 'active',
      deletedAt: null,
    }).select('_id').lean();
    return user?._id ? String(user._id) : '';
  });
}

async function requireStudent(context) {
  const student = await resolveStudent(context);
  if (!student) {
    throw new TriviaError('No encontramos tu perfil de alumno.', 404);
  }
  const resolvedUserId = context.userId || await resolveStudentUserId(context.schoolId, student);
  const schoolName = await runWithSchoolContext(
    context.schoolId,
    () => getSchoolDisplayName(context.schoolId)
  );
  return studentIdentity(student, resolvedUserId, context.schoolId, '', schoolName);
}

function serializeProfile(profile, scope) {
  return {
    id: String(profile._id),
    scope,
    schoolId: profile.schoolId,
    studentId: profile.studentId,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl || '',
    schoolName: profile.schoolName || '',
    gradeKey: profile.gradeKey || '',
    ageBand: profile.ageBand || '',
    ageBandConfirmed: Boolean(profile.ageBandConfirmedAt),
    gamesPlayed: Number(profile.gamesPlayed || 0),
    wins: Number(profile.wins || 0),
    correctAnswers: Number(profile.correctAnswers || 0),
    answers: Number(profile.answers || 0),
  };
}

async function ensureProfile(scope, identity) {
  const { Profile } = modelsForScope(scope);
  const profile = await inScope(scope, identity.schoolId, () => Profile.findOneAndUpdate(
    { schoolId: identity.schoolId, studentId: identity.studentId },
    {
      $setOnInsert: {
        schoolId: identity.schoolId,
        studentId: identity.studentId,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        ageBand: identity.ageBand,
        status: 'active',
        gamesPlayed: 0,
        wins: 0,
        correctAnswers: 0,
        answers: 0,
      },
      $set: {
        userId: identity.userId,
        schoolName: identity.schoolName,
        gradeKey: identity.gradeKey,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ));
  if (profile.status !== 'active') {
    throw new TriviaError('Tu perfil de Trivia está desactivado.', 403);
  }
  return profile;
}

async function getProfile({ scope: rawScope, ...context }) {
  const scope = normalizeScope(rawScope);
  const identity = await requireStudent(context);
  const profile = await ensureProfile(scope, identity);
  return serializeProfile(profile, scope);
}

async function updateProfile({
  scope: rawScope,
  displayName,
  avatarUrl,
  ageBand,
  ...context
}) {
  const scope = normalizeScope(rawScope);
  const identity = await requireStudent(context);
  const profile = await ensureProfile(scope, identity);
  const name = normalizeText(displayName);
  if (name) {
    profile.displayName = name.slice(0, 80);
  }
  if (avatarUrl !== undefined) {
    profile.avatarUrl = normalizeText(avatarUrl).slice(0, 2000);
  }
  if (ageBand !== undefined) {
    const normalizedAgeBand = normalizeText(ageBand);
    if (scope !== 'global' || !AGE_BANDS.includes(normalizedAgeBand)) {
      throw new TriviaError('Rango de edad no válido.', 400);
    }
    profile.ageBand = normalizedAgeBand;
    profile.ageBandConfirmedAt = new Date();
  }
  await profile.save();
  return serializeProfile(profile, scope);
}

function sanitizeQuestionInput(body = {}) {
  const prompt = normalizeText(body.prompt).slice(0, 500);
  const incomingOptions = Array.isArray(body.options) ? body.options : [];
  const options = ANSWER_KEYS.map((key) => {
    const option = incomingOptions.find((item) => normalizeText(item?.key).toUpperCase() === key);
    return { key, text: normalizeText(option?.text).slice(0, 280) };
  });
  const correctAnswer = normalizeText(body.correctAnswer).toUpperCase();
  if (!prompt || options.some((option) => !option.text) || !ANSWER_KEYS.includes(correctAnswer)) {
    throw new TriviaError('La pregunta requiere enunciado, cuatro opciones A-D y una respuesta correcta.', 400);
  }
  const difficulty = ['easy', 'medium', 'hard'].includes(body.difficulty) ? body.difficulty : 'medium';
  return {
    prompt,
    options,
    correctAnswer,
    explanation: normalizeText(body.explanation).slice(0, 1000),
    difficulty,
  };
}

function normalizeQuestionStatus(value, fallback = 'draft') {
  const status = normalizeText(value).toLowerCase();
  if (status === 'active') {
    return 'published';
  }
  return ['draft', 'published', 'archived'].includes(status) ? status : fallback;
}

function serializeQuestion(question, { includeCorrect = false } = {}) {
  const result = {
    id: String(question._id),
    prompt: question.prompt,
    options: (question.options || []).map((option) => ({ key: option.key, text: option.text })),
    subjectKey: question.subjectKey,
    subjectLabel: question.subjectLabel || '',
    gradeKey: question.gradeKey,
    gradeLabel: question.gradeLabel || '',
    category: question.category || question.subjectLabel || question.subjectKey || '',
    ageBand: questionAgeBand(question),
    explanation: question.explanation || '',
    difficulty: question.difficulty,
    status: normalizeQuestionStatus(question.status, 'draft'),
    moderationStatus: question.moderationStatus || undefined,
    courseId: question.courseId ? String(question.courseId) : undefined,
    teacherUserId: question.teacherUserId || undefined,
    reportCount: Array.isArray(question.reports)
      ? question.reports.filter((report) => report.status === 'open').length
      : undefined,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
  if (includeCorrect) {
    result.correctAnswer = question.correctAnswer;
  }
  return result;
}

async function requireAssignedCourse({ schoolId, teacherUserId, courseId }) {
  if (!isValidObjectId(courseId)) {
    throw new TriviaError('Selecciona una asignatura y grado asignados.', 400);
  }
  const course = await CampusCourse.findOne({
    _id: courseId,
    schoolId,
    teacherUserId,
    courseType: 'subject',
    status: 'active',
  }).lean();
  if (!course) {
    throw new TriviaError('Solo puedes administrar preguntas de asignaturas y grados asignados.', 403);
  }
  return course;
}

async function listTeacherOptions({ schoolId, teacherUserId }) {
  const courses = await CampusCourse.find({
    schoolId,
    teacherUserId,
    courseType: 'subject',
    status: 'active',
  }).select('title subject gradeLevel studentGradeKey section').sort({ subject: 1, studentGradeKey: 1 }).lean();
  return courses.map((course) => ({
    courseId: String(course._id),
    title: course.title,
    subjectKey: normalizeText(course.subject || course.title),
    subjectLabel: normalizeText(course.subject || course.title),
    gradeKey: normalizeText(course.studentGradeKey || course.gradeLevel),
    gradeLabel: normalizeText(course.gradeLevel || course.studentGradeKey),
    section: normalizeText(course.section),
  }));
}

async function listTeacherQuestions({
  schoolId,
  teacherUserId,
  courseId = '',
  subjectKey = '',
  gradeKey = '',
  status = '',
}) {
  const query = { schoolId, teacherUserId, status: { $ne: 'archived' } };
  if (courseId) {
    await requireAssignedCourse({ schoolId, teacherUserId, courseId });
    query.courseId = courseId;
  }
  if (subjectKey) {
    query.subjectKey = normalizeText(subjectKey);
  }
  if (gradeKey) {
    query.gradeKey = normalizeText(gradeKey);
  }
  if (status) {
    const normalizedStatus = normalizeQuestionStatus(status, '');
    if (!normalizedStatus) {
      throw new TriviaError('Estado de pregunta no válido.', 400);
    }
    query.status = normalizedStatus === 'published'
      ? { $in: PUBLISHED_STATUSES }
      : normalizedStatus;
  }
  const questions = await TriviaQuestion.find(query)
    .select('+correctAnswer')
    .sort({ updatedAt: -1 })
    .lean();
  return questions.map((question) => serializeQuestion(question, { includeCorrect: true }));
}

async function createTeacherQuestion({ schoolId, teacherUserId, body }) {
  const course = await requireAssignedCourse({ schoolId, teacherUserId, courseId: body.courseId });
  const payload = sanitizeQuestionInput(body);
  const question = await TriviaQuestion.create({
    ...payload,
    schoolId,
    teacherUserId,
    courseId: course._id,
    subjectKey: normalizeText(course.subject || course.title),
    subjectLabel: normalizeText(course.subject || course.title),
    gradeKey: normalizeText(course.studentGradeKey || course.gradeLevel),
    gradeLabel: normalizeText(course.gradeLevel || course.studentGradeKey),
    category: normalizeText(course.subject || course.title),
    status: normalizeQuestionStatus(body.status, 'draft'),
  });
  return serializeQuestion(question, { includeCorrect: true });
}

async function updateTeacherQuestion({ schoolId, teacherUserId, questionId, body }) {
  if (!isValidObjectId(questionId)) {
    throw new TriviaError('Pregunta no válida.', 400);
  }
  const question = await TriviaQuestion.findOne({
    _id: questionId,
    schoolId,
    teacherUserId,
  }).select('+correctAnswer');
  if (!question) {
    throw new TriviaError('Pregunta no encontrada.', 404);
  }
  const course = await requireAssignedCourse({
    schoolId,
    teacherUserId,
    courseId: body.courseId || question.courseId,
  });
  const payload = sanitizeQuestionInput({ ...question.toObject(), ...body });
  Object.assign(question, payload, {
    courseId: course._id,
    subjectKey: normalizeText(course.subject || course.title),
    subjectLabel: normalizeText(course.subject || course.title),
    gradeKey: normalizeText(course.studentGradeKey || course.gradeLevel),
    gradeLabel: normalizeText(course.gradeLevel || course.studentGradeKey),
    category: normalizeText(course.subject || course.title),
    status: normalizeQuestionStatus(body.status, normalizeQuestionStatus(question.status, 'draft')),
  });
  await question.save();
  return serializeQuestion(question, { includeCorrect: true });
}

async function deleteTeacherQuestion({ schoolId, teacherUserId, questionId }) {
  if (!isValidObjectId(questionId)) {
    throw new TriviaError('Pregunta no válida.', 400);
  }
  const question = await TriviaQuestion.findOne({
    _id: questionId,
    schoolId,
    teacherUserId,
  });
  if (!question) {
    throw new TriviaError('Pregunta no encontrada.', 404);
  }
  question.status = 'archived';
  await question.save();
  return { ok: true };
}

async function listGlobalQuestions({
  status = '',
  category = '',
  ageBand = '',
  difficulty = '',
  moderationStatus = '',
} = {}) {
  return runInControlDb(async () => {
    const query = { status: { $ne: 'archived' } };
    if (status) {
      const normalizedStatus = normalizeQuestionStatus(status, '');
      if (!normalizedStatus) {
        throw new TriviaError('Estado de pregunta no válido.', 400);
      }
      query.status = normalizedStatus === 'published' ? { $in: PUBLISHED_STATUSES } : normalizedStatus;
    }
    if (category) {
      query.category = normalizeText(category);
    }
    if (ageBand) {
      if (!AGE_BANDS.includes(ageBand)) {
        throw new TriviaError('Rango de edad no válido.', 400);
      }
      query.ageBand = ageBand;
    }
    if (difficulty) {
      if (!['easy', 'medium', 'hard'].includes(difficulty)) {
        throw new TriviaError('Dificultad no válida.', 400);
      }
      query.difficulty = difficulty;
    }
    if (moderationStatus) {
      if (!['approved', 'hidden'].includes(moderationStatus)) {
        throw new TriviaError('Estado de moderación no válido.', 400);
      }
      query.moderationStatus = moderationStatus;
    }
    const questions = await GlobalTriviaQuestion.find(query)
      .select('+correctAnswer')
      .sort({ updatedAt: -1 })
      .lean();
    return questions.map((question) => serializeQuestion(question, { includeCorrect: true }));
  });
}

async function createGlobalQuestion({ userId, body }) {
  const payload = sanitizeQuestionInput(body);
  const category = normalizeText(body.category);
  const ageBand = normalizeText(body.ageBand);
  if (!GLOBAL_CATEGORIES.includes(category) || !AGE_BANDS.includes(ageBand)) {
    throw new TriviaError('Categoría global y rango de edad son obligatorios.', 400);
  }
  return runInControlDb(async () => {
    const question = await GlobalTriviaQuestion.create({
      ...payload,
      category,
      ageBand,
      subjectKey: category,
      subjectLabel: category,
      gradeKey: ageBand,
      gradeLabel: ageBand,
      status: normalizeQuestionStatus(body.status, 'draft'),
      createdByUserId: userId,
      moderationStatus: body.moderationStatus === 'hidden' ? 'hidden' : 'approved',
    });
    return serializeQuestion(question, { includeCorrect: true });
  });
}

async function updateGlobalQuestion({ questionId, body }) {
  if (!isValidObjectId(questionId)) {
    throw new TriviaError('Pregunta no válida.', 400);
  }
  return runInControlDb(async () => {
    const question = await GlobalTriviaQuestion.findById(questionId).select('+correctAnswer');
    if (!question) {
      throw new TriviaError('Pregunta global no encontrada.', 404);
    }
    const payload = sanitizeQuestionInput({ ...question.toObject(), ...body });
    Object.assign(question, payload);
    const category = normalizeText(body.category ?? question.category ?? question.subjectKey);
    const ageBand = normalizeText(body.ageBand ?? question.ageBand ?? question.gradeKey);
    if (!GLOBAL_CATEGORIES.includes(category) || !AGE_BANDS.includes(ageBand)) {
      throw new TriviaError('Categoría global y rango de edad son obligatorios.', 400);
    }
    Object.assign(question, {
      category,
      ageBand,
      subjectKey: category,
      subjectLabel: category,
      gradeKey: ageBand,
      gradeLabel: ageBand,
      status: normalizeQuestionStatus(body.status, normalizeQuestionStatus(question.status, 'draft')),
    });
    if (['approved', 'hidden'].includes(body.moderationStatus)) {
      question.moderationStatus = body.moderationStatus;
    }
    await question.save();
    return serializeQuestion(question, { includeCorrect: true });
  });
}

async function deleteGlobalQuestion({ questionId }) {
  if (!isValidObjectId(questionId)) {
    throw new TriviaError('Pregunta no válida.', 400);
  }
  return runInControlDb(async () => {
    const question = await GlobalTriviaQuestion.findById(questionId);
    if (!question) {
      throw new TriviaError('Pregunta global no encontrada.', 404);
    }
    question.status = 'archived';
    await question.save();
    return { ok: true };
  });
}

function buildParticipants(identities, mode) {
  return identities.map((identity, index) => ({
    schoolId: identity.schoolId,
    studentId: identity.studentId,
    userId: identity.userId,
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl || '',
    schoolName: identity.schoolName || '',
    ageBand: identity.ageBand || '',
    teamIndex: mode === '2v2' ? index % 2 : index,
    answers: 0,
    correctAnswers: 0,
    correctStreak: 0,
  }));
}

function resolveStartingTurnIndex(participants, startingIdentity) {
  if (!startingIdentity?.studentId) {
    return 0;
  }
  const index = (participants || []).findIndex((participant) => (
    participant.schoolId === startingIdentity.schoolId
    && participant.studentId === startingIdentity.studentId
  ));
  return index >= 0 ? index : 0;
}

function filterSelectedCategories(available = [], selected = []) {
  const allowed = new Set((available || []).map((item) => normalizeText(item)).filter(Boolean));
  const requested = [...new Set((selected || []).map((item) => normalizeText(item)).filter(Boolean))];
  if (!requested.length) {
    return [...allowed];
  }
  return requested.filter((item) => allowed.has(item));
}

async function createMatchInScope({
  scope,
  schoolId,
  mode,
  source,
  identities,
  subjectKey = '',
  gradeKey = '',
  ageBand = '',
  startingIdentity = null,
  selectedCategories = [],
}) {
  const { Match } = modelsForScope(scope);
  const participants = buildParticipants(identities, mode);
  const teamCount = mode === '2v2' ? 2 : identities.length;
  const availableCategories = await resolveRouletteCategories({
    scope,
    schoolId,
    gradeKey,
    ageBand,
  });
  const rouletteCategories = scope === 'institutional'
    ? filterSelectedCategories(availableCategories, selectedCategories)
    : availableCategories;
  if (!rouletteCategories.length) {
    throw new TriviaError('No hay categorías con preguntas publicadas para esta partida.', 409);
  }
  return Match.create({
    schoolId,
    scope,
    mode,
    source,
    subjectKey,
    gradeKey,
    ageBand,
    rouletteCategories,
    participants,
    teams: Array.from({ length: teamCount }, (_, index) => ({ index, position: 0 })),
    currentTurnIndex: resolveStartingTurnIndex(participants, startingIdentity),
    turnNumber: 1,
    turnToken: createToken(),
    version: 0,
    phase: 'await_spin',
    turnExpiresAt: nextTurnDeadline(),
  });
}

function serializeMatch(match, viewer = null) {
  const current = match.participants?.[match.currentTurnIndex] || null;
  const history = Array.isArray(match.history) ? match.history : [];
  const latestResult = history.length ? history[history.length - 1] : null;
  const viewerIndex = viewer
    ? (match.participants || []).findIndex((participant) => (
        participant.schoolId === viewer.schoolId && participant.studentId === viewer.studentId
      ))
    : -1;
  const isYourTurn = Boolean(viewer && current
    && viewer.schoolId === current.schoolId
    && viewer.studentId === current.studentId);
  return {
    id: String(match._id),
    scope: match.scope,
    mode: match.mode,
    source: match.source,
    subjectKey: match.subjectKey || '',
    gradeKey: match.gradeKey || '',
    ageBand: match.ageBand || '',
    status: match.status,
    phase: !isYourTurn && ['await_spin', 'await_answer'].includes(match.phase)
      ? 'await_turn'
      : match.phase,
    boardEnd: BOARD_END,
    advanceStreakNeeded: ADVANCE_STREAK,
    viewerStudentId: viewer?.studentId || '',
    participants: (match.participants || []).map((participant, index) => ({
      index,
      schoolId: participant.schoolId,
      studentId: participant.studentId,
      isYou: index === viewerIndex,
      displayName: participant.displayName,
      avatarUrl: participant.avatarUrl || '',
      schoolName: participant.schoolName || '',
      ageBand: participant.ageBand || '',
      teamIndex: participant.teamIndex,
      isYou: Boolean(viewer
        && viewer.schoolId === participant.schoolId
        && viewer.studentId === participant.studentId),
      answers: Number(participant.answers || 0),
      correctAnswers: Number(participant.correctAnswers || 0),
      correctStreak: Number(participant.correctStreak || 0),
    })),
    teams: (match.teams || []).map((team) => ({
      index: team.index,
      position: Number(team.position || 0),
    })),
    currentTurnIndex: match.currentTurnIndex,
    currentStudentId: current?.studentId || '',
    currentViewerStudentId: viewer?.studentId || '',
    viewerIndex,
    isYourTurn,
    turnNumber: match.turnNumber,
    turnToken: isYourTurn ? match.turnToken : '',
    version: match.version,
    roulette: {
      options: match.rouletteCategories || [],
      subjects: match.scope === 'institutional' ? (match.rouletteCategories || []) : [],
      categories: match.scope === 'global' ? (match.rouletteCategories || []) : [],
      selectedSubject: match.scope === 'institutional' ? (match.selectedCategory || '') : '',
      selectedCategory: match.selectedCategory || '',
    },
    question: match.activeQuestion && isYourTurn
      ? {
          id: match.activeQuestion.questionId,
          prompt: match.activeQuestion.prompt,
          options: match.activeQuestion.options,
          subjectKey: match.activeQuestion.subjectKey || '',
          gradeKey: match.activeQuestion.gradeKey || '',
          category: match.activeQuestion.category || match.selectedCategory || '',
          ageBand: match.activeQuestion.ageBand || '',
        }
      : null,
    lastResult: latestResult
      ? {
          studentId: latestResult.studentId,
          teamIndex: latestResult.teamIndex,
          category: latestResult.category,
          subject: match.scope === 'institutional' ? latestResult.category : '',
          questionId: latestResult.questionId,
          answerKey: latestResult.answerKey,
          correct: latestResult.correct,
          positionBefore: latestResult.positionBefore,
          positionAfter: latestResult.positionAfter,
          streak: Number(latestResult.streak || 0),
          answeredAt: latestResult.answeredAt,
        }
      : null,
    winnerTeamIndexes: match.winnerTeamIndexes || [],
    finishReason: match.finishReason || '',
    turnExpiresAt: match.turnExpiresAt || resolveTurnDeadline(match),
    finishedAt: match.finishedAt || null,
    updatedAt: match.updatedAt || null,
  };
}

async function joinCandidateQueue({ scope: rawScope, mode: rawMode, subjectKey = '', ...context }) {
  const scope = normalizeScope(rawScope);
  const mode = normalizeMode(rawMode);
  const identity = await requireStudent(context);
  const profile = await ensureProfile(scope, identity);
  identity.displayName = profile.displayName;
  identity.avatarUrl = profile.avatarUrl;
  identity.schoolName = profile.schoolName;
  identity.ageBand = profile.ageBand;
  if (scope === 'global' && (!identity.ageBand || !profile.ageBandConfirmedAt)) {
    throw new TriviaError('Configura tu rango de edad antes de jugar en la red global.', 409);
  }
  const normalizedSubject = scope === 'institutional' ? normalizeText(subjectKey) : '';
  const normalizedGrade = scope === 'institutional' ? normalizeText(profile.gradeKey) : '';
  if (scope === 'institutional' && !normalizedGrade) {
    throw new TriviaError('Tu perfil de alumno no tiene un grado asignado.', 409);
  }
  const { Candidate } = modelsForScope(scope);

  const result = await inScope(scope, identity.schoolId, async () => {
    await Candidate.updateMany(
      {
        schoolId: identity.schoolId,
        studentId: identity.studentId,
        status: { $in: ['waiting', 'matching'] },
      },
      { $set: { status: 'cancelled', claimToken: '' } }
    );
    const candidate = await Candidate.create({
      ...identity,
      profileId: profile._id,
      mode,
      subjectKey: normalizedSubject,
      gradeKey: normalizedGrade,
      status: 'waiting',
      expiresAt: new Date(Date.now() + CANDIDATE_TTL_MS),
    });
    const match = await attemptMatchmaking({
      scope,
      schoolId: identity.schoolId,
      candidate,
    });
    return { candidate, match };
  });

  return {
    candidate: {
      id: String(result.candidate._id),
      scope,
      mode,
      displayName: result.candidate.displayName,
      avatarUrl: result.candidate.avatarUrl || '',
      schoolName: result.candidate.schoolName || '',
      gradeKey: result.candidate.gradeKey || '',
      ageBand: result.candidate.ageBand || '',
      status: result.match ? 'matched' : result.candidate.status,
      expiresAt: result.candidate.expiresAt,
    },
    match: result.match ? serializeMatch(result.match, identity) : null,
  };
}

async function attemptMatchmaking({ scope, schoolId, candidate }) {
  const { Candidate } = modelsForScope(scope);
  const needed = MODES[candidate.mode];
  const query = {
    _id: { $ne: candidate._id },
    mode: candidate.mode,
    status: 'waiting',
    expiresAt: { $gt: new Date() },
  };
  let currentGlobalProfile = null;
  if (scope === 'institutional') {
    query.schoolId = schoolId;
    query.gradeKey = candidate.gradeKey;
  } else {
    query.ageBand = candidate.ageBand;
    currentGlobalProfile = await GlobalTriviaProfile.findById(candidate.profileId)
      .select('+blockedProfileIds')
      .lean();
    const unavailableProfileIds = await GlobalTriviaProfile.find({
      $or: [
        { _id: { $in: currentGlobalProfile?.blockedProfileIds || [] } },
        { blockedProfileIds: candidate.profileId },
      ],
    }).distinct('_id');
    query.profileId = { $nin: unavailableProfileIds };
  }
  let waitingCandidates = await Candidate.find(query)
    .sort({ createdAt: 1 })
    .limit(scope === 'global' ? 50 : needed - 1)
    .lean();
  if (scope === 'global') {
    const profiles = await GlobalTriviaProfile.find({
      _id: { $in: waitingCandidates.map((item) => item.profileId) },
      status: 'active',
    }).select('+blockedProfileIds').lean();
    const profilesById = new Map(profiles.map((profile) => [String(profile._id), profile]));
    const selectedProfileIds = [String(candidate.profileId)];
    const selectedProfiles = [currentGlobalProfile];
    waitingCandidates = waitingCandidates.filter((item) => {
      const itemProfile = profilesById.get(String(item.profileId));
      if (!itemProfile) {
        return false;
      }
      const itemBlockedIds = new Set((itemProfile.blockedProfileIds || []).map(String));
      const blockedBySelected = selectedProfiles.some((profile) => (
        (profile?.blockedProfileIds || []).some((profileId) => String(profileId) === String(item.profileId))
      ));
      if (blockedBySelected || selectedProfileIds.some((profileId) => itemBlockedIds.has(profileId))) {
        return false;
      }
      selectedProfileIds.push(String(item.profileId));
      selectedProfiles.push(itemProfile);
      return true;
    }).slice(0, needed - 1);
  }
  if (waitingCandidates.length < needed - 1) {
    return null;
  }
  const candidates = [
    typeof candidate.toObject === 'function' ? candidate.toObject() : candidate,
    ...waitingCandidates,
  ];

  const claimToken = createToken();
  const claimed = [];
  for (const item of candidates) {
    const updated = await Candidate.findOneAndUpdate(
      { _id: item._id, status: 'waiting' },
      { $set: { status: 'matching', claimToken } },
      { new: true }
    );
    if (!updated) {
      await Candidate.updateMany(
        { claimToken, status: 'matching' },
        { $set: { status: 'waiting', claimToken: '' } }
      );
      return null;
    }
    claimed.push(updated);
  }

  try {
    const identities = claimed.map((item) => ({
      schoolId: item.schoolId,
      studentId: item.studentId,
      userId: item.userId,
      displayName: item.displayName,
      avatarUrl: item.avatarUrl,
      schoolName: item.schoolName,
      ageBand: item.ageBand,
    }));
    const match = await createMatchInScope({
      scope,
      schoolId,
      mode: candidate.mode,
      source: 'matchmaking',
      identities,
      subjectKey: candidate.subjectKey,
      gradeKey: candidate.gradeKey,
      ageBand: candidate.ageBand,
    });
    await Candidate.updateMany(
      { claimToken, status: 'matching' },
      { $set: { status: 'matched', matchId: match._id, claimToken: '' } }
    );
    return match;
  } catch (error) {
    await Candidate.updateMany(
      { claimToken, status: 'matching' },
      { $set: { status: 'waiting', claimToken: '' } }
    );
    throw error;
  }
}

async function cancelCandidate({ scope: rawScope, ...context }) {
  const scope = normalizeScope(rawScope);
  const identity = await requireStudent(context);
  const { Candidate } = modelsForScope(scope);
  const result = await inScope(scope, identity.schoolId, () => Candidate.updateMany(
    {
      schoolId: identity.schoolId,
      studentId: identity.studentId,
      status: { $in: ['waiting', 'matching'] },
    },
    { $set: { status: 'cancelled', claimToken: '' } }
  ));
  return { ok: true, cancelled: Number(result.modifiedCount || 0) };
}

async function getCandidateStatus({ scope: rawScope, ...context }) {
  const scope = normalizeScope(rawScope);
  const identity = await requireStudent(context);
  const { Candidate, Match } = modelsForScope(scope);
  return inScope(scope, identity.schoolId, async () => {
    await Candidate.updateMany(
      {
        schoolId: identity.schoolId,
        studentId: identity.studentId,
        status: { $in: ['waiting', 'matching'] },
        expiresAt: { $lte: new Date() },
      },
      { $set: { status: 'cancelled', claimToken: '' } }
    );
    const candidate = await Candidate.findOne({
      schoolId: identity.schoolId,
      studentId: identity.studentId,
    }).sort({ createdAt: -1 });
    if (!candidate) {
      return { candidate: null, match: null };
    }
    const match = candidate.matchId
      ? await Match.findOne({
          _id: candidate.matchId,
          participants: { $elemMatch: { schoolId: identity.schoolId, studentId: identity.studentId } },
        })
      : null;
    return {
      candidate: {
        id: String(candidate._id),
        scope,
        mode: candidate.mode,
        displayName: candidate.displayName,
        avatarUrl: candidate.avatarUrl || '',
        schoolName: candidate.schoolName || '',
        gradeKey: candidate.gradeKey || '',
        ageBand: candidate.ageBand || '',
        status: candidate.status,
        expiresAt: candidate.expiresAt,
      },
      match: match ? serializeMatch(match, identity) : null,
    };
  });
}

async function listEligibleCandidates({ scope: rawScope, limit = 30, ...context }) {
  const scope = normalizeScope(rawScope);
  const identity = await requireStudent(context);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const profile = await ensureProfile(scope, identity);

  if (scope === 'global') {
    if (!profile.ageBand || !profile.ageBandConfirmedAt) {
      throw new TriviaError('Configura tu rango de edad antes de jugar en la red global.', 409);
    }
    const viewerProfile = await runInControlDb(() => GlobalTriviaProfile.findById(profile._id)
      .select('+blockedProfileIds')
      .lean());
    const blockedProfileIds = viewerProfile?.blockedProfileIds || [];
    const candidates = await runInControlDb(() => GlobalTriviaProfile.aggregate([
      {
        $match: {
          ageBand: profile.ageBand,
          ageBandConfirmedAt: { $ne: null },
          status: 'active',
          _id: { $nin: [profile._id, ...blockedProfileIds] },
          blockedProfileIds: { $ne: profile._id },
        },
      },
      { $sample: { size: safeLimit } },
      {
        $project: {
          schoolId: 1,
          schoolName: 1,
          studentId: 1,
          displayName: 1,
          avatarUrl: 1,
          ageBand: 1,
        },
      },
    ]));
    return candidates.map((candidate) => ({
      scope,
      schoolId: candidate.schoolId,
      schoolName: candidate.schoolName || '',
      studentId: candidate.studentId,
      displayName: candidate.displayName,
      avatarUrl: candidate.avatarUrl || '',
      ageBand: candidate.ageBand,
    }));
  }

  const students = await runWithSchoolContext(identity.schoolId, () => Student.find({
    schoolId: identity.schoolId,
    status: 'active',
    deletedAt: null,
    _id: { $ne: identity.studentId },
    $or: [
      { grade: identity.gradeKey },
      { course: identity.gradeKey },
    ],
  }).select('name grade course imageUrl thumbUrl birthDate').sort({ name: 1 }).limit(safeLimit * 2).lean());
  const studentIds = students.map((student) => student._id);
  const users = await runWithSchoolContext(identity.schoolId, () => User.find({
    schoolId: identity.schoolId,
    role: 'student',
    linkedStudentId: { $in: studentIds },
    status: 'active',
    deletedAt: null,
  }).select('linkedStudentId').lean());
  const activeStudentIds = new Set(users.map((user) => String(user.linkedStudentId)));
  return students
    .filter((student) => activeStudentIds.has(String(student._id)))
    .slice(0, safeLimit)
    .map((student) => ({
      scope,
      schoolId: identity.schoolId,
      schoolName: identity.schoolName,
      studentId: String(student._id),
      displayName: student.name,
      avatarUrl: student.thumbUrl || student.imageUrl || '',
      gradeKey: normalizeText(student.grade || student.course),
      ageBand: resolveAgeBand(student.birthDate),
    }));
}

async function lookupInvitee(schoolId, studentId) {
  if (!isValidObjectId(studentId)) {
    throw new TriviaError('Alumno invitado no válido.', 400);
  }
  const student = await runWithSchoolContext(schoolId, () => Student.findOne({
    _id: studentId,
    schoolId,
    status: 'active',
    deletedAt: null,
  }).select('name grade course userId imageUrl thumbUrl birthDate').lean());
  if (!student) {
    throw new TriviaError('No encontramos uno de los alumnos invitados.', 404);
  }
  const userId = await resolveStudentUserId(schoolId, student);
  if (!userId) {
    throw new TriviaError('El alumno invitado no tiene una cuenta activa.', 409);
  }
  const schoolName = await runWithSchoolContext(schoolId, () => getSchoolDisplayName(schoolId));
  return studentIdentity(student, userId, schoolId, '', schoolName);
}

async function requireGlobalProfilesCanInteract(profiles) {
  const profileIds = profiles.map((profile) => profile._id);
  const fullProfiles = await runInControlDb(() => GlobalTriviaProfile.find({
    _id: { $in: profileIds },
  }).select('+blockedProfileIds').lean());
  const selectedIds = new Set(profileIds.map(String));
  for (const profile of fullProfiles) {
    if ((profile.blockedProfileIds || []).some((profileId) => selectedIds.has(String(profileId)))) {
      throw new TriviaError('Uno de los perfiles no está disponible para invitaciones.', 403);
    }
  }
}

async function safeNotify(participant, title, body, payload) {
  try {
    await queueStudentUserNotification({
      schoolId: participant.schoolId,
      studentId: participant.studentId,
      title,
      body,
      payload,
    });
  } catch (error) {
    console.warn(`[trivia] notification failed: ${error.message}`);
  }
}

async function listStudentRouletteOptions({ scope: rawScope, ...context }) {
  const scope = normalizeScope(rawScope);
  const identity = await requireStudent(context);
  if (scope === 'global') {
    return {
      subjects: GLOBAL_CATEGORIES.map((category) => ({ key: category, label: category })),
    };
  }
  if (!identity.gradeKey) {
    throw new TriviaError('Tu perfil de alumno no tiene un grado asignado.', 409);
  }
  const courses = await CampusCourse.find({
    schoolId: identity.schoolId,
    status: 'active',
    courseType: 'subject',
    $or: [
      { studentGradeKey: identity.gradeKey },
      { gradeLevel: identity.gradeKey },
    ],
  }).select('subject title').lean();
  const available = await resolveRouletteCategories({
    scope: 'institutional',
    schoolId: identity.schoolId,
    gradeKey: identity.gradeKey,
  });
  const labels = new Map();
  courses.forEach((course) => {
    const key = normalizeText(course.subject || course.title);
    if (key && !labels.has(key)) {
      labels.set(key, normalizeText(course.title || course.subject) || key);
    }
  });
  return {
    subjects: available.map((key) => ({
      key,
      label: labels.get(key) || key,
    })),
  };
}

async function createInvitation({
  scope: rawScope,
  mode: rawMode,
  invitees = [],
  subjectKey = '',
  rouletteCategories: selectedCategories = [],
  ...context
}) {
  const scope = normalizeScope(rawScope);
  const mode = normalizeMode(rawMode);
  const creator = await requireStudent(context);
  const profile = await ensureProfile(scope, creator);
  creator.displayName = profile.displayName;
  creator.avatarUrl = profile.avatarUrl;
  creator.schoolName = profile.schoolName;
  creator.ageBand = profile.ageBand;
  if (scope === 'global' && (!creator.ageBand || !profile.ageBandConfirmedAt)) {
    throw new TriviaError('Configura tu rango de edad antes de jugar en la red global.', 409);
  }
  if (scope === 'institutional' && !creator.gradeKey) {
    throw new TriviaError('Tu perfil de alumno no tiene un grado asignado.', 409);
  }
  const expectedInvitees = MODES[mode] - 1;
  if (!Array.isArray(invitees) || invitees.length !== expectedInvitees) {
    throw new TriviaError(`El modo ${mode} requiere ${expectedInvitees} invitación(es).`, 400);
  }

  const seen = new Set([`${creator.schoolId}:${creator.studentId}`]);
  const invitedIdentities = [];
  const invitedProfiles = [];
  for (const item of invitees) {
    const targetSchoolId = normalizeText(item?.schoolId || creator.schoolId);
    if (scope === 'institutional' && targetSchoolId !== creator.schoolId) {
      throw new TriviaError('Las invitaciones institucionales solo incluyen alumnos del mismo colegio.', 400);
    }
    const key = `${targetSchoolId}:${item?.studentId}`;
    if (seen.has(key)) {
      throw new TriviaError('No puedes repetir alumnos en una invitación.', 400);
    }
    seen.add(key);
    const invitee = await lookupInvitee(targetSchoolId, item?.studentId);
    const inviteeProfile = await ensureProfile(scope, invitee);
    invitedProfiles.push(inviteeProfile);
    Object.assign(invitee, {
      displayName: inviteeProfile.displayName,
      avatarUrl: inviteeProfile.avatarUrl,
      schoolName: inviteeProfile.schoolName,
      ageBand: inviteeProfile.ageBand,
    });
    if (scope === 'institutional' && invitee.gradeKey !== creator.gradeKey) {
      throw new TriviaError('Las invitaciones institucionales requieren alumnos del mismo grado.', 400);
    }
    if (scope === 'global' && invitee.ageBand !== creator.ageBand) {
      throw new TriviaError('Las invitaciones globales requieren el mismo rango de edad.', 400);
    }
    invitedIdentities.push(invitee);
  }
  const duelKey = mode === '1v1'
    ? createDuelKey(creator, invitedIdentities[0])
    : '';
  if (duelKey) {
    const { Invitation, Match } = modelsForScope(scope);
    const existingMatch = await inScope(scope, creator.schoolId, () => Match.findOne({
      mode: '1v1',
      status: 'active',
      $and: [
        {
          participants: {
            $elemMatch: {
              schoolId: creator.schoolId,
              studentId: creator.studentId,
            },
          },
        },
        {
          participants: {
            $elemMatch: {
              schoolId: invitedIdentities[0].schoolId,
              studentId: invitedIdentities[0].studentId,
            },
          },
        },
      ],
    }).select('_id'));
    if (existingMatch) {
      throw new TriviaError('Ya existe una batalla 1 vs 1 activa entre estos jugadores.', 409);
    }
    const existingInvitation = await inScope(scope, creator.schoolId, () => Invitation.findOne({
      mode: '1v1',
      status: 'pending',
      expiresAt: { $gt: new Date() },
      $or: [
        {
          schoolId: creator.schoolId,
          createdByStudentId: creator.studentId,
          invited: {
            $elemMatch: {
              schoolId: invitedIdentities[0].schoolId,
              studentId: invitedIdentities[0].studentId,
            },
          },
        },
        {
          schoolId: invitedIdentities[0].schoolId,
          createdByStudentId: invitedIdentities[0].studentId,
          invited: {
            $elemMatch: {
              schoolId: creator.schoolId,
              studentId: creator.studentId,
            },
          },
        },
      ],
    }));
    if (existingInvitation) {
      return serializeInvitation(existingInvitation, creator);
    }
  }
  if (scope === 'global') {
    await requireGlobalProfilesCanInteract([profile, ...invitedProfiles]);
  }

  let rouletteCategories = [];
  if (scope === 'institutional') {
    const availableCategories = await resolveRouletteCategories({
      scope,
      schoolId: creator.schoolId,
      gradeKey: creator.gradeKey,
    });
    rouletteCategories = filterSelectedCategories(availableCategories, selectedCategories);
    if (!availableCategories.length) {
      throw new TriviaError('No hay categorías con preguntas publicadas para esta partida.', 409);
    }
    if (Array.isArray(selectedCategories) && selectedCategories.length && !rouletteCategories.length) {
      throw new TriviaError('Elige al menos una materia con preguntas publicadas.', 400);
    }
    if (!rouletteCategories.length) {
      rouletteCategories = availableCategories;
    }
  }

  const { Invitation } = modelsForScope(scope);
  let invitation;
  let invitationCreated = false;
  try {
    invitation = await inScope(scope, creator.schoolId, () => Invitation.create({
      schoolId: creator.schoolId,
      createdByStudentId: creator.studentId,
      createdByUserId: creator.userId,
      createdByDisplayName: creator.displayName,
      createdByAvatarUrl: creator.avatarUrl,
      createdBySchoolName: creator.schoolName,
      createdByAgeBand: creator.ageBand,
      mode,
      duelKey,
      subjectKey: normalizeText(subjectKey),
      gradeKey: scope === 'institutional' ? normalizeText(creator.gradeKey) : '',
      ageBand: scope === 'global' ? creator.ageBand : '',
      rouletteCategories,
      invited: invitedIdentities.map((item) => ({
        ...item,
        status: 'pending',
      })),
      status: 'pending',
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    }));
    invitationCreated = true;
  } catch (error) {
    if (error?.code !== 11000 || !duelKey) {
      throw error;
    }
    invitation = await inScope(scope, creator.schoolId, () => Invitation.findOne({
      duelKey,
      mode: '1v1',
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }));
    if (!invitation) {
      throw error;
    }
  }

  if (invitationCreated) {
    await Promise.all(invitedIdentities.map((invitee) => safeNotify(
      invitee,
      'Invitación a Comergio Trivia',
      `${creator.displayName} te invitó a una partida ${mode}.`,
      {
        type: 'trivia.invite',
        scope,
        invitationId: String(invitation._id),
        url: `/student/juegos?game=trivia&scope=${encodeURIComponent(scope)}&invitationId=${encodeURIComponent(String(invitation._id))}`,
      }
    )));
  }
  return serializeInvitation(invitation, creator);
}

function serializeInvitation(invitation, viewer = null) {
  return {
    id: String(invitation._id),
    scope: invitation.constructor.modelName.startsWith('Global') ? 'global' : 'institutional',
    mode: invitation.mode,
    subjectKey: invitation.subjectKey || '',
    gradeKey: invitation.gradeKey || '',
    ageBand: invitation.ageBand || '',
    rouletteCategories: invitation.rouletteCategories || [],
    createdBy: {
      schoolId: invitation.schoolId,
      studentId: invitation.createdByStudentId,
      displayName: invitation.createdByDisplayName,
      avatarUrl: invitation.createdByAvatarUrl || '',
      schoolName: invitation.createdBySchoolName || '',
      ageBand: invitation.createdByAgeBand || '',
    },
    invited: (invitation.invited || []).map((item) => ({
      schoolId: item.schoolId,
      studentId: item.studentId,
      displayName: item.displayName,
      avatarUrl: item.avatarUrl || '',
      schoolName: item.schoolName || '',
      ageBand: item.ageBand || '',
      status: item.status,
    })),
    status: invitation.status,
    matchId: invitation.matchId ? String(invitation.matchId) : '',
    isCreator: Boolean(viewer
      && viewer.schoolId === invitation.schoolId
      && viewer.studentId === invitation.createdByStudentId),
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
}

async function listInvitations({ scope: rawScope, ...context }) {
  const scope = normalizeScope(rawScope);
  const identity = await requireStudent(context);
  const { Invitation } = modelsForScope(scope);
  const invitations = await inScope(scope, identity.schoolId, async () => {
    await Invitation.updateMany(
      { status: 'pending', expiresAt: { $lte: new Date() } },
      { $set: { status: 'expired' } }
    );
    const foundInvitations = await Invitation.find({
      $or: [
        { schoolId: identity.schoolId, createdByStudentId: identity.studentId },
        { invited: { $elemMatch: { schoolId: identity.schoolId, studentId: identity.studentId } } },
      ],
    }).sort({ createdAt: -1 }).limit(50);
    const seenPendingDuels = new Set();
    const duplicateIds = [];
    const visibleInvitations = foundInvitations.filter((invitation) => {
      if (invitation.mode !== '1v1' || invitation.status !== 'pending') {
        return true;
      }
      const invitedPlayer = invitation.invited?.[0];
      if (!invitedPlayer) {
        return true;
      }
      const duelKey = invitation.duelKey || createDuelKey(
        { schoolId: invitation.schoolId, studentId: invitation.createdByStudentId },
        invitedPlayer
      );
      if (seenPendingDuels.has(duelKey)) {
        duplicateIds.push(invitation._id);
        return false;
      }
      seenPendingDuels.add(duelKey);
      return true;
    });
    if (duplicateIds.length) {
      await Invitation.updateMany(
        { _id: { $in: duplicateIds }, status: 'pending' },
        { $set: { status: 'cancelled' } }
      );
    }
    return visibleInvitations;
  });
  return invitations.map((invitation) => serializeInvitation(invitation, identity));
}

async function respondInvitation({ scope: rawScope, invitationId, accept, ...context }) {
  const scope = normalizeScope(rawScope);
  const identity = await requireStudent(context);
  const profile = await ensureProfile(scope, identity);
  identity.displayName = profile.displayName;
  const { Invitation } = modelsForScope(scope);
  if (!isValidObjectId(invitationId)) {
    throw new TriviaError('Invitación no válida.', 400);
  }

  const result = await inScope(scope, identity.schoolId, async () => {
    let invitation = await Invitation.findOneAndUpdate(
      {
        _id: invitationId,
        status: 'pending',
        expiresAt: { $gt: new Date() },
        invited: {
          $elemMatch: {
            schoolId: identity.schoolId,
            studentId: identity.studentId,
            status: 'pending',
          },
        },
      },
      {
        $set: {
          'invited.$[invitee].status': accept ? 'accepted' : 'declined',
          'invited.$[invitee].userId': identity.userId,
          'invited.$[invitee].respondedAt': new Date(),
          ...(!accept ? { status: 'declined' } : {}),
        },
      },
      {
        new: true,
        arrayFilters: [{
          'invitee.schoolId': identity.schoolId,
          'invitee.studentId': identity.studentId,
          'invitee.status': 'pending',
        }],
      }
    );
    if (!invitation) {
      throw new TriviaError('La invitación no está disponible.', 404);
    }

    if (!accept || invitation.invited.some((item) => item.status !== 'accepted')) {
      return { invitation, match: null };
    }

    invitation = await Invitation.findOneAndUpdate(
      {
        _id: invitation._id,
        status: 'pending',
        $nor: [{ invited: { $elemMatch: { status: { $ne: 'accepted' } } } }],
      },
      { $set: { status: 'matching' } },
      { new: true }
    );
    if (!invitation) {
      const currentInvitation = await Invitation.findById(invitationId);
      return { invitation: currentInvitation, match: null };
    }
    const identities = [{
      schoolId: invitation.schoolId,
      studentId: invitation.createdByStudentId,
      userId: invitation.createdByUserId,
      displayName: invitation.createdByDisplayName,
      avatarUrl: invitation.createdByAvatarUrl,
      schoolName: invitation.createdBySchoolName,
      ageBand: invitation.createdByAgeBand,
    }, ...invitation.invited.map((item) => ({
      schoolId: item.schoolId,
      studentId: item.studentId,
      userId: item.userId,
      displayName: item.displayName,
      avatarUrl: item.avatarUrl,
      schoolName: item.schoolName,
      ageBand: item.ageBand,
    }))];
    try {
      const match = await createMatchInScope({
        scope,
        schoolId: invitation.schoolId,
        mode: invitation.mode,
        source: 'invitation',
        identities,
        subjectKey: invitation.subjectKey,
        gradeKey: invitation.gradeKey,
        ageBand: invitation.ageBand,
        selectedCategories: invitation.rouletteCategories || [],
        startingIdentity: identity,
      });
      invitation.status = 'accepted';
      invitation.matchId = match._id;
      await invitation.save();
      return { invitation, match };
    } catch (error) {
      invitation.status = 'cancelled';
      await invitation.save();
      throw error;
    }
  });

  return {
    invitation: serializeInvitation(result.invitation, identity),
    match: result.match ? serializeMatch(result.match, identity) : null,
  };
}

async function loadViewerMatch({ scope, matchId, identity }) {
  if (!isValidObjectId(matchId)) {
    throw new TriviaError('Partida no válida.', 400);
  }
  const { Match } = modelsForScope(scope);
  const match = await Match.findOne({
    _id: matchId,
    participants: { $elemMatch: { schoolId: identity.schoolId, studentId: identity.studentId } },
  });
  if (!match) {
    throw new TriviaError('Partida no encontrada.', 404);
  }
  return match;
}

async function recordFinishedProfiles(scope, match) {
  const { Profile } = modelsForScope(scope);
  await inScope(scope, match.schoolId, async () => {
    for (const participant of match.participants || []) {
      await Profile.updateOne(
        { schoolId: participant.schoolId, studentId: participant.studentId },
        {
          $inc: {
            gamesPlayed: 1,
            wins: (match.winnerTeamIndexes || []).includes(participant.teamIndex) ? 1 : 0,
          },
        }
      );
    }
  });
}

async function notifyExpiredMatch(match) {
  const current = match.participants?.[match.currentTurnIndex];
  await Promise.all((match.participants || []).map((participant) => {
    const won = (match.winnerTeamIndexes || []).includes(participant.teamIndex);
    const isForfeit = current
      && participant.schoolId === current.schoolId
      && participant.studentId === current.studentId;
    return safeNotify(
      participant,
      'Partida de Trivia finalizada',
      isForfeit
        ? 'No jugaste en 3 días y perdiste la partida.'
        : won
          ? 'Tu rival no jugó en 3 días. Ganaste la partida.'
          : 'La partida venció porque un jugador no respondió a tiempo.',
      {
        type: 'trivia.finished',
        scope: match.scope,
        matchId: String(match._id),
        expired: true,
        url: `/student/juegos?game=trivia&scope=${encodeURIComponent(match.scope)}&matchId=${encodeURIComponent(String(match._id))}`,
      }
    );
  }));
}

async function finishExpiredMatch(match, scope) {
  if (!match || match.status !== 'active') {
    return match;
  }
  const { Match } = modelsForScope(scope);
  const winners = winnersAfterTurnForfeit(match);
  const updated = await inScope(scope, match.schoolId, () => Match.findOneAndUpdate(
    { _id: match._id, status: 'active' },
    {
      $set: {
        status: 'finished',
        phase: 'finished',
        activeQuestion: null,
        selectedCategory: '',
        winnerTeamIndexes: winners,
        finishReason: 'turn_expired',
        finishedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { new: true }
  ));
  if (!updated) {
    return (await inScope(scope, match.schoolId, () => Match.findById(match._id))) || match;
  }
  await recordFinishedProfiles(scope, updated);
  await notifyExpiredMatch(updated);
  return updated;
}

function isTurnExpired(match, now = new Date()) {
  return Boolean(match && match.status === 'active' && resolveTurnDeadline(match, now).getTime() <= now.getTime());
}

async function expireMatchIfNeeded(match, scope, now = new Date()) {
  if (!isTurnExpired(match, now)) {
    return match;
  }
  return finishExpiredMatch(match, scope);
}

function overdueMatchQuery(now = new Date()) {
  const cutoff = new Date(now.getTime() - TURN_TTL_MS);
  return {
    status: 'active',
    $or: [
      { turnExpiresAt: { $lte: now } },
      {
        $and: [
          { $or: [{ turnExpiresAt: null }, { turnExpiresAt: { $exists: false } }] },
          { updatedAt: { $lte: cutoff } },
        ],
      },
    ],
  };
}

async function expireMatchesInScope(scope, schoolId) {
  const { Match } = modelsForScope(scope);
  const stale = await inScope(scope, schoolId, () => Match.find(overdueMatchQuery()).limit(100));
  let expired = 0;
  for (const match of stale) {
    const updated = await finishExpiredMatch(match, scope);
    if (updated?.finishReason === 'turn_expired') {
      expired += 1;
    }
  }
  return expired;
}

async function expireOverdueMatches() {
  let expired = await expireMatchesInScope('global', '');
  const tenants = await listTenantSchoolContexts();
  for (const tenant of tenants) {
    expired += await expireMatchesInScope('institutional', tenant.schoolId);
  }
  return expired;
}

async function requireActiveMatch(match, scope) {
  const resolved = await expireMatchIfNeeded(match, scope);
  if (!resolved || resolved.status !== 'active') {
    throw new TriviaError('La partida venció porque un jugador no respondió en 3 días.', 409);
  }
  return resolved;
}

async function listMatches({ scope: rawScope, ...context }) {
  const scope = normalizeScope(rawScope);
  const identity = await requireStudent(context);
  const { Match } = modelsForScope(scope);
  const matches = await inScope(scope, identity.schoolId, () => Match.find({
    participants: { $elemMatch: { schoolId: identity.schoolId, studentId: identity.studentId } },
  }).sort({ updatedAt: -1 }).limit(30));
  const resolved = [];
  for (const match of matches) {
    resolved.push(await expireMatchIfNeeded(match, scope));
  }
  return resolved.map((match) => serializeMatch(match, identity));
}

async function getMatch({ scope: rawScope, matchId, ...context }) {
  const scope = normalizeScope(rawScope);
  const identity = await requireStudent(context);
  const match = await expireMatchIfNeeded(
    await inScope(scope, identity.schoolId, () => loadViewerMatch({ scope, matchId, identity })),
    scope
  );
  return serializeMatch(match, identity);
}

function questionCategory(question, scope) {
  return normalizeText(scope === 'global'
    ? (question.category || question.subjectKey)
    : (question.subjectKey || question.category));
}

function questionAgeBand(question) {
  const value = normalizeText(question.ageBand || question.gradeKey);
  return AGE_BANDS.includes(value) ? value : '';
}

function questionDifficulty(question) {
  const value = normalizeText(question?.difficulty);
  return ['easy', 'medium', 'hard'].includes(value) ? value : '';
}

function selectRouletteQuestion({
  questions,
  categories,
  usedQuestionIds = [],
  scope,
  randomInt = crypto.randomInt,
}) {
  const used = new Set(usedQuestionIds.map(String));
  const allowed = new Set(categories);
  const inCategory = (question) => allowed.has(questionCategory(question, scope));
  const unused = (questions || []).filter((question) => (
    !used.has(String(question._id || question.id)) && inCategory(question)
  ));
  const recycle = (questions || []).filter(inCategory);
  const withoutEasy = (pool) => {
    if (scope !== 'global') {
      return pool;
    }
    const challenging = pool.filter((question) => questionDifficulty(question) !== 'easy');
    return challenging.length ? challenging : pool;
  };
  const pickFrom = (pool, preferredDifficulty) => {
    const eligibleCategories = categories.filter((category) => (
      pool.some((question) => questionCategory(question, scope) === category)
    ));
    if (!eligibleCategories.length) {
      return null;
    }
    const category = eligibleCategories[randomInt(0, eligibleCategories.length)];
    const categoryQuestions = pool.filter((question) => questionCategory(question, scope) === category);
    const preferred = preferredDifficulty
      ? categoryQuestions.filter((question) => questionDifficulty(question) === preferredDifficulty)
      : [];
    const finalPool = preferred.length ? preferred : categoryQuestions;
    return {
      category,
      question: finalPool[randomInt(0, finalPool.length)],
    };
  };
  const targetDifficulty = scope === 'global' && unused.some((question) => questionDifficulty(question))
    ? (randomInt(0, 4) === 0 ? 'hard' : 'medium')
    : '';
  return pickFrom(withoutEasy(unused), targetDifficulty)
    || pickFrom(withoutEasy(recycle), targetDifficulty)
    || pickFrom(withoutEasy(recycle), '');
}

function calculatePosition(positionBefore, correct) {
  const position = Math.max(0, Math.min(BOARD_END, Number(positionBefore) || 0));
  return correct ? Math.min(BOARD_END, position + 1) : position;
}

function resolveAnswerProgress({
  positionBefore,
  correct,
  previousStreak = 0,
  streakNeeded = ADVANCE_STREAK,
  boardEnd = BOARD_END,
} = {}) {
  const safePosition = Math.max(0, Math.min(boardEnd, Number(positionBefore) || 0));
  const safeStreak = Math.max(0, Number(previousStreak) || 0);
  const nextStreak = correct ? safeStreak + 1 : 0;
  const advanced = Boolean(correct && nextStreak >= streakNeeded);
  const positionAfter = advanced ? Math.min(boardEnd, safePosition + 1) : safePosition;
  const didFinish = positionAfter >= boardEnd;
  const keepsTurn = Boolean(correct && !didFinish);
  return {
    streakNeeded,
    displayedStreak: correct ? Math.min(streakNeeded, nextStreak) : 0,
    persistedStreak: keepsTurn && !advanced ? nextStreak : 0,
    stationsAdvanced: advanced ? 1 : 0,
    positionAfter,
    didFinish,
    keepsTurn,
    advanced,
  };
}

async function resolveRouletteCategories({ scope, schoolId, gradeKey, ageBand }) {
  if (scope === 'global') {
    const hasQuestions = await GlobalTriviaQuestion.exists({
      status: { $in: PUBLISHED_STATUSES },
      moderationStatus: 'approved',
      $and: [
        { $or: [{ category: { $in: GLOBAL_CATEGORIES } }, { subjectKey: { $in: GLOBAL_CATEGORIES } }] },
        { $or: [{ ageBand }, { gradeKey: ageBand }] },
      ],
    });
    return hasQuestions ? [...GLOBAL_CATEGORIES] : [];
  }
  const courses = await CampusCourse.find({
    schoolId,
    status: 'active',
    courseType: 'subject',
    $or: [
      { studentGradeKey: gradeKey },
      { gradeLevel: gradeKey },
    ],
  }).select('subject title').lean();
  const actualSubjects = [...new Set(courses
    .map((course) => normalizeText(course.subject || course.title))
    .filter(Boolean))];
  if (!actualSubjects.length) {
    return [];
  }
  const publishedSubjects = await TriviaQuestion.distinct('subjectKey', {
    schoolId,
    gradeKey,
    subjectKey: { $in: actualSubjects },
    status: { $in: PUBLISHED_STATUSES },
  });
  return actualSubjects.filter((subject) => publishedSubjects.includes(subject));
}

async function chooseQuestion({ scope, schoolId, match }) {
  const { Question } = modelsForScope(scope);
  const query = {
    status: { $in: PUBLISHED_STATUSES },
  };
  if (scope === 'global') {
    query.moderationStatus = 'approved';
    query.difficulty = { $in: ['medium', 'hard'] };
    query.$and = [
      { $or: [{ category: { $in: GLOBAL_CATEGORIES } }, { subjectKey: { $in: GLOBAL_CATEGORIES } }] },
      { $or: [{ ageBand: match.ageBand }, { gradeKey: match.ageBand }] },
    ];
  } else {
    query.schoolId = schoolId;
    query.gradeKey = match.gradeKey;
    query.subjectKey = { $in: match.rouletteCategories || [] };
  }
  let questions = await Question.find(query).select('+correctAnswer').limit(2500).lean();
  if (scope === 'global' && !questions.length) {
    const fallbackQuery = { ...query };
    delete fallbackQuery.difficulty;
    questions = await Question.find(fallbackQuery).select('+correctAnswer').limit(2500).lean();
  }
  const selection = selectRouletteQuestion({
    questions,
    categories: match.rouletteCategories || [],
    usedQuestionIds: match.usedQuestionIds || [],
    scope,
  });
  if (!selection) {
    throw new TriviaError('No hay más preguntas disponibles para esta partida.', 409);
  }
  return selection;
}

function requireCurrentTurn(match, identity, turnToken, version, phase) {
  const current = match.participants?.[match.currentTurnIndex];
  if (!current || current.schoolId !== identity.schoolId || current.studentId !== identity.studentId) {
    throw new TriviaError('No es tu turno.', 403);
  }
  if (match.phase !== phase) {
    throw new TriviaError(phase === 'await_spin' ? 'El giro ya fue realizado.' : 'No hay una pregunta pendiente.', 409);
  }
  if (match.turnToken !== normalizeText(turnToken) || Number(match.version) !== Number(version)) {
    throw new TriviaError('El turno cambió. Actualiza la partida.', 409);
  }
}

async function spin({ scope: rawScope, matchId, turnToken, version, ...context }) {
  const scope = normalizeScope(rawScope);
  const identity = await requireStudent(context);
  const { Match } = modelsForScope(scope);
  const match = await requireActiveMatch(
    await inScope(scope, identity.schoolId, () => loadViewerMatch({ scope, matchId, identity })),
    scope
  );
  requireCurrentTurn(match, identity, turnToken, version, 'await_spin');
  const selection = await inScope(scope, identity.schoolId, () => chooseQuestion({
    scope,
    schoolId: match.schoolId,
    match,
  }));
  const { question, category } = selection;
  const snapshot = {
    questionId: String(question._id),
    prompt: question.prompt,
    options: question.options,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation || '',
    subjectKey: question.subjectKey || '',
    gradeKey: question.gradeKey || '',
    category,
    ageBand: questionAgeBand(question),
  };
  const updated = await inScope(scope, identity.schoolId, () => Match.findOneAndUpdate(
    {
      _id: match._id,
      status: 'active',
      phase: 'await_spin',
      currentTurnIndex: match.currentTurnIndex,
      turnToken: normalizeText(turnToken),
      version: Number(version),
    },
    {
      $set: { selectedCategory: category, activeQuestion: snapshot, phase: 'await_answer' },
      $push: { usedQuestionIds: String(question._id) },
      $inc: { version: 1 },
    },
    { new: true }
  ));
  if (!updated) {
    throw new TriviaError('El turno cambió. Actualiza la partida.', 409);
  }
  return serializeMatch(updated, identity);
}

async function updateProfilesAfterAnswer(scope, match, current, correct, didFinish) {
  const { Profile } = modelsForScope(scope);
  await inScope(scope, match.schoolId, async () => {
    await Profile.updateOne(
      { schoolId: current.schoolId, studentId: current.studentId },
      { $inc: { answers: 1, correctAnswers: correct ? 1 : 0 } }
    );
    if (!didFinish) {
      return;
    }
    for (const participant of match.participants) {
      await Profile.updateOne(
        { schoolId: participant.schoolId, studentId: participant.studentId },
        {
          $inc: {
            gamesPlayed: 1,
            wins: match.winnerTeamIndexes.includes(participant.teamIndex) ? 1 : 0,
          },
        }
      );
    }
  });
}

function sameParticipant(left, right) {
  return Boolean(
    left
    && right
    && left.schoolId === right.schoolId
    && left.studentId === right.studentId
  );
}

async function notifyCurrentTurn(match) {
  const next = match.participants?.[match.currentTurnIndex];
  if (!next || match.status !== 'active') {
    return;
  }
  await safeNotify(
    next,
    'Es tu turno en Comergio Trivia',
    'Tu rival terminó su turno. Gira la ruleta y responde.',
    {
      type: 'trivia.turn',
      scope: match.scope,
      matchId: String(match._id),
      turnToken: match.turnToken,
      url: `/student/juegos?game=trivia&scope=${encodeURIComponent(match.scope)}&matchId=${encodeURIComponent(String(match._id))}`,
    }
  );
}

async function notifyMatchFinished(match, { except = null, winnerName = '' } = {}) {
  const winnerLabel = winnerName || 'Un jugador';
  await Promise.all((match.participants || [])
    .filter((participant) => !sameParticipant(participant, except))
    .map((participant) => safeNotify(
      participant,
      'Partida de Trivia finalizada',
      `${winnerLabel} ganó la partida de Comergio Trivia.`,
      {
        type: 'trivia.finished',
        scope: match.scope,
        matchId: String(match._id),
        url: `/student/juegos?game=trivia&scope=${encodeURIComponent(match.scope)}&matchId=${encodeURIComponent(String(match._id))}`,
      }
    )));
}

async function sendAnswerNotifications(match, current, {
  didFinish,
  keepsTurn,
} = {}) {
  if (didFinish) {
    await notifyMatchFinished(match, {
      except: current,
      winnerName: current?.displayName || 'Tu rival',
    });
    return;
  }
  if (keepsTurn) {
    return;
  }
  await notifyCurrentTurn(match);
}

async function answer({ scope: rawScope, matchId, turnToken, version, answerKey, ...context }) {
  const scope = normalizeScope(rawScope);
  const identity = await requireStudent(context);
  const { Match } = modelsForScope(scope);
  const normalizedAnswer = normalizeText(answerKey).toUpperCase();
  const timedOut = normalizedAnswer === 'TIMEOUT';
  if (!timedOut && !ANSWER_KEYS.includes(normalizedAnswer)) {
    throw new TriviaError('La respuesta debe ser A, B, C o D.', 400);
  }
  const match = await requireActiveMatch(
    await inScope(scope, identity.schoolId, () => loadViewerMatch({ scope, matchId, identity })),
    scope
  );
  requireCurrentTurn(match, identity, turnToken, version, 'await_answer');

  const current = match.participants[match.currentTurnIndex];
  const team = match.teams.find((item) => item.index === current.teamIndex);
  const correct = !timedOut && normalizedAnswer === match.activeQuestion.correctAnswer;
  const positionBefore = Number(team.position || 0);
  const progress = resolveAnswerProgress({
    positionBefore,
    correct,
    previousStreak: current.correctStreak,
  });
  team.position = progress.positionAfter;
  current.answers = Number(current.answers || 0) + 1;
  current.correctAnswers = Number(current.correctAnswers || 0) + (correct ? 1 : 0);
  current.correctStreak = progress.persistedStreak;
  const didFinish = progress.didFinish;
  const nextTurnIndex = didFinish || progress.keepsTurn
    ? match.currentTurnIndex
    : (match.currentTurnIndex + 1) % match.participants.length;
  if (!progress.keepsTurn && !didFinish) {
    const nextPlayer = match.participants[nextTurnIndex];
    if (nextPlayer) {
      nextPlayer.correctStreak = 0;
    }
  }
  const history = [...(match.history || []).map((item) => (
    typeof item.toObject === 'function' ? item.toObject() : item
  )), {
    turn: match.turnNumber,
    studentId: current.studentId,
    teamIndex: current.teamIndex,
    category: match.selectedCategory || match.activeQuestion.category,
    questionId: match.activeQuestion.questionId,
    answerKey: normalizedAnswer,
    correct,
    positionBefore,
    positionAfter: progress.positionAfter,
    streak: progress.displayedStreak,
    answeredAt: new Date(),
  }];
  const nextToken = createToken();
  const update = {
    participants: match.participants,
    teams: match.teams,
    history,
    currentTurnIndex: nextTurnIndex,
    turnNumber: didFinish ? match.turnNumber : match.turnNumber + 1,
    turnToken: nextToken,
    selectedCategory: '',
    activeQuestion: null,
    phase: didFinish ? 'finished' : 'await_spin',
    status: didFinish ? 'finished' : 'active',
    winnerTeamIndexes: didFinish ? [current.teamIndex] : [],
    finishReason: didFinish ? 'completed' : '',
    turnExpiresAt: didFinish ? match.turnExpiresAt || nextTurnDeadline() : nextTurnDeadline(),
    finishedAt: didFinish ? new Date() : null,
  };
  const updated = await inScope(scope, identity.schoolId, () => Match.findOneAndUpdate(
    {
      _id: match._id,
      status: 'active',
      phase: 'await_answer',
      currentTurnIndex: match.currentTurnIndex,
      turnToken: normalizeText(turnToken),
      version: Number(version),
      'activeQuestion.questionId': match.activeQuestion.questionId,
    },
    { $set: update, $inc: { version: 1 } },
    { new: true }
  ));
  if (!updated) {
    throw new TriviaError('La respuesta ya fue procesada o el turno cambió.', 409);
  }

  await updateProfilesAfterAnswer(scope, updated, current, correct, didFinish);
  await sendAnswerNotifications(updated, current, {
    didFinish,
    keepsTurn: progress.keepsTurn,
  });
  return {
    match: serializeMatch(updated, identity),
    result: {
      correct,
      correctAnswer: match.activeQuestion.correctAnswer,
      explanation: match.activeQuestion.explanation || '',
      positionBefore,
      positionAfter: progress.positionAfter,
      streak: progress.displayedStreak,
      streakNeeded: progress.streakNeeded,
      stationsAdvanced: progress.stationsAdvanced,
      keepsTurn: progress.keepsTurn,
    },
  };
}

async function abandonMatch() {
  throw new TriviaError('Las partidas no se pueden abandonar. Si un rival no juega en 3 días, pierde automáticamente.', 409);
}

async function blockGlobalProfile({
  targetSchoolId,
  targetStudentId,
  blocked = true,
  ...context
}) {
  const identity = await requireStudent(context);
  const viewerProfile = await ensureProfile('global', identity);
  const normalizedSchoolId = normalizeText(targetSchoolId);
  const normalizedStudentId = normalizeText(targetStudentId);
  const targetProfile = await runInControlDb(() => GlobalTriviaProfile.findOne({
    schoolId: normalizedSchoolId,
    studentId: normalizedStudentId,
    status: 'active',
  }).select('_id'));
  if (!targetProfile) {
    throw new TriviaError('Perfil global no encontrado.', 404);
  }
  if (String(targetProfile._id) === String(viewerProfile._id)) {
    throw new TriviaError('No puedes bloquear tu propio perfil.', 400);
  }
  await runInControlDb(() => GlobalTriviaProfile.updateOne(
    { _id: viewerProfile._id, status: 'active' },
    blocked
      ? { $addToSet: { blockedProfileIds: targetProfile._id } }
      : { $pull: { blockedProfileIds: targetProfile._id } }
  ));
  return { ok: true, blocked: Boolean(blocked) };
}

async function reportGlobalProfile({
  targetSchoolId,
  targetStudentId,
  reason,
  details = '',
  ...context
}) {
  const identity = await requireStudent(context);
  const reporterProfile = await ensureProfile('global', identity);
  const normalizedReason = normalizeText(reason).toLowerCase();
  if (!SAFETY_REASONS.has(normalizedReason)) {
    throw new TriviaError('Motivo de reporte no válido.', 400);
  }
  return runInControlDb(async () => {
    const targetProfile = await GlobalTriviaProfile.findOne({
      schoolId: normalizeText(targetSchoolId),
      studentId: normalizeText(targetStudentId),
    }).select('_id displayName schoolName status');
    if (!targetProfile) {
      throw new TriviaError('Perfil global no encontrado.', 404);
    }
    if (String(targetProfile._id) === String(reporterProfile._id)) {
      throw new TriviaError('No puedes reportar tu propio perfil.', 400);
    }
    await TriviaSafetyReport.findOneAndUpdate(
      {
        reporterProfileId: reporterProfile._id,
        targetModel: 'TriviaNetworkProfile',
        targetId: targetProfile._id,
        status: 'open',
      },
      {
        $setOnInsert: {
          reporterProfileId: reporterProfile._id,
          reporterSchoolId: identity.schoolId,
          reporterStudentId: identity.studentId,
          targetType: 'profile',
          targetModel: 'TriviaNetworkProfile',
          targetId: targetProfile._id,
          reason: normalizedReason,
          details: normalizeText(details).slice(0, 1000),
          contextSnapshot: {
            displayName: targetProfile.displayName,
            schoolName: targetProfile.schoolName,
            status: targetProfile.status,
          },
          status: 'open',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { ok: true };
  });
}

async function listSafetyReports({ status = 'open' } = {}) {
  const normalizedStatus = normalizeText(status || 'open').toLowerCase();
  if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(normalizedStatus)) {
    throw new TriviaError('Estado de reporte no válido.', 400);
  }
  return runInControlDb(async () => {
    const reports = await TriviaSafetyReport.find({ status: normalizedStatus })
      .select('+contextSnapshot')
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();
    return reports.map((report) => ({
      id: String(report._id),
      targetType: report.targetType,
      targetId: String(report.targetId),
      reason: report.reason,
      details: report.details || '',
      status: report.status,
      context: report.contextSnapshot || null,
      createdAt: report.createdAt,
    }));
  });
}

async function moderateSafetyReport({
  userId,
  reportId,
  status,
  note = '',
  action = 'none',
}) {
  if (!isValidObjectId(reportId)
    || !['resolved', 'dismissed'].includes(status)
    || !['none', 'warning', 'profile_disabled'].includes(action)) {
    throw new TriviaError('Resolución de reporte no válida.', 400);
  }
  return runInControlDb(async () => {
    const report = await TriviaSafetyReport.findById(reportId);
    if (!report) {
      throw new TriviaError('Reporte no encontrado.', 404);
    }
    if (action === 'profile_disabled' && report.targetModel === 'TriviaNetworkProfile') {
      await GlobalTriviaProfile.updateOne(
        { _id: report.targetId },
        {
          $set: {
            status: 'disabled',
            disabledAt: new Date(),
            disabledByUserId: userId,
            disabledReason: normalizeText(note).slice(0, 500),
          },
        }
      );
    }
    report.status = status;
    report.resolution = {
      action,
      note: normalizeText(note).slice(0, 1000),
      resolvedByUserId: userId,
      resolvedAt: new Date(),
    };
    await report.save();
    return { ok: true };
  });
}

async function reportGlobalQuestion({ questionId, reason, ...context }) {
  const identity = await requireStudent(context);
  const normalizedReason = normalizeText(reason).slice(0, 500);
  if (!isValidObjectId(questionId) || !normalizedReason) {
    throw new TriviaError('Pregunta y motivo son obligatorios.', 400);
  }
  return runInControlDb(async () => {
    const question = await GlobalTriviaQuestion.findOne({
      _id: questionId,
      status: { $in: PUBLISHED_STATUSES },
      moderationStatus: 'approved',
    });
    if (!question) {
      throw new TriviaError('Pregunta global no encontrada.', 404);
    }
    const duplicate = question.reports.some((report) => (
      report.schoolId === identity.schoolId
      && report.studentId === identity.studentId
      && report.status === 'open'
    ));
    if (!duplicate) {
      question.reports.push({
        schoolId: identity.schoolId,
        studentId: identity.studentId,
        userId: identity.userId,
        reason: normalizedReason,
      });
      await question.save();
    }
    return { ok: true };
  });
}

async function listGlobalReports() {
  return runInControlDb(async () => {
    const questions = await GlobalTriviaQuestion.find({ 'reports.status': 'open' })
      .select('prompt subjectKey gradeKey category ageBand moderationStatus reports')
      .sort({ updatedAt: -1 })
      .lean();
    return questions.flatMap((question) => question.reports
      .filter((report) => report.status === 'open')
      .map((report) => ({
        id: String(report._id),
        questionId: String(question._id),
        prompt: question.prompt,
        subjectKey: question.subjectKey,
        gradeKey: question.gradeKey,
        category: question.category || question.subjectKey,
        ageBand: question.ageBand || question.gradeKey,
        moderationStatus: question.moderationStatus,
        schoolId: report.schoolId,
        studentId: report.studentId,
        reason: report.reason,
        reportedAt: report.reportedAt,
      })));
  });
}

async function moderateGlobalReport({ userId, reportId, status, resolutionNote = '', hideQuestion = false }) {
  if (!isValidObjectId(reportId) || !['resolved', 'dismissed'].includes(status)) {
    throw new TriviaError('Resolución de reporte no válida.', 400);
  }
  return runInControlDb(async () => {
    const question = await GlobalTriviaQuestion.findOne({ 'reports._id': reportId });
    if (!question) {
      throw new TriviaError('Reporte no encontrado.', 404);
    }
    const report = question.reports.id(reportId);
    report.status = status;
    report.resolutionNote = normalizeText(resolutionNote).slice(0, 500);
    report.resolvedByUserId = userId;
    report.resolvedAt = new Date();
    if (hideQuestion) {
      question.moderationStatus = 'hidden';
    }
    await question.save();
    return { ok: true };
  });
}

module.exports = {
  TriviaError,
  getProfile,
  updateProfile,
  listTeacherOptions,
  listTeacherQuestions,
  createTeacherQuestion,
  updateTeacherQuestion,
  deleteTeacherQuestion,
  listGlobalQuestions,
  createGlobalQuestion,
  updateGlobalQuestion,
  deleteGlobalQuestion,
  joinCandidateQueue,
  getCandidateStatus,
  listEligibleCandidates,
  cancelCandidate,
  listStudentRouletteOptions,
  createInvitation,
  listInvitations,
  respondInvitation,
  listMatches,
  getMatch,
  spin,
  answer,
  abandonMatch,
  expireOverdueMatches,
  blockGlobalProfile,
  reportGlobalProfile,
  reportGlobalQuestion,
  listGlobalReports,
  listSafetyReports,
  moderateGlobalReport,
  moderateSafetyReport,
  _test: {
    buildParticipants,
    calculatePosition,
    resolveAnswerProgress,
    resolveTurnDeadline,
    winnersAfterTurnForfeit,
    resolveStartingTurnIndex,
    resolveAgeBand,
    serializeMatch,
    selectRouletteQuestion,
    filterSelectedCategories,
  },
};
