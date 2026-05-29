const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const hrSupplyRequestItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'HrSupplyItem', default: null },
    customName: { type: String, trim: true, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    approvedQuantity: { type: Number, default: 0, min: 0 },
    deliveredQuantity: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const hrPlannerActivitySchema = new mongoose.Schema(
  {
    date: { type: Date, default: null },
    title: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

const hrSupplyRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    requestType: { type: String, enum: ['material', 'replenishment'], default: 'material', index: true },
    requestedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plannerCycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'HrPlannerCycle', default: null, index: true },
    plannerActivities: [hrPlannerActivitySchema],
    consolidatedFromRequestIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'HrSupplyRequest' }],
    consolidatedRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'HrSupplyRequest', default: null },
    submittedToPurchasingByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedToPurchasingAt: { type: Date, default: null },
    requestedForArea: { type: String, trim: true, default: '' },
    purpose: { type: String, trim: true, default: '' },
    neededByDate: { type: Date, default: null, index: true },
    status: {
      type: String,
      enum: ['pending_coordination_review', 'consolidated', 'pending_hr_review', 'pending_purchasing_review', 'pending_approval', 'approved', 'rejected', 'delivered', 'partially_delivered', 'cancelled'],
      default: 'pending_approval',
      index: true,
    },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium', index: true },
    items: [hrSupplyRequestItemSchema],
    approvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: '' },
    deliveredByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deliveredAt: { type: Date, default: null },
    deliveryNotes: { type: String, trim: true, default: '' },
    receivedByName: { type: String, trim: true, default: '' },
    evidenceUrl: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

hrSupplyRequestSchema.index({ schoolId: 1, status: 1, createdAt: -1 });
hrSupplyRequestSchema.index({ schoolId: 1, requestedByUserId: 1, createdAt: -1 });
hrSupplyRequestSchema.index({ schoolId: 1, plannerCycleId: 1, status: 1 });

module.exports = registerSchoolScopedModel('HrSupplyRequest', hrSupplyRequestSchema);
