const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const campusDisciplineObservationSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherName: { type: String, trim: true, default: '' },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusCourse', required: true, index: true },
    courseTitle: { type: String, trim: true, default: '' },
    subject: { type: String, trim: true, default: '' },
    studentGradeKey: { type: String, trim: true, default: '' },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentName: { type: String, trim: true, default: '' },
    studentSchoolCode: { type: String, trim: true, default: '' },
    studentGrade: { type: String, trim: true, default: '' },
    studentCourse: { type: String, trim: true, default: '' },
    observation: { type: String, required: true, trim: true },
    status: { type: String, enum: ['submitted', 'reviewed', 'archived'], default: 'submitted', index: true },
    recipients: { type: [String], default: ['coordination', 'direccion', 'psychology', 'rectoria'] },
    submittedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

campusDisciplineObservationSchema.index({ schoolId: 1, submittedAt: -1 });
campusDisciplineObservationSchema.index({ schoolId: 1, studentId: 1, submittedAt: -1 });
campusDisciplineObservationSchema.index({ schoolId: 1, teacherUserId: 1, submittedAt: -1 });

module.exports = registerSchoolScopedModel('CampusDisciplineObservation', campusDisciplineObservationSchema);