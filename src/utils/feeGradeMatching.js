function normalizeText(value) {
  return String(value || '').trim();
}

function isNumericGradeKey(value) {
  return /^\d{1,2}$/.test(normalizeText(value).toLowerCase());
}

function isEducationalLevelKey(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return false;
  if (isNumericGradeKey(normalized)) return false;
  return /^(maternal|kinder|prep|prejardin|jardin|transicion|toddlers|infants|nursery|k-grade|kgrade)(?:[\s_-]+\d{1,2})?$/i.test(normalized)
    || /^(maternal|prep|infants|toddlers|nursery)$/i.test(normalized);
}

function addEducationalLevelAliases(aliases, levelName, number = '') {
  const level = normalizeText(levelName).toLowerCase();
  if (!level) return;
  if (!number) {
    aliases.add(level);
    return;
  }
  aliases.add(`${level}_${number}`);
  aliases.add(`${level}-${number}`);
  aliases.add(`${level} ${number}`);
}

function getFeeGradeAliases(value) {
  const normalized = normalizeText(value).toLowerCase();
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
    .map((part) => normalizeText(part).toLowerCase())
    .filter(Boolean)
    .forEach((part) => aliases.add(part));

  const kinderMatch = normalized.match(/^kinder[\s_-]*(\d{1,2})?$/i);
  if (kinderMatch) addEducationalLevelAliases(aliases, 'kinder', kinderMatch[1] || '');

  if (/^maternal$/i.test(normalized)) {
    aliases.add('maternal');
    aliases.add('infants');
  }
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

function normalizeGradeComparisonKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[°º.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreStructureGradeMatch(rawGrade, structureGrade) {
  const gradeKey = normalizeText(structureGrade?.key);
  const gradeLabel = normalizeText(structureGrade?.label);
  if (!gradeKey) {
    return -1;
  }

  const normalizedRaw = normalizeText(rawGrade);
  if (!normalizedRaw) {
    return -1;
  }

  if (normalizedRaw === gradeKey || normalizedRaw === gradeLabel) {
    return 1000;
  }

  const rawComparison = normalizeGradeComparisonKey(normalizedRaw);
  if (rawComparison === normalizeGradeComparisonKey(gradeKey)) {
    return 900;
  }
  if (rawComparison === normalizeGradeComparisonKey(gradeLabel)) {
    return 900;
  }

  const rawAliases = new Set(getFeeGradeAliases(normalizedRaw));
  const targetAliases = new Set([
    ...getFeeGradeAliases(gradeKey),
    ...getFeeGradeAliases(gradeLabel),
  ]);
  const overlap = [...rawAliases].filter((alias) => targetAliases.has(alias)).length;
  if (overlap <= 0) {
    return -1;
  }

  let score = overlap * 10;
  if (targetAliases.has(normalizedRaw.toLowerCase())) {
    score += 50;
  }
  return score;
}

function resolveAcademicStructureGradeKey(rawGrade, structureGrades = []) {
  const normalizedRaw = normalizeText(rawGrade);
  if (!normalizedRaw) {
    return '';
  }

  const grades = Array.isArray(structureGrades) ? structureGrades : [];
  if (!grades.length) {
    return normalizedRaw;
  }

  const ranked = grades
    .map((grade) => ({ grade, score: scoreStructureGradeMatch(normalizedRaw, grade) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score);

  return normalizeText(ranked[0]?.grade?.key) || normalizedRaw;
}

function findAcademicStructureGradeForStudent(rawGrade, structureGrades = []) {
  const grades = Array.isArray(structureGrades) ? structureGrades : [];
  if (!grades.length) {
    return null;
  }

  const resolvedKey = resolveAcademicStructureGradeKey(rawGrade, grades);
  const directMatch = grades.find((grade) => normalizeText(grade?.key) === resolvedKey);
  if (directMatch) {
    return directMatch;
  }

  const ranked = grades
    .map((grade) => ({ grade, score: scoreStructureGradeMatch(rawGrade, grade) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.grade || null;
}

function buildAcademicStructureGradeMetadataIndex(structureGrades = [], levelLabels = {}) {
  return (Array.isArray(structureGrades) ? structureGrades : []).reduce((accumulator, grade) => {
    const gradeKey = normalizeText(grade?.key);
    const gradeLabel = normalizeText(grade?.label || gradeKey);
    const levelKey = normalizeText(grade?.levelKey);
    const levelLabel = normalizeText(levelLabels[levelKey] || levelKey) || 'Sin nivel';
    const metadata = {
      gradeKey,
      gradeLabel: gradeLabel || gradeKey,
      levelKey,
      levelLabel: levelLabel || 'Sin nivel',
    };

    [gradeKey, gradeLabel, ...getFeeGradeAliases(gradeKey), ...getFeeGradeAliases(gradeLabel)]
      .filter(Boolean)
      .forEach((alias) => {
        accumulator[normalizeText(alias)] = metadata;
      });

    return accumulator;
  }, {});
}

function gradesMatchForFilter(studentGrade, filterGrade) {
  const normalizedStudent = normalizeText(studentGrade);
  const normalizedFilter = normalizeText(filterGrade);
  if (!normalizedFilter) {
    return true;
  }
  if (!normalizedStudent) {
    return false;
  }
  if (normalizedStudent === normalizedFilter) {
    return true;
  }

  const studentAliases = new Set(getFeeGradeAliases(normalizedStudent));
  const filterAliases = new Set(getFeeGradeAliases(normalizedFilter));
  if (studentAliases.has(normalizedFilter.toLowerCase())) {
    return true;
  }
  if (filterAliases.has(normalizedStudent.toLowerCase())) {
    return true;
  }

  return [...studentAliases].some((alias) => filterAliases.has(alias));
}

function hasAnyFeeAmount(value) {
  if (Array.isArray(value)) {
    return value.some((setting) => hasAnyFeeAmount(setting));
  }

  if (!value) return false;
  return Number(value?.enrollmentBonus || 0) > 0
    || Number(value?.enrollmentFee || 0) > 0
    || Number(value?.monthlyTuition || 0) > 0;
}

function normalizeFeeAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function getKinderSetting(settings, gradeNumber) {
  const targetAliases = new Set([
    `kinder_${gradeNumber}`,
    `kinder-${gradeNumber}`,
    `kinder ${gradeNumber}`,
  ]);
  return (Array.isArray(settings) ? settings : []).find((item) => (
    targetAliases.has(normalizeText(item?.grade).toLowerCase())
  )) || null;
}

function isContaminatedNumericGrade(gradeKey, setting, allSettings) {
  if (!isNumericGradeKey(gradeKey) || !setting) return false;
  const kinderSetting = getKinderSetting(allSettings, gradeKey);
  if (!kinderSetting) return false;
  return normalizeFeeAmount(setting.monthlyTuition) > 0
    && normalizeFeeAmount(setting.monthlyTuition) === normalizeFeeAmount(kinderSetting.monthlyTuition);
}

function applySnapshotCostsToSetting(setting, gradeKey, snapshotCostsByGrade = {}) {
  const costs = snapshotCostsByGrade?.[gradeKey] || {};
  const snapshotTuition = normalizeFeeAmount(costs.tuition ?? costs.monthlyTuition ?? costs.pension);
  const snapshotEnrollment = normalizeFeeAmount(costs.enrollment ?? costs.enrollmentFee ?? costs.matricula);
  const snapshotBonus = normalizeFeeAmount(costs.bond ?? costs.enrollmentBonus ?? costs.bono);

  const repaired = { ...setting };
  if (snapshotTuition > 0 && snapshotTuition !== normalizeFeeAmount(setting?.monthlyTuition)) {
    repaired.monthlyTuition = snapshotTuition;
  }
  if (snapshotEnrollment > 0 && snapshotEnrollment !== normalizeFeeAmount(setting?.enrollmentFee)) {
    repaired.enrollmentFee = snapshotEnrollment;
  }
  if (snapshotBonus > 0) {
    repaired.enrollmentBonus = snapshotBonus;
  }
  return repaired;
}

function canonicalizeGradeFeeSettingsForStructure(gradeSettings = [], structureGrades = [], options = {}) {
  const snapshotCostsByGrade = options?.snapshotCostsByGrade || {};
  const configuration = { gradeSettings: Array.isArray(gradeSettings) ? gradeSettings : [] };

  return (Array.isArray(structureGrades) ? structureGrades : [])
    .map((grade) => {
      const gradeKey = normalizeText(grade?.key || grade);
      const gradeLabel = normalizeText(grade?.label || gradeKey);
      if (!gradeKey) return null;

      let matched = findGradeFeeSetting(configuration, gradeKey)
        || (gradeLabel !== gradeKey ? findGradeFeeSetting(configuration, gradeLabel) : null);

      if (isContaminatedNumericGrade(gradeKey, matched, configuration.gradeSettings)) {
        matched = applySnapshotCostsToSetting(matched, gradeKey, snapshotCostsByGrade);
      }

      return {
        grade: gradeKey,
        enrollmentFee: normalizeFeeAmount(matched?.enrollmentFee),
        monthlyTuition: normalizeFeeAmount(matched?.monthlyTuition),
        enrollmentBonus: normalizeFeeAmount(matched?.enrollmentBonus),
        dueDay: Number(matched?.dueDay || 10),
        benefitRules: Array.isArray(matched?.benefitRules) ? matched.benefitRules : [],
      };
    })
    .filter((item) => item?.grade);
}

function scoreGradeFeeSettingMatch(grade, item) {
  const normalizedGrade = normalizeText(grade).toLowerCase();
  const itemGrade = normalizeText(item?.grade).toLowerCase();
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
  if (hasAnyFeeAmount(item)) score += 5;
  return score;
}

function findGradeFeeSetting(configuration, grade) {
  const settings = Array.isArray(configuration?.gradeSettings) ? configuration.gradeSettings : [];
  const ranked = settings
    .map((item) => ({ item, score: scoreGradeFeeSettingMatch(grade, item) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.item || null;
}

module.exports = {
  applySnapshotCostsToSetting,
  buildAcademicStructureGradeMetadataIndex,
  canonicalizeGradeFeeSettingsForStructure,
  findAcademicStructureGradeForStudent,
  findGradeFeeSetting,
  getFeeGradeAliases,
  gradesMatchForFilter,
  hasAnyFeeAmount,
  isContaminatedNumericGrade,
  isEducationalLevelKey,
  isNumericGradeKey,
  normalizeFeeAmount,
  normalizeGradeComparisonKey,
  normalizeText,
  resolveAcademicStructureGradeKey,
  scoreStructureGradeMatch,
};
