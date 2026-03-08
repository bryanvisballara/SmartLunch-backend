const mongoose = require('mongoose');

const meriendaFailedPaymentSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'MeriendaSubscription', default: null },
    parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    parentName: { type: String, trim: true, default: '' },
    parentUsername: { type: String, trim: true, default: '' },
    childName: { type: String, trim: true, default: '' },
    childGrade: { type: String, trim: true, default: '' },
    amount: { type: Number, required: true, min: 0 },
    targetMonth: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['pending_contact', 'contacted', 'resolved'],
      default: 'pending_contact',
    },
    failedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

meriendaFailedPaymentSchema.index({ schoolId: 1, status: 1, failedAt: -1 });
meriendaFailedPaymentSchema.index({ schoolId: 1, targetMonth: 1, failedAt: -1 });

module.exports = mongoose.model('MeriendaFailedPayment', meriendaFailedPaymentSchema);
