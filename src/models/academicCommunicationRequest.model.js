const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const academicCommunicationRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    publisherRole: {
      type: String,
      enum: ['teacher', 'parent', 'student', ''],
      default: 'teacher',
      index: true,
    },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    teacherName: { type: String, trim: true, default: '' },
    requesterUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    authorStudentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
    authorPhotoUrl: { type: String, trim: true, default: '' },
    authorThumbUrl: { type: String, trim: true, default: '' },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusCourse', default: null, index: true },
    courseTitle: { type: String, trim: true, default: '' },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    emailSubject: { type: String, trim: true, default: '' },
    audienceType: {
      type: String,
      enum: ['general', 'grade', 'course', 'course_students', 'individual'],
      required: true,
      index: true,
    },
    gradeTargets: { type: [String], default: [] },
    courseTargets: { type: [String], default: [] },
    parentTargets: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
    studentTargets: { type: [mongoose.Schema.Types.ObjectId], ref: 'Student', default: [] },
    cohortKey: { type: String, trim: true, default: '', index: true },
    academicYear: { type: String, trim: true, default: '' },
    media: {
      type: [
        {
          kind: { type: String, enum: ['image', 'video'], default: 'image' },
          src: { type: String, trim: true, default: '' },
          thumbUrl: { type: String, trim: true, default: '' },
          alt: { type: String, trim: true, default: '' },
        },
      ],
      default: [],
    },
    channels: {
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    reviewedByName: { type: String, trim: true, default: '' },
    reviewNotes: { type: String, trim: true, default: '' },
    originalTitle: { type: String, trim: true, default: '' },
    originalBody: { type: String, trim: true, default: '' },
    originalEmailSubject: { type: String, trim: true, default: '' },
    publishedCommunicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicCommunication', default: null, index: true },
  },
  { timestamps: true }
);

academicCommunicationRequestSchema.index({ schoolId: 1, status: 1, submittedAt: -1 });
academicCommunicationRequestSchema.index({ schoolId: 1, teacherUserId: 1, createdAt: -1 });
academicCommunicationRequestSchema.index({ schoolId: 1, requesterUserId: 1, createdAt: -1 });
academicCommunicationRequestSchema.index({ schoolId: 1, publisherRole: 1, status: 1, submittedAt: -1 });

module.exports = registerSchoolScopedModel('AcademicCommunicationRequest', academicCommunicationRequestSchema);
