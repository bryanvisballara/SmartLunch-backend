function normalizeClassroomGroupText(value) {
  return String(value || '').trim();
}

function slugifyClassroomGroupKey(value) {
  return normalizeClassroomGroupText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function uniqueClassroomGroupValues(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeClassroomGroupText(value))
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
}

function serializeClassroomGroups(rawGroups = [], allowedGradeKeys = null) {
  const allowedKeys = allowedGradeKeys instanceof Set ? allowedGradeKeys : null;

  return (Array.isArray(rawGroups) ? rawGroups : [])
    .filter((group) => normalizeClassroomGroupText(group?.status || 'active') !== 'archived')
    .map((group, index) => {
      const label = normalizeClassroomGroupText(group?.label || group?.name || group?.key);
      const key = slugifyClassroomGroupKey(group?.key || label) || `aula_${index + 1}`;
      const gradeKeys = uniqueClassroomGroupValues(group?.gradeKeys)
        .filter((gradeKey) => !allowedKeys || allowedKeys.has(gradeKey));

      return {
        key,
        label: label || key,
        gradeKeys,
        order: Number(group?.order || (index + 1) * 10),
      };
    })
    .filter((group) => group.key && group.label && group.gradeKeys.length > 0)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || String(left.label).localeCompare(String(right.label), 'es', { sensitivity: 'base' }));
}

function resolveClassroomGroupForGrade(groups = [], gradeKey) {
  const normalizedGradeKey = normalizeClassroomGroupText(gradeKey);
  if (!normalizedGradeKey) {
    return null;
  }

  return (Array.isArray(groups) ? groups : []).find((group) => (
    uniqueClassroomGroupValues(group?.gradeKeys).includes(normalizedGradeKey)
  )) || null;
}

function escapeClassroomGroupRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classroomGroupGradeKeyCandidates(gradeKey) {
  const text = normalizeClassroomGroupText(gradeKey);
  if (!text) {
    return [];
  }

  const withoutTrailingSection = text.replace(/[:\s.-]*[a-z]$/i, '').trim();
  return uniqueClassroomGroupValues([
    text,
    withoutTrailingSection,
    text.replace(/\s+/g, ''),
  ]);
}

function gradeKeyMatchesClassroomGroupKey(gradeKey, groupGradeKey) {
  const candidate = normalizeClassroomGroupText(gradeKey);
  const groupKey = normalizeClassroomGroupText(groupGradeKey);
  if (!candidate || !groupKey) {
    return false;
  }
  if (candidate.toLowerCase() === groupKey.toLowerCase()) {
    return true;
  }
  if (candidate.toLowerCase().startsWith(`${groupKey.toLowerCase()}:`)) {
    return true;
  }
  return new RegExp(`^${escapeClassroomGroupRegex(groupKey)}(?:\\s*[:.\\-]?\\s*[A-Za-z])?$`, 'i').test(candidate);
}

function buildClassroomGroupGradeMongoOr(gradeKeys = []) {
  const or = [];
  uniqueClassroomGroupValues(gradeKeys).forEach((key) => {
    or.push({ studentGradeKey: key });
    or.push({ gradeLevel: key });
    const withSection = new RegExp(`^${escapeClassroomGroupRegex(key)}(?:\\s*[:.\\-]?\\s*[A-Za-z])?$`, 'i');
    or.push({ studentGradeKey: withSection });
    or.push({ gradeLevel: withSection });
  });
  return or;
}

function collectSharedClassroomGradeKeys(groups = [], gradeKey) {
  const serialized = serializeClassroomGroups(groups);
  const candidates = classroomGroupGradeKeyCandidates(gradeKey);
  for (const candidate of candidates) {
    const group = resolveClassroomGroupForGrade(serialized, candidate);
    if (group) {
      return uniqueClassroomGroupValues(group.gradeKeys);
    }
  }

  const matched = serialized.find((group) => (
    uniqueClassroomGroupValues(group.gradeKeys).some((key) => gradeKeyMatchesClassroomGroupKey(gradeKey, key))
  ));
  return matched ? uniqueClassroomGroupValues(matched.gradeKeys) : [];
}

function expandGradeKeysWithClassroomGroups(gradeKeys = [], classroomGroups = []) {
  const groups = serializeClassroomGroups(classroomGroups);
  const seen = new Set();
  const expanded = [];

  const push = (value) => {
    const text = normalizeClassroomGroupText(value);
    if (!text) {
      return;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    expanded.push(text);
  };

  (Array.isArray(gradeKeys) ? gradeKeys : []).forEach((gradeKey) => {
    push(gradeKey);
    collectSharedClassroomGradeKeys(groups, gradeKey).forEach(push);
  });

  return expanded;
}

function courseHasAcademicContentTopics(course = {}) {
  return (Array.isArray(course?.academicContent) ? course.academicContent : [])
    .some((period) => Array.isArray(period?.topics) && period.topics.length > 0);
}

function dedupeAcademicContentCoursesBySubject(courses = [], preferredGradeKeys = []) {
  const preferred = new Set(
    (Array.isArray(preferredGradeKeys) ? preferredGradeKeys : [])
      .map((value) => normalizeClassroomGroupText(value).toLowerCase())
      .filter(Boolean)
  );
  const bySubject = new Map();

  (Array.isArray(courses) ? courses : []).forEach((course) => {
    if (!courseHasAcademicContentTopics(course)) {
      return;
    }
    const subjectKey = normalizeClassroomGroupText(course?.subject || course?._id).toLowerCase() || String(course?._id || '');
    const existing = bySubject.get(subjectKey);
    if (!existing) {
      bySubject.set(subjectKey, course);
      return;
    }

    const courseGrade = normalizeClassroomGroupText(course?.studentGradeKey || course?.gradeLevel).toLowerCase();
    const existingGrade = normalizeClassroomGroupText(existing?.studentGradeKey || existing?.gradeLevel).toLowerCase();
    const courseIsPreferred = preferred.has(courseGrade);
    const existingIsPreferred = preferred.has(existingGrade);
    if (courseIsPreferred && !existingIsPreferred) {
      bySubject.set(subjectKey, course);
    }
  });

  return Array.from(bySubject.values());
}

function resolveClassroomGroupForCourse(groups = [], course = {}) {
  const serialized = serializeClassroomGroups(groups);
  const candidates = uniqueClassroomGroupValues([
    course?.classroomGroupKey,
    course?.classroomGroupLabel,
    course?.studentGradeKey,
    course?.gradeLevel,
    course?.sourceCourseKey,
  ]);

  for (const candidate of candidates) {
    const byTarget = findClassroomGroupByTarget(serialized, candidate);
    if (byTarget) {
      return byTarget;
    }

    for (const variant of classroomGroupGradeKeyCandidates(candidate)) {
      const exact = resolveClassroomGroupForGrade(serialized, variant);
      if (exact) {
        return exact;
      }
    }

    const prefixMatch = serialized.find((group) => (
      uniqueClassroomGroupValues(group?.gradeKeys).some((gradeKey) => gradeKeyMatchesClassroomGroupKey(candidate, gradeKey))
    ));
    if (prefixMatch) {
      return prefixMatch;
    }
  }

  return null;
}

function gradesShareClassroomGroup(groups = [], leftGradeKey, rightGradeKey) {
  const left = resolveClassroomGroupForGrade(groups, leftGradeKey);
  const right = resolveClassroomGroupForGrade(groups, rightGradeKey);
  return Boolean(left && right && left.key && left.key === right.key);
}

function findClassroomGroupGradeConflict(groups = [], gradeKeys = [], { ignoreGroupKey = '' } = {}) {
  const incoming = new Set(uniqueClassroomGroupValues(gradeKeys));
  if (incoming.size === 0) {
    return null;
  }

  return (Array.isArray(groups) ? groups : []).find((group) => {
    if (ignoreGroupKey && group.key === ignoreGroupKey) {
      return false;
    }
    return uniqueClassroomGroupValues(group?.gradeKeys).some((gradeKey) => incoming.has(gradeKey));
  }) || null;
}

function removeGradeFromClassroomGroups(groups = [], gradeKey) {
  const normalizedGradeKey = normalizeClassroomGroupText(gradeKey);
  return serializeClassroomGroups(
    (Array.isArray(groups) ? groups : []).map((group) => ({
      ...group,
      gradeKeys: uniqueClassroomGroupValues(group?.gradeKeys).filter((item) => item !== normalizedGradeKey),
    }))
  );
}

const CLASSROOM_GROUP_TARGET_PREFIX = 'classroom_group:';

function classroomGroupTargetValue(groupKey) {
  const key = normalizeClassroomGroupText(groupKey);
  return key ? `${CLASSROOM_GROUP_TARGET_PREFIX}${key}` : '';
}

function parseClassroomGroupTarget(value) {
  const text = normalizeClassroomGroupText(value);
  if (text.startsWith(CLASSROOM_GROUP_TARGET_PREFIX)) {
    return text.slice(CLASSROOM_GROUP_TARGET_PREFIX.length);
  }
  return '';
}

function findClassroomGroupByTarget(groups = [], target) {
  const text = normalizeClassroomGroupText(target);
  if (!text) {
    return null;
  }

  const prefixKey = parseClassroomGroupTarget(text);
  const lowered = text.toLowerCase();

  return (Array.isArray(groups) ? groups : []).find((group) => {
    const key = normalizeClassroomGroupText(group?.key);
    const label = normalizeClassroomGroupText(group?.label);
    return (
      (prefixKey && key === prefixKey)
      || key === text
      || label === text
      || key.toLowerCase() === lowered
      || label.toLowerCase() === lowered
    );
  }) || null;
}

function expandCourseTargetsWithClassroomGroups(targets = [], classroomGroups = []) {
  const groups = serializeClassroomGroups(classroomGroups);
  const seen = new Set();
  const expanded = [];

  const push = (value) => {
    const text = normalizeClassroomGroupText(value);
    if (!text) {
      return;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    expanded.push(text);
  };

  (Array.isArray(targets) ? targets : []).forEach((target) => {
    push(target);
    const group = findClassroomGroupByTarget(groups, target);
    if (!group) {
      return;
    }

    push(classroomGroupTargetValue(group.key));
    push(group.key);
    push(group.label);
    uniqueClassroomGroupValues(group.gradeKeys).forEach(push);
  });

  return expanded;
}

function buildClassroomGroupAudienceOptions(classroomGroups = []) {
  return serializeClassroomGroups(classroomGroups).map((group) => ({
    value: classroomGroupTargetValue(group.key),
    label: group.label,
    kind: 'classroom_group',
    gradeKeys: group.gradeKeys,
    aliases: uniqueClassroomGroupValues([
      group.key,
      group.label,
      classroomGroupTargetValue(group.key),
    ]),
  }));
}

module.exports = {
  CLASSROOM_GROUP_TARGET_PREFIX,
  buildClassroomGroupAudienceOptions,
  buildClassroomGroupGradeMongoOr,
  classroomGroupGradeKeyCandidates,
  classroomGroupTargetValue,
  collectSharedClassroomGradeKeys,
  courseHasAcademicContentTopics,
  dedupeAcademicContentCoursesBySubject,
  expandCourseTargetsWithClassroomGroups,
  expandGradeKeysWithClassroomGroups,
  findClassroomGroupByTarget,
  findClassroomGroupGradeConflict,
  gradeKeyMatchesClassroomGroupKey,
  gradesShareClassroomGroup,
  parseClassroomGroupTarget,
  removeGradeFromClassroomGroups,
  resolveClassroomGroupForCourse,
  resolveClassroomGroupForGrade,
  serializeClassroomGroups,
  slugifyClassroomGroupKey,
  uniqueClassroomGroupValues,
};
