const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    contactName: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    notes: { type: String, default: '', trim: true },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

supplierSchema.index({ schoolId: 1, name: 1 }, { unique: true });
supplierSchema.index({ schoolId: 1, status: 1, deletedAt: 1 });

module.exports = mongoose.model('Supplier', supplierSchema);