const mongoose = require('mongoose');

const salesAgendaWindowSchema = new mongoose.Schema({
  start: { type: String, required: true, trim: true },
  end: { type: String, required: true, trim: true },
}, { _id: false });

const salesAgendaBlockSchema = new mongoose.Schema({
  scope: { type: String, enum: ['date', 'weekday'], required: true },
  date: { type: String, default: '', trim: true },
  time: { type: String, required: true, trim: true },
  createdByName: { type: String, default: '', trim: true },
}, { timestamps: true });

const salesAgendaSettingsSchema = new mongoose.Schema({
  scopeKey: { type: String, required: true, unique: true, default: 'global', trim: true },
  usesCustomRange: { type: Boolean, default: false },
  availableFrom: { type: String, default: '09:00', trim: true },
  availableTo: { type: String, default: '16:00', trim: true },
  windows: { type: [salesAgendaWindowSchema], default: [] },
  blocks: { type: [salesAgendaBlockSchema], default: [] },
  closedDates: { type: [String], default: [] },
}, { timestamps: true });

module.exports = mongoose.models.SalesAgendaSettings
  || mongoose.model('SalesAgendaSettings', salesAgendaSettingsSchema);
