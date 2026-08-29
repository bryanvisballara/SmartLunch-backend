const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const studentSubjectReviewSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    subjectKey: { type: String, required: true, trim: true },
    seenItemKeys: { type: [String], default: [] },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

studentSubjectReviewSchema.index({ schoolId: 1, studentId: 1, subjectKey: 1 }, { unique: true });

module.exports = registerSchoolScopedModel('StudentSubjectReview', studentSubjectReviewSchema);
