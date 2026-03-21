const mongoose = require("mongoose");
require("dotenv").config({ path: "/Users/usuario/Desktop/Negocios/Programacion/Comergio/.env" });

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
    const db = mongoose.connection.db;
    const walletId = new mongoose.Types.ObjectId("69add8f9de20181b7a591b40");

    const txs = await db.collection("paymenttransactions")
      .find({ walletId })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    console.log("=== Payment Transactions ===");
    txs.forEach(t => console.log(JSON.stringify({
      _id: t._id, status: t.status, providerStatus: t.providerStatus,
      failureReason: (t.failureReason || "").substring(0, 100),
      providerTransactionId: t.providerTransactionId,
      createdAt: t.createdAt
    })));

    const w = await db.collection("wallets").findOne({ _id: walletId });
    console.log("\n=== Wallet auto-debit state ===");
    console.log(JSON.stringify({
      balance: w.balance,
      autoDebitInProgress: w.autoDebitInProgress,
      autoDebitLockAt: w.autoDebitLockAt,
      autoDebitRetryAt: w.autoDebitRetryAt,
      autoDebitRetryCount: w.autoDebitRetryCount,
      autoDebitLastChargeAt: w.autoDebitLastChargeAt
    }, null, 2));
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
})();
