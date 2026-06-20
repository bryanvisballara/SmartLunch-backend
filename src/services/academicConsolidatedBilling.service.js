const AcademicCharge = require('../models/academicCharge.model');
const AcademicStructure = require('../models/academicStructure.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const { queueNotificationsForParents } = require('./notification.service');
const { buildParentPushUrl } = require('../utils/parentPushTargets');
const { findGradeFeeSetting, getFeeGradeAliases } = require('../utils/feeGradeMatching');

const DEFAULT_ACADEMIC_MONTHLY_DUE_DAY = 10;

function normalizeText(value) {
  return String(value || '').trim();
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

function resolveSchoolYearLevelSetting(configuration = {}, grade = '', academicGrades = []) {
  const aliases = new Set(getFeeGradeAliases(grade));
  const schoolYearLevels = Array.isArray(configuration?.schoolYearLevels) ? configuration.schoolYearLevels : [];
  const byGradeKeys = schoolYearLevels.find((levelSetting) => {
    const gradeKeys = Array.isArray(levelSetting?.gradeKeys) ? levelSetting.gradeKeys : [];
    return gradeKeys.some((gradeKey) => getFeeGradeAliases(gradeKey).some((alias) => aliases.has(alias)));
  });
  if (byGradeKeys) return byGradeKeys;
  const matchedGrade = (Array.isArray(academicGrades) ? academicGrades : []).find((gradeItem) => {
    const gradeItemAliases = getFeeGradeAliases(gradeItem?.key || gradeItem?.grade);
    return gradeItemAliases.some((alias) => aliases.has(alias));
  });
  const levelKey = normalizeText(matchedGrade?.levelKey).toLowerCase();
  if (!levelKey) return null;
  return schoolYearLevels.find((levelSetting) => normalizeText(levelSetting?.levelKey).toLowerCase() === levelKey) || null;
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

function getColombiaCalendarDay(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    day: 'numeric',
  }).formatToParts(referenceDate);
  return Number(parts.find((part) => part.type === 'day')?.value || new Date(referenceDate).getDate());
}

function getApplicableBenefitRule(benefitRules = [], referenceDate = new Date()) {
  const currentDay = getColombiaCalendarDay(referenceDate);
  return (benefitRules || []).find((rule) => currentDay >= Number(rule.startDay || 0) && currentDay <= Number(rule.endDay || 0)) || null;
}

function getFixedBenefitAmountForGrade(rule = {}, grade = '') {
  const amountsByGrade = rule?.fixedAmountsByGrade instanceof Map
    ? Object.fromEntries(rule.fixedAmountsByGrade.entries())
    : (rule?.fixedAmountsByGrade || {});
  const aliases = getFeeGradeAliases(grade);
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(amountsByGrade, alias)) {
      return Math.max(0, Number(amountsByGrade[alias] || 0));
    }
  }
  return 0;
}

function resolveMonthlyTuitionAmount(profile = {}, dueDate = new Date()) {
  const baseAmount = Math.max(0, Number(profile.monthlyTuitionAmount || 0));
  if (baseAmount <= 0) return { amount: 0, originalAmount: 0, label: '' };

  const benefitRule = getApplicableBenefitRule(profile.benefitRules || [], dueDate);
  const isFixedBenefit = normalizeText(benefitRule?.discountType) === 'fixed';
  const baseDiscountPercent = isFixedBenefit ? 0 : Math.min(100, Math.max(0, Number(benefitRule?.discountPercent || 0)));
  const fixedDiscountAmount = isFixedBenefit ? getFixedBenefitAmountForGrade(benefitRule, profile.grade) : 0;
  const additionalDiscountPercent = normalizeAdditionalDiscountPercent(profile.monthlyTuitionAdditionalDiscountPercent);
  const discountPercent = Math.min(100, baseDiscountPercent + additionalDiscountPercent);
  const appliedFixedDiscount = Math.min(baseAmount, Math.max(0, Number(fixedDiscountAmount || 0)));
  const amountAfterFixed = Math.max(0, baseAmount - appliedFixedDiscount);
  const effectiveAmount = discountPercent > 0
    ? Math.max(0, Math.round(amountAfterFixed * (1 - (discountPercent / 100))))
    : amountAfterFixed;

  const labels = [normalizeText(benefitRule?.label), normalizeText(profile.monthlyTuitionAdditionalDiscountLabel)].filter(Boolean);
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

function buildConsolidatedMonthlyStatement(profile = {}, feeConfiguration = {}, monthIndex = 0, academicGrades = [], referenceDate = new Date()) {
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

  const tuitionInstallmentAmount = tuitionInstallmentAmounts[monthIndex] || 0;
  if (tuitionInstallmentAmount > 0) {
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
    description: 'Cargo mensual consolidado con pensión, matrícula y bono según plan financiero.',
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
  const previewForLength = buildConsolidatedMonthlyStatement(billingProfile, feeConfiguration, 0, academicGrades);
  if (!previewForLength) {
    return { created: false, charge: null, reason: 'no_billable_amount' };
  }

  const monthIndex = resolveNextBillableMonthIndex(existingCharges, previewForLength.totalMonths);
  if (monthIndex === null) {
    const openCharge = existingCharges.find((charge) => ['pending', 'overdue'].includes(String(charge.status))) || null;
    return { created: false, charge: openCharge, reason: openCharge ? 'open_charge_exists' : 'schedule_complete' };
  }

  const statement = buildConsolidatedMonthlyStatement(billingProfile, feeConfiguration, monthIndex, academicGrades, referenceDate);
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

function recalculateConsolidatedStatementPricing(charge = {}, billingProfile = {}, referenceDate = new Date()) {
  const breakdownItems = (Array.isArray(charge.breakdownItems) ? charge.breakdownItems : []).map((item) => {
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
  };
}

function serializeConsolidatedChargeForParent(charge = {}, billingProfile = null, paymentTotalsByChargeId = new Map(), referenceDate = new Date()) {
  const isPaid = String(charge.status) === 'paid';
  const repriced = !isPaid && billingProfile
    ? recalculateConsolidatedStatementPricing(charge, billingProfile, referenceDate)
    : {
      amount: Math.max(0, Number(charge.amount || 0)),
      originalAmount: Math.max(0, Number(charge.originalAmount || charge.amount || 0)),
      breakdownItems: Array.isArray(charge.breakdownItems) ? charge.breakdownItems : [],
      benefitLabel: '',
      hasPensionDiscount: false,
    };

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

async function refreshPendingMonthlyStatementCharges({ schoolId, referenceDate = new Date() }) {
  const StudentBillingProfile = require('../models/studentBillingProfile.model');
  const pendingCharges = await AcademicCharge.find({
    schoolId,
    category: 'monthly_statement',
    status: { $in: ['pending', 'overdue'] },
  }).lean();

  const profileCache = new Map();
  let refreshedCharges = 0;

  for (const charge of pendingCharges) {
    const profileId = String(charge.billingProfileId || '');
    if (!profileId) continue;

    let profile = profileCache.get(profileId);
    if (!profile) {
      profile = await StudentBillingProfile.findById(profileId).lean();
      if (profile) profileCache.set(profileId, profile);
    }
    if (!profile) continue;

    const repriced = recalculateConsolidatedStatementPricing(charge, profile, referenceDate);
    const updateResult = await AcademicCharge.updateOne(
      { _id: charge._id, status: { $in: ['pending', 'overdue'] } },
      {
        $set: {
          amount: repriced.amount,
          originalAmount: repriced.originalAmount,
          breakdownItems: repriced.breakdownItems,
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
    const profile = await loadBillingProfileForCharge({ schoolId, charge, profileCache });
    if (!profile || Number(profile.monthlyTuitionAmount || 0) <= 0) {
      continue;
    }

    const dueDate = parseAcademicCalendarDate(charge.dueDate) || referenceDate;
    const pricing = resolveMonthlyTuitionAmount(profile, dueDate);
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

    const installmentCount = normalizeInstallmentCount(profile.annualTuitionInstallments, 1);
    const installmentAmounts = splitAmountIntoInstallments(profile.annualTuitionAmount, installmentCount);
    const baseInstallmentAmounts = splitAmountIntoInstallments(
      Math.max(0, Number(profile.annualTuitionBaseAmount || profile.annualTuitionAmount || 0)),
      installmentCount,
    );

    for (const [index, charge] of charges.entries()) {
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
}) {
  const StudentBillingProfile = require('../models/studentBillingProfile.model');
  const profiles = await StudentBillingProfile.find({ schoolId, active: true }).lean();
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

  const refreshedStatementCharges = await refreshPendingMonthlyStatementCharges({ schoolId, referenceDate });
  const refreshedIndividualCharges = await refreshPendingIndividualTuitionCharges({ schoolId, referenceDate });

  return {
    updatedProfiles,
    refreshedCharges: refreshedStatementCharges + refreshedIndividualCharges,
    refreshedStatementCharges,
    refreshedIndividualCharges,
  };
}

module.exports = {
  DEFAULT_ACADEMIC_MONTHLY_DUE_DAY,
  buildBillingProfileFeeSyncFields,
  buildConsolidatedMonthlyStatement,
  buildMonthKey,
  ensureConsolidatedMonthlyCharge,
  ensureSchoolConsolidatedMonthlyCharges,
  formatAcademicMonthLabel,
  formatCurrency,
  getStudentStatementCharges,
  recalculateConsolidatedStatementPricing,
  refreshPendingIndividualTuitionCharges,
  refreshPendingMonthlyStatementCharges,
  serializeConsolidatedChargeForParent,
  syncSchoolBillingProfilesFromFeeConfiguration,
};
