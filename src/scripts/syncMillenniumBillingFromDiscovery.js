require('dotenv').config();

const { connectDB, runWithSchoolContext } = require('../config/db');
require('../models');

const AcademicStructure = require('../models/academicStructure.model');
const StudentBillingProfile = require('../models/studentBillingProfile.model');
const User = require('../models/user.model');
const { ensureFeeConfigurationReadyForBilling } = require('../utils/academicFeeConfigurationBackfill');
const { syncSchoolBillingProfilesFromFeeConfiguration } = require('../services/academicConsolidatedBilling.service');

const TARGET_SCHOOL_ID = 'Millennium School';

async function run() {
  await connectDB();

  const summary = await runWithSchoolContext(TARGET_SCHOOL_ID, async () => {
    const academicStructure = await AcademicStructure.findOne({ schoolId: TARGET_SCHOOL_ID }).lean();
    const feeConfiguration = await ensureFeeConfigurationReadyForBilling({
      schoolId: TARGET_SCHOOL_ID,
      structureGrades: academicStructure?.grades || [],
    });
    const billingSync = await syncSchoolBillingProfilesFromFeeConfiguration({
      schoolId: TARGET_SCHOOL_ID,
      feeConfiguration,
    });
    const sampleProfile = await StudentBillingProfile.findOne({
      schoolId: TARGET_SCHOOL_ID,
      active: true,
    }).lean();
    const parentCount = await User.countDocuments({ schoolId: TARGET_SCHOOL_ID, role: 'parent', deletedAt: null });
    const profileCount = await StudentBillingProfile.countDocuments({ schoolId: TARGET_SCHOOL_ID, active: true });

    return {
      schoolId: TARGET_SCHOOL_ID,
      billingSync,
      parentCount,
      profileCount,
      sampleProfile: sampleProfile ? {
        grade: sampleProfile.grade,
        annualTuitionAmount: sampleProfile.annualTuitionAmount,
        monthlyTuitionAmount: sampleProfile.monthlyTuitionAmount,
      } : null,
      maternalFee: (feeConfiguration?.gradeSettings || []).find((item) => /maternal|infant/i.test(String(item.grade || ''))) || null,
    };
  });

  console.log(JSON.stringify(summary, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
