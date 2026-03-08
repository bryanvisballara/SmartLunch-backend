const mongoose = require('mongoose');

const meriendaSubscriptionSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parentName: { type: String, trim: true, default: '' },
    parentUsername: { type: String, trim: true, default: '' },
    childName: { type: String, required: true, trim: true },
    childGrade: { type: String, trim: true, default: '' },
    childDocument: { type: String, trim: true, default: '' },
    parentRecommendations: { type: String, trim: true, default: '' },
    childAllergies: { type: String, trim: true, default: '' },
    childFoodRestrictionReason: {
      type: String,
      enum: ['', 'Alergia', 'Intolerancia', 'Dieta especial', 'Religion', 'Religión'],
      default: '',
      trim: true,
    },
    paymentStatus: { type: Boolean, default: false },
    currentPeriodMonth: { type: String, trim: true, default: '' },
    paymentReference: { type: String, trim: true, default: '' },
    lastPaymentAt: { type: Date, default: null },
    nextRenewalAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

meriendaSubscriptionSchema.index({ schoolId: 1, parentUserId: 1, childName: 1 }, { unique: true });
meriendaSubscriptionSchema.index({ schoolId: 1, status: 1, paymentStatus: 1, createdAt: -1 });

module.exports = mongoose.model('MeriendaSubscription', meriendaSubscriptionSchema);
