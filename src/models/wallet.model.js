const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, unique: true },
    balance: { type: Number, required: true, default: 0 },
    autoDebitEnabled: { type: Boolean, default: false },
    autoDebitLimit: { type: Number, default: 0 },
    autoDebitAmount: { type: Number, default: 0 },
    autoDebitPaymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParentPaymentMethod', default: null },
    autoDebitInProgress: { type: Boolean, default: false },
    autoDebitLockAt: { type: Date, default: null },
    autoDebitLastAttempt: { type: Date, default: null },
    autoDebitLastChargeAt: { type: Date, default: null },
    autoDebitRetryAt: { type: Date, default: null },
    autoDebitRetryCount: { type: Number, default: 0 },
    autoDebitMonthlyLimit: { type: Number, default: 1000000 },
    autoDebitMonthlyUsed: { type: Number, default: 0 },
    autoDebitMonthlyPeriod: { type: String, default: '' },
    lowBalanceAlertLevel: { type: String, enum: ['none', 'lt20', 'lt10'], default: 'none' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

walletSchema.index({ autoDebitEnabled: 1, autoDebitInProgress: 1, autoDebitLastChargeAt: 1 });
walletSchema.index({ autoDebitEnabled: 1, autoDebitRetryAt: 1, autoDebitLockAt: 1 });

module.exports = mongoose.model('Wallet', walletSchema);
