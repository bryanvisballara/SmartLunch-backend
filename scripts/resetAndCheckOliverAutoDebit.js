require('dotenv').config();
const { connectDB } = require('../src/config/db');
const User = require('../src/models/user.model');
const ParentStudentLink = require('../src/models/parentStudentLink.model');
const Wallet = require('../src/models/wallet.model');
const PaymentTransaction = require('../src/models/paymentTransaction.model');

async function getContext() {
  const parent = await User.findOne({ email: 'bryan.visbal@gmail.com', deletedAt: null }).lean();
  const link = await ParentStudentLink.findOne({ parentId: parent._id, schoolId: parent.schoolId, status: 'active' }).lean();
  return { parent, link };
}

(async () => {
  await connectDB();
  const { parent, link } = await getContext();
  const wallet = await Wallet.findOneAndUpdate(
    { schoolId: parent.schoolId, studentId: link.studentId },
    {
      $set: {
        autoDebitRetryAt: null,
        autoDebitRetryCount: 0,
        autoDebitInProgress: false,
        autoDebitLockAt: null,
      },
    },
    { new: true }
  ).lean();

  const txs = await PaymentTransaction.find({
    schoolId: parent.schoolId,
    studentId: link.studentId,
    method: 'mercadopago_auto_debit',
  }).sort({ createdAt: -1 }).limit(5).lean();

  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    wallet: {
      balance: wallet?.balance,
      autoDebitRetryAt: wallet?.autoDebitRetryAt,
      autoDebitRetryCount: wallet?.autoDebitRetryCount,
      autoDebitInProgress: wallet?.autoDebitInProgress,
      autoDebitLastChargeAt: wallet?.autoDebitLastChargeAt,
    },
    transactions: txs.map((tx) => ({
      amount: tx.amount,
      status: tx.status,
      providerStatus: tx.providerStatus,
      failureReason: tx.failureReason,
      reference: tx.reference,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    })),
  }, null, 2));

  process.exit(0);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
