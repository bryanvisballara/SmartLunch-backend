const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const campusScheduledClassSessionSchema = new mongoose.Schema(
  {
    weekday: { type: Number, min: 0, max: 6 },
    startTime: { type: String, trim: true, default: '' },
    endTime: { type: String, trim: true, default: '' },
    label: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const campusMaterialAttachmentSchema = new mongoose.Schema(
  {
    sourceType: { type: String, enum: ['file', 'link'], default: 'file' },
    kind: { type: String, trim: true, default: 'file' },
    title: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
    fileName: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
    sizeBytes: { type: Number, default: 0 },
    extension: { type: String, trim: true, default: '' },
    storage: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const campusPostSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    teacherUserId: { type: String, required: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusCourse', required: true, index: true },
    type: { type: String, required: true, trim: true, default: 'Aviso' },
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true, default: '' },
    deliveryMode: { type: String, enum: ['date', 'class'], default: 'date' },
    dueAt: { type: Date, default: null },
    scheduledClassDate: { type: Date, default: null },
    scheduledClassSession: { type: campusScheduledClassSessionSchema, default: null },
    attachments: { type: [campusMaterialAttachmentSchema], default: [] },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'published' },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

campusPostSchema.index({ schoolId: 1, teacherUserId: 1, status: 1, createdAt: -1 });
campusPostSchema.index({ schoolId: 1, courseId: 1, createdAt: -1 });

module.exports = registerSchoolScopedModel('CampusPost', campusPostSchema);