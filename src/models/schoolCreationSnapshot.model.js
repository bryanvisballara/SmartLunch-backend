const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const schoolCreationSnapshotSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, unique: true, index: true, trim: true },
    schoolName: { type: String, required: true, trim: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = registerSchoolScopedModel('SchoolCreationSnapshot', schoolCreationSnapshotSchema);
