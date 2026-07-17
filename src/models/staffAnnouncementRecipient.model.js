const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const staffAnnouncementRecipientSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    announcementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StaffAnnouncement',
      required: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    roleSnapshot: { type: String, trim: true, default: '' },
    nameSnapshot: { type: String, trim: true, default: '' },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

staffAnnouncementRecipientSchema.index({ schoolId: 1, announcementId: 1, userId: 1 }, { unique: true });
staffAnnouncementRecipientSchema.index({ schoolId: 1, userId: 1, readAt: 1, createdAt: -1 });
staffAnnouncementRecipientSchema.index({ schoolId: 1, announcementId: 1, readAt: 1 });

module.exports = registerSchoolScopedModel('StaffAnnouncementRecipient', staffAnnouncementRecipientSchema);
