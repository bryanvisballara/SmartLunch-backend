const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const profileFields = {
  studentId: { type: String, required: true, trim: true, index: true },
  userId: { type: String, required: true, trim: true, index: true },
  displayName: { type: String, required: true, trim: true, maxlength: 80 },
  avatarUrl: { type: String, trim: true, default: '', maxlength: 2000 },
  schoolName: { type: String, trim: true, default: '', maxlength: 180 },
  gradeKey: { type: String, trim: true, default: '', index: true },
  ageBand: { type: String, enum: ['', '6-8', '9-11', '12-14', '15-17'], default: '', index: true },
  gamesPlayed: { type: Number, default: 0, min: 0 },
  wins: { type: Number, default: 0, min: 0 },
  correctAnswers: { type: Number, default: 0, min: 0 },
  answers: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
};

const triviaProfileSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, trim: true, index: true },
    ...profileFields,
  },
  { timestamps: true }
);
triviaProfileSchema.index({ schoolId: 1, studentId: 1 }, { unique: true });

const globalTriviaProfileSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, trim: true, index: true },
    ...profileFields,
    ageBandConfirmedAt: { type: Date, default: null, index: true },
    blockedProfileIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'TriviaNetworkProfile',
      default: [],
      select: false,
    },
    disabledAt: { type: Date, default: null, select: false },
    disabledByUserId: { type: String, trim: true, default: '', select: false },
    disabledReason: { type: String, trim: true, maxlength: 500, default: '', select: false },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
globalTriviaProfileSchema.index(
  { schoolId: 1, studentId: 1 },
  { unique: true, name: 'trivia_network_profile_origin_unique' }
);
globalTriviaProfileSchema.index(
  { ageBand: 1, status: 1, lastActiveAt: -1 },
  { name: 'trivia_network_profile_matchmaking' }
);

const TriviaProfile = registerSchoolScopedModel('TriviaProfile', triviaProfileSchema);
const TriviaNetworkProfile = mongoose.models.TriviaNetworkProfile
  || mongoose.model('TriviaNetworkProfile', globalTriviaProfileSchema);

module.exports = {
  TriviaProfile,
  TriviaNetworkProfile,
  // Compatibility alias for the service while its API layer is migrated.
  GlobalTriviaProfile: TriviaNetworkProfile,
};
