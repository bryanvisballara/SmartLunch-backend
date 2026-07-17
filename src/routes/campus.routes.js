const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const { runWithSchoolContext } = require('../config/db');
const AcademicStructure = require('../models/academicStructure.model');
const AcademicCommunication = require('../models/academicCommunication.model');
const AcademicCommunicationRequest = require('../models/academicCommunicationRequest.model');
const CampusAttendanceSession = require('../models/campusAttendanceSession.model');
const CampusCourse = require('../models/campusCourse.model');
const CampusDisciplineObservation = require('../models/campusDisciplineObservation.model');
const CampusGradeEntry = require('../models/campusGradeEntry.model');
const CampusPost = require('../models/campusPost.model');
const CampusSchoolRoute = require('../models/campusSchoolRoute.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const {
  queueNotificationsForParents,
  queueStudentParentNotification,
  queueStudentParentNotifications,
  queueStudentUserNotification,
  queueStudentUserNotifications,
} = require('../services/notification.service');
const { getCampusAccessContext } = require('../utils/campusAccess');
const {
  MAX_CAMPUS_MATERIAL_FILE_BYTES,
  MAX_CAMPUS_MATERIAL_FILES,
  uploadCampusMaterialsMiddleware,
  processStoredCampusMaterialFiles,
} = require('../utils/campusMaterialUpload');
const { buildCoordinationDashboard } = require('../services/coordinationDashboard.service');
const {
  buildParentPushUrl,
  getCampusPostCategoryLabel,
} = require('../utils/parentPushTargets');
const { buildStudentPushUrl } = require('../utils/studentPushTargets');
const {
  isCloudinaryEnabled,
  normalizeStoredImageUrl,
  processAndStoreUploadedImage,
  uploadImageMiddleware,
} = require('../utils/imageUpload');

function isValidPublicMediaUrl(url) {
  const normalized = String(url || '').trim();
  return /^https?:\/\//i.test(normalized) || normalized.startsWith('/assets/');
}

const router = express.Router();
const uploadTeacherProfilePhoto = uploadImageMiddleware.single('image');
const disciplineObservationRecipients = ['coordination', 'direccion', 'psychology', 'rectoria'];
const disciplineObservationViewerRoles = ['admin', 'rectoria', 'direccion', 'coordination', 'psychology'];
const schoolRouteOperatorRoles = ['admin', 'rectoria', 'direccion', 'academic_secretary', 'school_route'];
const schoolRouteConfiguratorRoles = ['admin', 'rectoria', 'direccion', 'academic_secretary'];

router.use(authMiddleware);

const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function normalizeText(value) {
  return String(value || '').trim();
}

function sameCampusObjectId(left, right) {
  return String(left || '') === String(right || '');
}

function getCampusActorName(user = {}) {
  return normalizeText(user.name || user.fullName || user.username || user.email) || 'Docente';
}

function normalizeCampusFeedLikes(rawLikes = []) {
  const likesByUserId = new Map();
  for (const like of Array.isArray(rawLikes) ? rawLikes : []) {
    const userId = String(like?.userId || '').trim();
    if (!userId || likesByUserId.has(userId)) {
      continue;
    }
    likesByUserId.set(userId, {
      userId,
      name: normalizeText(like?.name) || 'Usuario',
      createdAt: like?.createdAt || null,
    });
  }
  return [...likesByUserId.values()];
}

function buildToggledCampusFeedLikesExpression(likesExpression, userId, nextLike) {
  return {
    $let: {
      vars: {
        currentLikes: { $ifNull: [likesExpression, []] },
      },
      in: {
        $cond: [
          {
            $in: [
              userId,
              { $map: { input: '$$currentLikes', as: 'like', in: '$$like.userId' } },
            ],
          },
          {
            $filter: {
              input: '$$currentLikes',
              as: 'like',
              cond: { $ne: ['$$like.userId', userId] },
            },
          },
          { $concatArrays: ['$$currentLikes', [nextLike]] },
        ],
      },
    },
  };
}

function serializeTeacherFamilyFeedComment(comment = {}, currentUserId = '') {
  const likes = normalizeCampusFeedLikes(comment.likes);
  return {
    id: String(comment._id || comment.id || ''),
    userId: String(comment.userId || ''),
    name: normalizeText(comment.name) || 'Usuario',
    body: normalizeText(comment.body),
    createdAt: comment.createdAt || null,
    likedByMe: likes.some((like) => sameCampusObjectId(like.userId, currentUserId)),
    likesCount: likes.length,
    canDelete: sameCampusObjectId(comment.userId, currentUserId),
  };
}

function serializeTeacherFamilyFeedItem(item = {}, currentUserId = '') {
  const likes = normalizeCampusFeedLikes(item.likes);
  const comments = Array.isArray(item.comments)
    ? item.comments
      .map((comment) => serializeTeacherFamilyFeedComment(comment, currentUserId))
      .filter((comment) => comment.id && comment.body)
    : [];

  return {
    id: String(item._id || ''),
    title: normalizeText(item.title),
    body: normalizeText(item.body),
    authorName: normalizeText(item.authorName || item.createdByName) || 'Secretaría académica',
    authorPhotoUrl: normalizeText(item.authorThumbUrl || item.authorPhotoUrl),
    audienceType: normalizeText(item.audienceType) || 'general',
    gradeTargets: Array.isArray(item.gradeTargets) ? item.gradeTargets : [],
    courseTargets: Array.isArray(item.courseTargets) ? item.courseTargets : [],
    media: (Array.isArray(item.media) ? item.media : []).map((mediaItem, index) => ({
      id: String(mediaItem?._id || `${item._id || 'media'}-${index + 1}`),
      kind: normalizeText(mediaItem?.kind) === 'video' ? 'video' : 'image',
      src: normalizeText(mediaItem?.src),
      thumbUrl: normalizeText(mediaItem?.thumbUrl),
      alt: normalizeText(mediaItem?.alt),
    })).filter((mediaItem) => mediaItem.src),
    likedByMe: likes.some((like) => sameCampusObjectId(like.userId, currentUserId)),
    likesCount: likes.length,
    commentsCount: comments.length,
    comments,
    sentAt: item.sentAt || item.createdAt || null,
  };
}

async function resolveTeacherOwnPublishedCommunicationIds(schoolId, teacherUserId) {
  const ownApprovedRequests = await AcademicCommunicationRequest.find({
    schoolId,
    teacherUserId,
    status: 'approved',
    publishedCommunicationId: { $ne: null },
  })
    .select('publishedCommunicationId')
    .lean();

  return ownApprovedRequests
    .map((request) => request.publishedCommunicationId)
    .filter(Boolean);
}

async function buildTeacherFamilyFeedAccessQuery(schoolId, teacherUserId) {
  const ownPublishedCommunicationIds = await resolveTeacherOwnPublishedCommunicationIds(schoolId, teacherUserId);
  return {
    schoolId,
    sentAt: { $ne: null },
    $or: [
      { audienceType: 'general' },
      { _id: { $in: ownPublishedCommunicationIds } },
    ],
  };
}

async function findTeacherAccessibleFamilyFeedCommunication({ schoolId, teacherUserId, communicationId }) {
  if (!isValidObjectId(communicationId)) {
    return null;
  }

  const accessQuery = await buildTeacherFamilyFeedAccessQuery(schoolId, teacherUserId);
  return AcademicCommunication.findOne({
    ...accessQuery,
    _id: communicationId,
  });
}

function normalizeCampusScopeMatch(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeCampusGradeKey(value) {
  const normalized = normalizeText(value);
  const numericMatch = normalized.match(/(\d{1,2})/);
  if (numericMatch) {
    return numericMatch[1];
  }

  return normalized;
}

async function resolveCampusCoordinationGradeKeys(schoolId, coordinationScope = '') {
  const normalizedScope = normalizeCampusScopeMatch(coordinationScope);
  if (!normalizedScope) {
    return new Set();
  }

  const academicStructure = await AcademicStructure.findOne({ schoolId }).select('levels grades').lean();
  const levels = Array.isArray(academicStructure?.levels) ? academicStructure.levels : [];
  const exactMatches = levels.filter((level) => {
    const levelKey = normalizeCampusScopeMatch(level?.key);
    const levelLabel = normalizeCampusScopeMatch(level?.label);
    return normalizedScope === levelKey || normalizedScope === levelLabel;
  });
  const matchedLevels = exactMatches.length > 0
    ? exactMatches
    : levels.filter((level) => {
      const levelKey = normalizeCampusScopeMatch(level?.key);
      const levelLabel = normalizeCampusScopeMatch(level?.label);
      return levelKey.includes(normalizedScope)
        || levelLabel.includes(normalizedScope)
        || normalizedScope.includes(levelKey)
        || normalizedScope.includes(levelLabel);
    });
  const levelKeys = new Set(matchedLevels.map((level) => normalizeText(level?.key)).filter(Boolean));

  if (levelKeys.size === 0) {
    return new Set();
  }

  return new Set((Array.isArray(academicStructure?.grades) ? academicStructure.grades : [])
    .filter((grade) => levelKeys.has(normalizeText(grade?.levelKey)))
    .map((grade) => normalizeCampusGradeKey(grade?.key || grade?.label))
    .filter(Boolean));
}

function normalizeGradeKey(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, '');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addNormalizedAlias(target, value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return;
  }

  target.add(normalized);
  target.add(normalized.replace(/\s+/g, ''));
}

function buildExactFlexibleRegExp(value) {
  const compact = normalizeText(value).replace(/\s+/g, '');
  if (!compact) {
    return null;
  }

  return new RegExp(`^\\s*${compact.split('').map((char) => escapeRegExp(char)).join('\\s*')}\\s*$`, 'i');
}

function buildFieldMatchConditions(field, values) {
  const aliases = Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value))
    .filter(Boolean)));

  return aliases.flatMap((alias) => {
    const matcher = buildExactFlexibleRegExp(alias);
    return matcher ? [{ [field]: alias }, { [field]: matcher }] : [{ [field]: alias }];
  });
}

function getCourseGradeAliases(course) {
  const aliases = new Set();
  addNormalizedAlias(aliases, course?.studentGradeKey);
  addNormalizedAlias(aliases, course?.gradeLevel);

  const gradeKeyParts = normalizeText(course?.studentGradeKey).split(':').map((part) => part.trim()).filter(Boolean);
  if (gradeKeyParts.length > 1) {
    addNormalizedAlias(aliases, gradeKeyParts[gradeKeyParts.length - 1]);
  }

  const numericGrade = normalizeText(course?.studentGradeKey || course?.gradeLevel).match(/(\d{1,2})/);
  if (numericGrade) {
    addNormalizedAlias(aliases, numericGrade[1]);
  }

  return Array.from(aliases);
}

function getCourseSectionAliases(course, gradeAliases = getCourseGradeAliases(course)) {
  const aliases = new Set();
  const section = normalizeText(course?.section);
  if (!section) {
    const sourceCourseKey = normalizeText(course?.sourceCourseKey);
    if (sourceCourseKey) {
      addNormalizedAlias(aliases, sourceCourseKey);
    }

    return Array.from(aliases);
  }

  const sourceCourseKey = normalizeText(course?.sourceCourseKey);
  if (sourceCourseKey) {
    addNormalizedAlias(aliases, sourceCourseKey);
  }

  addNormalizedAlias(aliases, section);
  const compactSection = section.replace(/\s+/g, '');
  const sectionMatch = compactSection.match(/^(\d{1,2})?([a-z])$/i);
  const sectionSuffix = sectionMatch?.[2] ? sectionMatch[2].toUpperCase() : '';
  const sectionOrdinal = sectionSuffix ? String(sectionSuffix.charCodeAt(0) - 64) : '';

  if (sectionSuffix) {
    addNormalizedAlias(aliases, sectionSuffix);
  }

  if (sectionOrdinal) {
    addNormalizedAlias(aliases, sectionOrdinal);
  }

  gradeAliases.forEach((gradeAlias) => {
    const compactGrade = normalizeText(gradeAlias).replace(/\s+/g, '');
    if (!compactGrade) {
      return;
    }

    addNormalizedAlias(aliases, `${compactGrade}${sectionSuffix || compactSection}`);
    addNormalizedAlias(aliases, `${gradeAlias}:${compactSection.toLowerCase()}`);
    if (sectionSuffix) {
      addNormalizedAlias(aliases, `${gradeAlias}:${sectionSuffix.toLowerCase()}`);
    }
    if (sectionOrdinal) {
      addNormalizedAlias(aliases, `${gradeAlias}:${sectionOrdinal}`);
    }
  });

  return Array.from(aliases);
}

function buildTeacherCourseRosterQuery({ schoolId, course }) {
  const gradeConditions = buildFieldMatchConditions('grade', getCourseGradeAliases(course));
  const sectionConditions = buildFieldMatchConditions('course', getCourseSectionAliases(course));
  const query = {
    schoolId,
    deletedAt: null,
    status: 'active',
  };
  const andConditions = [];

  if (gradeConditions.length > 0) {
    andConditions.push({ $or: gradeConditions });
  }

  if (sectionConditions.length > 0) {
    andConditions.push({ $or: sectionConditions });
  }

  return andConditions.length > 0 ? { ...query, $and: andConditions } : query;
}

function normalizeCourseMembershipValue(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
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

function normalizeTeacherCourseIdentity(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ':')
    .replace(/^:+|:+$/g, '');
}

function buildTeacherCourseSectionIdentity(course) {
  const rawGradeKey = normalizeText(course?.studentGradeKey || course?.gradeLevel);
  const gradeNumber = normalizeCampusGradeKey(rawGradeKey || course?.section || course?.title);
  const levelKey = rawGradeKey.toLowerCase().includes('secundaria') || Number(gradeNumber) >= 6 ? 'secundaria' : 'primaria';
  const sourceKey = normalizeTeacherCourseIdentity(course?.sourceCourseKey);

  if (sourceKey) {
    const sourceMatch = sourceKey.match(/(primaria|secundaria):(\d{1,2}):(\d{1,2}[a-z]?)/);
    return sourceMatch ? `${sourceMatch[1]}:${sourceMatch[2]}:${sourceMatch[3]}` : sourceKey;
  }

  const sectionKey = normalizeTeacherCourseIdentity(course?.section);
  const studentGradeKey = normalizeTeacherCourseIdentity(course?.studentGradeKey);
  const gradeLevelKey = normalizeTeacherCourseIdentity(course?.gradeLevel);

  if (!sectionKey || sectionKey === studentGradeKey || sectionKey === gradeLevelKey) {
    return '';
  }

  const sectionMatch = sectionKey.match(/(?:primaria|secundaria)?:?(\d{1,2}):?(\d{1,2}[a-z]?)/)
    || sectionKey.match(/^(\d{1,2})([a-z])?$/);

  if (sectionMatch) {
    const sectionSuffix = normalizeText(sectionMatch[2]);
    const sectionNumber = sectionSuffix
      ? (/^[a-z]$/.test(sectionSuffix) ? `${sectionMatch[1]}${sectionSuffix === 'a' ? '' : sectionSuffix}` : sectionSuffix)
      : sectionMatch[1];
    return `${levelKey}:${gradeNumber || sectionMatch[1]}:${sectionNumber}`;
  }

  return sectionKey;
}

function buildTeacherCourseDeduplicationKey(course) {
  const courseType = normalizeText(course?.courseType) || 'subject';
  const gradeKey = normalizeTeacherCourseIdentity(course?.studentGradeKey || course?.gradeLevel || course?.title || 'curso');

  if (courseType !== 'subject') {
    return `${courseType}:${gradeKey}:${buildTeacherCourseSectionIdentity(course) || normalizeTeacherCourseIdentity(course?.section || course?.title)}`;
  }

  const subjectKey = normalizeTeacherCourseIdentity(course?.subject || 'asignatura');
  return `${courseType}:${subjectKey}:${gradeKey}:${buildTeacherCourseSectionIdentity(course) || 'general'}`;
}

function selectTeacherOverviewCourses(courses, postsByCourseId = new Map(), gradeEntryCountByCourseId = new Map()) {
  const normalizedCourses = Array.isArray(courses) ? courses : [];
  const sectionedSubjectGradeKeys = new Set();
  const sourcedSubjectGradeKeys = new Set();

  normalizedCourses.forEach((course) => {
    if ((normalizeText(course?.courseType) || 'subject') !== 'subject') {
      return;
    }

    const subjectGradeKey = [
      normalizeTeacherCourseIdentity(course?.subject || 'asignatura'),
      normalizeTeacherCourseIdentity(course?.studentGradeKey || course?.gradeLevel || course?.title || 'curso'),
    ].join(':');

    if (normalizeText(course?.sourceCourseKey)) {
      sourcedSubjectGradeKeys.add(subjectGradeKey);
    }

    const sectionKey = buildTeacherCourseSectionIdentity(course);
    if (!sectionKey) {
      return;
    }

    sectionedSubjectGradeKeys.add([
      normalizeTeacherCourseIdentity(course?.subject || 'asignatura'),
      normalizeTeacherCourseIdentity(course?.studentGradeKey || course?.gradeLevel || course?.title || 'curso'),
    ].join(':'));
  });

  const buckets = new Map();
  normalizedCourses.forEach((course) => {
    const courseType = normalizeText(course?.courseType) || 'subject';
    const subjectGradeKey = [
      normalizeTeacherCourseIdentity(course?.subject || 'asignatura'),
      normalizeTeacherCourseIdentity(course?.studentGradeKey || course?.gradeLevel || course?.title || 'curso'),
    ].join(':');
    const courseId = String(course?._id || '');
    const gradeEntryCount = Number(gradeEntryCountByCourseId.get(courseId) || 0);

    if (courseType === 'subject' && !buildTeacherCourseSectionIdentity(course) && sectionedSubjectGradeKeys.has(subjectGradeKey)) {
      return;
    }

    if (courseType === 'subject' && !normalizeText(course?.sourceCourseKey) && gradeEntryCount === 0 && sourcedSubjectGradeKeys.has(subjectGradeKey)) {
      return;
    }

    const bucketKey = buildTeacherCourseDeduplicationKey(course);
    const current = buckets.get(bucketKey);
    const postCount = Number((postsByCourseId.get(courseId) || []).length);
    const score = (gradeEntryCount * 1000)
      + (postCount * 100)
      + (normalizeText(course?.sourceCourseKey) ? 10 : 0)
      + (buildTeacherCourseSectionIdentity(course) ? 5 : 0)
      + (new Date(course?.updatedAt || course?.createdAt || 0).getTime() / 10000000000000);

    if (!current || score > current.score) {
      buckets.set(bucketKey, { course, score });
    }
  });

  return Array.from(buckets.values()).map((bucket) => bucket.course);
}

async function migrateSectionlessGradesToSectionCourses({
  schoolId,
  teacherUserId,
  sectionlessCourse,
  sectionedCourses = [],
}) {
  if (!sectionlessCourse?._id || !Array.isArray(sectionedCourses) || sectionedCourses.length === 0) {
    return { migrated: 0, remaining: 0 };
  }

  const entries = await CampusGradeEntry.find({
    schoolId,
    courseId: sectionlessCourse._id,
  }).lean();

  if (!entries.length) {
    return { migrated: 0, remaining: 0 };
  }

  const studentIds = Array.from(new Set(entries.map((entry) => String(entry.studentId || '')).filter(Boolean)));
  const students = studentIds.length > 0
    ? await Student.find({ schoolId, _id: { $in: studentIds } }).select('_id grade course').lean()
    : [];
  const studentById = new Map(students.map((student) => [String(student._id), student]));

  let migrated = 0;
  for (const entry of entries) {
    const student = studentById.get(String(entry.studentId || ''));
    if (!student) {
      continue;
    }

    const targetCourse = sectionedCourses.find((course) => studentBelongsToCourse(student, course));
    if (!targetCourse?._id) {
      continue;
    }

    const duplicate = await CampusGradeEntry.findOne({
      schoolId,
      courseId: targetCourse._id,
      studentId: entry.studentId,
      academicPeriodKey: entry.academicPeriodKey,
      componentKey: entry.componentKey,
    }).select('_id').lean();

    if (duplicate) {
      await CampusGradeEntry.deleteOne({ _id: entry._id, schoolId });
      migrated += 1;
      continue;
    }

    await CampusGradeEntry.updateOne(
      { _id: entry._id, schoolId },
      { $set: { courseId: targetCourse._id, teacherUserId: teacherUserId || entry.teacherUserId } },
    );
    migrated += 1;
  }

  const remaining = await CampusGradeEntry.countDocuments({
    schoolId,
    courseId: sectionlessCourse._id,
  });

  return { migrated, remaining };
}

function normalizePostType(value) {
  return normalizeText(value).replace(/\s+/g, ' ').slice(0, 60);
}

function normalizeDateString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    return '';
  }

  const dateOnlyMatch = rawValue.match(/^\d{4}-\d{2}-\d{2}$/);
  if (dateOnlyMatch) {
    return rawValue;
  }

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toISOString().slice(0, 10);
}

function parseMaybeJson(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeTeacherParentFeedMedia(mediaItems) {
  if (!Array.isArray(mediaItems)) {
    return [];
  }

  return mediaItems
    .map((item) => {
      const kind = normalizeText(item?.kind).toLowerCase() === 'video' ? 'video' : 'image';
      const src = normalizeStoredImageUrl(item?.src || item?.url || '');
      const thumbUrl = kind === 'image'
        ? normalizeStoredImageUrl(item?.thumbUrl || item?.src || item?.url || '')
        : normalizeStoredImageUrl(item?.thumbUrl || '');

      if (!src) {
        return null;
      }

      return {
        kind,
        src,
        thumbUrl,
        alt: normalizeText(item?.alt || item?.title || ''),
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function canManageSchoolRoute(req) {
  return schoolRouteOperatorRoles.includes(String(req.user?.role || ''));
}

function canConfigureSchoolRoute(req) {
  return schoolRouteConfiguratorRoles.includes(String(req.user?.role || ''));
}

function serializeSchoolRouteStop(stop) {
  const student = stop.studentId && typeof stop.studentId === 'object' ? stop.studentId : null;
  const stopId = stop._id ? String(stop._id) : '';
  const studentId = student?._id || stop.studentId || null;

  return {
    id: stopId,
    studentId: studentId ? String(studentId) : '',
    studentName: normalizeText(student?.name || stop.studentNameSnapshot),
    studentGrade: normalizeText(student?.grade || stop.studentGrade),
    studentCourse: normalizeText(student?.course || stop.studentCourse),
    pickupAddress: normalizeText(stop.pickupAddress),
    notes: normalizeText(stop.notes),
    order: Number(stop.order || 0),
    status: normalizeText(stop.status) || 'pending',
    statusUpdatedAt: stop.statusUpdatedAt || null,
  };
}

function serializeSchoolRoute(route) {
  const stops = [...(route?.stops || [])]
    .map(serializeSchoolRouteStop)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));

  return {
    id: route?._id ? String(route._id) : '',
    routeName: normalizeText(route?.routeName) || 'Ruta escolar',
    status: normalizeText(route?.status) || 'draft',
    startedAt: route?.startedAt || null,
    completedAt: route?.completedAt || null,
    stops,
  };
}

function serializeSchoolRouteStudent(student) {
  return {
    id: String(student._id),
    name: normalizeText(student.name),
    grade: normalizeText(student.grade),
    course: normalizeText(student.course),
    address: normalizeText(student.address),
    schoolCode: normalizeText(student.schoolCode),
  };
}

function serializeSchoolRouteDriver(user) {
  return {
    id: String(user._id),
    name: normalizeText(user.name) || normalizeText(user.username) || 'Conductor de ruta',
    username: normalizeText(user.username),
    email: normalizeText(user.email),
    phone: normalizeText(user.phone),
  };
}

async function resolveSchoolRouteDriverUserId(req) {
  const requestedDriverUserId = normalizeText(req.body?.driverUserId || req.query?.driverUserId);
  if (!requestedDriverUserId) {
    return req.user.userId;
  }

  if (!canConfigureSchoolRoute(req)) {
    return req.user.userId;
  }

  if (!isValidObjectId(requestedDriverUserId)) {
    const error = new Error('Selecciona un conductor valido.');
    error.statusCode = 400;
    throw error;
  }

  const driver = await User.findOne({
    _id: requestedDriverUserId,
    schoolId: req.user.schoolId,
    role: 'school_route',
    deletedAt: null,
  }).select('_id').lean();

  if (!driver) {
    const error = new Error('Conductor de ruta no encontrado.');
    error.statusCode = 404;
    throw error;
  }

  return String(driver._id);
}

async function getOrCreateSchoolRoute({ schoolId, driverUserId }) {
  let route = await CampusSchoolRoute.findOne({ schoolId, driverUserId });

  if (!route) {
    route = await CampusSchoolRoute.create({
      schoolId,
      driverUserId,
      routeName: 'Ruta escolar',
      stops: [],
    });
  }

  return route;
}

async function notifySchoolRouteParents({ schoolId, stop, route, eventType }) {
  const studentId = stop?.studentId?._id || stop?.studentId;
  if (!studentId) {
    return { notificationsCreated: 0, tokensFound: 0 };
  }

  const parentLinks = await ParentStudentLink.find({
    schoolId,
    studentId,
    status: 'active',
  }).select('parentId').lean();

  const parentIds = parentLinks.map((link) => link.parentId).filter(Boolean);
  if (!parentIds.length) {
    return { notificationsCreated: 0, tokensFound: 0 };
  }

  const studentName = normalizeText(stop?.studentNameSnapshot || stop?.studentId?.name) || 'tu hijo';
  const routeName = normalizeText(route?.routeName) || 'Ruta escolar';
  const messages = {
    on_way: {
      title: 'La ruta va en camino',
      body: `${routeName} ya va en camino para recoger a ${studentName}.`,
    },
    arrived: {
      title: 'La ruta esta en la puerta',
      body: `${routeName} ya llego a la direccion de recogida de ${studentName}.`,
    },
    picked_up: {
      title: 'Recogida confirmada',
      body: `${studentName} ya fue recogido por ${routeName}.`,
    },
    skipped: {
      title: 'Parada omitida',
      body: `${routeName} marco como omitida la parada de ${studentName}.`,
    },
  };
  const message = messages[eventType] || messages.on_way;

  return queueNotificationsForParents({
    schoolId,
    parentIds,
    studentId,
    title: message.title,
    body: message.body,
    payload: {
      type: `school_route.${eventType}`,
      routeId: route?._id ? String(route._id) : '',
      stopId: stop?._id ? String(stop._id) : '',
      studentId: String(studentId),
      url: buildParentPushUrl(`school_route.${eventType}`, { studentId }),
    },
  });
}

function normalizeWeekday(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) {
    return null;
  }
  return parsed;
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

function formatMinutesAsTime(totalMinutes) {
  const hours = Math.floor(Number(totalMinutes || 0) / 60);
  const minutes = Number(totalMinutes || 0) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function buildScheduleTimelineSlots(_entries = [], { startTime = '06:00', endTime = '16:00', slotDurationMinutes = 60 } = {}) {
  const startMinutes = parseTimeToMinutes(startTime) ?? 360;
  const endMinutes = parseTimeToMinutes(endTime) ?? 960;
  const slotMinutes = Math.max(15, Number(slotDurationMinutes || 60));
  const slots = [];

  for (let slotStartMinutes = startMinutes; slotStartMinutes < endMinutes; slotStartMinutes += slotMinutes) {
    const slotEndMinutes = Math.min(slotStartMinutes + slotMinutes, endMinutes);
    if (slotEndMinutes <= slotStartMinutes) {
      continue;
    }

    const normalizedStartTime = formatMinutesAsTime(slotStartMinutes);
    const normalizedEndTime = formatMinutesAsTime(slotEndMinutes);
    slots.push({
      key: `${normalizedStartTime}-${normalizedEndTime}`,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      label: `${normalizedStartTime} - ${normalizedEndTime}`,
      cells: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    });
  }

  return slots;
}

function findScheduleSlotForEntry(slots, entry) {
  const entryStartMinutes = parseTimeToMinutes(entry?.startTime);
  if (entryStartMinutes === null) {
    return null;
  }

  return (Array.isArray(slots) ? slots : []).find((slot) => {
    const slotStartMinutes = parseTimeToMinutes(slot.startTime);
    const slotEndMinutes = parseTimeToMinutes(slot.endTime);
    return slotStartMinutes !== null
      && slotEndMinutes !== null
      && entryStartMinutes >= slotStartMinutes
      && entryStartMinutes < slotEndMinutes;
  }) || null;
}

function buildTeacherWeeklySchedule(courses) {
  const weekdays = [
    { key: 1, label: 'Lunes', shortLabel: 'Lun' },
    { key: 2, label: 'Martes', shortLabel: 'Mar' },
    { key: 3, label: 'Miércoles', shortLabel: 'Mie' },
    { key: 4, label: 'Jueves', shortLabel: 'Jue' },
    { key: 5, label: 'Viernes', shortLabel: 'Vie' },
  ];
  const entries = [];

  for (const course of Array.isArray(courses) ? courses : []) {
    const normalizedCourse = serializeCourse(course);

    for (const session of normalizedCourse.classSessions || []) {
      const weekday = Number(session.weekday);
      if (weekday < 1 || weekday > 5) {
        continue;
      }

      entries.push({
        key: `${normalizedCourse.id}:${weekday}:${normalizeText(session.startTime)}:${normalizeText(session.endTime)}`,
        courseId: normalizedCourse.id,
        courseTitle: normalizedCourse.title,
        subject: normalizedCourse.subject,
        studentGradeKey: normalizedCourse.studentGradeKey,
        colorToken: normalizedCourse.colorToken,
        weekday,
        startTime: normalizeText(session.startTime),
        endTime: normalizeText(session.endTime),
        label: normalizeText(session.label) || 'Bloque de clase',
      });
    }
  }

  const timelineSlots = buildScheduleTimelineSlots(entries);

  for (const entry of entries) {
    const matchingSlot = findScheduleSlotForEntry(timelineSlots, entry);
    if (matchingSlot) {
      matchingSlot.cells[entry.weekday].push(entry);
    }
  }

  const slots = timelineSlots
    .map((slot) => ({
      key: slot.key,
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: `${slot.startTime} - ${slot.endTime}`,
      days: weekdays.map((day) => ({
        weekday: day.key,
        items: (slot.cells[day.key] || []).sort((left, right) => left.courseTitle.localeCompare(right.courseTitle)),
      })),
    }));

  return {
    weekdays,
    slots,
    totalBlocks: entries.length,
    timeRange: {
      startTime: '06:00',
      endTime: '16:00',
      slotDurationMinutes: 60,
    },
  };
}

function serializeTeacherProfile(user, fallbackUser = {}) {
  const photoUrl = normalizeStoredImageUrl(user?.campusPhotoUrl);
  const photoThumbUrl = normalizeStoredImageUrl(user?.campusPhotoThumbUrl);

  return {
    userId: String(user?._id || fallbackUser.userId || ''),
    name: normalizeText(user?.name || fallbackUser.name) || normalizeText(fallbackUser.username) || 'Docente',
    username: normalizeText(user?.username || fallbackUser.username),
    photoUrl,
    photoThumbUrl: photoThumbUrl || photoUrl,
  };
}

function sessionsOverlap(left, right) {
  if (Number(left?.weekday) !== Number(right?.weekday)) {
    return false;
  }

  const leftStart = parseTimeToMinutes(left?.startTime);
  const leftEnd = parseTimeToMinutes(left?.endTime);
  const rightStart = parseTimeToMinutes(right?.startTime);
  const rightEnd = parseTimeToMinutes(right?.endTime);

  if ([leftStart, leftEnd, rightStart, rightEnd].some((value) => value === null)) {
    return false;
  }

  return leftStart < rightEnd && rightStart < leftEnd;
}

async function findTeacherScheduleConflicts({ schoolId, teacherUserId, classSessions, excludeCourseId = null }) {
  if (!schoolId || !teacherUserId || !Array.isArray(classSessions) || classSessions.length === 0) {
    return [];
  }

  const query = {
    schoolId,
    teacherUserId,
    status: 'active',
  };

  if (excludeCourseId && isValidObjectId(excludeCourseId)) {
    query._id = { $ne: excludeCourseId };
  }

  const existingCourses = await CampusCourse.find(query)
    .select('title subject studentGradeKey classSessions')
    .lean();

  const conflicts = [];

  for (const course of existingCourses) {
    for (const existingSession of course.classSessions || []) {
      for (const nextSession of classSessions) {
        if (!sessionsOverlap(existingSession, nextSession)) {
          continue;
        }

        conflicts.push({
          courseId: String(course._id),
          title: normalizeText(course.title),
          subject: normalizeText(course.subject),
          studentGradeKey: normalizeText(course.studentGradeKey),
          weekday: Number(existingSession.weekday),
          startTime: normalizeText(existingSession.startTime),
          endTime: normalizeText(existingSession.endTime),
        });
      }
    }
  }

  return conflicts;
}

function normalizeClassSessions(rawSessions) {
  const input = parseMaybeJson(rawSessions, rawSessions);
  const sessions = Array.isArray(input) ? input : [];
  const normalizedSessions = [];
  const usedKeys = new Set();

  for (const session of sessions) {
    const weekday = normalizeWeekday(session?.weekday);
    const startTime = normalizeTimeValue(session?.startTime);
    const endTime = normalizeTimeValue(session?.endTime);
    const label = normalizeText(session?.label).slice(0, 80);
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);

    if (weekday === null || !startTime || !endTime) {
      return { ok: false, message: 'Cada clase debe tener dia, hora inicial y hora final validos.' };
    }

    if (weekday < 1 || weekday > 5) {
      return { ok: false, message: 'Las jornadas de clase solo se pueden asignar entre lunes y viernes.' };
    }

    if (endTime <= startTime) {
      return { ok: false, message: 'La hora final debe ser mayor que la inicial.' };
    }

    if (startMinutes === null || endMinutes === null) {
      return { ok: false, message: 'Cada clase debe tener un horario valido.' };
    }

    if (startMinutes < ((7 * 60) + 30) || endMinutes > (16 * 60)) {
      return { ok: false, message: 'Las clases deben estar dentro de la jornada de 7:30 AM a 4:00 PM.' };
    }

    if ((endMinutes - startMinutes) !== 60) {
      return { ok: false, message: 'Cada bloque de clase debe durar exactamente una hora.' };
    }

    const uniqueKey = `${weekday}:${startTime}:${endTime}`;
    if (usedKeys.has(uniqueKey)) {
      return { ok: false, message: 'No repitas el mismo bloque de clase.' };
    }

    usedKeys.add(uniqueKey);
    normalizedSessions.push({ weekday, startTime, endTime, label });
  }

  return {
    ok: true,
    sessions: normalizedSessions.sort((left, right) => (
      left.weekday === right.weekday
        ? left.startTime.localeCompare(right.startTime)
        : left.weekday - right.weekday
    )),
  };
}

function normalizeMaterialLinks(rawLinks) {
  const input = parseMaybeJson(rawLinks, rawLinks);
  const links = Array.isArray(input) ? input : [];
  const normalizedLinks = [];

  for (const link of links) {
    const url = normalizeText(link?.url);
    const title = normalizeText(link?.title) || url;

    if (!url) {
      continue;
    }

    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, message: 'Cada link de estudio debe empezar por http:// o https://.' };
    }

    normalizedLinks.push({
      sourceType: 'link',
      kind: 'link',
      title: title.slice(0, 120),
      url,
      fileName: '',
      mimeType: 'text/uri-list',
      sizeBytes: 0,
      extension: '',
      storage: 'external',
    });
  }

  return { ok: true, links: normalizedLinks.slice(0, 12) };
}

function normalizeScheduledClassSession(rawSession) {
  const session = parseMaybeJson(rawSession, rawSession) || {};
  const weekday = normalizeWeekday(session?.weekday);
  const startTime = normalizeTimeValue(session?.startTime);
  const endTime = normalizeTimeValue(session?.endTime);
  const label = normalizeText(session?.label).slice(0, 80);

  if (weekday === null || !startTime || !endTime) {
    return null;
  }

  return { weekday, startTime, endTime, label };
}

function buildDefaultGradingComponents() {
  return [
    { key: 'tasks', name: 'Tareas', weight: 20, order: 10, subcomponents: [] },
    { key: 'notebook', name: 'Cuaderno', weight: 10, order: 20, subcomponents: [] },
    { key: 'quizzes', name: 'Quices', weight: 25, order: 30, subcomponents: [] },
    { key: 'final_exam', name: 'Examen final', weight: 45, order: 40, subcomponents: [] },
  ];
}

function buildDefaultAcademicPeriods() {
  return [
    {
      key: 'period_1',
      name: 'Periodo 1',
      weight: 100,
      order: 10,
      gradingComponents: buildDefaultGradingComponents(),
    },
  ];
}

function isEvaluativePostType(value) {
  const normalizedType = normalizePostType(value).toLowerCase();
  return Boolean(normalizedType) && !['aviso', 'announcement', 'material'].includes(normalizedType);
}

function buildMonthKey(dateValue) {
  const date = new Date(dateValue);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseYearMonth(value, fallbackDate = new Date()) {
  const rawValue = normalizeText(value);
  const match = rawValue.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (year >= 2000 && monthIndex >= 0 && monthIndex <= 11) {
      return new Date(year, monthIndex, 1);
    }
  }

  return new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1);
}

function getMonthRange(value, fallbackDate = new Date()) {
  const monthStart = parseYearMonth(value, fallbackDate);
  return {
    monthStart,
    monthEnd: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1),
    monthKey: buildMonthKey(monthStart),
  };
}

function getTeacherCalendarPostDate(post = {}) {
  const value = post.deliveryMode === 'class' ? post.scheduledClassDate : post.dueAt;
  return value || post.dueAt || post.scheduledClassDate || post.publishedAt || post.createdAt || null;
}

function getTeacherCalendarAccent(type = '') {
  const normalizedType = normalizeText(type).toLowerCase();
  if (/quiz|examen|evaluaci/.test(normalizedType)) return 'warn';
  if (/tarea|proyecto|entrega|laboratorio/.test(normalizedType)) return 'sky';
  if (/material|aviso/.test(normalizedType)) return 'neutral';
  return 'good';
}

function serializeTeacherCalendarPost(post = {}) {
  const postDate = getTeacherCalendarPostDate(post);
  const course = post.courseId && typeof post.courseId === 'object' ? post.courseId : {};
  const courseTitle = normalizeText(course.title);
  const subject = normalizeText(course.subject) || courseTitle;
  const type = normalizePostType(post.type) || 'Aviso';

  return {
    id: String(post._id || post.id || ''),
    date: postDate,
    dateKey: postDate ? `${buildMonthKey(postDate)}-${String(new Date(postDate).getDate()).padStart(2, '0')}` : '',
    type,
    accent: getTeacherCalendarAccent(type),
    title: normalizeText(post.title) || type,
    detail: normalizeText(post.body) || 'Actividad publicada para el curso.',
    body: normalizeText(post.body),
    courseId: String(course._id || post.courseId || ''),
    courseTitle,
    subject,
    deliveryMode: normalizeText(post.deliveryMode) || 'date',
    dueAt: post.dueAt || null,
    scheduledClassDate: post.scheduledClassDate || null,
    scheduledClassSession: post.scheduledClassSession || null,
    publishedAt: post.publishedAt || null,
    status: normalizeText(post.status) || 'published',
    attachments: Array.isArray(post.attachments)
      ? post.attachments.map((attachment) => ({
        sourceType: normalizeText(attachment.sourceType) || 'file',
        kind: normalizeText(attachment.kind) || 'file',
        title: normalizeText(attachment.title),
        url: normalizeText(attachment.url),
        fileName: normalizeText(attachment.fileName),
        mimeType: normalizeText(attachment.mimeType),
        sizeBytes: Number(attachment.sizeBytes || 0),
        extension: normalizeText(attachment.extension),
        storage: normalizeText(attachment.storage),
      }))
      : [],
  };
}

function parseOptionalDate(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? 'invalid' : parsedDate;
}

function slugifyComponentKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function buildStoredGradeComponentKey(componentKey, subcomponentKey = '') {
  const normalizedComponentKey = normalizeText(componentKey);
  const normalizedSubcomponentKey = normalizeText(subcomponentKey);
  return normalizedSubcomponentKey ? `${normalizedComponentKey}::${normalizedSubcomponentKey}` : normalizedComponentKey;
}

function calculateWeightedAverage(items, getWeight) {
  let total = 0;
  let totalWeight = 0;
  let hasAnyValue = false;

  items.forEach((item) => {
    const currentValue = item?.score;
    if (currentValue === null || currentValue === undefined || currentValue === '') {
      return;
    }

    hasAnyValue = true;
    const weight = Number(getWeight(item) || 0);
    totalWeight += weight;
    total += Number(currentValue) * weight;
  });

  return hasAnyValue && totalWeight > 0 ? Number((total / totalWeight).toFixed(2)) : null;
}

function parseFiniteScore(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasFiniteScore(value) {
  return parseFiniteScore(value) !== null;
}

function buildCourseStudentRows(students, academicPeriods, gradeEntries = []) {
  const entriesByStudentAndComponent = new Map();
  const entriesByStudentId = new Map();
  for (const entry of gradeEntries) {
    const studentId = String(entry.studentId || '');
    if (!studentId) {
      continue;
    }

    entriesByStudentAndComponent.set(
      `${studentId}:${normalizeText(entry.academicPeriodKey) || 'period_1'}:${normalizeText(entry.componentKey)}`,
      entry
    );

    const studentEntries = entriesByStudentId.get(studentId) || [];
    studentEntries.push(entry);
    entriesByStudentId.set(studentId, studentEntries);
  }

  return (Array.isArray(students) ? students : []).map((student) => {
    const periodScoreItems = [];
    const studentId = String(student._id || student.studentId || '');

    const periods = (Array.isArray(academicPeriods) ? academicPeriods : []).map((period) => {
      const componentScoreItems = [];

      const scores = (period.gradingComponents || []).map((component) => {
        const subcomponents = (component.subcomponents || []).map((subcomponent) => {
          const entry = entriesByStudentAndComponent.get(
            `${studentId}:${period.key}:${buildStoredGradeComponentKey(component.key, subcomponent.key)}`
          );

          return {
            subcomponentKey: subcomponent.key,
            subcomponentName: subcomponent.name,
            weight: Number(subcomponent.weight || 0),
            date: normalizeText(subcomponent.date),
            topic: normalizeText(subcomponent.topic),
            description: normalizeText(subcomponent.description),
            score: entry ? Number(entry.score) : null,
            feedback: normalizeText(entry?.feedback),
            gradedAt: entry?.gradedAt || null,
            updatedAt: entry?.updatedAt || null,
          };
        });

        const legacyComponentEntry = entriesByStudentAndComponent.get(`${studentId}:${period.key}:${component.key}`);
        let score = subcomponents.length > 0
          ? calculateWeightedAverage(subcomponents, (subcomponent) => subcomponent.weight)
          : (legacyComponentEntry ? Number(legacyComponentEntry.score) : null);

        // Entries migrated from grade-wide courses often keep composite keys
        // like "quizzes::quiz_of_animals" while the section course still has an
        // empty quizzes component. Recover those scores by prefix match.
        if (!hasFiniteScore(score)) {
          const componentPrefix = `${normalizeText(component.key)}::`;
          const matchingEntries = (entriesByStudentId.get(studentId) || []).filter((entry) => {
            if ((normalizeText(entry.academicPeriodKey) || 'period_1') !== period.key) {
              return false;
            }
            const entryKey = normalizeText(entry.componentKey);
            return entryKey === normalizeText(component.key) || entryKey.startsWith(componentPrefix);
          });
          const rawScores = matchingEntries
            .map((entry) => Number(entry.score))
            .filter((value) => Number.isFinite(value));
          if (rawScores.length > 0) {
            score = Number((rawScores.reduce((sum, value) => sum + value, 0) / rawScores.length).toFixed(2));
          }
        }

        if (score !== null && score !== undefined) {
          componentScoreItems.push({ score, weight: component.weight });
        }

        return {
          academicPeriodKey: period.key,
          academicPeriodName: period.name,
          componentKey: component.key,
          componentName: component.name,
          weight: component.weight,
          score,
          feedback: normalizeText(legacyComponentEntry?.feedback),
          gradedAt: legacyComponentEntry?.gradedAt || null,
          updatedAt: legacyComponentEntry?.updatedAt || null,
          subcomponents,
        };
      });

      const periodScore = calculateWeightedAverage(componentScoreItems, (component) => component.weight);
      const weightedContribution = periodScore === null ? null : Number(((periodScore * Number(period.weight || 0)) / 100).toFixed(2));

      if (weightedContribution !== null) {
        periodScoreItems.push({ score: periodScore, weight: period.weight });
      }

      return {
        key: period.key,
        name: period.name,
        weight: Number(period.weight || 0),
        periodScore,
        weightedContribution,
        scores,
      };
    });

    let finalScore = calculateWeightedAverage(periodScoreItems, (period) => period.weight);

    // If grade rows exist but don't match the current gradebook structure
    // (common after migrating entries onto a section course), fall back to
    // the plain average of stored scores so Campus/Rectoría still show them.
    if (!hasFiniteScore(finalScore)) {
      const rawScores = (entriesByStudentId.get(studentId) || [])
        .map((entry) => Number(entry.score))
        .filter((score) => Number.isFinite(score));
      if (rawScores.length > 0) {
        finalScore = Number((rawScores.reduce((sum, score) => sum + score, 0) / rawScores.length).toFixed(2));
      }
    }

    return {
      studentId,
      name: normalizeText(student.name),
      schoolCode: normalizeText(student.schoolCode),
      grade: normalizeText(student.grade),
      course: normalizeText(student.course),
      finalScore,
      periods,
      scores: periods.flatMap((period) => period.scores),
    };
  });
}

function serializeArray(items, serializer) {
  return Array.isArray(items) ? items.map(serializer) : [];
}

function normalizeGradingComponents(rawComponents, options = {}) {
  const allowIncompleteWeights = options.allowIncompleteWeights === true;
  const normalizedInput = Array.isArray(rawComponents) ? rawComponents : [];
  if (normalizedInput.length === 0) {
    return { ok: false, message: 'gradingComponents is required' };
  }

  const usedKeys = new Set();
  let totalWeight = 0;

  const normalizeSubcomponents = (rawSubcomponents) => {
    const normalizedSubcomponents = Array.isArray(rawSubcomponents) ? rawSubcomponents : [];
    const usedSubcomponentKeys = new Set();
    let subcomponentWeightTotal = 0;

    const subcomponents = normalizedSubcomponents.map((subcomponent, index) => {
      const name = normalizeText(subcomponent?.name);
      const fallbackKey = slugifyComponentKey(name || `subcomponent_${index + 1}`);
      const key = slugifyComponentKey(subcomponent?.key || fallbackKey);
      const weight = Number(subcomponent?.weight);

      subcomponentWeightTotal += weight;

      return {
        key,
        name,
        weight,
        date: normalizeText(subcomponent?.date),
        topic: normalizeText(subcomponent?.topic),
        description: normalizeText(subcomponent?.description),
        order: Number.isFinite(Number(subcomponent?.order)) ? Number(subcomponent.order) : (index + 1),
      };
    }).filter((subcomponent) => Boolean(subcomponent.name));

    for (const subcomponent of subcomponents) {
      if (!subcomponent.key) {
        return { ok: false, message: 'Each subcomponent requires a valid key' };
      }

      if (usedSubcomponentKeys.has(subcomponent.key)) {
        return { ok: false, message: 'subcomponent keys must be unique inside each grading component' };
      }

      if (!Number.isFinite(subcomponent.weight) || subcomponent.weight <= 0) {
        return { ok: false, message: 'Each subcomponent requires a positive weight' };
      }

      usedSubcomponentKeys.add(subcomponent.key);
    }

    if (subcomponents.length > 0 && subcomponentWeightTotal > 100.001) {
      return { ok: false, message: 'The subcomponents of a grading component cannot exceed 100%' };
    }

    return {
      ok: true,
      subcomponents: subcomponents.sort((left, right) => left.order - right.order),
    };
  };

  const components = normalizedInput.map((component, index) => {
    const name = normalizeText(component?.name);
    const fallbackKey = slugifyComponentKey(name || `component_${index + 1}`);
    const key = slugifyComponentKey(component?.key || fallbackKey);
    const weight = Number(component?.weight);
    const subcomponentsResult = normalizeSubcomponents(component?.subcomponents);

    totalWeight += weight;

    return {
      key,
      name,
      weight,
      order: Number.isFinite(Number(component?.order)) ? Number(component.order) : (index + 1) * 10,
      subcomponentsResult,
    };
  });

  for (const component of components) {
    if (!component.name) {
      return { ok: false, message: 'Each grading component requires a name' };
    }

    if (!component.key) {
      return { ok: false, message: 'Each grading component requires a valid key' };
    }

    if (usedKeys.has(component.key)) {
      return { ok: false, message: 'grading component keys must be unique' };
    }

    if (!Number.isFinite(component.weight) || component.weight <= 0) {
      return { ok: false, message: 'Each grading component requires a positive weight' };
    }

    if (!component.subcomponentsResult.ok) {
      return { ok: false, message: `${component.name}: ${component.subcomponentsResult.message}` };
    }

    usedKeys.add(component.key);
  }

  if (!allowIncompleteWeights && Math.abs(totalWeight - 100) > 0.001) {
    return { ok: false, message: 'The grading scheme must sum 100%' };
  }

  return {
    ok: true,
    components: components
      .map((component) => ({
        key: component.key,
        name: component.name,
        weight: component.weight,
        order: component.order,
        subcomponents: component.subcomponentsResult.subcomponents,
      }))
      .sort((left, right) => left.order - right.order),
  };
}

function normalizeAcademicPeriods(rawAcademicPeriods, options = {}) {
  const allowIncompleteWeights = options.allowIncompleteWeights === true;
  const parsedInput = parseMaybeJson(rawAcademicPeriods, rawAcademicPeriods);
  let academicPeriods = Array.isArray(parsedInput) ? parsedInput : [];

  if (academicPeriods.length === 0) {
    const fallbackComponents = Array.isArray(options.fallbackGradingComponents)
      ? options.fallbackGradingComponents
      : [];

    if (fallbackComponents.length > 0) {
      academicPeriods = [{
        key: 'period_1',
        name: 'Periodo 1',
        weight: 100,
        order: 10,
        gradingComponents: fallbackComponents,
      }];
    }
  }

  if (academicPeriods.length === 0) {
    return { ok: false, message: 'academicPeriods is required' };
  }

  const usedKeys = new Set();
  let totalWeight = 0;

  const periods = academicPeriods.map((period, index) => {
    const name = normalizeText(period?.name) || `Periodo ${index + 1}`;
    const fallbackKey = slugifyComponentKey(name || `period_${index + 1}`);
    const key = slugifyComponentKey(period?.key || fallbackKey || `period_${index + 1}`);
    const weight = Number(period?.weight);
    const order = Number.isFinite(Number(period?.order)) ? Number(period.order) : (index + 1) * 10;
    const gradingResult = normalizeGradingComponents(period?.gradingComponents, { allowIncompleteWeights });

    totalWeight += weight;

    return {
      key,
      name,
      weight,
      order,
      startDate: normalizeDateString(period?.startDate),
      endDate: normalizeDateString(period?.endDate),
      gradingResult,
    };
  });

  for (const period of periods) {
    if (!period.name) {
      return { ok: false, message: 'Cada periodo necesita un nombre' };
    }

    if (!period.key) {
      return { ok: false, message: 'Cada periodo necesita una clave valida' };
    }

    if (usedKeys.has(period.key)) {
      return { ok: false, message: 'Las claves de los periodos no pueden repetirse' };
    }

    if (!Number.isFinite(period.weight) || period.weight <= 0) {
      return { ok: false, message: 'Cada periodo debe tener un porcentaje mayor que cero' };
    }

    if (!period.gradingResult.ok) {
      return { ok: false, message: `${period.name}: ${period.gradingResult.message}` };
    }

    usedKeys.add(period.key);
  }

  if (!allowIncompleteWeights && Math.abs(totalWeight - 100) > 0.001) {
    return { ok: false, message: 'La ponderacion de los periodos debe sumar 100%' };
  }

  return {
    ok: true,
    periods: periods
      .map((period) => ({
        key: period.key,
        name: period.name,
        weight: period.weight,
        order: period.order,
        startDate: period.startDate,
        endDate: period.endDate,
        gradingComponents: period.gradingResult.components,
      }))
      .sort((left, right) => left.order - right.order),
  };
}

function buildPostGradebookAssignmentUpdate(rawAssignment, course, postTitle, deliveryDate) {
  const assignment = parseMaybeJson(rawAssignment, rawAssignment || {});
  if (!assignment || assignment.enabled !== true) {
    return { ok: true, periods: null };
  }

  const academicPeriodKey = slugifyComponentKey(assignment.academicPeriodKey);
  const componentKey = slugifyComponentKey(assignment.componentKey);
  const weight = Number(assignment.weight);

  if (!academicPeriodKey || !componentKey) {
    return { ok: false, message: 'Selecciona el periodo y componente del libro de notas.' };
  }

  if (!Number.isFinite(weight) || weight <= 0) {
    return { ok: false, message: 'El porcentaje de la asignacion en el libro de notas debe ser mayor que cero.' };
  }

  const basePeriods = getCourseAcademicPeriods(course);
  const periodIndex = basePeriods.findIndex((period) => (
    slugifyComponentKey(period.key) === academicPeriodKey
    || slugifyComponentKey(period.name) === academicPeriodKey
  ));
  if (periodIndex < 0) {
    return { ok: false, message: 'El periodo seleccionado no existe en este curso.' };
  }

  const componentIndex = (basePeriods[periodIndex].gradingComponents || [])
    .findIndex((component) => (
      slugifyComponentKey(component.key) === componentKey
      || slugifyComponentKey(component.name) === componentKey
    ));
  if (componentIndex < 0) {
    return { ok: false, message: 'El componente seleccionado no existe en este curso.' };
  }

  const component = basePeriods[periodIndex].gradingComponents[componentIndex];
  const existingSubcomponents = Array.isArray(component.subcomponents) ? component.subcomponents : [];
  const usedWeight = existingSubcomponents.reduce((total, subcomponent) => total + Number(subcomponent.weight || 0), 0);
  if (usedWeight + weight > 100.001) {
    return { ok: false, message: `El componente seleccionado solo tiene ${Math.max(0, Number((100 - usedWeight).toFixed(2)))}% disponible.` };
  }

  const existingKeys = new Set(existingSubcomponents.map((subcomponent) => slugifyComponentKey(subcomponent.key)).filter(Boolean));
  const subcomponentName = normalizeText(assignment.subcomponentName || postTitle || `Asignacion ${existingSubcomponents.length + 1}`);
  const subcomponentDescription = normalizeText(assignment.subcomponentDescription);
  const baseKey = slugifyComponentKey(assignment.subcomponentKey || subcomponentName || `asignacion_${existingSubcomponents.length + 1}`) || `asignacion_${existingSubcomponents.length + 1}`;
  let nextKey = baseKey;
  let keySuffix = 2;
  while (existingKeys.has(nextKey)) {
    nextKey = `${baseKey}_${keySuffix}`;
    keySuffix += 1;
  }

  const deliveryDateValue = deliveryDate instanceof Date && !Number.isNaN(deliveryDate.getTime())
    ? deliveryDate.toISOString().slice(0, 10)
    : '';
  const nextPeriods = basePeriods.map((period, currentPeriodIndex) => (
    currentPeriodIndex !== periodIndex ? period : {
      ...period,
      gradingComponents: (period.gradingComponents || []).map((currentComponent, currentComponentIndex) => (
        currentComponentIndex !== componentIndex ? currentComponent : {
          ...currentComponent,
          subcomponents: [
            ...existingSubcomponents,
            {
              key: nextKey,
              name: subcomponentName,
              weight,
              date: normalizeDateString(assignment.date) || deliveryDateValue,
              topic: normalizeText(assignment.topic || course.subject || course.title),
              description: subcomponentDescription,
              order: existingSubcomponents.length + 1,
            },
          ],
        }
      )),
    }
  ));

  const normalizedPeriods = normalizeAcademicPeriods(nextPeriods, { allowIncompleteWeights: true });
  if (!normalizedPeriods.ok) {
    return normalizedPeriods;
  }

  return { ok: true, periods: normalizedPeriods.periods };
}

function getCourseAcademicPeriods(course) {
  const storedPeriods = Array.isArray(course?.academicPeriods) ? course.academicPeriods : [];
  const normalizedPeriods = normalizeAcademicPeriods(storedPeriods, { allowIncompleteWeights: true });

  if (normalizedPeriods.ok) {
    return normalizedPeriods.periods;
  }

  const legacyComponents = Array.isArray(course?.gradingComponents) ? course.gradingComponents : [];
  const fallbackPeriods = normalizeAcademicPeriods([], {
    fallbackGradingComponents: legacyComponents,
    allowIncompleteWeights: true,
  });

  return fallbackPeriods.ok ? fallbackPeriods.periods : buildDefaultAcademicPeriods();
}

function normalizeAcademicContentTopics(topics = []) {
  const usedKeys = new Set();
  return (Array.isArray(topics) ? topics : [])
    .map((topic, index) => {
      const title = normalizeText(topic?.title).slice(0, 160);
      const fallbackKey = slugifyComponentKey(title || `topic_${index + 1}`);
      let key = slugifyComponentKey(topic?.key || fallbackKey || `topic_${index + 1}`);
      let suffix = 2;

      while (usedKeys.has(key)) {
        key = `${fallbackKey || 'topic'}_${suffix}`;
        suffix += 1;
      }

      usedKeys.add(key);

      return {
        key,
        title,
        description: normalizeText(topic?.description).slice(0, 1000),
        order: Number.isFinite(Number(topic?.order)) ? Number(topic.order) : (index + 1) * 10,
      };
    })
    .filter((topic) => Boolean(topic.title))
    .sort((left, right) => left.order - right.order);
}

function buildCourseAcademicContent(course) {
  const academicPeriods = getCourseAcademicPeriods(course);
  const contentPeriods = Array.isArray(course?.academicContent) ? course.academicContent : [];
  const contentByPeriodKey = new Map(contentPeriods.map((period) => [normalizeText(period?.periodKey), period]));

  return academicPeriods.map((period, index) => {
    const storedPeriod = contentByPeriodKey.get(normalizeText(period.key)) || {};
    return {
      periodKey: normalizeText(period.key) || `period_${index + 1}`,
      periodName: normalizeText(period.name) || `Periodo ${index + 1}`,
      startDate: normalizeDateString(period.startDate || storedPeriod.startDate),
      endDate: normalizeDateString(period.endDate || storedPeriod.endDate),
      order: Number(period.order ?? storedPeriod.order ?? (index + 1) * 10),
      topics: normalizeAcademicContentTopics(storedPeriod.topics),
    };
  });
}

function normalizeAcademicContentPayload(rawContent, course) {
  const academicPeriods = getCourseAcademicPeriods(course);
  const incomingPeriods = Array.isArray(rawContent) ? rawContent : [];
  const incomingByPeriodKey = new Map(incomingPeriods.map((period) => [normalizeText(period?.periodKey || period?.key), period]));

  return academicPeriods.map((period, index) => {
    const incomingPeriod = incomingByPeriodKey.get(normalizeText(period.key)) || incomingPeriods[index] || {};
    return {
      periodKey: normalizeText(period.key) || `period_${index + 1}`,
      periodName: normalizeText(period.name) || `Periodo ${index + 1}`,
      startDate: normalizeDateString(period.startDate),
      endDate: normalizeDateString(period.endDate),
      order: Number(period.order ?? (index + 1) * 10),
      topics: normalizeAcademicContentTopics(incomingPeriod.topics),
    };
  });
}

function buildAcademicContentGradeScopeQuery({ schoolId, course }) {
  const subject = normalizeText(course?.subject);
  const gradeLevel = normalizeText(course?.gradeLevel);
  const studentGradeKey = normalizeText(course?.studentGradeKey);

  if (!schoolId || !subject || (!gradeLevel && !studentGradeKey)) {
    return null;
  }

  return {
    schoolId,
    subject,
    status: 'active',
    ...(gradeLevel ? { gradeLevel } : { studentGradeKey }),
  };
}

function serializeCourse(course, options = {}) {
  const academicPeriods = getCourseAcademicPeriods(course);
  const academicContent = buildCourseAcademicContent(course);
  return {
    id: String(course._id),
    teacherUserId: normalizeText(course.teacherUserId),
    assignedByUserId: normalizeText(course.assignedByUserId),
    courseType: normalizeText(course.courseType) || 'subject',
    sourceCourseKey: normalizeText(course.sourceCourseKey),
    title: normalizeText(course.title),
    subject: normalizeText(course.subject),
    gradeLevel: normalizeText(course.gradeLevel),
    section: normalizeText(course.section),
    studentGradeKey: normalizeText(course.studentGradeKey),
    description: normalizeText(course.description),
    colorToken: normalizeText(course.colorToken) || '#2a6f97',
    classSessions: Array.isArray(course.classSessions)
      ? course.classSessions.map((session) => ({
        weekday: Number(session.weekday),
        startTime: normalizeText(session.startTime),
        endTime: normalizeText(session.endTime),
        label: normalizeText(session.label),
      }))
      : [],
    academicPeriods: academicPeriods.map((period) => ({
      key: normalizeText(period.key),
      name: normalizeText(period.name),
      weight: Number(period.weight || 0),
      order: Number(period.order || 0),
      startDate: normalizeDateString(period.startDate),
      endDate: normalizeDateString(period.endDate),
      gradingComponents: Array.isArray(period.gradingComponents)
        ? period.gradingComponents.map((component) => ({
          key: normalizeText(component.key),
          name: normalizeText(component.name),
          weight: Number(component.weight || 0),
          order: Number(component.order || 0),
          subcomponents: Array.isArray(component.subcomponents)
            ? component.subcomponents.map((subcomponent) => ({
              key: normalizeText(subcomponent.key),
              name: normalizeText(subcomponent.name),
              weight: Number(subcomponent.weight || 0),
              date: normalizeText(subcomponent.date),
              topic: normalizeText(subcomponent.topic),
              description: normalizeText(subcomponent.description),
              order: Number(subcomponent.order || 0),
            }))
            : [],
        }))
        : [],
    })),
      academicContent,
    gradingComponents: Array.isArray(academicPeriods[0]?.gradingComponents)
      ? academicPeriods[0].gradingComponents.map((component) => ({
        key: normalizeText(component.key),
        name: normalizeText(component.name),
        weight: Number(component.weight || 0),
        order: Number(component.order || 0),
        subcomponents: Array.isArray(component.subcomponents)
          ? component.subcomponents.map((subcomponent) => ({
            key: normalizeText(subcomponent.key),
            name: normalizeText(subcomponent.name),
            weight: Number(subcomponent.weight || 0),
            date: normalizeText(subcomponent.date),
            topic: normalizeText(subcomponent.topic),
            description: normalizeText(subcomponent.description),
            order: Number(subcomponent.order || 0),
          }))
          : [],
      }))
      : [],
    status: normalizeText(course.status) || 'active',
    gradingScale: options.gradingScale ? normalizeCampusGradingScale(options.gradingScale) : undefined,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

function buildAcademicStructurePeriodDefaults(academicStructure) {
  const periods = Array.isArray(academicStructure?.academicPeriods) ? academicStructure.academicPeriods : [];
  if (periods.length === 0) {
    return buildDefaultAcademicPeriods();
  }

  const incomingWeightTotal = periods.reduce((total, period) => total + Number(period?.weight || 0), 0);
  const fallbackWeight = periods.length > 0 ? Number((100 / periods.length).toFixed(2)) : 100;

  return periods.map((period, index) => ({
    key: normalizeText(period?.key) || `period_${index + 1}`,
    name: normalizeText(period?.name) || `Periodo ${index + 1}`,
    weight: incomingWeightTotal > 0 ? Number(period?.weight || 0) : fallbackWeight,
    order: Number(period?.order ?? (index + 1) * 10),
    startDate: normalizeDateString(period?.startDate),
    endDate: normalizeDateString(period?.endDate),
    gradingComponents: buildDefaultGradingComponents(),
  }));
}

function mergeCourseAcademicPeriodsWithStructure(coursePeriods, structurePeriods) {
  const existingPeriods = Array.isArray(coursePeriods) ? coursePeriods : [];
  const existingByKey = new Map(existingPeriods.map((period) => [normalizeText(period?.key), period]));

  return structurePeriods.map((structurePeriod, periodIndex) => {
    const existingPeriod = existingByKey.get(normalizeText(structurePeriod?.key)) || existingPeriods[periodIndex] || {};
    const existingComponents = Array.isArray(existingPeriod.gradingComponents) && existingPeriod.gradingComponents.length > 0
      ? existingPeriod.gradingComponents
      : structurePeriod.gradingComponents;

    return {
      key: normalizeText(structurePeriod?.key) || normalizeText(existingPeriod?.key) || `period_${periodIndex + 1}`,
      name: normalizeText(structurePeriod?.name) || normalizeText(existingPeriod?.name) || `Periodo ${periodIndex + 1}`,
      weight: Number(structurePeriod?.weight || existingPeriod?.weight || 0),
      order: Number(structurePeriod?.order ?? existingPeriod?.order ?? (periodIndex + 1) * 10),
      startDate: normalizeDateString(structurePeriod?.startDate || existingPeriod?.startDate),
      endDate: normalizeDateString(structurePeriod?.endDate || existingPeriod?.endDate),
      gradingComponents: existingComponents,
    };
  });
}

function buildAcademicLookupMaps(academicStructure) {
  const subjectsByKey = new Map((Array.isArray(academicStructure?.subjects) ? academicStructure.subjects : [])
    .map((subject) => [normalizeText(subject?.key), normalizeText(subject?.label || subject?.key)]));
  const gradesByKey = new Map((Array.isArray(academicStructure?.grades) ? academicStructure.grades : [])
    .map((grade) => [normalizeText(grade?.key), grade]));

  return { subjectsByKey, gradesByKey };
}

function buildAcademicCourseSectionFromKey(courseKey = '') {
  const normalizedCourseKey = normalizeText(courseKey).replace(/\s+/g, '');
  const keyParts = normalizedCourseKey.split(':').map((part) => part.trim()).filter(Boolean);

  if (keyParts.length >= 2) {
    return `${keyParts[0]}${keyParts[keyParts.length - 1]}`.toUpperCase();
  }

  return normalizedCourseKey.toUpperCase();
}

function resolveAcademicCourseMetadata(grade, courseKey) {
  const normalizedCourseKey = normalizeText(courseKey);
  const course = (Array.isArray(grade?.courses) ? grade.courses : [])
    .find((item) => normalizeText(item?.key).toUpperCase() === normalizedCourseKey.toUpperCase());

  const sourceCourseKey = normalizeText(course?.key || normalizedCourseKey).toUpperCase();
  const fallbackSection = buildAcademicCourseSectionFromKey(sourceCourseKey || normalizedCourseKey);
  const label = normalizeText(course?.label || course?.section || fallbackSection || normalizedCourseKey);

  return {
    sourceCourseKey,
    label,
  };
}

function buildAcademicCourseTitle({ subjectLabel, gradeLabel, courseLabel }) {
  const normalizedSubjectLabel = normalizeText(subjectLabel);
  const normalizedGradeLabel = normalizeText(gradeLabel);
  const normalizedCourseLabel = normalizeText(courseLabel);
  const courseLabelAlreadyHasGrade = /^[0-9]+\s*[a-z]([\s-].*)?$/i.test(normalizedCourseLabel);
  const groupLabel = courseLabelAlreadyHasGrade
    ? normalizedCourseLabel.replace(/\s+/g, '').toUpperCase()
    : [normalizedGradeLabel, normalizedCourseLabel]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

  return [normalizedSubjectLabel, groupLabel]
    .filter(Boolean)
    .join(' · ')
    .trim();
}

function collectTeacherSubjectKeysForGradeSchedule(academicStructure, gradeSchedule, teacherUserId) {
  const normalizedTeacherUserId = normalizeText(teacherUserId);
  const keys = new Set();
  const gradeKey = normalizeText(gradeSchedule?.gradeKey);

  const collectFromSchedule = (schedule) => {
    (Array.isArray(schedule?.subjectLoads) ? schedule.subjectLoads : []).forEach((load) => {
      if (normalizeText(load?.teacherUserId) === normalizedTeacherUserId) {
        const subjectKey = normalizeText(load?.subjectKey);
        if (subjectKey) {
          keys.add(subjectKey);
        }
      }
    });
  };

  collectFromSchedule(gradeSchedule);

  const gradeLevelSchedule = (Array.isArray(academicStructure?.gradeSchedules) ? academicStructure.gradeSchedules : [])
    .find((schedule) => normalizeText(schedule?.gradeKey) === gradeKey && !normalizeText(schedule?.courseKey));

  if (gradeLevelSchedule && gradeLevelSchedule !== gradeSchedule) {
    collectFromSchedule(gradeLevelSchedule);
  }

  return keys;
}

function weeklyScheduleEntryMatchesTeacher(entry, teacherUserId, teacherSubjectKeys) {
  if (normalizeText(entry?.entryType || 'class') === 'break') {
    return false;
  }

  const entryTeacherUserId = normalizeText(entry?.teacherUserId);
  if (entryTeacherUserId) {
    return entryTeacherUserId === normalizeText(teacherUserId);
  }

  const entrySubjectKey = normalizeText(entry?.subjectKey);
  return Boolean(entrySubjectKey && teacherSubjectKeys.has(entrySubjectKey));
}

function resolveCourseSubjectKeys(academicStructure, course) {
  const courseSubject = normalizeText(course?.subject);
  const keys = new Set();

  (Array.isArray(academicStructure?.subjects) ? academicStructure.subjects : []).forEach((subject) => {
    const key = normalizeText(subject?.key);
    const label = normalizeText(subject?.label || key);
    if (key && (label === courseSubject || key.toLowerCase() === courseSubject.toLowerCase())) {
      keys.add(key);
    }
  });

  if (keys.size === 0 && courseSubject) {
    keys.add(courseSubject.toLowerCase().replace(/\s+/g, '_'));
  }

  return keys;
}

function rankGradeSchedulesForCourse(academicStructure, course) {
  const gradeKey = normalizeText(course?.studentGradeKey);
  const sourceCourseKey = normalizeText(course?.sourceCourseKey);
  const section = normalizeText(course?.section).toUpperCase();

  return (Array.isArray(academicStructure?.gradeSchedules) ? academicStructure.gradeSchedules : [])
    .filter((schedule) => normalizeText(schedule?.gradeKey) === gradeKey)
    .map((schedule) => {
      const scheduleCourseKey = normalizeText(schedule?.courseKey);
      let score = 0;
      if (sourceCourseKey && scheduleCourseKey.toUpperCase() === sourceCourseKey.toUpperCase()) {
        score += 50;
      }
      if (section && buildAcademicCourseSectionFromKey(scheduleCourseKey) === section) {
        score += 40;
      }
      if (scheduleCourseKey) {
        score += 10;
      }
      return { schedule, score };
    })
    .sort((left, right) => right.score - left.score)
    .map((item) => item.schedule);
}

function resolveCourseClassSessionsFromGradeSchedules(academicStructure, teacherUserId, course) {
  if (!academicStructure || !teacherUserId || !course) {
    return [];
  }

  const subjectKeys = resolveCourseSubjectKeys(academicStructure, course);
  if (subjectKeys.size === 0) {
    return [];
  }

  const rankedSchedules = rankGradeSchedulesForCourse(academicStructure, course);
  const sessions = [];
  const seen = new Set();

  for (const gradeSchedule of rankedSchedules) {
    const teacherSubjectKeys = collectTeacherSubjectKeysForGradeSchedule(academicStructure, gradeSchedule, teacherUserId);
    let matchedCount = 0;

    (Array.isArray(gradeSchedule?.weeklySchedule) ? gradeSchedule.weeklySchedule : []).forEach((entry) => {
      const entrySubjectKey = normalizeText(entry?.subjectKey);
      if (!subjectKeys.has(entrySubjectKey)) {
        return;
      }

      if (!weeklyScheduleEntryMatchesTeacher(entry, teacherUserId, teacherSubjectKeys)) {
        return;
      }

      const weekday = Number(entry?.weekday);
      const startTime = normalizeText(entry?.startTime);
      const endTime = normalizeText(entry?.endTime);
      if (weekday < 1 || weekday > 5 || !startTime || !endTime) {
        return;
      }

      const sessionKey = `${weekday}:${startTime}:${endTime}:${entrySubjectKey}`;
      if (seen.has(sessionKey)) {
        return;
      }

      seen.add(sessionKey);
      matchedCount += 1;
      sessions.push({
        weekday,
        startTime,
        endTime,
        label: normalizeText(entry?.label) || `Bloque ${entry?.block || ''}`.trim() || 'Bloque de clase',
      });
    });

    if (matchedCount > 0) {
      break;
    }
  }

  return sessions.sort((left, right) => (
    left.weekday === right.weekday
      ? left.startTime.localeCompare(right.startTime)
      : left.weekday - right.weekday
  ));
}

function buildTeacherAcademicCourseCandidates({ academicStructure, teacherUserId }) {
  const normalizedTeacherUserId = normalizeText(teacherUserId);
  if (!academicStructure || !normalizedTeacherUserId) {
    return [];
  }

  const { subjectsByKey, gradesByKey } = buildAcademicLookupMaps(academicStructure);
  const candidatesByKey = new Map();

  const ensureCandidate = ({ gradeKey, courseKey = '', subjectKey }) => {
    const normalizedGradeKey = normalizeText(gradeKey);
    const normalizedSubjectKey = normalizeText(subjectKey);
    const normalizedCourseKey = normalizeText(courseKey) || 'general';

    if (!normalizedGradeKey || !normalizedSubjectKey) {
      return null;
    }

    const candidateKey = `${normalizedGradeKey}::${normalizedCourseKey}::${normalizedSubjectKey}`;
    if (candidatesByKey.has(candidateKey)) {
      return candidatesByKey.get(candidateKey);
    }

    const grade = gradesByKey.get(normalizedGradeKey) || null;
    const gradeLabel = normalizeText(grade?.label || normalizedGradeKey);
    const courseMetadata = normalizedCourseKey === 'general'
      ? { sourceCourseKey: '', label: '' }
      : resolveAcademicCourseMetadata(grade, normalizedCourseKey);
    const courseLabel = courseMetadata.label;
    const subjectLabel = subjectsByKey.get(normalizedSubjectKey) || normalizedSubjectKey;
    const candidate = {
      key: candidateKey,
      sourceCourseKey: courseMetadata.sourceCourseKey,
      title: buildAcademicCourseTitle({ subjectLabel, gradeLabel, courseLabel }) || subjectLabel || gradeLabel,
      subjectKey: normalizedSubjectKey,
      subject: subjectLabel,
      gradeLevel: gradeLabel,
      section: courseLabel,
      studentGradeKey: normalizedGradeKey,
      classSessions: [],
    };

    candidatesByKey.set(candidateKey, candidate);
    return candidate;
  };

  (Array.isArray(academicStructure.gradeSchedules) ? academicStructure.gradeSchedules : []).forEach((gradeSchedule) => {
    const gradeKey = normalizeText(gradeSchedule?.gradeKey);
    const courseKey = normalizeText(gradeSchedule?.courseKey);
    const grade = gradesByKey.get(gradeKey) || null;
    // When the schedule is grade-wide (no courseKey), keep one campus course per section
    // of that grade so existing sectioned courses with grades (6A, 6B, ...) still match.
    const courseKeysForLoad = courseKey
      ? [courseKey]
      : (Array.isArray(grade?.courses) && grade.courses.length > 0
        ? grade.courses.map((course) => normalizeText(course?.key)).filter(Boolean)
        : ['']);

    (Array.isArray(gradeSchedule?.subjectLoads) ? gradeSchedule.subjectLoads : []).forEach((load) => {
      if (normalizeText(load?.teacherUserId) === normalizedTeacherUserId) {
        courseKeysForLoad.forEach((targetCourseKey) => {
          ensureCandidate({ gradeKey, courseKey: targetCourseKey, subjectKey: load?.subjectKey });
        });
      }
    });

    const teacherSubjectKeys = collectTeacherSubjectKeysForGradeSchedule(academicStructure, gradeSchedule, normalizedTeacherUserId);

    (Array.isArray(gradeSchedule?.weeklySchedule) ? gradeSchedule.weeklySchedule : []).forEach((entry) => {
      if (!weeklyScheduleEntryMatchesTeacher(entry, normalizedTeacherUserId, teacherSubjectKeys)) {
        return;
      }

      courseKeysForLoad.forEach((targetCourseKey) => {
        const candidate = ensureCandidate({ gradeKey, courseKey: targetCourseKey, subjectKey: entry?.subjectKey });
        if (!candidate) {
          return;
        }

        candidate.classSessions.push({
          weekday: Number(entry.weekday),
          startTime: normalizeText(entry.startTime),
          endTime: normalizeText(entry.endTime),
          label: `Bloque ${entry.block || ''}`.trim(),
        });
      });
    });
  });

  // Do not expand every subject candidate into every course of the grade a second time.
  // That previous fan-out created duplicate campus courses (e.g. Arte × every section).

  return Array.from(candidatesByKey.values());
}

function resolveTeacherCourseClassSessionsFromStructure(academicStructure, teacherUserId, course) {
  const fromGradeSchedule = resolveCourseClassSessionsFromGradeSchedules(academicStructure, teacherUserId, course);
  if (fromGradeSchedule.length > 0) {
    return fromGradeSchedule;
  }

  return Array.isArray(course?.classSessions)
    ? course.classSessions.filter((session) => session && typeof session === 'object')
    : [];
}

function buildTeacherCampusCourseIdentity(course = {}) {
  const subjectPart = normalizeText(course.subject || course.subjectKey)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  const gradePart = normalizeText(course.studentGradeKey || course.gradeKey || '');
  const sectionPart = normalizeText(course.sourceCourseKey || course.section || '').toLowerCase();
  if (!subjectPart || !gradePart) {
    return '';
  }
  return `${subjectPart}::${gradePart}::${sectionPart}`;
}

async function findExistingTeacherCourseForCandidate({ schoolId, teacherUserId, candidate }) {
  const candidateCourseType = candidate.courseType || 'subject';
  const candidateSection = normalizeText(candidate.section);
  const baseQuery = {
    schoolId,
    teacherUserId,
    status: 'active',
    ...(candidateCourseType === 'subject'
      ? { $or: [{ courseType: 'subject' }, { courseType: { $exists: false } }, { courseType: '' }] }
      : { courseType: candidateCourseType }),
  };

  const attempts = [
    candidate.sourceCourseKey
      ? { sourceCourseKey: candidate.sourceCourseKey, subject: candidate.subject, studentGradeKey: candidate.studentGradeKey }
      : null,
    candidateSection
      ? { subject: candidate.subject, studentGradeKey: candidate.studentGradeKey, section: candidate.section }
      : null,
    candidateSection
      ? { subject: candidate.subject, gradeLevel: candidate.gradeLevel, section: candidate.section }
      : null,
    candidateSection
      ? { title: candidate.title, studentGradeKey: candidate.studentGradeKey, section: candidate.section }
      : null,
    !candidateSection ? { title: candidate.title, studentGradeKey: candidate.studentGradeKey } : null,
    !candidateSection ? { subject: candidate.subject, studentGradeKey: candidate.studentGradeKey } : null,
  ].filter(Boolean);

  for (const matcher of attempts) {
    const existingCourse = await CampusCourse.findOne({ ...baseQuery, ...matcher });
    if (!existingCourse) {
      continue;
    }

    if (candidateSection && normalizeText(existingCourse.section)) {
      const existingSectionIdentity = buildTeacherCourseSectionIdentity(existingCourse);
      const candidateSectionIdentity = buildTeacherCourseSectionIdentity({
        section: candidate.section,
        studentGradeKey: candidate.studentGradeKey,
        gradeLevel: candidate.gradeLevel,
        sourceCourseKey: candidate.sourceCourseKey,
      });

      if (existingSectionIdentity && candidateSectionIdentity && existingSectionIdentity !== candidateSectionIdentity) {
        continue;
      }
    }

    return existingCourse;
  }

  return null;
}

function buildTeacherGuidanceCourseCandidates({ academicStructure, teacherUserId }) {
  const normalizedTeacherUserId = normalizeText(teacherUserId);
  if (!academicStructure || !normalizedTeacherUserId) {
    return [];
  }

  return (Array.isArray(academicStructure?.grades) ? academicStructure.grades : []).flatMap((grade) => {
    const gradeKey = normalizeText(grade?.key || grade?.label);
    const gradeLabel = normalizeText(grade?.label || gradeKey);
    return (Array.isArray(grade?.courses) ? grade.courses : [])
      .filter((course) => normalizeText(course?.status || 'active') !== 'archived')
      .filter((course) => normalizeText(course?.headroomTeacherUserId) === normalizedTeacherUserId)
      .map((course) => {
        const courseKey = normalizeText(course?.key).toUpperCase();
        const courseLabel = normalizeText(course?.label || course?.section || courseKey);
        return {
          key: `${gradeKey}::${courseKey}::guidance_routine`,
          courseType: 'guidance_routine',
          sourceCourseKey: courseKey,
          title: `Guidance Routine · ${courseLabel || gradeLabel}`,
          subject: 'Guidance Routine',
          gradeLevel: gradeLabel,
          section: courseLabel,
          studentGradeKey: gradeKey,
          classSessions: [],
        };
      });
  });
}

async function syncTeacherCoursesFromAcademicStructure({ schoolId, teacherUserId }) {
  const academicStructure = await AcademicStructure.findOne({ schoolId }).lean();
  const candidates = [
    ...buildTeacherAcademicCourseCandidates({ academicStructure, teacherUserId }),
    ...buildTeacherGuidanceCourseCandidates({ academicStructure, teacherUserId }),
  ];

  if (candidates.length === 0) {
    return;
  }

  const academicPeriods = buildAcademicStructurePeriodDefaults(academicStructure);
  const sectionedCandidateKeys = new Set(candidates
    .filter((candidate) => normalizeText(candidate.section))
    .map((candidate) => `${candidate.subject}::${candidate.studentGradeKey}`));

  const matchedCourseIds = new Set();
  const candidateIdentities = new Set(
    candidates.map((candidate) => buildTeacherCampusCourseIdentity(candidate)).filter(Boolean),
  );

  for (const candidate of candidates) {
    const candidateCourseType = candidate.courseType || 'subject';
    let existingCourse = await findExistingTeacherCourseForCandidate({ schoolId, teacherUserId, candidate });

    // Prefer reactivating a graded archived course over creating an empty clone.
    if (!existingCourse) {
      const archivedMatch = await CampusCourse.findOne({
        schoolId,
        teacherUserId,
        status: 'archived',
        subject: candidate.subject,
        studentGradeKey: candidate.studentGradeKey,
        ...(normalizeText(candidate.section)
          ? { section: candidate.section }
          : { $or: [{ section: '' }, { section: { $exists: false } }] }),
      });
      if (archivedMatch) {
        const hasGrades = await CampusGradeEntry.exists({ schoolId, courseId: archivedMatch._id });
        if (hasGrades || !normalizeText(archivedMatch.section) || normalizeText(archivedMatch.section) === normalizeText(candidate.section)) {
          existingCourse = archivedMatch;
        }
      }
    }

    if (existingCourse) {
      existingCourse.courseType = candidateCourseType;
      existingCourse.sourceCourseKey = candidate.sourceCourseKey || existingCourse.sourceCourseKey || '';
      existingCourse.title = candidate.title;
      existingCourse.subject = candidate.subject;
      existingCourse.gradeLevel = candidate.gradeLevel;
      existingCourse.section = candidate.section || existingCourse.section || '';
      const resolvedClassSessions = resolveCourseClassSessionsFromGradeSchedules(academicStructure, teacherUserId, {
        subject: existingCourse.subject || candidate.subject,
        studentGradeKey: existingCourse.studentGradeKey || candidate.studentGradeKey,
        section: existingCourse.section || candidate.section,
        sourceCourseKey: existingCourse.sourceCourseKey || candidate.sourceCourseKey,
        title: existingCourse.title || candidate.title,
      });
      if (resolvedClassSessions.length > 0) {
        existingCourse.classSessions = resolvedClassSessions;
      } else if (Array.isArray(candidate.classSessions) && candidate.classSessions.length > 0) {
        existingCourse.classSessions = candidate.classSessions;
      }
      existingCourse.academicPeriods = candidate.courseType === 'guidance_routine'
        ? []
        : mergeCourseAcademicPeriodsWithStructure(existingCourse.academicPeriods, academicPeriods);
      existingCourse.gradingComponents = candidate.courseType === 'guidance_routine'
        ? []
        : (existingCourse.gradingComponents || []);
      existingCourse.status = 'active';
      await existingCourse.save();
      matchedCourseIds.add(String(existingCourse._id));
      continue;
    }

    const createdCourse = await CampusCourse.create({
      schoolId,
      teacherUserId,
      courseType: candidateCourseType,
      sourceCourseKey: candidate.sourceCourseKey || '',
      title: candidate.title,
      subject: candidate.subject,
      gradeLevel: candidate.gradeLevel,
      section: candidate.section,
      studentGradeKey: candidate.studentGradeKey,
      description: 'Curso sincronizado desde Rectoría.',
      classSessions: candidate.classSessions,
      academicPeriods: candidate.courseType === 'guidance_routine' ? [] : academicPeriods,
      gradingComponents: candidate.courseType === 'guidance_routine' ? [] : (academicPeriods[0]?.gradingComponents || buildDefaultGradingComponents()),
      status: 'active',
    });
    matchedCourseIds.add(String(createdCourse._id));
  }

  // After section courses exist, move gradebook rows off grade-wide courses (e.g. "1")
  // onto the student's real section (1A / 1B), then archive empty sectionless shells.
  for (const sectionedKey of sectionedCandidateKeys) {
    const [subject, studentGradeKey] = sectionedKey.split('::');
    const sectionlessCourses = await CampusCourse.find({
      schoolId,
      teacherUserId,
      subject,
      studentGradeKey,
      status: 'active',
      $or: [
        { section: '' },
        { section: { $exists: false } },
      ],
    }).select('_id subject studentGradeKey section sourceCourseKey gradeLevel').lean();

    if (!sectionlessCourses.length) {
      continue;
    }

    const sectionedCourses = await CampusCourse.find({
      schoolId,
      teacherUserId,
      subject,
      studentGradeKey,
      status: 'active',
      section: { $exists: true, $nin: ['', null] },
    }).lean();

    const sectionlessIdsToArchive = [];
    for (const sectionlessCourse of sectionlessCourses) {
      if (sectionedCourses.length > 0) {
        await migrateSectionlessGradesToSectionCourses({
          schoolId,
          teacherUserId,
          sectionlessCourse,
          sectionedCourses,
        });
      }

      const remainingGrades = await CampusGradeEntry.countDocuments({
        schoolId,
        courseId: sectionlessCourse._id,
      });
      if (remainingGrades === 0) {
        sectionlessIdsToArchive.push(sectionlessCourse._id);
      }
    }

    if (sectionlessIdsToArchive.length > 0) {
      await CampusCourse.updateMany(
        { _id: { $in: sectionlessIdsToArchive }, schoolId, teacherUserId, status: 'active' },
        { $set: { status: 'archived' } },
      );
      sectionlessIdsToArchive.forEach((id) => matchedCourseIds.delete(String(id)));
    }
  }

  // Never archive courses that still hold gradebook data.
  const activeTeacherCourses = await CampusCourse.find({
    schoolId,
    teacherUserId,
    status: 'active',
  }).select('_id subject subjectKey studentGradeKey gradeKey sourceCourseKey section courseType').lean();

  const unmatchedIds = activeTeacherCourses
    .filter((course) => {
      if (matchedCourseIds.has(String(course._id))) {
        return false;
      }
      const identity = buildTeacherCampusCourseIdentity(course);
      return identity && !candidateIdentities.has(identity);
    })
    .map((course) => course._id);

  if (unmatchedIds.length > 0) {
    const gradedUnmatchedIds = await CampusGradeEntry.distinct('courseId', {
      schoolId,
      courseId: { $in: unmatchedIds },
    });
    const gradedIdSet = new Set(gradedUnmatchedIds.map((id) => String(id)));
    const orphanIds = unmatchedIds.filter((id) => !gradedIdSet.has(String(id)));

    if (orphanIds.length > 0) {
      await CampusCourse.updateMany(
        { _id: { $in: orphanIds }, schoolId, teacherUserId, status: 'active' },
        { $set: { status: 'archived' } },
      );
    }
  }
}

function serializePost(post) {
  return {
    id: String(post._id),
    courseId: String(post.courseId?._id || post.courseId || ''),
    courseTitle: normalizeText(post.courseId?.title),
    type: normalizePostType(post.type) || 'Aviso',
    title: normalizeText(post.title),
    body: normalizeText(post.body),
    deliveryMode: normalizeText(post.deliveryMode) || 'date',
    dueAt: post.dueAt || null,
    scheduledClassDate: post.scheduledClassDate || null,
    scheduledClassSession: post.scheduledClassSession
      ? {
        weekday: Number(post.scheduledClassSession.weekday),
        startTime: normalizeText(post.scheduledClassSession.startTime),
        endTime: normalizeText(post.scheduledClassSession.endTime),
        label: normalizeText(post.scheduledClassSession.label),
      }
      : null,
    attachments: Array.isArray(post.attachments)
      ? post.attachments.map((attachment) => ({
        sourceType: normalizeText(attachment.sourceType) || 'file',
        kind: normalizeText(attachment.kind) || 'file',
        title: normalizeText(attachment.title),
        url: normalizeText(attachment.url),
        fileName: normalizeText(attachment.fileName),
        mimeType: normalizeText(attachment.mimeType),
        sizeBytes: Number(attachment.sizeBytes || 0),
        extension: normalizeText(attachment.extension),
        storage: normalizeText(attachment.storage),
      }))
      : [],
    allowStudentSubmission: Boolean(post.allowStudentSubmission),
    status: normalizeText(post.status) || 'published',
    publishedAt: post.publishedAt || null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

function serializeDisciplineObservation(observation) {
  return {
    id: String(observation._id),
    teacherUserId: String(observation.teacherUserId?._id || observation.teacherUserId || ''),
    teacherName: normalizeText(observation.teacherName || observation.teacherUserId?.name),
    courseId: String(observation.courseId?._id || observation.courseId || ''),
    courseTitle: normalizeText(observation.courseTitle || observation.courseId?.title),
    subject: normalizeText(observation.subject),
    studentGradeKey: normalizeText(observation.studentGradeKey),
    studentId: String(observation.studentId?._id || observation.studentId || ''),
    studentName: normalizeText(observation.studentName || observation.studentId?.name),
    studentSchoolCode: normalizeText(observation.studentSchoolCode || observation.studentId?.schoolCode),
    studentGrade: normalizeText(observation.studentGrade || observation.studentId?.grade),
    studentCourse: normalizeText(observation.studentCourse || observation.studentId?.course),
    observation: normalizeText(observation.observation),
    status: normalizeText(observation.status) || 'submitted',
    recipients: Array.isArray(observation.recipients) ? observation.recipients.map(normalizeText).filter(Boolean) : [],
    submittedAt: observation.submittedAt || observation.createdAt,
    createdAt: observation.createdAt,
    updatedAt: observation.updatedAt,
  };
}

function firstCampusName(name) {
  return normalizeText(name).split(/\s+/)[0] || 'El estudiante';
}

async function notifyStudentGradePublished({ schoolId, student, course, grades }) {
  const gradeCount = Array.isArray(grades) ? grades.length : 0;
  const courseLabel = normalizeText(course?.subject) || normalizeText(course?.title) || 'una asignatura';
  const childName = firstCampusName(student?.name);
  const studentId = String(student?._id || student?.studentId || '');

  const [parentResult] = await Promise.all([
    queueStudentParentNotification({
      schoolId,
      studentId: student?._id || student?.studentId,
      title: `Nueva calificación en ${courseLabel}`,
      body: `${childName} tiene ${gradeCount === 1 ? 'una nueva calificación' : `${gradeCount} nuevas calificaciones`} en ${courseLabel}.`,
      payload: {
        type: 'campus.grade_published',
        courseId: String(course?._id || ''),
        courseTitle: normalizeText(course?.title),
        subject: normalizeText(course?.subject),
        gradeCount,
        studentId,
        url: buildParentPushUrl('campus.grade_published', { studentId }),
      },
    }),
    queueStudentUserNotification({
      schoolId,
      studentId: student?._id || student?.studentId,
      title: `Nueva calificación en ${courseLabel}`,
      body: `Tienes ${gradeCount === 1 ? 'una nueva calificación' : `${gradeCount} nuevas calificaciones`} en ${courseLabel}.`,
      payload: {
        type: 'campus.grade_published',
        courseId: String(course?._id || ''),
        courseTitle: normalizeText(course?.title),
        subject: normalizeText(course?.subject),
        gradeCount,
        studentId,
        url: buildStudentPushUrl('campus.grade_published'),
      },
    }),
  ]);

  return parentResult;
}

async function notifyAttendanceSessionSubmitted({ schoolId, course, session }) {
  const courseLabel = normalizeText(course?.subject) || normalizeText(course?.title) || 'clase';
  const attendanceTypeLabel = campusAttendanceTypeLabels[normalizeCampusAttendanceType(session?.attendanceType)] || 'Asistencia';

  const [parentResult] = await Promise.all([
    queueStudentParentNotifications({
      schoolId,
      students: Array.isArray(session?.records) ? session.records : [],
      buildNotification: (record) => {
        const status = normalizeCampusAttendanceStatus(record.status);
        const statusLabel = campusAttendanceStatusLabels[status] || 'Registrado';
        const childName = firstCampusName(record.studentNameSnapshot);

        return {
          title: `Asistencia registrada: ${courseLabel}`,
          body: `${childName} quedó marcado como ${statusLabel.toLowerCase()} en ${attendanceTypeLabel.toLowerCase()}.`,
          payload: {
            type: 'campus.attendance_recorded',
            attendanceSessionId: String(session?._id || ''),
            courseId: String(course?._id || session?.courseId || ''),
            courseTitle: normalizeText(course?.title || session?.courseTitleSnapshot),
            subject: normalizeText(course?.subject || session?.subjectSnapshot),
            date: normalizeText(session?.date),
            status,
            studentId: String(record.studentId || record._id || ''),
            url: buildParentPushUrl('campus.attendance_recorded', { studentId: record.studentId || record._id }),
          },
        };
      },
    }),
    queueStudentUserNotifications({
      schoolId,
      students: Array.isArray(session?.records) ? session.records : [],
      buildNotification: (record) => {
        const status = normalizeCampusAttendanceStatus(record.status);
        const statusLabel = campusAttendanceStatusLabels[status] || 'Registrado';

        return {
          title: `Asistencia registrada: ${courseLabel}`,
          body: `Quedaste marcado como ${statusLabel.toLowerCase()} en ${attendanceTypeLabel.toLowerCase()}.`,
          payload: {
            type: 'campus.attendance_recorded',
            attendanceSessionId: String(session?._id || ''),
            courseId: String(course?._id || session?.courseId || ''),
            courseTitle: normalizeText(course?.title || session?.courseTitleSnapshot),
            subject: normalizeText(course?.subject || session?.subjectSnapshot),
            date: normalizeText(session?.date),
            status,
            studentId: String(record.studentId || record._id || ''),
            url: buildStudentPushUrl('campus.attendance_recorded'),
          },
        };
      },
    }),
  ]);

  return parentResult;
}

async function notifyCampusPostPublished({ schoolId, course, post, students }) {
  const courseLabel = normalizeText(course?.subject) || normalizeText(course?.title) || 'clase';
  const postType = normalizePostType(post?.type) || 'Publicación';
  const postCategoryLabel = getCampusPostCategoryLabel(postType);
  // Assignments: evaluative types OR posts that request a student submission.
  const isAssignmentLike = isEvaluativePostType(postType) || Boolean(post?.allowStudentSubmission);

  const [parentResult] = await Promise.all([
    queueStudentParentNotifications({
      schoolId,
      students,
      buildNotification: (student) => {
        const studentId = String(student._id || student.studentId || student.id || '');

        return {
          title: `${postCategoryLabel} nueva: ${normalizeText(post?.title)}`,
          body: `${firstCampusName(student.name || student.studentNameSnapshot)} tiene una nueva publicación de ${courseLabel}.`,
          payload: {
            type: 'campus.teacher_post_published',
            postId: String(post?._id || ''),
            courseId: String(course?._id || post?.courseId || ''),
            courseTitle: normalizeText(course?.title),
            subject: normalizeText(course?.subject),
            postType,
            studentId,
            url: buildParentPushUrl('campus.teacher_post_published', { studentId, postType }),
          },
        };
      },
    }),
    isAssignmentLike
      ? queueStudentUserNotifications({
        schoolId,
        students,
        buildNotification: (student) => ({
          title: `${postCategoryLabel} nueva: ${normalizeText(post?.title)}`,
          body: `Tienes una nueva ${postCategoryLabel.toLowerCase()} en ${courseLabel}.`,
          payload: {
            type: 'campus.teacher_post_published',
            postId: String(post?._id || ''),
            courseId: String(course?._id || post?.courseId || ''),
            courseTitle: normalizeText(course?.title),
            subject: normalizeText(course?.subject),
            postType,
            studentId: String(student.studentId || student._id || student.id || ''),
            url: buildStudentPushUrl('campus.teacher_post_published'),
          },
        }),
      })
      : Promise.resolve({ notificationsCreated: 0, tokensFound: 0 }),
  ]);

  return parentResult;
}

async function queueCampusPostPublishedNotifications({ schoolId, teacherUserId, course, post }) {
  return runWithSchoolContext(schoolId, async () => {
    const detail = await buildTeacherCourseDetail({ schoolId, teacherUserId, course });
    const students = Array.isArray(detail?.students) ? detail.students : [];
    if (!students.length) {
      console.warn(`[CAMPUS_POST_NOTIFY_WARNING] post=${post?._id || ''} course=${course?._id || ''} empty_roster`);
    }
    return notifyCampusPostPublished({ schoolId, course, post, students });
  });
}

async function notifyDisciplineObservation({ schoolId, observation }) {
  const users = await User.find({
    schoolId,
    role: { $in: ['coordination', 'direccion', 'psychology', 'rectoria', 'admin'] },
    status: 'active',
    deletedAt: null,
  }).select('_id role').lean();

  const notificationTargets = [
    { roles: ['coordination'], url: '/campus/coordination' },
    { roles: ['psychology'], url: '/psicologia' },
    { roles: ['rectoria', 'admin'], url: '/rectoria' },
    { roles: ['direccion'], url: '/direccion' },
  ].map((target) => ({
    ...target,
    userIds: users
      .filter((user) => target.roles.includes(normalizeText(user.role)))
      .map((user) => user._id)
      .filter(Boolean),
  })).filter((target) => target.userIds.length > 0);

  const results = await Promise.all(notificationTargets.map((target) => queueNotificationsForParents({
    schoolId,
    parentIds: target.userIds,
    studentId: observation.studentId,
    title: `Convivencia escolar: ${observation.studentName || 'Estudiante'}`,
    body: `${observation.teacherName || 'Un docente'} registro una observacion de comportamiento en ${observation.courseTitle || 'clase'}.`,
    payload: {
      type: 'campus.discipline_observation',
      observationId: String(observation._id),
      studentId: String(observation.studentId || ''),
      courseId: String(observation.courseId || ''),
      url: target.url,
    },
  })));

  results.push(await queueStudentParentNotification({
    schoolId,
    studentId: observation.studentId,
    title: `Convivencia escolar: ${observation.studentName || 'Estudiante'}`,
    body: `${observation.teacherName || 'Un docente'} registro una observacion de comportamiento en ${observation.courseTitle || 'clase'}.`,
    payload: {
      type: 'campus.discipline_observation_parent',
      observationId: String(observation._id),
      studentId: String(observation.studentId || ''),
      courseId: String(observation.courseId || ''),
      url: buildParentPushUrl('campus.discipline_observation_parent', { studentId: observation.studentId }),
    },
  }));

  return results.reduce((summary, result) => ({
    notificationsCreated: summary.notificationsCreated + Number(result?.notificationsCreated || 0),
    tokensFound: summary.tokensFound + Number(result?.tokensFound || 0),
  }), { notificationsCreated: 0, tokensFound: 0 });
}

async function loadCampusContext(req) {
  if (!req.campusContext) {
    req.campusContext = await getCampusAccessContext(req.user);
  }

  return req.campusContext;
}

function hasMembership(campusContext, membershipType) {
  return Boolean((campusContext.memberships || []).some((membership) => membership.memberType === membershipType));
}

async function canViewDisciplineObservations(req) {
  const role = normalizeText(req.user?.role);
  if (disciplineObservationViewerRoles.includes(role)) {
    return true;
  }

  const campusContext = await loadCampusContext(req);
  return hasMembership(campusContext, 'campus_coordination');
}

async function hasAssignedTeacherCourses(user) {
  const schoolId = normalizeText(user?.schoolId);
  const teacherUserId = normalizeText(user?.userId);

  if (!schoolId || !teacherUserId || !isValidObjectId(teacherUserId)) {
    return false;
  }

  const assignedCourse = await CampusCourse.exists({ schoolId, teacherUserId, status: 'active' });
  return Boolean(assignedCourse);
}

function normalizeRequestCourseId(value) {
  if (Array.isArray(value)) {
    return normalizeText(value[0]);
  }
  return normalizeText(value);
}

function buildTeacherCourseOwnershipFilter(teacherUserId) {
  const normalizedTeacherUserId = normalizeText(teacherUserId);
  return {
    $or: [
      { teacherUserId: normalizedTeacherUserId },
      { teacherUserId: String(teacherUserId || '') },
    ],
  };
}

async function findActiveTeacherCourseByMetadata({
  schoolId,
  teacherUserId,
  sourceCourseKey = '',
  section = '',
  subject = '',
  studentGradeKey = '',
  title = '',
} = {}) {
  const normalizedSchoolId = normalizeText(schoolId);
  const normalizedTeacherUserId = normalizeText(teacherUserId);
  const normalizedSourceCourseKey = normalizeText(sourceCourseKey);
  const normalizedSection = normalizeText(section);
  const normalizedSubject = normalizeText(subject);
  const normalizedStudentGradeKey = normalizeText(studentGradeKey);
  const normalizedTitle = normalizeText(title);

  if (!normalizedSchoolId || !normalizedTeacherUserId) {
    return null;
  }

  const baseQuery = {
    schoolId: normalizedSchoolId,
    status: 'active',
    ...buildTeacherCourseOwnershipFilter(normalizedTeacherUserId),
  };

  const attempts = [
    normalizedSourceCourseKey && normalizedSubject
      ? { sourceCourseKey: normalizedSourceCourseKey, subject: normalizedSubject, ...(normalizedStudentGradeKey ? { studentGradeKey: normalizedStudentGradeKey } : {}) }
      : null,
    normalizedSubject && normalizedSection
      ? { subject: normalizedSubject, section: normalizedSection, ...(normalizedStudentGradeKey ? { studentGradeKey: normalizedStudentGradeKey } : {}) }
      : null,
    normalizedTitle
      ? { title: normalizedTitle }
      : null,
    normalizedSubject && normalizedStudentGradeKey
      ? { subject: normalizedSubject, studentGradeKey: normalizedStudentGradeKey, section: { $exists: true, $nin: ['', null] } }
      : null,
  ].filter(Boolean);

  for (const matcher of attempts) {
    const course = await CampusCourse.findOne({ ...baseQuery, ...matcher }).sort({ updatedAt: -1 });
    if (course) {
      return course;
    }
  }

  return null;
}

async function resolveTeacherAssignedCourse({
  schoolId,
  teacherUserId,
  courseId,
  sync = false,
  allowInactive = false,
  sourceCourseKey = '',
  section = '',
  subject = '',
  studentGradeKey = '',
  title = '',
} = {}) {
  const normalizedSchoolId = normalizeText(schoolId);
  const normalizedTeacherUserId = normalizeText(teacherUserId);
  const normalizedCourseId = normalizeRequestCourseId(courseId);

  if (!normalizedSchoolId || !normalizedTeacherUserId) {
    return null;
  }

  return runWithSchoolContext(normalizedSchoolId, async () => {
    if (sync) {
      try {
        await syncTeacherCoursesFromAcademicStructure({
          schoolId: normalizedSchoolId,
          teacherUserId: normalizedTeacherUserId,
        });
      } catch (error) {
        console.warn(`[CAMPUS_TEACHER_COURSE_SYNC_WARNING] teacher=${normalizedTeacherUserId} error=${error.message}`);
      }
    }

    if (normalizedCourseId && isValidObjectId(normalizedCourseId)) {
      let course = await CampusCourse.findOne({
        _id: normalizedCourseId,
        schoolId: normalizedSchoolId,
        status: 'active',
        ...buildTeacherCourseOwnershipFilter(normalizedTeacherUserId),
      });
      if (course) {
        return course;
      }

      // Connection is school-scoped; retry without schoolId field in case of legacy docs.
      course = await CampusCourse.findOne({
        _id: normalizedCourseId,
        status: 'active',
        ...buildTeacherCourseOwnershipFilter(normalizedTeacherUserId),
      });
      if (course) {
        if (normalizeText(course.schoolId) !== normalizedSchoolId) {
          course.schoolId = normalizedSchoolId;
        }
        if (String(course.teacherUserId) !== normalizedTeacherUserId) {
          course.teacherUserId = normalizedTeacherUserId;
        }
        await course.save();
        return course;
      }

      const ownedCourse = await CampusCourse.findOne({ _id: normalizedCourseId });
      if (ownedCourse && normalizeText(ownedCourse.teacherUserId) === normalizedTeacherUserId) {
        if (normalizeText(ownedCourse.status) === 'active') {
          if (normalizeText(ownedCourse.schoolId) !== normalizedSchoolId) {
            ownedCourse.schoolId = normalizedSchoolId;
          }
          if (String(ownedCourse.teacherUserId) !== normalizedTeacherUserId) {
            ownedCourse.teacherUserId = normalizedTeacherUserId;
          }
          await ownedCourse.save();
          return ownedCourse;
        }

        if (allowInactive) {
          return ownedCourse;
        }

        const replacement = await findActiveTeacherCourseByMetadata({
          schoolId: normalizedSchoolId,
          teacherUserId: normalizedTeacherUserId,
          sourceCourseKey: sourceCourseKey || ownedCourse.sourceCourseKey,
          section: section || ownedCourse.section,
          subject: subject || ownedCourse.subject,
          studentGradeKey: studentGradeKey || ownedCourse.studentGradeKey,
          title: title || ownedCourse.title,
        });
        if (replacement) {
          return replacement;
        }
      }
    }

    return findActiveTeacherCourseByMetadata({
      schoolId: normalizedSchoolId,
      teacherUserId: normalizedTeacherUserId,
      sourceCourseKey,
      section,
      subject,
      studentGradeKey,
      title,
    });
  });
}

function readTeacherCourseLookupFromRequest(req = {}) {
  const body = req.body || {};
  return {
    courseId: normalizeRequestCourseId(body.courseId || req.query?.courseId || req.headers?.['x-course-id']),
    sourceCourseKey: normalizeText(body.sourceCourseKey || req.query?.sourceCourseKey),
    section: normalizeText(body.section || req.query?.section),
    subject: normalizeText(body.subject || req.query?.subject),
    studentGradeKey: normalizeText(body.studentGradeKey || req.query?.studentGradeKey),
    title: normalizeText(body.courseTitle || body.title || req.query?.courseTitle),
  };
}

async function requireCampusTeacherAccess(req, res, next) {
  try {
    const role = normalizeText(req.user?.role);
    const hasLegacyTeacherModuleAccess = ['teacher', 'admin', 'rectoria', 'direccion'].includes(role);

    if (hasLegacyTeacherModuleAccess) {
      return next();
    }

    if (await hasAssignedTeacherCourses(req.user)) {
      return next();
    }

    const campusContext = await loadCampusContext(req);

    if (!hasMembership(campusContext, 'campus_teacher')) {
      return res.status(403).json({ message: 'Campus Docente no esta habilitado para este usuario.' });
    }

    return next();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function requireCampusCoordinationAccess(req, res, next) {
  try {
    const campusContext = await loadCampusContext(req);
    const role = normalizeText(req.user.role);
    const isLegacyAdmin = ['admin', 'rectoria', 'direccion'].includes(role);
    const isAcademicCoordination = role === 'coordination' && Boolean(normalizeText(req.user?.coordinationScope));
    const hasCoordinationMembership = hasMembership(campusContext, 'campus_coordination');

    if (isAcademicCoordination) {
      return next();
    }

    if ((!campusContext.enabled && !isLegacyAdmin) || (!isLegacyAdmin && !hasCoordinationMembership)) {
      return res.status(403).json({ message: 'Campus Coordinacion no esta habilitado para este usuario.' });
    }

    return next();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function buildTeacherCourseDetail({ schoolId, teacherUserId, course, gradingScale = null, academicStructure = null }) {
  return runWithSchoolContext(schoolId, async () => {
    const structure = academicStructure || await AcademicStructure.findOne({ schoolId }).select('gradeSchedules grades subjects').lean();
    const resolvedClassSessions = resolveTeacherCourseClassSessionsFromStructure(structure, teacherUserId, course);
    const courseForSerialization = resolvedClassSessions.length > 0
      && (!Array.isArray(course?.classSessions) || course.classSessions.length === 0)
      ? { ...course, classSessions: resolvedClassSessions }
      : course;
    const normalizedCourse = serializeCourse(courseForSerialization, { gradingScale });
    const academicPeriods = Array.isArray(normalizedCourse.academicPeriods) ? normalizedCourse.academicPeriods : [];
    let students = await Student.find(buildTeacherCourseRosterQuery({ schoolId, course }))
      .select('name schoolCode grade course status')
      .sort({ name: 1 })
      .lean();

    if (students.length === 0 && getCourseSectionAliases(course).length > 0) {
      const gradeConditions = buildFieldMatchConditions('grade', getCourseGradeAliases(course));
      if (gradeConditions.length > 0) {
        students = await Student.find({
          schoolId,
          deletedAt: null,
          status: 'active',
          $and: [
            { $or: gradeConditions },
            { $or: [{ course: '' }, { course: null }, { course: { $exists: false } }] },
          ],
        })
          .select('name schoolCode grade course status')
          .sort({ name: 1 })
          .lean();
      }
    }

    const studentIds = students.map((student) => student._id);
    const gradeEntries = studentIds.length > 0
      ? await CampusGradeEntry.find({
        schoolId,
        courseId: course._id,
        studentId: { $in: studentIds },
      }).lean()
      : [];

    const studentRows = buildCourseStudentRows(students, academicPeriods, gradeEntries);

    return {
      course: normalizedCourse,
      students: studentRows,
    };
  });
}

function normalizeCampusGradingScale(rawScale = {}) {
  const defaultPerformanceLevels = [
    { key: 'deficiente', label: 'Deficiente', minScore: 0, maxScore: 59, order: 10 },
    { key: 'insuficiente', label: 'Insuficiente', minScore: 60, maxScore: 69, order: 20 },
    { key: 'aceptable', label: 'Aceptable', minScore: 70, maxScore: 79, order: 30 },
    { key: 'bueno', label: 'Bueno', minScore: 80, maxScore: 89, order: 40 },
    { key: 'sobresaliente', label: 'Sobresaliente', minScore: 90, maxScore: 95, order: 50 },
    { key: 'excelente', label: 'Excelente', minScore: 96, maxScore: 100, order: 60 },
  ];
  const defaultScale = { minScore: 0, maxScore: 100, passingScore: 70, performanceLevels: defaultPerformanceLevels };
  const hasPerformanceLevels = Array.isArray(rawScale?.performanceLevels) && rawScale.performanceLevels.length > 0;
  const shouldUseDefaultScale = !rawScale || Object.keys(rawScale).length === 0 || (!hasPerformanceLevels && Number(rawScale?.maxScore ?? 100) <= 5 && Number(rawScale?.passingScore ?? 70) <= 3);
  const sourceScale = shouldUseDefaultScale ? defaultScale : rawScale;
  const minScore = Number(sourceScale?.minScore ?? defaultScale.minScore);
  const maxScore = Number(sourceScale?.maxScore ?? defaultScale.maxScore);
  const passingScore = Number(sourceScale?.passingScore ?? defaultScale.passingScore);
  if (!Number.isFinite(minScore) || !Number.isFinite(maxScore) || !Number.isFinite(passingScore) || maxScore <= minScore || passingScore < minScore || passingScore > maxScore) {
    return defaultScale;
  }
  const performanceLevels = (Array.isArray(sourceScale?.performanceLevels) ? sourceScale.performanceLevels : defaultPerformanceLevels)
    .map((level) => ({
      key: normalizeText(level?.key),
      label: normalizeText(level?.label),
      minScore: Number(level?.minScore),
      maxScore: Number(level?.maxScore),
      order: Number(level?.order || 0),
    }))
    .filter((level) => level.key && level.label && Number.isFinite(level.minScore) && Number.isFinite(level.maxScore));
  return { minScore, maxScore, passingScore, performanceLevels };
}

const campusAttendanceTypeLabels = {
  guidance_routine: 'Rutina de orientacion',
  subject_class: 'Clase por materia',
};

const campusAttendanceStatusLabels = {
  present: 'Presente',
  late: 'Tarde',
  absent: 'Ausente',
  excused: 'Excusado',
};

function normalizeCampusAttendanceType(value) {
  const normalizedValue = normalizeText(value);
  return ['guidance_routine', 'subject_class'].includes(normalizedValue) ? normalizedValue : 'subject_class';
}

function normalizeCampusAttendanceStatus(value) {
  const normalizedValue = normalizeText(value);
  return ['present', 'late', 'absent', 'excused'].includes(normalizedValue) ? normalizedValue : 'present';
}

function buildAttendanceSessionQuery({ schoolId, teacherUserId, courseId, attendanceType, date, classSessionKey = '' }) {
  return {
    schoolId,
    teacherUserId,
    courseId,
    attendanceType: normalizeCampusAttendanceType(attendanceType),
    date: normalizeDateString(date),
    classSessionKey: normalizeText(classSessionKey),
  };
}

function buildAttendanceRecordsForRoster(students = [], session = null) {
  const existingRecordsByStudentId = new Map((Array.isArray(session?.records) ? session.records : [])
    .map((record) => [String(record.studentId), record]));

  return students.map((student) => {
    const studentId = String(student.studentId || student._id || '');
    const existingRecord = existingRecordsByStudentId.get(studentId);
    return {
      studentId,
      studentName: normalizeText(student.name || student.studentNameSnapshot),
      schoolCode: normalizeText(student.schoolCode || student.studentCodeSnapshot),
      grade: normalizeText(student.grade),
      status: normalizeCampusAttendanceStatus(existingRecord?.status),
      statusLabel: campusAttendanceStatusLabels[normalizeCampusAttendanceStatus(existingRecord?.status)],
      notes: normalizeText(existingRecord?.notes),
      recordedAt: existingRecord?.recordedAt || null,
    };
  });
}

function serializeAttendanceSession(session, { course, students = [], attendanceType, date, classSessionKey = '' } = {}) {
  const normalizedType = normalizeCampusAttendanceType(session?.attendanceType || attendanceType);
  const normalizedDate = normalizeDateString(session?.date || date);
  const normalizedClassSessionKey = normalizeText(session?.classSessionKey || classSessionKey);
  const records = buildAttendanceRecordsForRoster(students, session);
  const summary = records.reduce((accumulator, record) => {
    accumulator[record.status] = Number(accumulator[record.status] || 0) + 1;
    return accumulator;
  }, { present: 0, late: 0, absent: 0, excused: 0 });

  return {
    id: session?._id ? String(session._id) : '',
    attendanceType: normalizedType,
    attendanceTypeLabel: campusAttendanceTypeLabels[normalizedType],
    date: normalizedDate,
    classSessionKey: normalizedClassSessionKey,
    submittedAt: session?.submittedAt || null,
    updatedAt: session?.updatedAt || null,
    course: course ? serializeCourse(course) : null,
    summary: {
      total: records.length,
      present: summary.present || 0,
      late: summary.late || 0,
      absent: summary.absent || 0,
      excused: summary.excused || 0,
    },
    records,
  };
}

async function loadCampusGradingContext(schoolId) {
  const academicStructure = await AcademicStructure.findOne({ schoolId }).select('gradingScale gradingScalesByLevel grades levels').lean();
  const defaultScale = normalizeCampusGradingScale(academicStructure?.gradingScale || {});
  const gradeLevelKeys = new Map((Array.isArray(academicStructure?.grades) ? academicStructure.grades : [])
    .map((grade) => [normalizeText(grade?.key || grade?.label), normalizeText(grade?.levelKey)]));
  const gradingScalesByLevel = new Map((Array.isArray(academicStructure?.gradingScalesByLevel) ? academicStructure.gradingScalesByLevel : [])
    .map((scale) => [normalizeText(scale?.levelKey), normalizeCampusGradingScale(scale)])
    .filter(([levelKey]) => levelKey));

  return { defaultScale, gradeLevelKeys, gradingScalesByLevel };
}

function resolveCampusGradingScaleForCourse(gradingContext, course) {
  const defaultScale = normalizeCampusGradingScale(gradingContext?.defaultScale || {});
  const gradeKey = normalizeText(course?.studentGradeKey);
  const levelKey = gradingContext?.gradeLevelKeys instanceof Map ? gradingContext.gradeLevelKeys.get(gradeKey) : '';
  return (gradingContext?.gradingScalesByLevel instanceof Map && levelKey && gradingContext.gradingScalesByLevel.get(levelKey)) || defaultScale;
}

function buildTeacherOverviewCourseCards({
  teacherUserId,
  courses,
  academicStructure,
  gradingContext,
  postsByCourseId,
  gradeEntryCountByCourseId,
  gradeEntriesByCourseId = new Map(),
  schoolStudents,
}) {
  return courses.map((course) => {
    const courseGradingScale = resolveCampusGradingScaleForCourse(gradingContext, course);
    const resolvedClassSessions = resolveCourseClassSessionsFromGradeSchedules(academicStructure, teacherUserId, course);
    const courseForSerialization = resolvedClassSessions.length > 0
      && (!Array.isArray(course.classSessions) || course.classSessions.length === 0)
      ? { ...course, classSessions: resolvedClassSessions }
      : course;
    const normalizedCourse = serializeCourse(courseForSerialization, { gradingScale: courseGradingScale });
    const courseId = String(course._id);
    const rosterStudents = schoolStudents.filter((student) => studentBelongsToCourse(student, course));
    const academicPeriods = getCourseAcademicPeriods(courseForSerialization);
    const studentRows = buildCourseStudentRows(
      rosterStudents,
      academicPeriods,
      gradeEntriesByCourseId.get(courseId) || []
    );

    return {
      ...normalizedCourse,
      stats: buildCourseCardStats({
        courseDetail: { students: studentRows },
        posts: postsByCourseId.get(courseId) || [],
        gradingScale: courseGradingScale,
        hasGradeEntries: Number(gradeEntryCountByCourseId.get(courseId) || 0) > 0,
        academicPeriods,
      }),
    };
  });
}

function normalizeAssignmentMatchKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAssignmentTitleForMatch(value) {
  return normalizeAssignmentMatchKey(
    String(value || '')
      .replace(/^(tarea|quiz|quices|examen|proyecto|exposicion|laboratorio|material|aviso)\s*[-–:]\s*/i, '')
  );
}

function buildGradebookAssignmentOptions(periods) {
  return (Array.isArray(periods) ? periods : []).flatMap((period) => (
    (period.gradingComponents || []).flatMap((component) => (
      (component.subcomponents || []).map((subcomponent) => ({
        key: [period.key, component.key, subcomponent.key].map((part) => normalizeText(part)).join('::'),
        periodKey: period.key,
        componentKey: component.key,
        subcomponentKey: subcomponent.key,
        subcomponentName: subcomponent.name,
        label: `${subcomponent.name || 'Asignacion sin nombre'} · ${component.name || 'Componente'}`,
      }))
    ))
  ));
}

function resolveGradebookAssignmentForPostTitle(title, periods) {
  const options = buildGradebookAssignmentOptions(periods);
  if (!options.length) {
    return null;
  }

  const normalizedTitle = normalizeAssignmentMatchKey(title);
  const strippedTitle = normalizeAssignmentTitleForMatch(title);

  const exactMatch = options.find((option) => {
    const subcomponentName = normalizeAssignmentMatchKey(option.subcomponentName);
    const strippedSubcomponent = normalizeAssignmentTitleForMatch(option.subcomponentName);
    return subcomponentName === normalizedTitle
      || strippedSubcomponent === strippedTitle
      || normalizeAssignmentMatchKey(option.label) === normalizedTitle;
  });
  if (exactMatch) {
    return exactMatch;
  }

  const partialMatch = options.find((option) => {
    const subcomponentName = normalizeAssignmentMatchKey(option.subcomponentName);
    return subcomponentName && (normalizedTitle.includes(subcomponentName) || subcomponentName.includes(strippedTitle));
  });

  return partialMatch || null;
}

function countStudentsGradedForAssignment(students, assignment) {
  const roster = Array.isArray(students) ? students : [];
  if (!assignment || roster.length === 0) {
    return { gradedCount: 0, totalCount: roster.length };
  }

  const periodKey = normalizeText(assignment.periodKey);
  const componentKey = normalizeText(assignment.componentKey);
  const subcomponentKey = normalizeText(assignment.subcomponentKey);

  let gradedCount = 0;
  roster.forEach((student) => {
    const period = (student.periods || []).find((entry) => normalizeText(entry.key || entry.periodKey) === periodKey);
    const component = (period?.scores || []).find((entry) => normalizeText(entry.componentKey) === componentKey);
    const subcomponent = (component?.subcomponents || []).find((entry) => normalizeText(entry.subcomponentKey) === subcomponentKey);
    if (hasFiniteScore(subcomponent?.score)) {
      gradedCount += 1;
    }
  });

  return { gradedCount, totalCount: roster.length };
}

function isPostPendingGrading(post, academicPeriods, students) {
  if (!isEvaluativePostType(post?.type) || normalizeText(post?.status) === 'archived') {
    return false;
  }

  const roster = Array.isArray(students) ? students : [];
  if (roster.length === 0) {
    return false;
  }

  const assignment = resolveGradebookAssignmentForPostTitle(post?.title, academicPeriods);
  if (!assignment) {
    return true;
  }

  const { gradedCount, totalCount } = countStudentsGradedForAssignment(roster, assignment);
  return gradedCount < totalCount;
}

function getPendingGradingPosts(posts, academicPeriods, students) {
  return (Array.isArray(posts) ? posts : []).filter((post) => isPostPendingGrading(post, academicPeriods, students));
}

function buildCourseCardStats({ courseDetail, posts, gradingScale = { passingScore: 70 }, hasGradeEntries = null, academicPeriods = [] }) {
  const passingScore = Number(gradingScale?.passingScore ?? 70);
  const students = Array.isArray(courseDetail?.students) ? courseDetail.students : [];
  // Prefer students with a computed finalScore. Do not wipe them when hasGradeEntries
  // is false/stale — that hid migrated notes after moving entries onto section courses.
  const evaluatedStudents = students.filter((student) => hasFiniteScore(student.finalScore));
  const averageScore = evaluatedStudents.length > 0
    ? Number((evaluatedStudents.reduce((total, student) => total + Number(parseFiniteScore(student.finalScore) || 0), 0) / evaluatedStudents.length).toFixed(2))
    : null;
  const atRiskStudents = students
    .filter((student) => {
      const finalScore = parseFiniteScore(student.finalScore);
      return finalScore !== null && finalScore < passingScore;
    })
    .map((student) => ({
      studentId: student.studentId,
      name: normalizeText(student.name),
      schoolCode: normalizeText(student.schoolCode),
      grade: normalizeText(student.grade),
      finalScore: parseFiniteScore(student.finalScore),
    }))
    .sort((left, right) => left.finalScore - right.finalScore || left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }));
  const scoreCoverageEntries = students.flatMap((student) => (student.periods || []).flatMap((period) => period.scores || []));
  const gradedEntriesCount = scoreCoverageEntries.filter((score) => score.score !== null && score.score !== undefined && score.score !== '').length;

  const pendingGradingPosts = getPendingGradingPosts(posts, academicPeriods, students);

  return {
    studentCount: students.length,
    studentIds: students.map((student) => normalizeText(student.studentId)).filter(Boolean),
    evaluatedStudents: evaluatedStudents.map((student) => ({
      studentId: normalizeText(student.studentId),
      name: normalizeText(student.name),
      schoolCode: normalizeText(student.schoolCode),
      grade: normalizeText(student.grade),
      course: normalizeText(student.course),
      finalScore: parseFiniteScore(student.finalScore),
    })).filter((student) => student.studentId && hasFiniteScore(student.finalScore)),
    evaluatedStudentCount: evaluatedStudents.length,
    averageScore,
    atRiskCount: atRiskStudents.length,
    passingScore,
    atRiskStudents: atRiskStudents.slice(0, 8),
    gradingCoverageRate: scoreCoverageEntries.length > 0 ? Number(((gradedEntriesCount / scoreCoverageEntries.length) * 100).toFixed(1)) : null,
    pendingGradingCount: pendingGradingPosts.length,
    pendingGradingPostIds: pendingGradingPosts.map((post) => String(post._id || post.id || '')).filter(Boolean),
  };
}

router.get('/me', async (req, res) => {
  try {
    const campusContext = await loadCampusContext(req);
    return res.status(200).json(campusContext);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/navigation', async (req, res) => {
  try {
    const campusContext = await loadCampusContext(req);
    return res.status(200).json({
      enabled: campusContext.enabled,
      reason: campusContext.reason,
      defaultPath: campusContext.defaultPath,
      navigation: campusContext.navigation,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

function buildEmptyCourseStats() {
  return {
    studentCount: 0,
    studentIds: [],
    evaluatedStudents: [],
    evaluatedStudentCount: 0,
    averageScore: null,
    atRiskCount: 0,
    atRiskStudents: [],
    pendingGradingCount: 0,
    pendingGradingPostIds: [],
    gradingCoverageRate: null,
  };
}

async function loadStudentsForTeacherCourses(schoolId, courses) {
  const studentMap = new Map();
  if (!Array.isArray(courses) || courses.length === 0) {
    return [];
  }

  const rosterResults = await Promise.all(
    courses.map((course) => Student.find(buildTeacherCourseRosterQuery({ schoolId, course }))
      .select('_id name schoolCode grade course status')
      .lean())
  );

  rosterResults.flat().forEach((student) => {
    studentMap.set(String(student._id), student);
  });

  return Array.from(studentMap.values());
}

function enrichTeacherOverviewCourses(academicStructure, teacherUserId, courses) {
  return courses.map((course) => {
    const resolvedClassSessions = resolveCourseClassSessionsFromGradeSchedules(academicStructure, teacherUserId, course);
    if (resolvedClassSessions.length > 0 && (!Array.isArray(course.classSessions) || course.classSessions.length === 0)) {
      return { ...course, classSessions: resolvedClassSessions };
    }
    return course;
  });
}

async function buildTeacherOverviewShell({ schoolId, userId, name, username }) {
  await syncTeacherCoursesFromAcademicStructure({ schoolId, teacherUserId: userId });

  const academicStructure = await AcademicStructure.findOne({ schoolId }).select('gradeSchedules grades subjects').lean();
  const [teacherUser, courses, recentPosts, gradingContext] = await Promise.all([
    User.findOne({ _id: userId, schoolId })
      .select('_id name username campusPhotoUrl campusPhotoThumbUrl')
      .lean(),
    CampusCourse.find({ schoolId, teacherUserId: userId, status: 'active' })
      .sort({ gradeLevel: 1, section: 1, subject: 1, updatedAt: -1 })
      .lean(),
    CampusPost.find({ schoolId, teacherUserId: userId })
      .populate('courseId', 'title')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(12)
      .lean(),
    loadCampusGradingContext(schoolId),
  ]);

  const overviewCourses = selectTeacherOverviewCourses(courses, new Map(), new Map());
  const enrichedOverviewCourses = enrichTeacherOverviewCourses(academicStructure, userId, overviewCourses);
  const normalizedCourses = enrichedOverviewCourses.map((course) => {
    const courseGradingScale = resolveCampusGradingScaleForCourse(gradingContext, course);
    return {
      ...serializeCourse(course, { gradingScale: courseGradingScale }),
      stats: buildEmptyCourseStats(),
    };
  });
  const normalizedRecentPosts = serializeArray(recentPosts, serializePost);

  return {
    teacher: serializeTeacherProfile(teacherUser, { userId, name, username }),
    summary: {
      totalCourses: normalizedCourses.length,
      activeCourses: normalizedCourses.filter((course) => course.status === 'active').length,
      publishedPosts: normalizedRecentPosts.filter((post) => post.status === 'published').length,
      activeAssignments: normalizedRecentPosts.filter((post) => isEvaluativePostType(post.type) && post.status !== 'archived').length,
    },
    courses: normalizedCourses,
    gradingScale: gradingContext.defaultScale,
    weeklySchedule: buildTeacherWeeklySchedule(enrichedOverviewCourses),
    recentPosts: normalizedRecentPosts,
  };
}

async function buildTeacherOverviewMetrics({ schoolId, userId }) {
  const academicStructure = await AcademicStructure.findOne({ schoolId }).select('gradeSchedules grades subjects').lean();
  const gradingContext = await loadCampusGradingContext(schoolId);
  const courses = await CampusCourse.find({ schoolId, teacherUserId: userId, status: 'active' })
    .sort({ gradeLevel: 1, section: 1, subject: 1, updatedAt: -1 })
    .lean();

  const [allCoursePosts, schoolStudents] = await Promise.all([
    CampusPost.find({ schoolId, teacherUserId: userId })
      .select('courseId type status title')
      .lean(),
    loadStudentsForTeacherCourses(schoolId, courses),
  ]);

  const postsByCourseId = new Map();
  for (const post of allCoursePosts) {
    const courseId = String(post.courseId || '');
    if (!courseId) {
      continue;
    }

    const coursePosts = postsByCourseId.get(courseId) || [];
    coursePosts.push(post);
    postsByCourseId.set(courseId, coursePosts);
  }

  const gradeEntryCountByCourseId = new Map();
  const gradeEntryCounts = courses.length > 0
    ? await CampusGradeEntry.aggregate([
      {
        $match: {
          schoolId,
          teacherUserId: userId,
          courseId: { $in: courses.map((course) => course._id) },
        },
      },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ])
    : [];

  gradeEntryCounts.forEach((item) => {
    gradeEntryCountByCourseId.set(String(item._id), Number(item.count || 0));
  });

  const allGradeEntries = courses.length > 0
    ? await CampusGradeEntry.find({
      schoolId,
      teacherUserId: userId,
      courseId: { $in: courses.map((course) => course._id) },
    }).lean()
    : [];
  const gradeEntriesByCourseId = new Map();
  allGradeEntries.forEach((entry) => {
    const courseId = String(entry.courseId || '');
    if (!courseId) {
      return;
    }

    const courseEntries = gradeEntriesByCourseId.get(courseId) || [];
    courseEntries.push(entry);
    gradeEntriesByCourseId.set(courseId, courseEntries);
  });

  const overviewCourses = selectTeacherOverviewCourses(courses, postsByCourseId, gradeEntryCountByCourseId);
  const enrichedOverviewCourses = enrichTeacherOverviewCourses(academicStructure, userId, overviewCourses);
  const normalizedCourses = buildTeacherOverviewCourseCards({
    teacherUserId: userId,
    courses: enrichedOverviewCourses,
    academicStructure,
    gradingContext,
    postsByCourseId,
    gradeEntryCountByCourseId,
    gradeEntriesByCourseId,
    schoolStudents,
  });

  return {
    courses: normalizedCourses.map((course) => ({
      id: course.id,
      stats: course.stats,
    })),
  };
}

async function buildTeacherOverviewFull({ schoolId, userId, name, username }) {
  const shell = await buildTeacherOverviewShell({ schoolId, userId, name, username });
  const metrics = await buildTeacherOverviewMetrics({ schoolId, userId });
  const statsByCourseId = new Map((metrics.courses || []).map((course) => [course.id, course.stats]));

  return {
    ...shell,
    courses: (shell.courses || []).map((course) => ({
      ...course,
      stats: statsByCourseId.get(course.id) || course.stats,
    })),
  };
}

router.get('/teacher/overview', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId, name, username } = req.user;
    const payload = await buildTeacherOverviewFull({ schoolId, userId, name, username });
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/overview/shell', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId, name, username } = req.user;
    const payload = await buildTeacherOverviewShell({ schoolId, userId, name, username });
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/overview/metrics', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const payload = await buildTeacherOverviewMetrics({ schoolId, userId });
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/calendar', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { monthStart, monthEnd, monthKey } = getMonthRange(req.query.month);

    const posts = await CampusPost.find({
      schoolId,
      teacherUserId: userId,
      status: 'published',
      $or: [
        { dueAt: { $gte: monthStart, $lt: monthEnd } },
        { scheduledClassDate: { $gte: monthStart, $lt: monthEnd } },
        { dueAt: null, scheduledClassDate: null, publishedAt: { $gte: monthStart, $lt: monthEnd } },
      ],
    })
      .populate('courseId', 'title subject section studentGradeKey')
      .sort({ dueAt: 1, scheduledClassDate: 1, publishedAt: 1, createdAt: 1 })
      .lean();

    const items = posts
      .filter((post) => isEvaluativePostType(post.type))
      .map(serializeTeacherCalendarPost)
      .filter((item) => {
        if (!item.id || !item.date) {
          return false;
        }

        const itemDate = new Date(item.date);
        return !Number.isNaN(itemDate.getTime()) && itemDate >= monthStart && itemDate < monthEnd;
      })
      .sort((left, right) => new Date(left.date) - new Date(right.date));

    return res.status(200).json({
      month: monthKey,
      items,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/profile-photo', requireCampusTeacherAccess, (req, res) => {
  uploadTeacherProfilePhoto(req, res, async (error) => {
    if (error) {
      const statusCode = error?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(statusCode).json({
        message: error.message || 'No se pudo procesar la foto del docente.',
      });
    }

    try {
      const { schoolId, userId, name, username } = req.user;

      if (!req.file) {
        return res.status(400).json({ message: 'Selecciona una imagen para la foto de perfil.' });
      }

      return await runWithSchoolContext(schoolId, async () => {
        let teacherUser = await User.findOne({ _id: userId, schoolId });
        if (!teacherUser) {
          teacherUser = await User.findOne({ _id: userId });
        }

        if (!teacherUser) {
          return res.status(404).json({ message: 'Docente no encontrado.' });
        }

        const cloudinaryEnabled = isCloudinaryEnabled();
        const saved = await processAndStoreUploadedImage({
          file: req.file,
          folder: 'campus-teachers',
          preferredName: req.body?.preferredName || teacherUser.name || name || username || req.file?.originalname,
          requireCloudinary: cloudinaryEnabled,
        });

        if (cloudinaryEnabled && saved.storage !== 'cloudinary') {
          return res.status(503).json({
            message: 'La foto del docente solo se puede guardar en Cloudinary.',
          });
        }

        teacherUser.campusPhotoUrl = normalizeStoredImageUrl(saved.url);
        teacherUser.campusPhotoThumbUrl = normalizeStoredImageUrl(saved.thumbUrl);
        await teacherUser.save();

        return res.status(200).json({
          teacher: serializeTeacherProfile(teacherUser),
        });
      });
    } catch (processingError) {
      return res.status(400).json({
        message: processingError.message || 'No se pudo guardar la foto del docente.',
      });
    }
  });
});

router.get('/teacher/courses/:id', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid course id' });
    }

    const course = await resolveTeacherAssignedCourse({
      schoolId,
      teacherUserId: userId,
      courseId: id,
      sync: true,
      allowInactive: true,
    });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const gradingContext = await loadCampusGradingContext(schoolId);
    const courseGradingScale = resolveCampusGradingScaleForCourse(gradingContext, course);
    const academicStructure = await AcademicStructure.findOne({ schoolId }).select('gradeSchedules grades subjects').lean();
    const [detail, posts] = await Promise.all([
      buildTeacherCourseDetail({ schoolId, teacherUserId: userId, course, gradingScale: courseGradingScale, academicStructure }),
      CampusPost.find({ schoolId, teacherUserId: userId, courseId: course._id })
        .populate('courseId', 'title')
        .sort({ dueAt: 1, scheduledClassDate: 1, createdAt: -1 })
        .lean(),
    ]);

    return res.status(200).json({
      ...detail,
      posts: serializeArray(posts, serializePost),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/attendance', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const courseId = normalizeText(req.query?.courseId);
    const attendanceType = normalizeCampusAttendanceType(req.query?.attendanceType);
    const date = normalizeDateString(req.query?.date || new Date().toISOString());
    const classSessionKey = attendanceType === 'subject_class' ? normalizeText(req.query?.classSessionKey) : '';

    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ message: 'Selecciona un curso valido para tomar asistencia.' });
    }

    if (!date) {
      return res.status(400).json({ message: 'Selecciona una fecha valida.' });
    }

    const course = await resolveTeacherAssignedCourse({
      schoolId,
      teacherUserId: userId,
      courseId,
      sync: true,
    });
    if (!course) {
      return res.status(404).json({ message: 'Curso no encontrado.' });
    }

    const detail = await buildTeacherCourseDetail({ schoolId, teacherUserId: userId, course });
    const session = await CampusAttendanceSession.findOne(buildAttendanceSessionQuery({
      schoolId,
      teacherUserId: userId,
      courseId: course._id,
      attendanceType,
      date,
      classSessionKey,
    })).lean();

    return res.status(200).json({
      attendance: serializeAttendanceSession(session, {
        course,
        students: detail.students,
        attendanceType,
        date,
        classSessionKey,
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/attendance', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const courseId = normalizeText(req.body?.courseId);
    const attendanceType = normalizeCampusAttendanceType(req.body?.attendanceType);
    const date = normalizeDateString(req.body?.date || new Date().toISOString());
    const classSessionKey = attendanceType === 'subject_class' ? normalizeText(req.body?.classSessionKey) : '';
    const incomingRecords = Array.isArray(req.body?.records) ? req.body.records : [];

    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ message: 'Selecciona un curso valido para tomar asistencia.' });
    }

    if (!date) {
      return res.status(400).json({ message: 'Selecciona una fecha valida.' });
    }

    const course = await resolveTeacherAssignedCourse({
      schoolId,
      teacherUserId: userId,
      courseId,
      sync: true,
    });
    if (!course) {
      return res.status(404).json({ message: 'Curso no encontrado.' });
    }

    const detail = await buildTeacherCourseDetail({ schoolId, teacherUserId: userId, course });
    const rosterByStudentId = new Map((detail.students || []).map((student) => [String(student.studentId), student]));
    const incomingRecordsByStudentId = new Map();

    for (const record of incomingRecords) {
      const studentId = normalizeText(record?.studentId);
      if (!studentId || !rosterByStudentId.has(studentId)) {
        return res.status(400).json({ message: 'La asistencia contiene un estudiante que no pertenece al curso seleccionado.' });
      }
      incomingRecordsByStudentId.set(studentId, record);
    }

    const records = (detail.students || []).map((student) => {
      const incomingRecord = incomingRecordsByStudentId.get(String(student.studentId)) || {};
      return {
        studentId: student.studentId,
        studentNameSnapshot: normalizeText(student.name),
        studentCodeSnapshot: normalizeText(student.schoolCode),
        status: normalizeCampusAttendanceStatus(incomingRecord.status),
        notes: normalizeText(incomingRecord.notes).slice(0, 500),
        recordedAt: new Date(),
      };
    });

    const sessionQuery = buildAttendanceSessionQuery({
      schoolId,
      teacherUserId: userId,
      courseId: course._id,
      attendanceType,
      date,
      classSessionKey,
    });

    const session = await CampusAttendanceSession.findOneAndUpdate(
      sessionQuery,
      {
        $set: {
          ...sessionQuery,
          courseTitleSnapshot: normalizeText(course.title),
          subjectSnapshot: normalizeText(course.subject),
          gradeSnapshot: normalizeText(course.studentGradeKey || course.gradeLevel),
          records,
          submittedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    notifyAttendanceSessionSubmitted({ schoolId, course, session })
      .catch((error) => console.warn(`[CAMPUS_ATTENDANCE_NOTIFY_WARNING] session=${session._id} error=${error.message}`));

    return res.status(200).json({
      attendance: serializeAttendanceSession(session, {
        course,
        students: detail.students,
        attendanceType,
        date,
        classSessionKey,
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/teacher/courses/:id/grading-scheme', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid course id' });
    }

    const course = await CampusCourse.findOne({ _id: id, schoolId, teacherUserId: userId });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const allowIncompleteWeights = req.body.allowIncompleteWeights === true;
    const academicPeriodsResult = normalizeAcademicPeriods(req.body.academicPeriods, {
      fallbackGradingComponents: req.body.gradingComponents,
      allowIncompleteWeights,
    });
    if (!academicPeriodsResult.ok) {
      return res.status(400).json({ message: academicPeriodsResult.message });
    }

    course.academicPeriods = academicPeriodsResult.periods;
    course.gradingComponents = academicPeriodsResult.periods[0]?.gradingComponents || [];
    await course.save();

    const gradingContext = await loadCampusGradingContext(schoolId);
    const detail = await buildTeacherCourseDetail({
      schoolId,
      teacherUserId: userId,
      course,
      gradingScale: resolveCampusGradingScaleForCourse(gradingContext, course),
    });
    return res.status(200).json(detail);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/teacher/courses/:id/academic-content', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid course id' });
    }

    const course = await CampusCourse.findOne({ _id: id, schoolId, teacherUserId: userId });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const academicContent = normalizeAcademicContentPayload(req.body.academicContent, course);
    course.academicContent = academicContent;
    await course.save();

    const gradeScopeQuery = buildAcademicContentGradeScopeQuery({ schoolId, course });
    if (gradeScopeQuery) {
      await CampusCourse.updateMany(
        {
          ...gradeScopeQuery,
          _id: { $ne: course._id },
        },
        { $set: { academicContent } }
      );
    }

    const gradingContext = await loadCampusGradingContext(schoolId);
    const detail = await buildTeacherCourseDetail({
      schoolId,
      teacherUserId: userId,
      course,
      gradingScale: resolveCampusGradingScaleForCourse(gradingContext, course),
    });
    return res.status(200).json(detail);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/teacher/courses/:id/class-schedule', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid course id' });
    }

    const course = await CampusCourse.findOne({ _id: id, schoolId, teacherUserId: userId });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    return res.status(403).json({ message: 'El horario del curso lo configura coordinacion academica.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/courses/:courseId/students/:studentId/grades', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { courseId, studentId } = req.params;
    const incomingGrades = Array.isArray(req.body.grades) ? req.body.grades : [];

    if (!isValidObjectId(courseId) || !isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'Invalid course or student id' });
    }

    if (incomingGrades.length === 0) {
      return res.status(400).json({ message: 'grades is required' });
    }

    const course = await CampusCourse.findOne({ _id: courseId, schoolId, teacherUserId: userId });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null, status: 'active' }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!studentBelongsToCourse(student, course)) {
      return res.status(400).json({ message: 'Student does not belong to this assigned course' });
    }

    const gradingContext = await loadCampusGradingContext(schoolId);
    const gradingScale = resolveCampusGradingScaleForCourse(gradingContext, course);
    const allowedComponents = new Map();
    for (const period of getCourseAcademicPeriods(course)) {
      for (const component of period.gradingComponents || []) {
        allowedComponents.set(`${normalizeText(period.key)}:${normalizeText(component.key)}`, {
          periodKey: normalizeText(period.key),
          componentKey: normalizeText(component.key),
          subcomponents: Array.isArray(component.subcomponents)
            ? component.subcomponents.map((subcomponent) => ({ key: normalizeText(subcomponent.key) }))
            : [],
        });
      }
    }
    const normalizedGrades = [];

    for (const gradeItem of incomingGrades) {
      const academicPeriodKey = normalizeText(gradeItem?.academicPeriodKey) || normalizeText(getCourseAcademicPeriods(course)[0]?.key) || 'period_1';
      const componentKey = normalizeText(gradeItem?.componentKey);
      const subcomponentKey = normalizeText(gradeItem?.subcomponentKey);
      const score = Number(gradeItem?.score);
      const feedback = normalizeText(gradeItem?.feedback);
      const allowedComponent = allowedComponents.get(`${academicPeriodKey}:${componentKey}`);

      if (!allowedComponent) {
        return res.status(400).json({ message: `Invalid component ${componentKey || 'unknown'}` });
      }

      if ((allowedComponent.subcomponents || []).length > 0) {
        if (!subcomponentKey) {
          return res.status(400).json({ message: `Component ${componentKey} requires a valid subcomponent` });
        }

        if (!(allowedComponent.subcomponents || []).some((subcomponent) => subcomponent.key === subcomponentKey)) {
          return res.status(400).json({ message: `Invalid subcomponent ${subcomponentKey}` });
        }
      } else if (subcomponentKey) {
        return res.status(400).json({ message: `Component ${componentKey} does not accept subcomponent grades` });
      }

      if (!Number.isFinite(score) || score < gradingScale.minScore || score > gradingScale.maxScore) {
        return res.status(400).json({ message: `Each score must be between ${gradingScale.minScore} and ${gradingScale.maxScore}` });
      }

      normalizedGrades.push({
        academicPeriodKey,
        componentKey,
        subcomponentKey,
        storedComponentKey: buildStoredGradeComponentKey(componentKey, subcomponentKey),
        score,
        feedback,
      });
    }

    await Promise.all(
      normalizedGrades.map((gradeItem) => CampusGradeEntry.findOneAndUpdate(
        {
          schoolId,
          courseId: course._id,
          teacherUserId: userId,
          studentId,
          academicPeriodKey: gradeItem.academicPeriodKey,
          componentKey: gradeItem.storedComponentKey,
        },
        {
          schoolId,
          courseId: course._id,
          teacherUserId: userId,
          studentId,
          academicPeriodKey: gradeItem.academicPeriodKey,
          componentKey: gradeItem.storedComponentKey,
          subcomponentKey: gradeItem.subcomponentKey,
          score: gradeItem.score,
          feedback: gradeItem.feedback,
          gradedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ))
    );

    const detail = await buildTeacherCourseDetail({ schoolId, teacherUserId: userId, course, gradingScale });
    const updatedStudent = detail.students.find((row) => row.studentId === String(studentId)) || null;

    notifyStudentGradePublished({ schoolId, student, course, grades: normalizedGrades })
      .catch((error) => console.warn(`[CAMPUS_GRADE_NOTIFY_WARNING] student=${studentId} course=${courseId} error=${error.message}`));

    return res.status(200).json({
      message: 'Grades saved',
      student: updatedStudent,
      course: detail.course,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/posts', requireCampusTeacherAccess, uploadCampusMaterialsMiddleware.array('files', MAX_CAMPUS_MATERIAL_FILES), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const courseLookup = readTeacherCourseLookupFromRequest(req);
    const title = normalizeText(req.body.title);
    const type = normalizePostType(req.body.type) || 'Aviso';
    const status = normalizeText(req.body.status) || 'published';
    const deliveryMode = normalizeText(req.body.deliveryMode) || 'date';
    const dueAt = parseOptionalDate(req.body.dueAt);
    const scheduledClassDate = parseOptionalDate(req.body.scheduledClassDate);
    const scheduledClassSession = normalizeScheduledClassSession(req.body.scheduledClassSession);
    const allowStudentSubmission = req.body.allowStudentSubmission === true
      || ['true', '1', 'yes', 'on'].includes(String(req.body.allowStudentSubmission || '').trim().toLowerCase());

    if (!courseLookup.courseId && !courseLookup.sourceCourseKey && !(courseLookup.subject && (courseLookup.section || courseLookup.studentGradeKey))) {
      return res.status(400).json({ message: 'Invalid course id' });
    }

    if (courseLookup.courseId && !isValidObjectId(courseLookup.courseId) && !courseLookup.sourceCourseKey && !(courseLookup.subject && (courseLookup.section || courseLookup.studentGradeKey))) {
      return res.status(400).json({ message: 'Invalid course id' });
    }

    if (!title) {
      return res.status(400).json({ message: 'title is required' });
    }

    if (!type) {
      return res.status(400).json({ message: 'type is required' });
    }

    if (!['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({ message: 'Invalid post status' });
    }

    if (!['date', 'class'].includes(deliveryMode)) {
      return res.status(400).json({ message: 'Invalid delivery mode' });
    }

    if (dueAt === 'invalid' || scheduledClassDate === 'invalid') {
      return res.status(400).json({ message: 'Invalid due date' });
    }

    const course = await resolveTeacherAssignedCourse({
      schoolId,
      teacherUserId: userId,
      courseId: courseLookup.courseId,
      sourceCourseKey: courseLookup.sourceCourseKey,
      section: courseLookup.section,
      subject: courseLookup.subject,
      studentGradeKey: courseLookup.studentGradeKey,
      title: courseLookup.title,
      sync: false,
    });
    if (!course) {
      return res.status(404).json({
        message: 'Assigned course not found',
        courseId: courseLookup.courseId || null,
        sourceCourseKey: courseLookup.sourceCourseKey || null,
        section: courseLookup.section || null,
        subject: courseLookup.subject || null,
      });
    }

    if (deliveryMode === 'class') {
      if (!scheduledClassDate || !scheduledClassSession) {
        return res.status(400).json({ message: 'Class delivery requires class date and session' });
      }

      const selectedWeekday = scheduledClassDate.getDay();
      const matchingSession = (course.classSessions || []).find((session) => (
        Number(session.weekday) === selectedWeekday &&
        normalizeText(session.startTime) === scheduledClassSession.startTime &&
        normalizeText(session.endTime) === scheduledClassSession.endTime
      ));

      if (!matchingSession) {
        return res.status(400).json({ message: 'Selected class does not match the saved course schedule' });
      }
    }

    const linksResult = normalizeMaterialLinks(req.body.materialLinks);
    if (!linksResult.ok) {
      return res.status(400).json({ message: linksResult.message });
    }

    const uploadedAttachments = await processStoredCampusMaterialFiles(req.files, { folder: 'campus-materials' });
    const attachments = [...linksResult.links, ...uploadedAttachments];
    const gradebookAssignmentResult = buildPostGradebookAssignmentUpdate(
      req.body.gradebookAssignment,
      course,
      title,
      deliveryMode === 'date' ? dueAt : scheduledClassDate
    );
    if (!gradebookAssignmentResult.ok) {
      return res.status(400).json({ message: gradebookAssignmentResult.message });
    }

    if (gradebookAssignmentResult.periods) {
      course.academicPeriods = gradebookAssignmentResult.periods;
      course.gradingComponents = gradebookAssignmentResult.periods[0]?.gradingComponents || [];
      await course.save();
    }

    const post = await runWithSchoolContext(schoolId, async () => {
      const createdPost = await CampusPost.create({
        schoolId,
        teacherUserId: userId,
        courseId: course._id,
        type,
        title,
        body: normalizeText(req.body.body),
        deliveryMode,
        dueAt: deliveryMode === 'date' ? dueAt : null,
        scheduledClassDate: deliveryMode === 'class' ? scheduledClassDate : null,
        scheduledClassSession: deliveryMode === 'class' ? scheduledClassSession : null,
        attachments,
        allowStudentSubmission,
        status,
        publishedAt: status === 'published' ? new Date() : null,
      });
      await createdPost.populate('courseId', 'title');
      return createdPost;
    });

    if (status === 'published') {
      queueCampusPostPublishedNotifications({ schoolId, teacherUserId: userId, course, post })
        .catch((error) => console.warn(`[CAMPUS_POST_NOTIFY_WARNING] post=${post._id} error=${error.message}`));
    }

    return res.status(201).json(serializePost(post));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/parent-feed-requests', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const requests = await AcademicCommunicationRequest.find({ schoolId, teacherUserId: userId })
      .sort({ submittedAt: -1, createdAt: -1 })
      .lean();

    return res.status(200).json(requests.map((request) => ({
      _id: request._id,
      title: normalizeText(request.title),
      body: normalizeText(request.body),
      emailSubject: normalizeText(request.emailSubject),
      audienceType: normalizeText(request.audienceType) || 'general',
      gradeTargets: Array.isArray(request.gradeTargets) ? request.gradeTargets : [],
      courseTargets: Array.isArray(request.courseTargets) ? request.courseTargets : [],
      media: Array.isArray(request.media) ? request.media : [],
      status: normalizeText(request.status) || 'pending',
      courseTitle: normalizeText(request.courseTitle),
      reviewNotes: normalizeText(request.reviewNotes),
      reviewedByName: normalizeText(request.reviewedByName),
      submittedAt: request.submittedAt || request.createdAt,
      reviewedAt: request.reviewedAt || null,
    })));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/family-feed', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const accessQuery = await buildTeacherFamilyFeedAccessQuery(schoolId, userId);
    const communications = await AcademicCommunication.find(accessQuery)
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json(communications.map((item) => serializeTeacherFamilyFeedItem(item, userId)));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/family-feed/:communicationId/like', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const teacherUserId = new mongoose.Types.ObjectId(String(userId));
    const communicationId = String(req.params.communicationId || '').trim();

    if (!isValidObjectId(communicationId)) {
      return res.status(400).json({ message: 'Invalid communication id' });
    }

    const accessQuery = await buildTeacherFamilyFeedAccessQuery(schoolId, userId);
    const updatedCommunication = await AcademicCommunication.findOneAndUpdate(
      { ...accessQuery, _id: communicationId },
      [
        {
          $set: {
            likes: buildToggledCampusFeedLikesExpression('$likes', teacherUserId, {
              userId: teacherUserId,
              name: getCampusActorName(req.user),
              createdAt: new Date(),
            }),
          },
        },
      ],
      { new: true }
    );

    if (!updatedCommunication) {
      return res.status(404).json({ message: 'Publicación no encontrada.' });
    }

    return res.status(200).json(serializeTeacherFamilyFeedItem(updatedCommunication.toObject(), userId));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/family-feed/:communicationId/comments', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const body = normalizeText(req.body?.body);

    if (!body) {
      return res.status(400).json({ message: 'Escribe un comentario.' });
    }

    const communication = await findTeacherAccessibleFamilyFeedCommunication({
      schoolId,
      teacherUserId: userId,
      communicationId: req.params.communicationId,
    });

    if (!communication) {
      return res.status(404).json({ message: 'Publicación no encontrada.' });
    }

    communication.comments.push({
      userId,
      name: getCampusActorName(req.user),
      body: body.slice(0, 800),
      likes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await communication.save();
    return res.status(201).json(serializeTeacherFamilyFeedItem(communication.toObject(), userId));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/teacher/family-feed/:communicationId/comments/:commentId', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const communication = await findTeacherAccessibleFamilyFeedCommunication({
      schoolId,
      teacherUserId: userId,
      communicationId: req.params.communicationId,
    });

    if (!communication) {
      return res.status(404).json({ message: 'Publicación no encontrada.' });
    }

    const comment = communication.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comentario no encontrado.' });
    }

    if (!sameCampusObjectId(comment.userId, userId)) {
      return res.status(403).json({ message: 'Solo puedes borrar tus comentarios.' });
    }

    comment.deleteOne();
    await communication.save();
    return res.status(200).json(serializeTeacherFamilyFeedItem(communication.toObject(), userId));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/family-feed/:communicationId/comments/:commentId/like', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const teacherUserId = new mongoose.Types.ObjectId(String(userId));
    const communicationId = String(req.params.communicationId || '').trim();
    const commentId = String(req.params.commentId || '').trim();

    if (!isValidObjectId(communicationId) || !isValidObjectId(commentId)) {
      return res.status(400).json({ message: 'Invalid comment id' });
    }

    const accessQuery = await buildTeacherFamilyFeedAccessQuery(schoolId, userId);
    const nextCommentLike = {
      userId: teacherUserId,
      name: getCampusActorName(req.user),
      createdAt: new Date(),
    };
    const updatedCommunication = await AcademicCommunication.findOneAndUpdate(
      { ...accessQuery, _id: communicationId, 'comments._id': new mongoose.Types.ObjectId(commentId) },
      [
        {
          $set: {
            comments: {
              $map: {
                input: { $ifNull: ['$comments', []] },
                as: 'comment',
                in: {
                  $cond: [
                    { $eq: ['$$comment._id', new mongoose.Types.ObjectId(commentId)] },
                    {
                      $mergeObjects: [
                        '$$comment',
                        {
                          likes: buildToggledCampusFeedLikesExpression('$$comment.likes', teacherUserId, nextCommentLike),
                        },
                      ],
                    },
                    '$$comment',
                  ],
                },
              },
            },
          },
        },
      ],
      { new: true }
    );

    if (!updatedCommunication) {
      return res.status(404).json({ message: 'Publicación no encontrada.' });
    }

    return res.status(200).json(serializeTeacherFamilyFeedItem(updatedCommunication.toObject(), userId));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/parent-feed-requests/media', requireCampusTeacherAccess, uploadCampusMaterialsMiddleware.array('files', MAX_CAMPUS_MATERIAL_FILES), async (req, res) => {
  try {
    const incomingFiles = Array.isArray(req.files) ? req.files : [];

    if (!incomingFiles.length) {
      return res.status(400).json({ message: 'No se recibio ningun archivo.' });
    }

    const hasUnsupportedFile = incomingFiles.some((file) => {
      const mimeType = normalizeText(file?.mimetype).toLowerCase();
      return !mimeType.startsWith('image/') && !mimeType.startsWith('video/');
    });

    if (hasUnsupportedFile) {
      return res.status(400).json({ message: 'Solo se pueden subir fotos o videos para publicaciones.' });
    }

    const uploadedFiles = [];
    for (const file of incomingFiles) {
      const mimeType = normalizeText(file?.mimetype).toLowerCase();
      const preferredName = normalizeText(req.body?.preferredName) || normalizeText(file.originalname) || 'publicacion-docente';
      const requireCloudinary = isCloudinaryEnabled();

      if (mimeType.startsWith('video/')) {
        const [saved] = await processStoredCampusMaterialFiles([file], {
          folder: 'academic-communications',
          requireCloudinary,
        });

        if (!saved || saved.kind !== 'video' || !isValidPublicMediaUrl(saved.url)) {
          throw new Error('No se pudo guardar el video.');
        }

        if (requireCloudinary && saved.storage !== 'cloudinary') {
          throw new Error('No se pudo guardar el video.');
        }

        uploadedFiles.push({
          kind: 'video',
          url: saved.url,
          thumbUrl: '',
          title: String(file.originalname || '').trim(),
        });
        continue;
      }

      const saved = await processAndStoreUploadedImage({
        file,
        folder: 'academic-communications',
        preferredName,
        requireCloudinary,
      });

      if (requireCloudinary && (saved.storage !== 'cloudinary' || !/^https?:\/\//i.test(saved.url || ''))) {
        throw new Error('No se pudo guardar la imagen.');
      }

      if (!isValidPublicMediaUrl(saved.url)) {
        throw new Error('No se pudo guardar la imagen.');
      }

      uploadedFiles.push({
        kind: 'image',
        url: saved.url,
        thumbUrl: saved.thumbUrl || saved.url,
        title: String(file.originalname || '').trim(),
      });
    }

    const media = uploadedFiles
      .filter((file) => ['image', 'video'].includes(file.kind))
      .map((file) => ({
        kind: file.kind === 'video' ? 'video' : 'image',
        src: file.url,
        thumbUrl: file.kind === 'image' ? file.url : '',
        alt: normalizeText(file.title) || 'Publicación docente',
      }));

    if (!media.length) {
      return res.status(400).json({ message: 'Solo se pueden subir fotos o videos para publicaciones.' });
    }

    return res.status(201).json({ media });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudieron subir los archivos.' });
  }
});

router.post('/teacher/parent-feed-requests', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const title = normalizeText(req.body.title);
    const body = normalizeText(req.body.body);
    const emailSubject = normalizeText(req.body.emailSubject);
    const audienceType = normalizeText(req.body.audienceType) || 'general';
    const gradeTargets = Array.from(new Set((Array.isArray(req.body.gradeTargets) ? req.body.gradeTargets : []).map((item) => normalizeText(item)).filter(Boolean)));
    const courseTargets = Array.from(new Set((Array.isArray(req.body.courseTargets) ? req.body.courseTargets : []).map((item) => normalizeText(item)).filter(Boolean)));
    const parentTargets = Array.isArray(req.body.parentTargets) ? req.body.parentTargets : [];
    const studentTargets = Array.isArray(req.body.studentTargets) ? req.body.studentTargets : [];
    const media = normalizeTeacherParentFeedMedia(Array.isArray(req.body.media) ? req.body.media : []);
    const courseId = normalizeText(req.body.courseId);

    if (!title || !body) {
      return res.status(400).json({ message: 'title and body are required' });
    }

    if (!['general', 'grade', 'course', 'individual'].includes(audienceType)) {
      return res.status(400).json({ message: 'Invalid audience type' });
    }

    let linkedCourse = null;
    if (courseId) {
      if (!isValidObjectId(courseId)) {
        return res.status(400).json({ message: 'Invalid course id' });
      }

      linkedCourse = await resolveTeacherAssignedCourse({
        schoolId,
        teacherUserId: userId,
        courseId,
        sync: true,
      });

      if (!linkedCourse) {
        return res.status(404).json({ message: 'Assigned course not found' });
      }
    }

    const request = await AcademicCommunicationRequest.create({
      schoolId,
      publisherRole: 'teacher',
      teacherUserId: userId,
      teacherName: name,
      requesterUserId: userId,
      courseId: linkedCourse?._id || null,
      courseTitle: normalizeText(linkedCourse?.title),
      title,
      body,
      emailSubject,
      audienceType,
      gradeTargets: gradeTargets.length ? gradeTargets : (linkedCourse?.studentGradeKey ? [normalizeText(linkedCourse.studentGradeKey)] : []),
      courseTargets: courseTargets.length ? courseTargets : (linkedCourse?.title ? [normalizeText(linkedCourse.title)] : []),
      parentTargets,
      studentTargets,
      media,
      channels: {
        push: req.body?.channels?.push !== false,
        email: req.body?.channels?.email !== false,
      },
      status: 'pending',
      submittedAt: new Date(),
      originalTitle: title,
      originalBody: body,
      originalEmailSubject: emailSubject || title,
    });

    return res.status(201).json({
      _id: request._id,
      status: request.status,
      title: request.title,
      audienceType: request.audienceType,
      submittedAt: request.submittedAt,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/school-route/configuration', async (req, res) => {
  try {
    if (!canConfigureSchoolRoute(req)) {
      return res.status(403).json({ message: 'La asignacion de alumnos la gestiona secretaria academica.' });
    }

    const { schoolId } = req.user;
    const [drivers, routes, activeStudents] = await Promise.all([
      User.find({ schoolId, role: 'school_route', deletedAt: null })
        .select('name username email phone')
        .sort({ name: 1, username: 1 })
        .lean(),
      CampusSchoolRoute.find({ schoolId })
        .populate('stops.studentId', 'name grade course address schoolCode')
        .sort({ updatedAt: -1 })
        .lean(),
      Student.find({ schoolId, status: 'active', deletedAt: null })
        .select('name grade course address schoolCode')
        .sort({ grade: 1, course: 1, name: 1 })
        .lean(),
    ]);

    return res.json({
      drivers: drivers.map(serializeSchoolRouteDriver),
      routes: routes.map(serializeSchoolRoute),
      availableStudents: activeStudents.map(serializeSchoolRouteStudent),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.get('/school-route/manifest', async (req, res) => {
  try {
    if (!canManageSchoolRoute(req)) {
      return res.status(403).json({ message: 'No tienes acceso a la ruta escolar.' });
    }

    const { schoolId } = req.user;
    const driverUserId = await resolveSchoolRouteDriverUserId(req);
    const route = await getOrCreateSchoolRoute({ schoolId, driverUserId });
    const populatedRoute = await CampusSchoolRoute.findById(route._id)
      .populate('stops.studentId', 'name grade course address schoolCode')
      .lean();
    const activeStudents = await Student.find({ schoolId, status: 'active', deletedAt: null })
      .select('name grade course address schoolCode')
      .sort({ grade: 1, course: 1, name: 1 })
      .lean();

    return res.json({
      route: serializeSchoolRoute(populatedRoute),
      availableStudents: activeStudents.map(serializeSchoolRouteStudent),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.post('/school-route/stops', async (req, res) => {
  try {
    if (!canConfigureSchoolRoute(req)) {
      return res.status(403).json({ message: 'La asignacion de alumnos la gestiona secretaria academica.' });
    }

    const { schoolId } = req.user;
    const driverUserId = await resolveSchoolRouteDriverUserId(req);
    const studentId = normalizeText(req.body?.studentId);
    const pickupAddress = normalizeText(req.body?.pickupAddress).slice(0, 220);
    const notes = normalizeText(req.body?.notes).slice(0, 220);

    if (!isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'Selecciona un alumno valido.' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, status: 'active', deletedAt: null }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Alumno no encontrado.' });
    }

    const existingRoute = await CampusSchoolRoute.findOne({ schoolId, 'stops.studentId': student._id }).select('driverUserId').lean();
    if (existingRoute) {
      return res.status(409).json({ message: 'Este alumno ya esta asignado a una ruta.' });
    }

    const route = await getOrCreateSchoolRoute({ schoolId, driverUserId });

    const nextOrder = Math.max(0, ...(route.stops || []).map((stop) => Number(stop.order || 0))) + 1;
    route.stops.push({
      studentId: student._id,
      studentNameSnapshot: student.name,
      studentGrade: student.grade,
      studentCourse: student.course,
      pickupAddress: pickupAddress || normalizeText(student.address).slice(0, 220),
      notes,
      order: nextOrder,
      status: 'pending',
      statusUpdatedAt: null,
    });
    await route.save();

    const populatedRoute = await CampusSchoolRoute.findById(route._id)
      .populate('stops.studentId', 'name grade course address schoolCode')
      .lean();

    return res.status(201).json({ route: serializeSchoolRoute(populatedRoute) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.patch('/school-route/stops/:stopId', async (req, res) => {
  try {
    if (!canConfigureSchoolRoute(req)) {
      return res.status(403).json({ message: 'La configuracion de paradas la gestiona secretaria academica.' });
    }

    const { schoolId } = req.user;
    const driverUserId = await resolveSchoolRouteDriverUserId(req);
    const route = await getOrCreateSchoolRoute({ schoolId, driverUserId });
    const stop = route.stops.id(req.params.stopId);
    if (!stop) {
      return res.status(404).json({ message: 'Parada no encontrada.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'pickupAddress')) {
      stop.pickupAddress = normalizeText(req.body.pickupAddress).slice(0, 220);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')) {
      stop.notes = normalizeText(req.body.notes).slice(0, 220);
    }
    await route.save();

    const populatedRoute = await CampusSchoolRoute.findById(route._id)
      .populate('stops.studentId', 'name grade course address schoolCode')
      .lean();

    return res.json({ route: serializeSchoolRoute(populatedRoute) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.delete('/school-route/stops/:stopId', async (req, res) => {
  try {
    if (!canConfigureSchoolRoute(req)) {
      return res.status(403).json({ message: 'La asignacion de alumnos la gestiona secretaria academica.' });
    }

    const { schoolId } = req.user;
    const driverUserId = await resolveSchoolRouteDriverUserId(req);
    const route = await getOrCreateSchoolRoute({ schoolId, driverUserId });
    const stop = route.stops.id(req.params.stopId);
    if (!stop) {
      return res.status(404).json({ message: 'Parada no encontrada.' });
    }
    stop.deleteOne();
    route.stops
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
      .forEach((routeStop, index) => {
        routeStop.order = index + 1;
      });
    await route.save();

    const populatedRoute = await CampusSchoolRoute.findById(route._id)
      .populate('stops.studentId', 'name grade course address schoolCode')
      .lean();

    return res.json({ route: serializeSchoolRoute(populatedRoute) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.post('/school-route/reorder', async (req, res) => {
  try {
    if (!canManageSchoolRoute(req)) {
      return res.status(403).json({ message: 'No tienes acceso a la ruta escolar.' });
    }

    const { schoolId, userId } = req.user;
    const stopIds = Array.isArray(req.body?.stopIds) ? req.body.stopIds.map((id) => normalizeText(id)).filter(Boolean) : [];
    const route = await getOrCreateSchoolRoute({ schoolId, driverUserId: userId });
    const existingStopIds = new Set((route.stops || []).map((stop) => String(stop._id)));

    if (stopIds.length !== existingStopIds.size || stopIds.some((stopId) => !existingStopIds.has(stopId))) {
      return res.status(400).json({ message: 'El orden de la ruta no coincide con las paradas actuales.' });
    }

    const orderByStopId = new Map(stopIds.map((stopId, index) => [stopId, index + 1]));
    route.stops.forEach((stop) => {
      stop.order = orderByStopId.get(String(stop._id)) || stop.order;
    });
    await route.save();

    const populatedRoute = await CampusSchoolRoute.findById(route._id)
      .populate('stops.studentId', 'name grade course address schoolCode')
      .lean();

    return res.json({ route: serializeSchoolRoute(populatedRoute) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/school-route/stops/:stopId/action', async (req, res) => {
  try {
    if (!canManageSchoolRoute(req)) {
      return res.status(403).json({ message: 'No tienes acceso a la ruta escolar.' });
    }

    const action = normalizeText(req.body?.action);
    if (!['on_way', 'arrived', 'picked_up', 'skipped'].includes(action)) {
      return res.status(400).json({ message: 'Accion de ruta no valida.' });
    }

    const { schoolId, userId } = req.user;
    const route = await getOrCreateSchoolRoute({ schoolId, driverUserId: userId });
    const sortedStops = route.stops.sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
    const stop = route.stops.id(req.params.stopId);
    if (!stop) {
      return res.status(404).json({ message: 'Parada no encontrada.' });
    }

    const now = new Date();
    if (route.status === 'draft') {
      route.status = 'active';
      route.startedAt = route.startedAt || now;
    }
    stop.status = action;
    stop.statusUpdatedAt = now;

    let nextStop = null;
    if (action === 'picked_up' || action === 'skipped') {
      const currentIndex = sortedStops.findIndex((candidateStop) => String(candidateStop._id) === String(stop._id));
      nextStop = sortedStops.slice(currentIndex + 1).find((candidateStop) => !['picked_up', 'skipped'].includes(candidateStop.status));
      if (nextStop) {
        nextStop.status = 'on_way';
        nextStop.statusUpdatedAt = now;
      } else if (sortedStops.every((candidateStop) => ['picked_up', 'skipped'].includes(candidateStop.status))) {
        route.status = 'completed';
        route.completedAt = now;
      }
    }

    await route.save();

    const notificationResults = [];
    notificationResults.push(await notifySchoolRouteParents({ schoolId, stop, route, eventType: action }));
    if (nextStop) {
      notificationResults.push(await notifySchoolRouteParents({ schoolId, stop: nextStop, route, eventType: 'on_way' }));
    }

    const populatedRoute = await CampusSchoolRoute.findById(route._id)
      .populate('stops.studentId', 'name grade course address schoolCode')
      .lean();

    return res.json({
      route: serializeSchoolRoute(populatedRoute),
      notificationResults,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/school-route/reset-day', async (req, res) => {
  try {
    if (!canManageSchoolRoute(req)) {
      return res.status(403).json({ message: 'No tienes acceso a la ruta escolar.' });
    }

    const { schoolId, userId } = req.user;
    const route = await getOrCreateSchoolRoute({ schoolId, driverUserId: userId });
    route.status = 'draft';
    route.startedAt = null;
    route.completedAt = null;
    route.stops.forEach((stop) => {
      stop.status = 'pending';
      stop.statusUpdatedAt = null;
    });
    await route.save();

    const populatedRoute = await CampusSchoolRoute.findById(route._id)
      .populate('stops.studentId', 'name grade course address schoolCode')
      .lean();

    return res.json({ route: serializeSchoolRoute(populatedRoute) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/discipline-observations', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const observations = await CampusDisciplineObservation.find({ schoolId, teacherUserId: userId })
      .sort({ submittedAt: -1, createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({ observations: observations.map(serializeDisciplineObservation) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/discipline-observations', requireCampusTeacherAccess, async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const courseId = normalizeText(req.body.courseId);
    const studentId = normalizeText(req.body.studentId);
    const observationText = normalizeText(req.body.observation).slice(0, 2000);

    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ message: 'courseId is invalid' });
    }
    if (!isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'studentId is invalid' });
    }
    if (!observationText || observationText.length < 8) {
      return res.status(400).json({ message: 'La observacion debe tener al menos 8 caracteres.' });
    }

    const course = await resolveTeacherAssignedCourse({
      schoolId,
      teacherUserId: userId,
      courseId,
      sync: true,
    });
    if (!course) {
      return res.status(404).json({ message: 'Curso asignado no encontrado.' });
    }

    const student = await Student.findOne({
      _id: studentId,
      schoolId,
      deletedAt: null,
      status: 'active',
    })
      .select('name schoolCode grade course')
      .lean();

    if (!student || !studentBelongsToCourse(student, course)) {
      return res.status(404).json({ message: 'El alumno no pertenece al grupo asignado a este docente.' });
    }

    const observation = await CampusDisciplineObservation.create({
      schoolId,
      teacherUserId: userId,
      teacherName: name,
      courseId: course._id,
      courseTitle: normalizeText(course.title),
      subject: normalizeText(course.subject),
      studentGradeKey: normalizeText(course.studentGradeKey),
      studentId: student._id,
      studentName: normalizeText(student.name),
      studentSchoolCode: normalizeText(student.schoolCode),
      studentGrade: normalizeText(student.grade),
      studentCourse: normalizeText(student.course),
      observation: observationText,
      status: 'submitted',
      recipients: disciplineObservationRecipients,
      submittedAt: new Date(),
    });

    notifyDisciplineObservation({ schoolId, observation })
      .catch((error) => console.warn(`[CAMPUS_DISCIPLINE_NOTIFY_WARNING] observation=${observation._id} error=${error.message}`));

    return res.status(201).json({ observation: serializeDisciplineObservation(observation) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/discipline-observations', async (req, res) => {
  try {
    const { schoolId } = req.user;
    if (!(await canViewDisciplineObservations(req))) {
      return res.status(403).json({ message: 'No tienes permisos para ver observaciones de convivencia.' });
    }

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const observations = await CampusDisciplineObservation.find({ schoolId })
      .sort({ submittedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({ observations: observations.map(serializeDisciplineObservation) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/teacher/posts/:id', requireCampusTeacherAccess, (req, res) => {
  uploadCampusMaterialsMiddleware.array('files', MAX_CAMPUS_MATERIAL_FILES)(req, res, async (uploadError) => {
    if (uploadError) {
      const statusCode = uploadError?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(statusCode).json({
        message: uploadError.message || 'No se pudieron procesar los archivos adjuntos.',
      });
    }

    try {
      const { schoolId, userId } = req.user;
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({ message: 'Invalid post id' });
      }

      return await runWithSchoolContext(schoolId, async () => {
        let post = await CampusPost.findOne({
          _id: id,
          schoolId,
          teacherUserId: String(userId),
        }).populate('courseId', 'title');

        if (!post) {
          const candidate = await CampusPost.findOne({ _id: id, schoolId }).populate('courseId', 'title');
          if (candidate) {
            const courseId = String(candidate.courseId?._id || candidate.courseId || '');
            const assignedCourse = courseId
              ? await resolveTeacherAssignedCourse({
                schoolId,
                teacherUserId: userId,
                courseId,
                sync: false,
                allowInactive: true,
              })
              : null;
            if (assignedCourse) {
              post = candidate;
            }
          }
        }

        if (!post) {
          return res.status(404).json({ message: 'Post not found' });
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'courseId')) {
          const courseId = normalizeRequestCourseId(req.body.courseId);
          if (!isValidObjectId(courseId)) {
            return res.status(400).json({ message: 'Invalid course id' });
          }

          const course = await resolveTeacherAssignedCourse({
            schoolId,
            teacherUserId: userId,
            courseId,
            sync: true,
            allowInactive: true,
          });
          if (!course) {
            return res.status(404).json({ message: 'Assigned course not found' });
          }

          post.courseId = course._id;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
          const title = normalizeText(req.body.title);
          if (!title) {
            return res.status(400).json({ message: 'title cannot be empty' });
          }
          post.title = title;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'body')) {
          post.body = normalizeText(req.body.body);
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'allowStudentSubmission')) {
          post.allowStudentSubmission = req.body.allowStudentSubmission === true
            || ['true', '1', 'yes', 'on'].includes(String(req.body.allowStudentSubmission || '').trim().toLowerCase());
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'type')) {
          const type = normalizePostType(req.body.type);
          if (!type) {
            return res.status(400).json({ message: 'type cannot be empty' });
          }
          post.type = type;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'deliveryMode')) {
          const deliveryMode = normalizeText(req.body.deliveryMode);
          if (!['date', 'class'].includes(deliveryMode)) {
            return res.status(400).json({ message: 'Invalid delivery mode' });
          }
          post.deliveryMode = deliveryMode;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
          const previousStatus = normalizeText(post.status);
          const status = normalizeText(req.body.status);
          if (!['draft', 'published', 'archived'].includes(status)) {
            return res.status(400).json({ message: 'Invalid post status' });
          }
          post.status = status;
          if (status === 'published' && !post.publishedAt) {
            post.publishedAt = new Date();
          }
          if (status === 'draft') {
            post.publishedAt = null;
          }

          if (status === 'published' && previousStatus !== 'published') {
            const course = await CampusCourse.findOne({ _id: post.courseId, schoolId }).lean();
            if (course) {
              queueCampusPostPublishedNotifications({ schoolId, teacherUserId: userId, course, post })
                .catch((error) => console.warn(`[CAMPUS_POST_NOTIFY_WARNING] post=${post._id} error=${error.message}`));
            }
          }
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'dueAt')) {
          const dueAt = parseOptionalDate(req.body.dueAt);
          if (dueAt === 'invalid') {
            return res.status(400).json({ message: 'Invalid due date' });
          }
          post.dueAt = dueAt;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'scheduledClassDate')) {
          const scheduledClassDate = parseOptionalDate(req.body.scheduledClassDate);
          if (scheduledClassDate === 'invalid') {
            return res.status(400).json({ message: 'Invalid class date' });
          }
          post.scheduledClassDate = scheduledClassDate;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'scheduledClassSession')) {
          const scheduledClassSession = normalizeScheduledClassSession(req.body.scheduledClassSession);
          if (!scheduledClassSession) {
            return res.status(400).json({ message: 'Invalid class session' });
          }
          post.scheduledClassSession = scheduledClassSession;
        }

        const hasMaterialLinksField = Object.prototype.hasOwnProperty.call(req.body, 'materialLinks');
        const uploadedFiles = Array.isArray(req.files) ? req.files : [];
        if (hasMaterialLinksField || uploadedFiles.length > 0) {
          const existingAttachments = Array.isArray(post.attachments) ? post.attachments : [];
          const existingFileAttachments = existingAttachments.filter((attachment) => {
            const sourceType = normalizeText(attachment?.sourceType).toLowerCase();
            return sourceType !== 'link';
          });

          let nextLinkAttachments = existingAttachments.filter((attachment) => {
            const sourceType = normalizeText(attachment?.sourceType).toLowerCase();
            return sourceType === 'link';
          });

          if (hasMaterialLinksField) {
            const linksResult = normalizeMaterialLinks(req.body.materialLinks);
            if (!linksResult.ok) {
              return res.status(400).json({ message: linksResult.message });
            }
            nextLinkAttachments = linksResult.links;
          }

          const uploadedAttachments = await processStoredCampusMaterialFiles(uploadedFiles, { folder: 'campus-materials' });
          post.attachments = [...nextLinkAttachments, ...existingFileAttachments, ...uploadedAttachments];
        }

        await post.save();
        await post.populate('courseId', 'title');

        return res.status(200).json(serializePost(post));
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
});

router.get('/coordination/dashboard', requireCampusCoordinationAccess, async (req, res) => {
  try {
    const { schoolId } = req.user;
    const coordinationScope = normalizeText(req.user?.coordinationScope);
    const dashboard = await buildCoordinationDashboard({
      schoolId,
      coordinationScope,
      buildCourseCardStats,
      buildTeacherCourseDetail,
      loadCampusGradingContext,
      resolveCampusGradingScaleForCourse,
      serializeCourse,
      getCourseAcademicPeriods,
    });
    return res.status(200).json(dashboard);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/coordination/teachers', requireCampusCoordinationAccess, async (req, res) => {
  try {
    const { schoolId } = req.user;
    const users = await User.find({ schoolId, status: 'active', deletedAt: null })
      .select('name username role')
      .sort({ name: 1 })
      .lean();

    const teachers = [];
    for (const user of users) {
      const campusContext = await getCampusAccessContext({
        userId: String(user._id),
        schoolId,
        role: user.role,
        name: user.name,
        username: user.username,
      });

      if (hasMembership(campusContext, 'campus_teacher')) {
        teachers.push({
          userId: String(user._id),
          name: normalizeText(user.name),
          username: normalizeText(user.username),
          role: normalizeText(user.role),
        });
      }
    }

    return res.status(200).json({ teachers });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/coordination/courses', requireCampusCoordinationAccess, async (req, res) => {
  try {
    const { schoolId } = req.user;
    const shouldResync = ['1', 'true', 'yes'].includes(String(req.query?.resync || '').trim().toLowerCase());
    if (shouldResync) {
      const teacherIds = await CampusCourse.distinct('teacherUserId', {
        schoolId,
        status: { $in: ['active', 'archived'] },
      });
      for (const teacherUserId of teacherIds) {
        if (!teacherUserId) continue;
        try {
          await syncTeacherCoursesFromAcademicStructure({
            schoolId,
            teacherUserId,
          });
        } catch (syncError) {
          console.warn(`[campus] course resync failed for teacher ${teacherUserId}:`, syncError.message);
        }
      }
    }

    const isAcademicCoordination = normalizeText(req.user?.role) === 'coordination' && Boolean(normalizeText(req.user?.coordinationScope));
    const coordinationGradeKeys = isAcademicCoordination
      ? await resolveCampusCoordinationGradeKeys(schoolId, req.user.coordinationScope)
      : null;
    const [courses, posts, gradingContext] = await Promise.all([
      CampusCourse.find({ schoolId, status: 'active' }).sort({ updatedAt: -1, createdAt: -1 }).lean(),
      CampusPost.find({ schoolId }).select('courseId type status').lean(),
      loadCampusGradingContext(schoolId),
    ]);
    const visibleCourses = coordinationGradeKeys instanceof Set
      ? courses.filter((course) => coordinationGradeKeys.has(normalizeCampusGradeKey(course.studentGradeKey || course.gradeLevel)))
      : courses;
    const gradeEntryCountsPreview = visibleCourses.length > 0
      ? await CampusGradeEntry.aggregate([
        {
          $match: {
            schoolId,
            courseId: { $in: visibleCourses.map((course) => course._id) },
          },
        },
        { $group: { _id: '$courseId', count: { $sum: 1 } } },
      ])
      : [];
    const gradeEntryCountByCourseIdPreview = new Map();
    gradeEntryCountsPreview.forEach((item) => {
      gradeEntryCountByCourseIdPreview.set(String(item._id), Number(item.count || 0));
    });
    const preferredCourses = selectTeacherOverviewCourses(visibleCourses, new Map(), gradeEntryCountByCourseIdPreview);
    const preferredCourseIds = new Set(preferredCourses.map((course) => String(course._id)));
    const visibleCourseIds = preferredCourseIds;
    const gradeEntryCounts = gradeEntryCountsPreview.filter((item) => preferredCourseIds.has(String(item._id)));
    const gradeEntryCountByCourseId = new Map();
    gradeEntryCounts.forEach((item) => {
      gradeEntryCountByCourseId.set(String(item._id), Number(item.count || 0));
    });

    const postsByCourseId = new Map();
    for (const post of posts) {
      const courseId = String(post.courseId || '');
      if (!courseId || (visibleCourseIds.size > 0 && !visibleCourseIds.has(courseId))) {
        continue;
      }

      const coursePosts = postsByCourseId.get(courseId) || [];
      coursePosts.push(post);
      postsByCourseId.set(courseId, coursePosts);
    }

    const normalizedCourses = await Promise.all(preferredCourses.map(async (course) => {
      const courseGradingScale = resolveCampusGradingScaleForCourse(gradingContext, course);
      const courseDetail = await buildTeacherCourseDetail({
        schoolId,
        teacherUserId: normalizeText(course.teacherUserId),
        course,
        gradingScale: courseGradingScale,
      });

      return {
        ...serializeCourse(course, { gradingScale: courseGradingScale }),
        stats: buildCourseCardStats({
          courseDetail,
          posts: postsByCourseId.get(String(course._id)) || [],
          gradingScale: courseGradingScale,
          hasGradeEntries: Number(gradeEntryCountByCourseId.get(String(course._id)) || 0) > 0,
          academicPeriods: getCourseAcademicPeriods(course),
        }),
      };
    }));

    return res.status(200).json({ courses: normalizedCourses });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/coordination/courses', requireCampusCoordinationAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const isAcademicCoordination = normalizeText(req.user?.role) === 'coordination' && Boolean(normalizeText(req.user?.coordinationScope));
    const teacherUserId = normalizeText(req.body.teacherUserId);
    const subject = normalizeText(req.body.subject);
    const studentGradeKey = normalizeGradeKey(req.body.studentGradeKey);
    const title = normalizeText(req.body.title) || [subject, studentGradeKey].filter(Boolean).join(' ');

    if (!teacherUserId || !subject || !studentGradeKey) {
      return res.status(400).json({ message: 'teacherUserId, subject and studentGradeKey are required' });
    }

    if (!isValidObjectId(teacherUserId)) {
      return res.status(400).json({ message: 'Invalid teacherUserId' });
    }

    if (isAcademicCoordination) {
      const coordinationGradeKeys = await resolveCampusCoordinationGradeKeys(schoolId, req.user.coordinationScope);
      if (!coordinationGradeKeys.has(normalizeCampusGradeKey(studentGradeKey))) {
        return res.status(403).json({ message: 'No tienes permiso para gestionar cursos fuera de tu nivel de coordinación.' });
      }
    }

    const teacher = await User.findOne({ _id: teacherUserId, schoolId, status: 'active', deletedAt: null })
      .select('name username role')
      .lean();
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const teacherCampusContext = await getCampusAccessContext({
      userId: String(teacher._id),
      schoolId,
      role: teacher.role,
      name: teacher.name,
      username: teacher.username,
    });

    if (!hasMembership(teacherCampusContext, 'campus_teacher')) {
      return res.status(400).json({ message: 'Selected user does not have campus_teacher membership' });
    }

    const academicPeriodsResult = normalizeAcademicPeriods(req.body.academicPeriods, {
      fallbackGradingComponents: req.body.gradingComponents || buildDefaultGradingComponents(),
    });
    if (!academicPeriodsResult.ok) {
      return res.status(400).json({ message: academicPeriodsResult.message });
    }

    const parsedSection = normalizeText(req.body.section) || studentGradeKey.replace(/^[0-9]+/, '');
    const parsedGradeLevel = normalizeText(req.body.gradeLevel) || studentGradeKey.replace(/[^0-9]+/g, '');
    const classSessionsResult = normalizeClassSessions(req.body.classSessions);
    if (!classSessionsResult.ok) {
      return res.status(400).json({ message: classSessionsResult.message });
    }

    const scheduleConflicts = await findTeacherScheduleConflicts({
      schoolId,
      teacherUserId,
      classSessions: classSessionsResult.sessions,
    });
    if (scheduleConflicts.length > 0) {
      const firstConflict = scheduleConflicts[0];
      return res.status(400).json({
        message: `El docente ya tiene asignado ${firstConflict.title || 'otro curso'} (${firstConflict.studentGradeKey || 'sin grado'}) el ${weekdayLabels[firstConflict.weekday] || 'día indicado'} de ${firstConflict.startTime} a ${firstConflict.endTime}.`,
      });
    }

    const course = await CampusCourse.create({
      schoolId,
      teacherUserId,
      assignedByUserId: userId,
      title,
      subject,
      gradeLevel: parsedGradeLevel,
      section: parsedSection,
      studentGradeKey,
      description: normalizeText(req.body.description),
      colorToken: normalizeText(req.body.colorToken) || '#2a6f97',
      classSessions: classSessionsResult.sessions,
      academicPeriods: academicPeriodsResult.periods,
      gradingComponents: academicPeriodsResult.periods[0]?.gradingComponents || [],
      status: ['active', 'archived'].includes(normalizeText(req.body.status)) ? normalizeText(req.body.status) : 'active',
    });

    return res.status(201).json(serializeCourse(course));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/coordination/courses/:id', requireCampusCoordinationAccess, async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const isAcademicCoordination = normalizeText(req.user?.role) === 'coordination' && Boolean(normalizeText(req.user?.coordinationScope));
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid course id' });
    }

    const course = await CampusCourse.findOne({ _id: id, schoolId });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const coordinationGradeKeys = isAcademicCoordination
      ? await resolveCampusCoordinationGradeKeys(schoolId, req.user.coordinationScope)
      : null;
    if (coordinationGradeKeys instanceof Set && !coordinationGradeKeys.has(normalizeCampusGradeKey(course.studentGradeKey || course.gradeLevel))) {
      return res.status(403).json({ message: 'No tienes permiso para gestionar cursos fuera de tu nivel de coordinación.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'teacherUserId')) {
      const teacherUserId = normalizeText(req.body.teacherUserId);
      if (!teacherUserId || !isValidObjectId(teacherUserId)) {
        return res.status(400).json({ message: 'Invalid teacherUserId' });
      }

      const teacher = await User.findOne({ _id: teacherUserId, schoolId, status: 'active', deletedAt: null })
        .select('name username role')
        .lean();
      if (!teacher) {
        return res.status(404).json({ message: 'Teacher not found' });
      }

      const teacherCampusContext = await getCampusAccessContext({
        userId: String(teacher._id),
        schoolId,
        role: teacher.role,
        name: teacher.name,
        username: teacher.username,
      });

      if (!hasMembership(teacherCampusContext, 'campus_teacher')) {
        return res.status(400).json({ message: 'Selected user does not have campus_teacher membership' });
      }

      course.teacherUserId = teacherUserId;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
      const title = normalizeText(req.body.title);
      if (!title) {
        return res.status(400).json({ message: 'title cannot be empty' });
      }
      course.title = title;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'subject')) {
      const subject = normalizeText(req.body.subject);
      if (!subject) {
        return res.status(400).json({ message: 'subject cannot be empty' });
      }
      course.subject = subject;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'studentGradeKey')) {
      const studentGradeKey = normalizeGradeKey(req.body.studentGradeKey);
      if (!studentGradeKey) {
        return res.status(400).json({ message: 'studentGradeKey cannot be empty' });
      }
      course.studentGradeKey = studentGradeKey;
      if (!Object.prototype.hasOwnProperty.call(req.body, 'section')) {
        course.section = studentGradeKey.replace(/^[0-9]+/, '');
      }
      if (!Object.prototype.hasOwnProperty.call(req.body, 'gradeLevel')) {
        course.gradeLevel = studentGradeKey.replace(/[^0-9]+/g, '');
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'gradeLevel')) {
      course.gradeLevel = normalizeText(req.body.gradeLevel);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'section')) {
      course.section = normalizeText(req.body.section);
    }

    if (coordinationGradeKeys instanceof Set && !coordinationGradeKeys.has(normalizeCampusGradeKey(course.studentGradeKey || course.gradeLevel))) {
      return res.status(403).json({ message: 'No tienes permiso para gestionar cursos fuera de tu nivel de coordinación.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
      course.description = normalizeText(req.body.description);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'colorToken')) {
      course.colorToken = normalizeText(req.body.colorToken) || '#2a6f97';
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'classSessions')) {
      const classSessionsResult = normalizeClassSessions(req.body.classSessions);
      if (!classSessionsResult.ok) {
        return res.status(400).json({ message: classSessionsResult.message });
      }
      course.classSessions = classSessionsResult.sessions;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      const status = normalizeText(req.body.status);
      if (!['active', 'archived'].includes(status)) {
        return res.status(400).json({ message: 'Invalid course status' });
      }
      course.status = status;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'academicPeriods') || Object.prototype.hasOwnProperty.call(req.body, 'gradingComponents')) {
      const academicPeriodsResult = normalizeAcademicPeriods(req.body.academicPeriods, {
        fallbackGradingComponents: Object.prototype.hasOwnProperty.call(req.body, 'gradingComponents')
          ? req.body.gradingComponents
          : course.gradingComponents,
      });
      if (!academicPeriodsResult.ok) {
        return res.status(400).json({ message: academicPeriodsResult.message });
      }
      course.academicPeriods = academicPeriodsResult.periods;
      course.gradingComponents = academicPeriodsResult.periods[0]?.gradingComponents || [];
    }

    if (course.status === 'active') {
      const scheduleConflicts = await findTeacherScheduleConflicts({
        schoolId,
        teacherUserId: normalizeText(course.teacherUserId),
        classSessions: Array.isArray(course.classSessions) ? course.classSessions : [],
        excludeCourseId: String(course._id),
      });
      if (scheduleConflicts.length > 0) {
        const firstConflict = scheduleConflicts[0];
        return res.status(400).json({
          message: `El docente ya tiene asignado ${firstConflict.title || 'otro curso'} (${firstConflict.studentGradeKey || 'sin grado'}) el ${weekdayLabels[firstConflict.weekday] || 'día indicado'} de ${firstConflict.startTime} a ${firstConflict.endTime}.`,
        });
      }
    }

    course.assignedByUserId = userId;
    await course.save();

    return res.status(200).json(serializeCourse(course));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
