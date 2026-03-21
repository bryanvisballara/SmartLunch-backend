require('dotenv').config();
const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const PaymentTransaction = require('../models/paymentTransaction.model');

async function run() {
  const dateText = String(process.argv[2] || '').trim() || new Date().toISOString().slice(0, 10);
  const start = new Date(`${dateText}T00:00:00.000Z`);
  const end = new Date(`${dateText}T23:59:59.999Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid date. Use YYYY-MM-DD');
  }

  await connectDB();

  const rows = await PaymentTransaction.find({
    method: 'bold',
    createdAt: { $gte: start, $lte: end },
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const counts = rows.reduce((acc, row) => {
    const key = String(row.status || 'unknown');
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    ok: true,
    date: dateText,
    total: rows.length,
    counts,
    transactions: rows.map((row) => ({
      id: String(row._id),
      studentId: String(row.studentId || ''),
      amount: Number(row.amount || 0),
      status: String(row.status || ''),
      providerStatus: String(row.providerStatus || ''),
      reference: String(row.reference || ''),
      providerTransactionId: row.providerTransactionId ? String(row.providerTransactionId) : '',
      walletTransactionId: row.walletTransactionId ? String(row.walletTransactionId) : '',
      approvedAt: row.approvedAt || null,
      createdAt: row.createdAt || null,
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