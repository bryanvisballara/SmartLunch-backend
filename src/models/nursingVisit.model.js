const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const nursingVisitSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    attendedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    symptoms: { type: String, required: true, trim: true },
    treatment: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, default: '' },
    disposition: {
      type: String,
      enum: ['return_class', 'observation', 'sent_home', 'referred', 'other'],
      default: 'observation',
      index: true,
    },
    attendedAt: { type: Date, default: Date.now, index: true },
    parentNotification: {
      attempted: { type: Boolean, default: false },
      notificationsCreated: { type: Number, default: 0 },
      tokensFound: { type: Number, default: 0 },
      directDelivered: { type: Number, default: 0 },
      directFailed: { type: Number, default: 0 },
      queued: { type: Boolean, default: false },
      queuedCount: { type: Number, default: 0 },
      queueReason: { type: String, trim: true, default: '' },
      error: { type: String, trim: true, default: '' },
    },
  },
  { timestamps: true }
);

nursingVisitSchema.index({ schoolId: 1, studentId: 1, attendedAt: -1 });
nursingVisitSchema.index({ schoolId: 1, createdAt: -1 });

module.exports = registerSchoolScopedModel('NursingVisit', nursingVisitSchema);