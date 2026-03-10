const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    sharedProductId: { type: String, trim: true, index: true, default: '' },
    name: { type: String, required: true, trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    price: { type: Number, required: true },
    cost: { type: Number, required: true, default: 0 },
    stock: { type: Number, required: true, default: 0 },
    inventoryAlertStock: { type: Number, required: true, default: 10 },
    imageUrl: { type: String, trim: true, default: '' },
    thumbUrl: { type: String, trim: true, default: '' },
    shortDescription: { type: String, trim: true, default: '' },
    tags: [{ type: String, trim: true }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

productSchema.index({ schoolId: 1, storeId: 1, status: 1 });
productSchema.index({ storeId: 1 });
productSchema.index({ schoolId: 1, sharedProductId: 1, storeId: 1 });

module.exports = mongoose.model('Product', productSchema);
