const CampusCoexistencePolicy = require('../models/campusCoexistencePolicy.model');
const CampusDisciplineObservation = require('../models/campusDisciplineObservation.model');
const { isMillenniumSchoolId } = require('../utils/millenniumSchool');
const {
  buildMillenniumDisciplineInfractions,
  looksLikeGenericCoexistenceDefaults,
} = require('../data/millenniumDisciplineChart');
const { buildMillenniumCoexistenceBulletinTemplates } = require('../data/millenniumCoexistenceBulletinTemplates');

function normalizeText(value) {
  return String(value || '').trim();
}

function slugifyInfractionKey(value, fallback = 'infraccion') {
  const base = normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return base || fallback;
}

function clampPercent(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, Number(numeric.toFixed(2))));
}

function serializeInfraction(item = {}, index = 0) {
  const code = normalizeText(item.code).toUpperCase();
  return {
    key: normalizeText(item.key) || slugifyInfractionKey(code || item.label, `infraccion_${index + 1}`),
    code,
    categoryKey: normalizeText(item.categoryKey).toUpperCase(),
    categoryLabel: normalizeText(item.categoryLabel),
    label: normalizeText(item.label),
    deductionPercent: clampPercent(item.deductionPercent, 0),
    severityPercent: clampPercent(item.severityPercent, 0),
    description: normalizeText(item.description),
    active: item.active !== false,
    order: Number(item.order ?? (index + 1) * 10),
  };
}

function getDefaultInfractionsForSchool(schoolId) {
  if (isMillenniumSchoolId(schoolId)) {
    return buildMillenniumDisciplineInfractions();
  }

  return [
    {
      key: 'llegada_tarde',
      label: 'Llegada tarde',
      deductionPercent: 5,
      description: 'Inasistencia puntual a clase o actividad.',
      active: true,
      order: 10,
    },
    {
      key: 'copia_examen',
      label: 'Copia de examen',
      deductionPercent: 25,
      description: 'Fraude académico en evaluación.',
      active: true,
      order: 20,
    },
  ];
}

function serializeBulletinObservationTemplate(item = {}, index = 0) {
  const minScore = clampPercent(item?.minScore, 0);
  const maxScore = clampPercent(item?.maxScore, 100);
  return {
    key: normalizeText(item.key) || slugifyInfractionKey(item?.label, `nivel_${index + 1}`),
    label: normalizeText(item.label).slice(0, 120),
    minScore: Math.min(minScore, maxScore),
    maxScore: Math.max(minScore, maxScore),
    text: normalizeText(item.text).slice(0, 4000),
    active: item.active !== false,
    order: Number(item.order ?? (index + 1) * 10),
  };
}

function serializeCoexistencePolicy(policy) {
  const startingScore = clampPercent(policy?.startingScore ?? 100, 100);
  const infractions = (Array.isArray(policy?.infractions) ? policy.infractions : [])
    .map(serializeInfraction)
    .filter((item) => item.label)
    .sort((left, right) => left.order - right.order || left.code.localeCompare(right.code, 'es') || left.label.localeCompare(right.label, 'es'));
  const bulletinObservationTemplates = (Array.isArray(policy?.bulletinObservationTemplates)
    ? policy.bulletinObservationTemplates
    : [])
    .map(serializeBulletinObservationTemplate)
    .filter((item) => item.text)
    .sort((left, right) => left.order - right.order || left.minScore - right.minScore);

  return {
    id: policy?._id ? String(policy._id) : '',
    schoolId: normalizeText(policy?.schoolId),
    startingScore,
    infractions,
    bulletinObservationTemplates,
    updatedByUserId: policy?.updatedByUserId ? String(policy.updatedByUserId) : '',
    updatedByName: normalizeText(policy?.updatedByName),
    updatedAt: policy?.updatedAt || null,
    createdAt: policy?.createdAt || null,
  };
}

function getDefaultBulletinObservationTemplatesForSchool(schoolId) {
  if (isMillenniumSchoolId(schoolId)) {
    return buildMillenniumCoexistenceBulletinTemplates();
  }
  return [];
}

function normalizeBulletinObservationTemplatesInput(rawTemplates = []) {
  const list = Array.isArray(rawTemplates) ? rawTemplates : [];
  const usedKeys = new Set();
  const normalized = [];

  list.forEach((item, index) => {
    const text = normalizeText(item?.text);
    if (!text) {
      return;
    }

    let key = slugifyInfractionKey(item?.key || item?.label, `nivel_${index + 1}`);
    let uniqueKey = key;
    let suffix = 2;
    while (usedKeys.has(uniqueKey)) {
      uniqueKey = `${key}_${suffix}`;
      suffix += 1;
    }
    usedKeys.add(uniqueKey);

    normalized.push(serializeBulletinObservationTemplate({
      ...item,
      key: uniqueKey,
      text,
    }, index));
  });

  return normalized.sort((left, right) => left.order - right.order || left.minScore - right.minScore);
}

function resolveCoexistenceBulletinObservationText(score, templates = []) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return '';
  }

  const list = (Array.isArray(templates) ? templates : [])
    .filter((item) => item?.active !== false && normalizeText(item?.text))
    .sort((left, right) => left.order - right.order);

  const match = list.find((item) => (
    numericScore >= Number(item.minScore)
    && numericScore <= Number(item.maxScore)
  ));

  return normalizeText(match?.text);
}

async function getOrCreateCoexistencePolicy(schoolId) {
  const normalizedSchoolId = normalizeText(schoolId);
  let policy = await CampusCoexistencePolicy.findOne({ schoolId: normalizedSchoolId }).lean();
  if (policy) {
    if (
      isMillenniumSchoolId(normalizedSchoolId)
      && looksLikeGenericCoexistenceDefaults(policy.infractions)
    ) {
      return saveCoexistencePolicy({
        schoolId: normalizedSchoolId,
        startingScore: policy.startingScore ?? 100,
        infractions: buildMillenniumDisciplineInfractions(),
        bulletinObservationTemplates: policy.bulletinObservationTemplates?.length
          ? policy.bulletinObservationTemplates
          : getDefaultBulletinObservationTemplatesForSchool(normalizedSchoolId),
      });
    }
    if (
      isMillenniumSchoolId(normalizedSchoolId)
      && !(Array.isArray(policy.bulletinObservationTemplates) && policy.bulletinObservationTemplates.length)
    ) {
      return saveCoexistencePolicy({
        schoolId: normalizedSchoolId,
        startingScore: policy.startingScore ?? 100,
        infractions: policy.infractions,
        bulletinObservationTemplates: getDefaultBulletinObservationTemplatesForSchool(normalizedSchoolId),
      });
    }
    return policy;
  }

  policy = await CampusCoexistencePolicy.create({
    schoolId: normalizedSchoolId,
    startingScore: 100,
    infractions: getDefaultInfractionsForSchool(normalizedSchoolId),
    bulletinObservationTemplates: getDefaultBulletinObservationTemplatesForSchool(normalizedSchoolId),
  });

  return policy.toObject ? policy.toObject() : policy;
}

function normalizeInfractionsInput(rawInfractions = []) {
  const list = Array.isArray(rawInfractions) ? rawInfractions : [];
  const usedKeys = new Set();
  const normalized = [];

  list.forEach((item, index) => {
    const label = normalizeText(item?.label);
    if (!label) {
      return;
    }

    let key = slugifyInfractionKey(item?.key || item?.code || label, `infraccion_${index + 1}`);
    let uniqueKey = key;
    let suffix = 2;
    while (usedKeys.has(uniqueKey)) {
      uniqueKey = `${key}_${suffix}`;
      suffix += 1;
    }
    usedKeys.add(uniqueKey);

    const code = normalizeText(item?.code || uniqueKey).toUpperCase().slice(0, 12);
    normalized.push({
      key: uniqueKey,
      code,
      categoryKey: normalizeText(item?.categoryKey).toUpperCase().slice(0, 12),
      categoryLabel: normalizeText(item?.categoryLabel).slice(0, 180),
      label: label.slice(0, 280),
      deductionPercent: clampPercent(item?.deductionPercent, 0),
      severityPercent: clampPercent(item?.severityPercent, 0),
      description: normalizeText(item?.description).slice(0, 600),
      active: item?.active !== false,
      order: Number(item?.order ?? (index + 1) * 10),
    });
  });

  return normalized;
}

async function saveCoexistencePolicy({
  schoolId,
  startingScore,
  infractions,
  bulletinObservationTemplates,
  updatedByUserId,
  updatedByName,
}) {
  const normalizedSchoolId = normalizeText(schoolId);
  const nextInfractions = normalizeInfractionsInput(infractions);
  const update = {
    schoolId: normalizedSchoolId,
    startingScore: clampPercent(startingScore, 100),
    infractions: nextInfractions,
    updatedByUserId: updatedByUserId || null,
    updatedByName: normalizeText(updatedByName),
  };

  if (bulletinObservationTemplates !== undefined) {
    update.bulletinObservationTemplates = normalizeBulletinObservationTemplatesInput(bulletinObservationTemplates);
  }

  const policy = await CampusCoexistencePolicy.findOneAndUpdate(
    { schoolId: normalizedSchoolId },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return policy;
}

function findActiveInfraction(policy, infractionKey) {
  const key = normalizeText(infractionKey);
  if (!key) {
    return null;
  }
  const infractions = Array.isArray(policy?.infractions) ? policy.infractions : [];
  return infractions.find((item) => item.active !== false && normalizeText(item.key) === key) || null;
}

function computeDisciplineScore({ startingScore = 100, observations = [] }) {
  const start = clampPercent(startingScore, 100);
  const deductions = (Array.isArray(observations) ? observations : [])
    .filter((item) => {
      const destination = normalizeText(item?.destination).toLowerCase();
      return !destination || destination === 'coexistence';
    })
    .filter((item) => ['submitted', 'reviewed', ''].includes(normalizeText(item?.status).toLowerCase()) || !item?.status)
    .map((item) => clampPercent(item?.deductionPercent, 0));

  const totalDeducted = deductions.reduce((sum, value) => sum + value, 0);
  const score = clampPercent(Math.max(0, start - totalDeducted), 0);

  return {
    startingScore: start,
    totalDeducted: clampPercent(totalDeducted, 0),
    score,
  };
}

async function buildStudentCoexistenceScore({ schoolId, studentId }) {
  return buildStudentCoexistenceScoreForPeriod({ schoolId, studentId, academicPeriodKey: '' });
}

async function buildStudentCoexistenceScoreForPeriod({ schoolId, studentId, academicPeriodKey = '' }) {
  const AcademicStructure = require('../models/academicStructure.model');
  const normalizedSchoolId = normalizeText(schoolId);
  const normalizedStudentId = studentId;
  const normalizedPeriodKey = normalizeText(academicPeriodKey);

  const [policy, structure, observationsRaw] = await Promise.all([
    getOrCreateCoexistencePolicy(normalizedSchoolId),
    AcademicStructure.findOne({ schoolId: normalizedSchoolId }).select('academicPeriods').lean(),
    CampusDisciplineObservation.find({
      schoolId: normalizedSchoolId,
      studentId: normalizedStudentId,
      status: { $in: ['submitted', 'reviewed'] },
      $or: [{ destination: 'coexistence' }, { destination: { $exists: false } }, { destination: null }],
    })
      .select('deductionPercent destination status incidentAt submittedAt createdAt')
      .lean(),
  ]);

  let observations = observationsRaw;
  const period = (Array.isArray(structure?.academicPeriods) ? structure.academicPeriods : [])
    .find((item) => normalizeText(item?.key) === normalizedPeriodKey);
  if (normalizedPeriodKey && period?.startDate && period?.endDate) {
    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    end.setHours(23, 59, 59, 999);
    observations = observationsRaw.filter((item) => {
      const when = item.incidentAt || item.submittedAt || item.createdAt;
      if (!when) return false;
      const date = new Date(when);
      return date >= start && date <= end;
    });
  }

  const serializedPolicy = serializeCoexistencePolicy(policy);
  const scoreSummary = computeDisciplineScore({
    startingScore: serializedPolicy.startingScore,
    observations,
  });

  return {
    ...scoreSummary,
    observationCount: observations.length,
    academicPeriodKey: normalizedPeriodKey,
    scopedToPeriodDates: Boolean(normalizedPeriodKey && period?.startDate && period?.endDate),
  };
}

module.exports = {
  serializeCoexistencePolicy,
  getOrCreateCoexistencePolicy,
  saveCoexistencePolicy,
  findActiveInfraction,
  computeDisciplineScore,
  buildStudentCoexistenceScore,
  buildStudentCoexistenceScoreForPeriod,
  resolveCoexistenceBulletinObservationText,
  slugifyInfractionKey,
  clampPercent,
};
