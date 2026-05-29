require('dotenv').config();

const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const CampusCourse = require('../models/campusCourse.model');

const APPLY_CHANGES = process.argv.includes('--apply');
const SCHOOL_ARG = process.argv.find((arg) => arg.startsWith('--schoolId='));
const TARGET_SCHOOL_ID = SCHOOL_ARG ? String(SCHOOL_ARG.split('=').slice(1).join('=') || '').trim() : '';
const SLOT_START_MINUTES = (7 * 60) + 30;
const SLOT_END_MINUTES = 16 * 60;
const SLOT_DURATION_MINUTES = 60;
const SLOT_STEP_MINUTES = 60;
const WEEKDAYS = [1, 2, 3, 4, 5];

function toMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return (hours * 60) + minutes;
}

function toTimeValue(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function buildWeeklySlots() {
  const slots = [];

  for (const weekday of WEEKDAYS) {
    for (let startMinutes = SLOT_START_MINUTES; startMinutes + SLOT_DURATION_MINUTES <= SLOT_END_MINUTES; startMinutes += SLOT_STEP_MINUTES) {
      slots.push({
        weekday,
        startTime: toTimeValue(startMinutes),
        endTime: toTimeValue(startMinutes + SLOT_DURATION_MINUTES),
      });
    }
  }

  return slots;
}

function sessionsOverlap(left, right) {
  if (Number(left.weekday) !== Number(right.weekday)) {
    return false;
  }

  const leftStart = toMinutes(left.startTime);
  const leftEnd = toMinutes(left.endTime);
  const rightStart = toMinutes(right.startTime);
  const rightEnd = toMinutes(right.endTime);

  if ([leftStart, leftEnd, rightStart, rightEnd].some((value) => value === null)) {
    return false;
  }

  return leftStart < rightEnd && rightStart < leftEnd;
}

function buildConflictSummary(courses) {
  const conflicts = [];

  for (let index = 0; index < courses.length; index += 1) {
    const currentCourse = courses[index];
    for (const currentSession of currentCourse.classSessions || []) {
      for (let compareIndex = index + 1; compareIndex < courses.length; compareIndex += 1) {
        const compareCourse = courses[compareIndex];
        for (const compareSession of compareCourse.classSessions || []) {
          if (sessionsOverlap(currentSession, compareSession)) {
            conflicts.push({
              teacherUserId: currentCourse.teacherUserId,
              schoolId: currentCourse.schoolId,
              weekday: currentSession.weekday,
              left: {
                courseId: String(currentCourse._id),
                title: currentCourse.title,
                studentGradeKey: currentCourse.studentGradeKey,
                startTime: currentSession.startTime,
                endTime: currentSession.endTime,
              },
              right: {
                courseId: String(compareCourse._id),
                title: compareCourse.title,
                studentGradeKey: compareCourse.studentGradeKey,
                startTime: compareSession.startTime,
                endTime: compareSession.endTime,
              },
            });
          }
        }
      }
    }
  }

  return conflicts;
}

function buildReassignedSessions(sessionCount) {
  const slots = buildWeeklySlots();
  if (sessionCount > slots.length) {
    throw new Error(`No hay suficientes bloques semanales para reasignar ${sessionCount} clases sin cruces.`);
  }

  return slots.slice(0, sessionCount);
}

async function run() {
  await connectDB();

  const query = { status: 'active' };
  if (TARGET_SCHOOL_ID) {
    query.schoolId = TARGET_SCHOOL_ID;
  }

  const courses = await CampusCourse.find(query)
    .sort({ schoolId: 1, teacherUserId: 1, subject: 1, gradeLevel: 1, section: 1, title: 1 })
    .lean();

  const teacherBuckets = new Map();
  for (const course of courses) {
    const key = `${course.schoolId}::${course.teacherUserId}`;
    const bucket = teacherBuckets.get(key) || [];
    bucket.push(course);
    teacherBuckets.set(key, bucket);
  }

  const teachersWithConflicts = [];
  const updates = [];

  for (const [bucketKey, teacherCourses] of teacherBuckets.entries()) {
    const conflicts = buildConflictSummary(teacherCourses);
    if (conflicts.length === 0) {
      continue;
    }

    teachersWithConflicts.push({
      bucketKey,
      courseCount: teacherCourses.length,
      conflictCount: conflicts.length,
      sample: conflicts.slice(0, 10),
    });

    const totalSessionCount = teacherCourses.reduce((total, course) => total + ((course.classSessions || []).length), 0);
    const reassignedSessions = buildReassignedSessions(totalSessionCount);
    let slotIndex = 0;

    teacherCourses.forEach((course) => {
      const originalSessions = Array.isArray(course.classSessions) ? course.classSessions : [];
      const nextSessions = originalSessions.map((session) => {
        const assignedSlot = reassignedSessions[slotIndex];
        slotIndex += 1;

        return {
          weekday: assignedSlot.weekday,
          startTime: assignedSlot.startTime,
          endTime: assignedSlot.endTime,
          label: String(session.label || '').trim(),
        };
      });

      updates.push({
        courseId: String(course._id),
        title: course.title,
        schoolId: course.schoolId,
        teacherUserId: course.teacherUserId,
        previousSessions: originalSessions,
        nextSessions,
      });
    });
  }

  console.log(JSON.stringify({
    apply: APPLY_CHANGES,
    schoolId: TARGET_SCHOOL_ID || null,
    teacherConflictGroups: teachersWithConflicts.length,
    updateCount: updates.length,
    teachers: teachersWithConflicts,
    updates: updates.slice(0, 20),
  }, null, 2));

  if (APPLY_CHANGES) {
    for (const update of updates) {
      await CampusCourse.updateOne(
        { _id: update.courseId },
        { $set: { classSessions: update.nextSessions } }
      );
    }
    console.log(`Applied ${updates.length} course schedule updates.`);
  }

  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('fixCampusTeacherScheduleConflicts failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
