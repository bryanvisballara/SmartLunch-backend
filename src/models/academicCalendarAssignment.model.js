const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const academicCalendarAssignmentSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    createdByUserId: { type: String, required: true, index: true },
    authorName: { type: String, trim: true, default: '' },
    authorRole: { type: String, trim: true, default: '' },
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true, default: '' },
    type: { type: String, trim: true, default: 'Actividad' },
    scheduledAt: { type: Date, required: true, index: true },
    scope: { type: String, enum: ['all_school', 'grades'], default: 'all_school', index: true },
    targetGradeKeys: { type: [String], default: [] },
    status: { type: String, enum: ['published', 'archived'], default: 'published', index: true },
  },
  { timestamps: true }
);

academicCalendarAssignmentSchema.index({ schoolId: 1, status: 1, scheduledAt: 1 });
academicCalendarAssignmentSchema.index({ schoolId: 1, scope: 1, targetGradeKeys: 1, status: 1 });

module.exports = registerSchoolScopedModel('AcademicCalendarAssignment', academicCalendarAssignmentSchema);
