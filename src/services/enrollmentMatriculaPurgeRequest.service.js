const AcademicCharge = require('../models/academicCharge.model');
const AcademicChargePayment = require('../models/academicChargePayment.model');
const EnrollmentMatriculaProcess = require('../models/enrollmentMatriculaProcess.model');
const EnrollmentMatriculaPurgeRequest = require('../models/enrollmentMatriculaPurgeRequest.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const {
  clearAllConsentsForRectoria,
  clearAllSignedDocumentsForRectoria,
  clearConsentForRectoria,
} = require('./enrollmentMatricula.service');
const {
  executeBillingPaymentDeletion,
  isCarteraBillingPayment,
  isGatewayBillingPaymentMethod,
  labelPaymentMethod,
} = require('./academicBillingPaymentDeletion.service');

const ACTION_LABELS = {
  clear_consents: 'Borrar consentimientos de matrícula',
  clear_consent: 'Borrar consentimiento individual',
  clear_signatures: 'Borrar documentos firmados de matrícula',
  delete_billing_payment: 'Anular pago de cartera',
};

function normalizeText(value) {
  return String(value || '').trim();
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function serializePurgeRequest(request) {
  const item = request?.toObject ? request.toObject() : request;
  return {
    ...item,
    actionLabel: ACTION_LABELS[item?.actionType] || item?.actionType || '',
  };
}

async function countRecordsForPurgeAction({ schoolId, actionType }) {
  if (actionType === 'clear_consents') {
    return EnrollmentMatriculaProcess.countDocuments({
      schoolId,
      'consent.accepted': true,
    });
  }

  if (actionType === 'clear_signatures') {
    return EnrollmentMatriculaProcess.countDocuments({
      schoolId,
      $or: [
        { 'contract.signedAt': { $ne: null } },
        { 'pagare.signedAt': { $ne: null } },
      ],
    });
  }

  throw createHttpError('Tipo de solicitud inválido.');
}

async function createIndividualConsentPurgeRequest({
  schoolId,
  userId,
  userRole,
  userName,
  processId,
}) {
  if (!processId) {
    throw createHttpError('Proceso de matrícula inválido.');
  }

  const process = await EnrollmentMatriculaProcess.findOne({
    _id: processId,
    schoolId,
    'consent.accepted': true,
  }).select('studentId studentName parentName chargeId').lean();

  if (!process) {
    throw createHttpError('No se encontró el consentimiento a eliminar.', 404);
  }

  const existingPending = await EnrollmentMatriculaPurgeRequest.findOne({
    schoolId,
    actionType: 'clear_consent',
    processId,
    status: 'pending',
  }).lean();

  if (existingPending) {
    throw createHttpError('Ya existe una solicitud pendiente para este consentimiento.', 409);
  }

  const request = await EnrollmentMatriculaPurgeRequest.create({
    schoolId,
    actionType: 'clear_consent',
    status: 'pending',
    requestedByUserId: userId,
    requestedByName: normalizeText(userName) || 'Usuario',
    requestedByRole: normalizeText(userRole),
    recordCount: 1,
    processId,
    chargeId: process.chargeId || null,
    studentId: process.studentId || null,
    studentName: normalizeText(process.studentName) || '',
    parentName: normalizeText(process.parentName) || '',
    submittedAt: new Date(),
  });

  return serializePurgeRequest(request);
}

async function createMatriculaPurgeRequest({
  schoolId,
  userId,
  userRole,
  userName,
  actionType,
}) {
  const normalizedActionType = normalizeText(actionType);
  if (!['clear_consents', 'clear_signatures'].includes(normalizedActionType)) {
    throw createHttpError('Tipo de solicitud inválido.');
  }

  const existingPending = await EnrollmentMatriculaPurgeRequest.findOne({
    schoolId,
    actionType: normalizedActionType,
    status: 'pending',
  }).lean();

  if (existingPending) {
    throw createHttpError('Ya existe una solicitud pendiente para esta acción.', 409);
  }

  const recordCount = await countRecordsForPurgeAction({ schoolId, actionType: normalizedActionType });
  if (recordCount <= 0) {
    throw createHttpError('No hay registros para solicitar eliminación.');
  }

  const request = await EnrollmentMatriculaPurgeRequest.create({
    schoolId,
    actionType: normalizedActionType,
    status: 'pending',
    requestedByUserId: userId,
    requestedByName: normalizeText(userName) || 'Usuario',
    requestedByRole: normalizeText(userRole),
    recordCount,
    submittedAt: new Date(),
  });

  return serializePurgeRequest(request);
}

async function createBillingPaymentDeletionRequest({
  schoolId,
  userId,
  userRole,
  userName,
  paymentId,
}) {
  const payment = await AcademicChargePayment.findOne({ _id: paymentId, schoolId });
  if (!payment) {
    throw createHttpError('El pago no existe.', 404);
  }

  if (isGatewayBillingPaymentMethod(payment.method)) {
    throw createHttpError(
      'Los pagos aprobados por pasarela o portal del acudiente no pueden anularse desde cartera.',
      409
    );
  }

  if (!isCarteraBillingPayment(payment)) {
    throw createHttpError('Solo se pueden solicitar anulaciones de pagos registrados manualmente en cartera.', 409);
  }

  const existingPending = await EnrollmentMatriculaPurgeRequest.findOne({
    schoolId,
    actionType: 'delete_billing_payment',
    paymentId: payment._id,
    status: 'pending',
  }).lean();

  if (existingPending) {
    throw createHttpError('Ya existe una solicitud pendiente para este pago.', 409);
  }

  const [charge, student] = await Promise.all([
    AcademicCharge.findOne({ _id: payment.chargeId, schoolId }).select('concept category').lean(),
    payment.studentId
      ? Student.findOne({ _id: payment.studentId, schoolId }).select('name').lean()
      : null,
  ]);

  const request = await EnrollmentMatriculaPurgeRequest.create({
    schoolId,
    actionType: 'delete_billing_payment',
    status: 'pending',
    requestedByUserId: userId,
    requestedByName: normalizeText(userName) || 'Usuario',
    requestedByRole: normalizeText(userRole),
    recordCount: 1,
    paymentId: payment._id,
    chargeId: payment.chargeId,
    studentId: payment.studentId || null,
    studentName: normalizeText(student?.name) || '',
    paymentConcept: normalizeText(charge?.concept) || 'Pago académico',
    paymentAmount: Number(payment.amount || 0),
    paymentMethod: normalizeText(payment.method),
    paymentMethodLabel: labelPaymentMethod(payment.method),
    submittedAt: new Date(),
  });

  return serializePurgeRequest(request);
}

async function listMatriculaPurgeRequestsForReviewer({
  schoolId,
  status = 'pending',
  statuses = null,
  limit = 50,
}) {
  const filter = { schoolId };
  if (Array.isArray(statuses) && statuses.length) {
    filter.status = { $in: statuses };
  } else if (status) {
    filter.status = status;
  }

  const sort = statuses
    ? { reviewedAt: -1, submittedAt: -1, createdAt: -1 }
    : { submittedAt: -1, createdAt: -1 };

  const items = await EnrollmentMatriculaPurgeRequest.find(filter)
    .sort(sort)
    .limit(Math.max(1, Math.min(200, Number(limit) || 50)))
    .lean();

  return items.map(serializePurgeRequest);
}

async function getMatriculaPurgeRequestSummary({ schoolId }) {
  const [pending, approved, rejected] = await Promise.all([
    EnrollmentMatriculaPurgeRequest.countDocuments({ schoolId, status: 'pending' }),
    EnrollmentMatriculaPurgeRequest.countDocuments({ schoolId, status: 'approved' }),
    EnrollmentMatriculaPurgeRequest.countDocuments({ schoolId, status: 'rejected' }),
  ]);

  return { pending, approved, rejected };
}

async function listMatriculaPurgeRequestsForRequester({ schoolId, userId }) {
  const items = await EnrollmentMatriculaPurgeRequest.find({
    schoolId,
    requestedByUserId: userId,
    status: { $in: ['pending', 'approved', 'rejected'] },
  })
    .sort({ submittedAt: -1, createdAt: -1 })
    .limit(20)
    .lean();

  return items.map(serializePurgeRequest);
}

async function approveMatriculaPurgeRequest({
  schoolId,
  requestId,
  reviewerUserId,
  reviewerName,
}) {
  const request = await EnrollmentMatriculaPurgeRequest.findOne({
    _id: requestId,
    schoolId,
    status: 'pending',
  });

  if (!request) {
    throw createHttpError('La solicitud no existe o ya fue revisada.', 404);
  }

  let result;
  if (request.actionType === 'delete_billing_payment') {
    result = await executeBillingPaymentDeletion({
      schoolId,
      paymentId: request.paymentId,
      allowGateway: false,
    });
  } else if (request.actionType === 'clear_consent') {
    result = await clearConsentForRectoria({
      schoolId,
      processId: request.processId,
    });
  } else {
    result = request.actionType === 'clear_consents'
      ? await clearAllConsentsForRectoria({ schoolId })
      : await clearAllSignedDocumentsForRectoria({ schoolId });
  }

  request.status = 'approved';
  request.reviewedAt = new Date();
  request.reviewedByUserId = reviewerUserId;
  request.reviewedByName = normalizeText(reviewerName) || 'Rectoría';
  request.executedCount = request.actionType === 'delete_billing_payment'
    || request.actionType === 'clear_consent'
    ? 1
    : Number(result?.updated || 0);
  await request.save();

  return {
    request: serializePurgeRequest(request),
    result,
  };
}

async function rejectMatriculaPurgeRequest({
  schoolId,
  requestId,
  reviewerUserId,
  reviewerName,
  reviewNotes = '',
}) {
  const request = await EnrollmentMatriculaPurgeRequest.findOne({
    _id: requestId,
    schoolId,
    status: 'pending',
  });

  if (!request) {
    throw createHttpError('La solicitud no existe o ya fue revisada.', 404);
  }

  request.status = 'rejected';
  request.reviewedAt = new Date();
  request.reviewedByUserId = reviewerUserId;
  request.reviewedByName = normalizeText(reviewerName) || 'Rectoría';
  request.reviewNotes = normalizeText(reviewNotes);
  await request.save();

  return serializePurgeRequest(request);
}

async function resolveReviewerName({ schoolId, userId }) {
  const user = await User.findOne({
    _id: userId,
    schoolId,
    status: 'active',
    deletedAt: null,
  }).select('name').lean();

  return normalizeText(user?.name) || 'Rectoría';
}

module.exports = {
  ACTION_LABELS,
  approveMatriculaPurgeRequest,
  createBillingPaymentDeletionRequest,
  createIndividualConsentPurgeRequest,
  createMatriculaPurgeRequest,
  getMatriculaPurgeRequestSummary,
  listMatriculaPurgeRequestsForRequester,
  listMatriculaPurgeRequestsForReviewer,
  rejectMatriculaPurgeRequest,
  resolveReviewerName,
  serializePurgeRequest,
};
