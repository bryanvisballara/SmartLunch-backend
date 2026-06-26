const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const schoolBillingStatementOrderSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String, trim: true, default: '' },
    storeName: { type: String, trim: true, default: '' },
    vendorName: { type: String, trim: true, default: '' },
    studentName: { type: String, trim: true, default: '' },
    total: { type: Number, required: true, default: 0 },
    createdAt: { type: Date, default: null },
    items: {
      type: [{
        nameSnapshot: { type: String, trim: true, default: '' },
        quantity: { type: Number, default: 0 },
        subtotal: { type: Number, default: 0 },
      }],
      default: [],
    },
  },
  { _id: false }
);

const schoolBillingStatementSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    statementNumber: { type: String, required: true, trim: true },
    billingFor: { type: String, trim: true, default: '' },
    billingResponsible: { type: String, trim: true, default: '' },
    orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
    orders: { type: [schoolBillingStatementOrderSchema], default: [] },
    orderCount: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 },
    documentHtml: { type: String, default: '' },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    generatedByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

schoolBillingStatementSchema.index({ schoolId: 1, createdAt: -1 });
schoolBillingStatementSchema.index({ schoolId: 1, statementNumber: 1 }, { unique: true });

module.exports = registerSchoolScopedModel('SchoolBillingStatement', schoolBillingStatementSchema);
