export const TRIVIA_CATEGORIES = ['Historia', 'Ciencia', 'Cultura', 'Arte', 'Deportes'];
export const TRIVIA_AGE_BANDS = ['6-8', '9-11', '12-14', '15-17'];
export const TRIVIA_DIFFICULTIES = [
  { value: 'easy', label: 'Fácil' },
  { value: 'medium', label: 'Media' },
  { value: 'hard', label: 'Difícil' },
];
export const TRIVIA_STATUSES = [
  { value: 'draft', label: 'Borrador' },
  { value: 'published', label: 'Publicada' },
];

const answerText = (answer) => (
  typeof answer === 'string' ? answer : answer?.text || ''
);

const correctIndexFrom = (question) => {
  if (Number.isInteger(question?.correctAnswerIndex)) {
    return question.correctAnswerIndex;
  }
  const found = (question?.answers || []).findIndex((answer) => (
    typeof answer === 'object' && (answer.isCorrect || answer.correct)
  ));
  return found >= 0 ? found : 0;
};

export function getEntityId(entity) {
  return entity?.id || entity?._id || '';
}

export function normalizeCollection(response, key) {
  if (Array.isArray(response)) return response;
  return Array.isArray(response?.[key]) ? response[key] : [];
}

export function normalizeOptions(response) {
  const mapOption = (option) => ({
    id: String(option?.id || option?._id || option?.value || ''),
    label: option?.name || option?.label || option?.title || '',
    subjectId: String(option?.subjectId || option?.subjectKey || ''),
    subjectIds: Array.isArray(option?.subjectIds)
      ? option.subjectIds.map((item) => String(item)).filter(Boolean)
      : [],
  });
  const seen = new Set();
  const grades = [];
  normalizeCollection(response, 'grades').map(mapOption).filter((item) => item.id && item.label).forEach((grade) => {
    if (seen.has(grade.id)) {
      const existing = grades.find((item) => item.id === grade.id);
      grade.subjectIds.forEach((subjectId) => {
        if (existing && !existing.subjectIds.includes(subjectId)) {
          existing.subjectIds.push(subjectId);
        }
      });
      return;
    }
    seen.add(grade.id);
    grades.push(grade);
  });
  grades.sort((left, right) => String(left.label).localeCompare(right.label, 'es', { numeric: true, sensitivity: 'base' }));
  return {
    subjects: normalizeCollection(response, 'subjects').map(mapOption).filter((item) => item.id && item.label),
    grades,
    assignments: Array.isArray(response?.assignments) ? response.assignments : [],
  };
}

export function createTeacherDraft(options = {}) {
  const firstSubjectId = options.subjects?.[0]?.id || '';
  const firstGrade = options.grades?.find((grade) => !grade.subjectId || grade.subjectId === firstSubjectId)
    || options.grades?.[0];
  return {
    id: '',
    prompt: '',
    answers: ['', '', '', ''],
    correctAnswerIndex: 0,
    subjectId: firstSubjectId,
    gradeId: firstGrade?.id || '',
    status: 'draft',
  };
}

export function teacherDraftFrom(question, options = {}) {
  const answers = (question?.answers || []).slice(0, 4).map(answerText);
  const incomingSubjectId = String(question?.subjectId || question?.subject?.id || question?.subject?._id || '');
  const incomingGradeId = String(question?.gradeId || question?.grade?.id || question?.grade?._id || '');
  while (answers.length < 4) answers.push('');
  return {
    ...createTeacherDraft(options),
    id: getEntityId(question),
    prompt: question?.prompt || question?.question || '',
    answers,
    correctAnswerIndex: correctIndexFrom(question),
    subjectId: options.subjects?.some((item) => String(item.id) === incomingSubjectId) ? incomingSubjectId : '',
    gradeId: options.grades?.some((item) => String(item.id) === incomingGradeId) ? incomingGradeId : '',
    courseId: question?.courseId || '',
    status: question?.status === 'published' ? 'published' : 'draft',
  };
}

export function createAdminDraft() {
  return {
    id: '',
    prompt: '',
    answers: ['', '', '', ''],
    correctAnswerIndex: 0,
    category: TRIVIA_CATEGORIES[0],
    ageBand: TRIVIA_AGE_BANDS[0],
    difficulty: TRIVIA_DIFFICULTIES[0].value,
    status: 'draft',
  };
}

export function adminDraftFrom(question) {
  const answers = (question?.answers || []).slice(0, 4).map(answerText);
  while (answers.length < 4) answers.push('');
  return {
    ...createAdminDraft(),
    id: getEntityId(question),
    prompt: question?.prompt || question?.question || '',
    answers,
    correctAnswerIndex: correctIndexFrom(question),
    category: question?.category || TRIVIA_CATEGORIES[0],
    ageBand: question?.ageBand || TRIVIA_AGE_BANDS[0],
    difficulty: question?.difficulty || 'easy',
    status: question?.status === 'published' ? 'published' : 'draft',
  };
}

export function validateTriviaDraft(draft, { teacher = false } = {}) {
  const errors = [];
  if (!draft.prompt.trim()) errors.push('Escribe el enunciado de la pregunta.');
  if (draft.answers.length !== 4 || draft.answers.some((answer) => !answer.trim())) {
    errors.push('Completa exactamente las cuatro respuestas.');
  }
  if (!Number.isInteger(draft.correctAnswerIndex) || draft.correctAnswerIndex < 0 || draft.correctAnswerIndex > 3) {
    errors.push('Selecciona una única respuesta correcta.');
  }
  if (teacher && (!draft.subjectId || !draft.gradeId)) {
    errors.push('Selecciona una asignatura y un grado asignados.');
  }
  return errors;
}

export function resolveTeacherCourseId(assignments = [], subjectId = '', gradeKey = '', fallbackCourseId = '') {
  const matchesSubjectAndGrade = assignments.find((assignment) => (
    assignment.subjectId === subjectId && assignment.gradeKey === gradeKey
  ));
  if (matchesSubjectAndGrade?.courseId) {
    return matchesSubjectAndGrade.courseId;
  }
  const matchesGrade = assignments.find((assignment) => assignment.gradeKey === gradeKey);
  return matchesGrade?.courseId || fallbackCourseId || '';
}

export function triviaPayloadFrom(draft, extra = {}) {
  return {
    prompt: draft.prompt.trim(),
    answers: draft.answers.map((text, index) => ({
      text: text.trim(),
      isCorrect: index === draft.correctAnswerIndex,
    })),
    correctAnswerIndex: draft.correctAnswerIndex,
    ...extra,
  };
}

export function getErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

export function getOptionLabel(options, id, fallback = 'Sin asignar') {
  return options.find((option) => String(option.id) === String(id))?.label || fallback;
}

export function formatTriviaDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
