const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const Student = require('../models/student.model');
const CampusMembership = require('../models/campusMembership.model');
const { getSchoolDisplayName } = require('./schoolDisplayName');

function normalizeText(value) {
  return String(value || '').trim();
}

function slugifyEmailPart(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function splitStudentIdentity(student = {}) {
  let firstName = normalizeText(student.firstName);
  let lastName = normalizeText(student.lastName);

  if (!firstName || !lastName) {
    const parts = normalizeText(student.name).split(/\s+/).filter(Boolean);
    if (!firstName) {
      firstName = parts[0] || '';
    }
    if (!lastName) {
      lastName = parts[1] || '';
    }
  }

  return { firstName, lastName };
}

async function buildSchoolEmailDomain(schoolId) {
  const displayName = await getSchoolDisplayName(schoolId);
  const slug = slugifyEmailPart(displayName || schoolId);
  return `${slug || 'colegio'}.com`;
}

async function buildStudentUsername({ schoolId, student }) {
  const { firstName, lastName } = splitStudentIdentity(student);
  const localPart = [slugifyEmailPart(firstName), slugifyEmailPart(lastName)].filter(Boolean).join('.');
  const domain = await buildSchoolEmailDomain(schoolId);
  const baseEmail = `${localPart || 'alumno'}@${domain}`;

  let candidate = baseEmail;
  let attempt = 1;

  while (await User.findOne({ username: candidate }).select('_id').lean()) {
    candidate = `${localPart || 'alumno'}.${attempt}@${domain}`;
    attempt += 1;
  }

  return candidate;
}

async function ensureStudentCampusMembership({ schoolId, userId }) {
  return CampusMembership.findOneAndUpdate(
    { schoolId, userId, memberType: 'campus_student' },
    {
      schoolId,
      userId,
      memberType: 'campus_student',
      status: 'active',
      permissions: ['academic_portal'],
      metadata: {
        title: 'Campus Alumno',
        launchPath: '/campus/student',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function upsertStudentAccount({ schoolId, student }) {
  if (!student?._id) {
    return null;
  }

  const documentNumber = normalizeText(student.documentNumber).replace(/\s+/g, '');
  if (!documentNumber) {
    return { skipped: true, reason: 'missing_document_number' };
  }

  const { firstName, lastName } = splitStudentIdentity(student);
  const studentName = normalizeText(student.name) || [firstName, lastName].filter(Boolean).join(' ');
  const passwordHash = await bcrypt.hash(documentNumber, 10);

  let user = null;
  if (student.userId) {
    user = await User.findOne({ _id: student.userId, schoolId, role: 'student' });
  }
  if (!user) {
    user = await User.findOne({ schoolId, role: 'student', linkedStudentId: student._id });
  }

  const username = user?.username || await buildStudentUsername({ schoolId, student });
  const payload = {
    schoolId,
    name: studentName,
    username,
    email: username,
    documentType: normalizeText(student.documentType) || 'TI',
    documentNumber,
    role: 'student',
    linkedStudentId: student._id,
    status: 'active',
    deletedAt: null,
    passwordHash,
  };

  const created = !user;

  if (user) {
    Object.assign(user, payload);
    await user.save();
  } else {
    user = await User.create(payload);
    await Student.findByIdAndUpdate(student._id, { userId: user._id });
  }

  await ensureStudentCampusMembership({ schoolId, userId: user._id });

  return {
    user,
    created,
    username,
    password: documentNumber,
  };
}

module.exports = {
  buildSchoolEmailDomain,
  buildStudentUsername,
  ensureStudentCampusMembership,
  upsertStudentAccount,
};
