require('dotenv').config();

const { connectDB, runWithSchoolContext } = require('../config/db');
require('../models');

const AcademicStructure = require('../models/academicStructure.model');
const StudentBillingProfile = require('../models/studentBillingProfile.model');
const AcademicCharge = require('../models/academicCharge.model');
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
    const cancelledEarlyMonthlyCharges = await AcademicCharge.updateMany(
      {
        schoolId: TARGET_SCHOOL_ID,
        category: 'monthly_tuition',
        status: { $in: ['pending', 'overdue'] },
        dueDate: { $lt: feeConfiguration.schoolYearStartDate },
      },
      { $set: { status: 'cancelled' } },
    );

    return {
      schoolId: TARGET_SCHOOL_ID,
      billingSync,
      cancelledEarlyMonthlyCharges: cancelledEarlyMonthlyCharges.modifiedCount,
      parentCount: await User.countDocuments({ schoolId: TARGET_SCHOOL_ID, role: 'parent', deletedAt: null }),
      profileCount: await StudentBillingProfile.countDocuments({ schoolId: TARGET_SCHOOL_ID, active: true }),
      pendingCharges: await AcademicCharge.countDocuments({ schoolId: TARGET_SCHOOL_ID, status: { $in: ['pending', 'overdue'] } }),
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
