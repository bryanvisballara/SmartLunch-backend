const { findGradeFeeSetting, getFeeGradeAliases } = require('../utils/feeGradeMatching');
const {
  formatAcademicCalendarDateLongEs,
  getAcademicBenefitDayOfMonth,
  isAcademicCalendarDateWithinRange,
  normalizeAcademicDueDateForBogota,
} = require('../utils/academicCalendarDates');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeBenefitFixedAmountsByGrade(rawAmounts = {}) {
  const entries = rawAmounts instanceof Map ? Array.from(rawAmounts.entries()) : Object.entries(rawAmounts || {});
  return entries.reduce((accumulator, [grade, amount]) => {
    const normalizedGrade = String(grade || '').trim().toLowerCase();
    if (!normalizedGrade) {
      return accumulator;
    }

    accumulator[normalizedGrade] = Math.max(0, Math.round(Number(amount || 0)));
    return accumulator;
  }, {});
}

function getFixedBenefitAmountForGrade(rule = {}, grade = '') {
  const amountsByGrade = normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade || {});
  const aliases = getFeeGradeAliases(grade);
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(amountsByGrade, alias)) {
      return Math.max(0, Number(amountsByGrade[alias] || 0));
    }
  }

  return 0;
}

function doesEnrollmentBenefitRuleApplyToGrade(rule = {}, grade = '') {
  const aliases = new Set(getFeeGradeAliases(grade));
  const targetGradeKeys = Array.isArray(rule?.targetGradeKeys) ? rule.targetGradeKeys.flatMap(getFeeGradeAliases) : [];
  if (targetGradeKeys.length > 0) {
    return targetGradeKeys.some((gradeKey) => aliases.has(gradeKey));
  }

  const amountsByGrade = normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade || {});
  const hasFixedAmountsByGrade = Object.keys(amountsByGrade).length > 0;
  if (normalizeText(rule?.discountType) === 'fixed' || hasFixedAmountsByGrade) {
    return getFixedBenefitAmountForGrade(rule, grade) > 0;
  }

  return true;
}

function getApplicableEnrollmentBenefitRule(enrollmentBenefitRules = [], referenceDate = new Date(), grade = '') {
  return (Array.isArray(enrollmentBenefitRules) ? enrollmentBenefitRules : []).find((rule) => {
    if (!doesEnrollmentBenefitRuleApplyToGrade(rule, grade)) {
      return false;
    }

    return isAcademicCalendarDateWithinRange(referenceDate, rule?.startDate, rule?.endDate);
  }) || null;
}

function getApplicableMonthlyBenefitRule(benefitRules = [], referenceDate = new Date()) {
  const currentDay = getAcademicBenefitDayOfMonth(referenceDate);
  return (Array.isArray(benefitRules) ? benefitRules : []).find((rule) => (
    currentDay >= Number(rule?.startDay || 0) && currentDay <= Number(rule?.endDay || 0)
  )) || null;
}

function resolveAcademicEnrollmentBenefitDiscountAmount(amount, benefitRule = null, grade = '') {
  const safeAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (!benefitRule || safeAmount <= 0) {
    return 0;
  }

  if (normalizeText(benefitRule.discountType) === 'fixed') {
    return Math.min(safeAmount, Math.max(0, Math.round(getFixedBenefitAmountForGrade(benefitRule, grade))));
  }

  return Math.min(safeAmount, Math.round((safeAmount * Math.min(100, Math.max(0, Number(benefitRule.discountPercent || 0)))) / 100));
}

function normalizeAcademicAdditionalDiscountPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(100, Math.max(0, parsed));
}

function resolveParentAnnualTuitionPricing(profile = {}, feeConfiguration = {}, referenceDate = new Date()) {
  const grade = normalizeText(profile.grade);
  const gradeFeeSetting = findGradeFeeSetting(feeConfiguration, grade);
  const baseAmount = Math.max(0, Math.round(Number(
    profile.annualTuitionBaseAmount
    || gradeFeeSetting?.enrollmentFee
    || profile.annualTuitionAmount
    || 0,
  )));
  const activeBenefitRule = getApplicableEnrollmentBenefitRule(
    feeConfiguration?.enrollmentBenefitRules || [],
    referenceDate,
    grade,
  );
  const rectoriaDiscountAmount = resolveAcademicEnrollmentBenefitDiscountAmount(baseAmount, activeBenefitRule, grade);
  const amountAfterRectoriaDiscount = Math.max(0, baseAmount - rectoriaDiscountAmount);
  const additionalDiscountPercent = normalizeAcademicAdditionalDiscountPercent(profile.annualTuitionAdditionalDiscountPercent || 0);
  const additionalDiscountAmount = additionalDiscountPercent > 0
    ? Math.min(amountAfterRectoriaDiscount, Math.round(amountAfterRectoriaDiscount * (additionalDiscountPercent / 100)))
    : Math.min(amountAfterRectoriaDiscount, Math.max(0, Number(profile.annualTuitionAdditionalDiscountAmount || 0)));
  const effectiveAmount = Math.max(0, amountAfterRectoriaDiscount - additionalDiscountAmount);
  const benefitLabels = [
    normalizeText(activeBenefitRule?.label),
    normalizeText(profile.annualTuitionAdditionalDiscountLabel),
  ].filter(Boolean);
  const benefitParts = [];
  if (rectoriaDiscountAmount > 0) {
    benefitParts.push(`Beneficio de matrícula: $${rectoriaDiscountAmount.toLocaleString('es-CO')}`);
  }
  if (additionalDiscountAmount > 0) {
    benefitParts.push(`Descuento adicional: $${additionalDiscountAmount.toLocaleString('es-CO')}`);
  }

  return {
    baseAmount,
    effectiveAmount,
    benefitDueDate: activeBenefitRule?.endDate ? normalizeAcademicDueDateForBogota(activeBenefitRule.endDate) : null,
    rectoriaDiscountAmount,
    additionalDiscountAmount,
    benefitLabel: benefitLabels.join(' + '),
    activeBenefitRule,
    description: benefitParts.length ? benefitParts.join('. ') : 'Cargo de matrícula anual generado por calendario académico.',
  };
}

function formatEnrollmentBenefitWindowLabel(rule = {}) {
  if (!rule?.startDate || !rule?.endDate) {
    return '';
  }

  return `Vigente del ${formatAcademicCalendarDateLongEs(rule.startDate)} al ${formatAcademicCalendarDateLongEs(rule.endDate)}.`;
}

function formatMonthlyBenefitWindowLabel(rule = {}) {
  const safeStart = Number(rule?.startDay || 0);
  const safeEnd = Number(rule?.endDay || 0);
  if (safeStart > 0 && safeEnd > 0) {
    return `Aplica del ${safeStart} al ${safeEnd} de cada mes.`;
  }

  return '';
}

module.exports = {
  doesEnrollmentBenefitRuleApplyToGrade,
  formatEnrollmentBenefitWindowLabel,
  formatMonthlyBenefitWindowLabel,
  getApplicableEnrollmentBenefitRule,
  getApplicableMonthlyBenefitRule,
  getFixedBenefitAmountForGrade,
  resolveAcademicEnrollmentBenefitDiscountAmount,
  resolveParentAnnualTuitionPricing,
};
