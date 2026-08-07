const CampusCourse = require('../models/campusCourse.model');
const CampusFlyLock = require('../models/campusFlyLock.model');
const CampusGradeEntry = require('../models/campusGradeEntry.model');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeMatchValue(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function normalizeTimeValue(value) {
  const normalized = normalizeText(value);
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(normalized) ? normalized : '';
}

function parseTimeToMinutes(value) {
  const normalized = normalizeTimeValue(value);
  if (!normalized) {
    return null;
  }
  const [hours, minutes] = normalized.split(':').map(Number);
  return (hours * 60) + minutes;
}

function getBogotaClock(referenceDate = new Date()) {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate);
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(referenceDate);
  const weekdayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    weekday: 'short',
  }).format(referenceDate);

  const getPart = (parts, type) => parts.find((part) => part.type === type)?.value || '';
  const year = getPart(dateParts, 'year');
  const month = getPart(dateParts, 'month');
  const day = getPart(dateParts, 'day');
  let hour = getPart(timeParts, 'hour');
  if (hour === '24') hour = '00';
  const minute = getPart(timeParts, 'minute');
  const weekdayMap = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return {
    dateKey: `${year}-${month}-${day}`,
    weekday: weekdayMap[weekdayLabel] || null,
    minutes: (Number(hour) * 60) + Number(minute),
    time: `${hour}:${minute}`,
  };
}

function buildExpiresAtFromBogotaDateAndTime(dateKey, endTime) {
  const normalizedEnd = normalizeTimeValue(endTime);
  if (!dateKey || !normalizedEnd) {
    return null;
  }
  // Colombia is UTC-5 year-round.
  return new Date(`${dateKey}T${normalizedEnd}:00-05:00`);
}

function resolveClassSessionForLock(course, referenceDate = new Date()) {
  const sessions = Array.isArray(course?.classSessions) ? course.classSessions : [];
  if (!sessions.length) {
    return {
      session: null,
      classSessionKey: '',
      endTime: '',
      expiresAt: null,
      inProgress: false,
      canLock: false,
      warning: 'Este curso no tiene horario de clase configurado. Solo puedes bloquear FLY mientras dictas una clase programada.',
    };
  }

  const clock = getBogotaClock(referenceDate);
  const todaySessions = sessions
    .map((session) => {
      const weekday = Number(session?.weekday);
      const startTime = normalizeTimeValue(session?.startTime);
      const endTime = normalizeTimeValue(session?.endTime);
      const startMinutes = parseTimeToMinutes(startTime);
      const endMinutes = parseTimeToMinutes(endTime);
      if (!weekday || !startTime || !endTime || startMinutes === null || endMinutes === null) {
        return null;
      }
      return {
        weekday,
        startTime,
        endTime,
        startMinutes,
        endMinutes,
        label: normalizeText(session?.label),
        key: `${weekday}:${startTime}:${endTime}`,
      };
    })
    .filter(Boolean)
    .filter((session) => session.weekday === clock.weekday)
    .sort((left, right) => left.startMinutes - right.startMinutes);

  if (!todaySessions.length) {
    return {
      session: null,
      classSessionKey: '',
      endTime: '',
      expiresAt: null,
      inProgress: false,
      canLock: false,
      warning: 'Hoy no hay una clase programada para este curso. Solo puedes bloquear FLY mientras la clase esté en curso.',
    };
  }

  const inProgress = todaySessions.find(
    (session) => clock.minutes >= session.startMinutes && clock.minutes < session.endMinutes
  ) || null;

  if (inProgress) {
    return {
      session: inProgress,
      classSessionKey: inProgress.key,
      endTime: inProgress.endTime,
      expiresAt: buildExpiresAtFromBogotaDateAndTime(clock.dateKey, inProgress.endTime),
      inProgress: true,
      canLock: true,
      warning: '',
    };
  }

  const upcoming = todaySessions.find((session) => clock.minutes < session.startMinutes) || null;
  if (upcoming) {
    return {
      session: upcoming,
      classSessionKey: upcoming.key,
      endTime: upcoming.endTime,
      expiresAt: buildExpiresAtFromBogotaDateAndTime(clock.dateKey, upcoming.endTime),
      inProgress: false,
      canLock: false,
      warning: `La clase de hoy inicia a las ${upcoming.startTime}. Solo puedes bloquear FLY mientras esté en curso.`,
    };
  }

  return {
    session: null,
    classSessionKey: '',
    endTime: '',
    expiresAt: null,
    inProgress: false,
    canLock: false,
    warning: 'Las clases de hoy ya terminaron. Solo puedes bloquear FLY mientras la clase esté en curso.',
  };
}

function isFlyLockDocumentActive(lock, now = new Date()) {
  if (!lock || !lock.active) {
    return false;
  }
  if (lock.expiresAt && new Date(lock.expiresAt).getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

function serializeFlyLock(lock, { warning = '' } = {}) {
  if (!lock) {
    return {
      active: false,
      lockedAt: null,
      expiresAt: null,
      classSessionKey: '',
      classSessionEndTime: '',
      subject: '',
      sectionLabel: '',
      teacherName: '',
      warning: warning || '',
      unlocksAtLabel: '',
    };
  }

  const active = isFlyLockDocumentActive(lock);
  const endTime = normalizeText(lock.classSessionEndTime);
  return {
    id: String(lock._id),
    campusCourseId: String(lock.campusCourseId),
    active,
    lockedAt: lock.lockedAt || null,
    expiresAt: lock.expiresAt || null,
    classSessionKey: normalizeText(lock.classSessionKey),
    classSessionEndTime: endTime,
    subject: normalizeText(lock.subject),
    sectionLabel: normalizeText(lock.sectionLabel),
    teacherName: normalizeText(lock.teacherName),
    warning: warning || '',
    unlocksAtLabel: active && endTime ? `hasta las ${endTime}` : (active ? 'hasta desbloqueo manual' : ''),
  };
}

async function expireStaleFlyLocks({ schoolId, campusCourseId = null, now = new Date() } = {}) {
  const query = {
    schoolId,
    active: true,
    expiresAt: { $ne: null, $lte: now },
  };
  if (campusCourseId) {
    query.campusCourseId = campusCourseId;
  }
  await CampusFlyLock.updateMany(query, {
    $set: {
      active: false,
    },
  });
}

function studentMatchesCourse(student, course) {
  const studentGrade = normalizeMatchValue(student?.grade);
  const studentSection = normalizeMatchValue(student?.course);
  if (!studentGrade) {
    return false;
  }

  const gradeCandidates = [
    course?.studentGradeKey,
    course?.gradeLevel,
    course?.section,
  ]
    .map(normalizeMatchValue)
    .filter(Boolean);

  const gradeMatched = gradeCandidates.some((alias) => (
    alias === studentGrade
    || alias.includes(studentGrade)
    || studentGrade.includes(alias)
  ));

  if (!gradeMatched) {
    return false;
  }

  const sectionCandidates = [
    course?.section,
    course?.sourceCourseKey,
  ]
    .map(normalizeMatchValue)
    .filter(Boolean);

  if (!sectionCandidates.length) {
    return true;
  }

  if (!studentSection) {
    return false;
  }

  return sectionCandidates.some((alias) => (
    alias === studentSection
    || alias.includes(studentSection)
    || studentSection.includes(alias)
  ));
}

async function getFlyLockForCourse({ schoolId, campusCourseId }) {
  await expireStaleFlyLocks({ schoolId, campusCourseId });
  return CampusFlyLock.findOne({ schoolId, campusCourseId }).lean();
}

async function setFlyLockForCourse({
  schoolId,
  course,
  teacherUserId,
  teacherName,
  active,
}) {
  await expireStaleFlyLocks({ schoolId, campusCourseId: course._id });

  if (!active) {
    const unlocked = await CampusFlyLock.findOneAndUpdate(
      { schoolId, campusCourseId: course._id },
      {
        $set: {
          schoolId,
          campusCourseId: course._id,
          teacherUserId,
          teacherName: normalizeText(teacherName),
          sourceCourseKey: normalizeText(course.sourceCourseKey).toUpperCase(),
          studentGradeKey: normalizeText(course.studentGradeKey || course.gradeLevel),
          sectionLabel: normalizeText(course.section),
          subject: normalizeText(course.subject) || normalizeText(course.title),
          active: false,
          lockedAt: null,
          expiresAt: null,
          classSessionKey: '',
          classSessionEndTime: '',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return {
      lock: unlocked,
      warning: '',
    };
  }

  const sessionResolution = resolveClassSessionForLock(course);
  if (!sessionResolution.canLock || !sessionResolution.expiresAt) {
    const error = new Error(
      sessionResolution.warning
      || 'Solo puedes bloquear FLY mientras la clase de este curso esté en curso.'
    );
    error.status = 400;
    throw error;
  }

  const locked = await CampusFlyLock.findOneAndUpdate(
    { schoolId, campusCourseId: course._id },
    {
      $set: {
        schoolId,
        campusCourseId: course._id,
        teacherUserId,
        teacherName: normalizeText(teacherName),
        sourceCourseKey: normalizeText(course.sourceCourseKey).toUpperCase(),
        studentGradeKey: normalizeText(course.studentGradeKey || course.gradeLevel),
        sectionLabel: normalizeText(course.section),
        subject: normalizeText(course.subject) || normalizeText(course.title),
        active: true,
        lockedAt: new Date(),
        expiresAt: sessionResolution.expiresAt,
        classSessionKey: sessionResolution.classSessionKey,
        classSessionEndTime: sessionResolution.endTime,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    lock: locked,
    warning: sessionResolution.warning,
  };
}

async function resolveStudentFlyLockStatus({ schoolId, student }) {
  await expireStaleFlyLocks({ schoolId });

  const locks = await CampusFlyLock.find({
    schoolId,
    active: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  }).lean();

  if (!locks.length || !student) {
    return {
      flyLocked: false,
      reason: '',
      unlocksAt: null,
      unlocksAtLabel: '',
      subject: '',
      teacherName: '',
    };
  }

  const courseIds = locks.map((lock) => lock.campusCourseId);
  const [courses, gradeEntries] = await Promise.all([
    CampusCourse.find({
      schoolId,
      _id: { $in: courseIds },
      status: 'active',
    }).lean(),
    CampusGradeEntry.find({
      schoolId,
      courseId: { $in: courseIds },
      studentId: student._id,
    })
      .select('courseId')
      .lean(),
  ]);

  const courseById = new Map(courses.map((course) => [String(course._id), course]));
  const gradedCourseIds = new Set(gradeEntries.map((entry) => String(entry.courseId)));

  for (const lock of locks) {
    const course = courseById.get(String(lock.campusCourseId));
    if (!course) continue;

    const inRoster = gradedCourseIds.has(String(course._id)) || studentMatchesCourse(student, course);
    if (!inRoster) continue;

    const endTime = normalizeText(lock.classSessionEndTime);
    return {
      flyLocked: true,
      reason: `FLY está pausado durante la clase de ${normalizeText(lock.subject) || 'tu curso'}.`,
      unlocksAt: lock.expiresAt || null,
      unlocksAtLabel: endTime ? `hasta las ${endTime}` : 'hasta que el docente lo reactive',
      subject: normalizeText(lock.subject),
      teacherName: normalizeText(lock.teacherName),
    };
  }

  return {
    flyLocked: false,
    reason: '',
    unlocksAt: null,
    unlocksAtLabel: '',
    subject: '',
    teacherName: '',
  };
}

module.exports = {
  getBogotaClock,
  resolveClassSessionForLock,
  isFlyLockDocumentActive,
  serializeFlyLock,
  expireStaleFlyLocks,
  getFlyLockForCourse,
  setFlyLockForCourse,
  resolveStudentFlyLockStatus,
  studentMatchesCourse,
};
