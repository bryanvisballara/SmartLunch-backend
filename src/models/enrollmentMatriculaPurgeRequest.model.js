const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const enrollmentMatriculaPurgeRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    actionType: {
      type: String,
      enum: ['clear_consents', 'clear_consent', 'clear_signatures', 'delete_billing_payment'],
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
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicChargePayment', default: null, index: true },
    processId: { type: mongoose.Schema.Types.ObjectId, ref: 'EnrollmentMatriculaProcess', default: null, index: true },
    parentName: { type: String, trim: true, default: '' },
    chargeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicCharge', default: null, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
    studentName: { type: String, trim: true, default: '' },
    paymentConcept: { type: String, trim: true, default: '' },
    paymentAmount: { type: Number, min: 0, default: 0 },
    paymentMethod: { type: String, trim: true, default: '' },
    paymentMethodLabel: { type: String, trim: true, default: '' },
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
  {
    unique: true,
    partialFilterExpression: {
      status: 'pending',
      actionType: { $in: ['clear_consents', 'clear_signatures'] },
    },
  }
);
enrollmentMatriculaPurgeRequestSchema.index(
  { schoolId: 1, paymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'pending',
      actionType: 'delete_billing_payment',
    },
  }
);
enrollmentMatriculaPurgeRequestSchema.index(
  { schoolId: 1, processId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'pending',
      actionType: 'clear_consent',
    },
  }
);

module.exports = registerSchoolScopedModel('EnrollmentMatriculaPurgeRequest', enrollmentMatriculaPurgeRequestSchema);
