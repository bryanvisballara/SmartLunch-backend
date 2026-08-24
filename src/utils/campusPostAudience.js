function normalizeCampusAudienceId(value) {
  return String(value?._id || value || '').trim();
}

function parseCampusTargetStudentIds(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [trimmed];
    } catch (error) {
      return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }

  return [];
}

function serializeCampusAssignmentAudience(doc = {}) {
  const targetStudentIds = [...new Set(
    parseCampusTargetStudentIds(doc.targetStudentIds)
      .map(normalizeCampusAudienceId)
      .filter(Boolean)
  )];
  const targetType = String(doc.targetType || '').trim() === 'students' && targetStudentIds.length
    ? 'students'
    : 'course';

  return {
    targetType,
    targetStudentIds: targetType === 'students' ? targetStudentIds : [],
  };
}

function parseCampusAssignmentAudience(raw = {}, options = {}) {
  const requestedType = String(raw.targetType || '').trim() === 'students' ? 'students' : 'course';
  const rosterSet = Array.isArray(options.rosterStudentIds)
    ? new Set(options.rosterStudentIds.map(normalizeCampusAudienceId).filter(Boolean))
    : null;
  const targetStudentIds = [...new Set(
    parseCampusTargetStudentIds(raw.targetStudentIds)
      .map(normalizeCampusAudienceId)
      .filter(Boolean)
      .filter((id) => (rosterSet ? rosterSet.has(id) : true))
  )];

  if (requestedType === 'students') {
    if (!targetStudentIds.length) {
      return { ok: false, message: 'Selecciona al menos un alumno para esta asignación.' };
    }

    return {
      ok: true,
      targetType: 'students',
      targetStudentIds,
    };
  }

  return {
    ok: true,
    targetType: 'course',
    targetStudentIds: [],
  };
}

function campusAudienceAppliesToStudent(audience, studentId) {
  const normalized = serializeCampusAssignmentAudience(audience || {});
  if (normalized.targetType !== 'students') {
    return true;
  }

  const normalizedStudentId = normalizeCampusAudienceId(studentId);
  if (!normalizedStudentId) {
    return false;
  }

  return normalized.targetStudentIds.includes(normalizedStudentId);
}

function filterStudentsByCampusAudience(students, audience) {
  const roster = Array.isArray(students) ? students : [];
  return roster.filter((student) => campusAudienceAppliesToStudent(
    audience,
    student?.studentId || student?._id || student?.id
  ));
}

module.exports = {
  campusAudienceAppliesToStudent,
  filterStudentsByCampusAudience,
  parseCampusAssignmentAudience,
  serializeCampusAssignmentAudience,
};
