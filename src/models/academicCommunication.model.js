const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const academicCommunicationSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByName: { type: String, trim: true, default: '' },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicCommunicationAuthor', default: null, index: true },
    authorName: { type: String, trim: true, default: '' },
    authorPhotoUrl: { type: String, trim: true, default: '' },
    authorThumbUrl: { type: String, trim: true, default: '' },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    audienceType: { type: String, enum: ['general', 'grade', 'course', 'individual'], required: true, index: true },
    gradeTargets: { type: [String], default: [] },
    courseTargets: { type: [String], default: [] },
    parentTargets: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
    studentTargets: { type: [mongoose.Schema.Types.ObjectId], ref: 'Student', default: [] },
    recipientParentIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
    recipientStudentIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Student', default: [] },
    emailSubject: { type: String, trim: true, default: '' },
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
    likes: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          name: { type: String, trim: true, default: '' },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    comments: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          name: { type: String, trim: true, default: '' },
          body: { type: String, required: true, trim: true },
          likes: {
            type: [
              {
                userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
                name: { type: String, trim: true, default: '' },
                createdAt: { type: Date, default: Date.now },
              },
            ],
            default: [],
          },
          createdAt: { type: Date, default: Date.now },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    channels: {
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
    },
    sentAt: { type: Date, default: null },
    deliverySummary: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

academicCommunicationSchema.index({ schoolId: 1, recipientParentIds: 1, sentAt: -1 });
academicCommunicationSchema.index({ schoolId: 1, audienceType: 1, createdAt: -1 });

module.exports = registerSchoolScopedModel('AcademicCommunication', academicCommunicationSchema);