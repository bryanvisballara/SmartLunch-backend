require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB, runWithSchoolContext } = require('../config/db');
require('../models');
require('../models/campusCoexistencePolicy.model');

const { saveCoexistencePolicy } = require('../services/campusCoexistencePolicy.service');
const { buildMillenniumDisciplineInfractions } = require('../data/millenniumDisciplineChart');

const SCHOOL_ID = String(process.env.TARGET_SCHOOL_ID || 'Millennium School').trim();

async function seedMillenniumCoexistencePolicy() {
  await connectDB();
  const infractions = buildMillenniumDisciplineInfractions();

  const policy = await runWithSchoolContext(SCHOOL_ID, async () => (
    saveCoexistencePolicy({
      schoolId: SCHOOL_ID,
      startingScore: 100,
      infractions,
      updatedByName: 'Discipline Chart 1P 2026-27',
    })
  ));

  const saved = Array.isArray(policy?.infractions) ? policy.infractions : [];
  console.log(JSON.stringify({
    schoolId: SCHOOL_ID,
    startingScore: policy?.startingScore,
    infractionCount: saved.length,
    codes: saved.map((item) => item.code || item.key),
    database: mongoose.connection?.name,
  }, null, 2));

  await mongoose.connection.close();
}

seedMillenniumCoexistencePolicy().catch(async (error) => {
  console.error('Seed Millennium coexistence policy failed:', error.message);
  try {
    await mongoose.connection.close();
  } catch (closeError) {
    // ignore
  }
  process.exit(1);
});
