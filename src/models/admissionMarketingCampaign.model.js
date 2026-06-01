const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const admissionMarketingRecipientSchema = new mongoose.Schema({
  applicantId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdmissionApplicant', default: null, index: true },
  studentName: { type: String, default: '', trim: true },
  guardianName: { type: String, default: '', trim: true },
  guardianEmail: { type: String, default: '', trim: true, lowercase: true },
  grade: { type: String, default: '', trim: true },
  currentStageKey: { type: String, default: '', trim: true },
  status: { type: String, default: '', trim: true },
}, { _id: false });

const admissionMarketingCampaignSchema = new mongoose.Schema({
  schoolId: { type: String, required: true, index: true, trim: true },
  subject: { type: String, required: true, trim: true },
  title: { type: String, default: '', trim: true },
  body: { type: String, default: '', trim: true },
  imageUrl: { type: String, default: '', trim: true },
  imageAlt: { type: String, default: '', trim: true },
  recipients: { type: [admissionMarketingRecipientSchema], default: [] },
  delivery: { type: mongoose.Schema.Types.Mixed, default: null },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  createdByName: { type: String, default: '', trim: true },
  sentAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

admissionMarketingCampaignSchema.index({ schoolId: 1, sentAt: -1 });

module.exports = registerSchoolScopedModel('AdmissionMarketingCampaign', admissionMarketingCampaignSchema);