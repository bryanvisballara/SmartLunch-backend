const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const candidateFields = {
  profileId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  schoolId: { type: String, required: true, trim: true, index: true },
  studentId: { type: String, required: true, trim: true, index: true },
  userId: { type: String, required: true, trim: true },
  displayName: { type: String, required: true, trim: true, maxlength: 80 },
  avatarUrl: { type: String, trim: true, default: '', maxlength: 2000 },
  schoolName: { type: String, trim: true, default: '', maxlength: 180 },
  ageBand: { type: String, enum: ['', '6-8', '9-11', '12-14', '15-17'], default: '', index: true },
  mode: { type: String, enum: ['1v1', 'ffa3', 'ffa4', '2v2'], required: true, index: true },
  subjectKey: { type: String, trim: true, default: '', index: true },
  gradeKey: { type: String, trim: true, default: '', index: true },
  status: { type: String, enum: ['waiting', 'matching', 'matched', 'cancelled'], default: 'waiting', index: true },
  claimToken: { type: String, trim: true, default: '' },
  matchId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  expiresAt: { type: Date, required: true, index: true },
};

function buildSchema() {
  const schema = new mongoose.Schema(candidateFields, { timestamps: true });
  schema.index({ mode: 1, ageBand: 1, gradeKey: 1, status: 1, createdAt: 1 });
  schema.index(
    { schoolId: 1, studentId: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['waiting', 'matching'] } } }
  );
  return schema;
}

const TriviaCandidate = registerSchoolScopedModel('TriviaCandidate', buildSchema());
const GlobalTriviaCandidate = mongoose.models.GlobalTriviaCandidate
  || mongoose.model('GlobalTriviaCandidate', buildSchema());

module.exports = { TriviaCandidate, GlobalTriviaCandidate };
