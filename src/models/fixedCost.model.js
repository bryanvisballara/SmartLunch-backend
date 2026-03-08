const mongoose = require('mongoose');

const fixedCostSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['fixed', 'variable'], default: 'fixed' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

fixedCostSchema.index({ schoolId: 1, status: 1, deletedAt: 1, storeId: 1, type: 1 });

module.exports = mongoose.model('FixedCost', fixedCostSchema);
