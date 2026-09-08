const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const arenaAnswerSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    text: { type: String, default: '', trim: true, maxlength: 280 },
    correct: { type: Boolean, default: false },
    correctOrder: { type: Number, default: 0, min: 0, max: 8 },
  },
  { _id: true }
);

const arenaQuestionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    type: { type: String, enum: ['quiz', 'true_false', 'puzzle'], required: true },
    prompt: { type: String, default: '', trim: true, maxlength: 500 },
    imageUrl: { type: String, default: '', trim: true, maxlength: 2000 },
    timeLimitSec: { type: Number, default: 20, min: 5, max: 240 },
    points: { type: Number, default: 1000, enum: [0, 1000, 2000] },
    selectionMode: { type: String, enum: ['single', 'multiple'], default: 'single' },
    answers: { type: [arenaAnswerSchema], default: [] },
  },
  { _id: true }
);

const arenaQuizSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusCourse', default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    questions: { type: [arenaQuestionSchema], default: [] },
  },
  { timestamps: true }
);

arenaQuizSchema.index({ schoolId: 1, teacherUserId: 1, updatedAt: -1 });

module.exports = registerSchoolScopedModel('ArenaQuiz', arenaQuizSchema);
