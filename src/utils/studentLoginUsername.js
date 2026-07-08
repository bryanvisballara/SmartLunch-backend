const User = require('../models/user.model');

function normalizeText(value) {
  return String(value || '').trim();
}

function slugifyUsernamePart(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function resolveStudentNameParts(student = {}) {
  const explicitFirstName = normalizeText(student.firstName);
  const explicitLastName = normalizeText(student.lastName);
  const nameParts = normalizeText(student.name).split(/\s+/).filter(Boolean);

  let firstName = explicitFirstName || nameParts[0] || '';
  let firstLastName = '';

  if (explicitLastName) {
    firstLastName = explicitLastName.split(/\s+/).filter(Boolean)[0] || '';
  } else if (nameParts.length >= 4) {
    firstLastName = nameParts[2] || '';
  } else if (nameParts.length >= 2) {
    firstLastName = nameParts[1] || '';
  } else {
    firstLastName = firstName;
  }

  return {
    firstName: firstName.split(/\s+/).filter(Boolean)[0] || '',
    firstLastName,
  };
}

async function buildStudentLoginUsername({ schoolId, student, excludeUserId = null }) {
  const { firstName, firstLastName } = resolveStudentNameParts(student);
  const baseUsername = `${slugifyUsernamePart(firstName)}${slugifyUsernamePart(firstLastName)}` || 'alumno';

  let candidate = baseUsername;
  let attempt = 1;

  while (true) {
    const filter = { username: candidate };
    const existing = await User.findOne(filter).select('_id').lean();
    if (!existing || (excludeUserId && String(existing._id) === String(excludeUserId))) {
      return candidate;
    }

    candidate = `${baseUsername}${attempt}`;
    attempt += 1;
  }
}

module.exports = {
  buildStudentLoginUsername,
  resolveStudentNameParts,
  slugifyUsernamePart,
};
