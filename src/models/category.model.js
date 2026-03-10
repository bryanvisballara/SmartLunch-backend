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

const categorySchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    imageUrl: { type: String, trim: true, default: '' },
    thumbUrl: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

categorySchema.index({ schoolId: 1, name: 1 }, { unique: true });

categorySchema.pre('save', function sanitizeImageFields(next) {
  this.imageUrl = sanitizeImageLikeUrl(this.imageUrl);
  this.thumbUrl = sanitizeImageLikeUrl(this.thumbUrl);
  next();
});

categorySchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function sanitizeImageUpdate(next) {
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

module.exports = mongoose.model('Category', categorySchema);
