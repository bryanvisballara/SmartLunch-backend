const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const academicChargeSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    billingProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentBillingProfile', default: null },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByRole: { type: String, trim: true, default: '' },
    category: {
      type: String,
      enum: ['enrollment_bonus', 'annual_tuition', 'monthly_tuition', 'monthly_statement', 'additional'],
      required: true,
      index: true,
    },
    breakdownItems: {
      type: [
        {
          key: { type: String, trim: true, default: '' },
          label: { type: String, trim: true, default: '' },
          amount: { type: Number, min: 0, default: 0 },
          originalAmount: { type: Number, min: 0, default: 0 },
          benefitLabel: { type: String, trim: true, default: '' },
          installmentIndex: { type: Number, min: 0, default: 0 },
          installmentTotal: { type: Number, min: 0, default: 0 },
        },
      ],
      default: [],
    },
    concept: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    amount: { type: Number, required: true, min: 1 },
    originalAmount: { type: Number, min: 0, default: 0 },
    dueDate: { type: Date, required: true, index: true },
    monthKey: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['pending', 'paid', 'cancelled', 'overdue'], default: 'pending', index: true },
    paidAt: { type: Date, default: null },
    paymentMethod: { type: String, trim: true, default: '' },
    audienceType: { type: String, enum: ['general', 'grade', 'course', 'individual', 'enrollment'], default: 'individual' },
    targetGrade: { type: String, trim: true, default: '' },
    targetCourse: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

academicChargeSchema.index({ schoolId: 1, parentId: 1, status: 1, dueDate: 1 });
academicChargeSchema.index({ schoolId: 1, studentId: 1, status: 1, dueDate: 1 });

module.exports = registerSchoolScopedModel('AcademicCharge', academicChargeSchema);