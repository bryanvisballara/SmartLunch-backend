/**
 * Set Millennium student login passwords to each student's document number.
 *
 * Usage:
 *   node src/scripts/repairMillenniumStudentDocumentPasswords.js --dry-run
 *   node src/scripts/repairMillenniumStudentDocumentPasswords.js --apply
 */
require('dotenv').config({ override: true });

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDB, runWithSchoolContext } = require('../config/db');
require('../models');
const Student = require('../models/student.model');
const User = require('../models/user.model');

const SCHOOL_ID = 'Millennium School';
const SHARED_PASSWORD = '123456';

function normalizeDocument(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

async function inspectStudentUser(student) {
  let user = null;
  if (student.userId) {
    user = await User.findOne({ _id: student.userId, schoolId: SCHOOL_ID, role: 'student' }).select('+accessPassword');
  }
  if (!user) {
    user = await User.findOne({ schoolId: SCHOOL_ID, role: 'student', linkedStudentId: student._id }).select('+accessPassword');
  }
  return user;
}

async function run() {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const summary = await runWithSchoolContext(SCHOOL_ID, async () => {
    const students = await Student.find({ schoolId: SCHOOL_ID, deletedAt: null })
      .select('_id name firstName lastName documentNumber userId grade status')
      .sort({ lastName: 1, firstName: 1, name: 1 });

    const updated = [];
    const skipped = [];
    const missingUser = [];

    for (const student of students) {
      const documentNumber = normalizeDocument(student.documentNumber);
      const user = await inspectStudentUser(student);
      if (!user) {
        missingUser.push({ student: student.name, grade: student.grade, documentNumber });
        continue;
      }
      if (!documentNumber) {
        skipped.push({ student: student.name, username: user.username, reason: 'sin documento' });
        continue;
      }

      const usesSharedPassword = user.passwordHash
        ? await bcrypt.compare(SHARED_PASSWORD, user.passwordHash)
        : false;
      const usesDocumentPassword = user.passwordHash
        ? await bcrypt.compare(documentNumber, user.passwordHash)
        : false;
      const accessPassword = String(user.accessPassword || '').trim();

      if (usesDocumentPassword && accessPassword === documentNumber) {
        skipped.push({ student: student.name, username: user.username, reason: 'ya usa el documento' });
        continue;
      }

      const item = {
        student: student.name,
        username: user.username,
        documentNumber,
        accessPassword: accessPassword || '(vacío)',
        used123456: usesSharedPassword,
        usedDocument: usesDocumentPassword,
      };

      if (apply) {
        user.passwordHash = await bcrypt.hash(documentNumber, 10);
        user.accessPassword = documentNumber;
        user.documentNumber = documentNumber;
        user.status = 'active';
        user.deletedAt = null;
        await user.save();
      }

      updated.push(item);
    }

    return {
      mode: apply ? 'apply' : 'dry-run',
      schoolId: SCHOOL_ID,
      students: students.length,
      willUpdate: updated.length,
      skipped: skipped.length,
      missingUser: missingUser.length,
      updated,
      skipped,
      missingUser,
    };
  });

  console.log(JSON.stringify(summary, null, 2));
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_) {
      // ignore
    }
  });
