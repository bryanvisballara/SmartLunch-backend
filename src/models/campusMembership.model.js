const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const campusMembershipSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    memberType: {
      type: String,
      enum: ['campus_parent', 'campus_student', 'campus_teacher', 'campus_coordination', 'campus_school_route'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    permissions: [{ type: String, trim: true }],
    metadata: {
      title: { type: String, trim: true, default: '' },
      launchPath: { type: String, trim: true, default: '' },
      notes: { type: String, trim: true, default: '' },
    },
  },
  { timestamps: true }
);

campusMembershipSchema.index({ schoolId: 1, userId: 1, memberType: 1 }, { unique: true });

module.exports = registerSchoolScopedModel('CampusMembership', campusMembershipSchema);