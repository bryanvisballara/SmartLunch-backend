const EnrollmentMatriculaProcess = require('../models/enrollmentMatriculaProcess.model');
const EnrollmentMatriculaPurgeRequest = require('../models/enrollmentMatriculaPurgeRequest.model');
const User = require('../models/user.model');
const {
  clearAllConsentsForRectoria,
  clearAllSignedDocumentsForRectoria,
} = require('./enrollmentMatricula.service');

const ACTION_LABELS = {
  clear_consents: 'Borrar consentimientos de matrícula',
  clear_signatures: 'Borrar documentos firmados de matrícula',
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

async function createMatriculaPurgeRequest({
  schoolId,
  userId,
  userRole,
  userName,
  actionType,
}) {
  const normalizedActionType = normalizeText(actionType);
  if (!ACTION_LABELS[normalizedActionType]) {
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

async function listMatriculaPurgeRequestsForReviewer({ schoolId, status = 'pending' }) {
  const filter = { schoolId };
  if (status) {
    filter.status = status;
  }

  const items = await EnrollmentMatriculaPurgeRequest.find(filter)
    .sort({ submittedAt: -1, createdAt: -1 })
    .limit(50)
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
    .limit(10)
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

  const result = request.actionType === 'clear_consents'
    ? await clearAllConsentsForRectoria({ schoolId })
    : await clearAllSignedDocumentsForRectoria({ schoolId });

  request.status = 'approved';
  request.reviewedAt = new Date();
  request.reviewedByUserId = reviewerUserId;
  request.reviewedByName = normalizeText(reviewerName) || 'Rectoría';
  request.executedCount = Number(result?.updated || 0);
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
  createMatriculaPurgeRequest,
  getMatriculaPurgeRequestSummary,
  listMatriculaPurgeRequestsForRequester,
  listMatriculaPurgeRequestsForReviewer,
  rejectMatriculaPurgeRequest,
  resolveReviewerName,
  serializePurgeRequest,
};
