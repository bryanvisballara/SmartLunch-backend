const AcademicCommunicationRequest = require('../models/academicCommunicationRequest.model');
const User = require('../models/user.model');

function normalizeText(value) {
  return String(value || '').trim();
}

function buildTeacherCommunicationAuthorName(request = {}) {
  const publisherRole = normalizeText(request.publisherRole) || 'teacher';
  if (publisherRole === 'parent') {
    return normalizeText(request.teacherName) || 'Acudiente';
  }
  if (publisherRole === 'student') {
    return normalizeText(request.teacherName) || 'Alumno';
  }
  if (publisherRole === 'nursing') {
    const staffName = normalizeText(request.teacherName || request.teacherUserId?.name) || 'Enfermería';
    const areaLabel = normalizeText(request.subject) || 'Enfermería';
    return areaLabel ? `${staffName} - ${areaLabel}` : staffName;
  }

  const teacherName = normalizeText(request.teacherUserId?.name || request.teacherName || request.teacherUserId?.username) || 'Docente';
  const subjectLabel = normalizeText(request.subject)
    || normalizeText(request.courseId?.subject)
    || normalizeText(request.courseTitle).split(' - ')[0]
    || normalizeText(request.courseTitle);

  return subjectLabel ? `${teacherName} - ${subjectLabel}` : teacherName;
}

function resolveLivePublisherUser(request = {}, item = {}) {
  const publisherRole = normalizeText(request.publisherRole || item.publisherRole) || 'teacher';
  if (publisherRole === 'parent' || publisherRole === 'student') {
    return request.requesterUserId && typeof request.requesterUserId === 'object'
      ? request.requesterUserId
      : null;
  }
  if (request.teacherUserId && typeof request.teacherUserId === 'object') {
    return request.teacherUserId;
  }
  return null;
}

function applyLiveAuthorFields(item = {}, request = null, liveUser = null) {
  if (!liveUser?.name && !request) {
    return item;
  }

  const publisherRole = normalizeText(request?.publisherRole || item.publisherRole);
  const next = { ...item };

  if (request) {
    next.authorName = buildTeacherCommunicationAuthorName({
      ...request,
      publisherRole,
      teacherUserId: liveUser || request.teacherUserId,
      teacherName: liveUser?.name || request.teacherName,
    });
  } else if (liveUser?.name) {
    const storedName = normalizeText(item.authorName);
    const suffix = storedName.includes(' - ') ? storedName.split(' - ').slice(1).join(' - ') : '';
    next.authorName = suffix ? `${liveUser.name} - ${suffix}` : liveUser.name;
  }

  const photoUrl = normalizeText(liveUser?.campusPhotoUrl || request?.authorPhotoUrl || item.authorPhotoUrl);
  const thumbUrl = normalizeText(
    liveUser?.campusPhotoThumbUrl
    || liveUser?.campusPhotoUrl
    || request?.authorThumbUrl
    || item.authorThumbUrl
    || photoUrl
  );
  if (photoUrl) {
    next.authorPhotoUrl = photoUrl;
    next.authorThumbUrl = thumbUrl;
  }

  return next;
}

async function enrichCommunicationsWithLiveAuthorNames(schoolId, communications = []) {
  const items = Array.isArray(communications) ? communications.filter(Boolean) : [];
  if (!items.length) {
    return items;
  }

  const communicationIds = items.map((item) => item._id).filter(Boolean);
  const requests = await AcademicCommunicationRequest.find({
    schoolId,
    publishedCommunicationId: { $in: communicationIds },
  })
    .populate('teacherUserId', 'name username campusPhotoUrl campusPhotoThumbUrl')
    .populate('requesterUserId', 'name username campusPhotoUrl campusPhotoThumbUrl')
    .lean();

  const requestByCommunicationId = new Map(
    requests.map((request) => [String(request.publishedCommunicationId), request])
  );

  const directPublisherIds = items
    .filter((item) => !requestByCommunicationId.has(String(item._id)) && item.createdByUserId)
    .map((item) => item.createdByUserId);

  const directUsers = directPublisherIds.length
    ? await User.find({ _id: { $in: directPublisherIds } })
      .select('name username campusPhotoUrl campusPhotoThumbUrl')
      .lean()
    : [];
  const directUserById = new Map(directUsers.map((user) => [String(user._id), user]));

  return items.map((item) => {
    const request = requestByCommunicationId.get(String(item._id));
    if (request) {
      const liveUser = resolveLivePublisherUser(request, item);
      return applyLiveAuthorFields(item, request, liveUser);
    }

    const role = normalizeText(item.publisherRole);
    if (!['teacher', 'parent', 'student', 'nursing'].includes(role) || !item.createdByUserId) {
      return item;
    }

    const liveUser = directUserById.get(String(item.createdByUserId));
    return applyLiveAuthorFields(item, null, liveUser);
  });
}

module.exports = {
  buildTeacherCommunicationAuthorName,
  enrichCommunicationsWithLiveAuthorNames,
};
