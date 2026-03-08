const mongoose = require('mongoose');

const meriendaCostItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const meriendaOperationSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    month: { type: String, required: true, trim: true }, // YYYY-MM
    subscriptionMonthlyCost: { type: Number, default: 0, min: 0 },
    fixedCosts: { type: [meriendaCostItemSchema], default: [] },
    variableCosts: { type: [meriendaCostItemSchema], default: [] },
  },
  { timestamps: true }
);

meriendaOperationSchema.index({ schoolId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('MeriendaOperation', meriendaOperationSchema);
