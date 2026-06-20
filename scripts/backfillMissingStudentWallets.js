require('dotenv').config();

const mongoose = require('mongoose');

const { connectDB, listTenantSchoolContexts, runWithSchoolContext } = require('../src/config/db');
require('../src/models');
const { ensureStudentWallet } = require('../src/utils/studentWallet');

async function backfillSchoolWallets(schoolId) {
  return runWithSchoolContext(schoolId, async () => {
    const Student = require('../src/models/student.model');
    const Wallet = require('../src/models/wallet.model');

    const students = await Student.find({ schoolId, deletedAt: null }).select('_id name').lean();
    let created = 0;

    for (const student of students) {
      const existingWallet = await Wallet.findOne({ schoolId, studentId: student._id }).select('_id').lean();
      if (existingWallet) {
        continue;
      }

      await ensureStudentWallet({ schoolId, studentId: student._id });
      created += 1;
      console.log(`  wallet creada: ${student.name}`);
    }

    return { students: students.length, created };
  });
}

async function run() {
  await connectDB();

  const targetSchoolId = String(process.env.BACKFILL_WALLET_SCHOOL_ID || '').trim();
  const contexts = targetSchoolId
    ? [{ schoolId: targetSchoolId }]
    : await listTenantSchoolContexts();

  let totalCreated = 0;

  for (const context of contexts) {
    const schoolId = String(context.schoolId || '').trim();
    if (!schoolId) {
      continue;
    }

    console.log(`\nColegio: ${schoolId}`);
    const result = await backfillSchoolWallets(schoolId);
    console.log(`Estudiantes: ${result.students}, wallets creadas: ${result.created}`);
    totalCreated += result.created;
  }

  const controlSchoolId = String(process.env.MONGO_DB_NAME ? 'International Berckley School' : '').trim();
  if (!targetSchoolId && controlSchoolId) {
    console.log(`\nColegio control: ${controlSchoolId}`);
    const result = await backfillSchoolWallets(controlSchoolId);
    console.log(`Estudiantes: ${result.students}, wallets creadas: ${result.created}`);
    totalCreated += result.created;
  }

  console.log(`\nTotal wallets creadas: ${totalCreated}`);
  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Backfill failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
