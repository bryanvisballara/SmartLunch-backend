const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true, default: 0 },
    tags: [{ type: String, trim: true }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

productSchema.index({ schoolId: 1, storeId: 1, status: 1 });
productSchema.index({ storeId: 1 });

module.exports = mongoose.model('Product', productSchema);
