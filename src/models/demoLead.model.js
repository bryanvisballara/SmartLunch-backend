const mongoose = require('mongoose');

const demoLeadSchema = new mongoose.Schema(
  {
    schoolName: { type: String, required: true, trim: true },
    city: { type: String, trim: true, default: '' },
    contactName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true, default: '' },
    children: {
      type: [
        {
          name: { type: String, trim: true, required: true },
          gradeLabel: { type: String, trim: true, default: '' },
          studentId: { type: mongoose.Schema.Types.ObjectId, default: null },
        },
      ],
      default: [],
    },
    demoSchoolId: { type: String, trim: true, default: '', index: true },
    parentUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: {
      type: String,
      enum: ['provisioning', 'ready', 'failed', 'expired', 'deleted'],
      default: 'provisioning',
      index: true,
    },
    errorMessage: { type: String, trim: true, default: '' },
    requestIp: { type: String, trim: true, default: '', index: true },
    firstLoginAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    loginCount: { type: Number, default: 0 },
    pushesScheduledAt: { type: Date, default: null },
    welcomeEmailSentAt: { type: Date, default: null },
    welcomeEmailOpenedAt: { type: Date, default: null },
    welcomeEmailOpenCount: { type: Number, default: 0 },
    followUpEmails: {
      type: [{
        day: Number,
        sentAt: Date,
        openedAt: { type: Date, default: null },
        openCount: { type: Number, default: 0 },
      }],
      default: [],
    },
    followUpUnsubscribedAt: { type: Date, default: null },
    feedPosts: {
      type: [{
        key: String,
        communicationId: { type: mongoose.Schema.Types.ObjectId, default: null },
        publishedAt: Date,
        commentsAdded: { type: Number, default: 0 },
      }],
      default: [],
    },
    expiresAt: { type: Date, default: null, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

demoLeadSchema.index({ createdAt: -1 });

module.exports = mongoose.models.DemoLead || mongoose.model('DemoLead', demoLeadSchema);
