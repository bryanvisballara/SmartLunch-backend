require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { connectDB } = require('../src/config/db');
const User = require('../src/models/user.model');

const SCHOOL_ID = String(process.env.SEED_RECTORIA_SCHOOL_ID || 'comergio_demo_kns8p').trim();
const USERNAME = 'coordinacion.preescolar';
const PASSWORD = String(process.env.SEED_RECTORIA_PASSWORD || 'Comergio2026!').trim();

async function seedCoordinationPreescolar() {
  try {
    await connectDB();
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    await User.findOneAndUpdate(
      { schoolId: SCHOOL_ID, username: USERNAME },
      {
        schoolId: SCHOOL_ID,
        name: 'Coordinación Preescolar',
        username: USERNAME,
        phone: '3000000009',
        role: 'coordination',
        coordinationScope: 'preescolar',
        passwordHash,
        status: 'active',
        deletedAt: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`Usuario listo: ${USERNAME} / ${PASSWORD}`);
    console.log(`Colegio: ${SCHOOL_ID}`);
    console.log('Scope: preescolar');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

seedCoordinationPreescolar();
