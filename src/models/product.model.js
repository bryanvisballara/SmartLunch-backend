const mongoose = require('mongoose');

const sanitizeImageLikeUrl = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  if (/^data:image\//i.test(normalized)) {
    return '';
  }
  return normalized;
};

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

productSchema.pre('save', function sanitizeImageFields(next) {
  this.imageUrl = sanitizeImageLikeUrl(this.imageUrl);
  this.thumbUrl = sanitizeImageLikeUrl(this.thumbUrl);
  next();
});

productSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function sanitizeImageUpdate(next) {
  const update = this.getUpdate() || {};

  if (Object.prototype.hasOwnProperty.call(update, 'imageUrl')) {
    update.imageUrl = sanitizeImageLikeUrl(update.imageUrl);
  }
  if (Object.prototype.hasOwnProperty.call(update, 'thumbUrl')) {
    update.thumbUrl = sanitizeImageLikeUrl(update.thumbUrl);
  }

  if (update.$set) {
    if (Object.prototype.hasOwnProperty.call(update.$set, 'imageUrl')) {
      update.$set.imageUrl = sanitizeImageLikeUrl(update.$set.imageUrl);
    }
    if (Object.prototype.hasOwnProperty.call(update.$set, 'thumbUrl')) {
      update.$set.thumbUrl = sanitizeImageLikeUrl(update.$set.thumbUrl);
    }
  }

  this.setUpdate(update);
  next();
});

module.exports = mongoose.model('Product', productSchema);
