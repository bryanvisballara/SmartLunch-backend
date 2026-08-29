const StudentSubjectReview = require('../models/studentSubjectReview.model');

function normalizeSubjectKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function serializeReview(row = {}) {
  return {
    subjectKey: String(row.subjectKey || ''),
    seenItemKeys: Array.isArray(row.seenItemKeys) ? row.seenItemKeys.map((key) => String(key || '').trim()).filter(Boolean) : [],
    lastSeenAt: row.lastSeenAt || null,
  };
}

async function listStudentSubjectReviews({ schoolId, studentId }) {
  if (!schoolId || !studentId) {
    return [];
  }

  const rows = await StudentSubjectReview.find({ schoolId, studentId }).lean();
  return rows.map(serializeReview).filter((row) => row.subjectKey);
}

async function markStudentSubjectSeen({ schoolId, studentId, subjectKey, itemKeys = [] }) {
  const normalizedKey = normalizeSubjectKey(subjectKey);
  if (!schoolId || !studentId || !normalizedKey) {
    return null;
  }

  const seenItemKeys = Array.from(new Set(
    (Array.isArray(itemKeys) ? itemKeys : []).map((key) => String(key || '').trim()).filter(Boolean),
  ));

  const row = await StudentSubjectReview.findOneAndUpdate(
    { schoolId, studentId, subjectKey: normalizedKey },
    {
      $set: {
        schoolId,
        studentId,
        subjectKey: normalizedKey,
        seenItemKeys,
        lastSeenAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return serializeReview(row);
}

module.exports = {
  listStudentSubjectReviews,
  markStudentSubjectSeen,
  normalizeSubjectKey,
};
