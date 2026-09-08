const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const arenaPlayerAnswerSchema = new mongoose.Schema(
  {
    questionKey: { type: String, required: true, trim: true },
    selectedAnswerKeys: { type: [String], default: [] },
    orderedAnswerKeys: { type: [String], default: [] },
    correct: { type: Boolean, default: false },
    pointsEarned: { type: Number, default: 0, min: 0 },
    responseTimeMs: { type: Number, default: 0, min: 0 },
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const arenaPlayerSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ArenaSession', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    totalScore: { type: Number, default: 0, min: 0 },
    answers: { type: [arenaPlayerAnswerSchema], default: [] },
  },
  { timestamps: true }
);

arenaPlayerSchema.index({ schoolId: 1, sessionId: 1, studentId: 1 }, { unique: true });
arenaPlayerSchema.index({ schoolId: 1, sessionId: 1, totalScore: -1 });

module.exports = registerSchoolScopedModel('ArenaPlayer', arenaPlayerSchema);
