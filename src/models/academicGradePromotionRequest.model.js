const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const academicGradePromotionRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    requestedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestedByName: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    totalStudents: { type: Number, min: 0, default: 0 },
    promotableStudents: { type: Number, min: 0, default: 0 },
    skippedStudents: { type: Number, min: 0, default: 0 },
    preview: {
      type: [
        {
          fromGrade: { type: String, trim: true, default: '' },
          toGrade: { type: String, trim: true, default: '' },
          count: { type: Number, min: 0, default: 0 },
        },
      ],
      default: [],
    },
    requestedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    reviewedByName: { type: String, trim: true, default: '' },
    reviewNotes: { type: String, trim: true, default: '' },
    appliedStudents: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

academicGradePromotionRequestSchema.index({ schoolId: 1, status: 1, requestedAt: -1 });

module.exports = registerSchoolScopedModel('AcademicGradePromotionRequest', academicGradePromotionRequestSchema);