const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const triviaOptionSchema = new mongoose.Schema(
  {
    key: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
    text: { type: String, required: true, trim: true, maxlength: 280 },
  },
  { _id: false }
);

const baseFields = {
  prompt: { type: String, required: true, trim: true, maxlength: 500 },
  options: {
    type: [triviaOptionSchema],
    required: true,
    validate: {
      validator: (options) => Array.isArray(options)
        && options.length === 4
        && new Set(options.map((option) => option.key)).size === 4,
      message: 'Trivia questions require four unique A-D options',
    },
  },
  correctAnswer: { type: String, enum: ['A', 'B', 'C', 'D'], required: true, select: false },
  subjectKey: { type: String, required: true, trim: true, index: true },
  subjectLabel: { type: String, trim: true, default: '' },
  gradeKey: { type: String, required: true, trim: true, index: true },
  gradeLabel: { type: String, trim: true, default: '' },
  category: { type: String, trim: true, default: '', index: true },
  ageBand: { type: String, enum: ['', '6-8', '9-11', '12-14', '15-17'], default: '', index: true },
  explanation: { type: String, trim: true, default: '', maxlength: 1000 },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium', index: true },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'active'],
    default: 'draft',
    index: true,
  },
};

const triviaQuestionSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, trim: true, index: true },
    teacherUserId: { type: String, required: true, trim: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusCourse', required: true, index: true },
    ...baseFields,
  },
  { timestamps: true }
);

triviaQuestionSchema.index(
  { schoolId: 1, gradeKey: 1, subjectKey: 1, status: 1, difficulty: 1 },
  { name: 'trivia_institutional_question_pool' }
);
triviaQuestionSchema.index({ schoolId: 1, teacherUserId: 1, updatedAt: -1 });

const globalTriviaReportSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, trim: true },
    studentId: { type: String, required: true, trim: true },
    userId: { type: String, required: true, trim: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
    resolutionNote: { type: String, trim: true, default: '', maxlength: 500 },
    resolvedByUserId: { type: String, trim: true, default: '' },
    reportedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
  },
  { _id: true }
);

const globalTriviaQuestionSchema = new mongoose.Schema(
  {
    ...baseFields,
    createdByUserId: { type: String, required: true, trim: true, index: true },
    moderationStatus: {
      type: String,
      enum: ['approved', 'hidden'],
      default: 'approved',
      index: true,
    },
    reports: { type: [globalTriviaReportSchema], default: [] },
  },
  { timestamps: true }
);

globalTriviaQuestionSchema.index(
  {
    ageBand: 1,
    category: 1,
    status: 1,
    moderationStatus: 1,
    difficulty: 1,
  },
  { name: 'trivia_global_question_pool' }
);
globalTriviaQuestionSchema.index(
  { status: 1, moderationStatus: 1, updatedAt: -1 },
  { name: 'trivia_global_question_admin' }
);

const TriviaInstitutionalQuestion = registerSchoolScopedModel(
  'TriviaInstitutionalQuestion',
  triviaQuestionSchema
);
const TriviaGlobalQuestion = mongoose.models.TriviaGlobalQuestion
  || mongoose.model('TriviaGlobalQuestion', globalTriviaQuestionSchema);

module.exports = {
  TriviaInstitutionalQuestion,
  TriviaGlobalQuestion,
  // Compatibility aliases for the service while its API layer is migrated.
  TriviaQuestion: TriviaInstitutionalQuestion,
  GlobalTriviaQuestion: TriviaGlobalQuestion,
};
