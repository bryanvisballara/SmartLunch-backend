#!/usr/bin/env node
require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB, runWithSchoolContext } = require('../config/db');
require('../models/index');
const Student = require('../models/student.model');
const { upsertStudentAccount } = require('../utils/studentAccount');

async function main() {
  const schoolId = String(process.argv[2] || '').trim();
  if (!schoolId) {
    console.error('Usage: node src/scripts/provisionStudentAccounts.js <schoolId>');
    process.exit(1);
  }

  await connectDB();

  const summary = {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  await runWithSchoolContext(schoolId, async () => {
    const students = await Student.find({
      schoolId,
      status: 'active',
      deletedAt: null,
    }).lean();

    for (const student of students) {
      summary.processed += 1;
      try {
        const result = await upsertStudentAccount({ schoolId, student });
        if (!result) {
          summary.skipped += 1;
          continue;
        }
        if (result.skipped) {
          summary.skipped += 1;
          continue;
        }
        if (result.created) {
          summary.created += 1;
          console.log(`Created ${result.username} for ${student.name}`);
        } else {
          summary.updated += 1;
        }
      } catch (error) {
        summary.errors += 1;
        console.error(`Failed for ${student.name}:`, error.message);
      }
    }
  });

  console.log('Student account provisioning completed:', summary);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    // ignore
  }
  process.exit(1);
});
