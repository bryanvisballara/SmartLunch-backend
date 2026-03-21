require("dotenv").config();
const { connectDB } = require("../src/config/db");
const { runAutoDebitCycle } = require("../src/workers/autoDebit.worker");

(async () => {
  try {
    await connectDB();
    console.log("[FORCE] DB connected, running auto-debit cycle...");
    await runAutoDebitCycle();
    console.log("[FORCE] Cycle complete.");
  } catch (e) {
    console.error("[FORCE] Error:", e.message);
    process.exitCode = 1;
  } finally {
    setTimeout(() => process.exit(), 2000);
  }
})();
