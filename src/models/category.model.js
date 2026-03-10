const mongoose = require('mongoose');

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

module.exports = mongoose.model('Category', categorySchema);
