const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const admissionMarketingAssetSchema = new mongoose.Schema({
  schoolId: { type: String, required: true, index: true, trim: true },
  fileName: { type: String, required: true, unique: true, trim: true, index: true },
  originalName: { type: String, default: '', trim: true },
  mimeType: { type: String, default: 'image/jpeg', trim: true },
  sizeBytes: { type: Number, default: 0 },
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  data: { type: Buffer, required: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
}, { timestamps: true });

admissionMarketingAssetSchema.index({ schoolId: 1, createdAt: -1 });

module.exports = registerSchoolScopedModel('AdmissionMarketingAsset', admissionMarketingAssetSchema);