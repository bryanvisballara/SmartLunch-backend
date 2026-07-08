const ParentStudentLink = require('../models/parentStudentLink.model');
const User = require('../models/user.model');

function normalizeText(value) {
  return String(value || '').trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

async function resolvePrimaryParentUserForStudent({ schoolId, studentId }) {
  if (!studentId) {
    return null;
  }

  const links = await ParentStudentLink.find({
    schoolId,
    studentId,
    status: 'active',
  })
    .sort({ isPrimaryContact: -1, createdAt: 1 })
    .select('parentId isPrimaryContact')
    .lean();

  if (!links.length) {
    return null;
  }

  const parentIds = links.map((link) => link.parentId).filter(Boolean);
  const parents = await User.find({
    _id: { $in: parentIds },
    schoolId,
    role: 'parent',
    status: 'active',
    deletedAt: null,
  })
    .select('name username email')
    .lean();

  const parentById = new Map(parents.map((parent) => [String(parent._id), parent]));

  for (const link of links) {
    const parent = parentById.get(String(link.parentId));
    if (!parent) continue;
    const email = normalizeText(parent.email || parent.username);
    if (isValidEmail(email)) {
      return parent;
    }
  }

  return null;
}

async function resolvePrimaryParentEmailForStudent({ schoolId, studentId }) {
  const parent = await resolvePrimaryParentUserForStudent({ schoolId, studentId });
  if (!parent) {
    return '';
  }

  const email = normalizeText(parent.email || parent.username);
  return isValidEmail(email) ? email : '';
}

module.exports = {
  resolvePrimaryParentEmailForStudent,
  resolvePrimaryParentUserForStudent,
};
