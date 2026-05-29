const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const psychologyCaseNoteSchema = new mongoose.Schema(
  {
    visibility: {
      type: String,
      enum: ['private', 'institutional', 'family', 'shared_all'],
      default: 'private',
      index: true,
    },
    content: { type: String, required: true, trim: true },
    recommendations: { type: String, trim: true, default: '' },
    notifyAudiences: [{ type: String, enum: ['teachers', 'coordination', 'leadership', 'parents'] }],
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const psychologyCaseSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    openedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    title: { type: String, required: true, trim: true },
    caseType: {
      type: String,
      enum: ['bullying', 'anxiety', 'grief', 'low_performance', 'aggression', 'coexistence', 'abuse_concern', 'family', 'substance_use', 'vocational', 'other'],
      default: 'other',
      index: true,
    },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium', index: true },
    status: { type: String, enum: ['open', 'follow_up', 'escalated', 'closed'], default: 'open', index: true },
    summary: { type: String, trim: true, default: '' },
    nextAction: { type: String, trim: true, default: '' },
    nextActionAt: { type: Date, default: null, index: true },
    closedAt: { type: Date, default: null },
    notes: [psychologyCaseNoteSchema],
  },
  { timestamps: true }
);

psychologyCaseSchema.index({ schoolId: 1, studentId: 1, updatedAt: -1 });
psychologyCaseSchema.index({ schoolId: 1, priority: 1, status: 1 });

module.exports = registerSchoolScopedModel('PsychologyCase', psychologyCaseSchema);
