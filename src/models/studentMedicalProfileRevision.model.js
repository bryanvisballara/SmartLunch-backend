const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const medicalProfileChangeFieldSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, required: true },
    label: { type: String, trim: true, required: true },
    previousValue: { type: String, trim: true, default: '' },
    nextValue: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const studentMedicalProfileRevisionSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    changedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    changedByName: { type: String, trim: true, default: '' },
    changedByRole: { type: String, trim: true, default: '' },
    source: {
      type: String,
      enum: ['parent', 'academic_secretary', 'nursing', 'admin'],
      default: 'parent',
      index: true,
    },
    previousBloodType: { type: String, trim: true, default: '' },
    nextBloodType: { type: String, trim: true, default: '' },
    previousMedicalProfile: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    nextMedicalProfile: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    changedFields: { type: [medicalProfileChangeFieldSchema], default: [] },
  },
  { timestamps: true }
);

studentMedicalProfileRevisionSchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });

module.exports = registerSchoolScopedModel('StudentMedicalProfileRevision', studentMedicalProfileRevisionSchema);
