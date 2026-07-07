const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const academicChargePaymentSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    chargeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicCharge', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recordedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recordedByRole: { type: String, trim: true, default: '' },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ['parent_portal', 'cash', 'bank_transfer', 'card', 'pse', 'epayco', 'bold', 'wompi', 'other'], default: 'parent_portal' },
    notes: { type: String, trim: true, default: '' },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

academicChargePaymentSchema.index({ schoolId: 1, parentId: 1, paidAt: -1 });
academicChargePaymentSchema.index({ schoolId: 1, studentId: 1, paidAt: -1 });

module.exports = registerSchoolScopedModel('AcademicChargePayment', academicChargePaymentSchema);