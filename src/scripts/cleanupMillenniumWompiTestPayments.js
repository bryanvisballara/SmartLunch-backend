require('dotenv').config();

const mongoose = require('mongoose');

const { connectDB, runWithSchoolContext } = require('../config/db');
const AcademicChargePayment = require('../models/academicChargePayment.model');
const { executeBillingPaymentDeletion } = require('../services/academicBillingPaymentDeletion.service');

const SCHOOL_ID = 'Millennium School';
const GATEWAY_METHODS = ['wompi', 'parent_portal'];

async function run() {
  const dryRun = process.argv.includes('--dry-run');

  await connectDB();

  const deleted = [];
  const errors = [];

  await runWithSchoolContext(SCHOOL_ID, async () => {
    const payments = await AcademicChargePayment.find({
      schoolId: SCHOOL_ID,
      method: { $in: GATEWAY_METHODS },
    })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();

    console.log(`Found ${payments.length} Wompi/portal payment(s) for ${SCHOOL_ID}`);

    for (const payment of payments) {
      const summary = {
        paymentId: String(payment._id),
        method: payment.method,
        amount: Number(payment.amount || 0),
        studentId: payment.studentId ? String(payment.studentId) : '',
        chargeId: payment.chargeId ? String(payment.chargeId) : '',
      };

      if (dryRun) {
        deleted.push({ ...summary, dryRun: true });
        continue;
      }

      try {
        const result = await executeBillingPaymentDeletion({
          schoolId: SCHOOL_ID,
          paymentId: payment._id,
          allowGateway: true,
        });
        deleted.push({ ...summary, result });
      } catch (error) {
        errors.push({ ...summary, message: error.message });
      }
    }
  });

  console.log(JSON.stringify({
    ok: errors.length === 0,
    dryRun,
    schoolId: SCHOOL_ID,
    deletedCount: deleted.length,
    errorCount: errors.length,
    deleted,
    errors,
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
