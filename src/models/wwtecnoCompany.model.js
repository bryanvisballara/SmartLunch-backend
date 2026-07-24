const mongoose = require('mongoose');

// Atlas M0 exceeded the 500-collection limit. Reuse an empty control-DB collection
// that has no unique compound indexes (safe for holding-platform documents).
const wwtecnoCompanySchema = new mongoose.Schema(
  {
    wwEntity: { type: String, default: 'company', index: true },
    companyId: { type: String, required: true, unique: true, trim: true, index: true },
    legalName: { type: String, required: true, trim: true },
    tradeName: { type: String, trim: true, default: '' },
    nit: { type: String, trim: true, default: '' },
    dv: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active' },
    isHolding: { type: Boolean, default: false },
    taxResponsibilities: { type: [String], default: () => ['R-99-PN'] },
    address: {
      line: { type: String, default: '' },
      cityCode: { type: String, default: '11001' },
      cityName: { type: String, default: 'Bogotá' },
      departmentCode: { type: String, default: '11' },
      departmentName: { type: String, default: 'Bogotá' },
    },
    branding: {
      primaryColor: { type: String, default: '#1B4DFF' },
      logoUrl: { type: String, default: '' },
    },
    apps: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'hrplannercycles', strict: false }
);

module.exports = mongoose.models.WwtecnoCompany || mongoose.model('WwtecnoCompany', wwtecnoCompanySchema);
