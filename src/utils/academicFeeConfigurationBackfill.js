const { runWithSchoolContext } = require('../config/db');
const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');
const {
  canonicalizeGradeFeeSettingsForStructure,
  hasAnyFeeAmount,
  normalizeText,
} = require('./feeGradeMatching');

const SIBLING_FEE_CONFIGURATION_SOURCES = {
  'Millennium School': 'discovery_t3a0h',
};

function normalizeBenefitRules(rules = []) {
  return Array.isArray(rules) ? rules.filter(Boolean) : [];
}

function resolveSchoolYearDates(academicYear = '', fallbackYear = new Date().getFullYear()) {
  const normalizedYear = normalizeText(academicYear);
  const rangeMatch = normalizedYear.match(/(20\d{2})\D+(20\d{2})/);
  if (rangeMatch) {
    return {
      schoolYearStartDate: new Date(Number(rangeMatch[1]), 7, 1),
      schoolYearEndDate: new Date(Number(rangeMatch[2]), 4, 31),
    };
  }

  const singleYearMatch = normalizedYear.match(/(20\d{2})/);
  const year = singleYearMatch ? Number(singleYearMatch[1]) : Number(fallbackYear);
  return {
    schoolYearStartDate: new Date(year, 7, 1),
    schoolYearEndDate: new Date(year + 1, 4, 31),
  };
}

async function loadSiblingFeeConfiguration(sourceSchoolId = '') {
  const normalizedSourceSchoolId = normalizeText(sourceSchoolId);
  if (!normalizedSourceSchoolId) {
    return null;
  }

  return runWithSchoolContext(normalizedSourceSchoolId, async () => (
    AcademicFeeConfiguration.findOne({ schoolId: normalizedSourceSchoolId }).lean()
  ));
}

async function backfillEmptyFeeConfigurationFromSiblingTenant(configuration, schoolId, structureGrades = []) {
  if (!configuration || hasAnyFeeAmount(configuration.gradeSettings)) {
    return configuration;
  }

  const sourceSchoolId = SIBLING_FEE_CONFIGURATION_SOURCES[normalizeText(schoolId)];
  if (!sourceSchoolId) {
    return configuration;
  }

  const sourceConfig = await loadSiblingFeeConfiguration(sourceSchoolId);
  if (!sourceConfig || !hasAnyFeeAmount(sourceConfig.gradeSettings)) {
    return configuration;
  }

  configuration.gradeSettings = canonicalizeGradeFeeSettingsForStructure(
    sourceConfig.gradeSettings || [],
    structureGrades,
  );

  if (normalizeBenefitRules(configuration.benefitRules).length === 0 && normalizeBenefitRules(sourceConfig.benefitRules).length > 0) {
    configuration.benefitRules = sourceConfig.benefitRules;
  }

  if (normalizeBenefitRules(configuration.enrollmentBenefitRules).length === 0
    && normalizeBenefitRules(sourceConfig.enrollmentBenefitRules).length > 0) {
    configuration.enrollmentBenefitRules = sourceConfig.enrollmentBenefitRules;
  }

  if (!normalizeText(configuration.academicYear)) {
    configuration.academicYear = normalizeText(sourceConfig.academicYear) || configuration.academicYear;
  }

  const schoolYearDates = resolveSchoolYearDates(
    configuration.academicYear || sourceConfig.academicYear,
    new Date().getFullYear(),
  );
  configuration.schoolYearStartDate = schoolYearDates.schoolYearStartDate;
  configuration.schoolYearEndDate = schoolYearDates.schoolYearEndDate;

  await configuration.save();
  return configuration;
}

async function ensureFeeConfigurationReadyForBilling({ schoolId, structureGrades = [] }) {
  return runWithSchoolContext(schoolId, async () => {
    let configuration = await AcademicFeeConfiguration.findOne({ schoolId });
    if (!configuration) {
      const academicYear = String(new Date().getFullYear());
      const schoolYearDates = resolveSchoolYearDates(academicYear);
      configuration = await AcademicFeeConfiguration.create({
        schoolId,
        academicYear,
        schoolYearStartDate: schoolYearDates.schoolYearStartDate,
        schoolYearEndDate: schoolYearDates.schoolYearEndDate,
        lateEnrollmentSurchargeType: 'none',
        lateEnrollmentSurchargeValue: 0,
        benefitRules: [],
        enrollmentBenefitRules: [],
        gradeSettings: [],
      });
    }

    configuration = await backfillEmptyFeeConfigurationFromSiblingTenant(
      configuration,
      schoolId,
      structureGrades,
    );

    return configuration.toObject ? configuration.toObject() : configuration;
  });
}

module.exports = {
  SIBLING_FEE_CONFIGURATION_SOURCES,
  backfillEmptyFeeConfigurationFromSiblingTenant,
  ensureFeeConfigurationReadyForBilling,
  resolveSchoolYearDates,
};
