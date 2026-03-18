const mongoose = require('mongoose');

const parentPaymentMethodSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['card'], default: 'card', required: true },
    // Keep mercadopago for backward compatibility with legacy saved cards.
    provider: { type: String, enum: ['internal', 'bold', 'epayco', 'mercadopago'], default: 'internal', required: true },
    token: { type: String, required: true, trim: true, unique: true },
    providerCustomerId: { type: String, trim: true, default: '' },
    providerCardId: { type: String, trim: true, default: '' },
    providerPaymentMethodId: { type: String, trim: true, default: '' },
    providerDeviceId: { type: String, trim: true, default: '' },
    fingerprint: { type: String, required: true, trim: true },
    brand: { type: String, trim: true, default: 'unknown' },
    last4: { type: String, required: true, trim: true },
    expMonth: { type: Number, required: true, min: 1, max: 12 },
    expYear: { type: Number, required: true, min: 2000 },
    holderFirstName: { type: String, required: true, trim: true },
    holderLastName: { type: String, required: true, trim: true },
    holderDocType: { type: String, required: true, trim: true },
    holderDocument: { type: String, required: true, trim: true },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'failed'],
      default: 'pending',
      index: true,
    },
    verificationAmount: { type: Number, default: null, min: 1 },
    verificationAttemptCount: { type: Number, default: 0, min: 0 },
    verificationLastRequestedAt: { type: Date, default: null },
    verificationExpiresAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

parentPaymentMethodSchema.index({ schoolId: 1, parentUserId: 1, status: 1, createdAt: -1 });
parentPaymentMethodSchema.index(
  { schoolId: 1, parentUserId: 1, fingerprint: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);

module.exports = mongoose.model('ParentPaymentMethod', parentPaymentMethodSchema);
