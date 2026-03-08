const mongoose = require('mongoose');

const walletTopupRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ['cash', 'qr', 'dataphone'], default: 'cash' },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    notes: { type: String, trim: true },
    requestDate: { type: String, trim: true },
  },
  { timestamps: true }
);

walletTopupRequestSchema.index({ schoolId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTopupRequest', walletTopupRequestSchema);