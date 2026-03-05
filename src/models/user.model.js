const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['parent', 'admin', 'vendor'], required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
