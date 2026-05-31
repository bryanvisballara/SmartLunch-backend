const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const studentBillingProfileSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    grade: { type: String, trim: true, default: '' },
    academicYear: { type: String, trim: true, default: '' },
    entryDate: { type: Date, default: null },
    enrollmentBonusAmount: { type: Number, min: 0, default: 0 },
    enrollmentBonusInstallments: { type: Number, min: 1, max: 12, default: 1 },
    annualTuitionAmount: { type: Number, min: 0, default: 0 },
    annualTuitionInstallments: { type: Number, min: 1, max: 12, default: 1 },
    annualTuitionBaseAmount: { type: Number, min: 0, default: 0 },
    annualTuitionDiscountAmount: { type: Number, min: 0, default: 0 },
    annualTuitionBenefitLabel: { type: String, trim: true, default: '' },
    annualTuitionAdditionalDiscountPercent: { type: Number, min: 0, max: 100, default: 0 },
    annualTuitionAdditionalDiscountAmount: { type: Number, min: 0, default: 0 },
    annualTuitionAdditionalDiscountLabel: { type: String, trim: true, default: '' },
    monthlyTuitionAmount: { type: Number, min: 0, default: 0 },
    initialEnrollmentAndFirstTuitionPaid: { type: Boolean, default: false },
    monthlyTuitionAdditionalDiscountPercent: { type: Number, min: 0, max: 100, default: 0 },
    monthlyTuitionAdditionalDiscountLabel: { type: String, trim: true, default: '' },
    dueDay: { type: Number, min: 1, max: 28, default: 10 },
    benefitRules: {
      type: [
        {
          label: { type: String, trim: true, default: '' },
          startDay: { type: Number, min: 1, max: 31, default: 1 },
          endDay: { type: Number, min: 1, max: 31, default: 10 },
          discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
          discountPercent: { type: Number, min: 0, max: 100, default: 0 },
          fixedAmountsByGrade: { type: Map, of: Number, default: {} },
        },
      ],
      default: [],
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

studentBillingProfileSchema.index({ schoolId: 1, studentId: 1 }, { unique: true });

module.exports = registerSchoolScopedModel('StudentBillingProfile', studentBillingProfileSchema);