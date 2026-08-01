const mongoose = require('mongoose');

// Atlas M0 collection limit: reuse an existing empty control-DB collection.
const informaCursorSchema = new mongoose.Schema(
  {
    informaEntity: { type: String, default: 'cursor', index: true },
    schoolId: { type: String, required: true, trim: true },
    userId: { type: String, required: true, trim: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'academicchargeadjustmentrequests', strict: false }
);

informaCursorSchema.index({ informaEntity: 1, schoolId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.InformaCursor || mongoose.model('InformaCursor', informaCursorSchema);
