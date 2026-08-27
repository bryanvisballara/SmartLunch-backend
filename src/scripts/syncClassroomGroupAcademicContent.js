/**
 * Copy academic content across CampusCourse siblings that share a classroom group
 * (e.g. Collaborators grades 2, 3 and 4) for the same teacher + subject.
 *
 * Usage:
 *   node src/scripts/syncClassroomGroupAcademicContent.js --dry-run
 *   node src/scripts/syncClassroomGroupAcademicContent.js --apply
 *   node src/scripts/syncClassroomGroupAcademicContent.js --apply --school "Millennium School"
 */
require('dotenv').config({ override: true });

const mongoose = require('mongoose');
const { connectDB, runWithSchoolContext } = require('../config/db');
require('../models');
const AcademicStructure = require('../models/academicStructure.model');
const CampusCourse = require('../models/campusCourse.model');
const {
  courseHasAcademicContentTopics,
  resolveClassroomGroupForCourse,
  serializeClassroomGroups,
} = require('../utils/classroomGroups');

const DEFAULT_SCHOOL_ID = 'Millennium School';

function countAcademicContentTopics(content = []) {
  return (Array.isArray(content) ? content : []).reduce(
    (sum, period) => sum + (Array.isArray(period?.topics) ? period.topics.length : 0),
    0,
  );
}

function subjectKey(value) {
  return String(value || '').trim().toLowerCase();
}

async function run() {
  const apply = process.argv.includes('--apply');
  const schoolFlagIndex = process.argv.indexOf('--school');
  const schoolId = schoolFlagIndex >= 0
    ? String(process.argv[schoolFlagIndex + 1] || '').trim()
    : DEFAULT_SCHOOL_ID;

  if (!schoolId) {
    throw new Error('Missing school id');
  }

  await connectDB();

  const summary = await runWithSchoolContext(schoolId, async () => {
    const structure = await AcademicStructure.findOne({ schoolId }).select('classroomGroups').lean();
    const classroomGroups = serializeClassroomGroups(structure?.classroomGroups);
    const courses = await CampusCourse.find({ schoolId, status: 'active' })
      .select('_id title subject gradeLevel section studentGradeKey teacherUserId classroomGroupKey classroomGroupLabel academicContent')
      .lean();

    const buckets = new Map();
    const unmatched = [];

    courses.forEach((course) => {
      const group = resolveClassroomGroupForCourse(classroomGroups, course);
      if (!group) {
        unmatched.push({
          id: String(course._id),
          title: course.title,
          subject: course.subject,
          grade: course.studentGradeKey || course.gradeLevel || '',
        });
        return;
      }

      const key = [
        String(course.teacherUserId || ''),
        subjectKey(course.subject),
        group.key,
      ].join('::');

      if (!buckets.has(key)) {
        buckets.set(key, {
          teacherUserId: String(course.teacherUserId || ''),
          subject: course.subject,
          groupKey: group.key,
          groupLabel: group.label,
          gradeKeys: group.gradeKeys,
          courses: [],
        });
      }
      buckets.get(key).courses.push(course);
    });

    const copied = [];
    const skipped = [];

    for (const bucket of buckets.values()) {
      if (bucket.courses.length < 2) {
        skipped.push({
          subject: bucket.subject,
          group: bucket.groupLabel,
          reason: 'solo un grado en el grupo para este docente',
          grades: bucket.courses.map((course) => course.studentGradeKey || course.gradeLevel),
        });
        continue;
      }

      const ranked = [...bucket.courses].sort((left, right) => (
        countAcademicContentTopics(right.academicContent) - countAcademicContentTopics(left.academicContent)
      ));
      const source = ranked.find((course) => courseHasAcademicContentTopics(course));
      if (!source) {
        skipped.push({
          subject: bucket.subject,
          group: bucket.groupLabel,
          reason: 'ningún grado tiene contenido',
          grades: bucket.courses.map((course) => course.studentGradeKey || course.gradeLevel),
        });
        continue;
      }

      const targets = bucket.courses.filter((course) => String(course._id) !== String(source._id));
      const sourceTopicCount = countAcademicContentTopics(source.academicContent);

      for (const target of targets) {
        const targetTopicCount = countAcademicContentTopics(target.academicContent);
        if (targetTopicCount >= sourceTopicCount && targetTopicCount > 0) {
          skipped.push({
            subject: bucket.subject,
            group: bucket.groupLabel,
            reason: 'destino ya tiene contenido equivalente o mayor',
            from: source.studentGradeKey || source.gradeLevel,
            to: target.studentGradeKey || target.gradeLevel,
            topics: targetTopicCount,
          });
          continue;
        }

        copied.push({
          subject: bucket.subject,
          group: bucket.groupLabel,
          from: source.studentGradeKey || source.gradeLevel,
          to: target.studentGradeKey || target.gradeLevel,
          courseId: String(target._id),
          topics: sourceTopicCount,
        });

        if (apply) {
          await CampusCourse.updateOne(
            { _id: target._id, schoolId },
            { $set: { academicContent: source.academicContent } },
          );
        }
      }
    }

    return {
      schoolId,
      apply,
      dbName: CampusCourse.db?.name || null,
      classroomGroups: classroomGroups.map((group) => ({
        key: group.key,
        label: group.label,
        gradeKeys: group.gradeKeys,
      })),
      copiedCount: copied.length,
      copied,
      skipped: skipped.slice(0, 40),
      skippedCount: skipped.length,
      unmatchedCourses: unmatched.length,
    };
  });

  console.log(JSON.stringify(summary, null, 2));
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_) {
      // ignore
    }
  });
