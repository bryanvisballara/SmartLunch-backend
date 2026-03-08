const mongoose = require('mongoose');

const orderCancellationRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderCancellationRequestSchema.index({ schoolId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('OrderCancellationRequest', orderCancellationRequestSchema);