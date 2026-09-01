const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const hrSupplyRequestItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'HrSupplyItem', default: null },
    customName: { type: String, trim: true, default: '' },
    unit: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    unitCost: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, default: 0, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    approvedQuantity: { type: Number, default: 0, min: 0 },
    deliveredQuantity: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const hrPlannerActivityMaterialSchema = new mongoose.Schema(
  {
    materialName: { type: String, trim: true, default: '' },
    quantity: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const hrPlannerActivitySchema = new mongoose.Schema(
  {
    date: { type: Date, default: null },
    title: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    subject: { type: String, trim: true, default: '' },
    grade: { type: String, trim: true, default: '' },
    grades: { type: [String], default: [] },
    courseLabel: { type: String, trim: true, default: '' },
    isEvent: { type: Boolean, default: false },
    materialName: { type: String, trim: true, default: '' },
    quantity: { type: Number, default: 0, min: 0 },
    materials: { type: [hrPlannerActivityMaterialSchema], default: [] },
    purpose: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

const hrSupplyRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'HrPurchaseArea', default: null, index: true },
    requestType: { type: String, enum: ['material', 'purchase', 'replenishment'], default: 'material', index: true },
    requestedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plannerCycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'HrPlannerCycle', default: null, index: true },
    plannerActivities: [hrPlannerActivitySchema],
    noMaterialsNeeded: { type: Boolean, default: false },
    consolidatedFromRequestIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'HrSupplyRequest' }],
    consolidatedRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'HrSupplyRequest', default: null },
    submittedToPurchasingByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedToPurchasingAt: { type: Date, default: null },
    serviceArea: {
      type: String,
      enum: ['teaching', 'cleaning', 'maintenance', 'administration', 'cafeteria', 'nursing', 'sports', 'technology', 'security', 'general'],
      default: 'general',
      index: true,
    },
    needCategory: {
      type: String,
      enum: ['stationery', 'classroom', 'sports', 'technology', 'laboratory', 'music', 'maintenance', 'cleaning', 'construction', 'furniture', 'cafeteria', 'nursing', 'security', 'admin', 'other'],
      default: 'other',
      index: true,
    },
    requestedForArea: { type: String, trim: true, default: '' },
    requestedForPerson: { type: String, trim: true, default: '' },
    purpose: { type: String, trim: true, default: '' },
    neededByDate: { type: Date, default: null, index: true },
    estimatedTotal: { type: Number, default: 0, min: 0 },
    approvedTotal: { type: Number, default: 0, min: 0 },
    budgetCharged: { type: Boolean, default: false, index: true },
    budgetChargedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pending_coordination_review', 'returned_for_correction', 'consolidated', 'pending_hr_review', 'pending_purchasing_review', 'pending_approval', 'approved', 'rejected', 'delivered', 'partially_delivered', 'cancelled'],
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
    coordinationObservation: { type: String, trim: true, default: '' },
    returnedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    returnedAt: { type: Date, default: null },
    resubmittedAt: { type: Date, default: null },
    deliveredByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deliveredAt: { type: Date, default: null },
    deliveryNotes: { type: String, trim: true, default: '' },
    receivedByName: { type: String, trim: true, default: '' },
    evidenceUrl: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

hrSupplyRequestSchema.index({ schoolId: 1, status: 1, createdAt: -1 });
hrSupplyRequestSchema.index({ schoolId: 1, areaId: 1, status: 1, createdAt: -1 });
hrSupplyRequestSchema.index({ schoolId: 1, requestedByUserId: 1, createdAt: -1 });
hrSupplyRequestSchema.index({ schoolId: 1, plannerCycleId: 1, status: 1 });

module.exports = registerSchoolScopedModel('HrSupplyRequest', hrSupplyRequestSchema);
