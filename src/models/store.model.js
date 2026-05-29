const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const storeSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = registerSchoolScopedModel('Store', storeSchema);
