const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const academicFeeConfigurationSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, unique: true, index: true },
    academicYear: { type: String, trim: true, default: '' },
    schoolYearStartDate: { type: Date, default: null },
    schoolYearEndDate: { type: Date, default: null },
    lateEnrollmentSurchargeType: {
      type: String,
      enum: ['none', 'percent', 'fixed'],
      default: 'none',
    },
    lateEnrollmentSurchargeValue: { type: Number, min: 0, default: 0 },
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
    gradeSettings: {
      type: [
        {
          grade: { type: String, trim: true, required: true },
          enrollmentFee: { type: Number, min: 0, default: 0 },
          monthlyTuition: { type: Number, min: 0, default: 0 },
          enrollmentBonus: { type: Number, min: 0, default: 0 },
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
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = registerSchoolScopedModel('AcademicFeeConfiguration', academicFeeConfigurationSchema);