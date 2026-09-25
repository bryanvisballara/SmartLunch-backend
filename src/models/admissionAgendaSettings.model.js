const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const admissionAgendaWindowSchema = new mongoose.Schema({
  start: { type: String, required: true, trim: true },
  end: { type: String, required: true, trim: true },
}, { _id: false });

const admissionAgendaBlockSchema = new mongoose.Schema({
  scope: { type: String, enum: ['date', 'weekday'], required: true },
  date: { type: String, default: '', trim: true },
  time: { type: String, required: true, trim: true },
  createdByName: { type: String, default: '', trim: true },
}, { timestamps: true });

const admissionAgendaSettingsSchema = new mongoose.Schema({
  schoolId: { type: String, required: true, unique: true, index: true, trim: true },
  usesCustomRange: { type: Boolean, default: false },
  availableFrom: { type: String, default: '09:00', trim: true },
  availableTo: { type: String, default: '16:00', trim: true },
  windows: { type: [admissionAgendaWindowSchema], default: [] },
  blocks: { type: [admissionAgendaBlockSchema], default: [] },
}, { timestamps: true });

module.exports = registerSchoolScopedModel('AdmissionAgendaSettings', admissionAgendaSettingsSchema);
