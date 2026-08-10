const AcademicCharge = require('../models/academicCharge.model');
const AcademicChargeAdjustmentRequest = require('../models/academicChargeAdjustmentRequest.model');
const AcademicChargePayment = require('../models/academicChargePayment.model');
const EnrollmentMatriculaProcess = require('../models/enrollmentMatriculaProcess.model');
const Student = require('../models/student.model');
const StudentBillingProfile = require('../models/studentBillingProfile.model');
const User = require('../models/user.model');
const ParentStudentLink = require('../models/parentStudentLink.model');

const ADJUSTMENT_MODE_LABELS = {
  percent: 'Descuento porcentual',
  fixed: 'Descuento fijo',
  absolute: 'Valor nuevo',
};

function normalizeText(value) {
  return String(value || '').trim();
}

function toObjectId(value) {
  const mongoose = require('mongoose');
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function roundMoney(value) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function computeProposedAmount({ currentAmount, adjustmentMode, adjustmentValue, absoluteAmount }) {
  const current = roundMoney(currentAmount);
  const mode = normalizeText(adjustmentMode).toLowerCase();

  if (mode === 'absolute') {
    const next = roundMoney(absoluteAmount);
    if (next <= 0) {
      throw createHttpError('El valor nuevo debe ser mayor a cero.');
    }
    return next;
  }

  if (mode === 'percent') {
    const percent = Math.max(0, Math.min(100, Number(adjustmentValue || 0)));
    return roundMoney(current * (1 - (percent / 100)));
  }

  if (mode === 'fixed') {
    const discount = Math.max(0, roundMoney(adjustmentValue));
    return Math.max(0, current - discount);
  }

  throw createHttpError('Selecciona un tipo de ajuste válido.');
}

function serializeAdjustmentRequest(request) {
  const item = request?.toObject ? request.toObject() : request;
  return {
    ...item,
    actionType: 'adjust_charge_amount',
    actionLabel: 'Ajuste de valor de cobro',
    adjustmentModeLabel: ADJUSTMENT_MODE_LABELS[item?.adjustmentMode] || item?.adjustmentMode || '',
  };
}

async function resolvePrimaryParentForStudent(schoolId, studentId) {
  const links = await ParentStudentLink.find({ schoolId, studentId, status: 'active' }).lean();
  if (!links.length) return null;
  const primary = links.find((link) => link.isPrimaryContact)
    || links.find((link) => ['mother', 'madre'].includes(normalizeText(link.relationship).toLowerCase()))
    || links[0];
  if (!primary?.parentId) return null;
  return User.findOne({ _id: primary.parentId, schoolId, role: 'parent', deletedAt: null })
    .select('name email phone')
    .lean();
}

async function createChargeAdjustmentRequest({
  schoolId,
  userId,
  userRole,
  userName,
  payload = {},
}) {
  const studentId = toObjectId(payload.studentId);
  if (!studentId) {
    throw createHttpError('Alumno inválido.');
  }

  const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null })
    .select('name grade')
    .lean();
  if (!student) {
    throw createHttpError('Alumno no encontrado.', 404);
  }

  let charge = null;
  const chargeId = toObjectId(payload.chargeId);
  if (chargeId) {
    charge = await AcademicCharge.findOne({
      _id: chargeId,
      schoolId,
      studentId,
      status: { $in: ['pending', 'overdue'] },
    });
    if (!charge) {
      throw createHttpError('El cobro no existe o ya está pagado.', 404);
    }
  }

  const category = normalizeText(payload.category || charge?.category || 'monthly_tuition');
  if (!['annual_tuition', 'monthly_tuition', 'monthly_statement', 'additional', 'enrollment_bonus'].includes(category)) {
    throw createHttpError('Categoría de cobro inválida.');
  }

  const currentAmount = roundMoney(payload.currentAmount ?? charge?.amount ?? 0);
  if (currentAmount <= 0) {
    throw createHttpError('No se pudo determinar el valor actual del cobro.');
  }

  const adjustmentMode = normalizeText(payload.adjustmentMode).toLowerCase();
  const proposedAmount = computeProposedAmount({
    currentAmount,
    adjustmentMode,
    adjustmentValue: payload.adjustmentValue,
    absoluteAmount: payload.proposedAmount ?? payload.absoluteAmount,
  });

  if (proposedAmount === currentAmount) {
    throw createHttpError('El valor propuesto es igual al valor actual.');
  }

  if (proposedAmount <= 0) {
    throw createHttpError('El valor resultante debe ser mayor a cero.');
  }

  if (chargeId) {
    const existingPending = await AcademicChargeAdjustmentRequest.findOne({
      schoolId,
      chargeId,
      status: 'pending',
    }).lean();
    if (existingPending) {
      throw createHttpError('Ya existe una solicitud pendiente para este cobro.', 409);
    }
  }

  const parent = charge?.parentId
    ? await User.findOne({ _id: charge.parentId, schoolId }).select('name').lean()
    : await resolvePrimaryParentForStudent(schoolId, studentId);

  const request = await AcademicChargeAdjustmentRequest.create({
    schoolId,
    status: 'pending',
    chargeId: charge?._id || null,
    studentId,
    parentId: parent?._id || charge?.parentId || null,
    studentName: normalizeText(student.name) || '',
    parentName: normalizeText(parent?.name) || '',
    category,
    concept: normalizeText(payload.concept || charge?.concept) || 'Cobro académico',
    monthKey: normalizeText(payload.monthKey || charge?.monthKey),
    dueDate: payload.dueDate ? new Date(payload.dueDate) : (charge?.dueDate || null),
    currentAmount,
    proposedAmount,
    adjustmentMode,
    adjustmentValue: Number(payload.adjustmentValue || 0),
    notes: normalizeText(payload.notes),
    requestedByUserId: userId,
    requestedByName: normalizeText(userName) || 'Cartera',
    requestedByRole: normalizeText(userRole),
    submittedAt: new Date(),
  });

  return serializeAdjustmentRequest(request);
}

async function listPendingChargeAdjustmentRequests({ schoolId }) {
  const items = await AcademicChargeAdjustmentRequest.find({ schoolId, status: 'pending' })
    .sort({ submittedAt: -1 })
    .lean();
  return items.map(serializeAdjustmentRequest);
}

async function listResolvedChargeAdjustmentRequests({ schoolId, limit = 50 }) {
  const items = await AcademicChargeAdjustmentRequest.find({
    schoolId,
    status: { $in: ['approved', 'rejected'] },
  })
    .sort({ reviewedAt: -1, submittedAt: -1 })
    .limit(Math.max(1, Math.min(200, Number(limit) || 50)))
    .lean();
  return items.map(serializeAdjustmentRequest);
}

async function listChargeAdjustmentRequestSummary({ schoolId }) {
  const [pending, approved, rejected] = await Promise.all([
    AcademicChargeAdjustmentRequest.countDocuments({ schoolId, status: 'pending' }),
    AcademicChargeAdjustmentRequest.countDocuments({ schoolId, status: 'approved' }),
    AcademicChargeAdjustmentRequest.countDocuments({ schoolId, status: 'rejected' }),
  ]);
  return { pending, approved, rejected };
}

async function ensureChargeForAdjustmentRequest(request, reviewerUserId) {
  if (request.chargeId) {
    const existing = await AcademicCharge.findOne({
      _id: request.chargeId,
      schoolId: request.schoolId,
      status: { $in: ['pending', 'overdue'] },
    });
    if (!existing) {
      throw createHttpError('El cobro asociado ya no está disponible para ajustar.', 404);
    }
    return existing;
  }

  const parentId = request.parentId
    || (await resolvePrimaryParentForStudent(request.schoolId, request.studentId))?._id;
  if (!parentId) {
    throw createHttpError('No se encontró un acudiente para crear el cobro ajustado.');
  }

  const billingProfile = await StudentBillingProfile.findOne({
    schoolId: request.schoolId,
    studentId: request.studentId,
    active: true,
  }).lean();

  const dueDate = request.dueDate ? new Date(request.dueDate) : new Date();
  return AcademicCharge.create({
    schoolId: request.schoolId,
    studentId: request.studentId,
    parentId,
    billingProfileId: billingProfile?._id || null,
    createdByUserId: reviewerUserId || request.requestedByUserId,
    createdByRole: 'rectoria',
    category: request.category,
    concept: request.concept || 'Cobro académico',
    description: `Valor ajustado por autorización de rectoría. Valor anterior: ${request.currentAmount}.`,
    amount: request.proposedAmount,
    originalAmount: request.currentAmount,
    dueDate: Number.isNaN(dueDate.getTime()) ? new Date() : dueDate,
    monthKey: request.monthKey || '',
    audienceType: 'individual',
    targetGrade: billingProfile?.grade || '',
    status: 'pending',
    amountLocked: true,
  });
}

async function approveChargeAdjustmentRequest({
  schoolId,
  requestId,
  reviewerUserId,
  reviewerName,
  reviewNotes = '',
}) {
  const request = await AcademicChargeAdjustmentRequest.findOne({
    _id: requestId,
    schoolId,
    status: 'pending',
  });
  if (!request) {
    throw createHttpError('Solicitud no encontrada o ya resuelta.', 404);
  }

  const charge = await ensureChargeForAdjustmentRequest(request, reviewerUserId);
  const previousAmount = roundMoney(charge.amount);
  charge.amount = request.proposedAmount;
  if (!charge.originalAmount || Number(charge.originalAmount) <= 0) {
    charge.originalAmount = previousAmount || request.currentAmount;
  }
  charge.amountLocked = true;
  charge.amountAdjustmentNote = normalizeText(request.notes)
    || `Ajuste autorizado: ${ADJUSTMENT_MODE_LABELS[request.adjustmentMode] || request.adjustmentMode}`;
  charge.amountAdjustedAt = new Date();
  charge.amountAdjustedByUserId = reviewerUserId || null;
  charge.description = [
    normalizeText(charge.description),
    `Valor ajustado de ${request.currentAmount} a ${request.proposedAmount} por autorización de rectoría.`,
  ].filter(Boolean).join(' ');
  await charge.save();

  request.status = 'approved';
  request.chargeId = charge._id;
  request.reviewedAt = new Date();
  request.reviewedByUserId = reviewerUserId || null;
  request.reviewedByName = normalizeText(reviewerName) || 'Rectoría';
  request.reviewNotes = normalizeText(reviewNotes);
  await request.save();

  return {
    request: serializeAdjustmentRequest(request),
    charge,
  };
}

async function rejectChargeAdjustmentRequest({
  schoolId,
  requestId,
  reviewerUserId,
  reviewerName,
  reviewNotes = '',
}) {
  const request = await AcademicChargeAdjustmentRequest.findOne({
    _id: requestId,
    schoolId,
    status: 'pending',
  });
  if (!request) {
    throw createHttpError('Solicitud no encontrada o ya resuelta.', 404);
  }

  request.status = 'rejected';
  request.reviewedAt = new Date();
  request.reviewedByUserId = reviewerUserId || null;
  request.reviewedByName = normalizeText(reviewerName) || 'Rectoría';
  request.reviewNotes = normalizeText(reviewNotes) || 'Solicitud rechazada.';
  await request.save();

  return serializeAdjustmentRequest(request);
}

async function applyAcademicChargeAmountUpdate({
  schoolId,
  chargeId,
  amount,
  notes = '',
  userId = null,
  userName = '',
}) {
  const chargeObjectId = toObjectId(chargeId);
  if (!chargeObjectId) {
    throw createHttpError('Cobro inválido.');
  }

  const charge = await AcademicCharge.findOne({
    _id: chargeObjectId,
    schoolId,
    status: { $ne: 'cancelled' },
  });
  if (!charge) {
    throw createHttpError('El cobro no existe.', 404);
  }

  const nextAmount = roundMoney(amount);
  if (nextAmount <= 0) {
    throw createHttpError('El valor del cobro debe ser mayor a cero.');
  }

  const payments = await AcademicChargePayment.find({
    schoolId,
    chargeId: charge._id,
  }).select('amount paidAt method').lean();
  const paidAmount = roundMoney(
    payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  );

  if (nextAmount < paidAmount) {
    throw createHttpError(
      `El valor no puede ser menor a lo ya pagado (${paidAmount.toLocaleString('es-CO')}).`,
      409
    );
  }

  const previousAmount = roundMoney(charge.amount);
  if (nextAmount === previousAmount) {
    throw createHttpError('El valor propuesto es igual al valor actual.');
  }

  if (!charge.originalAmount || Number(charge.originalAmount) <= 0) {
    charge.originalAmount = previousAmount;
  }
  charge.amount = nextAmount;
  charge.amountLocked = true;
  charge.amountAdjustmentNote = normalizeText(notes)
    || `Valor ajustado desde cartera por ${normalizeText(userName) || 'Cartera'}.`;
  charge.amountAdjustedAt = new Date();
  charge.amountAdjustedByUserId = userId || null;

  const outstanding = Math.max(0, nextAmount - paidAmount);
  if (outstanding <= 0) {
    charge.status = 'paid';
    charge.paidAt = payments[0]?.paidAt || charge.paidAt || new Date();
    charge.paymentMethod = payments[0]?.method || charge.paymentMethod || '';
  } else {
    charge.status = new Date(charge.dueDate) < new Date() ? 'overdue' : 'pending';
    charge.paidAt = null;
    if (!paidAmount) {
      charge.paymentMethod = '';
    }
  }

  charge.description = [
    normalizeText(charge.description),
    `Valor ajustado de ${previousAmount} a ${nextAmount} desde cartera.`,
  ].filter(Boolean).join(' ');
  await charge.save();

  if (String(charge.category || '') === 'annual_tuition') {
    const process = await EnrollmentMatriculaProcess.findOne({ schoolId, chargeId: charge._id });
    if (process) {
      if (process.contractParamsSnapshot?.pricing) {
        process.contractParamsSnapshot.pricing.proratedAnnualTuitionAmount = nextAmount;
        process.contractParamsSnapshot.paidAmount = paidAmount;
        process.markModified('contractParamsSnapshot');
      }
      if (outstanding > 0) {
        process.status = 'payment_pending';
        if (process.payment && typeof process.payment === 'object') {
          process.payment = {
            ...process.payment,
            amount: paidAmount > 0 ? paidAmount : process.payment.amount,
            status: paidAmount > 0 ? 'PARTIAL' : (process.payment.status || 'PENDING'),
          };
        }
      } else if (paidAmount > 0 && process.payment && typeof process.payment === 'object') {
        process.payment = {
          ...process.payment,
          amount: paidAmount,
          status: 'PAID',
        };
      }
      await process.save();
    }
  }

  return {
    charge,
    previousAmount,
    paidAmount,
    outstandingAmount: outstanding,
  };
}

module.exports = {
  applyAcademicChargeAmountUpdate,
  createChargeAdjustmentRequest,
  listPendingChargeAdjustmentRequests,
  listResolvedChargeAdjustmentRequests,
  listChargeAdjustmentRequestSummary,
  approveChargeAdjustmentRequest,
  rejectChargeAdjustmentRequest,
  serializeAdjustmentRequest,
  computeProposedAmount,
};
