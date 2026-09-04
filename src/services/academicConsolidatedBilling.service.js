const AcademicCharge = require('../models/academicCharge.model');
const AcademicStructure = require('../models/academicStructure.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const { queueNotificationsForParents } = require('./notification.service');
const { buildParentPushUrl } = require('../utils/parentPushTargets');
const { findGradeFeeSetting, resolveSchoolYearLevelSetting } = require('../utils/feeGradeMatching');
const {
  resolveParentAnnualTuitionPricing,
  getApplicableMonthlyBenefitRule,
  getFixedBenefitAmountForGrade,
} = require('./academicBenefitPricing.service');
const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');
const {
  applyMonthlyTuitionAdditionalDiscount,
  normalizeAdditionalPensionDiscount,
} = require('../utils/academicAdditionalPensionDiscount');
const { isMillenniumSchoolId } = require('../utils/millenniumSchool');

const DEFAULT_ACADEMIC_MONTHLY_DUE_DAY = 10;

function normalizeText(value) {
  return String(value || '').trim();
}

function shouldOmitAnnualTuitionFromMonthlyStatement(schoolId = '') {
  // Millennium bills matrícula as a standalone annual_tuition charge (enrollment gate),
  // so consolidated monthly statements must never re-include that same fee.
  return isMillenniumSchoolId(schoolId);
}

function filterStatementBreakdownItems(breakdownItems = [], { omitAnnualTuition = false } = {}) {
  if (!omitAnnualTuition) {
    return Array.isArray(breakdownItems) ? breakdownItems : [];
  }
  return (Array.isArray(breakdownItems) ? breakdownItems : []).filter(
    (item) => normalizeText(item?.key) !== 'annual_tuition',
  );
}

function parseAcademicCalendarDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const isoDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoDateMatch) {
    return new Date(Date.UTC(Number(isoDateMatch[1]), Number(isoDateMatch[2]) - 1, Number(isoDateMatch[3])));
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function normalizeSchoolYearConfiguration(configuration = {}, grade = '', academicGrades = []) {
  const levelSetting = resolveSchoolYearLevelSetting(configuration, grade, academicGrades);
  const sourceConfiguration = levelSetting || configuration || {};
  const currentYear = new Date().getUTCFullYear();
  const fallbackStartDate = new Date(Date.UTC(currentYear, 0, 1));
  const fallbackEndDate = new Date(Date.UTC(currentYear, 11, 31));
  const parsedStartDate = parseAcademicCalendarDate(sourceConfiguration?.schoolYearStartDate || sourceConfiguration?.startDate || configuration?.schoolYearStartDate || configuration?.startDate) || fallbackStartDate;
  const parsedEndDate = parseAcademicCalendarDate(sourceConfiguration?.schoolYearEndDate || sourceConfiguration?.endDate || configuration?.schoolYearEndDate || configuration?.endDate) || fallbackEndDate;
  const startDate = parsedStartDate.getTime() <= parsedEndDate.getTime() ? parsedStartDate : parsedEndDate;
  const endDate = parsedStartDate.getTime() <= parsedEndDate.getTime() ? parsedEndDate : parsedStartDate;
  return { startDate, endDate };
}

function startOfMonthUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonthsUtc(date, monthCount = 0) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + Number(monthCount || 0);
  return new Date(Date.UTC(year + Math.floor(month / 12), ((month % 12) + 12) % 12, 1));
}

function getMonthDiffUtc(startDate, endDate) {
  return ((endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12) + (endDate.getUTCMonth() - startDate.getUTCMonth());
}

function buildMonthKey(dateValue) {
  const date = parseAcademicCalendarDate(dateValue) || new Date(dateValue);
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatAcademicMonthLabel(date) {
  const parsed = parseAcademicCalendarDate(date) || new Date(date);
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parsed);
}

function buildStudentMonthlyTuitionSchedule({
  billingProfile = {},
  feeConfiguration = null,
  academicGrades = [],
} = {}) {
  const schoolYearConfiguration = normalizeSchoolYearConfiguration(
    feeConfiguration || {},
    billingProfile.grade,
    academicGrades,
  );
  const parsedEntryDate = parseAcademicCalendarDate(billingProfile.entryDate) || schoolYearConfiguration.startDate;
  const schoolYearStartMonth = startOfMonthUtc(schoolYearConfiguration.startDate);
  const schoolYearEndMonth = startOfMonthUtc(schoolYearConfiguration.endDate);
  const entryMonth = startOfMonthUtc(parsedEntryDate);
  const scheduleStartMonth = entryMonth.getTime() > schoolYearStartMonth.getTime()
    ? entryMonth
    : schoolYearStartMonth;
  if (scheduleStartMonth.getTime() > schoolYearEndMonth.getTime()) {
    return [];
  }

  const dueDay = Math.min(
    28,
    Math.max(1, Number(billingProfile.dueDay || DEFAULT_ACADEMIC_MONTHLY_DUE_DAY)),
  );
  const totalMonths = Math.max(1, getMonthDiffUtc(scheduleStartMonth, schoolYearEndMonth) + 1);

  return Array.from({ length: totalMonths }, (_, index) => {
    const monthDate = addMonthsUtc(scheduleStartMonth, index);
    const dueDate = new Date(Date.UTC(
      monthDate.getUTCFullYear(),
      monthDate.getUTCMonth(),
      dueDay,
      5,
      0,
      0,
      0,
    ));
    return {
      monthKey: buildMonthKey(monthDate),
      dueDate,
      monthDate,
    };
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function normalizeInstallmentCount(value, fallback = 1) {
  const parsed = Number(value || fallback || 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(12, Math.max(1, Math.round(parsed)));
}

function splitAmountIntoInstallments(totalAmount, installmentCount) {
  const safeTotal = Math.max(0, Math.round(Number(totalAmount || 0)));
  const safeInstallments = normalizeInstallmentCount(installmentCount, 1);
  if (safeTotal <= 0) return [];
  const baseAmount = Math.floor(safeTotal / safeInstallments);
  let remainder = safeTotal % safeInstallments;
  return Array.from({ length: safeInstallments }, () => {
    const nextAmount = baseAmount + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return nextAmount;
  }).filter((amount) => amount > 0);
}

function normalizeAdditionalDiscountPercent(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

function resolveMonthlyTuitionAmount(profile = {}, dueDate = new Date()) {
  const baseAmount = Math.max(0, Number(profile.monthlyTuitionAmount || 0));
  if (baseAmount <= 0) return { amount: 0, originalAmount: 0, label: '' };

  const benefitRule = getApplicableMonthlyBenefitRule(profile.benefitRules || [], dueDate);
  const isFixedBenefit = normalizeText(benefitRule?.discountType) === 'fixed';
  const baseDiscountPercent = isFixedBenefit ? 0 : Math.min(100, Math.max(0, Number(benefitRule?.discountPercent || 0)));
  const fixedDiscountAmount = isFixedBenefit ? getFixedBenefitAmountForGrade(benefitRule, profile.grade) : 0;
  const appliedFixedDiscount = Math.min(baseAmount, Math.max(0, Number(fixedDiscountAmount || 0)));
  const amountAfterFixed = Math.max(0, baseAmount - appliedFixedDiscount);
  const amountAfterRectoriaPercent = baseDiscountPercent > 0
    ? Math.max(0, Math.round(amountAfterFixed * (1 - (baseDiscountPercent / 100))))
    : amountAfterFixed;
  const effectiveAmount = applyMonthlyTuitionAdditionalDiscount(amountAfterRectoriaPercent, profile);
  const additionalDiscount = normalizeAdditionalPensionDiscount(profile);
  const labels = [normalizeText(benefitRule?.label), additionalDiscount.label].filter(Boolean);

  return {
    amount: effectiveAmount,
    originalAmount: baseAmount,
    label: labels.join(' + '),
  };
}

function buildDueDateForMonth(monthDate, dueDay = DEFAULT_ACADEMIC_MONTHLY_DUE_DAY) {
  const safeDueDay = Math.min(28, Math.max(1, Number(dueDay || DEFAULT_ACADEMIC_MONTHLY_DUE_DAY)));
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(safeDueDay, lastDay), 5, 0, 0, 0));
}

function buildConsolidatedMonthlyStatement(
  profile = {},
  feeConfiguration = {},
  monthIndex = 0,
  academicGrades = [],
  referenceDate = new Date(),
  options = {},
) {
  const schoolYearConfiguration = normalizeSchoolYearConfiguration(feeConfiguration, profile.grade, academicGrades);
  const parsedEntryDate = parseAcademicCalendarDate(profile.entryDate) || schoolYearConfiguration.startDate;
  const schoolYearStartMonth = startOfMonthUtc(schoolYearConfiguration.startDate);
  const schoolYearEndMonth = startOfMonthUtc(schoolYearConfiguration.endDate);
  const entryMonth = startOfMonthUtc(parsedEntryDate);
  const scheduleStartMonth = entryMonth.getTime() > schoolYearStartMonth.getTime() ? entryMonth : schoolYearStartMonth;
  const bonusInstallmentAmounts = splitAmountIntoInstallments(profile.enrollmentBonusAmount, profile.enrollmentBonusInstallments);
  const tuitionInstallmentAmounts = splitAmountIntoInstallments(profile.annualTuitionAmount, profile.annualTuitionInstallments);
  const financingMonthCount = Math.max(bonusInstallmentAmounts.length, tuitionInstallmentAmounts.length);
  const financingEndMonth = addMonthsUtc(scheduleStartMonth, Math.max(0, financingMonthCount - 1));
  const scheduleEndMonth = financingEndMonth.getTime() > schoolYearEndMonth.getTime() ? financingEndMonth : schoolYearEndMonth;
  const totalMonths = Math.max(1, getMonthDiffUtc(scheduleStartMonth, scheduleEndMonth) + 1);

  if (monthIndex < 0 || monthIndex >= totalMonths) {
    return null;
  }

  const monthDate = addMonthsUtc(scheduleStartMonth, monthIndex);
  const dueDate = buildDueDateForMonth(monthDate, profile.dueDay);
  const breakdownItems = [];
  let totalAmount = 0;
  let totalOriginalAmount = 0;
  const omitAnnualTuition = Boolean(options.omitAnnualTuition);

  const tuitionInstallmentAmount = tuitionInstallmentAmounts[monthIndex] || 0;
  if (!omitAnnualTuition && tuitionInstallmentAmount > 0) {
    const tuitionInstallmentCount = tuitionInstallmentAmounts.length;
    breakdownItems.push({
      key: 'annual_tuition',
      label: tuitionInstallmentCount > 1
        ? `Matrícula · cuota ${monthIndex + 1}/${tuitionInstallmentCount}`
        : 'Matrícula',
      amount: tuitionInstallmentAmount,
      originalAmount: tuitionInstallmentAmount,
      installmentIndex: monthIndex + 1,
      installmentTotal: tuitionInstallmentCount,
    });
    totalAmount += tuitionInstallmentAmount;
    totalOriginalAmount += tuitionInstallmentAmount;
  }

  const bonusInstallmentAmount = bonusInstallmentAmounts[monthIndex] || 0;
  if (bonusInstallmentAmount > 0) {
    const bonusInstallmentCount = bonusInstallmentAmounts.length;
    breakdownItems.push({
      key: 'enrollment_bonus',
      label: bonusInstallmentCount > 1
        ? `Bono de ingreso · cuota ${monthIndex + 1}/${bonusInstallmentCount}`
        : 'Bono de ingreso',
      amount: bonusInstallmentAmount,
      originalAmount: bonusInstallmentAmount,
      installmentIndex: monthIndex + 1,
      installmentTotal: bonusInstallmentCount,
    });
    totalAmount += bonusInstallmentAmount;
    totalOriginalAmount += bonusInstallmentAmount;
  }

  const pensionPricing = resolveMonthlyTuitionAmount(profile, referenceDate);
  if (pensionPricing.amount > 0) {
    breakdownItems.push({
      key: 'monthly_tuition',
      label: `Pensión ${formatAcademicMonthLabel(monthDate)}`,
      amount: pensionPricing.amount,
      originalAmount: pensionPricing.originalAmount,
      benefitLabel: pensionPricing.label,
    });
    totalAmount += pensionPricing.amount;
    totalOriginalAmount += pensionPricing.originalAmount;
  }

  if (totalAmount <= 0) {
    return null;
  }

  return {
    monthKey: buildMonthKey(monthDate),
    monthIndex,
    monthDate,
    dueDate,
    concept: `Pago mensual ${formatAcademicMonthLabel(monthDate)}`,
    description: omitAnnualTuition
      ? 'Cargo mensual consolidado con pensión según plan financiero.'
      : 'Cargo mensual consolidado con pensión, matrícula y bono según plan financiero.',
    amount: totalAmount,
    originalAmount: totalOriginalAmount,
    breakdownItems,
    totalMonths,
  };
}

async function resolvePrimaryParentId(schoolId, studentId) {
  const links = await ParentStudentLink.find({ schoolId, studentId, status: 'active' }).lean();
  if (!links.length) return null;
  const primary = links.find((link) => link.isPrimaryContact) || links[0];
  return primary?.parentId || null;
}

async function getStudentStatementCharges(schoolId, studentId) {
  return AcademicCharge.find({
    schoolId,
    studentId,
    category: 'monthly_statement',
    status: { $ne: 'cancelled' },
  }).sort({ dueDate: 1, createdAt: 1 }).lean();
}

function resolveNextBillableMonthIndex(existingCharges = [], totalMonths = 1) {
  const hasOpenCharge = existingCharges.some((charge) => ['pending', 'overdue'].includes(String(charge.status)));
  if (hasOpenCharge) return null;
  const paidCount = existingCharges.filter((charge) => String(charge.status) === 'paid').length;
  if (paidCount >= totalMonths) return null;
  return paidCount;
}

async function ensureConsolidatedMonthlyCharge({
  schoolId,
  studentId,
  billingProfile,
  feeConfiguration,
  academicGrades = [],
  createdByUserId,
  createdByRole = 'system',
  parentId = null,
  referenceDate = new Date(),
  sendNotification = false,
  schoolName = 'Comergio',
  audienceType = 'individual',
}) {
  const existingCharges = await getStudentStatementCharges(schoolId, studentId);
  const omitAnnualTuition = shouldOmitAnnualTuitionFromMonthlyStatement(schoolId);
  const previewForLength = buildConsolidatedMonthlyStatement(
    billingProfile,
    feeConfiguration,
    0,
    academicGrades,
    referenceDate,
    { omitAnnualTuition },
  );
  if (!previewForLength) {
    return { created: false, charge: null, reason: 'no_billable_amount' };
  }

  const monthIndex = resolveNextBillableMonthIndex(existingCharges, previewForLength.totalMonths);
  if (monthIndex === null) {
    const openCharge = existingCharges.find((charge) => ['pending', 'overdue'].includes(String(charge.status))) || null;
    return { created: false, charge: openCharge, reason: openCharge ? 'open_charge_exists' : 'schedule_complete' };
  }

  const statement = buildConsolidatedMonthlyStatement(
    billingProfile,
    feeConfiguration,
    monthIndex,
    academicGrades,
    referenceDate,
    { omitAnnualTuition },
  );
  if (!statement || statement.amount <= 0) {
    return { created: false, charge: null, reason: 'empty_statement' };
  }

  const duplicate = existingCharges.find((charge) => normalizeText(charge.monthKey) === statement.monthKey);
  if (duplicate) {
    return { created: false, charge: duplicate, reason: 'already_exists' };
  }

  const statementMonthStart = startOfMonthUtc(statement.monthDate);
  const referenceMonthStart = startOfMonthUtc(parseAcademicCalendarDate(referenceDate) || referenceDate);
  if (statementMonthStart.getTime() > referenceMonthStart.getTime()) {
    return { created: false, charge: null, reason: 'future_month' };
  }

  const resolvedParentId = parentId || await resolvePrimaryParentId(schoolId, studentId);
  if (!resolvedParentId) {
    return { created: false, charge: null, reason: 'missing_parent' };
  }

  const charge = await AcademicCharge.create({
    schoolId,
    createdByUserId: createdByUserId || resolvedParentId,
    createdByRole,
    parentId: resolvedParentId,
    studentId,
    billingProfileId: billingProfile._id,
    category: 'monthly_statement',
    concept: statement.concept,
    description: statement.description,
    amount: statement.amount,
    originalAmount: statement.originalAmount,
    dueDate: statement.dueDate,
    monthKey: statement.monthKey,
    breakdownItems: statement.breakdownItems,
    audienceType,
    targetGrade: billingProfile.grade || '',
  });

  if (sendNotification) {
    const student = await Student.findById(studentId).select('name').lean();
    const parent = await User.findById(resolvedParentId).select('name email').lean();
    if (parent) {
      await queueNotificationsForParents({
        schoolId,
        parentIds: [resolvedParentId],
        title: 'Nuevo cobro mensual',
        body: `Ya puedes pagar ${formatCurrency(statement.amount)} por ${student?.name || 'tu hijo'} (${formatAcademicMonthLabel(statement.monthDate)}).`,
        payload: {
          type: 'academic.billing.monthly_statement',
          url: buildParentPushUrl('academic.billing.monthly_statement', { studentId }),
          chargeId: String(charge._id),
          studentId: String(studentId),
        },
      }).catch((error) => console.warn(`[CONSOLIDATED_BILLING_NOTIFY] charge=${charge._id} error=${error.message}`));
    }
  }

  return { created: true, charge, reason: 'created' };
}

async function ensureSchoolConsolidatedMonthlyCharges({
  schoolId,
  referenceDate = new Date(),
  sendNotification = false,
  schoolName = 'Comergio',
}) {
  const StudentBillingProfile = require('../models/studentBillingProfile.model');
  const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');

  const [profiles, feeConfiguration, academicStructure] = await Promise.all([
    StudentBillingProfile.find({ schoolId, active: true }).lean(),
    AcademicFeeConfiguration.findOne({ schoolId }).lean(),
    AcademicStructure.findOne({ schoolId }).lean(),
  ]);

  if (!profiles.length || !feeConfiguration) {
    return { processed: 0, created: 0 };
  }

  const academicGrades = (Array.isArray(academicStructure?.grades) ? academicStructure.grades : [])
    .filter((grade) => normalizeText(grade?.status || 'active') !== 'archived')
    .map((grade) => ({ key: normalizeText(grade.key), levelKey: normalizeText(grade.levelKey) }));

  let created = 0;
  for (const profile of profiles) {
    const result = await ensureConsolidatedMonthlyCharge({
      schoolId,
      studentId: profile.studentId,
      billingProfile: profile,
      feeConfiguration,
      academicGrades,
      referenceDate,
      sendNotification,
      schoolName,
    });
    if (result.created) created += 1;
  }

  return { processed: profiles.length, created };
}

function recalculateConsolidatedStatementPricing(
  charge = {},
  billingProfile = {},
  referenceDate = new Date(),
  options = {},
) {
  const omitAnnualTuition = Boolean(
    options.omitAnnualTuition
    || shouldOmitAnnualTuitionFromMonthlyStatement(charge.schoolId || options.schoolId || ''),
  );
  const sourceItems = filterStatementBreakdownItems(
    Array.isArray(charge.breakdownItems) ? charge.breakdownItems : [],
    { omitAnnualTuition },
  );
  const breakdownItems = sourceItems.map((item) => {
    if (normalizeText(item?.key) !== 'monthly_tuition') {
      return {
        ...item,
        amount: Math.max(0, Number(item.amount || 0)),
        originalAmount: Math.max(0, Number(item.originalAmount || item.amount || 0)),
      };
    }

    const pensionPricing = resolveMonthlyTuitionAmount(billingProfile, referenceDate);
    return {
      ...item,
      label: item.label || `Pensión ${formatAcademicMonthLabel(referenceDate)}`,
      amount: pensionPricing.amount,
      originalAmount: pensionPricing.originalAmount,
      benefitLabel: pensionPricing.label,
    };
  });

  const amount = breakdownItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const originalAmount = breakdownItems.reduce((sum, item) => sum + Number(item.originalAmount || item.amount || 0), 0);
  const pensionItem = breakdownItems.find((item) => normalizeText(item?.key) === 'monthly_tuition') || null;

  return {
    amount,
    originalAmount,
    breakdownItems,
    benefitLabel: pensionItem?.benefitLabel || '',
    hasPensionDiscount: Number(pensionItem?.originalAmount || 0) > Number(pensionItem?.amount || 0),
    omitAnnualTuition,
  };
}

function serializeConsolidatedChargeForParent(charge = {}, billingProfile = null, paymentTotalsByChargeId = new Map(), referenceDate = new Date(), options = {}) {
  const isPaid = String(charge.status) === 'paid';
  const repriced = !isPaid && billingProfile
    ? recalculateConsolidatedStatementPricing(charge, billingProfile, referenceDate, {
      ...options,
      schoolId: charge.schoolId || options.schoolId,
    })
    : {
      amount: Math.max(0, Number(charge.amount || 0)),
      originalAmount: Math.max(0, Number(charge.originalAmount || charge.amount || 0)),
      breakdownItems: filterStatementBreakdownItems(
        Array.isArray(charge.breakdownItems) ? charge.breakdownItems : [],
        {
          omitAnnualTuition: shouldOmitAnnualTuitionFromMonthlyStatement(charge.schoolId || options.schoolId || '')
            || Boolean(options.omitAnnualTuition),
        },
      ),
      benefitLabel: '',
      hasPensionDiscount: false,
    };

  // Keep paid statements stable, but still hide matrícula lines already billed separately.
  if (isPaid && shouldOmitAnnualTuitionFromMonthlyStatement(charge.schoolId || options.schoolId || '')) {
    repriced.breakdownItems = filterStatementBreakdownItems(repriced.breakdownItems, { omitAnnualTuition: true });
  }

  const pricingAmount = Math.max(0, Number(repriced.amount || 0));
  const rawPaidAmount = Number(paymentTotalsByChargeId.get(String(charge._id)) || 0);
  const settledPaidAmount = String(charge.status) === 'paid' && rawPaidAmount <= 0 ? pricingAmount : rawPaidAmount;
  const outstandingAmount = String(charge.status) === 'paid' ? 0 : Math.max(0, pricingAmount - settledPaidAmount);
  const dueDate = new Date(charge.dueDate);
  const isOverdue = ['pending', 'overdue'].includes(String(charge.status)) && outstandingAmount > 0 && dueDate < referenceDate;

  return {
    ...charge,
    status: outstandingAmount <= 0 ? 'paid' : (isOverdue ? 'overdue' : charge.status),
    amount: outstandingAmount,
    chargeAmount: pricingAmount,
    paidAmount: Math.min(pricingAmount, settledPaidAmount),
    outstandingAmount,
    breakdownItems: repriced.breakdownItems,
    benefitLabel: repriced.benefitLabel,
    hasPensionDiscount: repriced.hasPensionDiscount,
    chargeOriginalAmount: repriced.originalAmount,
    studentName: charge.studentId?.name || charge.studentName || 'Familia',
    studentGrade: charge.studentId?.grade || charge.studentGrade || '',
    studentCourse: charge.studentId?.course || charge.studentCourse || '',
    billingProfile,
  };
}

function resolveFeeBenefitRules(configuration, gradeFeeSetting = null) {
  const globalBenefitRules = Array.isArray(configuration?.benefitRules) ? configuration.benefitRules : [];
  if (globalBenefitRules.length > 0) {
    return globalBenefitRules;
  }
  return Array.isArray(gradeFeeSetting?.benefitRules) ? gradeFeeSetting.benefitRules : [];
}

function buildBillingProfileFeeSyncFields(profile = {}, gradeFeeSetting = null, feeConfiguration = {}) {
  const benefitRules = resolveFeeBenefitRules(feeConfiguration, gradeFeeSetting);
  const enrollmentFee = Math.max(0, Number(gradeFeeSetting?.enrollmentFee || 0));
  const monthlyTuitionAmount = gradeFeeSetting && Object.prototype.hasOwnProperty.call(gradeFeeSetting, 'monthlyTuition')
    ? Math.max(0, Number(gradeFeeSetting.monthlyTuition || 0))
    : Math.max(0, Number(profile.monthlyTuitionAmount || 0));
  const enrollmentBonusAmount = gradeFeeSetting && Object.prototype.hasOwnProperty.call(gradeFeeSetting, 'enrollmentBonus')
    ? Math.max(0, Number(gradeFeeSetting.enrollmentBonus || 0))
    : Math.max(0, Number(profile.enrollmentBonusAmount || 0));
  const dueDay = Math.min(28, Math.max(1, Number(gradeFeeSetting?.dueDay || profile.dueDay || DEFAULT_ACADEMIC_MONTHLY_DUE_DAY)));
  const additionalDiscountPercent = normalizeAdditionalDiscountPercent(profile.annualTuitionAdditionalDiscountPercent);
  const annualTuitionBaseAmount = enrollmentFee > 0
    ? enrollmentFee
    : Math.max(0, Number(profile.annualTuitionBaseAmount || profile.annualTuitionAmount || 0));
  const annualTuitionAdditionalDiscountAmount = additionalDiscountPercent > 0
    ? Math.max(0, Math.round(annualTuitionBaseAmount * (additionalDiscountPercent / 100)))
    : Math.max(0, Number(profile.annualTuitionAdditionalDiscountAmount || 0));
  const annualTuitionAmount = Math.max(0, annualTuitionBaseAmount - annualTuitionAdditionalDiscountAmount);

  return {
    benefitRules,
    monthlyTuitionAmount,
    enrollmentBonusAmount,
    dueDay,
    annualTuitionBaseAmount,
    annualTuitionAmount,
    annualTuitionAdditionalDiscountAmount,
  };
}

async function loadBillingProfileForCharge({ schoolId, charge, profileCache }) {
  const profileId = String(charge?.billingProfileId || '').trim();
  const studentId = String(charge?.studentId || '').trim();
  const cacheKey = profileId || studentId;
  if (!cacheKey) {
    return null;
  }

  if (profileCache.has(cacheKey)) {
    return profileCache.get(cacheKey);
  }

  const StudentBillingProfile = require('../models/studentBillingProfile.model');
  let profile = null;
  if (profileId) {
    profile = await StudentBillingProfile.findById(profileId).lean();
  }
  if (!profile && studentId) {
    profile = await StudentBillingProfile.findOne({ schoolId, studentId, active: true }).lean();
  }

  profileCache.set(cacheKey, profile || null);
  return profile;
}

async function refreshPendingMonthlyStatementCharges({ schoolId, referenceDate = new Date(), studentIds = [] }) {
  const StudentBillingProfile = require('../models/studentBillingProfile.model');
  const pendingQuery = {
    schoolId,
    category: 'monthly_statement',
    status: { $in: ['pending', 'overdue'] },
  };
  const scopedStudentIds = [...new Set((studentIds || []).map((item) => String(item)).filter(Boolean))];
  if (scopedStudentIds.length) {
    pendingQuery.studentId = { $in: scopedStudentIds };
  }
  const pendingCharges = await AcademicCharge.find(pendingQuery).lean();

  const profileCache = new Map();
  let refreshedCharges = 0;
  const omitAnnualTuition = shouldOmitAnnualTuitionFromMonthlyStatement(schoolId);

  // Also strip matrícula from statements when it was already collected as a standalone paid charge.
  const chargeStudentIds = [...new Set(pendingCharges.map((charge) => String(charge.studentId || '')).filter(Boolean))];
  const paidAnnualStudentIds = new Set();
  if (!omitAnnualTuition && chargeStudentIds.length) {
    const paidAnnualCharges = await AcademicCharge.find({
      schoolId,
      studentId: { $in: chargeStudentIds },
      category: 'annual_tuition',
      status: 'paid',
    }).select('studentId').lean();
    paidAnnualCharges.forEach((charge) => paidAnnualStudentIds.add(String(charge.studentId)));
  }

  for (const charge of pendingCharges) {
    const profileId = String(charge.billingProfileId || '');
    if (!profileId) continue;

    let profile = profileCache.get(profileId);
    if (!profile) {
      profile = await StudentBillingProfile.findById(profileId).lean();
      if (profile) profileCache.set(profileId, profile);
    }
    if (!profile) continue;

    const shouldOmit = omitAnnualTuition || paidAnnualStudentIds.has(String(charge.studentId || ''));
    const repriced = recalculateConsolidatedStatementPricing(charge, profile, referenceDate, {
      omitAnnualTuition: shouldOmit,
      schoolId,
    });
    const updateResult = await AcademicCharge.updateOne(
      { _id: charge._id, status: { $in: ['pending', 'overdue'] } },
      {
        $set: {
          amount: repriced.amount,
          originalAmount: repriced.originalAmount,
          breakdownItems: repriced.breakdownItems,
          description: shouldOmit
            ? 'Cargo mensual consolidado con pensión según plan financiero.'
            : charge.description,
        },
      },
    );

    if (updateResult.modifiedCount > 0) {
      refreshedCharges += 1;
    }
  }

  return refreshedCharges;
}

async function refreshPendingIndividualTuitionCharges({ schoolId, referenceDate = new Date(), studentIds = [] }) {
  const studentIdFilter = new Set(studentIds.map((item) => String(item)).filter(Boolean));
  const profileCache = new Map();
  let refreshedCharges = 0;
  const feeConfiguration = await AcademicFeeConfiguration.findOne({ schoolId }).lean();

  const pendingMonthlyQuery = {
    schoolId,
    category: 'monthly_tuition',
    status: { $in: ['pending', 'overdue'] },
  };
  if (studentIdFilter.size > 0) {
    pendingMonthlyQuery.studentId = { $in: Array.from(studentIdFilter) };
  }

  const pendingMonthlyCharges = await AcademicCharge.find(pendingMonthlyQuery).lean();
  for (const charge of pendingMonthlyCharges) {
    if (charge.amountLocked) {
      continue;
    }
    const profile = await loadBillingProfileForCharge({ schoolId, charge, profileCache });
    if (!profile || Number(profile.monthlyTuitionAmount || 0) <= 0) {
      continue;
    }

    const pricing = resolveMonthlyTuitionAmount(profile, referenceDate);
    if (pricing.amount <= 0) {
      continue;
    }

    const updateResult = await AcademicCharge.updateOne(
      { _id: charge._id, status: { $in: ['pending', 'overdue'] } },
      { $set: { amount: pricing.amount, originalAmount: pricing.originalAmount } },
    );
    if (updateResult.modifiedCount > 0) {
      refreshedCharges += 1;
    }
  }

  const pendingAnnualQuery = {
    schoolId,
    category: 'annual_tuition',
    status: { $in: ['pending', 'overdue'] },
  };
  if (studentIdFilter.size > 0) {
    pendingAnnualQuery.studentId = { $in: Array.from(studentIdFilter) };
  }

  const pendingAnnualCharges = await AcademicCharge.find(pendingAnnualQuery)
    .sort({ studentId: 1, dueDate: 1, createdAt: 1 })
    .lean();
  const annualChargesByStudentId = new Map();
  pendingAnnualCharges.forEach((charge) => {
    const studentKey = String(charge.studentId || '');
    if (!studentKey) {
      return;
    }
    if (!annualChargesByStudentId.has(studentKey)) {
      annualChargesByStudentId.set(studentKey, []);
    }
    annualChargesByStudentId.get(studentKey).push(charge);
  });

  for (const [studentKey, charges] of annualChargesByStudentId.entries()) {
    const profile = await loadBillingProfileForCharge({
      schoolId,
      charge: { studentId: studentKey, billingProfileId: charges[0]?.billingProfileId },
      profileCache,
    });
    if (!profile || Number(profile.annualTuitionAmount || 0) <= 0) {
      continue;
    }

    const pricing = resolveParentAnnualTuitionPricing(profile, feeConfiguration || {}, referenceDate);
    const installmentCount = normalizeInstallmentCount(profile.annualTuitionInstallments, 1);
    const installmentAmounts = splitAmountIntoInstallments(pricing.effectiveAmount, installmentCount);
    const baseInstallmentAmounts = splitAmountIntoInstallments(pricing.baseAmount, installmentCount);

    for (const [index, charge] of charges.entries()) {
      if (charge.amountLocked) {
        continue;
      }
      const amount = installmentAmounts[index] ?? installmentAmounts[installmentAmounts.length - 1] ?? 0;
      const originalAmount = baseInstallmentAmounts[index]
        ?? baseInstallmentAmounts[baseInstallmentAmounts.length - 1]
        ?? amount;
      if (amount <= 0) {
        continue;
      }

      const updateResult = await AcademicCharge.updateOne(
        { _id: charge._id, status: { $in: ['pending', 'overdue'] } },
        { $set: { amount, originalAmount } },
      );
      if (updateResult.modifiedCount > 0) {
        refreshedCharges += 1;
      }
    }
  }

  return refreshedCharges;
}

async function syncSchoolBillingProfilesFromFeeConfiguration({
  schoolId,
  feeConfiguration,
  referenceDate = new Date(),
  studentIds = [],
}) {
  const StudentBillingProfile = require('../models/studentBillingProfile.model');
  const profileQuery = { schoolId, active: true };
  const scopedStudentIds = [...new Set((studentIds || []).map((item) => String(item)).filter(Boolean))];
  if (scopedStudentIds.length) {
    profileQuery.studentId = { $in: scopedStudentIds };
  }
  const profiles = await StudentBillingProfile.find(profileQuery).lean();
  let updatedProfiles = 0;

  for (const profile of profiles) {
    const gradeFeeSetting = findGradeFeeSetting(feeConfiguration, profile.grade);
    const syncFields = buildBillingProfileFeeSyncFields(profile, gradeFeeSetting, feeConfiguration);

    await StudentBillingProfile.updateOne(
      { _id: profile._id },
      { $set: syncFields },
    );
    updatedProfiles += 1;
  }

  const refreshedStatementCharges = await refreshPendingMonthlyStatementCharges({
    schoolId,
    referenceDate,
    studentIds: scopedStudentIds,
  });
  const refreshedIndividualCharges = await refreshPendingIndividualTuitionCharges({
    schoolId,
    referenceDate,
    studentIds: scopedStudentIds,
  });

  return {
    updatedProfiles,
    refreshedCharges: refreshedStatementCharges + refreshedIndividualCharges,
    refreshedStatementCharges,
    refreshedIndividualCharges,
  };
}

async function resolveOutstandingAcademicChargeAmount({ schoolId, charge, referenceDate = new Date(), session = null }) {
  const StudentBillingProfile = require('../models/studentBillingProfile.model');
  const AcademicChargePayment = require('../models/academicChargePayment.model');
  const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');

  const profileQuery = charge?.billingProfileId
    ? StudentBillingProfile.findOne({ _id: charge.billingProfileId, schoolId })
    : StudentBillingProfile.findOne({ schoolId, studentId: charge.studentId, active: true });
  if (session) {
    profileQuery.session(session);
  }
  const billingProfile = await profileQuery.lean();

  let pricingAmount = Math.max(0, Number(charge?.amount || 0));
  if (String(charge?.category || '') === 'monthly_statement' && billingProfile) {
    const repriced = recalculateConsolidatedStatementPricing(charge, billingProfile, referenceDate, { schoolId });
    pricingAmount = Math.max(0, Number(repriced.amount || 0));
  } else if (String(charge?.category || '') === 'monthly_tuition' && billingProfile) {
    const pricing = resolveMonthlyTuitionAmount(billingProfile, referenceDate);
    pricingAmount = Math.max(0, Number(pricing.amount || charge?.amount || 0));
  } else if (String(charge?.category || '') === 'annual_tuition') {
    if (charge?.amountLocked) {
      pricingAmount = Math.max(0, Number(charge?.amount || 0));
    } else {
      const feeQuery = AcademicFeeConfiguration.findOne({ schoolId });
      if (session) {
        feeQuery.session(session);
      }
      const feeConfiguration = await feeQuery.lean();
      if (billingProfile && feeConfiguration) {
        const pricing = resolveParentAnnualTuitionPricing(billingProfile, feeConfiguration, referenceDate);
        pricingAmount = Math.max(0, Number(pricing.effectiveAmount || charge?.amount || 0));
      }
    }
  }

  const paymentQuery = AcademicChargePayment.find({ schoolId, chargeId: charge._id }).select('amount');
  if (session) {
    paymentQuery.session(session);
  }
  const previousPayments = await paymentQuery.lean();
  const previousPaidAmount = previousPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const outstandingAmount = Math.max(0, Math.round(pricingAmount - previousPaidAmount));

  return {
    billingProfile,
    pricingAmount,
    previousPaidAmount,
    outstandingAmount,
  };
}

async function completeAcademicChargeGatewayPayment(paymentRecord, providerPayload, session) {
  const AcademicCharge = require('../models/academicCharge.model');
  const AcademicChargePayment = require('../models/academicChargePayment.model');

  if (paymentRecord.academicChargePaymentId) {
    return { alreadyProcessed: true, chargePaymentId: paymentRecord.academicChargePaymentId };
  }

  const chargeId = paymentRecord.academicChargeId;
  if (!chargeId) {
    throw new Error('Academic charge id missing on payment transaction');
  }

  const charge = await AcademicCharge.findById(chargeId).session(session);
  if (!charge) {
    throw new Error('Academic charge not found');
  }

  const providerTransactionId = String(
    providerPayload?.data?.transaction?.id
    || providerPayload?.transaction?.id
    || paymentRecord.providerTransactionId
    || ''
  ).trim();

  const { outstandingAmount } = await resolveOutstandingAcademicChargeAmount({
    schoolId: charge.schoolId,
    charge,
    referenceDate: new Date(),
    session,
  });

  const paidAmount = Math.max(
    1,
    Math.round(Number(paymentRecord.amount || outstandingAmount || charge.amount || 0)),
  );

  if (String(charge.status) === 'paid' && !outstandingAmount) {
    paymentRecord.providerTransactionId = providerTransactionId || paymentRecord.providerTransactionId;
    paymentRecord.status = 'approved';
    paymentRecord.approvedAt = paymentRecord.approvedAt || new Date();
    await paymentRecord.save({ session });
    return { alreadyProcessed: true, chargeId: charge._id };
  }

  const [chargePayment] = await AcademicChargePayment.create(
    [
      {
        schoolId: charge.schoolId,
        chargeId: charge._id,
        studentId: charge.studentId || null,
        parentId: paymentRecord.parentId,
        recordedByUserId: paymentRecord.parentId,
        recordedByRole: 'parent',
        amount: paidAmount,
        method: paymentRecord.method === 'wompi' ? 'wompi' : (paymentRecord.method || 'parent_portal'),
        notes: `Pago academico via pasarela (${paymentRecord.reference})`,
        paidAt: new Date(),
      },
    ],
    { session },
  );

  const { pricingAmount, previousPaidAmount } = await resolveOutstandingAcademicChargeAmount({
    schoolId: charge.schoolId,
    charge,
    referenceDate: chargePayment.paidAt || new Date(),
    session,
  });
  const totalPaidAmount = previousPaidAmount >= paidAmount ? previousPaidAmount : previousPaidAmount + paidAmount;
  const remainingAfterPayment = Math.max(0, Math.round(pricingAmount - totalPaidAmount));

  if (remainingAfterPayment <= 0) {
    charge.status = 'paid';
    charge.paidAt = chargePayment.paidAt;
  } else if (charge.dueDate && new Date(charge.dueDate) < new Date()) {
    charge.status = 'overdue';
    charge.paidAt = null;
  } else {
    charge.status = 'pending';
    charge.paidAt = null;
  }
  charge.paymentMethod = chargePayment.method;
  await charge.save({ session });

  paymentRecord.providerTransactionId = providerTransactionId || paymentRecord.providerTransactionId;
  paymentRecord.status = 'approved';
  paymentRecord.approvedAt = new Date();
  paymentRecord.failureReason = null;
  paymentRecord.academicChargePaymentId = chargePayment._id;
  paymentRecord.providerResponse = {
    ...(paymentRecord.providerResponse || {}),
    academicChargeCompletion: providerPayload,
  };
  await paymentRecord.save({ session });

  return { chargePaymentId: chargePayment._id, chargeId: charge._id, paidAmount };
}

module.exports = {
  DEFAULT_ACADEMIC_MONTHLY_DUE_DAY,
  buildBillingProfileFeeSyncFields,
  buildConsolidatedMonthlyStatement,
  buildMonthKey,
  buildStudentMonthlyTuitionSchedule,
  completeAcademicChargeGatewayPayment,
  ensureConsolidatedMonthlyCharge,
  ensureSchoolConsolidatedMonthlyCharges,
  formatAcademicMonthLabel,
  formatCurrency,
  getStudentStatementCharges,
  recalculateConsolidatedStatementPricing,
  refreshPendingIndividualTuitionCharges,
  refreshPendingMonthlyStatementCharges,
  resolveOutstandingAcademicChargeAmount,
  serializeConsolidatedChargeForParent,
  syncSchoolBillingProfilesFromFeeConfiguration,
};
