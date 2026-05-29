const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const deviceTokenSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    platform: { type: String, enum: ['web', 'ios', 'android'], required: true },
    token: { type: String, required: true, trim: true },
    lastSeenAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  },
  { timestamps: true }
);

deviceTokenSchema.index({ userId: 1, schoolId: 1, status: 1 });
deviceTokenSchema.index({ schoolId: 1, userId: 1, token: 1 }, { unique: true });
deviceTokenSchema.index({ token: 1 });

module.exports = registerSchoolScopedModel('DeviceToken', deviceTokenSchema);
