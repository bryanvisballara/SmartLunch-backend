const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const campusGradeEntrySchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusCourse', required: true, index: true },
    teacherUserId: { type: String, required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    academicPeriodKey: { type: String, required: true, trim: true, default: 'period_1' },
    componentKey: { type: String, required: true, trim: true },
    subcomponentKey: { type: String, trim: true, default: '' },
    score: { type: Number, required: true, min: 0, max: 100 },
    feedback: { type: String, trim: true, default: '' },
    gradedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

campusGradeEntrySchema.index(
  { schoolId: 1, courseId: 1, studentId: 1, academicPeriodKey: 1, componentKey: 1 },
  { unique: true, name: 'campus_course_student_period_component_unique' }
);

module.exports = registerSchoolScopedModel('CampusGradeEntry', campusGradeEntrySchema);