require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
  const db = mongoose.connection.db;

  const studentId = new mongoose.Types.ObjectId('69add8f8de20181b7a591b3e');

  const wallet = await db.collection('wallets').findOne({ studentId });
  const walletTx = await db.collection('wallettransactions').find({ studentId }).sort({ createdAt: -1 }).limit(8).toArray();
  const paymentTx = wallet
    ? await db.collection('paymenttransactions').find({ walletId: wallet._id }).sort({ createdAt: -1 }).limit(8).toArray()
    : [];
  const orders = await db.collection('orders').find({ studentId }).sort({ createdAt: -1 }).limit(5).toArray();

  console.log(JSON.stringify({
    now: new Date().toISOString(),
    wallet: wallet
      ? {
          id: String(wallet._id),
          balance: Number(wallet.balance || 0),
          autoDebitEnabled: Boolean(wallet.autoDebitEnabled),
          autoDebitLimit: Number(wallet.autoDebitLimit || 0),
          autoDebitAmount: Number(wallet.autoDebitAmount || 0),
          autoDebitAgreementStatus: String(wallet.autoDebitAgreementStatus || ''),
          autoDebitRetryAt: wallet.autoDebitRetryAt || null,
          autoDebitRetryCount: Number(wallet.autoDebitRetryCount || 0),
          autoDebitLastChargeAt: wallet.autoDebitLastChargeAt || null,
        }
      : null,
    recentWalletTransactions: walletTx.map((t) => ({
      id: String(t._id),
      type: String(t.type || ''),
      amount: Number(t.amount || 0),
      method: String(t.method || ''),
      notes: String(t.notes || ''),
      createdAt: t.createdAt || null,
    })),
    recentPaymentTransactions: paymentTx.map((p) => ({
      id: String(p._id),
      amount: Number(p.amount || 0),
      status: String(p.status || ''),
      provider: String(p.provider || ''),
      method: String(p.method || ''),
      providerTransactionId: p.providerTransactionId ? String(p.providerTransactionId) : null,
      failureReason: p.failureReason ? String(p.failureReason) : null,
      createdAt: p.createdAt || null,
    })),
    recentOrders: orders.map((o) => ({
      id: String(o._id),
      total: Number(o.total || 0),
      status: String(o.status || ''),
      createdAt: o.createdAt || null,
    })),
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch (e) {
    // ignore disconnect error
  }
  process.exit(1);
});
