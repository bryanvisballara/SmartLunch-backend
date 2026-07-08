const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const Student = require('../models/student.model');
const CampusMembership = require('../models/campusMembership.model');
const { buildStudentLoginUsername, resolveStudentNameParts } = require('./studentLoginUsername');

function normalizeText(value) {
  return String(value || '').trim();
}

function splitStudentIdentity(student = {}) {
  const { firstName, firstLastName } = resolveStudentNameParts(student);
  return { firstName, lastName: firstLastName };
}

async function buildStudentUsername({ schoolId, student, excludeUserId = null }) {
  return buildStudentLoginUsername({ schoolId, student, excludeUserId });
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

  const username = user?.username || await buildStudentUsername({ schoolId, student, excludeUserId: user?._id });
  const syntheticEmail = `${username}@alumnos.local`;
  const payload = {
    schoolId,
    name: studentName,
    username,
    email: syntheticEmail,
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
  buildStudentUsername,
  ensureStudentCampusMembership,
  upsertStudentAccount,
};
