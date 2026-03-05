const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, unique: true },
    balance: { type: Number, required: true, default: 0 },
    autoDebitEnabled: { type: Boolean, default: false },
    autoDebitLimit: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wallet', walletSchema);
