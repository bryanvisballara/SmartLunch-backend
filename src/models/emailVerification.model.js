const mongoose = require('mongoose');

const emailVerificationSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'verified', 'failed', 'consumed'],
      default: 'pending',
      index: true,
    },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    documentNumber: { type: String, trim: true, default: '' },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

emailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('EmailVerification', emailVerificationSchema);
