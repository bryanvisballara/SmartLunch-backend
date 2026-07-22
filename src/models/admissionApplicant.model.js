const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const admissionStageSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  confirmed: { type: Boolean, default: false },
  inProgress: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
  confirmedAt: { type: Date, default: null },
}, { _id: false });

const appointmentSchema = new mongoose.Schema({
  type: { type: String, enum: ['', 'virtual', 'phone', 'in_person'], default: '', trim: true },
  label: { type: String, default: '', trim: true },
  date: { type: String, default: '', trim: true },
  time: { type: String, default: '', trim: true },
  locationKey: { type: String, default: '', trim: true },
  locationLabel: { type: String, default: '', trim: true },
  guardianEmail: { type: String, default: '', trim: true, lowercase: true },
  scheduledAt: { type: Date, default: null },
}, { _id: false });

const admissionEventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  notes: { type: String, default: '', trim: true },
  stageKey: { type: String, default: '', trim: true },
  stageLabel: { type: String, default: '', trim: true },
  responsible: { type: String, default: '', trim: true },
  appointment: { type: appointmentSchema, default: () => ({}) },
  clientVisible: { type: Boolean, default: false },
  completed: { type: Boolean, default: false },
  inProgress: { type: Boolean, default: false },
  media: { type: [mongoose.Schema.Types.Mixed], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdByName: { type: String, default: '', trim: true },
}, { timestamps: true });

const admissionDocumentSchema = new mongoose.Schema({
  type: { type: String, default: 'otro', trim: true },
  label: { type: String, default: 'Otro', trim: true },
  note: { type: String, default: '', trim: true },
  clientVisible: { type: Boolean, default: false },
  fileName: { type: String, default: '', trim: true },
  originalName: { type: String, default: '', trim: true },
  url: { type: String, default: '', trim: true },
  mimeType: { type: String, default: '', trim: true },
  sizeBytes: { type: Number, default: 0 },
  storage: { type: String, default: '', trim: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  uploadedByName: { type: String, default: '', trim: true },
}, { timestamps: true });

const admissionApplicantSchema = new mongoose.Schema({
  schoolId: { type: String, required: true, index: true, trim: true },
  student: {
    firstName: { type: String, default: '', trim: true },
    lastName: { type: String, default: '', trim: true },
    documentNumber: { type: String, default: '', trim: true, index: true },
    birthDate: { type: Date, default: null },
    previousSchool: { type: String, default: '', trim: true },
  },
  guardian: {
    name: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
  },
  grade: { type: String, default: '', trim: true, index: true },
  academicYear: { type: String, default: '', trim: true },
  source: {
    referenceOrigin: { type: String, default: '', trim: true },
  },
  status: {
    type: String,
    enum: ['interested', 'in_process', 'enrolled', 'withdrawn', 'not_admitted'],
    default: 'interested',
    index: true,
  },
  admissionDecision: {
    result: { type: String, enum: ['', 'admitted', 'not_admitted'], default: '', trim: true },
    reason: { type: String, default: '', trim: true },
    decidedAt: { type: Date, default: null },
  },
  currentStageKey: { type: String, default: 'interesados', index: true, trim: true },
  admissionStages: { type: [admissionStageSchema], default: [] },
  admissionEvents: { type: [admissionEventSchema], default: [] },
  documents: { type: [admissionDocumentSchema], default: [] },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

admissionApplicantSchema.index({ schoolId: 1, currentStageKey: 1, deletedAt: 1 });
admissionApplicantSchema.index({ schoolId: 1, status: 1, deletedAt: 1 });
admissionApplicantSchema.index({ schoolId: 1, 'student.firstName': 1, 'student.lastName': 1 });

module.exports = registerSchoolScopedModel('AdmissionApplicant', admissionApplicantSchema);
