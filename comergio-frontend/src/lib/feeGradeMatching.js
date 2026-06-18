export function normalizeFeeGradeText(value) {
  return String(value || '').trim();
}

export function isNumericGradeKey(value) {
  return /^\d{1,2}$/.test(normalizeFeeGradeText(value).toLowerCase());
}

export function isEducationalLevelKey(value) {
  const normalized = normalizeFeeGradeText(value).toLowerCase();
  if (!normalized) return false;
  if (isNumericGradeKey(normalized)) return false;
  return /^(maternal|kinder|prep|prejardin|jardin|transicion|toddlers|infants|nursery|k-grade|kgrade)(?:[\s_-]+\d{1,2})?$/i.test(normalized)
    || /^(maternal|prep|infants|toddlers|nursery)$/i.test(normalized);
}

function addEducationalLevelAliases(aliases, levelName, number = '') {
  const level = normalizeFeeGradeText(levelName).toLowerCase();
  if (!level) return;
  if (!number) {
    aliases.add(level);
    return;
  }
  aliases.add(`${level}_${number}`);
  aliases.add(`${level}-${number}`);
  aliases.add(`${level} ${number}`);
}

export function getFeeGradeAliases(value) {
  const normalized = normalizeFeeGradeText(value).toLowerCase();
  if (!normalized) return [];
  const aliases = new Set([normalized]);

  const normalizedLetters = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');

  if (normalizedLetters.includes('prejardin')) {
    const numberMatch = normalized.match(/(\d{1,2})/);
    addEducationalLevelAliases(aliases, 'prejardin', numberMatch?.[1] || '');
  } else if (normalizedLetters.includes('jardin')) {
    const numberMatch = normalized.match(/(\d{1,2})/);
    addEducationalLevelAliases(aliases, 'jardin', numberMatch?.[1] || '');
  }
  if (normalizedLetters.includes('transicion')) {
    aliases.add('transicion');
    aliases.add('prep');
  }

  normalized
    .split(':')
    .map((part) => normalizeFeeGradeText(part).toLowerCase())
    .filter(Boolean)
    .forEach((part) => aliases.add(part));

  const kinderMatch = normalized.match(/^kinder[\s_-]*(\d{1,2})?$/i);
  if (kinderMatch) addEducationalLevelAliases(aliases, 'kinder', kinderMatch[1] || '');

  if (/^maternal$/i.test(normalized)) aliases.add('maternal');
  if (/^prep$/i.test(normalized)) aliases.add('prep');
  if (/^infants$/i.test(normalized)) {
    aliases.add('infants');
    aliases.add('maternal');
  }
  if (/^toddlers$/i.test(normalized)) aliases.add('toddlers');
  if (/^nursery$/i.test(normalized)) aliases.add('nursery');
  if (/^k-grade$/i.test(normalized) || /^kgrade$/i.test(normalized)) aliases.add('k-grade');
  if (normalizedLetters.includes('transicion')) {
    aliases.add('transicion');
    aliases.add('prep');
  }

  const sectionMatch = normalized.match(/^(\d{1,2})\s*[-_/ ]?\s*([a-z])$/i);
  if (sectionMatch) {
    aliases.add(sectionMatch[1]);
    aliases.add(`${sectionMatch[1]}${sectionMatch[2].toLowerCase()}`);
    aliases.add(`${sectionMatch[1]} ${sectionMatch[2].toLowerCase()}`);
  }

  if (isNumericGradeKey(normalized)) {
    aliases.add(normalized);
  }

  const degreeMatch = normalized.match(/^(\d{1,2})[°º]?$/);
  if (degreeMatch) {
    aliases.add(degreeMatch[1]);
  }

  return [...aliases].filter(Boolean);
}

export function hasFeeSettingAmounts(setting) {
  return Number(setting?.enrollmentBonus || 0) > 0
    || Number(setting?.enrollmentFee || 0) > 0
    || Number(setting?.monthlyTuition || 0) > 0;
}

function scoreGradeFeeSettingMatch(grade, item) {
  const normalizedGrade = normalizeFeeGradeText(grade).toLowerCase();
  const itemGrade = normalizeFeeGradeText(item?.grade).toLowerCase();
  if (!itemGrade) return -1;

  if (itemGrade === normalizedGrade) return 1000;

  const queryAliases = new Set(getFeeGradeAliases(grade));
  const itemAliases = getFeeGradeAliases(item?.grade);
  const overlapCount = itemAliases.filter((alias) => queryAliases.has(alias)).length;
  if (overlapCount <= 0) return -1;

  const queryIsNumeric = isNumericGradeKey(grade);
  const itemIsNumeric = isNumericGradeKey(item?.grade);
  const queryIsEducational = isEducationalLevelKey(grade);
  const itemIsEducational = isEducationalLevelKey(item?.grade);

  if (queryIsNumeric && itemIsEducational) return -1;
  if (queryIsEducational && itemIsNumeric) return -1;

  let score = overlapCount * 10;
  if (itemAliases.includes(normalizedGrade)) score += 50;
  if (hasFeeSettingAmounts(item)) score += 5;
  return score;
}

export function findMatchingFeeSetting(gradeSettings, grade) {
  const gradeKey = typeof grade === 'object' ? (grade?.key || grade?.value || '') : grade;
  const gradeLabel = typeof grade === 'object' ? (grade?.label || '') : '';
  const settings = Array.isArray(gradeSettings) ? gradeSettings : [];
  const normalizedGradeKey = normalizeFeeGradeText(gradeKey).toLowerCase();

  if (normalizedGradeKey) {
    const exactMatch = settings.find((setting) => (
      normalizeFeeGradeText(setting?.grade).toLowerCase() === normalizedGradeKey
    ));
    if (exactMatch) return exactMatch;
  }

  const ranked = settings
    .flatMap((item) => {
      const keyScore = scoreGradeFeeSettingMatch(gradeKey, item);
      const labelScore = gradeLabel ? scoreGradeFeeSettingMatch(gradeLabel, item) : -1;
      return [
        { item, score: keyScore },
        { item, score: labelScore },
      ];
    })
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.item || null;
}

export function studentMatchesGradeKey(studentGrade = '', gradeKey = '') {
  const normalizedStudentGrade = normalizeFeeGradeText(studentGrade).toLowerCase();
  const normalizedGradeKey = normalizeFeeGradeText(gradeKey).toLowerCase();
  if (normalizedStudentGrade && normalizedGradeKey && normalizedStudentGrade === normalizedGradeKey) {
    return true;
  }

  const studentAliases = new Set(getFeeGradeAliases(studentGrade));
  const gradeAliases = getFeeGradeAliases(gradeKey);
  return gradeAliases.some((alias) => studentAliases.has(alias));
}

export function studentMatchesAnyGradeKey(studentGrade = '', gradeKeys = []) {
  return (Array.isArray(gradeKeys) ? gradeKeys : []).some((gradeKey) => (
    studentMatchesGradeKey(studentGrade, gradeKey)
  ));
}

export function resolveStructureGradeKeyForStudent(studentGrade = '', structureGrades = []) {
  const normalizedStudentGrade = normalizeFeeGradeText(studentGrade);
  if (!normalizedStudentGrade) {
    return '';
  }

  const grades = Array.isArray(structureGrades) ? structureGrades : [];
  if (!grades.length) {
    return normalizedStudentGrade;
  }

  const ranked = grades
    .map((grade) => {
      const keyScore = studentMatchesGradeKey(normalizedStudentGrade, grade?.key) ? 100 : -1;
      const labelScore = studentMatchesGradeKey(normalizedStudentGrade, grade?.label) ? 100 : -1;
      return { grade, score: Math.max(keyScore, labelScore) };
    })
    .filter((entry) => entry.score >= 0);

  if (ranked.length > 0) {
    return normalizeFeeGradeText(ranked[0]?.grade?.key || '');
  }

  return normalizedStudentGrade;
}

export function buildAcademicStructureGradeMetadataIndex(structureGrades = [], levelLabels = {}) {
  return (Array.isArray(structureGrades) ? structureGrades : []).reduce((accumulator, grade) => {
    const gradeKey = normalizeFeeGradeText(grade?.key);
    const gradeLabel = normalizeFeeGradeText(grade?.label || gradeKey);
    const levelKey = normalizeFeeGradeText(grade?.levelKey);
    const levelLabel = normalizeFeeGradeText(levelLabels[levelKey] || levelKey) || 'Sin nivel';
    const metadata = {
      gradeKey,
      gradeLabel: gradeLabel || gradeKey,
      levelKey,
      levelLabel: levelLabel || 'Sin nivel',
    };

    [gradeKey, gradeLabel, ...getFeeGradeAliases(gradeKey), ...getFeeGradeAliases(gradeLabel)]
      .filter(Boolean)
      .forEach((alias) => {
        accumulator[normalizeFeeGradeText(alias)] = metadata;
      });

    return accumulator;
  }, {});
}

export function gradesMatchForFilter(studentGrade, filterGrade) {
  return studentMatchesGradeKey(studentGrade, filterGrade);
}
