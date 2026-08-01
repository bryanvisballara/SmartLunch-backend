const mongoose = require('mongoose');

// Atlas M0 collection limit: reuse an existing empty control-DB collection.
const conectaCursorSchema = new mongoose.Schema(
  {
    conectaEntity: { type: String, default: 'cursor', index: true },
    schoolId: { type: String, required: true, trim: true },
    userId: { type: String, required: true, trim: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'academicbillingfollowups', strict: false }
);

conectaCursorSchema.index({ conectaEntity: 1, schoolId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.ConectaCursor || mongoose.model('ConectaCursor', conectaCursorSchema);
