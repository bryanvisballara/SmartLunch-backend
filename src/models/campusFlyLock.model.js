const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const campusFlyLockSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    campusCourseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusCourse', required: true, index: true },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherName: { type: String, trim: true, default: '' },
    sourceCourseKey: { type: String, trim: true, default: '', index: true },
    studentGradeKey: { type: String, trim: true, default: '', index: true },
    sectionLabel: { type: String, trim: true, default: '' },
    subject: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: false, index: true },
    lockedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },
    classSessionKey: { type: String, trim: true, default: '' },
    classSessionEndTime: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

campusFlyLockSchema.index(
  { schoolId: 1, campusCourseId: 1 },
  { unique: true, name: 'campus_fly_lock_course_unique' }
);
campusFlyLockSchema.index({ schoolId: 1, active: 1, expiresAt: 1 });

module.exports = registerSchoolScopedModel('CampusFlyLock', campusFlyLockSchema);
