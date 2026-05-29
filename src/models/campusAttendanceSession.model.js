const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const campusAttendanceRecordSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentNameSnapshot: { type: String, trim: true, default: '' },
    studentCodeSnapshot: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['present', 'late', 'absent', 'excused'],
      default: 'present',
    },
    notes: { type: String, trim: true, default: '' },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const campusAttendanceSessionSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    teacherUserId: { type: String, required: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusCourse', required: true, index: true },
    attendanceType: {
      type: String,
      enum: ['guidance_routine', 'subject_class'],
      required: true,
      index: true,
    },
    date: { type: String, required: true, trim: true, index: true },
    classSessionKey: { type: String, trim: true, default: '' },
    courseTitleSnapshot: { type: String, trim: true, default: '' },
    subjectSnapshot: { type: String, trim: true, default: '' },
    gradeSnapshot: { type: String, trim: true, default: '' },
    records: { type: [campusAttendanceRecordSchema], default: [] },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

campusAttendanceSessionSchema.index(
  { schoolId: 1, teacherUserId: 1, courseId: 1, attendanceType: 1, date: 1, classSessionKey: 1 },
  { unique: true }
);

module.exports = registerSchoolScopedModel('CampusAttendanceSession', campusAttendanceSessionSchema);
