const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const hrPlannerCycleSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    title: { type: String, required: true, trim: true },
    startDate: { type: Date, default: null, index: true },
    endDate: { type: Date, default: null, index: true },
    submissionDeadline: { type: Date, required: true, index: true },
    instructions: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

hrPlannerCycleSchema.index({ schoolId: 1, status: 1, submissionDeadline: 1 });

module.exports = registerSchoolScopedModel('HrPlannerCycle', hrPlannerCycleSchema);