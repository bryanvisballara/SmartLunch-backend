const mongoose = require('mongoose');

const parentStudentLinkSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    relationship: { type: String, trim: true, default: 'parent' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

parentStudentLinkSchema.index({ parentId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('ParentStudentLink', parentStudentLinkSchema);
