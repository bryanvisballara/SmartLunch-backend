export function createArenaKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function createArenaAnswer(overrides = {}) {
  return {
    key: createArenaKey(),
    text: '',
    correct: false,
    correctOrder: 0,
    ...overrides,
  };
}

export function createArenaQuestion(type = 'quiz') {
  if (type === 'true_false') {
    return {
      key: createArenaKey(),
      type: 'true_false',
      prompt: '',
      imageUrl: '',
      timeLimitSec: 20,
      points: 1000,
      selectionMode: 'single',
      answers: [
        createArenaAnswer({ text: 'Verdadero', correct: true, correctOrder: 0 }),
        createArenaAnswer({ text: 'Falso', correct: false, correctOrder: 1 }),
      ],
    };
  }

  if (type === 'puzzle') {
    return {
      key: createArenaKey(),
      type: 'puzzle',
      prompt: '',
      imageUrl: '',
      timeLimitSec: 30,
      points: 1000,
      selectionMode: 'single',
      answers: [
        createArenaAnswer({ text: '', correctOrder: 0 }),
        createArenaAnswer({ text: '', correctOrder: 1 }),
        createArenaAnswer({ text: '', correctOrder: 2 }),
      ],
    };
  }

  return {
    key: createArenaKey(),
    type: 'quiz',
    prompt: '',
    imageUrl: '',
    timeLimitSec: 20,
    points: 1000,
    selectionMode: 'single',
    answers: [
      createArenaAnswer({ correct: true, correctOrder: 0 }),
      createArenaAnswer({ correctOrder: 1 }),
      createArenaAnswer({ correctOrder: 2 }),
      createArenaAnswer({ correctOrder: 3 }),
    ],
  };
}

export function createArenaDraft(overrides = {}) {
  return {
    id: '',
    title: '',
    courseId: '',
    questions: [createArenaQuestion('quiz')],
    ...overrides,
  };
}

export function duplicateArenaQuestion(question) {
  return {
    ...question,
    key: createArenaKey(),
    answers: (question.answers || []).map((answer, index) => ({
      ...answer,
      key: createArenaKey(),
      correctOrder: Number.isFinite(Number(answer.correctOrder)) ? Number(answer.correctOrder) : index,
    })),
  };
}

export function getArenaQuestionPlayError(question, index) {
  const label = `Pregunta ${index + 1}`;
  const prompt = String(question?.prompt || '').trim();
  const answers = Array.isArray(question?.answers) ? question.answers : [];
  const type = question?.type;

  if (!prompt) {
    return `${label}: falta el enunciado.`;
  }

  if (type === 'true_false') {
    if (answers.filter((answer) => answer.correct).length !== 1) {
      return `${label}: marca una sola respuesta correcta.`;
    }
    return '';
  }

  if (type === 'puzzle') {
    if (answers.length < 3 || answers.length > 4) {
      return `${label}: el puzzle debe tener 3 o 4 ítems.`;
    }
    if (answers.some((answer) => !String(answer.text || '').trim())) {
      return `${label}: cada ítem del puzzle necesita texto.`;
    }
    return '';
  }

  if (answers.length < 2 || answers.some((answer) => !String(answer.text || '').trim())) {
    return `${label}: completa al menos dos respuestas.`;
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

export function getArenaDraftPlayErrors(draft) {
  const errors = [];
  if (!String(draft?.title || '').trim()) {
    errors.push('El set necesita un título.');
  }
  const questions = Array.isArray(draft?.questions) ? draft.questions : [];
  if (!questions.length) {
    errors.push('Añade al menos una pregunta.');
  }
  questions.forEach((question, index) => {
    const error = getArenaQuestionPlayError(question, index);
    if (error) {
      errors.push(error);
    }
  });
  return errors;
}

export function formatArenaPin(pin) {
  const digits = String(pin || '').replace(/\D/g, '').slice(0, 6);
  if (digits.length !== 6) {
    return digits;
  }
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

export async function copyArenaPin(pin) {
  const digits = String(pin || '').replace(/\D/g, '').slice(0, 6);
  if (!digits) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(digits);
    return true;
  } catch (_error) {
    return false;
  }
}

export function formatArenaSavedAt(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getArenaRemainingMs(session) {
  if (session?.status !== 'question') {
    return 0;
  }
  const startedAt = session.questionStartedAt ? new Date(session.questionStartedAt).getTime() : 0;
  const limitMs = Math.max(5, Number(session.question?.timeLimitSec || 20)) * 1000;
  if (Number.isFinite(startedAt) && startedAt > 0) {
    return Math.max(0, startedAt + limitMs - Date.now());
  }
  return Math.max(0, Number(session.remainingMs || 0));
}

export function getArenaCorrectAnswers(question) {
  const answers = Array.isArray(question?.answers) ? question.answers : [];
  if (!answers.length) {
    return [];
  }

  if (question.type === 'puzzle') {
    const orderedKeys = Array.isArray(question.correctAnswerKeys) && question.correctAnswerKeys.length
      ? question.correctAnswerKeys
      : [...answers]
        .sort((left, right) => Number(left.correctOrder) - Number(right.correctOrder))
        .map((answer) => answer.key);
    return orderedKeys
      .map((key, index) => {
        const answer = answers.find((item) => item.key === key);
        return answer?.text ? { key, text: answer.text, order: index + 1 } : null;
      })
      .filter(Boolean);
  }

  const correctKeys = new Set(
    Array.isArray(question.correctAnswerKeys) && question.correctAnswerKeys.length
      ? question.correctAnswerKeys.map(String)
      : answers.filter((answer) => answer.correct).map((answer) => String(answer.key))
  );
  return answers
    .filter((answer) => correctKeys.has(String(answer.key)))
    .map((answer) => ({ key: answer.key, text: answer.text, order: 0 }))
    .filter((answer) => answer.text);
}

export const ARENA_TIMER_OPTIONS = [5, 10, 20, 30, 60, 90, 120, 180, 240];
export const ARENA_POINT_OPTIONS = [0, 1000, 2000];
export const ARENA_CHOICE_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
