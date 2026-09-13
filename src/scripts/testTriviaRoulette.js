const assert = require('assert');

const { _test } = require('../services/trivia.service');

assert.strictEqual(_test.calculatePosition(4, true), 5, 'position helper still advances one station');
assert.strictEqual(_test.calculatePosition(4, false), 4, 'a wrong answer stays in place');
assert.strictEqual(_test.calculatePosition(10, true), 10, 'position is capped at station 10');

const firstCorrect = _test.resolveAnswerProgress({ positionBefore: 4, correct: true, previousStreak: 0 });
assert.strictEqual(firstCorrect.positionAfter, 4, 'one correct answer does not advance yet');
assert.strictEqual(firstCorrect.keepsTurn, true, 'the player keeps the turn after the first correct');
assert.strictEqual(firstCorrect.persistedStreak, 1, 'the first correct starts a streak of 1');

const secondCorrect = _test.resolveAnswerProgress({ positionBefore: 4, correct: true, previousStreak: 1 });
assert.strictEqual(secondCorrect.keepsTurn, true, 'the player keeps the turn after the second correct');
assert.strictEqual(secondCorrect.persistedStreak, 2, 'the second correct builds a streak of 2');

const thirdCorrect = _test.resolveAnswerProgress({ positionBefore: 4, correct: true, previousStreak: 2 });
assert.strictEqual(thirdCorrect.positionAfter, 5, 'three correct answers in a row advance one station');
assert.strictEqual(thirdCorrect.keepsTurn, true, 'the player keeps the turn after advancing');
assert.strictEqual(thirdCorrect.persistedStreak, 0, 'the streak resets after advancing so the next station starts at 0');

const finished = _test.resolveAnswerProgress({ positionBefore: 9, correct: true, previousStreak: 2 });
assert.strictEqual(finished.positionAfter, 10, 'the last station can be reached with a completed streak');
assert.strictEqual(finished.didFinish, true, 'reaching station 10 finishes the match');
assert.strictEqual(finished.keepsTurn, false, 'the match ends when the board is finished');

const deadline = _test.resolveTurnDeadline({ updatedAt: new Date('2026-09-10T00:00:00.000Z') }, new Date('2026-09-10T00:00:00.000Z'));
assert.strictEqual(deadline.toISOString(), '2026-09-13T00:00:00.000Z', 'unanswered turns expire after 3 days');
assert.deepStrictEqual(
  _test.winnersAfterTurnForfeit({
    currentTurnIndex: 0,
    participants: [{ teamIndex: 0 }, { teamIndex: 1 }],
    teams: [{ index: 0, position: 2 }, { index: 1, position: 1 }],
  }),
  [1],
  'the player who does not answer loses and the rival wins'
);

const missed = _test.resolveAnswerProgress({ positionBefore: 4, correct: false, previousStreak: 2 });
assert.strictEqual(missed.positionAfter, 4, 'a wrong answer stays in place');
assert.strictEqual(missed.keepsTurn, false, 'a wrong answer loses the turn');
assert.strictEqual(missed.persistedStreak, 0, 'a wrong answer resets the streak');

const questions = [
  { _id: 'q-history', category: 'Historia' },
  { _id: 'q-science-used', category: 'Ciencia' },
  { _id: 'q-science-fresh', category: 'Ciencia' },
];
const deterministicFirst = () => 0;
const selection = _test.selectRouletteQuestion({
  questions,
  categories: ['Ciencia'],
  usedQuestionIds: ['q-science-used'],
  scope: 'global',
  randomInt: deterministicFirst,
});

assert.strictEqual(selection.category, 'Ciencia', 'roulette selects an eligible category');
assert.strictEqual(
  String(selection.question._id),
  'q-science-fresh',
  'roulette excludes previously used questions'
);

const unavailable = _test.selectRouletteQuestion({
  questions,
  categories: ['Arte'],
  usedQuestionIds: [],
  scope: 'global',
  randomInt: deterministicFirst,
});
assert.strictEqual(unavailable, null, 'roulette does not select a category without questions');

const recycled = _test.selectRouletteQuestion({
  questions,
  categories: ['Ciencia'],
  usedQuestionIds: ['q-science-used', 'q-science-fresh'],
  scope: 'global',
  randomInt: deterministicFirst,
});
assert.ok(recycled, 'roulette recycles the category when every question was already used');
assert.strictEqual(recycled.category, 'Ciencia', 'recycled spin stays in an available category');

const challengePool = [
  { _id: 'easy-art', category: 'Arte', difficulty: 'easy' },
  { _id: 'medium-art', category: 'Arte', difficulty: 'medium' },
  { _id: 'hard-art', category: 'Arte', difficulty: 'hard' },
];
const skipsEasy = _test.selectRouletteQuestion({
  questions: challengePool,
  categories: ['Arte'],
  usedQuestionIds: [],
  scope: 'global',
  randomInt: deterministicFirst,
});
assert.notStrictEqual(String(skipsEasy.question._id), 'easy-art', 'global roulette skips obvious easy questions');

const teamParticipants = _test.buildParticipants([
  { schoolId: 'school', studentId: 'one', userId: 'u1', displayName: 'One' },
  { schoolId: 'school', studentId: 'two', userId: 'u2', displayName: 'Two' },
  { schoolId: 'school', studentId: 'three', userId: 'u3', displayName: 'Three' },
  { schoolId: 'school', studentId: 'four', userId: 'u4', displayName: 'Four' },
], '2v2');
assert.deepStrictEqual(
  teamParticipants.map((participant) => participant.teamIndex),
  [0, 1, 0, 1],
  '2v2 alternates teammates in turn order'
);
assert.strictEqual(
  _test.resolveStartingTurnIndex(teamParticipants, { schoolId: 'school', studentId: 'two' }),
  1,
  'the player who accepts the challenge starts first'
);

const serialized = _test.serializeMatch({
  _id: 'match-1',
  scope: 'global',
  mode: '1v1',
  source: 'invitation',
  status: 'active',
  phase: 'await_answer',
  participants: [
    { schoolId: 'school-a', studentId: 'one', teamIndex: 0 },
    { schoolId: 'school-b', studentId: 'two', teamIndex: 1 },
  ],
  teams: [{ index: 0, position: 0 }, { index: 1, position: 0 }],
  currentTurnIndex: 1,
  turnNumber: 2,
  turnToken: 'token',
  version: 4,
  rouletteCategories: ['Ciencia'],
  activeQuestion: {
    questionId: 'question-1',
    prompt: 'Pregunta',
    options: [{ key: 'A', text: 'Respuesta' }],
    correctAnswer: 'A',
    category: 'Ciencia',
  },
}, { schoolId: 'school-b', studentId: 'two' });
assert.strictEqual(serialized.viewerIndex, 1, 'match identifies the requesting participant');
assert.strictEqual(serialized.participants[1].isYou, true, 'match marks the requesting participant');
assert.strictEqual(serialized.isYourTurn, true, 'match reports the active participant turn');
assert.strictEqual(
  Object.hasOwn(serialized.question, 'correctAnswer'),
  false,
  'active question does not expose the correct answer'
);

assert.deepStrictEqual(
  _test.filterSelectedCategories(['Historia', 'Ciencia', 'Arte'], ['Ciencia', 'Historia', 'Ciencia', 'Ingles']),
  ['Ciencia', 'Historia'],
  'institutional roulette keeps only the subjects the student picked'
);
assert.deepStrictEqual(
  _test.filterSelectedCategories(['Historia', 'Ciencia'], []),
  ['Historia', 'Ciencia'],
  'an empty selection keeps every published subject as fallback'
);

console.log('Trivia roulette checks passed.');
