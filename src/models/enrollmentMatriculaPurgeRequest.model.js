const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const enrollmentMatriculaPurgeRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    actionType: {
      type: String,
      enum: ['clear_consents', 'clear_signatures'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    requestedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestedByName: { type: String, trim: true, default: '' },
    requestedByRole: { type: String, trim: true, default: '' },
    recordCount: { type: Number, min: 0, default: 0 },
    submittedAt: { type: Date, default: Date.now, index: true },
    reviewedAt: { type: Date, default: null },
    reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    reviewedByName: { type: String, trim: true, default: '' },
    reviewNotes: { type: String, trim: true, default: '' },
    executedCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

enrollmentMatriculaPurgeRequestSchema.index({ schoolId: 1, status: 1, submittedAt: -1 });
enrollmentMatriculaPurgeRequestSchema.index(
  { schoolId: 1, actionType: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = registerSchoolScopedModel('EnrollmentMatriculaPurgeRequest', enrollmentMatriculaPurgeRequestSchema);
