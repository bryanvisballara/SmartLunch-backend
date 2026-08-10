/**
 * Valentina Ruiz Medina matricula: $2M cash paid + $1.1M pending via app.
 * Total: $3.100.000 | Paid (cash): $2.000.000 | Outstanding: $1.100.000
 */
require('dotenv').config({ override: true });

const { connectDB, runWithSchoolContext } = require('../src/config/db');
const AcademicCharge = require('../src/models/academicCharge.model');
const AcademicChargePayment = require('../src/models/academicChargePayment.model');
const EnrollmentMatriculaProcess = require('../src/models/enrollmentMatriculaProcess.model');

const SCHOOL_ID = 'Millennium School';
const CHARGE_ID = '6a63d6d074e7ba6846756ca6';
const PROCESS_ID = '6a63d6d274e7ba6846756cb6';
const TOTAL_AMOUNT = 3100000;
const EXPECTED_PAID = 2000000;

(async () => {
  await connectDB();
  await runWithSchoolContext(SCHOOL_ID, async () => {
    const charge = await AcademicCharge.findOne({ _id: CHARGE_ID, schoolId: SCHOOL_ID });
    if (!charge) {
      throw new Error('Charge not found');
    }

    const payments = await AcademicChargePayment.find({ schoolId: SCHOOL_ID, chargeId: charge._id });
    const paidTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    console.log('before', {
      amount: charge.amount,
      status: charge.status,
      paidTotal,
      payments: payments.map((payment) => ({
        id: String(payment._id),
        amount: payment.amount,
        method: payment.method,
      })),
    });

    if (Math.round(paidTotal) !== EXPECTED_PAID) {
      throw new Error(`Unexpected paid total ${paidTotal}, expected ${EXPECTED_PAID}`);
    }

    for (const payment of payments) {
      payment.method = 'cash';
      payment.notes = [
        'Abono de matrícula en efectivo ($2.000.000).',
        'Saldo pendiente $1.100.000 para pago por app (Wompi).',
      ].join(' ');
      payment.recordedByRole = payment.recordedByRole || 'billing';
      await payment.save();
    }

    charge.amount = TOTAL_AMOUNT;
    charge.amountLocked = true;
    charge.amountAdjustmentNote = [
      'Abono en efectivo $2.000.000.',
      'Total acordado $3.100.000; saldo $1.100.000 pendiente por tarjeta en app.',
    ].join(' ');
    charge.description = [
      'Cargo de matrícula anual generado para el proceso de matrícula.',
      'Valor ajustado a 3100000 (parcial: $2.000.000 efectivo + $1.100.000 pendientes por app).',
    ].join(' ');
    charge.status = 'pending';
    charge.paidAt = null;
    charge.paymentMethod = 'cash';
    charge.amountAdjustedAt = new Date();
    await charge.save();

    const process = await EnrollmentMatriculaProcess.findOne({ _id: PROCESS_ID, schoolId: SCHOOL_ID });
    if (!process) {
      throw new Error('Enrollment process not found');
    }

    const firstPayment = payments[0];
    process.status = 'payment_pending';
    process.payment = {
      transactionId: '',
      reference: '',
      amount: EXPECTED_PAID,
      paidAt: firstPayment?.paidAt || process.payment?.paidAt || null,
      status: 'PARTIAL',
      method: 'cash',
      chargePaymentId: firstPayment?._id || process.payment?.chargePaymentId || null,
      paymentTransactionId: null,
    };
    if (process.contractParamsSnapshot?.pricing) {
      process.contractParamsSnapshot.pricing.proratedAnnualTuitionAmount = TOTAL_AMOUNT;
      process.contractParamsSnapshot.paidAmount = EXPECTED_PAID;
      process.markModified('contractParamsSnapshot');
    }
    await process.save();

    console.log('after', {
      amount: charge.amount,
      status: charge.status,
      paidTotal,
      outstanding: TOTAL_AMOUNT - paidTotal,
      processStatus: process.status,
      paymentStatus: process.payment?.status,
      paymentMethod: process.payment?.method,
    });
  });
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
