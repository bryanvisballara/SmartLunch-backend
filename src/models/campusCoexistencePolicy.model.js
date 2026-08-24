const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const coexistenceInfractionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    code: { type: String, trim: true, default: '' },
    categoryKey: { type: String, trim: true, default: '' },
    categoryLabel: { type: String, trim: true, default: '' },
    label: { type: String, required: true, trim: true },
    deductionPercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
    severityPercent: { type: Number, min: 0, max: 100, default: 0 },
    description: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 10 },
  },
  { _id: false }
);

const campusCoexistencePolicySchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, unique: true, index: true, trim: true },
    startingScore: { type: Number, default: 100, min: 0, max: 100 },
    infractions: { type: [coexistenceInfractionSchema], default: [] },
    updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = registerSchoolScopedModel('CampusCoexistencePolicy', campusCoexistencePolicySchema);
