const AcademicCharge = require('../models/academicCharge.model');
const AcademicChargePayment = require('../models/academicChargePayment.model');
const EnrollmentMatriculaProcess = require('../models/enrollmentMatriculaProcess.model');
const PaymentTransaction = require('../models/paymentTransaction.model');
const { unlinkCarteraPaymentFromEnrollmentMatricula } = require('./enrollmentMatricula.service');
const { isMillenniumSchoolId } = require('../utils/millenniumSchool');

const GATEWAY_PAYMENT_METHODS = new Set(['wompi', 'parent_portal', 'epayco', 'bold', 'pse']);
const CARTERA_PAYMENT_METHODS = new Set(['cash', 'bank_transfer', 'card', 'other']);

function normalizeText(value) {
  return String(value || '').trim();
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isGatewayBillingPaymentMethod(method = '') {
  return GATEWAY_PAYMENT_METHODS.has(String(method || '').toLowerCase());
}

function isCarteraBillingPayment(payment = {}) {
  return CARTERA_PAYMENT_METHODS.has(String(payment?.method || '').toLowerCase());
}

function labelPaymentMethod(method = '') {
  const normalized = String(method || '').toLowerCase();
  if (normalized === 'cash') return 'Efectivo';
  if (normalized === 'bank_transfer') return 'Transferencia';
  if (normalized === 'card') return 'Datáfono';
  if (normalized === 'wompi') return 'Wompi';
  if (normalized === 'parent_portal') return 'Portal acudiente';
  if (normalized === 'other') return 'Otro';
  return normalized || 'Sin método';
}

async function refreshChargeStatusAfterPaymentDeletion(charge) {
  const remainingPayments = await AcademicChargePayment.find({
    schoolId: charge.schoolId,
    chargeId: charge._id,
  }).select('amount paidAt').lean();

  const paidAmount = remainingPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const chargeAmount = Math.max(0, Number(charge.amount || 0));

  if (paidAmount <= 0) {
    if (new Date(charge.dueDate) < new Date()) {
      charge.status = 'overdue';
    } else {
      charge.status = 'pending';
    }
    charge.paidAt = null;
    charge.paymentMethod = '';
  } else if (paidAmount >= chargeAmount) {
    charge.status = 'paid';
    charge.paidAt = remainingPayments[0]?.paidAt || charge.paidAt || new Date();
  } else if (new Date(charge.dueDate) < new Date()) {
    charge.status = 'overdue';
    charge.paidAt = null;
    charge.paymentMethod = '';
  } else {
    charge.status = 'pending';
    charge.paidAt = null;
    charge.paymentMethod = '';
  }

  await charge.save();
}

async function executeBillingPaymentDeletion({
  schoolId,
  paymentId,
  allowGateway = false,
}) {
  const payment = await AcademicChargePayment.findOne({ _id: paymentId, schoolId });
  if (!payment) {
    throw createHttpError('El pago no existe.', 404);
  }

  const charge = await AcademicCharge.findOne({ _id: payment.chargeId, schoolId });
  if (!charge) {
    throw createHttpError('El cargo asociado al pago no existe.', 404);
  }

  const paymentMethod = String(payment.method || '').toLowerCase();
  const isMatriculaCharge = String(charge.category || '') === 'annual_tuition';
  const isGatewayPayment = isGatewayBillingPaymentMethod(paymentMethod);

  if (isGatewayPayment && !allowGateway) {
    throw createHttpError(
      'Los pagos aprobados por pasarela o portal del acudiente no pueden anularse desde cartera.',
      409
    );
  }

  if (!allowGateway && !isCarteraBillingPayment(payment)) {
    throw createHttpError('Solo se pueden anular pagos registrados manualmente en cartera.', 409);
  }

  let paymentTransactionId = null;
  if (isMillenniumSchoolId(schoolId) && isMatriculaCharge) {
    const enrollmentProcess = await EnrollmentMatriculaProcess.findOne({ schoolId, chargeId: charge._id })
      .select('payment')
      .lean();
    paymentTransactionId = enrollmentProcess?.payment?.paymentTransactionId || null;
  }

  try {
    await unlinkCarteraPaymentFromEnrollmentMatricula({
      schoolId,
      charge,
      chargePaymentId: payment._id,
    });
  } catch (unlinkError) {
    throw createHttpError(unlinkError.message, 409);
  }

  if (paymentTransactionId) {
    await PaymentTransaction.updateOne(
      { _id: paymentTransactionId, schoolId },
      {
        $set: {
          status: 'rejected',
          providerStatus: 'VOIDED',
          failureReason: allowGateway
            ? 'Pago de prueba Wompi eliminado administrativamente'
            : 'Pago de matricula anulado desde cartera',
          academicChargePaymentId: null,
        },
      }
    );
  }

  await AcademicChargePayment.deleteOne({ _id: payment._id, schoolId });
  await refreshChargeStatusAfterPaymentDeletion(charge);

  return {
    paymentId: payment._id,
    chargeId: charge._id,
    studentId: payment.studentId,
    amount: Number(payment.amount || 0),
    method: payment.method,
    methodLabel: labelPaymentMethod(payment.method),
  };
}

module.exports = {
  CARTERA_PAYMENT_METHODS,
  GATEWAY_PAYMENT_METHODS,
  executeBillingPaymentDeletion,
  isCarteraBillingPayment,
  isGatewayBillingPaymentMethod,
  labelPaymentMethod,
};
