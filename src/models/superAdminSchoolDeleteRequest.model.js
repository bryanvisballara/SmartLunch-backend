const mongoose = require('mongoose');

const superAdminSchoolDeleteRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    schoolName: { type: String, trim: true, default: '' },
    tokenHash: { type: String, required: true, unique: true, index: true },
    requestedBy: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.SuperAdminSchoolDeleteRequest
  || mongoose.model('SuperAdminSchoolDeleteRequest', superAdminSchoolDeleteRequestSchema);
