require('dotenv').config();
const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const Student = require('../models/student.model');
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/walletTransaction.model');
const PaymentTransaction = require('../models/paymentTransaction.model');

async function run() {
  const query = String(process.argv[2] || '').trim();

  if (!query) {
    throw new Error('Student name query is required');
  }

  await connectDB();

  const student = await Student.findOne({
    name: { $regex: query, $options: 'i' },
  }).lean();

  if (!student) {
    console.log(JSON.stringify({ ok: false, message: 'student not found' }, null, 2));
    return;
  }

  const wallet = await Wallet.findOne({ studentId: student._id }).lean();
  const walletTransactions = await WalletTransaction.find({ studentId: student._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  const paymentTransactions = await PaymentTransaction.find({ studentId: student._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  console.log(JSON.stringify({
    ok: true,
    now: new Date().toISOString(),
    student: {
      id: String(student._id),
      name: student.name,
      schoolId: student.schoolId,
      status: student.status,
    },
    wallet: wallet
      ? {
          id: String(wallet._id),
          balance: Number(wallet.balance || 0),
          updatedAt: wallet.updatedAt || null,
          autoDebitEnabled: Boolean(wallet.autoDebitEnabled),
          autoDebitAgreementStatus: String(wallet.autoDebitAgreementStatus || ''),
          autoDebitInProgress: Boolean(wallet.autoDebitInProgress),
          autoDebitRetryAt: wallet.autoDebitRetryAt || null,
          autoDebitRetryCount: Number(wallet.autoDebitRetryCount || 0),
          autoDebitLastChargeAt: wallet.autoDebitLastChargeAt || null,
        }
      : null,
    recentWalletTransactions: walletTransactions.map((item) => ({
      id: String(item._id),
      type: String(item.type || ''),
      amount: Number(item.amount || 0),
      method: String(item.method || ''),
      notes: String(item.notes || ''),
      createdAt: item.createdAt || null,
    })),
    recentPaymentTransactions: paymentTransactions.map((item) => ({
      id: String(item._id),
      amount: Number(item.amount || 0),
      method: String(item.method || ''),
      status: String(item.status || ''),
      providerStatus: String(item.providerStatus || ''),
      reference: String(item.reference || ''),
      providerTransactionId: item.providerTransactionId ? String(item.providerTransactionId) : '',
      walletTransactionId: item.walletTransactionId ? String(item.walletTransactionId) : '',
      approvedAt: item.approvedAt || null,
      failureReason: item.failureReason || '',
      createdAt: item.createdAt || null,
      callbackPayloadPreview: item.callbackPayload && typeof item.callbackPayload === 'object'
        ? Object.keys(item.callbackPayload).slice(0, 12)
        : [],
    })),
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_) {
      // ignore disconnect failure
    }
  });