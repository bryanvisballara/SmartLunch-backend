const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const hrPurchaseAreaSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true, lowercase: true, index: true },
    budgetAmount: { type: Number, default: 0, min: 0 },
    spentAmount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    order: { type: Number, default: 100 },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

hrPurchaseAreaSchema.index({ schoolId: 1, key: 1 }, { unique: true });
hrPurchaseAreaSchema.index({ schoolId: 1, status: 1, order: 1 });

module.exports = registerSchoolScopedModel('HrPurchaseArea', hrPurchaseAreaSchema);
