const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const notificationSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    payload: { type: Object, default: {} },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    sentAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    dismissedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ parentId: 1, createdAt: -1 });
notificationSchema.index({ parentId: 1, dismissedAt: 1, createdAt: -1 });
notificationSchema.index({ parentId: 1, readAt: 1, dismissedAt: 1 });
notificationSchema.index({ schoolId: 1, createdAt: -1 });

module.exports = registerSchoolScopedModel('Notification', notificationSchema);
