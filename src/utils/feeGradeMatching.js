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
  if (normalizedLetters.includes('transicion')) aliases.add('transicion');

  normalized
    .split(':')
    .map((part) => normalizeText(part).toLowerCase())
    .filter(Boolean)
    .forEach((part) => aliases.add(part));

  const kinderMatch = normalized.match(/^kinder[\s_-]*(\d{1,2})?$/i);
  if (kinderMatch) addEducationalLevelAliases(aliases, 'kinder', kinderMatch[1] || '');

  if (/^maternal$/i.test(normalized)) aliases.add('maternal');
  if (/^prep$/i.test(normalized)) aliases.add('prep');
  if (/^infants$/i.test(normalized)) aliases.add('infants');
  if (/^toddlers$/i.test(normalized)) aliases.add('toddlers');
  if (/^nursery$/i.test(normalized)) aliases.add('nursery');
  if (/^k-grade$/i.test(normalized) || /^kgrade$/i.test(normalized)) aliases.add('k-grade');

  const sectionMatch = normalized.match(/^(\d{1,2})\s*[-_/ ]?\s*([a-z])$/i);
  if (sectionMatch) {
    aliases.add(sectionMatch[1]);
    aliases.add(`${sectionMatch[1]}${sectionMatch[2].toLowerCase()}`);
    aliases.add(`${sectionMatch[1]} ${sectionMatch[2].toLowerCase()}`);
  }

  if (isNumericGradeKey(normalized)) {
    aliases.add(normalized);
  }

  return [...aliases].filter(Boolean);
}

function hasAnyFeeAmount(setting) {
  if (!setting) return false;
  return Number(setting?.enrollmentBonus || 0) > 0
    || Number(setting?.enrollmentFee || 0) > 0
    || Number(setting?.monthlyTuition || 0) > 0;
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
  canonicalizeGradeFeeSettingsForStructure,
  findGradeFeeSetting,
  getFeeGradeAliases,
  hasAnyFeeAmount,
  isContaminatedNumericGrade,
  isEducationalLevelKey,
  isNumericGradeKey,
  normalizeFeeAmount,
  normalizeText,
};
