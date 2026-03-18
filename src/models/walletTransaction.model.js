const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
    type: {
      type: String,
      enum: ['recharge', 'purchase', 'refund', 'adjustment'],
      required: true,
    },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['system', 'cash', 'qr', 'transfer', 'dataphone', 'daviplata', 'bancolombia', 'mercadopago', 'bold', 'epayco'], required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, trim: true },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancellationTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ studentId: 1, createdAt: -1 });
walletTransactionSchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
