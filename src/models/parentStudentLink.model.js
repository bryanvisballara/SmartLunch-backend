const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const parentStudentLinkSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    relationship: { type: String, trim: true, default: 'parent' },
    isPrimaryContact: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

parentStudentLinkSchema.index({ parentId: 1, studentId: 1 }, { unique: true });

module.exports = registerSchoolScopedModel('ParentStudentLink', parentStudentLinkSchema);
