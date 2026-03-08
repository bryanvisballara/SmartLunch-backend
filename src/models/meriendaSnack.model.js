const mongoose = require('mongoose');

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

module.exports = mongoose.model('MeriendaSnack', meriendaSnackSchema);
