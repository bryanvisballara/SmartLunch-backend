const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const colibriGameScoreSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    playerName: { type: String, required: true, trim: true, maxlength: 80 },
    schoolName: { type: String, trim: true, maxlength: 120, default: '' },
    score: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

colibriGameScoreSchema.index({ schoolId: 1, score: -1, createdAt: -1 });
colibriGameScoreSchema.index({ schoolId: 1, userId: 1, score: -1 });

module.exports = registerSchoolScopedModel('ColibriGameScore', colibriGameScoreSchema);
