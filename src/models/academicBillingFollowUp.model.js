const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const academicBillingFollowUpSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parentName: { type: String, trim: true, default: '' },
    parentPhone: { type: String, trim: true, default: '' },
    studentNames: { type: [String], default: [] },
    outstandingAmount: { type: Number, default: 0 },
    overdueDays: { type: Number, default: 0 },
    overdueMonths: { type: Number, default: 0 },
    actionType: {
      type: String,
      enum: ['push_email', 'whatsapp', 'manual_note'],
      required: true,
      index: true,
    },
    title: { type: String, trim: true, default: '' },
    body: { type: String, trim: true, default: '' },
    whatsappUrl: { type: String, trim: true, default: '' },
    pushDelivered: { type: Number, default: 0 },
    pushTokensFound: { type: Number, default: 0 },
    emailed: { type: Number, default: 0 },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByRole: { type: String, trim: true, default: '' },
    createdByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

academicBillingFollowUpSchema.index({ schoolId: 1, createdAt: -1 });
academicBillingFollowUpSchema.index({ schoolId: 1, parentId: 1, createdAt: -1 });
academicBillingFollowUpSchema.index({ schoolId: 1, actionType: 1, createdAt: -1 });

module.exports = registerSchoolScopedModel('AcademicBillingFollowUp', academicBillingFollowUpSchema);
