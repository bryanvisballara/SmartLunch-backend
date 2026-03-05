const mongoose = require('mongoose');

const inventoryMovementSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    targetStoreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    type: { type: String, enum: ['in', 'out', 'transfer'], required: true },
    quantity: { type: Number, required: true, min: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

inventoryMovementSchema.index({ storeId: 1, productId: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryMovement', inventoryMovementSchema);
