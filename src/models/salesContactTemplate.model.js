const mongoose = require('mongoose');

const salesContactTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  body: { type: String, required: true, trim: true },
  channel: {
    type: String,
    enum: ['whatsapp', 'email', 'both'],
    default: 'both',
    trim: true,
  },
  sortOrder: { type: Number, default: 0 },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

salesContactTemplateSchema.index({ deletedAt: 1, sortOrder: 1, name: 1 });

module.exports = mongoose.models.SalesContactTemplate
  || mongoose.model('SalesContactTemplate', salesContactTemplateSchema);
