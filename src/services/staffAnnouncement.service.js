const User = require('../models/user.model');
const AcademicStructure = require('../models/academicStructure.model');
const CampusCourse = require('../models/campusCourse.model');
const StaffAnnouncement = require('../models/staffAnnouncement.model');
const StaffAnnouncementRecipient = require('../models/staffAnnouncementRecipient.model');
const { gradeKeyMatchesClassroomGroupKey, uniqueClassroomGroupValues } = require('../utils/classroomGroups');
const { queueNotificationsForParents } = require('./notification.service');

const STAFF_ANNOUNCEMENT_TARGET_ROLES = [
  'teacher',
  'psychology',
  'nursing',
  'academic_secretary',
  'admissions',
  'coordination',
  'billing',
  'human_resources',
  'rectoria',
  'direccion',
  'admin',
];

function normalizeText(value) {
  return String(value || '').trim();
}

function uniqueObjectIds(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || '');
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeIdList(values = []) {
  return uniqueObjectIds(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeText(value))
      .filter((value) => value && value !== 'null' && value !== 'undefined')
  );
}

function normalizeLevelKeys(values = []) {
  return uniqueObjectIds((Array.isArray(values) ? values : []).map((value) => normalizeText(value)).filter(Boolean));
}

function gradeValueMatchesStructureGrade(gradeValue, structureGradeKey) {
  return gradeKeyMatchesClassroomGroupKey(gradeValue, structureGradeKey)
    || gradeKeyMatchesClassroomGroupKey(structureGradeKey, gradeValue);
}

function collectTeacherIdsFromEntry(entry = {}) {
  return normalizeIdList([
    ...(Array.isArray(entry?.teacherUserIds) ? entry.teacherUserIds : []),
    entry?.teacherUserId,
  ]);
}

async function buildTeacherAudienceDirectory(schoolId) {
  const [teachers, academicStructure, campusCourses] = await Promise.all([
    User.find({
      schoolId,
      role: 'teacher',
      status: 'active',
      deletedAt: null,
    })
      .select('_id name username')
      .sort({ name: 1, username: 1 })
      .lean(),
    AcademicStructure.findOne({ schoolId }).select('levels grades gradeSchedules subjectLoadTemplates teachingAvailability').lean(),
    CampusCourse.find({
      schoolId,
      status: 'active',
      teacherUserId: { $nin: [null, ''] },
    })
      .select('teacherUserId studentGradeKey gradeLevel')
      .lean(),
  ]);

  const levels = (Array.isArray(academicStructure?.levels) ? academicStructure.levels : [])
    .filter((level) => normalizeText(level?.status || 'active') !== 'archived' && normalizeText(level?.key))
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || String(left.label || '').localeCompare(String(right.label || ''), 'es'));
  const grades = (Array.isArray(academicStructure?.grades) ? academicStructure.grades : [])
    .filter((grade) => normalizeText(grade?.status || 'active') !== 'archived' && normalizeText(grade?.key));
  const teacherById = new Map(
    teachers.map((teacher) => [String(teacher._id), {
      id: String(teacher._id),
      name: normalizeText(teacher.name) || normalizeText(teacher.username) || 'Docente',
      levelKeys: new Set(),
      gradeLabels: new Set(),
    }])
  );

  const registerTeacherGrade = (teacherUserId, gradeValue) => {
    const teacher = teacherById.get(String(teacherUserId || ''));
    if (!teacher) {
      return;
    }
    const matchedGrades = grades.filter((grade) => gradeValueMatchesStructureGrade(gradeValue, grade.key));
    if (!matchedGrades.length && normalizeText(gradeValue)) {
      teacher.gradeLabels.add(normalizeText(gradeValue));
      return;
    }
    matchedGrades.forEach((grade) => {
      if (grade.levelKey) {
        teacher.levelKeys.add(normalizeText(grade.levelKey));
      }
      teacher.gradeLabels.add(normalizeText(grade.label || grade.key));
    });
  };

  (Array.isArray(campusCourses) ? campusCourses : []).forEach((course) => {
    registerTeacherGrade(course.teacherUserId, course.studentGradeKey);
    registerTeacherGrade(course.teacherUserId, course.gradeLevel);
  });

  (Array.isArray(academicStructure?.gradeSchedules) ? academicStructure.gradeSchedules : []).forEach((schedule) => {
    const gradeKey = normalizeText(schedule?.gradeKey);
    (Array.isArray(schedule?.subjectLoads) ? schedule.subjectLoads : []).forEach((load) => {
      collectTeacherIdsFromEntry(load).forEach((teacherUserId) => registerTeacherGrade(teacherUserId, gradeKey));
    });
    (Array.isArray(schedule?.weeklySchedule) ? schedule.weeklySchedule : []).forEach((entry) => {
      if (normalizeText(entry?.entryType || 'class') === 'break') {
        return;
      }
      collectTeacherIdsFromEntry(entry).forEach((teacherUserId) => registerTeacherGrade(teacherUserId, gradeKey));
    });
  });

  (Array.isArray(academicStructure?.subjectLoadTemplates) ? academicStructure.subjectLoadTemplates : []).forEach((template) => {
    const teacherUserId = normalizeText(template?.teacherUserId);
    uniqueClassroomGroupValues(template?.gradeKeys).forEach((gradeKey) => registerTeacherGrade(teacherUserId, gradeKey));
  });

  (Array.isArray(academicStructure?.teachingAvailability) ? academicStructure.teachingAvailability : []).forEach((item) => {
    const teacherUserId = normalizeText(item?.teacherUserId);
    uniqueClassroomGroupValues(item?.gradeKeys).forEach((gradeKey) => registerTeacherGrade(teacherUserId, gradeKey));
  });

  const serializedTeachers = Array.from(teacherById.values()).map((teacher) => ({
    id: teacher.id,
    name: teacher.name,
    levelKeys: Array.from(teacher.levelKeys),
    gradeLabels: Array.from(teacher.gradeLabels),
  }));

  const serializedLevels = levels.map((level) => {
    const key = normalizeText(level.key);
    const teacherIds = serializedTeachers
      .filter((teacher) => teacher.levelKeys.includes(key))
      .map((teacher) => teacher.id);
    return {
      key,
      label: normalizeText(level.label) || key,
      teacherUserIds: teacherIds,
      teacherCount: teacherIds.length,
    };
  });

  return {
    levels: serializedLevels,
    teachers: serializedTeachers,
  };
}

function normalizeTargetRoles(targetRoles, fallback = STAFF_ANNOUNCEMENT_TARGET_ROLES) {
  const allowed = new Set(STAFF_ANNOUNCEMENT_TARGET_ROLES);
  const selected = (Array.isArray(targetRoles) ? targetRoles : [])
    .map((role) => normalizeText(role))
    .filter((role) => allowed.has(role));
  if (selected.length) {
    return Array.from(new Set(selected));
  }
  return Array.isArray(fallback) ? [...fallback] : [];
}

function serializeAnnouncement(announcement, extras = {}) {
  if (!announcement) {
    return null;
  }

  return {
    id: String(announcement._id),
    title: normalizeText(announcement.title),
    body: normalizeText(announcement.body),
    senderUserId: announcement.senderUserId ? String(announcement.senderUserId) : '',
    senderName: normalizeText(announcement.senderName),
    senderRole: normalizeText(announcement.senderRole),
    targetRoles: Array.isArray(announcement.targetRoles) ? announcement.targetRoles : [],
    targetTeacherUserIds: Array.isArray(announcement.targetTeacherUserIds)
      ? announcement.targetTeacherUserIds.map((value) => String(value))
      : [],
    targetTeacherLevelKeys: Array.isArray(announcement.targetTeacherLevelKeys) ? announcement.targetTeacherLevelKeys : [],
    teacherAudienceMode: normalizeText(announcement.teacherAudienceMode) || 'all',
    sourceType: normalizeText(announcement.sourceType) || 'manual',
    sourceId: announcement.sourceId ? String(announcement.sourceId) : null,
    status: normalizeText(announcement.status) || 'published',
    publishedAt: announcement.publishedAt || announcement.createdAt || null,
    createdAt: announcement.createdAt || null,
    updatedAt: announcement.updatedAt || null,
    ...extras,
  };
}

async function resolveRecipientsForRoles({
  schoolId,
  targetRoles,
  targetTeacherUserIds = [],
  targetTeacherLevelKeys = [],
  excludeUserId = null,
}) {
  const roles = normalizeTargetRoles(targetRoles, []);
  if (!roles.length) {
    return [];
  }

  const excludeKey = excludeUserId ? String(excludeUserId) : '';
  const requestedTeacherIds = normalizeIdList(targetTeacherUserIds);
  const requestedLevelKeys = normalizeLevelKeys(targetTeacherLevelKeys);
  const teacherRoleSelected = roles.includes('teacher');
  const otherRoles = roles.filter((role) => role !== 'teacher');
  const usersById = new Map();

  const addUsers = (users = []) => {
    users.forEach((user) => {
      const key = String(user._id);
      if (!key || key === excludeKey || usersById.has(key)) {
        return;
      }
      usersById.set(key, user);
    });
  };

  if (otherRoles.length) {
    addUsers(await User.find({
      schoolId,
      role: { $in: otherRoles },
      status: 'active',
      deletedAt: null,
    })
      .select('_id name username role')
      .lean());
  }

  if (teacherRoleSelected) {
    let teacherIds = requestedTeacherIds;
    if (!teacherIds.length && requestedLevelKeys.length) {
      const directory = await buildTeacherAudienceDirectory(schoolId);
      teacherIds = uniqueObjectIds(
        directory.levels
          .filter((level) => requestedLevelKeys.includes(level.key))
          .flatMap((level) => level.teacherUserIds || [])
      );
    }

    const teacherQuery = {
      schoolId,
      role: 'teacher',
      status: 'active',
      deletedAt: null,
    };
    if (teacherIds.length) {
      teacherQuery._id = { $in: teacherIds };
    }

    addUsers(await User.find(teacherQuery).select('_id name username role').lean());
  }

  return Array.from(usersById.values());
}

async function publishStaffAnnouncement({
  schoolId,
  senderUserId,
  senderName = '',
  senderRole = '',
  title,
  body,
  targetRoles = STAFF_ANNOUNCEMENT_TARGET_ROLES,
  targetTeacherUserIds = [],
  targetTeacherLevelKeys = [],
  sourceType = 'manual',
  sourceId = null,
  notifyPush = true,
}) {
  const normalizedTitle = normalizeText(title);
  const normalizedBody = normalizeText(body);
  if (!normalizedTitle || !normalizedBody) {
    throw new Error('Título y mensaje son requeridos.');
  }

  const roles = normalizeTargetRoles(targetRoles, []);
  const requestedTeacherIds = normalizeIdList(targetTeacherUserIds);
  const requestedLevelKeys = normalizeLevelKeys(targetTeacherLevelKeys);
  if (requestedTeacherIds.length || requestedLevelKeys.length) {
    if (!roles.includes('teacher')) {
      roles.push('teacher');
    }
  }
  if (!roles.length) {
    throw new Error('Selecciona al menos un destinatario.');
  }

  const teacherAudienceMode = !roles.includes('teacher')
    ? 'none'
    : ((requestedTeacherIds.length || requestedLevelKeys.length) ? 'subset' : 'all');

  const recipients = await resolveRecipientsForRoles({
    schoolId,
    targetRoles: roles,
    targetTeacherUserIds: requestedTeacherIds,
    targetTeacherLevelKeys: requestedLevelKeys,
    excludeUserId: senderUserId,
  });

  if (teacherAudienceMode === 'subset' && !recipients.some((user) => normalizeText(user.role) === 'teacher')) {
    throw new Error('No se encontraron docentes para el nivel o la selección indicada.');
  }

  const announcement = await StaffAnnouncement.create({
    schoolId,
    title: normalizedTitle,
    body: normalizedBody,
    senderUserId,
    senderName: normalizeText(senderName),
    senderRole: normalizeText(senderRole),
    targetRoles: roles,
    targetTeacherUserIds: requestedTeacherIds,
    targetTeacherLevelKeys: requestedLevelKeys,
    teacherAudienceMode,
    sourceType: sourceType === 'hr_planner_cycle' ? 'hr_planner_cycle' : 'manual',
    sourceId: sourceId || null,
    status: 'published',
    publishedAt: new Date(),
  });

  if (recipients.length) {
    await StaffAnnouncementRecipient.insertMany(
      recipients.map((user) => ({
        schoolId,
        announcementId: announcement._id,
        userId: user._id,
        roleSnapshot: normalizeText(user.role),
        nameSnapshot: normalizeText(user.name) || normalizeText(user.username) || 'Usuario',
        readAt: null,
      })),
      { ordered: false }
    );
  }

  if (notifyPush && recipients.length) {
    try {
      await queueNotificationsForParents({
        schoolId,
        parentIds: uniqueObjectIds(recipients.map((user) => user._id)),
        title: `Comunicado: ${normalizedTitle}`,
        body: normalizedBody.slice(0, 180),
        payload: {
          type: 'staff_announcement',
          announcementId: String(announcement._id),
        },
      });
    } catch (error) {
      console.warn(`[staff-announcements] push failed: ${error.message}`);
    }
  }

  return announcement;
}

async function publishPlannerAsStaffAnnouncement({
  schoolId,
  senderUserId,
  senderName = '',
  senderRole = '',
  cycle,
}) {
  if (!cycle) {
    return null;
  }

  const deadline = cycle.submissionDeadline
    ? new Date(cycle.submissionDeadline).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    : 'sin fecha límite';

  const instructions = normalizeText(cycle.instructions);
  const bodyParts = [
    `Se publicó el planner "${normalizeText(cycle.title)}".`,
    `Fecha límite de envío: ${deadline}.`,
  ];
  if (instructions) {
    bodyParts.push(`Indicaciones: ${instructions}`);
  }
  bodyParts.push('Revisa la sección Solicitud de recursos para completar tu planner.');

  return publishStaffAnnouncement({
    schoolId,
    senderUserId,
    senderName,
    senderRole,
    title: `Planner: ${normalizeText(cycle.title)}`,
    body: bodyParts.join('\n\n'),
    targetRoles: ['teacher'],
    sourceType: 'hr_planner_cycle',
    sourceId: cycle._id,
  });
}

module.exports = {
  STAFF_ANNOUNCEMENT_TARGET_ROLES,
  serializeAnnouncement,
  normalizeTargetRoles,
  normalizeIdList,
  normalizeLevelKeys,
  buildTeacherAudienceDirectory,
  publishStaffAnnouncement,
  publishPlannerAsStaffAnnouncement,
};
