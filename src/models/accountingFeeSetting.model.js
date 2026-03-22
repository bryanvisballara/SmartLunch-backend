const mongoose = require('mongoose');

const accountingFeeSettingSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, unique: true, index: true },
    dataphonePercent: { type: Number, default: 0, min: 0 },
    dataphoneFixedFee: { type: Number, default: 0, min: 0 },
    dataphoneRetentionPercent: { type: Number, default: 0, min: 0 },
    qrPercent: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AccountingFeeSetting', accountingFeeSettingSchema);
