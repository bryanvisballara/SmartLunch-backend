const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const campusSubjectReportStudentSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentName: { type: String, trim: true, default: '' },
    studentSchoolCode: { type: String, trim: true, default: '' },
    periodAverage: { type: Number, default: null },
    observation: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const campusSubjectReportCardSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    campusCourseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusCourse', required: true, index: true },
    sourceCourseKey: { type: String, trim: true, default: '', index: true },
    studentGradeKey: { type: String, trim: true, default: '', index: true },
    sectionLabel: { type: String, trim: true, default: '' },
    subject: { type: String, trim: true, default: '' },
    courseTitle: { type: String, trim: true, default: '' },
    academicPeriodKey: { type: String, required: true, trim: true, index: true },
    academicPeriodName: { type: String, trim: true, default: '' },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherName: { type: String, trim: true, default: '' },
    headroomTeacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    status: {
      type: String,
      enum: ['draft', 'submitted'],
      default: 'draft',
      index: true,
    },
    students: { type: [campusSubjectReportStudentSchema], default: [] },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

campusSubjectReportCardSchema.index(
  { schoolId: 1, campusCourseId: 1, academicPeriodKey: 1 },
  { unique: true, name: 'campus_subject_report_course_period_unique' }
);
campusSubjectReportCardSchema.index({ schoolId: 1, sourceCourseKey: 1, academicPeriodKey: 1, status: 1 });
campusSubjectReportCardSchema.index({ schoolId: 1, headroomTeacherUserId: 1, academicPeriodKey: 1, status: 1 });

module.exports = registerSchoolScopedModel('CampusSubjectReportCard', campusSubjectReportCardSchema);
