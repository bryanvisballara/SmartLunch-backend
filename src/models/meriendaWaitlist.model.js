const mongoose = require('mongoose');

const meriendaWaitlistSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    parentName: { type: String, trim: true, default: '' },
    parentUsername: { type: String, trim: true, default: '' },
    childName: { type: String, trim: true, default: '' },
    childGrade: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

meriendaWaitlistSchema.index({ schoolId: 1, parentUserId: 1 }, { unique: true });

module.exports = mongoose.model('MeriendaWaitlist', meriendaWaitlistSchema);
