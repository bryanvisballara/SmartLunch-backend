const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const campusSubmissionAttachmentSchema = new mongoose.Schema(
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

const campusPostSubmissionSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusPost', required: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusCourse', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentUserId: { type: String, trim: true, default: '', index: true },
    note: { type: String, trim: true, default: '' },
    attachments: { type: [campusSubmissionAttachmentSchema], default: [] },
    status: { type: String, enum: ['submitted'], default: 'submitted' },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

campusPostSubmissionSchema.index({ schoolId: 1, postId: 1, studentId: 1 }, { unique: true });
campusPostSubmissionSchema.index({ schoolId: 1, studentId: 1, submittedAt: -1 });

module.exports = registerSchoolScopedModel('CampusPostSubmission', campusPostSubmissionSchema);
