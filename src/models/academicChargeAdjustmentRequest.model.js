const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const academicChargeAdjustmentRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    chargeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicCharge', default: null, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    studentName: { type: String, trim: true, default: '' },
    parentName: { type: String, trim: true, default: '' },
    category: {
      type: String,
      enum: ['enrollment_bonus', 'annual_tuition', 'monthly_tuition', 'monthly_statement', 'additional'],
      required: true,
    },
    concept: { type: String, trim: true, default: '' },
    monthKey: { type: String, trim: true, default: '' },
    dueDate: { type: Date, default: null },
    currentAmount: { type: Number, min: 0, required: true },
    proposedAmount: { type: Number, min: 0, required: true },
    adjustmentMode: {
      type: String,
      enum: ['percent', 'fixed', 'absolute'],
      required: true,
    },
    adjustmentValue: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true, default: '' },
    requestedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestedByName: { type: String, trim: true, default: '' },
    requestedByRole: { type: String, trim: true, default: '' },
    submittedAt: { type: Date, default: Date.now, index: true },
    reviewedAt: { type: Date, default: null },
    reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    reviewedByName: { type: String, trim: true, default: '' },
    reviewNotes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

academicChargeAdjustmentRequestSchema.index({ schoolId: 1, status: 1, submittedAt: -1 });
academicChargeAdjustmentRequestSchema.index(
  { schoolId: 1, chargeId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'pending',
      chargeId: { $type: 'objectId' },
    },
  }
);

module.exports = registerSchoolScopedModel('AcademicChargeAdjustmentRequest', academicChargeAdjustmentRequestSchema);
