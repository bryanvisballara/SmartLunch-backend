const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, lowercase: true, trim: true },
    email: { type: String, lowercase: true, trim: true, default: '' },
    phone: { type: String, trim: true },
    assignedStoreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['parent', 'admin', 'vendor', 'merienda_operator'], required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    deletedAt: { type: Date, default: null },
    deletionRequestedByUser: { type: Boolean, default: false, index: true },
    deletionRequestedAt: { type: Date, default: null },
    webauthn: {
      registrationChallenge: { type: String, default: null },
      authenticationChallenge: { type: String, default: null },
      credentials: [
        {
          credentialID: { type: String, required: true },
          publicKey: { type: String, required: true },
          counter: { type: Number, default: 0 },
          transports: [{ type: String }],
          deviceType: { type: String, default: 'singleDevice' },
          backedUp: { type: Boolean, default: false },
          createdAt: { type: Date, default: Date.now },
          lastUsedAt: { type: Date, default: null },
        },
      ],
    },
  },
  { timestamps: true }
);

userSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
