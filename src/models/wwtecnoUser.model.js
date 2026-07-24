const mongoose = require('mongoose');

// Atlas M0 exceeded the 500-collection limit. Reuse an empty control-DB collection
// that has no unique compound indexes (safe for holding-platform documents).
const wwtecnoUserSchema = new mongoose.Schema(
  {
    wwEntity: { type: String, default: 'user', index: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    name: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'admin' },
    companyIds: { type: [String], default: [] },
    defaultCompanyId: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'communityreports', strict: false }
);

module.exports = mongoose.models.WwtecnoUser || mongoose.model('WwtecnoUser', wwtecnoUserSchema);
