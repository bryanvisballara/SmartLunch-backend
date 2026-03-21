const mongoose = require("mongoose");
require("dotenv").config({ path: "/Users/usuario/Desktop/Negocios/Programacion/Comergio/.env" });

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
    const db = mongoose.connection.db;
    const wid = new mongoose.Types.ObjectId("69add8f9de20181b7a591b40");
    const w = await db.collection("wallets").findOne({ _id: wid });
    console.log("status:", w.status);
    console.log("autoDebitPaymentMethodId:", JSON.stringify(w.autoDebitPaymentMethodId));
    console.log("autoDebitAmount:", w.autoDebitAmount, "| autoDebitLimit:", w.autoDebitLimit);
    console.log("autoDebitEnabled:", w.autoDebitEnabled);

    const eligible = await db.collection("wallets").find({
      autoDebitEnabled: true,
      status: "active",
      autoDebitAmount: { $gt: 0 },
      autoDebitLimit: { $gt: 0 },
      autoDebitPaymentMethodId: { $ne: null }
    }).toArray();
    console.log("\nEligible wallets (with status:active):", JSON.stringify(
      eligible.map(x => ({ id: x._id, balance: x.balance, status: x.status, retryAt: x.autoDebitRetryAt })),
      null, 2
    ));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
})();
