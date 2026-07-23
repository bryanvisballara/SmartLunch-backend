const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const addressSchema = new mongoose.Schema(
  {
    line: { type: String, trim: true, default: '' },
    cityCode: { type: String, trim: true, default: '11001' },
    cityName: { type: String, trim: true, default: 'Bogotá' },
    postalCode: { type: String, trim: true, default: '' },
    countryCode: { type: String, trim: true, default: 'CO' },
    countryName: { type: String, trim: true, default: 'Colombia' },
    departmentCode: { type: String, trim: true, default: '11' },
    departmentName: { type: String, trim: true, default: 'Bogotá' },
  },
  { _id: false }
);

const dianInvoicingConfigSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, required: true, unique: true, default: 'comergio' },
    environment: { type: String, enum: ['1', '2'], default: '2' },
    supplierName: { type: String, trim: true, default: '' },
    supplierNit: { type: String, trim: true, default: '' },
    supplierDv: { type: String, trim: true, default: '' },
    supplierEmail: { type: String, trim: true, default: '' },
    supplierPhone: { type: String, trim: true, default: '' },
    supplierAddress: { type: addressSchema, default: () => ({}) },
    fiscalResponsibilities: { type: [String], default: () => ['R-99-PN'] },
    taxLevelCode: { type: String, trim: true, default: 'R-99-PN' },
    softwareId: { type: String, trim: true, default: '' },
    softwarePin: { type: String, trim: true, default: '' },
    softwareProviderNit: { type: String, trim: true, default: '' },
    softwareProviderName: { type: String, trim: true, default: '' },
    testSetId: { type: String, trim: true, default: '' },
    authorizationNumber: { type: String, trim: true, default: '' },
    prefix: { type: String, trim: true, default: '' },
    startNumber: { type: Number, default: 1 },
    endNumber: { type: Number, default: 1 },
    authorizationStartDate: { type: Date, default: null },
    authorizationEndDate: { type: Date, default: null },
    technicalKey: { type: String, trim: true, default: '' },
    nextNumber: { type: Number, default: 1 },
    certificateBase64: { type: String, default: '' },
    certificatePassword: { type: String, default: '' },
    certificateFileName: { type: String, trim: true, default: '' },
    certificateUploadedAt: { type: Date, default: null },
    defaultServiceDescription: {
      type: String,
      trim: true,
      default: 'Suscripción plataforma Comergio — servicio SaaS escolar',
    },
    updatedBy: { type: String, trim: true, default: '' },
  },
  { timestamps: true, collection: 'dianinvoicingconfigs' }
);

module.exports = registerSchoolScopedModel('DianInvoicingConfig', dianInvoicingConfigSchema);
