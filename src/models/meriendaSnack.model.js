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

const meriendaSnackSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    type: { type: String, enum: ['first', 'second', 'drink'], required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    imageUrl: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

meriendaSnackSchema.index({ schoolId: 1, type: 1 }, { unique: true });

meriendaSnackSchema.pre('save', function sanitizeImageField(next) {
  this.imageUrl = sanitizeImageLikeUrl(this.imageUrl);
  next();
});

meriendaSnackSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function sanitizeImageUpdate(next) {
  const update = this.getUpdate() || {};

  if (Object.prototype.hasOwnProperty.call(update, 'imageUrl')) {
    update.imageUrl = sanitizeImageLikeUrl(update.imageUrl);
  }

  if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'imageUrl')) {
    update.$set.imageUrl = sanitizeImageLikeUrl(update.$set.imageUrl);
  }

  this.setUpdate(update);
  next();
});

module.exports = mongoose.model('MeriendaSnack', meriendaSnackSchema);
