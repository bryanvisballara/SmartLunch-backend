const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const campusGeneralReportSubjectLineSchema = new mongoose.Schema(
  {
    campusCourseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusCourse', default: null },
    subjectReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusSubjectReportCard', default: null },
    subject: { type: String, trim: true, default: '' },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    teacherName: { type: String, trim: true, default: '' },
    periodAverage: { type: Number, default: null },
    teacherObservation: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const campusGeneralReportStudentSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentName: { type: String, trim: true, default: '' },
    studentSchoolCode: { type: String, trim: true, default: '' },
    subjectLines: { type: [campusGeneralReportSubjectLineSchema], default: [] },
    overallAverage: { type: Number, default: null },
    headroomObservation: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const campusGeneralReportCardSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    sourceCourseKey: { type: String, required: true, trim: true, index: true },
    studentGradeKey: { type: String, trim: true, default: '', index: true },
    sectionLabel: { type: String, trim: true, default: '' },
    academicPeriodKey: { type: String, required: true, trim: true, index: true },
    academicPeriodName: { type: String, trim: true, default: '' },
    headroomTeacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    headroomTeacherName: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
    subjectReportIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CampusSubjectReportCard' }],
    students: { type: [campusGeneralReportStudentSchema], default: [] },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

campusGeneralReportCardSchema.index(
  { schoolId: 1, sourceCourseKey: 1, academicPeriodKey: 1 },
  { unique: true, name: 'campus_general_report_section_period_unique' }
);
campusGeneralReportCardSchema.index({ schoolId: 1, headroomTeacherUserId: 1, academicPeriodKey: 1, status: 1 });

module.exports = registerSchoolScopedModel('CampusGeneralReportCard', campusGeneralReportCardSchema);
