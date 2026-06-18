require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const AcademicFeeConfiguration = require('../src/models/academicFeeConfiguration.model');
const AcademicStructure = require('../src/models/academicStructure.model');
const SchoolCreationSnapshot = require('../src/models/schoolCreationSnapshot.model');
const {
  canonicalizeGradeFeeSettingsForStructure,
  normalizeText,
} = require('../src/utils/feeGradeMatching');
const { syncSchoolBillingProfilesFromFeeConfiguration } = require('../src/services/academicConsolidatedBilling.service');

const SCHOOL_ID = String(process.env.REPAIR_SCHOOL_ID || 'comergio-demo').trim();

function summarizeGradeSettings(label, gradeSettings = []) {
  const watchGrades = ['maternal', 'kinder_1', 'kinder_2', 'kinder_3', 'kinder_4', 'kinder_5', 'prep', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
  console.log(`\n${label}`);
  watchGrades.forEach((grade) => {
    const setting = gradeSettings.find((item) => normalizeText(item?.grade).toLowerCase() === grade);
    if (!setting) return;
    console.log(`  ${grade}: pensión ${setting.monthlyTuition}, matrícula ${setting.enrollmentFee}`);
  });
}

async function repairSchoolFeeSettings() {
  const connection = await connectDB();
  console.log(`MongoDB connected (${connection.name})`);
  console.log(`Repairing school: ${SCHOOL_ID}`);

  const [feeConfiguration, academicStructure, snapshot] = await Promise.all([
    AcademicFeeConfiguration.findOne({ schoolId: SCHOOL_ID }),
    AcademicStructure.findOne({ schoolId: SCHOOL_ID }),
    SchoolCreationSnapshot.findOne({ schoolId: SCHOOL_ID }).lean(),
  ]);

  if (!feeConfiguration) {
    throw new Error(`No existe configuración de costos para ${SCHOOL_ID}`);
  }

  const structureGrades = Array.isArray(academicStructure?.grades) ? academicStructure.grades : [];
  if (!structureGrades.length) {
    throw new Error(`No existe estructura académica para ${SCHOOL_ID}`);
  }

  const beforeSettings = (feeConfiguration.gradeSettings || []).map((item) => (
    item?.toObject ? item.toObject() : { ...item }
  ));

  summarizeGradeSettings('Antes', beforeSettings);

  const repairedSettings = canonicalizeGradeFeeSettingsForStructure(
    beforeSettings,
    structureGrades,
    { snapshotCostsByGrade: snapshot?.payload?.financialCostsByGrade || {} },
  );

  summarizeGradeSettings('Después', repairedSettings);

  feeConfiguration.gradeSettings = repairedSettings;
  await feeConfiguration.save();

  const billingSync = await syncSchoolBillingProfilesFromFeeConfiguration({
    schoolId: SCHOOL_ID,
    feeConfiguration: feeConfiguration.toObject ? feeConfiguration.toObject() : feeConfiguration,
  });

  console.log('\nSincronización de alumnos:', billingSync);
  console.log('Reparación completada.');

  await mongoose.connection.close();
}

repairSchoolFeeSettings().catch(async (error) => {
  console.error('Repair failed:', error.message);
  try {
    await mongoose.connection.close();
  } catch (closeError) {
    // ignore
  }
  process.exit(1);
});
