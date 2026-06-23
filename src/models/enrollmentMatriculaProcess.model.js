const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const evidenceSchema = new mongoose.Schema(
  {
    accepted: { type: Boolean, default: false },
    acceptedAt: { type: Date, default: null },
    ipAddress: { type: String, trim: true, default: '' },
    device: { type: String, trim: true, default: '' },
    userAgent: { type: String, trim: true, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    version: { type: String, trim: true, default: 'Consentimiento Matricula v1.0' },
  },
  { _id: false }
);

const paymentEvidenceSchema = new mongoose.Schema(
  {
    transactionId: { type: String, trim: true, default: '' },
    reference: { type: String, trim: true, default: '' },
    amount: { type: Number, min: 0, default: 0 },
    paidAt: { type: Date, default: null },
    status: { type: String, trim: true, default: 'PENDING' },
    method: { type: String, trim: true, default: '' },
    chargePaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicChargePayment', default: null },
    paymentTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction', default: null },
  },
  { _id: false }
);

const signatureEvidenceSchema = new mongoose.Schema(
  {
    signedAt: { type: Date, default: null },
    ipAddress: { type: String, trim: true, default: '' },
    device: { type: String, trim: true, default: '' },
    userAgent: { type: String, trim: true, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    signatureImage: { type: String, default: '' },
    signedPdfBase64: { type: String, default: '' },
    fileName: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const enrollmentMatriculaProcessSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    chargeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicCharge', required: true, index: true },
    academicYear: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: [
        'intro_pending',
        'consent_pending',
        'consent_accepted',
        'payment_pending',
        'payment_confirmed',
        'contract_pending',
        'pagare_pending',
        'completed',
        'cancelled',
      ],
      default: 'intro_pending',
      index: true,
    },
    introAcknowledgedAt: { type: Date, default: null },
    consent: { type: evidenceSchema, default: () => ({}) },
    payment: { type: paymentEvidenceSchema, default: () => ({}) },
    contract: { type: signatureEvidenceSchema, default: () => ({}) },
    pagare: { type: signatureEvidenceSchema, default: () => ({}) },
    contractParamsSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    studentName: { type: String, trim: true, default: '' },
    parentName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

enrollmentMatriculaProcessSchema.index({ schoolId: 1, chargeId: 1 }, { unique: true });
enrollmentMatriculaProcessSchema.index({ schoolId: 1, parentId: 1, status: 1, updatedAt: -1 });
enrollmentMatriculaProcessSchema.index({ schoolId: 1, studentId: 1, status: 1 });

module.exports = registerSchoolScopedModel('EnrollmentMatriculaProcess', enrollmentMatriculaProcessSchema);
