const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const campusSchoolRouteStopSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentNameSnapshot: { type: String, trim: true, default: '' },
    studentGrade: { type: String, trim: true, default: '' },
    studentCourse: { type: String, trim: true, default: '' },
    pickupAddress: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    order: { type: Number, default: 0, index: true },
    status: {
      type: String,
      enum: ['pending', 'on_way', 'arrived', 'picked_up', 'skipped'],
      default: 'pending',
      index: true,
    },
    statusUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const campusSchoolRouteSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    driverUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    routeName: { type: String, trim: true, default: 'Ruta escolar' },
    status: { type: String, enum: ['draft', 'active', 'completed'], default: 'draft', index: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    stops: [campusSchoolRouteStopSchema],
  },
  { timestamps: true }
);

campusSchoolRouteSchema.index({ schoolId: 1, driverUserId: 1 }, { unique: true });

module.exports = registerSchoolScopedModel('CampusSchoolRoute', campusSchoolRouteSchema);