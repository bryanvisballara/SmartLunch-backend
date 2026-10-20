const mongoose = require('mongoose');

const schoolProcessInterviewSchema = new mongoose.Schema(
  {
    schoolName: { type: String, required: true, trim: true, index: true },
    city: { type: String, trim: true, default: '' },
    contactName: { type: String, trim: true, default: '' },
    contactRole: { type: String, trim: true, default: '' },
    contactEmail: { type: String, trim: true, default: '' },
    contactPhone: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    answers: { type: mongoose.Schema.Types.Mixed, default: {} },
    report: { type: mongoose.Schema.Types.Mixed, default: {} },
    overallScore: { type: Number, default: null },
  },
  { timestamps: true },
);

schoolProcessInterviewSchema.index({ createdAt: -1 });

module.exports = mongoose.models.SchoolProcessInterview
  || mongoose.model('SchoolProcessInterview', schoolProcessInterviewSchema);
