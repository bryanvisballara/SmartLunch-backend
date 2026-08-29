const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    nameSnapshot: { type: String, required: true },
    unitPriceSnapshot: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    guestSale: { type: Boolean, default: false },
    guestName: { type: String, trim: true, default: '' },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    orderType: { type: String, enum: ['pos', 'preorder'], default: 'pos', index: true },
    preorderStatus: { type: String, enum: ['pending', 'fulfilled', 'cancelled', ''], default: '', index: true },
    paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'paid' },
    preorderPlacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    fulfilledAt: { type: Date, default: null },
    fulfilledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    paymentMethod: { type: String, enum: ['system', 'cash', 'transfer', 'qr', 'dataphone', 'school_billing'], required: true },
    schoolBillingFor: { type: String, trim: true, default: '' },
    schoolBillingResponsible: { type: String, trim: true, default: '' },
    schoolBillingStatus: { type: String, enum: ['pending', 'collected'], default: 'pending' },
    schoolBillingCollectedAt: { type: Date, default: null },
    schoolBillingCollectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    schoolBillingStatementId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolBillingStatement', default: null },
    items: { type: [orderItemSchema], required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'completed' },
    dispatchStatus: { type: String, enum: ['pending', 'dispatched', 'not_required'], default: 'not_required', index: true },
    dispatchedAt: { type: Date, default: null },
    dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

orderSchema.index({ storeId: 1, createdAt: -1 });
orderSchema.index({ schoolId: 1, storeId: 1, dispatchStatus: 1, createdAt: 1 });
orderSchema.index({ schoolId: 1, storeId: 1, orderType: 1, preorderStatus: 1, createdAt: 1 });
orderSchema.index({ studentId: 1, createdAt: -1 });
orderSchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

module.exports = registerSchoolScopedModel('Order', orderSchema);
