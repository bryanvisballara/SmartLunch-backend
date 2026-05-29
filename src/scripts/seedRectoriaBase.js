require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const User = require('../models/user.model');

const SCHOOL_ID = String(process.env.SEED_RECTORIA_SCHOOL_ID || 'comergio-demo').trim();
const DEFAULT_PASSWORD = String(process.env.SEED_RECTORIA_PASSWORD || 'Comergio2026!').trim();

const STAFF_FIXTURES = [
  { name: 'Rector Principal', username: 'rector', role: 'rectoria', phone: '3000000001' },
  { name: 'Secretaría Académica', username: 'secretaria.academica', role: 'academic_secretary', phone: '3000000002' },
  { name: 'Responsable de Cartera', username: 'cartera', role: 'billing', phone: '3000000003' },
  { name: 'Coordinación Primaria', username: 'coordinacion.primaria', role: 'coordination', phone: '3000000004', coordinationScope: 'primaria' },
  { name: 'Docente Demo', username: 'docente.demo', role: 'teacher', phone: '3000000005', assignedSubjects: ['Matematicas', 'Ciencias'] },
  { name: 'Enfermería Demo', username: 'enfermeria.demo', role: 'nursing', phone: '3000000006' },
  { name: 'Psicología Demo', username: 'psicologia.demo', role: 'psychology', phone: '3000000007' },
  { name: 'Ruta Escolar Demo', username: 'ruta.demo', role: 'school_route', phone: '3000000008' },
];

async function seedRectoriaBase() {
  try {
    const connection = await connectDB();
    console.log(`MongoDB connected (${connection.name})`);

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    for (const fixture of STAFF_FIXTURES) {
      const normalizedUsername = String(fixture.username || '').trim().toLowerCase();
      if (!normalizedUsername) {
        continue;
      }

      await User.findOneAndUpdate(
        { schoolId: SCHOOL_ID, username: normalizedUsername },
        {
          schoolId: SCHOOL_ID,
          name: fixture.name,
          username: normalizedUsername,
          phone: fixture.phone || '',
          role: fixture.role,
          coordinationScope: fixture.role === 'coordination' ? fixture.coordinationScope || '' : '',
          assignedSubjects: fixture.role === 'teacher' ? fixture.assignedSubjects || [] : [],
          passwordHash,
          status: 'active',
          deletedAt: null,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    console.log(`Seed de rectoria listo para ${SCHOOL_ID}.`);
    console.log(`Password por defecto: ${DEFAULT_PASSWORD}`);
    STAFF_FIXTURES.forEach((fixture) => {
      console.log(`  ${fixture.username} / ${DEFAULT_PASSWORD} (${fixture.role})`);
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed rectoria failed:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

seedRectoriaBase();