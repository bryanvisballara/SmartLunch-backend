const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    schoolCode: { type: String, trim: true },
    grade: { type: String, trim: true },
    dailyLimit: { type: Number, default: 0 },
    blockedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    blockedCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

studentSchema.index({ schoolId: 1, status: 1 });
studentSchema.index({ schoolId: 1, name: 1 });

module.exports = mongoose.model('Student', studentSchema);
