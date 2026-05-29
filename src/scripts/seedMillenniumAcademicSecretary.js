require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { connectDB, resolveRegisteredModel, runWithSchoolContext } = require('../config/db');
const AcademicCharge = require('../models/academicCharge.model');
const AcademicChargePayment = require('../models/academicChargePayment.model');
const AcademicCommunication = require('../models/academicCommunication.model');
const AcademicCommunicationRequest = require('../models/academicCommunicationRequest.model');
const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');
const CampusMembership = require('../models/campusMembership.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const StudentBillingProfile = require('../models/studentBillingProfile.model');
const User = require('../models/user.model');

const SCHOOL_ID = 'Millennium School';
const DEFAULT_PASSWORD = 'Millennium2026!';

const USER_FIXTURES = {
  secretary: {
    username: 'millennium.secretaria',
    role: 'academic_secretary',
    name: 'Paula Andrea Castañeda',
    email: 'secretaria.academica@millennium.local',
    phone: '3001002001',
    documentType: 'CC',
    documentNumber: '52100451',
    address: 'Cra 12 #45-10, Cartagena',
  },
  teacher: {
    username: 'millennium.docente.feed',
    role: 'vendor',
    name: 'Valeria Torres Mendoza',
    email: 'vtorres@millennium.local',
    phone: '3001002002',
    documentType: 'CC',
    documentNumber: '33221144',
    address: 'Barrio Crespo Calle 70',
  },
  mainFather: {
    username: 'millennium.parent.arias',
    role: 'parent',
    name: 'Carlos Arias Romero',
    email: 'carias@millennium.local',
    phone: '3002003001',
    documentType: 'CC',
    documentNumber: '80124567',
    address: 'Conjunto Palma Real Torre 3 Apt 402',
  },
  mainMother: {
    username: 'millennium.parent.lina',
    role: 'parent',
    name: 'Lina Marcela Torres',
    email: 'ltorres@millennium.local',
    phone: '3002003002',
    documentType: 'CC',
    documentNumber: '45123478',
    address: 'Conjunto Palma Real Torre 3 Apt 402',
  },
  bucket2: {
    username: 'millennium.parent.duarte',
    role: 'parent',
    name: 'Sandra Duarte',
    email: 'sduarte@millennium.local',
    phone: '3004005001',
    documentType: 'CC',
    documentNumber: '31888111',
    address: 'Barrio El Bosque Manzana 4',
  },
  bucket3: {
    username: 'millennium.parent.romero',
    role: 'parent',
    name: 'Javier Romero',
    email: 'jromero@millennium.local',
    phone: '3004005002',
    documentType: 'CC',
    documentNumber: '72333444',
    address: 'Barrio Alameda Calle 18',
  },
  bucket4: {
    username: 'millennium.parent.sanchez',
    role: 'parent',
    name: 'Yolanda Sanchez',
    email: 'ysanchez@millennium.local',
    phone: '3004005003',
    documentType: 'CC',
    documentNumber: '41666777',
    address: 'Urbanizacion Villa Esperanza Casa 12',
  },
  bucket5: {
    username: 'millennium.parent.velez',
    role: 'parent',
    name: 'Mauricio Velez',
    email: 'mvelez@millennium.local',
    phone: '3004005004',
    documentType: 'CC',
    documentNumber: '91000888',
    address: 'Conjunto Los Almendros Casa 9',
  },
  bucket6: {
    username: 'millennium.parent.prieto',
    role: 'parent',
    name: 'Adriana Prieto',
    email: 'aprieto@millennium.local',
    phone: '3004005005',
    documentType: 'CC',
    documentNumber: '52777999',
    address: 'Portal del Mar Torre 2 Apt 603',
  },
};

const STUDENT_FIXTURES = [
  {
    key: 'salome',
    schoolCode: 'MIL-SEC-001',
    name: 'Salome Arias Torres',
    gender: 'female',
    birthDate: '2014-02-12',
    bloodType: 'O+',
    birthPlace: 'Cartagena',
    address: 'Conjunto Palma Real Torre 3 Apt 402',
    grade: '6A',
    course: '6A-Jaguar',
    documentType: 'TI',
    documentNumber: '1022334455',
    dailyLimit: 18000,
    parentKeys: ['mainFather', 'mainMother'],
    billingProfile: {
      enrollmentBonusAmount: 180000,
      annualTuitionAmount: 980000,
      monthlyTuitionAmount: 410000,
      dueDay: 10,
    },
  },
  {
    key: 'mateo',
    schoolCode: 'MIL-SEC-002',
    name: 'Mateo Arias Torres',
    gender: 'male',
    birthDate: '2017-07-03',
    bloodType: 'A+',
    birthPlace: 'Cartagena',
    address: 'Conjunto Palma Real Torre 3 Apt 402',
    grade: '3B',
    course: '3B-Colibri',
    documentType: 'TI',
    documentNumber: '1022334466',
    dailyLimit: 16000,
    parentKeys: ['mainFather', 'mainMother'],
    billingProfile: {
      enrollmentBonusAmount: 150000,
      annualTuitionAmount: 890000,
      monthlyTuitionAmount: 360000,
      dueDay: 10,
    },
  },
  {
    key: 'valentina',
    schoolCode: 'MIL-SEC-003',
    name: 'Valentina Duarte',
    gender: 'female',
    birthDate: '2015-09-18',
    bloodType: 'B+',
    birthPlace: 'Barranquilla',
    address: 'Barrio El Bosque Manzana 4',
    grade: '5A',
    course: '5A-Orquidea',
    documentType: 'TI',
    documentNumber: '1022334477',
    dailyLimit: 17000,
    parentKeys: ['bucket2'],
    billingProfile: {
      enrollmentBonusAmount: 140000,
      annualTuitionAmount: 920000,
      monthlyTuitionAmount: 370000,
      dueDay: 10,
    },
  },
  {
    key: 'martin',
    schoolCode: 'MIL-SEC-004',
    name: 'Martin Romero',
    gender: 'male',
    birthDate: '2013-11-25',
    bloodType: 'O-',
    birthPlace: 'Santa Marta',
    address: 'Barrio Alameda Calle 18',
    grade: '7B',
    course: '7B-Fenix',
    documentType: 'TI',
    documentNumber: '1022334488',
    dailyLimit: 19000,
    parentKeys: ['bucket3'],
    billingProfile: {
      enrollmentBonusAmount: 170000,
      annualTuitionAmount: 970000,
      monthlyTuitionAmount: 395000,
      dueDay: 10,
    },
  },
  {
    key: 'antonia',
    schoolCode: 'MIL-SEC-005',
    name: 'Antonia Sanchez',
    gender: 'female',
    birthDate: '2012-04-09',
    bloodType: 'AB+',
    birthPlace: 'Cartagena',
    address: 'Urbanizacion Villa Esperanza Casa 12',
    grade: '8A',
    course: '8A-Tucan',
    documentType: 'TI',
    documentNumber: '1022334499',
    dailyLimit: 20000,
    parentKeys: ['bucket4'],
    billingProfile: {
      enrollmentBonusAmount: 190000,
      annualTuitionAmount: 1010000,
      monthlyTuitionAmount: 420000,
      dueDay: 10,
    },
  },
  {
    key: 'jeronimo',
    schoolCode: 'MIL-SEC-006',
    name: 'Jeronimo Velez',
    gender: 'male',
    birthDate: '2011-06-14',
    bloodType: 'A-',
    birthPlace: 'Monteria',
    address: 'Conjunto Los Almendros Casa 9',
    grade: '9A',
    course: '9A-Oceano',
    documentType: 'TI',
    documentNumber: '1022334500',
    dailyLimit: 21000,
    parentKeys: ['bucket5'],
    billingProfile: {
      enrollmentBonusAmount: 200000,
      annualTuitionAmount: 1050000,
      monthlyTuitionAmount: 440000,
      dueDay: 10,
    },
  },
  {
    key: 'emilia',
    schoolCode: 'MIL-SEC-007',
    name: 'Emilia Prieto',
    gender: 'female',
    birthDate: '2010-10-21',
    bloodType: 'B-',
    birthPlace: 'Sincelejo',
    address: 'Portal del Mar Torre 2 Apt 603',
    grade: '10A',
    course: '10A-Andromeda',
    documentType: 'TI',
    documentNumber: '1022334501',
    dailyLimit: 22000,
    parentKeys: ['bucket6'],
    billingProfile: {
      enrollmentBonusAmount: 220000,
      annualTuitionAmount: 1100000,
      monthlyTuitionAmount: 470000,
      dueDay: 10,
    },
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
    firstName: tokens.slice(0, Math.max(1, tokens.length - 2)).join(' '),
    lastName: tokens.slice(-2).join(' '),
  };
}

function buildMonthKey(dateValue) {
  const date = new Date(dateValue);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthsAgo(months, day = 8) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - months, day, 9, 0, 0, 0);
}

function daysFromNow(days) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 9, 0, 0, 0);
}

async function upsertScopedUser({ passwordHash, ...userData }) {
  const existingUser = await User.findOne({ username: userData.username });

  if (existingUser && existingUser.schoolId !== SCHOOL_ID) {
    throw new Error(`El username ${userData.username} ya existe en ${existingUser.schoolId}.`);
  }

  const payload = {
    schoolId: SCHOOL_ID,
    name: userData.name,
    username: userData.username,
    email: normalizeText(userData.email).toLowerCase(),
    phone: normalizeText(userData.phone),
    address: normalizeText(userData.address),
    documentType: normalizeText(userData.documentType),
    documentNumber: normalizeText(userData.documentNumber),
    role: userData.role,
    status: 'active',
    deletedAt: null,
    passwordHash,
  };

  if (existingUser) {
    Object.assign(existingUser, payload);
    await existingUser.save();
    return existingUser;
  }

  return User.create(payload);
}

async function upsertParentMembership(parentUserId) {
  await CampusMembership.updateOne(
    { schoolId: SCHOOL_ID, userId: parentUserId, memberType: 'campus_parent' },
    {
      $set: {
        status: 'active',
        permissions: [],
        metadata: {
          title: 'Campus Familias',
          launchPath: '/campus/parent',
          notes: 'Seed de revision para secretaria academica.',
        },
      },
    },
    { upsert: true }
  );
}

async function upsertTeacherMembership(teacherUserId) {
  await CampusMembership.updateOne(
    { schoolId: SCHOOL_ID, userId: teacherUserId, memberType: 'campus_teacher' },
    {
      $set: {
        status: 'active',
        permissions: [],
        metadata: {
          title: 'Campus Docente',
          launchPath: '/campus/teacher',
          notes: 'Seed de revision para solicitudes de feed a acudientes.',
        },
      },
    },
    { upsert: true }
  );
}

async function upsertStudent(studentData) {
  const existingStudent = await Student.findOne({ schoolId: SCHOOL_ID, schoolCode: studentData.schoolCode });
  const payload = {
    schoolId: SCHOOL_ID,
    name: studentData.name,
    ...splitStudentName(studentData.name),
    schoolCode: studentData.schoolCode,
    grade: studentData.grade,
    course: studentData.course,
    gender: studentData.gender || '',
    documentType: studentData.documentType,
    documentNumber: studentData.documentNumber,
    birthDate: studentData.birthDate ? new Date(studentData.birthDate) : null,
    bloodType: studentData.bloodType || '',
    birthPlace: studentData.birthPlace || '',
    address: studentData.address || '',
    dailyLimit: studentData.dailyLimit,
    status: 'active',
    deletedAt: null,
  };

  if (existingStudent) {
    Object.assign(existingStudent, payload);
    await existingStudent.save();
    return existingStudent;
  }

  return Student.create(payload);
}

async function seedBillingProfile(studentId, profileData) {
  await StudentBillingProfile.updateOne(
    { schoolId: SCHOOL_ID, studentId },
    {
      $set: {
        enrollmentBonusAmount: Number(profileData.enrollmentBonusAmount || 0),
        annualTuitionAmount: Number(profileData.annualTuitionAmount || 0),
        monthlyTuitionAmount: Number(profileData.monthlyTuitionAmount || 0),
        dueDay: Number(profileData.dueDay || 10),
        active: true,
      },
    },
    { upsert: true }
  );

  return StudentBillingProfile.findOne({ schoolId: SCHOOL_ID, studentId });
}

async function createCharge(payload) {
  return AcademicCharge.create({
    schoolId: SCHOOL_ID,
    createdByUserId: payload.createdByUserId,
    createdByRole: payload.createdByRole,
    parentId: payload.parentId,
    studentId: payload.studentId || null,
    billingProfileId: payload.billingProfileId || null,
    category: payload.category,
    concept: payload.concept,
    description: payload.description || '',
    amount: Number(payload.amount || 0),
    dueDate: payload.dueDate,
    monthKey: payload.monthKey || buildMonthKey(payload.dueDate),
    status: payload.status || 'pending',
    paidAt: payload.paidAt || null,
    paymentMethod: payload.paymentMethod || '',
    audienceType: payload.audienceType || 'individual',
    targetGrade: payload.targetGrade || '',
    targetCourse: payload.targetCourse || '',
  });
}

async function createPayment({ charge, recordedByUserId, recordedByRole, amount, method, paidAt, notes }) {
  return AcademicChargePayment.create({
    schoolId: SCHOOL_ID,
    chargeId: charge._id,
    studentId: charge.studentId || null,
    parentId: charge.parentId,
    recordedByUserId,
    recordedByRole,
    amount: Number(amount || charge.amount || 0),
    method: method || 'parent_portal',
    notes: notes || '',
    paidAt: paidAt || new Date(),
  });
}

async function run() {
  try {
    const connection = await connectDB();
    console.log(`MongoDB connected (${connection.name})`);

    const seededUsernames = Object.values(USER_FIXTURES).map((item) => item.username);
    const seededSchoolCodes = STUDENT_FIXTURES.map((student) => student.schoolCode);
    const RootUser = resolveRegisteredModel('User', '');
    const RootStudent = resolveRegisteredModel('Student', '');
    const RootParentStudentLink = resolveRegisteredModel('ParentStudentLink', '');
    const RootStudentBillingProfile = resolveRegisteredModel('StudentBillingProfile', '');
    const RootAcademicCharge = resolveRegisteredModel('AcademicCharge', '');
    const RootAcademicChargePayment = resolveRegisteredModel('AcademicChargePayment', '');
    const RootAcademicCommunication = resolveRegisteredModel('AcademicCommunication', '');
    const RootAcademicCommunicationRequest = resolveRegisteredModel('AcademicCommunicationRequest', '');
    const RootCampusMembership = resolveRegisteredModel('CampusMembership', '');

    const rootStudents = await RootStudent.find({ schoolId: SCHOOL_ID, schoolCode: { $in: seededSchoolCodes } }).select('_id').lean();
    const rootStudentIds = rootStudents.map((student) => student._id);
    const rootUsers = await RootUser.find({ schoolId: SCHOOL_ID, username: { $in: seededUsernames } }).select('_id').lean();
    const rootUserIds = rootUsers.map((user) => user._id);

    await Promise.all([
      RootAcademicCommunication.deleteMany({ schoolId: SCHOOL_ID }),
      RootAcademicCommunicationRequest.deleteMany({ schoolId: SCHOOL_ID }),
      RootAcademicChargePayment.deleteMany({ schoolId: SCHOOL_ID }),
      RootAcademicCharge.deleteMany({ schoolId: SCHOOL_ID }),
      RootCampusMembership.deleteMany({ schoolId: SCHOOL_ID, userId: { $in: rootUserIds } }),
      RootParentStudentLink.deleteMany({ schoolId: SCHOOL_ID, $or: [{ parentId: { $in: rootUserIds } }, { studentId: { $in: rootStudentIds } }] }),
      RootStudentBillingProfile.deleteMany({ schoolId: SCHOOL_ID, studentId: { $in: rootStudentIds } }),
      RootStudent.deleteMany({ schoolId: SCHOOL_ID, _id: { $in: rootStudentIds } }),
      RootUser.deleteMany({ schoolId: SCHOOL_ID, _id: { $in: rootUserIds } }),
    ]);

    await runWithSchoolContext(SCHOOL_ID, async () => {
      const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
      const users = {};

      for (const [key, fixture] of Object.entries(USER_FIXTURES)) {
        users[key] = await upsertScopedUser({ ...fixture, passwordHash });
        if (fixture.role === 'parent') {
          await upsertParentMembership(users[key]._id);
        }
      }

      await upsertTeacherMembership(users.teacher._id);

      await AcademicCommunication.deleteMany({ schoolId: SCHOOL_ID });
      await AcademicCommunicationRequest.deleteMany({ schoolId: SCHOOL_ID });
      await AcademicFeeConfiguration.deleteMany({ schoolId: SCHOOL_ID });
      await AcademicChargePayment.deleteMany({ schoolId: SCHOOL_ID });
      await AcademicCharge.deleteMany({ schoolId: SCHOOL_ID });

      const existingStudents = await Student.find({ schoolId: SCHOOL_ID, schoolCode: { $in: seededSchoolCodes } }).select('_id').lean();
      const existingStudentIds = existingStudents.map((student) => student._id);
      if (existingStudentIds.length) {
        await Promise.all([
          ParentStudentLink.deleteMany({ schoolId: SCHOOL_ID, studentId: { $in: existingStudentIds } }),
          StudentBillingProfile.deleteMany({ schoolId: SCHOOL_ID, studentId: { $in: existingStudentIds } }),
          Student.deleteMany({ schoolId: SCHOOL_ID, _id: { $in: existingStudentIds } }),
        ]);
      }

      const students = {};
      const billingProfiles = {};

      await AcademicFeeConfiguration.create({
        schoolId: SCHOOL_ID,
        academicYear: String(new Date().getFullYear()),
        gradeSettings: STUDENT_FIXTURES.map((fixture) => ({
          grade: fixture.grade,
          enrollmentFee: Number(fixture.billingProfile.annualTuitionAmount || 0),
          monthlyTuition: Number(fixture.billingProfile.monthlyTuitionAmount || 0),
          enrollmentBonus: Number(fixture.billingProfile.enrollmentBonusAmount || 0),
          dueDay: Number(fixture.billingProfile.dueDay || 10),
          benefitRules: [
            { label: 'Pronto pago 1-10', startDay: 1, endDay: 10, discountPercent: 25 },
            { label: 'Pronto pago 11-30', startDay: 11, endDay: 30, discountPercent: 15 },
          ],
        })),
      });

      for (const fixture of STUDENT_FIXTURES) {
        const student = await upsertStudent(fixture);
        students[fixture.key] = student;
        billingProfiles[fixture.key] = await seedBillingProfile(student._id, fixture.billingProfile);

        for (const parentKey of fixture.parentKeys) {
          await ParentStudentLink.updateOne(
            { schoolId: SCHOOL_ID, parentId: users[parentKey]._id, studentId: student._id },
            {
              $set: {
                relationship: parentKey === 'mainMother' ? 'madre' : parentKey === 'mainFather' ? 'padre' : 'acudiente',
                status: 'active',
              },
            },
            { upsert: true }
          );
        }
      }

      await createCharge({
        createdByUserId: users.secretary._id,
        createdByRole: users.secretary.role,
        parentId: users.mainFather._id,
        studentId: students.salome._id,
        billingProfileId: billingProfiles.salome._id,
        category: 'monthly_tuition',
        concept: 'Pension abril 2026',
        description: 'Mensualidad regular de abril para Salome Arias Torres.',
        amount: 410000,
        dueDate: daysFromNow(6),
        audienceType: 'individual',
        targetGrade: students.salome.grade,
        targetCourse: students.salome.course,
      });

      await createCharge({
        createdByUserId: users.secretary._id,
        createdByRole: users.secretary.role,
        parentId: users.mainFather._id,
        studentId: students.mateo._id,
        billingProfileId: billingProfiles.mateo._id,
        category: 'additional',
        concept: 'Salida pedagogica museo del Caribe',
        description: 'Cobro adicional para la salida pedagogica de tercero B.',
        amount: 95000,
        dueDate: daysFromNow(2),
        audienceType: 'course',
        targetGrade: students.mateo.grade,
        targetCourse: students.mateo.course,
      });

      const paidCharge = await createCharge({
        createdByUserId: users.secretary._id,
        createdByRole: users.secretary.role,
        parentId: users.mainFather._id,
        studentId: students.salome._id,
        billingProfileId: billingProfiles.salome._id,
        category: 'annual_tuition',
        concept: 'Matricula anual 2026',
        description: 'Matricula pagada para el ano lectivo 2026.',
        amount: 980000,
        dueDate: monthsAgo(1, 10),
        audienceType: 'enrollment',
        targetGrade: students.salome.grade,
        targetCourse: students.salome.course,
        status: 'paid',
        paidAt: daysFromNow(-4),
        paymentMethod: 'parent_portal',
      });

      await createPayment({
        charge: paidCharge,
        recordedByUserId: users.mainFather._id,
        recordedByRole: users.mainFather.role,
        amount: 980000,
        method: 'parent_portal',
        paidAt: daysFromNow(-4),
        notes: 'Pago semilla para validar recaudo sincronizado.',
      });

      const overdueFixtures = [
        { parentKey: 'bucket2', studentKey: 'valentina', months: 2, amount: 370000 },
        { parentKey: 'bucket3', studentKey: 'martin', months: 3, amount: 395000 },
        { parentKey: 'bucket4', studentKey: 'antonia', months: 4, amount: 420000 },
        { parentKey: 'bucket5', studentKey: 'jeronimo', months: 5, amount: 440000 },
        { parentKey: 'bucket6', studentKey: 'emilia', months: 6, amount: 470000 },
      ];

      for (const item of overdueFixtures) {
        await createCharge({
          createdByUserId: users.secretary._id,
          createdByRole: users.secretary.role,
          parentId: users[item.parentKey]._id,
          studentId: students[item.studentKey]._id,
          billingProfileId: billingProfiles[item.studentKey]._id,
          category: 'monthly_tuition',
          concept: `Pension vencida ${buildMonthKey(monthsAgo(item.months, 6))}`,
          description: `Semilla de cartera para validar filtro de ${item.months} meses.`,
          amount: item.amount,
          dueDate: monthsAgo(item.months, 6),
          audienceType: 'individual',
          targetGrade: students[item.studentKey].grade,
          targetCourse: students[item.studentKey].course,
          status: 'pending',
        });
      }

      const parentIds = {
        all: [users.mainFather._id, users.mainMother._id, users.bucket2._id, users.bucket3._id, users.bucket4._id, users.bucket5._id, users.bucket6._id],
        course6A: [users.mainFather._id, users.mainMother._id],
        individualMain: [users.mainFather._id],
      };

      const studentIds = {
        all: Object.values(students).map((student) => student._id),
        course6A: [students.salome._id],
        individualMain: [students.salome._id, students.mateo._id],
      };

      await AcademicCommunication.insertMany([
        {
          schoolId: SCHOOL_ID,
          createdByUserId: users.secretary._id,
          createdByName: users.secretary.name,
          title: 'Bienvenida al modulo de secretaría académica',
          body: 'Desde hoy podras recibir comunicados, ver cartera academica y registrar pagos directamente desde la app del acudiente.',
          audienceType: 'general',
          gradeTargets: [],
          courseTargets: [],
          parentTargets: [],
          studentTargets: [],
          recipientParentIds: parentIds.all,
          recipientStudentIds: studentIds.all,
          emailSubject: 'Millennium School | Bienvenida familias',
          channels: { push: true, email: true },
          sentAt: daysFromNow(-3),
          deliverySummary: { seeded: true, audienceSize: parentIds.all.length },
        },
        {
          schoolId: SCHOOL_ID,
          createdByUserId: users.secretary._id,
          createdByName: users.secretary.name,
          title: 'Reunion de grado 6A',
          body: 'Recordatorio: reunion de familias de 6A este jueves a las 6:00 p.m. en el auditorio principal.',
          audienceType: 'course',
          gradeTargets: ['6A'],
          courseTargets: ['6A-Jaguar'],
          parentTargets: [],
          studentTargets: studentIds.course6A,
          recipientParentIds: parentIds.course6A,
          recipientStudentIds: studentIds.course6A,
          emailSubject: 'Millennium School | Reunion curso 6A-Jaguar',
          channels: { push: true, email: true },
          sentAt: daysFromNow(-2),
          deliverySummary: { seeded: true, audienceSize: parentIds.course6A.length },
        },
        {
          schoolId: SCHOOL_ID,
          createdByUserId: users.secretary._id,
          createdByName: users.secretary.name,
          title: 'Cartera prioritaria familia Arias',
          body: 'Tienes un cobro de pension y uno adicional pendientes. Puedes validarlos desde Pagos en la app del acudiente.',
          audienceType: 'individual',
          gradeTargets: [],
          courseTargets: [],
          parentTargets: parentIds.individualMain,
          studentTargets: studentIds.individualMain,
          recipientParentIds: parentIds.individualMain,
          recipientStudentIds: studentIds.individualMain,
          emailSubject: 'Millennium School | Revision de cartera academica',
          channels: { push: true, email: true },
          sentAt: daysFromNow(-1),
          deliverySummary: { seeded: true, audienceSize: parentIds.individualMain.length },
        },
      ]);

      await AcademicCommunicationRequest.insertMany([
        {
          schoolId: SCHOOL_ID,
          teacherUserId: users.teacher._id,
          teacherName: users.teacher.name,
          title: 'Invitacion a feria de ciencias de primaria',
          body: 'Solicito publicar invitacion para familias de primaria sobre la feria de ciencias del viernes. Se sugiere llegar 15 minutos antes al auditorio.',
          emailSubject: 'Millennium School | Feria de ciencias primaria',
          audienceType: 'grade',
          gradeTargets: ['3B', '5A', '6A'],
          courseTargets: [],
          parentTargets: [],
          studentTargets: [students.salome._id, students.mateo._id, students.valentina._id],
          channels: { push: true, email: true },
          status: 'pending',
          submittedAt: daysFromNow(-1),
        },
        {
          schoolId: SCHOOL_ID,
          teacherUserId: users.teacher._id,
          teacherName: users.teacher.name,
          title: 'Cambio de horario para direccion de grupo',
          body: 'Solicito informar a la familia Arias que la reunion de direccion de grupo pasa de 4:00 p.m. a 4:30 p.m.',
          emailSubject: 'Millennium School | Ajuste horario direccion de grupo',
          audienceType: 'individual',
          gradeTargets: [],
          courseTargets: [],
          parentTargets: [users.mainFather._id],
          studentTargets: [students.salome._id],
          channels: { push: true, email: true },
          status: 'pending',
          submittedAt: daysFromNow(0),
        },
      ]);
    });

    console.log('Seed Millennium secretaría académica completado.');
    console.log(`Colegio: ${SCHOOL_ID}`);
    console.log(`Password para todos los usuarios seeded: ${DEFAULT_PASSWORD}`);
    console.log('Usuarios recomendados para revisar:');
    console.log(`- Secretaría académica: ${USER_FIXTURES.secretary.username}`);
    console.log(`- Docente con solicitudes: ${USER_FIXTURES.teacher.username}`);
    console.log(`- Acudiente principal: ${USER_FIXTURES.mainFather.username}`);
    console.log(`- Acudiente alterno: ${USER_FIXTURES.mainMother.username}`);
    console.log(`- Moroso 6+ meses: ${USER_FIXTURES.bucket6.username}`);
  } catch (error) {
    console.error('Error ejecutando seed de Millennium secretaría académica:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();