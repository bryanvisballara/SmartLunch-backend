const mongoose = require('mongoose');

const AcademicCommunication = require('../models/academicCommunication.model');
const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeCohortPart(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 48);
}

function getFallbackAcademicYear() {
  return String(new Date().getFullYear());
}

async function resolveSchoolAcademicYear(schoolId) {
  const configuration = await AcademicFeeConfiguration.findOne({ schoolId })
    .select('academicYear')
    .lean();
  return normalizeText(configuration?.academicYear) || getFallbackAcademicYear();
}

function buildCohortKey({ academicYear = '', grade = '', course = '' } = {}) {
  const yearKey = normalizeCohortPart(academicYear) || normalizeCohortPart(getFallbackAcademicYear());
  const gradeKey = normalizeCohortPart(grade);
  const courseKey = normalizeCohortPart(course) || gradeKey;
  if (!yearKey || !gradeKey) {
    return '';
  }
  return `${yearKey}|${gradeKey}|${courseKey}`;
}

function listStudentCohortKeys(student = {}) {
  const keys = new Set();
  (Array.isArray(student.cohortHistory) ? student.cohortHistory : []).forEach((entry) => {
    const key = normalizeText(entry?.key);
    if (key) keys.add(key);
  });
  return [...keys];
}

async function ensureStudentCohortMembership(studentDoc, schoolId) {
  if (!studentDoc) {
    return null;
  }

  try {
    const academicYear = await resolveSchoolAcademicYear(schoolId);
    const grade = normalizeText(studentDoc.grade);
    const course = normalizeText(studentDoc.course) || grade;
    const key = buildCohortKey({ academicYear, grade, course });
    if (!key) {
      return studentDoc;
    }

    const history = Array.isArray(studentDoc.cohortHistory) ? studentDoc.cohortHistory : [];
    const alreadyTracked = history.some((entry) => normalizeText(entry?.key) === key);
    if (alreadyTracked) {
      return studentDoc;
    }

    const nextEntry = {
      key,
      academicYear,
      grade,
      course,
      joinedAt: new Date(),
    };

    await Student.updateOne(
      {
        _id: studentDoc._id,
        schoolId,
        'cohortHistory.key': { $ne: key },
      },
      {
        $push: {
          cohortHistory: {
            $each: [nextEntry],
            $slice: -24,
          },
        },
      }
    );

    const refreshed = await Student.findOne({ _id: studentDoc._id, schoolId })
      .select('cohortHistory')
      .lean();
    studentDoc.cohortHistory = Array.isArray(refreshed?.cohortHistory)
      ? refreshed.cohortHistory
      : [...history, nextEntry].slice(-24);

    return studentDoc;
  } catch (error) {
    // Cohort tracking must never break portal reads.
    console.warn('[communityFeed] ensureStudentCohortMembership failed:', error?.message || error);
    return studentDoc;
  }
}

async function ensureStudentsCohortMembership(students = [], schoolId) {
  const results = [];
  for (const student of students) {
    const doc = student?.save
      ? student
      : await Student.findOne({ _id: student._id || student.id, schoolId });
    if (!doc) continue;
    results.push(await ensureStudentCohortMembership(doc, schoolId));
  }
  return results;
}

function studentsMatchCohortCourse(student = {}, { grade = '', course = '' } = {}) {
  const studentGrade = normalizeCohortPart(student.grade);
  const studentCourse = normalizeCohortPart(student.course) || studentGrade;
  const targetGrade = normalizeCohortPart(grade);
  const targetCourse = normalizeCohortPart(course) || targetGrade;
  if (!studentGrade || !targetGrade) {
    return false;
  }
  return studentGrade === targetGrade && studentCourse === targetCourse;
}

async function resolveCommunityAudienceMembers({
  schoolId,
  audienceType,
  grade = '',
  course = '',
}) {
  const normalizedAudienceType = normalizeText(audienceType) || 'general';
  const studentFilter = { schoolId, status: 'active', deletedAt: null };
  let students = [];

  if (normalizedAudienceType === 'general') {
    students = await Student.find(studentFilter).select('_id grade course name').lean();
  } else if (normalizedAudienceType === 'course' || normalizedAudienceType === 'course_students') {
    const allStudents = await Student.find(studentFilter).select('_id grade course name').lean();
    students = allStudents.filter((student) => studentsMatchCohortCourse(student, { grade, course }));
  }

  const studentIds = students.map((student) => student._id);
  let parentIds = [];

  if (normalizedAudienceType !== 'course_students' && studentIds.length) {
    const links = await ParentStudentLink.find({
      schoolId,
      studentId: { $in: studentIds },
      status: 'active',
    })
      .select('parentId')
      .lean();
    parentIds = [...new Set(links.map((link) => String(link.parentId)).filter(Boolean))]
      .map((id) => new mongoose.Types.ObjectId(id));
  }

  if (normalizedAudienceType === 'general') {
    const parents = await User.find({ schoolId, role: 'parent', status: 'active', deletedAt: null })
      .select('_id')
      .lean();
    parentIds = parents.map((parent) => parent._id);
  }

  const parents = parentIds.length
    ? await User.find({
      schoolId,
      _id: { $in: parentIds },
      role: 'parent',
      status: 'active',
      deletedAt: null,
    })
      .select('_id name')
      .lean()
    : [];

  return {
    parents,
    students,
    parentIds: parents.map((parent) => parent._id),
    studentIds,
  };
}

function buildStudentCommunityFeedQuery({ schoolId, userId, student }) {
  const cohortKeys = listStudentCohortKeys(student);
  const orFilters = [
    { audienceType: 'general' },
    { createdByUserId: userId },
    { authorStudentId: student._id },
    { recipientStudentIds: student._id },
  ];

  if (cohortKeys.length) {
    orFilters.push(
      { audienceType: 'course', cohortKey: { $in: cohortKeys } },
      { audienceType: 'course_students', cohortKey: { $in: cohortKeys } }
    );
  }

  return {
    schoolId,
    sentAt: { $ne: null },
    $or: orFilters,
  };
}

function buildParentCommunityFeedQuery({ schoolId, parentUserId, children = [] }) {
  const cohortKeys = [...new Set(children.flatMap((child) => listStudentCohortKeys(child)))];
  const orFilters = [
    { recipientParentIds: parentUserId },
    { audienceType: 'general' },
    { createdByUserId: parentUserId },
  ];

  if (cohortKeys.length) {
    orFilters.push({ audienceType: 'course', cohortKey: { $in: cohortKeys } });
  }

  return {
    schoolId,
    sentAt: { $ne: null },
    $or: orFilters,
  };
}

async function createCommunityPublication({
  schoolId,
  userId,
  userName,
  publisherRole,
  audienceType,
  title,
  body,
  media = [],
  authorPhotoUrl = '',
  authorThumbUrl = '',
  authorStudentId = null,
  grade = '',
  course = '',
  academicYear = '',
}) {
  const normalizedAudienceType = normalizeText(audienceType);
  const allowedAudiences = publisherRole === 'parent'
    ? ['general']
    : ['general', 'course', 'course_students'];

  if (!allowedAudiences.includes(normalizedAudienceType)) {
    throw new Error('Tipo de audiencia no permitido para este usuario.');
  }

  const resolvedTitle = normalizeText(title);
  const resolvedBody = normalizeText(body);
  if (!resolvedTitle || !resolvedBody) {
    throw new Error('Escribe un título y una descripción para publicar.');
  }

  const year = normalizeText(academicYear) || await resolveSchoolAcademicYear(schoolId);
  const cohortKey = (normalizedAudienceType === 'course' || normalizedAudienceType === 'course_students')
    ? buildCohortKey({ academicYear: year, grade, course })
    : '';

  if ((normalizedAudienceType === 'course' || normalizedAudienceType === 'course_students') && !cohortKey) {
    throw new Error('No se pudo determinar el curso o grado para la publicación.');
  }

  const audience = await resolveCommunityAudienceMembers({
    schoolId,
    audienceType: normalizedAudienceType,
    grade,
    course,
  });

  if (normalizedAudienceType === 'course_students' && !audience.studentIds.length) {
    throw new Error('No se encontraron estudiantes para este curso.');
  }

  if (normalizedAudienceType !== 'course_students' && !audience.parentIds.length && !audience.studentIds.length) {
    throw new Error('No se encontraron destinatarios para esta publicación.');
  }

  const communication = await AcademicCommunication.create({
    schoolId,
    createdByUserId: userId,
    createdByName: userName,
    authorName: userName,
    authorPhotoUrl: normalizeText(authorPhotoUrl),
    authorThumbUrl: normalizeText(authorThumbUrl || authorPhotoUrl),
    authorStudentId: authorStudentId || null,
    publisherRole,
    title: resolvedTitle,
    body: resolvedBody,
    audienceType: normalizedAudienceType,
    gradeTargets: grade ? [normalizeText(grade)] : [],
    courseTargets: course ? [normalizeText(course)] : [],
    cohortKey,
    academicYear: year,
    recipientParentIds: normalizedAudienceType === 'course_students' ? [] : audience.parentIds,
    recipientStudentIds: audience.studentIds,
    media: Array.isArray(media) ? media : [],
    channels: { push: normalizedAudienceType !== 'course_students', email: false },
    sentAt: new Date(),
  });

  return communication;
}

function communityPublicationRequiresApproval(publisherRole, audienceType) {
  const role = normalizeText(publisherRole);
  const audience = normalizeText(audienceType) || 'general';

  if (role === 'student') {
    return audience === 'general';
  }

  if (role === 'parent' || role === 'teacher') {
    return true;
  }

  return true;
}

async function createCommunityPublicationRequest({
  schoolId,
  userId,
  userName,
  publisherRole,
  audienceType = 'general',
  title,
  body,
  media = [],
  authorPhotoUrl = '',
  authorThumbUrl = '',
  authorStudentId = null,
  grade = '',
  course = '',
  academicYear = '',
}) {
  const AcademicCommunicationRequest = require('../models/academicCommunicationRequest.model');
  const normalizedAudienceType = normalizeText(audienceType) || 'general';
  const resolvedTitle = normalizeText(title);
  const resolvedBody = normalizeText(body);

  if (!resolvedTitle || !resolvedBody) {
    throw new Error('Escribe un título y una descripción para publicar.');
  }

  if (publisherRole === 'parent' && normalizedAudienceType !== 'general') {
    throw new Error('Los acudientes solo pueden solicitar publicaciones para todo el colegio.');
  }

  if (publisherRole === 'student' && normalizedAudienceType !== 'general') {
    throw new Error('Esta audiencia no requiere autorización; publícala directamente.');
  }

  const year = normalizeText(academicYear) || await resolveSchoolAcademicYear(schoolId);
  const request = await AcademicCommunicationRequest.create({
    schoolId,
    publisherRole,
    teacherUserId: publisherRole === 'teacher' ? userId : null,
    teacherName: normalizeText(userName),
    requesterUserId: userId,
    authorStudentId: authorStudentId || null,
    authorPhotoUrl: normalizeText(authorPhotoUrl),
    authorThumbUrl: normalizeText(authorThumbUrl || authorPhotoUrl),
    title: resolvedTitle,
    body: resolvedBody,
    emailSubject: resolvedTitle,
    audienceType: normalizedAudienceType,
    gradeTargets: grade ? [normalizeText(grade)] : [],
    courseTargets: course ? [normalizeText(course)] : [],
    cohortKey: '',
    academicYear: year,
    media: Array.isArray(media) ? media : [],
    channels: { push: true, email: false },
    status: 'pending',
    submittedAt: new Date(),
    originalTitle: resolvedTitle,
    originalBody: resolvedBody,
    originalEmailSubject: resolvedTitle,
  });

  return request;
}

async function submitCommunityPublication(params = {}) {
  const audienceType = normalizeText(params.audienceType) || 'general';
  const publisherRole = normalizeText(params.publisherRole);

  if (communityPublicationRequiresApproval(publisherRole, audienceType)) {
    const request = await createCommunityPublicationRequest({
      ...params,
      audienceType,
    });
    return {
      kind: 'request',
      status: 'pending',
      request,
    };
  }

  const communication = await createCommunityPublication({
    ...params,
    audienceType,
  });
  return {
    kind: 'publication',
    status: 'published',
    communication,
  };
}

async function findAccessibleCommunityCommunication({
  schoolId,
  communicationId,
  userId,
  role,
  student = null,
  children = [],
}) {
  if (!mongoose.Types.ObjectId.isValid(String(communicationId || ''))) {
    return null;
  }

  const query = role === 'student' && student
    ? buildStudentCommunityFeedQuery({ schoolId, userId, student })
    : buildParentCommunityFeedQuery({ schoolId, parentUserId: userId, children });

  return AcademicCommunication.findOne({
    ...query,
    _id: communicationId,
  });
}

module.exports = {
  buildCohortKey,
  buildParentCommunityFeedQuery,
  buildStudentCommunityFeedQuery,
  communityPublicationRequiresApproval,
  createCommunityPublication,
  createCommunityPublicationRequest,
  ensureStudentCohortMembership,
  ensureStudentsCohortMembership,
  findAccessibleCommunityCommunication,
  listStudentCohortKeys,
  resolveCommunityAudienceMembers,
  resolveSchoolAcademicYear,
  submitCommunityPublication,
};
