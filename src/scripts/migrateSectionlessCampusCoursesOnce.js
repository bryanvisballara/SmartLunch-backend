#!/usr/bin/env node
/**
 * One-shot: sync teacher campus courses so grade-wide shells ("1") migrate
 * grades onto real sections (1A / 1B) and get archived when empty.
 *
 * Usage:
 *   node src/scripts/migrateSectionlessCampusCoursesOnce.js [schoolId]
 */
require('dotenv').config();

const { connectDB, runWithSchoolContext } = require('../config/db');
const CampusCourse = require('../models/campusCourse.model');
const CampusGradeEntry = require('../models/campusGradeEntry.model');
const Student = require('../models/student.model');

// Import after models so school-scoped registry is ready.
const campusRoutesPath = require.resolve('../routes/campus.routes');
delete require.cache[campusRoutesPath];

async function loadSyncHelper() {
  // Re-require campus.routes is heavy; call sync by duplicating minimal migration path.
  // Prefer invoking through HTTPless internal by requiring the module factory.
  // campus.routes doesn't export sync — inline the public path via require and eval is bad.
  // Instead: use mongoconnect + direct logic mirroring migrateSectionlessGradesToSectionCourses.
  return null;
}

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeCourseMembershipValue(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function getCourseGradeAliases(course = {}) {
  const aliases = new Set();
  const add = (value) => {
    const normalized = normalizeCourseMembershipValue(value);
    if (normalized) aliases.add(normalized);
  };
  add(course.studentGradeKey);
  add(course.gradeLevel);
  const gradeKeyParts = normalizeText(course.studentGradeKey).split(':').map((part) => part.trim()).filter(Boolean);
  if (gradeKeyParts.length > 1) {
    add(gradeKeyParts[gradeKeyParts.length - 1]);
  }
  return Array.from(aliases);
}

function getCourseSectionAliases(course = {}) {
  const aliases = new Set();
  const add = (value) => {
    const normalized = normalizeCourseMembershipValue(value);
    if (normalized) aliases.add(normalized);
  };
  const section = normalizeText(course.section);
  const sourceCourseKey = normalizeText(course.sourceCourseKey);
  if (!section && !sourceCourseKey) {
    return [];
  }
  if (sourceCourseKey) add(sourceCourseKey);
  add(section);
  const compactSection = section.replace(/\s+/g, '');
  const sectionMatch = compactSection.match(/^(\d{1,2})?([a-z])$/i);
  const sectionSuffix = sectionMatch?.[2] ? sectionMatch[2].toUpperCase() : '';
  if (sectionSuffix) add(sectionSuffix);
  if (/^\d+[a-z]$/i.test(compactSection)) add(compactSection);
  return Array.from(aliases);
}

function studentBelongsToCourse(student, course) {
  const gradeAliases = getCourseGradeAliases(course).map(normalizeCourseMembershipValue).filter(Boolean);
  const sectionAliases = getCourseSectionAliases(course).map(normalizeCourseMembershipValue).filter(Boolean);
  const studentGrade = normalizeCourseMembershipValue(student?.grade);
  const studentCourse = normalizeCourseMembershipValue(student?.course);
  if (!studentGrade || !gradeAliases.includes(studentGrade)) {
    return false;
  }
  return sectionAliases.length === 0 || sectionAliases.includes(studentCourse);
}

async function migrateForSchool(schoolId) {
  return runWithSchoolContext(schoolId, async () => {
    const sectionless = await CampusCourse.find({
      schoolId,
      status: 'active',
      $or: [{ section: '' }, { section: { $exists: false } }],
    }).lean();

    let migratedEntries = 0;
    let archivedCourses = 0;
    const samples = [];

    for (const sectionlessCourse of sectionless) {
      const sectionedCourses = await CampusCourse.find({
        schoolId,
        teacherUserId: sectionlessCourse.teacherUserId,
        subject: sectionlessCourse.subject,
        studentGradeKey: sectionlessCourse.studentGradeKey,
        status: 'active',
        section: { $exists: true, $nin: ['', null] },
      }).lean();

      if (!sectionedCourses.length) {
        continue;
      }

      const entries = await CampusGradeEntry.find({
        schoolId,
        courseId: sectionlessCourse._id,
      }).lean();

      const studentIds = Array.from(new Set(entries.map((entry) => String(entry.studentId || '')).filter(Boolean)));
      const students = studentIds.length
        ? await Student.find({ schoolId, _id: { $in: studentIds } }).select('_id name grade course').lean()
        : [];
      const studentById = new Map(students.map((student) => [String(student._id), student]));

      for (const entry of entries) {
        const student = studentById.get(String(entry.studentId || ''));
        if (!student) continue;
        const targetCourse = sectionedCourses.find((course) => studentBelongsToCourse(student, course));
        if (!targetCourse) continue;

        const duplicate = await CampusGradeEntry.findOne({
          schoolId,
          courseId: targetCourse._id,
          studentId: entry.studentId,
          academicPeriodKey: entry.academicPeriodKey,
          componentKey: entry.componentKey,
        }).select('_id').lean();

        if (duplicate) {
          await CampusGradeEntry.deleteOne({ _id: entry._id, schoolId });
        } else {
          await CampusGradeEntry.updateOne(
            { _id: entry._id, schoolId },
            { $set: { courseId: targetCourse._id } },
          );
        }
        migratedEntries += 1;
        if (samples.length < 8) {
          samples.push({
            student: student.name,
            course: student.course,
            from: sectionlessCourse.title || sectionlessCourse.subject,
            to: targetCourse.section || targetCourse.title,
          });
        }
      }

      const remaining = await CampusGradeEntry.countDocuments({
        schoolId,
        courseId: sectionlessCourse._id,
      });
      if (remaining === 0) {
        await CampusCourse.updateOne(
          { _id: sectionlessCourse._id, schoolId },
          { $set: { status: 'archived' } },
        );
        archivedCourses += 1;
      }
    }

    return {
      schoolId,
      sectionlessFound: sectionless.length,
      migratedEntries,
      archivedCourses,
      samples,
    };
  });
}

async function main() {
  await connectDB();
  await loadSyncHelper();
  const requested = process.argv[2];
  const schoolIds = requested
    ? [requested]
    : ['comergio_demo_kns8p', 'comergio-demo', 'comergio_demo'];

  for (const schoolId of schoolIds) {
    try {
      const result = await migrateForSchool(schoolId);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(`Failed for ${schoolId}:`, error.message);
    }
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
