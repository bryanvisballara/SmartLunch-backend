require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { connectDB, resolveRegisteredModel, runWithSchoolContext } = require('../config/db');
const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');
const CampusCourse = require('../models/campusCourse.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');

const SCHOOL_ID = 'Millennium School';
const DEFAULT_PASSWORD = 'Millennium2026!';
const CURRENT_YEAR = String(new Date().getFullYear());

const STAFF_FIXTURES = [
  {
    username: 'millennium.rector',
    role: 'rectoria',
    name: 'Ana Milena Herrera',
    email: 'rectoria@millennium.local',
    phone: '3006007001',
    documentType: 'CC',
    documentNumber: '52888111',
  },
  {
    username: 'millennium.secretaria.academica',
    role: 'academic_secretary',
    name: 'Paula Andrea Castañeda',
    email: 'secretaria.academica@millennium.local',
    phone: '3006007002',
    documentType: 'CC',
    documentNumber: '52100451',
  },
  {
    username: 'millennium.cartera',
    role: 'billing',
    name: 'Martha Lucia Salcedo',
    email: 'cartera@millennium.local',
    phone: '3006007003',
    documentType: 'CC',
    documentNumber: '45678012',
  },
  {
    username: 'millennium.coordinacion.primaria',
    role: 'coordination',
    name: 'Diego Fernando Ortega',
    email: 'coordinacion.primaria@millennium.local',
    phone: '3006007004',
    documentType: 'CC',
    documentNumber: '73111444',
    coordinationScope: 'primaria',
  },
  {
    username: 'millennium.coordinacion.bachillerato',
    role: 'coordination',
    name: 'Sandra Milena Pacheco',
    email: 'coordinacion.bachillerato@millennium.local',
    phone: '3006007005',
    documentType: 'CC',
    documentNumber: '39111777',
    coordinationScope: 'bachillerato',
  },
  {
    username: 'millennium.docente.matematicas',
    role: 'teacher',
    name: 'Luis Alfredo Mendez',
    email: 'docente.matematicas@millennium.local',
    phone: '3006007006',
    documentType: 'CC',
    documentNumber: '80222123',
    assignedSubjects: ['Matematicas', 'Geometria'],
  },
  {
    username: 'millennium.docente.espanol',
    role: 'teacher',
    name: 'Carolina Paez',
    email: 'docente.espanol@millennium.local',
    phone: '3006007007',
    documentType: 'CC',
    documentNumber: '66888991',
    assignedSubjects: ['Español', 'Lectura critica'],
  },
  {
    username: 'millennium.enfermeria',
    role: 'nursing',
    name: 'Andrea Lorena Buelvas',
    email: 'enfermeria@millennium.local',
    phone: '3006007008',
    documentType: 'CC',
    documentNumber: '45555123',
  },
  {
    username: 'millennium.psicologia',
    role: 'psychology',
    name: 'Natalia Vergara',
    email: 'psicologia@millennium.local',
    phone: '3006007009',
    documentType: 'CC',
    documentNumber: '52333456',
  },
  {
    username: 'millennium.ruta',
    role: 'school_route',
    name: 'Rafael Castillo',
    email: 'ruta@millennium.local',
    phone: '3006007010',
    documentType: 'CC',
    documentNumber: '91444777',
  },
];

const STUDENT_FIXTURES = [
  { schoolCode: 'MIL-RECT-001', name: 'Salome Arias Torres', grade: '6', course: '6A', dailyLimit: 18000 },
  { schoolCode: 'MIL-RECT-002', name: 'Mateo Arias Torres', grade: '6', course: '6B', dailyLimit: 17000 },
  { schoolCode: 'MIL-RECT-003', name: 'Valentina Duarte', grade: '7', course: '', dailyLimit: 17500 },
  { schoolCode: 'MIL-RECT-004', name: 'Martin Romero', grade: '7', course: '7A', dailyLimit: 19000 },
  { schoolCode: 'MIL-RECT-005', name: 'Antonia Sanchez', grade: '8', course: '', dailyLimit: 20000 },
  { schoolCode: 'MIL-RECT-006', name: 'Jeronimo Velez', grade: '10', course: '', dailyLimit: 21000 },
];

const COURSE_FIXTURES = [
  {
    key: '6A',
    title: 'Matematicas 6A',
    subject: 'Matematicas',
    gradeLevel: '6',
    section: 'A',
    teacherUsername: 'millennium.docente.matematicas',
    colorToken: '#0b6e4f',
  },
  {
    key: '6B',
    title: 'Matematicas 6B',
    subject: 'Matematicas',
    gradeLevel: '6',
    section: 'B',
    teacherUsername: 'millennium.docente.matematicas',
    colorToken: '#197278',
  },
  {
    key: '7A',
    title: 'Español 7A',
    subject: 'Español',
    gradeLevel: '7',
    section: 'A',
    teacherUsername: 'millennium.docente.espanol',
    colorToken: '#c44536',
  },
];

const GRADE_SETTINGS = [
  {
    grade: '6',
    enrollmentFee: 980000,
    monthlyTuition: 410000,
    enrollmentBonus: 180000,
    dueDay: 10,
    benefitRules: [
      { label: 'Pronto pago 1-10', startDay: 1, endDay: 10, discountPercent: 25 },
      { label: 'Pronto pago 11-15', startDay: 11, endDay: 15, discountPercent: 10 },
    ],
  },
  {
    grade: '7',
    enrollmentFee: 1020000,
    monthlyTuition: 435000,
    enrollmentBonus: 190000,
    dueDay: 10,
    benefitRules: [
      { label: 'Pronto pago 1-10', startDay: 1, endDay: 10, discountPercent: 20 },
    ],
  },
  {
    grade: '8',
    enrollmentFee: 1050000,
    monthlyTuition: 448000,
    enrollmentBonus: 205000,
    dueDay: 10,
    benefitRules: [
      { label: 'Pronto pago 1-10', startDay: 1, endDay: 10, discountPercent: 18 },
    ],
  },
  {
    grade: '10',
    enrollmentFee: 1140000,
    monthlyTuition: 490000,
    enrollmentBonus: 225000,
    dueDay: 10,
    benefitRules: [
      { label: 'Pronto pago 1-10', startDay: 1, endDay: 10, discountPercent: 15 },
    ],
  },
];

function normalizeText(value) {
  return String(value || '').trim();
}

function splitStudentName(name) {
  const tokens = normalizeText(name).split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return { firstName: tokens[0] || '', lastName: '' };
  }

  return {
    firstName: tokens.slice(0, Math.ceil(tokens.length / 2)).join(' '),
    lastName: tokens.slice(Math.ceil(tokens.length / 2)).join(' '),
  };
}

async function upsertUser(fixture, passwordHash) {
  const normalizedUsername = normalizeText(fixture.username).toLowerCase();
  const existingUser = await User.findOne({ username: normalizedUsername });

  if (existingUser && String(existingUser.schoolId) !== SCHOOL_ID) {
    throw new Error(`El username ${normalizedUsername} ya existe en ${existingUser.schoolId}.`);
  }

  const payload = {
    schoolId: SCHOOL_ID,
    name: fixture.name,
    username: normalizedUsername,
    email: fixture.email || '',
    phone: fixture.phone || '',
    documentType: fixture.documentType || '',
    documentNumber: fixture.documentNumber || '',
    role: fixture.role,
    coordinationScope: fixture.role === 'coordination' ? fixture.coordinationScope || '' : '',
    assignedSubjects: fixture.role === 'teacher' ? fixture.assignedSubjects || [] : [],
    passwordHash,
    status: 'active',
    deletedAt: null,
  };

  if (existingUser) {
    Object.assign(existingUser, payload);
    await existingUser.save();
    return existingUser;
  }

  return User.create(payload);
}

async function upsertStudent(fixture) {
  const names = splitStudentName(fixture.name);

  return Student.findOneAndUpdate(
    { schoolId: SCHOOL_ID, schoolCode: fixture.schoolCode },
    {
      schoolId: SCHOOL_ID,
      name: fixture.name,
      firstName: names.firstName,
      lastName: names.lastName,
      schoolCode: fixture.schoolCode,
      grade: fixture.grade,
      course: fixture.course || '',
      dailyLimit: fixture.dailyLimit,
      status: 'active',
      deletedAt: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function run() {
  try {
    const connection = await connectDB();
    console.log(`MongoDB connected (${connection.name})`);

    const seededUsernames = STAFF_FIXTURES.map((fixture) => normalizeText(fixture.username).toLowerCase());
    const seededSchoolCodes = STUDENT_FIXTURES.map((fixture) => fixture.schoolCode);
    const RootUser = resolveRegisteredModel('User', '');
    const RootStudent = resolveRegisteredModel('Student', '');
    const RootAcademicFeeConfiguration = resolveRegisteredModel('AcademicFeeConfiguration', '');
    const RootCampusCourse = resolveRegisteredModel('CampusCourse', '');

    await Promise.all([
      RootUser.deleteMany({ schoolId: SCHOOL_ID, username: { $in: seededUsernames } }),
      RootStudent.deleteMany({ schoolId: SCHOOL_ID, schoolCode: { $in: seededSchoolCodes } }),
      RootAcademicFeeConfiguration.deleteMany({ schoolId: SCHOOL_ID }),
      RootCampusCourse.deleteMany({ schoolId: SCHOOL_ID, studentGradeKey: { $in: COURSE_FIXTURES.map((fixture) => fixture.key) } }),
    ]);

    await runWithSchoolContext(SCHOOL_ID, async () => {
      const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
      const usersByUsername = {};

      for (const fixture of STAFF_FIXTURES) {
        const user = await upsertUser(fixture, passwordHash);
        usersByUsername[fixture.username] = user;
      }

      for (const fixture of STUDENT_FIXTURES) {
        await upsertStudent(fixture);
      }

      await AcademicFeeConfiguration.updateOne(
        { schoolId: SCHOOL_ID },
        {
          $set: {
            schoolId: SCHOOL_ID,
            academicYear: CURRENT_YEAR,
            gradeSettings: GRADE_SETTINGS,
          },
        },
        { upsert: true }
      );

      for (const fixture of COURSE_FIXTURES) {
        const teacherUser = usersByUsername[fixture.teacherUsername];
        const rectorUser = usersByUsername['millennium.rector'];

        if (!teacherUser) {
          throw new Error(`No se encontro docente para ${fixture.key}`);
        }

        await CampusCourse.findOneAndUpdate(
          { schoolId: SCHOOL_ID, teacherUserId: String(teacherUser._id), title: fixture.title },
          {
            $set: {
              schoolId: SCHOOL_ID,
              teacherUserId: String(teacherUser._id),
              assignedByUserId: rectorUser ? String(rectorUser._id) : '',
              title: fixture.title,
              subject: fixture.subject,
              gradeLevel: fixture.gradeLevel,
              section: fixture.section,
              studentGradeKey: fixture.key,
              description: `Curso demo de ${fixture.subject} para rectoria Millennium.`,
              colorToken: fixture.colorToken,
              status: 'active',
            },
          },
          { upsert: true }
        );
      }
    });

    const TenantStudent = resolveRegisteredModel('Student', SCHOOL_ID);
    const studentsWithoutCourse = await TenantStudent.countDocuments({
      schoolId: SCHOOL_ID,
      deletedAt: null,
      $or: [{ course: { $exists: false } }, { course: null }, { course: '' }],
    });

    console.log('Millennium rectoria seed completed successfully.');
    console.log(`School: ${SCHOOL_ID}`);
    console.log(`Password base: ${DEFAULT_PASSWORD}`);
    console.log('Usuarios creados/actualizados:');
    STAFF_FIXTURES.forEach((fixture) => {
      console.log(`  ${fixture.username} / ${DEFAULT_PASSWORD} (${fixture.role})`);
    });
    console.log(`Cursos demo activos: ${COURSE_FIXTURES.length}`);
    console.log(`Alumnos demo sin curso para dashboard: ${studentsWithoutCourse}`);
    console.log('Grados con costos sembrados: 6, 7, 8, 10');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Millennium rectoria seed failed:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

run();