/**
 * Reopen Valentina Ruiz Medina matricula charge with remaining $1.3M balance.
 * Total: $3.300.000 | Already paid (Wompi): $2.000.000 | Outstanding: $1.300.000
 */
require('dotenv').config({ override: true });

const { connectDB, runWithSchoolContext } = require('../src/config/db');
const AcademicCharge = require('../src/models/academicCharge.model');
const AcademicChargePayment = require('../src/models/academicChargePayment.model');
const EnrollmentMatriculaProcess = require('../src/models/enrollmentMatriculaProcess.model');

const SCHOOL_ID = 'Millennium School';
const CHARGE_ID = '6a63d6d074e7ba6846756ca6';
const PROCESS_ID = '6a63d6d274e7ba6846756cb6';
const TOTAL_AMOUNT = 3300000;
const EXPECTED_PAID = 2000000;

(async () => {
  await connectDB();
  await runWithSchoolContext(SCHOOL_ID, async () => {
    const charge = await AcademicCharge.findOne({ _id: CHARGE_ID, schoolId: SCHOOL_ID });
    if (!charge) {
      throw new Error('Charge not found');
    }

    const payments = await AcademicChargePayment.find({ schoolId: SCHOOL_ID, chargeId: charge._id }).lean();
    const paidTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    console.log('before', {
      amount: charge.amount,
      status: charge.status,
      paidTotal,
      payments: payments.length,
    });

    if (Math.round(paidTotal) !== EXPECTED_PAID) {
      throw new Error(`Unexpected paid total ${paidTotal}, expected ${EXPECTED_PAID}`);
    }

    charge.amount = TOTAL_AMOUNT;
    charge.amountLocked = true;
    charge.amountAdjustmentNote = [
      'El excedente lo cancelan por transferencia.',
      'Reapertura parcial: total acordado $3.300.000; $2.000.000 ya pagados (Wompi); saldo $1.300.000 pendiente por tarjeta en app.',
    ].join(' ');
    charge.description = [
      'Cargo de matrícula anual generado para el proceso de matrícula.',
      'Valor ajustado de 4294662 a 3300000 (parcial: $2.000.000 pagados + $1.300.000 pendientes).',
    ].join(' ');
    charge.status = 'pending';
    charge.paidAt = null;
    charge.paymentMethod = payments[0]?.method || 'wompi';
    charge.amountAdjustedAt = new Date();
    await charge.save();

    const process = await EnrollmentMatriculaProcess.findOne({ _id: PROCESS_ID, schoolId: SCHOOL_ID });
    if (!process) {
      throw new Error('Enrollment process not found');
    }

    const firstPayment = payments[0];
    process.status = 'payment_pending';
    process.payment = {
      transactionId: process.payment?.transactionId || '',
      reference: process.payment?.reference || '',
      amount: EXPECTED_PAID,
      paidAt: firstPayment?.paidAt || process.payment?.paidAt || null,
      status: 'PARTIAL',
      method: firstPayment?.method || process.payment?.method || 'wompi',
      chargePaymentId: firstPayment?._id || process.payment?.chargePaymentId || null,
      paymentTransactionId: process.payment?.paymentTransactionId || null,
    };
    if (process.contractParamsSnapshot?.pricing) {
      process.contractParamsSnapshot.pricing.proratedAnnualTuitionAmount = TOTAL_AMOUNT;
      process.contractParamsSnapshot.paidAmount = EXPECTED_PAID;
      process.markModified('contractParamsSnapshot');
    }
    await process.save();

    const outstanding = TOTAL_AMOUNT - paidTotal;
    console.log('after', {
      amount: charge.amount,
      status: charge.status,
      paidTotal,
      outstanding,
      processStatus: process.status,
      processPaymentStatus: process.payment?.status,
    });
  });
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
