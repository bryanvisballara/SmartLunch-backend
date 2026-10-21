const mongoose = require('mongoose');

const demoScheduledPushSchema = new mongoose.Schema(
  {
    demoLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'DemoLead', required: true, index: true },
    schoolId: { type: String, required: true, trim: true },
    parentUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    kind: { type: String, enum: ['pension', 'cafeteria', 'grade'], required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    sendAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, default: null },
    lastError: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

demoScheduledPushSchema.index({ status: 1, sendAt: 1 });

module.exports = mongoose.models.DemoScheduledPush
  || mongoose.model('DemoScheduledPush', demoScheduledPushSchema);
