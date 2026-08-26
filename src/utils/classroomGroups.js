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

function resolveClassroomGroupForCourse(groups = [], course = {}) {
  const candidates = [
    course?.studentGradeKey,
    course?.gradeLevel,
    course?.sourceCourseKey,
  ].map(normalizeClassroomGroupText).filter(Boolean);

  for (const candidate of candidates) {
    const exact = resolveClassroomGroupForGrade(groups, candidate);
    if (exact) {
      return exact;
    }

    const prefixMatch = (Array.isArray(groups) ? groups : []).find((group) => (
      uniqueClassroomGroupValues(group?.gradeKeys).some((gradeKey) => (
        candidate === gradeKey || candidate.startsWith(`${gradeKey}:`)
      ))
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
  classroomGroupTargetValue,
  expandCourseTargetsWithClassroomGroups,
  findClassroomGroupByTarget,
  findClassroomGroupGradeConflict,
  gradesShareClassroomGroup,
  parseClassroomGroupTarget,
  removeGradeFromClassroomGroups,
  resolveClassroomGroupForCourse,
  resolveClassroomGroupForGrade,
  serializeClassroomGroups,
  slugifyClassroomGroupKey,
  uniqueClassroomGroupValues,
};
