const mongoose = require('mongoose');

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
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    paymentMethod: { type: String, enum: ['system', 'cash', 'transfer', 'qr', 'dataphone', 'school_billing'], required: true },
    schoolBillingFor: { type: String, trim: true, default: '' },
    schoolBillingResponsible: { type: String, trim: true, default: '' },
    schoolBillingStatus: { type: String, enum: ['pending', 'collected'], default: 'pending' },
    schoolBillingCollectedAt: { type: Date, default: null },
    schoolBillingCollectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    items: { type: [orderItemSchema], required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: ['completed', 'cancelled'], default: 'completed' },
  },
  { timestamps: true }
);

orderSchema.index({ storeId: 1, createdAt: -1 });
orderSchema.index({ studentId: 1, createdAt: -1 });
orderSchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
