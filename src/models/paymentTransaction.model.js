const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const paymentTransactionSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    paymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParentPaymentMethod', default: null },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ['daviplata', 'bancolombia', 'bold', 'epayco', 'wompi', 'mercadopago_auto_debit', 'bold_auto_debit', 'epayco_auto_debit'], default: 'daviplata' },
    documentType: { type: String, enum: ['CC', 'TI', 'CE', 'PP', 'NIT', ''], default: '' },
    documentNumber: { type: String, default: '', trim: true },
    reference: { type: String, required: true, trim: true, unique: true },
    providerTransactionId: { type: String, trim: true },
    providerStatus: { type: String, default: 'PENDING', trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'failed'],
      default: 'pending',
      index: true,
    },
    walletTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
    academicChargePaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicChargePayment', default: null },
    enrollmentMatriculaProcessId: { type: mongoose.Schema.Types.ObjectId, ref: 'EnrollmentMatriculaProcess', default: null },
    academicChargeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicCharge', default: null },
    purpose: {
      type: String,
      enum: ['wallet_recharge', 'academic_matricula'],
      default: 'wallet_recharge',
      index: true,
    },
    description: { type: String, trim: true, default: 'Recarga Comergio' },
    callbackPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    failureReason: { type: String, trim: true, default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentTransactionSchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });
paymentTransactionSchema.index(
  { providerTransactionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      providerTransactionId: { $type: 'string' },
    },
  }
);

module.exports = registerSchoolScopedModel('PaymentTransaction', paymentTransactionSchema);
