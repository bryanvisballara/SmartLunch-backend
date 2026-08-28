import { formatEducationalGradeLabel, isRawInternalGradeToken } from './educationalGradeLabels';

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

function labelDedupeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

function normalizeGradeKey(value) {
  return labelDedupeKey(value).replace(/\s+/g, '_');
}

function isMongoObjectIdToken(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

function looksMashedAudienceToken(value) {
  const text = String(value || '').trim();
  if (!text) {
    return true;
  }
  const compact = text.replace(/[\s_-]+/g, '').toLowerCase();
  if (/^(kinder\d)\1/.test(compact) || /^(infants|kinder|toddlers|toodlers|maternal)\1$/.test(compact)) {
    return true;
  }
  return /[a-z][A-Z]/.test(text) && !/\s/.test(text) && text.length > 6;
}

function catalogHasKinder2(options = []) {
  return (Array.isArray(options) ? options : []).some((option) => {
    const keys = Array.isArray(option?.gradeKeys) ? option.gradeKeys : [];
    if (keys.some((key) => /^(kinder_?2|k2)$/i.test(normalizeGradeKey(key)))) {
      return true;
    }
    return /kinder\s*2|\bk2\b/i.test(String(option?.label || ''));
  });
}

function catalogHasDistinctKinder1(options = []) {
  return (Array.isArray(options) ? options : []).some((option) => {
    const keys = Array.isArray(option?.gradeKeys) ? option.gradeKeys : [];
    const hasK1 = keys.some((key) => /^(kinder_?1|k1)$/i.test(normalizeGradeKey(key)));
    const label = String(option?.label || '');
    return (hasK1 && /kinder\s*1/i.test(label)) || /^kinder\s*1$/i.test(label.trim());
  });
}

function remapLegacyKinderLabel(label, options = [], rawValue = '') {
  if (label !== 'Kinder 1') {
    return label;
  }
  if (catalogHasDistinctKinder1(options)) {
    return 'Kinder 1';
  }
  if (catalogHasKinder2(options)) {
    return 'Kinder 2';
  }
  if (/^(kinder[_-]?1|k1)$/i.test(String(rawValue || '').trim())) {
    return '';
  }
  return 'Kinder 1';
}

function expandLegacyKinderKeys(value, options = []) {
  const key = normalizeGradeKey(value);
  if (!key) {
    return [];
  }
  const aliasLegacyKinder = !catalogHasDistinctKinder1(options) && catalogHasKinder2(options);
  if ((key === 'kinder_1' || key === 'k1') && aliasLegacyKinder) {
    return ['kinder_1', 'kinder_2', 'k1', 'k2'];
  }
  if ((key === 'kinder_2' || key === 'k2') && aliasLegacyKinder) {
    return ['kinder_2', 'kinder_1', 'k2', 'k1'];
  }
  return [key];
}

function humanizeAudienceToken(value, options = []) {
  return remapLegacyKinderLabel(formatEducationalGradeLabel(value), options, value) || '';
}

function expandAudienceTokens(value) {
  const text = normalizeAudienceText(value);
  if (!text || isMongoObjectIdToken(text) || looksMashedAudienceToken(text)) {
    return [];
  }
  if (text.includes(' · ')) {
    return text.split(' · ').map((part) => normalizeAudienceText(part)).filter(Boolean);
  }
  return [text];
}

function indexAudienceOptions(options = []) {
  const optionList = Array.isArray(options) ? options : [];
  const byValue = new Map();
  const byAlias = new Map();

  const addAlias = (alias, option) => {
    const key = normalizeAudienceText(alias).toLowerCase();
    if (key && !byAlias.has(key)) {
      byAlias.set(key, option);
    }
  };

  optionList.filter((option) => option?.kind === 'classroom_group').forEach((option) => {
    const value = normalizeAudienceText(option.value);
    if (value) {
      byValue.set(value, option);
    }
    addAlias(value, option);
    addAlias(option.label, option);
    (Array.isArray(option.aliases) ? option.aliases : []).forEach((alias) => addAlias(alias, option));
    (Array.isArray(option.gradeKeys) ? option.gradeKeys : []).forEach((gradeKey) => addAlias(gradeKey, option));
    if (value.startsWith(CLASSROOM_GROUP_TARGET_PREFIX)) {
      addAlias(value.slice(CLASSROOM_GROUP_TARGET_PREFIX.length), option);
    }
  });

  optionList.forEach((option) => {
    const value = normalizeAudienceText(option.value);
    if (!value) {
      return;
    }
    if (!byValue.has(value)) {
      byValue.set(value, option);
    }
    addAlias(value, option);
    addAlias(option.label, option);
    (Array.isArray(option.aliases) ? option.aliases : []).forEach((alias) => addAlias(alias, option));
    if (option.kind === 'course') {
      (Array.isArray(option.gradeKeys) ? option.gradeKeys : []).forEach((gradeKey) => addAlias(gradeKey, option));
    }
  });

  return { optionList, byValue, byAlias };
}

function matchTargetToGroup(target, group, options = []) {
  const aliases = new Set(
    [group?.value, group?.label, ...(Array.isArray(group?.aliases) ? group.aliases : [])]
      .map((item) => normalizeAudienceText(item).toLowerCase())
      .filter(Boolean)
  );
  const lowered = target.toLowerCase();
  if (aliases.has(lowered)) {
    return 'group';
  }
  const groupValue = normalizeAudienceText(group?.value);
  if (groupValue.startsWith(CLASSROOM_GROUP_TARGET_PREFIX)
    && lowered === groupValue.slice(CLASSROOM_GROUP_TARGET_PREFIX.length).toLowerCase()) {
    return 'group';
  }

  const targetKeys = new Set(expandLegacyKinderKeys(target, options));
  const formattedTarget = labelDedupeKey(humanizeAudienceToken(target, options));
  const memberKeys = Array.isArray(group?.gradeKeys) ? group.gradeKeys : [];
  for (const gradeKey of memberKeys) {
    if (expandLegacyKinderKeys(gradeKey, options).some((key) => targetKeys.has(key))) {
      return 'member';
    }
    const formattedMember = labelDedupeKey(humanizeAudienceToken(gradeKey, options) || gradeKey);
    if (formattedTarget && formattedMember && formattedTarget === formattedMember) {
      return 'member';
    }
  }
  return null;
}

export function compactPublicationCourseTargetLabels(targets = [], options = [], fallbackTitle = '') {
  const { optionList, byValue, byAlias } = indexAudienceOptions(options);
  const groups = optionList.filter((option) => option?.kind === 'classroom_group');
  const tokens = [];
  const seenTokens = new Set();

  [fallbackTitle, ...(Array.isArray(targets) ? targets : [])].forEach((raw) => {
    expandAudienceTokens(raw).forEach((token) => {
      const key = token.toLowerCase();
      if (seenTokens.has(key)) {
        return;
      }
      seenTokens.add(key);
      tokens.push(token);
    });
  });

  const resolveOption = (target) => byValue.get(target) || byAlias.get(target.toLowerCase()) || null;

  const matchedGroups = new Map();
  const matchedCourses = new Map();
  const leftovers = [];

  tokens.forEach((target) => {
    const option = resolveOption(target);
    if (option?.kind === 'classroom_group') {
      matchedGroups.set(option.value, option);
      return;
    }
    if (option?.kind === 'course') {
      matchedCourses.set(option.value, option);
      return;
    }
    leftovers.push(target);
  });

  groups.forEach((group) => {
    if (matchedGroups.has(group.value)) {
      return;
    }
    const memberHits = new Set();
    let hasGroupToken = false;
    tokens.forEach((target) => {
      const match = matchTargetToGroup(target, group, optionList);
      if (match === 'group') {
        hasGroupToken = true;
      }
      if (match === 'member') {
        memberHits.add(normalizeGradeKey(humanizeAudienceToken(target, optionList) || target));
      }
    });
    if (hasGroupToken || memberHits.size >= 2) {
      matchedGroups.set(group.value, group);
    }
  });

  const coveredGradeKeys = new Set();
  const coveredLabelKeys = new Set();
  matchedGroups.forEach((group) => {
    coveredLabelKeys.add(labelDedupeKey(group.label));
    (Array.isArray(group.gradeKeys) ? group.gradeKeys : []).forEach((gradeKey) => {
      expandLegacyKinderKeys(gradeKey, optionList).forEach((key) => coveredGradeKeys.add(key));
      const formatted = humanizeAudienceToken(gradeKey, optionList);
      if (formatted) {
        coveredLabelKeys.add(labelDedupeKey(formatted));
      }
    });
  });

  const labels = [];
  const seenLabels = new Set();
  const pushLabel = (label) => {
    const text = normalizeAudienceText(label);
    if (!text || isMongoObjectIdToken(text) || looksMashedAudienceToken(text)) {
      return;
    }
    const key = labelDedupeKey(text);
    if (!key || seenLabels.has(key)) {
      return;
    }
    seenLabels.add(key);
    labels.push(text);
  };

  matchedGroups.forEach((group) => pushLabel(group.label));

  matchedCourses.forEach((course) => {
    const courseKeys = (Array.isArray(course.gradeKeys) ? course.gradeKeys : [])
      .flatMap((gradeKey) => expandLegacyKinderKeys(gradeKey, optionList));
    if (courseKeys.some((key) => coveredGradeKeys.has(key))) {
      return;
    }
    const courseLabel = normalizeAudienceText(course.label);
    if ([...matchedGroups.values()].some((group) => courseLabel.toLowerCase().includes(String(group.label || '').toLowerCase()))) {
      return;
    }
    if (coveredLabelKeys.has(labelDedupeKey(courseLabel))) {
      return;
    }
    pushLabel(courseLabel);
  });

  leftovers.forEach((target) => {
    if (target.startsWith(CLASSROOM_GROUP_TARGET_PREFIX) || (target.includes(':') && isRawInternalGradeToken(target))) {
      return;
    }
    if (coveredGradeKeys.has(normalizeGradeKey(target)) || expandLegacyKinderKeys(target, optionList).some((key) => coveredGradeKeys.has(key))) {
      return;
    }
    const human = humanizeAudienceToken(target, optionList);
    if (human && coveredLabelKeys.has(labelDedupeKey(human))) {
      return;
    }
    if (human) {
      pushLabel(human);
      return;
    }
    if (labels.length > 0 || isRawInternalGradeToken(target) || /^[a-z0-9:_-]+$/i.test(target)) {
      return;
    }
    pushLabel(target);
  });

  if (!labels.length && fallbackTitle) {
    const fallbackParts = expandAudienceTokens(fallbackTitle);
    const lastPart = fallbackParts[fallbackParts.length - 1] || '';
    const option = resolveOption(lastPart);
    if (option?.label) {
      pushLabel(option.label);
    } else {
      pushLabel(humanizeAudienceToken(lastPart, optionList) || lastPart);
    }
  }

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
