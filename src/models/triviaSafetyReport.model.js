const { mongoose } = require('./_schoolModelRegistry');

const TARGET_MODELS = [
  'TriviaNetworkProfile',
  'TriviaGlobalQuestion',
  'TriviaGlobalMatch',
];

const triviaSafetyReportSchema = new mongoose.Schema(
  {
    reporterProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TriviaNetworkProfile',
      required: true,
      index: true,
    },
    reporterSchoolId: { type: String, required: true, trim: true },
    reporterStudentId: { type: String, required: true, trim: true },
    targetType: {
      type: String,
      enum: ['profile', 'question', 'match'],
      required: true,
    },
    targetModel: {
      type: String,
      enum: TARGET_MODELS,
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'targetModel',
      required: true,
    },
    reason: {
      type: String,
      enum: [
        'harassment',
        'inappropriate_name',
        'inappropriate_avatar',
        'cheating',
        'incorrect_question',
        'unsafe_content',
        'other',
      ],
      required: true,
    },
    details: { type: String, trim: true, maxlength: 1000, default: '' },
    contextSnapshot: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved', 'dismissed'],
      default: 'open',
      index: true,
    },
    resolution: {
      action: {
        type: String,
        enum: ['', 'none', 'warning', 'content_hidden', 'profile_disabled'],
        default: '',
      },
      note: { type: String, trim: true, maxlength: 1000, default: '' },
      resolvedByUserId: { type: String, trim: true, default: '' },
      resolvedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

triviaSafetyReportSchema.index(
  { status: 1, createdAt: 1 },
  { name: 'trivia_safety_report_moderation_queue' }
);
triviaSafetyReportSchema.index(
  { targetModel: 1, targetId: 1, status: 1, createdAt: -1 },
  { name: 'trivia_safety_report_target_history' }
);
triviaSafetyReportSchema.index(
  { reporterProfileId: 1, targetModel: 1, targetId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'open' },
    name: 'trivia_safety_report_open_unique',
  }
);

module.exports = mongoose.models.TriviaSafetyReport
  || mongoose.model('TriviaSafetyReport', triviaSafetyReportSchema);
