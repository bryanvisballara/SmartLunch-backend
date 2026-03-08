const mongoose = require('mongoose');

const passwordResetCodeSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    codeHash: { type: String, required: true },
    resetTokenHash: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'verified', 'failed', 'consumed'],
      default: 'pending',
      index: true,
    },
    verifiedAt: { type: Date, default: null },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

passwordResetCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PasswordResetCode', passwordResetCodeSchema);
