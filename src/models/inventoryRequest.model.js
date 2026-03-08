const mongoose = require('mongoose');

const inventoryRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    targetStoreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    batchId: { type: String, trim: true, index: true },
    type: { type: String, enum: ['in', 'out', 'transfer'], required: true },
    quantity: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

inventoryRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryRequest', inventoryRequestSchema);
