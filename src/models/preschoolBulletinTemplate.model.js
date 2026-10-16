const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const preschoolIndicatorSchema = new mongoose.Schema(
  {
    text: { type: String, trim: true, default: '' },
    subjectKey: { type: String, trim: true, default: '' },
    subjectLabel: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

const preschoolBlockSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['dimension', 'topic'], default: 'dimension' },
    name: { type: String, trim: true, default: '' },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    teacherName: { type: String, trim: true, default: '' },
    indicators: { type: [preschoolIndicatorSchema], default: [] },
  },
  { _id: true }
);

const preschoolBulletinTemplateSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    gradeKey: { type: String, required: true, trim: true, index: true },
    gradeLabel: { type: String, trim: true, default: '' },
    academicPeriodKey: { type: String, trim: true, default: '', index: true },
    academicPeriodLabel: { type: String, trim: true, default: '' },
    blocks: { type: [preschoolBlockSchema], default: [] },
    updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

preschoolBulletinTemplateSchema.index(
  { schoolId: 1, gradeKey: 1, academicPeriodKey: 1 },
  { unique: true }
);

module.exports = registerSchoolScopedModel('PreschoolBulletinTemplate', preschoolBulletinTemplateSchema);
