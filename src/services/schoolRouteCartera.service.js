const AcademicCharge = require('../models/academicCharge.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const StudentBillingProfile = require('../models/studentBillingProfile.model');

function normalizeText(value) {
  return String(value || '').trim();
}

function parseRouteCost(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number);
}

function parseLinkToCartera(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(normalized);
}

function resolveDefaultRouteDueDate(billingProfile = null, referenceDate = new Date()) {
  const dueDay = Math.min(28, Math.max(1, Number(billingProfile?.dueDay || 5) || 5));
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const candidate = new Date(year, month, dueDay, 12, 0, 0, 0);
  if (candidate.getTime() < referenceDate.getTime()) {
    return new Date(year, month + 1, dueDay, 12, 0, 0, 0);
  }
  return candidate;
}

async function resolvePrimaryParentId(schoolId, studentId) {
  const links = await ParentStudentLink.find({ schoolId, studentId, status: 'active' }).lean();
  if (!links.length) return null;
  const primary = links.find((link) => link.isPrimaryContact) || links[0];
  return primary?.parentId || null;
}

async function cancelOpenRouteCharge(schoolId, chargeId) {
  if (!chargeId) return null;
  const charge = await AcademicCharge.findOne({ _id: chargeId, schoolId });
  if (!charge) return null;
  if (['pending', 'overdue'].includes(String(charge.status || ''))) {
    charge.status = 'cancelled';
    await charge.save();
  }
  return charge;
}

async function syncSchoolRouteStopCartera({
  schoolId,
  stop,
  routeName = 'Ruta escolar',
  createdByUserId,
  createdByRole = 'academic_secretary',
}) {
  const routeCost = parseRouteCost(stop.routeCost);
  const linkToCartera = Boolean(stop.linkToCartera) && routeCost > 0;
  stop.routeCost = routeCost;
  stop.linkToCartera = linkToCartera;

  if (!linkToCartera) {
    if (stop.carteraChargeId) {
      await cancelOpenRouteCharge(schoolId, stop.carteraChargeId);
      stop.carteraChargeId = null;
    }
    return stop;
  }

  const studentId = stop.studentId?._id || stop.studentId;
  if (!studentId) {
    const error = new Error('No se pudo vincular la ruta a cartera: falta el alumno.');
    error.statusCode = 400;
    throw error;
  }

  const parentId = await resolvePrimaryParentId(schoolId, studentId);
  if (!parentId) {
    const error = new Error('No se pudo vincular a cartera: el alumno no tiene acudiente activo.');
    error.statusCode = 400;
    throw error;
  }

  const studentName = normalizeText(stop.studentNameSnapshot) || 'Alumno';
  const concept = `Ruta escolar · ${normalizeText(routeName) || 'Ruta'}`;
  const description = `Cobro de ruta escolar para ${studentName}.`;
  const billingProfile = await StudentBillingProfile.findOne({ schoolId, studentId }).lean();
  let charge = stop.carteraChargeId
    ? await AcademicCharge.findOne({ _id: stop.carteraChargeId, schoolId, studentId })
    : null;

  if (charge && String(charge.status) === 'paid') {
    // Keep paid history; create a fresh open charge for the updated linked cost.
    charge = null;
    stop.carteraChargeId = null;
  }

  if (charge && ['pending', 'overdue'].includes(String(charge.status || ''))) {
    charge.concept = concept;
    charge.description = description;
    charge.amount = routeCost;
    charge.originalAmount = routeCost;
    await charge.save();
    stop.carteraChargeId = charge._id;
    return stop;
  }

  if (charge && String(charge.status) === 'cancelled') {
    charge = null;
  }

  charge = await AcademicCharge.create({
    schoolId,
    createdByUserId,
    createdByRole,
    parentId,
    studentId,
    billingProfileId: billingProfile?._id || null,
    category: 'additional',
    concept,
    description,
    amount: routeCost,
    originalAmount: routeCost,
    dueDate: resolveDefaultRouteDueDate(billingProfile),
    audienceType: 'individual',
    monthKey: '',
  });

  stop.carteraChargeId = charge._id;
  return stop;
}

async function unlinkSchoolRouteStopCartera({ schoolId, stop }) {
  if (stop?.carteraChargeId) {
    await cancelOpenRouteCharge(schoolId, stop.carteraChargeId);
    stop.carteraChargeId = null;
  }
  return stop;
}

module.exports = {
  parseRouteCost,
  parseLinkToCartera,
  syncSchoolRouteStopCartera,
  unlinkSchoolRouteStopCartera,
};
