require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB, runWithSchoolContext } = require('../src/config/db');
require('../src/models');

const AcademicStructure = require('../src/models/academicStructure.model');
const Student = require('../src/models/student.model');
const { resolveAcademicStructureGradeKey, normalizeText } = require('../src/utils/feeGradeMatching');

const TARGET_SCHOOL_ID = String(process.env.TARGET_SCHOOL_ID || 'Millennium School').trim();
const TEMPLATE_SCHOOL_ID = String(process.env.TEMPLATE_SCHOOL_ID || 'comergio_demo_kns8p').trim();
const DRY_RUN = process.argv.includes('--dry-run');

const DEFAULT_LEVELS = [
  { key: 'preescolar', label: 'Preescolar', order: 10, status: 'active' },
  { key: 'primaria', label: 'Primaria', order: 20, status: 'active' },
  { key: 'secundaria', label: 'Secundaria', order: 30, status: 'active' },
];

const DEFAULT_GRADE_LEVELS = {
  maternal: 'preescolar',
  kinder_1: 'preescolar',
  kinder_2: 'preescolar',
  kinder_3: 'preescolar',
  kinder_4: 'preescolar',
  kinder_5: 'preescolar',
  prep: 'preescolar',
  1: 'primaria',
  2: 'primaria',
  3: 'primaria',
  4: 'primaria',
  5: 'primaria',
  6: 'secundaria',
  7: 'secundaria',
  8: 'secundaria',
  9: 'secundaria',
  10: 'secundaria',
  11: 'secundaria',
};

const DEFAULT_GRADE_LABELS = {
  maternal: 'Maternal',
  kinder_1: 'Kinder 1',
  kinder_2: 'Kinder 2',
  kinder_3: 'Kinder 3',
  kinder_4: 'Kinder 4',
  kinder_5: 'Kinder 5',
  prep: 'Transición',
};

async function loadTemplateStructure() {
  let template = null;
  await runWithSchoolContext(TEMPLATE_SCHOOL_ID, async () => {
    template = await AcademicStructure.findOne({ schoolId: TEMPLATE_SCHOOL_ID }).lean();
  });
  return template;
}

function buildGradeDefinition(gradeKey, templateGrades = []) {
  const templateGrade = templateGrades.find((grade) => normalizeText(grade?.key) === gradeKey);
  const label = normalizeText(templateGrade?.label || DEFAULT_GRADE_LABELS[gradeKey] || gradeKey);
  const levelKey = normalizeText(templateGrade?.levelKey || DEFAULT_GRADE_LEVELS[gradeKey] || 'preescolar');

  return {
    key: gradeKey,
    label,
    levelKey,
    order: Number(templateGrade?.order || 0) || 10,
    status: 'active',
    courses: Array.isArray(templateGrade?.courses) ? templateGrade.courses : [],
  };
}

async function ensureMillenniumAcademicStructure() {
  await connectDB();
  console.log(`Ensuring academic structure for ${TARGET_SCHOOL_ID}${DRY_RUN ? ' (dry-run)' : ''}`);

  const template = await loadTemplateStructure();
  const templateGrades = Array.isArray(template?.grades) ? template.grades : [];
  const templateLevels = Array.isArray(template?.levels) && template.levels.length
    ? template.levels
    : DEFAULT_LEVELS;

  const result = await runWithSchoolContext(TARGET_SCHOOL_ID, async () => {
    const students = await Student.find({ schoolId: TARGET_SCHOOL_ID, deletedAt: null }).select('grade').lean();
    const studentGradeKeys = Array.from(new Set(students
      .map((student) => resolveAcademicStructureGradeKey(student.grade, templateGrades))
      .filter(Boolean)));

    let configuration = await AcademicStructure.findOne({ schoolId: TARGET_SCHOOL_ID });
    if (!configuration) {
      configuration = new AcademicStructure({
        schoolId: TARGET_SCHOOL_ID,
        academicYear: String(new Date().getFullYear()),
        levels: [],
        subjects: [],
        grades: [],
        scheduleSettings: template?.scheduleSettings || {},
        scheduleBreaks: [],
        teachingAvailability: [],
        subjectLoadTemplates: [],
        gradeSchedules: [],
        academicPeriods: template?.academicPeriods || [],
      });
    }

    const existingGradeKeys = new Set((configuration.grades || []).map((grade) => normalizeText(grade?.key)).filter(Boolean));
    const requiredGradeKeys = Array.from(new Set([
      ...studentGradeKeys,
      ...templateGrades.map((grade) => normalizeText(grade?.key)).filter(Boolean),
    ])).sort((left, right) => left.localeCompare(right, 'es', { numeric: true }));

    const missingGradeKeys = requiredGradeKeys.filter((gradeKey) => !existingGradeKeys.has(gradeKey));
    const nextGrades = [...(configuration.grades || [])];

    missingGradeKeys.forEach((gradeKey, index) => {
      nextGrades.push({
        ...buildGradeDefinition(gradeKey, templateGrades),
        order: (nextGrades.length + index + 1) * 10,
      });
    });

    const summary = {
      targetSchoolId: TARGET_SCHOOL_ID,
      templateSchoolId: TEMPLATE_SCHOOL_ID,
      studentGradeKeys,
      existingGradeKeys: [...existingGradeKeys],
      missingGradeKeys,
      finalGradeKeys: nextGrades.map((grade) => grade.key),
      dryRun: DRY_RUN,
    };

    if (!DRY_RUN) {
      configuration.levels = templateLevels;
      configuration.grades = nextGrades;
      await configuration.save();
    }

    return summary;
  });

  console.log(JSON.stringify(result, null, 2));
  await mongoose.connection.close();
}

ensureMillenniumAcademicStructure().catch(async (error) => {
  console.error('Ensure structure failed:', error.message);
  try {
    await mongoose.connection.close();
  } catch (closeError) {
    // ignore
  }
  process.exit(1);
});
