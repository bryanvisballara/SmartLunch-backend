const mongoose = require('mongoose');

const salesStageSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  confirmed: { type: Boolean, default: false },
  inProgress: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
  confirmedAt: { type: Date, default: null },
}, { _id: false });

const salesAppointmentSchema = new mongoose.Schema({
  type: { type: String, enum: ['', 'virtual', 'phone', 'in_person'], default: '', trim: true },
  label: { type: String, default: '', trim: true },
  date: { type: String, default: '', trim: true },
  time: { type: String, default: '', trim: true },
  contactEmail: { type: String, default: '', trim: true, lowercase: true },
  scheduledAt: { type: Date, default: null },
}, { _id: false });

const salesEventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  notes: { type: String, default: '', trim: true },
  stageKey: { type: String, default: '', trim: true },
  stageLabel: { type: String, default: '', trim: true },
  responsible: { type: String, default: '', trim: true },
  appointment: { type: salesAppointmentSchema, default: () => ({}) },
  completed: { type: Boolean, default: false },
  inProgress: { type: Boolean, default: false },
  createdByName: { type: String, default: '', trim: true },
}, { timestamps: true });

const salesProspectSchema = new mongoose.Schema({
  schoolName: { type: String, required: true, trim: true, index: true },
  city: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  contactMethod: {
    type: String,
    enum: ['instagram', 'meta', 'whatsapp', 'google', 'recomendado', 'llamada', 'demo_web', ''],
    default: '',
    trim: true,
  },
  demoLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'DemoLead', default: null, index: true },
  contactName: { type: String, default: '', trim: true },
  contactEmail: { type: String, default: '', trim: true, lowercase: true },
  contactPhone: { type: String, default: '', trim: true },
  currentStageKey: {
    type: String,
    default: 'creado',
    index: true,
    trim: true,
  },
  salesStages: { type: [salesStageSchema], default: [] },
  salesEvents: { type: [salesEventSchema], default: [] },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

salesProspectSchema.index({ currentStageKey: 1, deletedAt: 1 });
salesProspectSchema.index({ createdAt: -1 });

module.exports = mongoose.models.SalesProspect || mongoose.model('SalesProspect', salesProspectSchema);
