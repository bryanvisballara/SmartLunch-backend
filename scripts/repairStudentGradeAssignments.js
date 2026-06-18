require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB, runWithSchoolContext } = require('../src/config/db');
require('../src/models');

const AcademicStructure = require('../src/models/academicStructure.model');
const Student = require('../src/models/student.model');
const StudentBillingProfile = require('../src/models/studentBillingProfile.model');
const { resolveAcademicStructureGradeKey, normalizeText } = require('../src/utils/feeGradeMatching');

const SCHOOL_ID = String(process.env.REPAIR_SCHOOL_ID || 'comergio_demo_kns8p').trim();
const FALLBACK_STRUCTURE_SCHOOL_ID = String(process.env.FALLBACK_STRUCTURE_SCHOOL_ID || '').trim();
const DRY_RUN = process.argv.includes('--dry-run');

async function loadStructureGrades(schoolId) {
  let structureGrades = [];

  await runWithSchoolContext(schoolId, async () => {
    const structure = await AcademicStructure.findOne({ schoolId }).lean();
    structureGrades = Array.isArray(structure?.grades) ? structure.grades : [];
  });

  if (!structureGrades.length && FALLBACK_STRUCTURE_SCHOOL_ID && FALLBACK_STRUCTURE_SCHOOL_ID !== schoolId) {
    await runWithSchoolContext(FALLBACK_STRUCTURE_SCHOOL_ID, async () => {
      const fallbackStructure = await AcademicStructure.findOne({ schoolId: FALLBACK_STRUCTURE_SCHOOL_ID }).lean();
      structureGrades = Array.isArray(fallbackStructure?.grades) ? fallbackStructure.grades : [];
    });
    if (structureGrades.length) {
      console.log(`Using fallback structure from ${FALLBACK_STRUCTURE_SCHOOL_ID}`);
    }
  }

  return structureGrades;
}

async function repairStudentGradeAssignments() {
  await connectDB();
  console.log(`Repairing student grade assignments for ${SCHOOL_ID}${DRY_RUN ? ' (dry-run)' : ''}`);

  const result = await runWithSchoolContext(SCHOOL_ID, async () => {
    const structureGrades = await loadStructureGrades(SCHOOL_ID);

    if (!structureGrades.length) {
      throw new Error(`No hay grados configurados en rectoría para ${SCHOOL_ID}`);
    }

    const students = await Student.find({ schoolId: SCHOOL_ID, deletedAt: null }).select('_id grade firstName lastName').lean();
    const summary = {
      totalStudents: students.length,
      updatedStudents: 0,
      updatedBillingProfiles: 0,
      unchanged: 0,
      unresolved: [],
      mappings: [],
    };

    for (const student of students) {
      const currentGrade = normalizeText(student.grade);
      const resolvedGrade = resolveAcademicStructureGradeKey(currentGrade, structureGrades);

      if (!resolvedGrade || resolvedGrade === currentGrade) {
        summary.unchanged += 1;
        if (currentGrade && !structureGrades.some((grade) => (
          normalizeText(grade?.key) === currentGrade || normalizeText(grade?.label) === currentGrade
        ))) {
          summary.unresolved.push({
            studentId: String(student._id),
            name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
            grade: currentGrade,
            resolvedGrade,
          });
        }
        continue;
      }

      summary.mappings.push({
        studentId: String(student._id),
        name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
        from: currentGrade,
        to: resolvedGrade,
      });

      if (!DRY_RUN) {
        await Student.updateOne({ _id: student._id }, { $set: { grade: resolvedGrade } });
        const billingUpdate = await StudentBillingProfile.updateMany(
          { schoolId: SCHOOL_ID, studentId: student._id },
          { $set: { grade: resolvedGrade } },
        );
        summary.updatedBillingProfiles += Number(billingUpdate.modifiedCount || 0);
      }

      summary.updatedStudents += 1;
    }

    return summary;
  });

  console.log(JSON.stringify(result, null, 2));
  await mongoose.connection.close();
}

repairStudentGradeAssignments().catch(async (error) => {
  console.error('Repair failed:', error.message);
  try {
    await mongoose.connection.close();
  } catch (closeError) {
    // ignore
  }
  process.exit(1);
});
