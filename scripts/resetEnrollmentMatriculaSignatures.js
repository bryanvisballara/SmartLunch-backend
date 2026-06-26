require('dotenv').config();

const { connectDB, runWithSchoolContext } = require('../src/config/db');
const User = require('../src/models/user.model');
const Student = require('../src/models/student.model');
const EnrollmentMatriculaProcess = require('../src/models/enrollmentMatriculaProcess.model');

const DEFAULT_SCHOOL_ID = 'Millennium School';

function normalizeText(value) {
  return String(value || '').trim();
}

function buildNameRegex(query) {
  const tokens = normalizeText(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (!tokens.length) {
    throw new Error('Name query is required.');
  }

  return new RegExp(tokens.join('.*'), 'i');
}

async function findTargetProcesses({ schoolId, query }) {
  const nameRegex = buildNameRegex(query);
  const users = await User.find({ schoolId, name: nameRegex }).select('_id name').lean();
  const students = await Student.find({ schoolId, name: nameRegex }).select('_id name').lean();
  const processIds = new Set();

  const byParent = users.length
    ? await EnrollmentMatriculaProcess.find({ schoolId, parentId: { $in: users.map((user) => user._id) } }).lean()
    : [];
  const byStudent = students.length
    ? await EnrollmentMatriculaProcess.find({ schoolId, studentId: { $in: students.map((student) => student._id) } }).lean()
    : [];
  const byParentName = await EnrollmentMatriculaProcess.find({ schoolId, parentName: nameRegex }).lean();

  [...byParent, ...byStudent, ...byParentName].forEach((process) => {
    processIds.add(String(process._id));
  });

  const processes = [...processIds].map((processId) => (
    [...byParent, ...byStudent, ...byParentName].find((process) => String(process._id) === processId)
  )).filter(Boolean);

  return {
    users,
    students,
    processes,
  };
}

async function resetProcessSignatures(process) {
  const hasContractSignature = Boolean(process.contract?.signedAt || process.contract?.signatureImage);
  const hasPagareSignature = Boolean(process.pagare?.signedAt || process.pagare?.signatureImage);

  if (!hasContractSignature && !hasPagareSignature && ['payment_confirmed', 'contract_pending'].includes(process.status)) {
    return { updated: false, reason: 'already_reset' };
  }

  await EnrollmentMatriculaProcess.updateOne(
    { _id: process._id },
    {
      $set: {
        status: 'payment_confirmed',
        contract: {
          signedAt: null,
          ipAddress: '',
          device: '',
          userAgent: '',
          userId: null,
          signatureImage: '',
          signedPdfBase64: '',
          fileName: '',
        },
        pagare: {
          signedAt: null,
          ipAddress: '',
          device: '',
          userAgent: '',
          userId: null,
          signatureImage: '',
          signedPdfBase64: '',
          fileName: '',
        },
      },
    },
  );

  return {
    updated: true,
    previousStatus: process.status,
    nextStatus: 'payment_confirmed',
    clearedContract: hasContractSignature,
    clearedPagare: hasPagareSignature,
  };
}

async function run() {
  const schoolId = normalizeText(process.argv[2]) || DEFAULT_SCHOOL_ID;
  const query = normalizeText(process.argv[3]);

  if (!query) {
    throw new Error('Usage: node scripts/resetEnrollmentMatriculaSignatures.js [schoolId] "Parent or student name"');
  }

  await connectDB();

  const result = await runWithSchoolContext(schoolId, async () => {
    const { users, students, processes } = await findTargetProcesses({ schoolId, query });

    if (!processes.length) {
      return {
        ok: false,
        message: 'No enrollment matricula processes found for query.',
        matchedUsers: users.length,
        matchedStudents: students.length,
      };
    }

    const updates = [];
    for (const process of processes) {
      updates.push({
        processId: String(process._id),
        studentName: process.studentName,
        parentName: process.parentName,
        ...(await resetProcessSignatures(process)),
      });
    }

    return {
      ok: true,
      schoolId,
      query,
      matchedUsers: users.length,
      matchedStudents: students.length,
      updatedProcesses: updates,
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
