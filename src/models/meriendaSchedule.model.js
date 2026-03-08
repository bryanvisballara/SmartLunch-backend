const mongoose = require('mongoose');

const meriendaScheduleDaySchema = new mongoose.Schema(
  {
    day: { type: Number, required: true, min: 1, max: 31 },
    firstSnackId: { type: mongoose.Schema.Types.ObjectId, ref: 'MeriendaSnack', default: null },
    secondSnackId: { type: mongoose.Schema.Types.ObjectId, ref: 'MeriendaSnack', default: null },
  },
  { _id: false }
);

const meriendaScheduleSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    month: { type: String, required: true, trim: true }, // YYYY-MM
    days: { type: [meriendaScheduleDaySchema], default: [] },
  },
  { timestamps: true }
);

meriendaScheduleSchema.index({ schoolId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('MeriendaSchedule', meriendaScheduleSchema);
