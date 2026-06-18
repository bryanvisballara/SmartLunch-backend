require('dotenv').config();
const { connectDB, runWithSchoolContext } = require('../src/config/db');

const SCHOOL_ID = 'comergio_demo_kns8p';

function normalizeText(value) {
  return String(value || '').trim();
}

function scheduleHasEntries(schedule) {
  return Array.isArray(schedule?.weeklySchedule)
    && schedule.weeklySchedule.some((entry) => (
      Number(entry?.weekday || 0) >= 1
      && normalizeText(entry?.startTime)
      && normalizeText(entry?.endTime)
    ));
}

async function main() {
  await connectDB();
  require('../src/models/index');
  const AcademicStructure = require('../src/models/academicStructure.model');

  const result = await runWithSchoolContext(SCHOOL_ID, async () => {
    const structure = await AcademicStructure.findOne({ schoolId: SCHOOL_ID });
    if (!structure) {
      throw new Error('AcademicStructure not found');
    }

    const schedules = Array.isArray(structure.gradeSchedules) ? structure.gradeSchedules : [];
    const populatedGrades = new Set(
      schedules
        .filter((schedule) => scheduleHasEntries(schedule))
        .map((schedule) => normalizeText(schedule.gradeKey).toLowerCase())
        .filter(Boolean)
    );

    const removed = [];
    const cleaned = schedules.filter((schedule) => {
      const gradeKey = normalizeText(schedule.gradeKey).toLowerCase();
      const shouldRemove = gradeKey
        && populatedGrades.has(gradeKey)
        && !scheduleHasEntries(schedule);

      if (shouldRemove) {
        removed.push({
          gradeKey: schedule.gradeKey,
          courseKey: schedule.courseKey || '',
        });
        return false;
      }

      return true;
    });

    if (removed.length === 0) {
      return { removed, total: schedules.length };
    }

    structure.gradeSchedules = cleaned;
    await structure.save();

    return { removed, total: cleaned.length };
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
