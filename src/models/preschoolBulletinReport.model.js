const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const preschoolBulletinEntrySchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentName: { type: String, trim: true, default: '' },
    indicatorId: { type: String, trim: true, required: true },
    observation: { type: String, trim: true, default: '' },
    performanceKey: { type: String, trim: true, default: '' },
    performanceLabel: { type: String, trim: true, default: '' },
    score: { type: Number, default: null },
  },
  { _id: false }
);

const preschoolBlockCommentSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    blockId: { type: String, trim: true, required: true },
    comment: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const preschoolBulletinReportSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    gradeKey: { type: String, required: true, trim: true, index: true },
    academicPeriodKey: { type: String, required: true, trim: true, index: true },
    campusCourseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusCourse', default: null, index: true },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherName: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['draft', 'submitted'], default: 'draft', index: true },
    entries: { type: [preschoolBulletinEntrySchema], default: [] },
    blockComments: { type: [preschoolBlockCommentSchema], default: [] },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

preschoolBulletinReportSchema.index(
  { schoolId: 1, gradeKey: 1, academicPeriodKey: 1, teacherUserId: 1 },
  { unique: true }
);

module.exports = registerSchoolScopedModel('PreschoolBulletinReport', preschoolBulletinReportSchema);
