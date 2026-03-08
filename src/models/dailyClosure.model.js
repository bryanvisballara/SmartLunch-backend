const mongoose = require('mongoose');

const dailyClosureSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    systemCash: { type: Number, required: true, default: 0 },
    systemQr: { type: Number, required: true, default: 0 },
    systemTransfer: { type: Number, required: true, default: 0 },
    systemDataphone: { type: Number, required: true, default: 0 },
    systemWallet: { type: Number, required: true, default: 0 },
    totalSales: { type: Number, required: true, default: 0 },
    cashAccordingSystem: { type: Number, required: true, default: 0 },
    baseInitial: { type: Number, required: true, default: 0 },
    baseFinal: { type: Number, required: true, default: 0 },
    countedCash: { type: Number, required: true, default: 0 },
    totalCashSaved: { type: Number, required: true, default: 0 },
    cashDifference: { type: Number, required: true, default: 0 },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

dailyClosureSchema.index({ storeId: 1, vendorId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyClosure', dailyClosureSchema);
