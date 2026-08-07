const CampusCoexistencePolicy = require('../models/campusCoexistencePolicy.model');
const CampusDisciplineObservation = require('../models/campusDisciplineObservation.model');

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
  return {
    key: normalizeText(item.key) || slugifyInfractionKey(item.label, `infraccion_${index + 1}`),
    label: normalizeText(item.label),
    deductionPercent: clampPercent(item.deductionPercent, 0),
    description: normalizeText(item.description),
    active: item.active !== false,
    order: Number(item.order ?? (index + 1) * 10),
  };
}

function serializeCoexistencePolicy(policy) {
  const startingScore = clampPercent(policy?.startingScore ?? 100, 100);
  const infractions = (Array.isArray(policy?.infractions) ? policy.infractions : [])
    .map(serializeInfraction)
    .filter((item) => item.label)
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, 'es'));

  return {
    id: policy?._id ? String(policy._id) : '',
    schoolId: normalizeText(policy?.schoolId),
    startingScore,
    infractions,
    updatedByUserId: policy?.updatedByUserId ? String(policy.updatedByUserId) : '',
    updatedByName: normalizeText(policy?.updatedByName),
    updatedAt: policy?.updatedAt || null,
    createdAt: policy?.createdAt || null,
  };
}

async function getOrCreateCoexistencePolicy(schoolId) {
  const normalizedSchoolId = normalizeText(schoolId);
  let policy = await CampusCoexistencePolicy.findOne({ schoolId: normalizedSchoolId }).lean();
  if (policy) {
    return policy;
  }

  policy = await CampusCoexistencePolicy.create({
    schoolId: normalizedSchoolId,
    startingScore: 100,
    infractions: [
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
    ],
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

    let key = slugifyInfractionKey(item?.key || label, `infraccion_${index + 1}`);
    let uniqueKey = key;
    let suffix = 2;
    while (usedKeys.has(uniqueKey)) {
      uniqueKey = `${key}_${suffix}`;
      suffix += 1;
    }
    usedKeys.add(uniqueKey);

    normalized.push({
      key: uniqueKey,
      label: label.slice(0, 120),
      deductionPercent: clampPercent(item?.deductionPercent, 0),
      description: normalizeText(item?.description).slice(0, 400),
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
  updatedByUserId,
  updatedByName,
}) {
  const normalizedSchoolId = normalizeText(schoolId);
  const nextInfractions = normalizeInfractionsInput(infractions);
  const policy = await CampusCoexistencePolicy.findOneAndUpdate(
    { schoolId: normalizedSchoolId },
    {
      $set: {
        schoolId: normalizedSchoolId,
        startingScore: clampPercent(startingScore, 100),
        infractions: nextInfractions,
        updatedByUserId: updatedByUserId || null,
        updatedByName: normalizeText(updatedByName),
      },
    },
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
  const [policy, observations] = await Promise.all([
    getOrCreateCoexistencePolicy(schoolId),
    CampusDisciplineObservation.find({
      schoolId,
      studentId,
      status: { $in: ['submitted', 'reviewed'] },
      $or: [{ destination: 'coexistence' }, { destination: { $exists: false } }, { destination: null }],
    })
      .select('deductionPercent destination status')
      .lean(),
  ]);

  const serializedPolicy = serializeCoexistencePolicy(policy);
  const scoreSummary = computeDisciplineScore({
    startingScore: serializedPolicy.startingScore,
    observations,
  });

  return {
    ...scoreSummary,
    observationCount: observations.length,
  };
}

module.exports = {
  serializeCoexistencePolicy,
  getOrCreateCoexistencePolicy,
  saveCoexistencePolicy,
  findActiveInfraction,
  computeDisciplineScore,
  buildStudentCoexistenceScore,
  slugifyInfractionKey,
  clampPercent,
};
