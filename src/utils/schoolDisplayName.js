const AcademicStructure = require('../models/academicStructure.model');
const SchoolCreationSnapshot = require('../models/schoolCreationSnapshot.model');

function normalizeText(value) {
  return String(value || '').trim();
}

function humanizeSchoolId(value) {
  return normalizeText(value)
    .replace(/[_-][a-z0-9]{5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function getSchoolDisplayName(schoolId) {
  const normalizedSchoolId = normalizeText(schoolId);
  if (!normalizedSchoolId) {
    return '';
  }

  const [snapshot, academicStructure] = await Promise.all([
    SchoolCreationSnapshot.findOne({ schoolId: normalizedSchoolId })
      .sort({ completedAt: -1, updatedAt: -1 })
      .select('schoolName')
      .lean(),
    AcademicStructure.findOne({ schoolId: normalizedSchoolId }).select('schoolName').lean(),
  ]);

  return normalizeText(snapshot?.schoolName || academicStructure?.schoolName)
    || humanizeSchoolId(normalizedSchoolId)
    || normalizedSchoolId;
}

async function updateSchoolDisplayName(schoolId, schoolName) {
  const normalizedSchoolId = normalizeText(schoolId);
  const normalizedName = normalizeText(schoolName);

  if (!normalizedSchoolId) {
    const error = new Error('Colegio no encontrado.');
    error.statusCode = 404;
    throw error;
  }

  if (normalizedName.length < 3) {
    const error = new Error('El nombre del colegio debe tener al menos 3 caracteres.');
    error.statusCode = 400;
    throw error;
  }

  await Promise.all([
    AcademicStructure.findOneAndUpdate(
      { schoolId: normalizedSchoolId },
      { $set: { schoolName: normalizedName } },
      { upsert: true, setDefaultsOnInsert: true }
    ),
    SchoolCreationSnapshot.updateMany(
      { schoolId: normalizedSchoolId },
      { $set: { schoolName: normalizedName } }
    ),
  ]);

  return normalizedName;
}

module.exports = {
  getSchoolDisplayName,
  humanizeSchoolId,
  normalizeText,
  updateSchoolDisplayName,
};
