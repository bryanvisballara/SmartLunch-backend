const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const invitedPlayerSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, trim: true },
    studentId: { type: String, required: true, trim: true },
    userId: { type: String, trim: true, default: '' },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    avatarUrl: { type: String, trim: true, default: '', maxlength: 2000 },
    schoolName: { type: String, trim: true, default: '', maxlength: 180 },
    ageBand: { type: String, enum: ['', '6-8', '9-11', '12-14', '15-17'], default: '' },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    respondedAt: { type: Date, default: null },
  },
  { _id: false }
);

const invitationFields = {
  schoolId: { type: String, required: true, trim: true, index: true },
  createdByStudentId: { type: String, required: true, trim: true, index: true },
  createdByUserId: { type: String, required: true, trim: true },
  createdByDisplayName: { type: String, required: true, trim: true, maxlength: 80 },
  createdByAvatarUrl: { type: String, trim: true, default: '', maxlength: 2000 },
  createdBySchoolName: { type: String, trim: true, default: '', maxlength: 180 },
  createdByAgeBand: { type: String, enum: ['', '6-8', '9-11', '12-14', '15-17'], default: '' },
  mode: { type: String, enum: ['1v1', 'ffa3', 'ffa4', '2v2'], required: true },
  duelKey: { type: String, trim: true, default: '' },
  subjectKey: { type: String, trim: true, default: '' },
  gradeKey: { type: String, trim: true, default: '' },
  ageBand: { type: String, enum: ['', '6-8', '9-11', '12-14', '15-17'], default: '', index: true },
  invited: { type: [invitedPlayerSchema], required: true },
  status: {
    type: String,
    enum: ['pending', 'matching', 'accepted', 'declined', 'cancelled', 'expired'],
    default: 'pending',
    index: true,
  },
  matchId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  expiresAt: { type: Date, required: true, index: true },
};

function buildSchema() {
  const schema = new mongoose.Schema(invitationFields, { timestamps: true });
  schema.index({ 'invited.schoolId': 1, 'invited.studentId': 1, status: 1, createdAt: -1 });
  schema.index(
    { duelKey: 1 },
    {
      unique: true,
      partialFilterExpression: {
        duelKey: { $gt: '' },
        mode: '1v1',
        status: 'pending',
      },
    }
  );
  return schema;
}

const TriviaInvitation = registerSchoolScopedModel('TriviaInvitation', buildSchema());
const GlobalTriviaInvitation = mongoose.models.GlobalTriviaInvitation
  || mongoose.model('GlobalTriviaInvitation', buildSchema());

module.exports = { TriviaInvitation, GlobalTriviaInvitation };
