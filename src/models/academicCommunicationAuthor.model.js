const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const academicCommunicationAuthorSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    photoUrl: { type: String, trim: true, default: '' },
    thumbUrl: { type: String, trim: true, default: '' },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    isDefault: { type: Boolean, default: false, index: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

academicCommunicationAuthorSchema.index({ schoolId: 1, active: 1, name: 1 });
academicCommunicationAuthorSchema.index({ schoolId: 1, isDefault: 1, active: 1 });

module.exports = registerSchoolScopedModel('AcademicCommunicationAuthor', academicCommunicationAuthorSchema);
