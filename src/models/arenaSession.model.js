const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const ARENA_SESSION_STATUSES = ['lobby', 'question', 'discuss', 'reveal', 'leaderboard', 'ended'];

const arenaSessionSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'ArenaQuiz', required: true, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pin: { type: String, required: true, trim: true, minlength: 6, maxlength: 6 },
    status: { type: String, enum: ARENA_SESSION_STATUSES, default: 'lobby', index: true },
    currentIndex: { type: Number, default: 0, min: 0 },
    questionStartedAt: { type: Date, default: null },
    questionEndedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

arenaSessionSchema.index(
  { schoolId: 1, pin: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: 'ended' } },
    name: 'arena_session_active_pin_unique',
  }
);
arenaSessionSchema.index({ schoolId: 1, createdByUserId: 1, status: 1, updatedAt: -1 });

module.exports = registerSchoolScopedModel('ArenaSession', arenaSessionSchema);

