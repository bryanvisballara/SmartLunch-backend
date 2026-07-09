const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const communityReportSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    reportType: {
      type: String,
      enum: ['bullying', 'teacher_complaint', 'school_recommendation'],
      required: true,
      index: true,
    },
    message: { type: String, required: true, trim: true },
    teacherName: { type: String, trim: true, default: '' },
    isAnonymous: { type: Boolean, default: false, index: true },
    reporterUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    reporterName: { type: String, trim: true, default: '' },
    reporterRole: { type: String, enum: ['parent', 'student'], required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
    studentName: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'archived'],
      default: 'pending',
      index: true,
    },
    reviewedAt: { type: Date },
    reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: { type: String, trim: true, default: '' },
    submittedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

communityReportSchema.index({ schoolId: 1, submittedAt: -1 });
communityReportSchema.index({ schoolId: 1, status: 1, submittedAt: -1 });

module.exports = registerSchoolScopedModel('CommunityReport', communityReportSchema);
