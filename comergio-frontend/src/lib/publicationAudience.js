export const CLASSROOM_GROUP_TARGET_PREFIX = 'classroom_group:';

export function classroomGroupTargetValue(groupKey) {
  const key = String(groupKey || '').trim();
  return key ? `${CLASSROOM_GROUP_TARGET_PREFIX}${key}` : '';
}

function normalizeAudienceText(value) {
  return String(value || '').trim();
}

export function buildPublicationAudienceCourseOptions({ classroomGroups = [], courseOptions = [] } = {}) {
  const groups = [];
  const seen = new Set();

  const pushGroup = (group) => {
    const value = normalizeAudienceText(group?.value);
    const label = normalizeAudienceText(group?.label);
    if (!value || !label || seen.has(value)) {
      return;
    }
    seen.add(value);
    groups.push({
      value,
      label,
      kind: 'classroom_group',
      gradeKeys: Array.isArray(group?.gradeKeys) ? group.gradeKeys : [],
      aliases: Array.isArray(group?.aliases) ? group.aliases : [label],
      order: Number(group?.order || (groups.length + 1) * 10),
    });
  };

  (Array.isArray(classroomGroups) ? classroomGroups : [])
    .map((group, index) => {
      const label = normalizeAudienceText(group?.label || group?.name || group?.key);
      const key = normalizeAudienceText(group?.key) || label;
      const gradeKeys = Array.from(new Set((Array.isArray(group?.gradeKeys) ? group.gradeKeys : [])
        .map((gradeKey) => normalizeAudienceText(gradeKey))
        .filter(Boolean)));
      if (!key || !label || gradeKeys.length === 0) {
        return null;
      }

      return {
        value: classroomGroupTargetValue(key),
        label,
        gradeKeys,
        aliases: [key, label, classroomGroupTargetValue(key)],
        order: Number(group?.order || (index + 1) * 10),
      };
    })
    .filter(Boolean)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || left.label.localeCompare(right.label, 'es', { numeric: true }))
    .forEach(pushGroup);

  (Array.isArray(courseOptions) ? courseOptions : []).forEach((course) => {
    const value = normalizeAudienceText(course?.value);
    if (course?.kind === 'classroom_group' || course?.source === 'classroom-group' || value.startsWith(CLASSROOM_GROUP_TARGET_PREFIX)) {
      pushGroup({
        value,
        label: course?.label || value,
        gradeKeys: course?.gradeKeys,
        aliases: course?.aliases,
        order: course?.order,
      });
    }
  });
  const individuals = (Array.isArray(courseOptions) ? courseOptions : [])
    .map((course) => {
      const value = normalizeAudienceText(course?.value);
      const label = normalizeAudienceText(course?.label || course?.value);
      if (!value || !label || seen.has(value) || value.startsWith(CLASSROOM_GROUP_TARGET_PREFIX) || course?.kind === 'classroom_group' || course?.source === 'classroom-group') {
        return null;
      }

      seen.add(value);
      return {
        value,
        label,
        kind: 'course',
        gradeKeys: Array.isArray(course?.gradeKeys) ? course.gradeKeys : [],
        aliases: Array.isArray(course?.aliases) ? course.aliases : [],
      };
    })
    .filter(Boolean);

  return [...groups, ...individuals];
}

export function mapTargetsToAudienceOptionValues(targets = [], options = []) {
  const byValue = new Map();
  const byAlias = new Map();

  (Array.isArray(options) ? options : []).forEach((option) => {
    const value = normalizeAudienceText(option?.value);
    if (!value) {
      return;
    }
    byValue.set(value, value);
    byAlias.set(value.toLowerCase(), value);
    byAlias.set(normalizeAudienceText(option?.label).toLowerCase(), value);
    (Array.isArray(option?.aliases) ? option.aliases : []).forEach((alias) => {
      const aliasText = normalizeAudienceText(alias).toLowerCase();
      if (aliasText) {
        byAlias.set(aliasText, value);
      }
    });
    (Array.isArray(option?.gradeKeys) ? option.gradeKeys : []).forEach((gradeKey) => {
      const aliasText = normalizeAudienceText(gradeKey).toLowerCase();
      if (aliasText && option?.kind === 'course') {
        byAlias.set(aliasText, value);
      }
    });
    if (option?.kind === 'classroom_group' && value.startsWith(CLASSROOM_GROUP_TARGET_PREFIX)) {
      byAlias.set(value.slice(CLASSROOM_GROUP_TARGET_PREFIX.length).toLowerCase(), value);
    }
  });

  const mapped = [];
  const seen = new Set();
  (Array.isArray(targets) ? targets : []).forEach((raw) => {
    const text = normalizeAudienceText(raw);
    if (!text) {
      return;
    }
    const value = byValue.get(text) || byAlias.get(text.toLowerCase());
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    mapped.push(value);
  });

  return mapped;
}

export function compactPublicationCourseTargetLabels(targets = [], options = [], fallbackTitle = '') {
  const optionList = Array.isArray(options) ? options : [];
  const optionByValue = new Map(optionList.map((option) => [normalizeAudienceText(option.value), option]));
  const optionByLabel = new Map(optionList.map((option) => [normalizeAudienceText(option.label).toLowerCase(), option]));
  const selectedGroupGradeKeys = new Set();
  const labels = [];
  const seen = new Set();

  const pushLabel = (label) => {
    const text = normalizeAudienceText(label);
    if (!text) {
      return;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    labels.push(text);
  };

  const allTargets = [fallbackTitle, ...(Array.isArray(targets) ? targets : [])]
    .map((item) => normalizeAudienceText(item))
    .filter(Boolean);

  allTargets.forEach((target) => {
    const option = optionByValue.get(target)
      || optionByLabel.get(target.toLowerCase())
      || (target.startsWith(CLASSROOM_GROUP_TARGET_PREFIX)
        ? optionByValue.get(target)
        : null);
    if (option?.kind === 'classroom_group') {
      (Array.isArray(option.gradeKeys) ? option.gradeKeys : []).forEach((gradeKey) => {
        selectedGroupGradeKeys.add(normalizeAudienceText(gradeKey).toLowerCase());
      });
      pushLabel(option.label);
    }
  });

  allTargets.forEach((target) => {
    if (target.startsWith(CLASSROOM_GROUP_TARGET_PREFIX)) {
      const option = optionByValue.get(target);
      if (option) {
        pushLabel(option.label);
      }
      return;
    }

    const option = optionByValue.get(target) || optionByLabel.get(target.toLowerCase());
    if (option?.kind === 'classroom_group') {
      pushLabel(option.label);
      return;
    }

    const candidate = option?.label || target;
    if (selectedGroupGradeKeys.has(normalizeAudienceText(candidate).toLowerCase())
      || selectedGroupGradeKeys.has(normalizeAudienceText(option?.value).toLowerCase())
      || selectedGroupGradeKeys.has(target.toLowerCase())) {
      return;
    }

    if (option) {
      pushLabel(option.label);
      return;
    }

    if (/^[a-z0-9:_-]+$/i.test(target) && target.includes(':') && !target.startsWith(CLASSROOM_GROUP_TARGET_PREFIX)) {
      return;
    }

    pushLabel(candidate);
  });

  return labels.length > 0 ? labels.join(', ') : 'Sin curso indicado';
}

export function addAudienceListValue(current = [], value) {
  const nextValue = normalizeAudienceText(value);
  if (!nextValue) {
    return Array.isArray(current) ? current : [];
  }
  const currentValues = (Array.isArray(current) ? current : []).map(String);
  return currentValues.includes(nextValue) ? currentValues : [...currentValues, nextValue];
}

export function removeAudienceListValue(current = [], value) {
  return (Array.isArray(current) ? current : []).filter((item) => String(item) !== String(value));
}
