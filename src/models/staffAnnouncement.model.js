const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const STAFF_ANNOUNCEMENT_TARGET_ROLES = [
  'teacher',
  'psychology',
  'nursing',
  'academic_secretary',
  'admissions',
  'coordination',
  'billing',
];

const staffAnnouncementSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    senderName: { type: String, trim: true, default: '' },
    senderRole: { type: String, trim: true, default: '' },
    targetRoles: {
      type: [{ type: String, enum: STAFF_ANNOUNCEMENT_TARGET_ROLES }],
      default: () => [...STAFF_ANNOUNCEMENT_TARGET_ROLES],
    },
    sourceType: {
      type: String,
      enum: ['manual', 'hr_planner_cycle'],
      default: 'manual',
      index: true,
    },
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    status: { type: String, enum: ['published', 'archived'], default: 'published', index: true },
    publishedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

staffAnnouncementSchema.index({ schoolId: 1, status: 1, publishedAt: -1 });
staffAnnouncementSchema.index({ schoolId: 1, senderUserId: 1, publishedAt: -1 });

module.exports = registerSchoolScopedModel('StaffAnnouncement', staffAnnouncementSchema);
