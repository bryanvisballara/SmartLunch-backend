const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const parentFeatureSchema = new mongoose.Schema(
  {
    home: { type: Boolean, default: true },
    finance: { type: Boolean, default: true },
    academic: { type: Boolean, default: true },
    cafeteria: { type: Boolean, default: true },
    nursing: { type: Boolean, default: true },
    wellbeing: { type: Boolean, default: true },
    coexistence: { type: Boolean, default: true },
    transport: { type: Boolean, default: true },
  },
  { _id: false }
);

const superAdminSchoolSettingsSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, unique: true, index: true, trim: true },
    subscriptionStatus: { type: String, enum: ['subscribed', 'trial', 'paused', 'disabled'], default: 'subscribed' },
    pricePerStudent: { type: Number, min: 0, default: 0 },
    parentFeatures: { type: parentFeatureSchema, default: () => ({}) },
    notes: { type: String, trim: true, default: '' },
    updatedBy: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = registerSchoolScopedModel('SuperAdminSchoolSettings', superAdminSchoolSettingsSchema);