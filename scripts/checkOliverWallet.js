require('dotenv').config();
const { connectDB } = require('../src/config/db');
const Student = require('../src/models/student.model');
const Wallet = require('../src/models/wallet.model');
(async () => {
  await connectDB();
  const student = await Student.findOne({ name: /oliver\s|oliver$/i }).lean();
  if (!student) { console.log('Student not found'); process.exit(1); }
  const wallet = await Wallet.findOne({ studentId: student._id }).lean();
  console.log(JSON.stringify({
    studentName: student.name,
    balance: wallet.balance,
    autoDebitEnabled: wallet.autoDebitEnabled,
    autoDebitThreshold: wallet.autoDebitThreshold,
    autoDebitLimit: wallet.autoDebitLimit,
    autoDebitAmount: wallet.autoDebitAmount,
    autoDebitMonthlyLimit: wallet.autoDebitMonthlyLimit,
    autoDebitMonthlyUsed: wallet.autoDebitMonthlyUsed,
    autoDebitPaymentMethod: wallet.autoDebitPaymentMethod,
    autoDebitPaymentMethodId: wallet.autoDebitPaymentMethodId,
    autoDebitAgreementStatus: wallet.autoDebitAgreementStatus,
    autoDebitAgreementId: wallet.autoDebitAgreementId,
    autoDebitRetryCount: wallet.autoDebitRetryCount,
    autoDebitLastChargeAt: wallet.autoDebitLastChargeAt,
    autoDebitLockedAt: wallet.autoDebitLockedAt,
    autoDebitInProgress: wallet.autoDebitInProgress,
    autoDebitLockAt: wallet.autoDebitLockAt,
  }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
