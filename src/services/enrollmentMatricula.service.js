const archiver = require('archiver');
const { PassThrough } = require('stream');
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

const { isMillenniumSchoolId } = require('../utils/millenniumSchool');

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

const { resolveParentAnnualTuitionPricing } = require('./academicBenefitPricing.service');

function splitMatriculaInstallmentAmounts(totalAmount, installmentCount) {
  const safeTotal = Math.max(0, Math.round(Number(totalAmount || 0)));
  const safeCount = Math.max(1, Math.round(Number(installmentCount || 1)));
  const base = Math.floor(safeTotal / safeCount);
  let remainder = safeTotal % safeCount;

  return Array.from({ length: safeCount }, () => {
    const next = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
    return next;
  });
}

function resolveChargeAmount(charge, billingProfile, feeConfiguration = null, referenceDate = new Date()) {
  const baseAmount = Math.max(0, Number(charge?.originalAmount || charge?.amount || 0));
  if (charge?.amountLocked) {
    return {
      baseAmount,
      effectiveAmount: Math.max(0, Number(charge?.amount || baseAmount || 0)),
    };
  }
  if (String(charge?.category || '') === 'annual_tuition' && billingProfile && feeConfiguration) {
    const pricing = resolveParentAnnualTuitionPricing(billingProfile, feeConfiguration, referenceDate);
    const installmentCount = Math.max(1, Number(billingProfile.annualTuitionInstallments || 1));
    if (installmentCount <= 1) {
      return { baseAmount: pricing.baseAmount, effectiveAmount: pricing.effectiveAmount };
    }

    const installmentAmounts = splitMatriculaInstallmentAmounts(pricing.effectiveAmount, installmentCount);
    const matchedIndex = installmentAmounts.findIndex((amount) => Math.abs(amount - Number(charge?.amount || 0)) <= 1);

    return {
      baseAmount: pricing.baseAmount,
      effectiveAmount: installmentAmounts[matchedIndex >= 0 ? matchedIndex : 0] || Math.max(0, Number(charge?.amount || baseAmount)),
    };
  }

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

async function resolveEnrollmentMatriculaDisplayNames({ schoolId, studentId, parentId }) {
  const [student, parentUser] = await Promise.all([
    Student.findOne({ _id: studentId, schoolId }).select('name').lean(),
    User.findOne({ _id: parentId, schoolId }).select('name').lean(),
  ]);

  return {
    studentName: normalizeText(student?.name) || 'Estudiante',
    parentName: normalizeText(parentUser?.name) || 'Acudiente',
  };
}

async function syncEnrollmentMatriculaProcessContext({
  process,
  schoolId,
  parentId,
  charge = null,
}) {
  const parentObjectId = toObjectId(parentId);
  const studentId = charge?.studentId || process?.studentId;
  if (!process || !parentObjectId || !studentId) {
    return process;
  }

  const { studentName, parentName } = await resolveEnrollmentMatriculaDisplayNames({
    schoolId,
    studentId,
    parentId: parentObjectId,
  });

  let needsSave = false;
  if (normalizeText(process.studentName) !== studentName) {
    process.studentName = studentName;
    needsSave = true;
  }
  if (normalizeText(process.parentName) !== parentName) {
    process.parentName = parentName;
    needsSave = true;
  }
  if (String(process.parentId || '') !== String(parentObjectId)) {
    process.parentId = parentObjectId;
    needsSave = true;
  }
  if (String(process.studentId || '') !== String(studentId)) {
    process.studentId = studentId;
    needsSave = true;
  }

  if (needsSave) {
    await process.save();
  }

  if (charge && String(charge.parentId || '') !== String(parentObjectId)) {
    await AcademicCharge.updateOne(
      { _id: charge._id, schoolId },
      { $set: { parentId: parentObjectId } },
    );
    charge.parentId = parentObjectId;
  }

  return process;
}

async function getOrCreateProcessForCharge({ schoolId, parentId, chargeId, req }) {
  const chargeObjectId = toObjectId(chargeId);
  const parentObjectId = toObjectId(parentId);
  if (!chargeObjectId || !parentObjectId) {
    throw new Error('Datos invalidos para iniciar matricula.');
  }

  let charge = await AcademicCharge.findOne({
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
    const billingProfile = charge.billingProfileId
      ? await StudentBillingProfile.findOne({ _id: charge.billingProfileId, schoolId }).lean()
      : await StudentBillingProfile.findOne({ schoolId, studentId: charge.studentId, active: true }).lean();
    const { studentName, parentName } = await resolveEnrollmentMatriculaDisplayNames({
      schoolId,
      studentId: charge.studentId,
      parentId: parentObjectId,
    });

    process = await EnrollmentMatriculaProcess.create({
      schoolId,
      studentId: charge.studentId,
      parentId: parentObjectId,
      chargeId: chargeObjectId,
      academicYear: normalizeText(billingProfile?.academicYear),
      status: 'intro_pending',
      studentName,
      parentName,
    });
  } else {
    process = await syncEnrollmentMatriculaProcessContext({
      process,
      schoolId,
      parentId: parentObjectId,
      charge,
    });
  }

  return { process, charge };
}

function serializeProcess(process, charge = null) {
  const doc = process?.toObject ? process.toObject() : process;
  const paymentConfirmed = normalizeText(doc?.payment?.status).includes('PAID') || Boolean(doc?.payment?.chargePaymentId);
  const hideEnrollmentAmount = isMillenniumSchoolId(doc?.schoolId) && !paymentConfirmed;

  return {
    ...doc,
    charge: charge ? {
      _id: charge._id,
      concept: charge.concept,
      amount: hideEnrollmentAmount ? null : charge.amount,
      originalAmount: hideEnrollmentAmount ? null : charge.originalAmount,
      dueDate: charge.dueDate,
      category: charge.category,
      status: charge.status,
      amountHiddenUntilGateway: hideEnrollmentAmount || undefined,
    } : undefined,
    requiresSignature: ['payment_confirmed', 'contract_pending', 'pagare_pending', 'office_payment_confirmed'].includes(doc.status),
    pendingContractSignature: ['payment_confirmed', 'contract_pending', 'office_payment_confirmed'].includes(doc.status),
    pendingPagareSignature: doc.status === 'pagare_pending',
    isCompleted: doc.status === 'completed',
    officePaymentConfirmed: doc.status === 'office_payment_confirmed',
    statusLabel: resolveEnrollmentMatriculaStatusLabel(doc),
  };
}

function resolveEnrollmentMatriculaStatusLabel(process = {}) {
  const status = normalizeText(process?.status);
  if (status === 'office_payment_confirmed') {
    return resolveCarteraPaymentMethodLabel(process?.payment?.method) || 'Pago registrado en cartera';
  }

  const labels = {
    intro_pending: 'Introducción pendiente',
    consent_pending: 'Consentimiento pendiente',
    consent_accepted: 'Consentimiento aceptado',
    payment_pending: 'Pago pendiente',
    payment_confirmed: 'Pago confirmado',
    contract_pending: 'Firma de contrato pendiente',
    pagare_pending: 'Firma de pagaré pendiente',
    completed: 'Matrícula completada',
    cancelled: 'Cancelado',
  };

  return labels[status] || status || '—';
}

function resolveCarteraPaymentMethodLabel(method = '') {
  const normalized = normalizeText(method).toLowerCase();
  const labels = {
    cash: 'Pago en efectivo',
    bank_transfer: 'Pago por transferencia',
    card: 'Pago con datáfono',
    pse: 'Pago por PSE',
    epayco: 'Pago por ePayco',
    bold: 'Pago por Bold',
    wompi: 'Pago por Wompi',
    other: 'Pago registrado en cartera',
  };

  return labels[normalized] || '';
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
  if (!process || !['contract_pending', 'pagare_pending', 'payment_confirmed', 'office_payment_confirmed'].includes(process.status)) {
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

  const feeConfiguration = await AcademicFeeConfiguration.findOne({ schoolId }).lean();
  const { effectiveAmount } = resolveChargeAmount(charge, billingProfile, feeConfiguration, new Date());
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
    providerPayload?.data?.transaction?.id
    || providerPayload?.data?.payment_id
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

  const feeConfiguration = await AcademicFeeConfiguration.findOne({ schoolId: charge.schoolId }).session(session).lean();
  const { effectiveAmount } = resolveChargeAmount(charge, billingProfile, feeConfiguration, new Date());
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
      method: paymentRecord.method === 'epayco' ? 'epayco' : (paymentRecord.method === 'wompi' ? 'wompi' : 'bold'),
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
  if (!['payment_confirmed', 'contract_pending', 'pagare_pending', 'office_payment_confirmed'].includes(process.status)) {
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
    if (!['payment_confirmed', 'contract_pending', 'office_payment_confirmed'].includes(process.status)) {
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

const MATRICULA_SIGNATURE_REQUIRED_STATUSES = [
  'payment_confirmed',
  'contract_pending',
  'pagare_pending',
  'office_payment_confirmed',
];

async function listPendingSignaturesForParent({ schoolId, parentId }) {
  const parentObjectId = toObjectId(parentId);
  if (!parentObjectId) {
    return [];
  }

  const links = await ParentStudentLink.find({
    schoolId,
    parentId: parentObjectId,
    status: 'active',
  })
    .select('studentId')
    .lean();
  const studentIds = [...new Set(links.map((link) => link.studentId).filter(Boolean))];

  const processes = await EnrollmentMatriculaProcess.find({
    schoolId,
    status: { $in: MATRICULA_SIGNATURE_REQUIRED_STATUSES },
    $or: [
      { parentId: parentObjectId },
      ...(studentIds.length ? [{ studentId: { $in: studentIds } }] : []),
    ],
  })
    .sort({ updatedAt: -1 })
    .select('studentName parentName status chargeId studentId parentId consent payment contract pagare contractParamsSnapshot academicYear contractMode')
    .lean();

  return processes.map((item) => serializeProcess(item));
}

async function listConsentsForRectoria({ schoolId }) {
  const items = await EnrollmentMatriculaProcess.find({
    schoolId,
    'consent.accepted': true,
  })
    .sort({ 'consent.acceptedAt': -1 })
    .select('studentName parentName consent status academicYear payment createdAt updatedAt studentId parentId chargeId contractMode')
    .lean();

  return items.map((item) => ({
    ...item,
    statusLabel: resolveEnrollmentMatriculaStatusLabel(item),
  }));
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
    .select('studentName parentName contract pagare status academicYear payment studentId parentId contractMode')
    .lean();
}

function sanitizeZipEntryName(value, fallback = 'documento.pdf') {
  const cleaned = normalizeText(value)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function hasEnrollmentPaymentConfirmed(process = {}) {
  return normalizeText(process.payment?.status).includes('PAID') || Boolean(process.payment?.chargePaymentId);
}

function hasEnrollmentSignedDocuments(process = {}) {
  return Boolean(
    normalizeText(process.contract?.signedPdfBase64)
    || normalizeText(process.pagare?.signedPdfBase64)
    || process.contract?.signedAt
    || process.pagare?.signedAt
  );
}

function applyConsentClearToProcess(process) {
  process.consent = {
    accepted: false,
    acceptedAt: null,
    ipAddress: '',
    device: '',
    userAgent: '',
    userId: null,
    studentId: process.studentId,
    version: CONSENT_VERSION,
  };
  process.introAcknowledgedAt = null;

  if (hasEnrollmentSignedDocuments(process)) {
    // Keep signature flow status when only consent evidence is removed.
  } else if (hasEnrollmentPaymentConfirmed(process)) {
    process.status = process.contractMode === 'digital' ? 'office_payment_confirmed' : 'payment_confirmed';
  } else {
    process.status = 'intro_pending';
  }
}

async function clearConsentForRectoria({ schoolId, processId }) {
  const process = await EnrollmentMatriculaProcess.findOne({
    _id: processId,
    schoolId,
    'consent.accepted': true,
  });

  if (!process) {
    throw new Error('Consentimiento no encontrado o ya fue eliminado.');
  }

  applyConsentClearToProcess(process);
  await process.save();
  return { updated: 1 };
}

async function clearAllConsentsForRectoria({ schoolId }) {
  const processes = await EnrollmentMatriculaProcess.find({
    schoolId,
    'consent.accepted': true,
  });

  let updated = 0;
  for (const process of processes) {
    applyConsentClearToProcess(process);
    await process.save();
    updated += 1;
  }

  return { updated };
}

async function clearAllSignedDocumentsForRectoria({ schoolId }) {
  const processes = await EnrollmentMatriculaProcess.find({
    schoolId,
    $or: [
      { 'contract.signedAt': { $ne: null } },
      { 'pagare.signedAt': { $ne: null } },
    ],
  });

  let updated = 0;
  for (const process of processes) {
    applySignedDocumentsClearToProcess(process);
    await process.save();
    updated += 1;
  }

  return { updated };
}

async function clearSignedDocumentsForRectoria({ schoolId, processId }) {
  const process = await EnrollmentMatriculaProcess.findOne({
    _id: processId,
    schoolId,
    $or: [
      { 'contract.signedAt': { $ne: null } },
      { 'pagare.signedAt': { $ne: null } },
    ],
  });

  if (!process) {
    throw new Error('Documento firmado no encontrado o ya fue eliminado.');
  }

  applySignedDocumentsClearToProcess(process);
  await process.save();
  return { updated: 1 };
}

function applySignedDocumentsClearToProcess(process) {
  process.contract = {};
  process.pagare = {};

  if (hasEnrollmentPaymentConfirmed(process)) {
    process.status = process.contractMode === 'digital' ? 'office_payment_confirmed' : 'payment_confirmed';
  } else if (process.consent?.accepted) {
    process.status = 'consent_accepted';
  } else {
    process.status = 'intro_pending';
  }
}

async function buildSignedDocumentsZipForRectoria({ schoolId }) {
  const processes = await EnrollmentMatriculaProcess.find({
    schoolId,
    $or: [
      { 'contract.signedPdfBase64': { $ne: '' } },
      { 'pagare.signedPdfBase64': { $ne: '' } },
    ],
  })
    .sort({ studentName: 1, updatedAt: -1 })
    .select('studentName contract pagare')
    .lean();

  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = new PassThrough();
  const usedNames = new Set();

  const ensureUniqueName = (candidate) => {
    let nextName = candidate;
    let suffix = 2;
    while (usedNames.has(nextName)) {
      const extensionIndex = candidate.lastIndexOf('.');
      if (extensionIndex > 0) {
        const base = candidate.slice(0, extensionIndex);
        const extension = candidate.slice(extensionIndex);
        nextName = `${base}-${suffix}${extension}`;
      } else {
        nextName = `${candidate}-${suffix}`;
      }
      suffix += 1;
    }
    usedNames.add(nextName);
    return nextName;
  };

  const bufferPromise = new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    archive.on('error', reject);
    archive.pipe(stream);
  });

  for (const process of processes) {
    const studentLabel = sanitizeZipEntryName(process.studentName || 'estudiante', 'estudiante');

    if (normalizeText(process.contract?.signedPdfBase64)) {
      const fileName = ensureUniqueName(
        sanitizeZipEntryName(process.contract?.fileName, `${studentLabel}-contrato.pdf`)
      );
      archive.append(Buffer.from(process.contract.signedPdfBase64, 'base64'), { name: fileName });
    }

    if (normalizeText(process.pagare?.signedPdfBase64)) {
      const fileName = ensureUniqueName(
        sanitizeZipEntryName(process.pagare?.fileName, `${studentLabel}-pagare.pdf`)
      );
      archive.append(Buffer.from(process.pagare.signedPdfBase64, 'base64'), { name: fileName });
    }
  }

  await archive.finalize();
  const buffer = await bufferPromise;
  return {
    buffer,
    fileCount: usedNames.size,
  };
}

function normalizeEnrollmentContractMode(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'physical' || normalized === 'fisico' || normalized === 'contrato_fisico' || normalized === 'contrato fisico') {
    return 'physical';
  }
  if (normalized === 'digital' || normalized === 'contrato_digital' || normalized === 'contrato digital') {
    return 'digital';
  }
  return '';
}

async function linkCarteraPaymentToEnrollmentMatricula({
  schoolId,
  charge,
  chargePayment,
  contractMode,
  recordedByUserId,
  recordedByRole,
}) {
  if (!isMillenniumSchoolId(schoolId)) {
    return null;
  }

  if (String(charge?.category || '') !== 'annual_tuition') {
    return null;
  }

  const normalizedContractMode = normalizeEnrollmentContractMode(contractMode);
  if (!normalizedContractMode) {
    throw new Error('Selecciona si el contrato de matricula es fisico o digital.');
  }

  const parentId = toObjectId(chargePayment?.parentId || charge?.parentId);
  const chargeId = toObjectId(charge?._id);
  if (!parentId || !chargeId) {
    throw new Error('No se pudo vincular el pago de matricula con el acudiente.');
  }

  const billingProfile = charge.billingProfileId
    ? await StudentBillingProfile.findOne({ _id: charge.billingProfileId, schoolId }).lean()
    : await StudentBillingProfile.findOne({ schoolId, studentId: charge.studentId, active: true }).lean();

  let process = await EnrollmentMatriculaProcess.findOne({ schoolId, chargeId });
  if (!process) {
    const { studentName, parentName } = await resolveEnrollmentMatriculaDisplayNames({
      schoolId,
      studentId: charge.studentId,
      parentId,
    });

    process = new EnrollmentMatriculaProcess({
      schoolId,
      studentId: charge.studentId,
      parentId,
      chargeId,
      academicYear: normalizeText(billingProfile?.academicYear),
      studentName,
      parentName,
    });
  } else {
    process = await syncEnrollmentMatriculaProcessContext({
      process,
      schoolId,
      parentId,
      charge,
    });
  }

  const paidAt = chargePayment?.paidAt || new Date();
  process.contractMode = normalizedContractMode;
  process.consent = {
    accepted: true,
    acceptedAt: paidAt,
    version: CONSENT_VERSION,
    userId: recordedByUserId || null,
    studentId: charge.studentId,
    device: 'Portal de cartera',
    userAgent: `Registrado por ${normalizeText(recordedByRole) || 'cartera'}`,
    ipAddress: '',
  };
  process.payment = {
    transactionId: normalizeText(chargePayment?._id),
    reference: normalizeText(chargePayment?.notes),
    amount: Math.max(0, Number(chargePayment?.amount || 0)),
    paidAt,
    status: 'PAID',
    method: normalizeText(chargePayment?.method) || 'bank_transfer',
    chargePaymentId: chargePayment?._id || null,
    paymentTransactionId: null,
  };

  if (normalizedContractMode === 'digital') {
    process.contractParamsSnapshot = await buildContractParamsSnapshot({
      schoolId,
      studentId: charge.studentId,
      charge,
      billingProfile,
    });
    process.status = 'office_payment_confirmed';
    process.contract = {};
    process.pagare = {};
    await process.save();
    return process;
  }

  const physicalSignedAt = paidAt;
  const physicalEvidence = {
    signedAt: physicalSignedAt,
    fileName: 'contrato-fisico-oficina',
    device: 'Oficina del colegio',
    userAgent: `Registrado por ${normalizeText(recordedByRole) || 'cartera'}`,
    userId: recordedByUserId || null,
  };
  process.contract = { ...physicalEvidence };
  process.pagare = { ...physicalEvidence, fileName: 'pagare-fisico-oficina' };
  process.status = 'completed';
  await process.save();
  return process;
}

async function unlinkCarteraPaymentFromEnrollmentMatricula({
  schoolId,
  charge,
  chargePaymentId,
}) {
  if (!isMillenniumSchoolId(schoolId)) {
    return null;
  }

  if (String(charge?.category || '') !== 'annual_tuition') {
    return null;
  }

  const process = await EnrollmentMatriculaProcess.findOne({ schoolId, chargeId: charge._id });
  if (!process) {
    return null;
  }

  const paymentId = String(chargePaymentId || '').trim();
  const linkedPaymentId = String(process.payment?.chargePaymentId || '').trim();
  if (linkedPaymentId && paymentId && linkedPaymentId !== paymentId) {
    return process;
  }

  // After rectoría-approved annulment, force a full enrollment reset so the parent
  // must re-consent and re-sign even if documents were already completed.
  process.payment = {};
  process.contract = {};
  process.pagare = {};
  process.contractParamsSnapshot = null;
  applyConsentClearToProcess(process);
  process.status = 'intro_pending';
  await process.save();
  return process;
}

async function ensureAnnualTuitionChargesForMatriculaGate({ schoolId, parentId, studentIds = [] }) {
  if (!isMillenniumSchoolId(schoolId) || !studentIds.length) {
    return;
  }

  const parentObjectId = toObjectId(parentId);
  if (!parentObjectId) {
    return;
  }

  const billingProfiles = await StudentBillingProfile.find({
    schoolId,
    active: true,
    studentId: { $in: studentIds },
  }).lean();

  const now = new Date();

  for (const profile of billingProfiles) {
    const existingCharge = await AcademicCharge.exists({
      schoolId,
      studentId: profile.studentId,
      category: 'annual_tuition',
      status: { $ne: 'cancelled' },
    });
    if (existingCharge) {
      continue;
    }

    const feeConfiguration = await AcademicFeeConfiguration.findOne({ schoolId }).lean();
    const pricing = resolveParentAnnualTuitionPricing(profile, feeConfiguration || {}, now);
    const installmentCount = Math.max(1, Number(profile.annualTuitionInstallments || 1));
    const installmentAmounts = splitMatriculaInstallmentAmounts(pricing.effectiveAmount, installmentCount);
    const baseInstallmentAmounts = splitMatriculaInstallmentAmounts(pricing.baseAmount, installmentCount);
    const amount = installmentAmounts[0] || 0;
    const originalAmount = baseInstallmentAmounts[0] || amount;
    if (amount <= 0) {
      continue;
    }

    const dueDate = profile.annualTuitionDueDate ? new Date(profile.annualTuitionDueDate) : now;
    const safeDueDate = Number.isNaN(dueDate.getTime()) ? now : dueDate;

    await AcademicCharge.create({
      schoolId,
      createdByUserId: parentObjectId,
      createdByRole: 'parent',
      parentId: parentObjectId,
      studentId: profile.studentId,
      billingProfileId: profile._id,
      category: 'annual_tuition',
      concept: `Matrícula anual ${safeDueDate.getFullYear()}`,
      description: 'Cargo de matrícula anual generado para el proceso de matrícula.',
      amount,
      originalAmount,
      dueDate: safeDueDate,
      audienceType: 'individual',
      targetGrade: profile.grade || '',
      status: 'pending',
    });
  }
}

async function getMatriculaRequirementForParent({ schoolId, parentId }) {
  if (!isMillenniumSchoolId(schoolId)) {
    return { required: false, blocking: false };
  }

  const parentObjectId = toObjectId(parentId);
  if (!parentObjectId) {
    return { required: false, blocking: false };
  }

  const pendingSignatures = await listPendingSignaturesForParent({ schoolId, parentId: parentObjectId });
  if (pendingSignatures.length > 0) {
    const process = pendingSignatures[0];
    const charge = process?.chargeId
      ? await AcademicCharge.findOne({ _id: process.chargeId, schoolId }).lean()
      : null;
    return {
      required: true,
      blocking: true,
      reason: 'signature_pending',
      process,
      charge,
    };
  }

  const links = await ParentStudentLink.find({ schoolId, parentId: parentObjectId, status: 'active' })
    .select('studentId')
    .lean();
  const studentIds = links.map((link) => link.studentId).filter(Boolean);
  if (!studentIds.length) {
    return { required: false, blocking: false };
  }

  await ensureAnnualTuitionChargesForMatriculaGate({
    schoolId,
    parentId: parentObjectId,
    studentIds,
  });

  const { refreshPendingIndividualTuitionCharges } = require('./academicConsolidatedBilling.service');
  await refreshPendingIndividualTuitionCharges({ schoolId, referenceDate: new Date(), studentIds });

  // Paid matrícula with an unsigned digital/office process must still block the app.
  const unsignedPaidProcess = await EnrollmentMatriculaProcess.findOne({
    schoolId,
    studentId: { $in: studentIds },
    status: { $in: MATRICULA_SIGNATURE_REQUIRED_STATUSES },
  })
    .sort({ updatedAt: -1 })
    .lean();

  if (unsignedPaidProcess) {
    const charge = unsignedPaidProcess.chargeId
      ? await AcademicCharge.findOne({ _id: unsignedPaidProcess.chargeId, schoolId }).lean()
      : null;
    return {
      required: true,
      blocking: true,
      reason: 'signature_pending',
      process: serializeProcess(unsignedPaidProcess, charge),
      charge,
    };
  }

  // Students who already finished enrollment (paid + signed) must not be blocked again
  // by leftover/duplicate annual_tuition charges (installments or regenerated fees).
  const enrolledStudentIds = await EnrollmentMatriculaProcess.distinct('studentId', {
    schoolId,
    studentId: { $in: studentIds },
    $or: [
      { status: 'completed' },
      {
        'payment.status': { $regex: /PAID/i },
        'contract.signedAt': { $ne: null },
        'pagare.signedAt': { $ne: null },
      },
    ],
  });
  const enrolledKeySet = new Set(enrolledStudentIds.map((id) => String(id)));
  const studentsNeedingEnrollment = studentIds.filter((id) => !enrolledKeySet.has(String(id)));

  if (!studentsNeedingEnrollment.length) {
    return { required: false, blocking: false };
  }

  const unpaidCharge = await AcademicCharge.findOne({
    schoolId,
    studentId: { $in: studentsNeedingEnrollment },
    category: 'annual_tuition',
    status: { $in: ['pending', 'overdue'] },
  })
    .sort({ dueDate: 1, createdAt: 1 })
    .lean();

  if (!unpaidCharge) {
    return { required: false, blocking: false };
  }

  const { process, charge } = await getOrCreateProcessForCharge({
    schoolId,
    parentId: parentObjectId,
    chargeId: unpaidCharge._id,
  });

  const paymentConfirmed = normalizeText(process?.payment?.status).includes('PAID') || Boolean(process?.payment?.chargePaymentId);
  const requiresSignature = MATRICULA_SIGNATURE_REQUIRED_STATUSES.includes(process.status);

  if (requiresSignature) {
    return {
      required: true,
      blocking: true,
      reason: 'signature_pending',
      process: serializeProcess(process, charge),
      charge,
    };
  }

  if (process.status === 'completed') {
    return { required: false, blocking: false };
  }

  if (paymentConfirmed) {
    return {
      required: true,
      blocking: true,
      reason: 'signature_pending',
      process: serializeProcess(process, charge),
      charge,
    };
  }

  return {
    required: true,
    blocking: true,
    reason: 'payment_pending',
    process: serializeProcess(process, charge),
    charge,
  };
}

module.exports = {
  CONSENT_VERSION,
  acceptConsent,
  acknowledgeIntro,
  buildContractParamsSnapshot,
  buildSignedDocumentsZipForRectoria,
  clearAllConsentsForRectoria,
  clearConsentForRectoria,
  clearAllSignedDocumentsForRectoria,
  clearSignedDocumentsForRectoria,
  completeMatriculaDirectPayment,
  completeMatriculaGatewayPayment,
  getMatriculaRequirementForParent,
  getOrCreateProcessForCharge,
  listConsentsForRectoria,
  listPendingSignaturesForParent,
  listSignedDocumentsForRectoria,
  linkCarteraPaymentToEnrollmentMatricula,
  unlinkCarteraPaymentFromEnrollmentMatricula,
  markPaymentPending,
  parseClientIp,
  parseDeviceLabel,
  refreshContractParamsSnapshotIfNeeded,
  resolveChargeAmount,
  serializeProcess,
  signDocument,
};
