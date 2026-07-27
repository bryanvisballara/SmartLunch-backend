/**
 * Repair duplicate annual_tuition charges/payments created once per acudiente
 * when registering cartera payments for Millennium students.
 *
 * Usage:
 *   node src/scripts/repairMillenniumDuplicateMatriculaCharges.js --dry-run
 *   node src/scripts/repairMillenniumDuplicateMatriculaCharges.js
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB, runWithSchoolContext } = require('../config/db');
require('../models');
const AcademicCharge = require('../models/academicCharge.model');
const AcademicChargePayment = require('../models/academicChargePayment.model');
const EnrollmentMatriculaProcess = require('../models/enrollmentMatriculaProcess.model');
const Student = require('../models/student.model');
const { executeBillingPaymentDeletion } = require('../services/academicBillingPaymentDeletion.service');

const SCHOOL_ID = 'Millennium School';

async function repairStudent({ student, dryRun }) {
  const studentId = student._id;
  const charges = await AcademicCharge.find({
    schoolId: SCHOOL_ID,
    studentId,
    category: 'annual_tuition',
  }).sort({ createdAt: 1 }).lean();

  const active = charges.filter((charge) => String(charge.status || '') !== 'cancelled');
  const paid = active.filter((charge) => String(charge.status || '') === 'paid');
  const pending = active.filter((charge) => ['pending', 'overdue'].includes(String(charge.status || '')));

  if (paid.length < 2 && !(paid.length >= 1 && pending.length >= 1)) {
    return null;
  }

  const keepCharge = paid.sort((left, right) => (
    new Date(left.paidAt || left.createdAt || 0) - new Date(right.paidAt || right.createdAt || 0)
  ))[0];

  const payments = await AcademicChargePayment.find({
    schoolId: SCHOOL_ID,
    studentId,
    chargeId: { $in: charges.map((charge) => charge._id) },
  }).sort({ paidAt: 1, createdAt: 1 });

  const keepPayment = payments.find((payment) => String(payment.chargeId) === String(keepCharge._id)) || payments[0];
  const duplicatePayments = payments.filter((payment) => String(payment._id) !== String(keepPayment?._id));
  const duplicatePaidCharges = paid.filter((charge) => String(charge._id) !== String(keepCharge._id));
  const pendingTwins = pending;

  const summary = {
    studentId: String(studentId),
    studentName: student.name,
    keepChargeId: String(keepCharge._id),
    keepPaymentId: keepPayment ? String(keepPayment._id) : null,
    keepAmount: Number(keepCharge.amount || keepPayment?.amount || 0),
    deletedPayments: [],
    cancelledCharges: [],
    removedProcesses: [],
    dryRun,
  };

  if (dryRun) {
    summary.deletedPayments = duplicatePayments.map((payment) => String(payment._id));
    summary.cancelledCharges = [...duplicatePaidCharges, ...pendingTwins].map((charge) => String(charge._id));
    return summary;
  }

  for (const payment of duplicatePayments) {
    await executeBillingPaymentDeletion({
      schoolId: SCHOOL_ID,
      paymentId: payment._id,
      allowGateway: true,
    });
    summary.deletedPayments.push(String(payment._id));
  }

  for (const charge of [...duplicatePaidCharges, ...pendingTwins]) {
    // Deletion may already cancel duplicate paid charges; force-cancel leftovers.
    await AcademicCharge.updateOne(
      { _id: charge._id, schoolId: SCHOOL_ID },
      { $set: { status: 'cancelled' } },
    );
    summary.cancelledCharges.push(String(charge._id));
  }

  const processes = await EnrollmentMatriculaProcess.find({
    schoolId: SCHOOL_ID,
    studentId,
  });
  for (const process of processes) {
    if (String(process.chargeId) === String(keepCharge._id)) {
      continue;
    }
    await EnrollmentMatriculaProcess.deleteOne({ _id: process._id, schoolId: SCHOOL_ID });
    summary.removedProcesses.push(String(process._id));
  }

  // Cancel any remaining pending annual twin after deletion side-effects.
  await AcademicCharge.updateMany(
    {
      schoolId: SCHOOL_ID,
      studentId,
      category: 'annual_tuition',
      status: { $in: ['pending', 'overdue'] },
      _id: { $ne: keepCharge._id },
    },
    { $set: { status: 'cancelled' } },
  );

  return summary;
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDB();

  const results = [];
  await runWithSchoolContext(SCHOOL_ID, async () => {
    const students = await Student.find({ schoolId: SCHOOL_ID }).select('_id name').lean();
    for (const student of students) {
      const repaired = await repairStudent({ student, dryRun });
      if (repaired) {
        results.push(repaired);
      }
    }
  });

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    schoolId: SCHOOL_ID,
    repairedCount: results.length,
    results,
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
      // ignore
    }
  });
