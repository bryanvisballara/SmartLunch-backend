const mongoose = require('mongoose');
const EnrollmentMatriculaProcess = require('../models/enrollmentMatriculaProcess.model');
const AcademicCharge = require('../models/academicCharge.model');
const AcademicChargePayment = require('../models/academicChargePayment.model');
const PaymentTransaction = require('../models/paymentTransaction.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const StudentBillingProfile = require('../models/studentBillingProfile.model');
const User = require('../models/user.model');
const SuperAdminSchoolSettings = require('../models/superAdminSchoolSettings.model');
const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');

const CONSENT_VERSION = 'Consentimiento Matricula v1.0';

function normalizeText(value) {
  return String(value || '').trim();
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!mongoose.Types.ObjectId.isValid(String(value))) return null;
  return new mongoose.Types.ObjectId(String(value));
}

function parseClientIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || req?.ip || '').trim();
}

function parseDeviceLabel(userAgent = '') {
  const ua = String(userAgent || '');
  if (/iPhone/i.test(ua)) {
    const match = ua.match(/iPhone OS (\d+[_\d]*)/i);
    return match ? `iPhone (iOS ${match[1].replace(/_/g, '.')})` : 'iPhone';
  }
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) {
    const match = ua.match(/Android (\d+(?:\.\d+)?)/i);
    return match ? `Android ${match[1]}` : 'Android';
  }
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return ua ? 'Navegador web' : 'Dispositivo desconocido';
}

function buildRequestEvidence(req, { userId, studentId } = {}) {
  const userAgent = String(req?.headers?.['user-agent'] || '');
  return {
    ipAddress: parseClientIp(req),
    device: parseDeviceLabel(userAgent),
    userAgent,
    userId: toObjectId(userId),
    studentId: toObjectId(studentId),
  };
}

function mapUserToParentDraft(user = {}) {
  return {
    _id: user._id,
    name: normalizeText(user.name),
    documentType: normalizeText(user.documentType) || 'CC',
    documentNumber: normalizeText(user.documentNumber),
    phone: normalizeText(user.phone),
    email: normalizeText(user.email),
    address: normalizeText(user.address),
  };
}

async function loadLinkedParents({ schoolId, studentId }) {
  const links = await ParentStudentLink.find({ schoolId, studentId, status: 'active' })
    .select('parentId relationship')
    .lean();
  const parentIds = links.map((link) => link.parentId).filter(Boolean);
  if (!parentIds.length) {
    return { father: {}, mother: {}, primaryGuardian: 'mother', links: [] };
  }

  const parents = await User.find({ _id: { $in: parentIds }, schoolId, role: 'parent', deletedAt: null })
    .select('name documentType documentNumber phone email address')
    .lean();

  const fatherLink = links.find((link) => ['father', 'padre'].includes(String(link.relationship || '').toLowerCase()));
  const motherLink = links.find((link) => ['mother', 'madre'].includes(String(link.relationship || '').toLowerCase()));
  const fatherUser = parents.find((parent) => String(parent._id) === String(fatherLink?.parentId))
    || parents[0];
  const motherUser = parents.find((parent) => String(parent._id) === String(motherLink?.parentId))
    || parents.find((parent) => String(parent._id) !== String(fatherUser?._id))
    || parents[0];

  const primaryGuardian = motherLink ? 'mother' : (fatherLink ? 'father' : 'mother');

  return {
    father: mapUserToParentDraft(fatherUser || {}),
    mother: mapUserToParentDraft(motherUser || {}),
    primaryGuardian,
    links,
  };
}

function resolveChargeAmount(charge, billingProfile) {
  const baseAmount = Math.max(0, Number(charge?.originalAmount || charge?.amount || 0));
  const effectiveAmount = Math.max(0, Number(charge?.amount || baseAmount || 0));
  return { baseAmount, effectiveAmount };
}

function splitStudentName(student = {}) {
  const firstName = normalizeText(student.firstName);
  const lastName = normalizeText(student.lastName);
  if (firstName && lastName) {
    return { firstName, lastName };
  }

  const fullName = normalizeText(student.name);
  if (!fullName) {
    return { firstName: '', lastName: '' };
  }

  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

async function resolveGradeLabelForContract({ schoolId, gradeValue }) {
  const normalizedGrade = normalizeText(gradeValue);
  if (!normalizedGrade) {
    return '';
  }

  const configuration = await AcademicFeeConfiguration.findOne({ schoolId })
    .select('structureGrades')
    .lean();
  const structureGrades = Array.isArray(configuration?.structureGrades) ? configuration.structureGrades : [];
  const matchedGrade = structureGrades.find((grade) => {
    const gradeKey = normalizeText(grade?.key);
    const gradeLabel = normalizeText(grade?.label);
    return gradeKey === normalizedGrade
      || gradeLabel === normalizedGrade
      || gradeKey.toLowerCase() === normalizedGrade.toLowerCase()
      || gradeLabel.toLowerCase() === normalizedGrade.toLowerCase();
  });

  return normalizeText(matchedGrade?.label || matchedGrade?.key || normalizedGrade);
}

async function buildContractParamsSnapshot({ schoolId, studentId, charge, billingProfile }) {
  const [student, parents, schoolSettings] = await Promise.all([
    Student.findOne({ _id: studentId, schoolId, deletedAt: null }).lean(),
    loadLinkedParents({ schoolId, studentId }),
    SuperAdminSchoolSettings.findOne({ schoolId }).select('displayName').lean(),
  ]);

  if (!student) {
    throw new Error('Estudiante no encontrado.');
  }

  const profile = billingProfile || await StudentBillingProfile.findOne({ schoolId, studentId, active: true }).lean();
  const studentNameParts = splitStudentName(student);
  const gradeLabel = await resolveGradeLabelForContract({
    schoolId,
    gradeValue: student.grade,
  });
  const pricing = {
    enrollmentBonusAmount: Number(profile?.enrollmentBonusAmount || 0),
    enrollmentBonusInstallments: Math.max(1, Number(profile?.enrollmentBonusInstallments || 1)),
    proratedAnnualTuitionAmount: Math.max(0, Number(charge?.amount || profile?.annualTuitionAmount || 0)),
    proratedAnnualTuitionBaseAmount: Math.max(0, Number(charge?.originalAmount || profile?.annualTuitionBaseAmount || charge?.amount || 0)),
    lateEnrollmentSurchargeAmount: Math.max(0, Number(profile?.lateEnrollmentSurchargeAmount || 0)),
    enrollmentBenefitDiscountAmount: Math.max(0, Number(profile?.annualTuitionDiscountAmount || 0)),
    enrollmentBenefitLabel: normalizeText(profile?.annualTuitionBenefitLabel),
    annualTuitionInstallments: Math.max(1, Number(profile?.annualTuitionInstallments || 10)),
    annualTuitionAdditionalDiscountPercent: Number(profile?.annualTuitionAdditionalDiscountPercent || 0),
    annualTuitionAdditionalDiscountLabel: normalizeText(profile?.annualTuitionAdditionalDiscountLabel),
    monthlyTuitionAmount: Number(profile?.monthlyTuitionAmount || 0),
    monthlyTuitionAdditionalDiscountPercent: Number(profile?.monthlyTuitionAdditionalDiscountPercent || 0),
    monthlyTuitionAdditionalDiscountLabel: normalizeText(profile?.monthlyTuitionAdditionalDiscountLabel),
  };

  return {
    schoolId,
    schoolName: normalizeText(schoolSettings?.displayName) || schoolId,
    father: parents.father,
    mother: parents.mother,
    primaryGuardian: parents.primaryGuardian,
    student: {
      _id: student._id,
      firstName: studentNameParts.firstName,
      lastName: studentNameParts.lastName,
      gender: student.gender || '',
      documentType: student.documentType || 'TI',
      documentNumber: normalizeText(student.documentNumber),
      birthDate: student.birthDate || null,
      bloodType: normalizeText(student.bloodType),
      birthPlace: normalizeText(student.birthPlace),
      address: normalizeText(student.address),
      grade: normalizeText(student.grade),
      entryDate: student.entryDate || profile?.entryDate || null,
    },
    gradeLabel,
    pricing,
    paidAmount: Math.max(0, Number(charge?.amount || 0)),
    academicYear: normalizeText(profile?.academicYear),
  };
}

async function getOrCreateProcessForCharge({ schoolId, parentId, chargeId, req }) {
  const chargeObjectId = toObjectId(chargeId);
  const parentObjectId = toObjectId(parentId);
  if (!chargeObjectId || !parentObjectId) {
    throw new Error('Datos invalidos para iniciar matricula.');
  }

  const charge = await AcademicCharge.findOne({
    _id: chargeObjectId,
    schoolId,
    category: 'annual_tuition',
    status: { $in: ['pending', 'overdue'] },
  }).lean();

  if (!charge) {
    throw new Error('Cobro de matricula no encontrado o ya pagado.');
  }

  const isLinked = await ParentStudentLink.exists({
    schoolId,
    parentId: parentObjectId,
    studentId: charge.studentId,
    status: 'active',
  });

  if (!isLinked) {
    throw new Error('No tienes acceso a este cobro de matricula.');
  }

  let process = await EnrollmentMatriculaProcess.findOne({ schoolId, chargeId: chargeObjectId });
  if (!process) {
    const [student, parentUser, billingProfile] = await Promise.all([
      Student.findOne({ _id: charge.studentId, schoolId }).select('name').lean(),
      User.findOne({ _id: parentObjectId, schoolId }).select('name').lean(),
      charge.billingProfileId
        ? StudentBillingProfile.findOne({ _id: charge.billingProfileId, schoolId }).lean()
        : StudentBillingProfile.findOne({ schoolId, studentId: charge.studentId, active: true }).lean(),
    ]);

    process = await EnrollmentMatriculaProcess.create({
      schoolId,
      studentId: charge.studentId,
      parentId: parentObjectId,
      chargeId: chargeObjectId,
      academicYear: normalizeText(billingProfile?.academicYear),
      status: 'intro_pending',
      studentName: normalizeText(student?.name) || 'Estudiante',
      parentName: normalizeText(parentUser?.name) || 'Acudiente',
    });
  }

  return { process, charge };
}

function serializeProcess(process, charge = null) {
  const doc = process?.toObject ? process.toObject() : process;
  return {
    ...doc,
    charge: charge ? {
      _id: charge._id,
      concept: charge.concept,
      amount: charge.amount,
      originalAmount: charge.originalAmount,
      dueDate: charge.dueDate,
      category: charge.category,
      status: charge.status,
    } : undefined,
    requiresSignature: ['payment_confirmed', 'contract_pending', 'pagare_pending'].includes(doc.status),
    pendingContractSignature: ['payment_confirmed', 'contract_pending'].includes(doc.status),
    pendingPagareSignature: doc.status === 'pagare_pending',
    isCompleted: doc.status === 'completed',
  };
}

async function acknowledgeIntro({ processId, schoolId, parentId }) {
  const process = await EnrollmentMatriculaProcess.findOne({
    _id: processId,
    schoolId,
    parentId,
  });
  if (!process) throw new Error('Proceso de matricula no encontrado.');
  if (process.status === 'intro_pending') {
    process.status = 'consent_pending';
    process.introAcknowledgedAt = new Date();
    await process.save();
  }
  return process;
}

async function acceptConsent({ processId, schoolId, parentId, req }) {
  const process = await EnrollmentMatriculaProcess.findOne({
    _id: processId,
    schoolId,
    parentId,
  });
  if (!process) throw new Error('Proceso de matricula no encontrado.');
  if (!['intro_pending', 'consent_pending'].includes(process.status)) {
    return process;
  }

  const evidence = buildRequestEvidence(req, { userId: parentId, studentId: process.studentId });
  process.consent = {
    accepted: true,
    acceptedAt: new Date(),
    version: CONSENT_VERSION,
    ...evidence,
  };
  process.status = 'consent_accepted';
  await process.save();
  return process;
}

async function markPaymentPending({ process, paymentTransaction, amount, method }) {
  process.status = 'payment_pending';
  process.payment = {
    transactionId: normalizeText(paymentTransaction.providerTransactionId),
    reference: normalizeText(paymentTransaction.reference),
    amount: Math.max(0, Number(amount || 0)),
    paidAt: null,
    status: 'PENDING',
    method: normalizeText(method),
    paymentTransactionId: paymentTransaction._id,
  };
  await process.save();
  return process;
}

async function refreshContractParamsSnapshotIfNeeded(process) {
  if (!process || !['contract_pending', 'pagare_pending', 'payment_confirmed'].includes(process.status)) {
    return process;
  }

  const snapshot = process.contractParamsSnapshot || {};
  const needsRefresh = !snapshot.schoolId
    || !normalizeText(snapshot.gradeLabel)
    || normalizeText(snapshot.gradeLabel) === normalizeText(snapshot.student?.grade);

  if (!needsRefresh) {
    return process;
  }

  const charge = await AcademicCharge.findOne({
    _id: process.chargeId,
    schoolId: process.schoolId,
  }).lean();
  if (!charge) {
    return process;
  }

  const billingProfile = charge.billingProfileId
    ? await StudentBillingProfile.findOne({ _id: charge.billingProfileId, schoolId: process.schoolId }).lean()
    : await StudentBillingProfile.findOne({ schoolId: process.schoolId, studentId: process.studentId, active: true }).lean();

  process.contractParamsSnapshot = await buildContractParamsSnapshot({
    schoolId: process.schoolId,
    studentId: process.studentId,
    charge,
    billingProfile,
  });
  await process.save();
  return process;
}

async function finalizeMatriculaPaidProcess({
  process,
  charge,
  billingProfile,
  paidAmount,
  paymentMeta = {},
}) {
  const normalizedAmount = Math.max(0, Math.round(Number(paidAmount || 0)));
  const paidAt = new Date();
  const chargePayment = await AcademicChargePayment.create({
    schoolId: charge.schoolId,
    chargeId: charge._id,
    studentId: charge.studentId,
    parentId: process.parentId,
    recordedByUserId: process.parentId,
    recordedByRole: 'parent',
    amount: normalizedAmount,
    method: normalizeText(paymentMeta.method) || 'parent_portal',
    notes: normalizeText(paymentMeta.notes) || 'Pago de matricula confirmado',
    paidAt,
  });

  charge.status = 'paid';
  charge.paidAt = chargePayment.paidAt;
  charge.paymentMethod = chargePayment.method;
  await charge.save();

  const contractParamsSnapshot = await buildContractParamsSnapshot({
    schoolId: process.schoolId,
    studentId: process.studentId,
    charge,
    billingProfile,
  });

  process.status = 'contract_pending';
  process.payment = {
    transactionId: normalizeText(paymentMeta.transactionId),
    reference: normalizeText(paymentMeta.reference),
    amount: normalizedAmount,
    paidAt: chargePayment.paidAt,
    status: 'PAID',
    method: chargePayment.method,
    chargePaymentId: chargePayment._id,
    paymentTransactionId: paymentMeta.paymentTransactionId || null,
  };
  process.contractParamsSnapshot = contractParamsSnapshot;
  await process.save();

  return process;
}

async function completeMatriculaDirectPayment({ processId, schoolId, parentId }) {
  const process = await EnrollmentMatriculaProcess.findOne({
    _id: processId,
    schoolId,
    parentId,
  });

  if (!process) {
    throw new Error('Proceso de matricula no encontrado.');
  }

  if (process.payment?.chargePaymentId || process.payment?.status === 'PAID') {
    return process;
  }

  if (!['consent_accepted', 'payment_pending'].includes(process.status)) {
    if (['contract_pending', 'pagare_pending', 'completed'].includes(process.status)) {
      return process;
    }
    throw new Error('Debes aceptar el consentimiento antes de pagar.');
  }

  const charge = await AcademicCharge.findOne({
    _id: process.chargeId,
    schoolId,
    status: { $in: ['pending', 'overdue'] },
  });

  if (!charge) {
    throw new Error('Cobro de matricula no encontrado o ya pagado.');
  }

  const billingProfile = charge.billingProfileId
    ? await StudentBillingProfile.findOne({ _id: charge.billingProfileId, schoolId }).lean()
    : await StudentBillingProfile.findOne({ schoolId, studentId: charge.studentId, active: true }).lean();

  const { effectiveAmount } = resolveChargeAmount(charge, billingProfile);
  const reference = `MAT-${Date.now()}-${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`;

  return finalizeMatriculaPaidProcess({
    process,
    charge,
    billingProfile,
    paidAmount: effectiveAmount,
    paymentMeta: {
      reference,
      transactionId: reference,
      method: 'parent_portal',
      notes: 'Pago de matricula confirmado desde portal del acudiente',
    },
  });
}

async function completeMatriculaGatewayPayment(paymentRecord, providerPayload, session) {
  const providerTransactionId = String(
    providerPayload?.data?.payment_id
    || providerPayload?.payment_id
    || providerPayload?.x_transaction_id
    || providerPayload?.x_ref_payco
    || paymentRecord.providerTransactionId
    || ''
  ).trim();

  const process = await EnrollmentMatriculaProcess.findById(paymentRecord.enrollmentMatriculaProcessId).session(session);
  if (!process) {
    throw new Error('Enrollment matricula process not found');
  }

  if (paymentRecord.academicChargePaymentId) {
    return { alreadyProcessed: true, process };
  }

  const charge = await AcademicCharge.findById(process.chargeId).session(session);
  if (!charge) {
    throw new Error('Academic charge not found');
  }

  const billingProfile = charge.billingProfileId
    ? await StudentBillingProfile.findOne({ _id: charge.billingProfileId, schoolId: charge.schoolId }).session(session).lean()
    : await StudentBillingProfile.findOne({ schoolId: charge.schoolId, studentId: charge.studentId, active: true }).session(session).lean();

  const { effectiveAmount } = resolveChargeAmount(charge, billingProfile);
  const paidAmount = Math.max(0, Number(paymentRecord.amount || effectiveAmount || 0));

  paymentRecord.providerTransactionId = providerTransactionId || paymentRecord.providerTransactionId;
  paymentRecord.status = 'approved';
  paymentRecord.approvedAt = new Date();
  paymentRecord.providerResponse = {
    ...(paymentRecord.providerResponse || {}),
    matriculaCompletion: providerPayload,
  };

  const updatedProcess = await finalizeMatriculaPaidProcess({
    process,
    charge,
    billingProfile,
    paidAmount,
    paymentMeta: {
      transactionId: providerTransactionId,
      reference: paymentRecord.reference,
      method: paymentRecord.method === 'epayco' ? 'epayco' : 'bold',
      notes: `Pago matricula via pasarela (${paymentRecord.reference})`,
      paymentTransactionId: paymentRecord._id,
    },
  });

  paymentRecord.academicChargePaymentId = updatedProcess.payment.chargePaymentId;
  await paymentRecord.save({ session });

  return { process: updatedProcess, chargePaymentId: updatedProcess.payment.chargePaymentId };
}

async function signDocument({
  processId,
  schoolId,
  parentId,
  documentType,
  signatureImage,
  signedPdfBase64,
  fileName,
  req,
}) {
  const process = await EnrollmentMatriculaProcess.findOne({ _id: processId, schoolId, parentId });
  if (!process) throw new Error('Proceso de matricula no encontrado.');
  if (!['payment_confirmed', 'contract_pending', 'pagare_pending'].includes(process.status)) {
    throw new Error('El pago debe estar confirmado antes de firmar.');
  }
  if (!normalizeText(process.payment?.status).includes('PAID') && !process.payment?.chargePaymentId) {
    throw new Error('Debes completar el pago antes de firmar.');
  }

  const evidence = buildRequestEvidence(req, { userId: parentId, studentId: process.studentId });
  const payload = {
    signedAt: new Date(),
    signatureImage: normalizeText(signatureImage),
    signedPdfBase64: normalizeText(signedPdfBase64),
    fileName: normalizeText(fileName),
    ...evidence,
  };

  if (documentType === 'contract') {
    if (!['payment_confirmed', 'contract_pending'].includes(process.status)) {
      throw new Error('El contrato ya fue firmado o no esta disponible.');
    }
    process.contract = payload;
    process.status = 'pagare_pending';
  } else if (documentType === 'pagare') {
    if (process.status !== 'pagare_pending') {
      throw new Error('Debes firmar primero el contrato de matricula.');
    }
    process.pagare = payload;
    process.status = 'completed';
  } else {
    throw new Error('Tipo de documento invalido.');
  }

  await process.save();
  return process;
}

async function listPendingSignaturesForParent({ schoolId, parentId }) {
  const processes = await EnrollmentMatriculaProcess.find({
    schoolId,
    parentId,
    status: { $in: ['payment_confirmed', 'contract_pending', 'pagare_pending'] },
  })
    .sort({ updatedAt: -1 })
    .select('studentName parentName status chargeId studentId parentId consent payment contract pagare contractParamsSnapshot academicYear')
    .lean();

  return processes.map((item) => serializeProcess(item));
}

async function listConsentsForRectoria({ schoolId }) {
  return EnrollmentMatriculaProcess.find({
    schoolId,
    'consent.accepted': true,
  })
    .sort({ 'consent.acceptedAt': -1 })
    .select('studentName parentName consent status academicYear createdAt updatedAt studentId parentId chargeId')
    .lean();
}

async function listSignedDocumentsForRectoria({ schoolId }) {
  return EnrollmentMatriculaProcess.find({
    schoolId,
    $or: [
      { 'contract.signedAt': { $ne: null } },
      { 'pagare.signedAt': { $ne: null } },
    ],
  })
    .sort({ updatedAt: -1 })
    .select('studentName parentName contract pagare status academicYear payment studentId parentId')
    .lean();
}

module.exports = {
  CONSENT_VERSION,
  acceptConsent,
  acknowledgeIntro,
  buildContractParamsSnapshot,
  completeMatriculaDirectPayment,
  completeMatriculaGatewayPayment,
  getOrCreateProcessForCharge,
  listConsentsForRectoria,
  listPendingSignaturesForParent,
  listSignedDocumentsForRectoria,
  markPaymentPending,
  parseClientIp,
  parseDeviceLabel,
  refreshContractParamsSnapshotIfNeeded,
  serializeProcess,
  signDocument,
};
