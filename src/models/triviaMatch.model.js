const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const participantSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, trim: true },
    studentId: { type: String, required: true, trim: true },
    userId: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    avatarUrl: { type: String, trim: true, default: '', maxlength: 2000 },
    schoolName: { type: String, trim: true, default: '', maxlength: 180 },
    ageBand: { type: String, enum: ['', '6-8', '9-11', '12-14', '15-17'], default: '' },
    teamIndex: { type: Number, required: true, min: 0, max: 3 },
    answers: { type: Number, default: 0, min: 0 },
    correctAnswers: { type: Number, default: 0, min: 0 },
    correctStreak: { type: Number, default: 0, min: 0, max: 3 },
  },
  { _id: false }
);

const teamSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true, min: 0, max: 3 },
    position: { type: Number, default: 0, min: 0, max: 10 },
  },
  { _id: false }
);

const activeQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true, trim: true },
    prompt: { type: String, required: true, trim: true },
    options: {
      type: [{
        key: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
        text: { type: String, required: true, trim: true },
      }],
      required: true,
    },
    correctAnswer: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
    explanation: { type: String, trim: true, default: '' },
    subjectKey: { type: String, trim: true, default: '' },
    gradeKey: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: '' },
    ageBand: { type: String, enum: ['', '6-8', '9-11', '12-14', '15-17'], default: '' },
  },
  { _id: false }
);

const turnHistorySchema = new mongoose.Schema(
  {
    turn: { type: Number, required: true, min: 1 },
    studentId: { type: String, required: true, trim: true },
    teamIndex: { type: Number, required: true },
    category: { type: String, required: true, trim: true },
    questionId: { type: String, required: true, trim: true },
    answerKey: { type: String, enum: ['A', 'B', 'C', 'D', 'TIMEOUT'], required: true },
    correct: { type: Boolean, required: true },
    positionBefore: { type: Number, required: true },
    positionAfter: { type: Number, required: true },
    streak: { type: Number, default: 0, min: 0, max: 3 },
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const matchFields = {
  schoolId: { type: String, required: true, trim: true, index: true },
  scope: { type: String, enum: ['institutional', 'global'], required: true, index: true },
  mode: { type: String, enum: ['1v1', 'ffa3', 'ffa4', '2v2'], required: true, index: true },
  source: { type: String, enum: ['matchmaking', 'invitation'], required: true },
  subjectKey: { type: String, trim: true, default: '', index: true },
  gradeKey: { type: String, trim: true, default: '', index: true },
  ageBand: { type: String, enum: ['', '6-8', '9-11', '12-14', '15-17'], default: '', index: true },
  rouletteCategories: { type: [String], default: [] },
  selectedCategory: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['active', 'finished', 'cancelled'], default: 'active', index: true },
  phase: { type: String, enum: ['await_spin', 'await_answer', 'finished'], default: 'await_spin' },
  participants: { type: [participantSchema], required: true },
  teams: { type: [teamSchema], required: true },
  currentTurnIndex: { type: Number, default: 0, min: 0, max: 3 },
  turnNumber: { type: Number, default: 1, min: 1 },
  turnToken: { type: String, required: true, trim: true },
  version: { type: Number, default: 0, min: 0 },
  activeQuestion: { type: activeQuestionSchema, default: null },
  usedQuestionIds: { type: [String], default: [] },
  history: { type: [turnHistorySchema], default: [] },
  winnerTeamIndexes: { type: [Number], default: [] },
  finishReason: { type: String, enum: ['', 'completed', 'turn_expired'], default: '' },
  turnExpiresAt: { type: Date, default: null, index: true },
  finishedAt: { type: Date, default: null },
};

function buildSchema() {
  const schema = new mongoose.Schema(matchFields, {
    timestamps: true,
    optimisticConcurrency: true,
    versionKey: 'version',
  });
  schema.index(
    { 'participants.schoolId': 1, 'participants.studentId': 1, status: 1, updatedAt: -1 },
    { name: 'trivia_match_player_status' }
  );
  schema.index(
    { status: 1, phase: 1, updatedAt: -1 },
    { name: 'trivia_match_active_turns' }
  );
  schema.index(
    { status: 1, turnExpiresAt: 1 },
    { name: 'trivia_match_turn_expiry' }
  );
  return schema;
}

const TriviaInstitutionalMatch = registerSchoolScopedModel(
  'TriviaInstitutionalMatch',
  buildSchema()
);
const TriviaGlobalMatch = mongoose.models.TriviaGlobalMatch
  || mongoose.model('TriviaGlobalMatch', buildSchema());

module.exports = {
  TriviaInstitutionalMatch,
  TriviaGlobalMatch,
  // Compatibility aliases for the service while its API layer is migrated.
  TriviaMatch: TriviaInstitutionalMatch,
  GlobalTriviaMatch: TriviaGlobalMatch,
};
