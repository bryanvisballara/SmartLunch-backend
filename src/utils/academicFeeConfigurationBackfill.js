const { runWithSchoolContext } = require('../config/db');
const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');
const { normalizeText } = require('./feeGradeMatching');

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

async function ensureFeeConfigurationReadyForBilling({ schoolId, structureGrades = [] }) {
  void structureGrades;

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

    const schoolYearDates = resolveSchoolYearDates(configuration.academicYear || String(new Date().getFullYear()));
    let changed = false;
    if (!configuration.schoolYearStartDate || !configuration.schoolYearEndDate) {
      configuration.schoolYearStartDate = schoolYearDates.schoolYearStartDate;
      configuration.schoolYearEndDate = schoolYearDates.schoolYearEndDate;
      changed = true;
    }

    if (changed) {
      await configuration.save();
    }

    return configuration.toObject ? configuration.toObject() : configuration;
  });
}

module.exports = {
  ensureFeeConfigurationReadyForBilling,
  resolveSchoolYearDates,
};
