const mongoose = require('mongoose');

const meriendaIntakeRecordSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'MeriendaSubscription', required: true, index: true },
    month: { type: String, required: true, trim: true }, // YYYY-MM
    date: { type: String, required: true, trim: true }, // YYYY-MM-DD
    ateStatus: { type: String, enum: ['pending', 'ate', 'not_ate'], default: 'pending' },
    observations: { type: String, trim: true, default: '' },
    handledByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handledByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

meriendaIntakeRecordSchema.index({ schoolId: 1, date: 1, subscriptionId: 1 }, { unique: true });
meriendaIntakeRecordSchema.index({ schoolId: 1, month: 1, date: 1, updatedAt: -1 });

module.exports = mongoose.model('MeriendaIntakeRecord', meriendaIntakeRecordSchema);
