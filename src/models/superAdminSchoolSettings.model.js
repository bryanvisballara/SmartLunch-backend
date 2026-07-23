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

const schoolBillingPartySchema = new mongoose.Schema(
  {
    legalName: { type: String, trim: true, default: '' },
    nit: { type: String, trim: true, default: '' },
    dv: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    personType: { type: String, enum: ['1', '2'], default: '1' },
    fiscalResponsibilities: { type: [String], default: () => ['R-99-PN'] },
    taxLevelCode: { type: String, trim: true, default: 'R-99-PN' },
    addressLine: { type: String, trim: true, default: '' },
    cityCode: { type: String, trim: true, default: '11001' },
    cityName: { type: String, trim: true, default: 'Bogotá' },
    departmentCode: { type: String, trim: true, default: '11' },
    departmentName: { type: String, trim: true, default: 'Bogotá' },
    postalCode: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const superAdminSchoolSettingsSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, unique: true, index: true, trim: true },
    subscriptionStatus: { type: String, enum: ['subscribed', 'trial', 'paused', 'disabled'], default: 'subscribed' },
    pricePerStudent: { type: Number, min: 0, default: 0 },
    parentFeatures: { type: parentFeatureSchema, default: () => ({}) },
    billingParty: { type: schoolBillingPartySchema, default: () => ({}) },
    notes: { type: String, trim: true, default: '' },
    updatedBy: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = registerSchoolScopedModel('SuperAdminSchoolSettings', superAdminSchoolSettingsSchema);