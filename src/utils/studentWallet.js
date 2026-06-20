const Wallet = require('../models/wallet.model');
const Student = require('../models/student.model');

async function ensureStudentWallet({ schoolId, studentId, session = null }) {
  const normalizedSchoolId = String(schoolId || '').trim();
  const normalizedStudentId = String(studentId || '').trim();

  if (!normalizedSchoolId || !normalizedStudentId) {
    return null;
  }

  let walletQuery = Wallet.findOne({ schoolId: normalizedSchoolId, studentId: normalizedStudentId });
  if (session) {
    walletQuery = walletQuery.session(session);
  }

  const existingWallet = await walletQuery;
  if (existingWallet) {
    return existingWallet;
  }

  const studentQuery = Student.findOne({
    _id: normalizedStudentId,
    schoolId: normalizedSchoolId,
    deletedAt: null,
  }).select('_id');

  if (session) {
    studentQuery.session(session);
  }

  const student = await studentQuery;
  if (!student) {
    return null;
  }

  const createPayload = [{
    schoolId: normalizedSchoolId,
    studentId: student._id,
    balance: 0,
    status: 'active',
  }];

  if (session) {
    const [wallet] = await Wallet.create(createPayload, { session });
    return wallet;
  }

  const [wallet] = await Wallet.create(createPayload);
  return wallet;
}

module.exports = {
  ensureStudentWallet,
};
