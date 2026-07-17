const fs = require('fs');
const path = require('path');

// Load .env manually (CRLF-safe)
const envPath = path.resolve(__dirname, '../../.env');
for (const line of fs.readFileSync(envPath, 'utf8').replace(/\r/g, '').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (process.env[key] === undefined) process.env[key] = value;
}

const mongoose = require('mongoose');
const { connectDB, runWithSchoolContext, runInControlDb } = require('../config/db');
require('../models/index');
const CampusCourse = require('../models/campusCourse.model');
const CampusGradeEntry = require('../models/campusGradeEntry.model');

async function inspectViaSchoolContext(schoolId) {
  return runWithSchoolContext(schoolId, async () => {
    const [active, archived, gradeEntryCount, gradeCourseIds] = await Promise.all([
      CampusCourse.countDocuments({ schoolId, status: 'active' }),
      CampusCourse.countDocuments({ schoolId, status: 'archived' }),
      CampusGradeEntry.countDocuments({ schoolId }),
      CampusGradeEntry.distinct('courseId', { schoolId }),
    ]);

    const archivedWithGrades = await CampusCourse.find({
      schoolId,
      status: 'archived',
      _id: { $in: gradeCourseIds },
    })
      .select('_id title subject section studentGradeKey teacherUserId updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    const activeWithGrades = await CampusCourse.countDocuments({
      schoolId,
      status: 'active',
      _id: { $in: gradeCourseIds },
    });

    return {
      via: 'runWithSchoolContext',
      schoolId,
      dbName: CampusCourse.db?.name || null,
      campusCourse: { active, archived, total: active + archived },
      campusGradeEntry: { total: gradeEntryCount, distinctCourseIds: gradeCourseIds.length },
      archivedCoursesWithGradeEntries: archivedWithGrades.length,
      activeCoursesWithGradeEntries: activeWithGrades,
      sampleArchivedCoursesWithGrades: archivedWithGrades.slice(0, 15).map((c) => ({
        id: String(c._id),
        title: c.title,
        subject: c.subject,
        section: c.section,
        studentGradeKey: c.studentGradeKey,
        teacherUserId: c.teacherUserId,
        updatedAt: c.updatedAt,
      })),
    };
  });
}

async function inspectControlDb(schoolId) {
  return runInControlDb(async () => {
    const courses = mongoose.connection.db.collection('campuscourses');
    const grades = mongoose.connection.db.collection('campusgradeentries');

    const [active, archived, gradeEntryCount, gradeCourseIds] = await Promise.all([
      courses.countDocuments({ schoolId, status: 'active' }),
      courses.countDocuments({ schoolId, status: 'archived' }),
      grades.countDocuments({ schoolId }),
      grades.distinct('courseId', { schoolId }),
    ]);

    const archivedWithGrades = await courses
      .find({ schoolId, status: 'archived', _id: { $in: gradeCourseIds } })
      .project({ title: 1, subject: 1, section: 1, studentGradeKey: 1, teacherUserId: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 })
      .toArray();

    const activeWithGradesDocs = await courses
      .find({ schoolId, status: 'active', _id: { $in: gradeCourseIds } })
      .project({ title: 1 })
      .toArray();

    return {
      via: 'runInControlDb',
      schoolId,
      dbName: mongoose.connection.name,
      campusCourse: { active, archived, total: active + archived },
      campusGradeEntry: { total: gradeEntryCount, distinctCourseIds: gradeCourseIds.length },
      archivedCoursesWithGradeEntries: archivedWithGrades.length,
      activeCoursesWithGradeEntries: activeWithGradesDocs.length,
      sampleArchivedCoursesWithGrades: archivedWithGrades.slice(0, 15).map((c) => ({
        id: String(c._id),
        title: c.title,
        subject: c.subject,
        section: c.section,
        studentGradeKey: c.studentGradeKey,
        teacherUserId: c.teacherUserId,
        updatedAt: c.updatedAt,
      })),
      activeCourseTitlesWithGrades: activeWithGradesDocs.map((c) => c.title),
    };
  });
}

async function main() {
  await connectDB();

  const schoolScoped = [];
  for (const schoolId of ['comergio-demo', 'comergio_demo']) {
    schoolScoped.push(await inspectViaSchoolContext(schoolId));
  }

  const control = await inspectControlDb('comergio-demo');

  console.log(JSON.stringify({
    ok: true,
    inspectedAt: new Date().toISOString(),
    schoolScoped,
    controlDbComergioDemo: control,
    archiveOrphanLogic: {
      location: 'syncTeacherCoursesFromAcademicStructure in campus.routes.js',
      checksForGradeEntriesBeforeArchive: false,
      canArchiveGradeBearingCourses: true,
      mechanisms: [
        'Archives sectionless active courses when sectioned candidates exist for same subject+gradeKey',
        'Archives unmatched active orphans by identity subject::gradeKey::section',
      ],
      observedForComergioDemo: control.campusCourse.archived === 0 && control.archivedCoursesWithGradeEntries === 0
        ? 'No archived courses currently; orphan archive did not leave grade-bearing archived courses in control DB.'
        : 'Archived grade-bearing courses present; orphan logic may have contributed (no grade check).',
    },
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }, null, 2));
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
