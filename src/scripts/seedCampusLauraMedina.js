require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const User = require('../models/user.model');
const Student = require('../models/student.model');
const CampusMembership = require('../models/campusMembership.model');
const CampusCourse = require('../models/campusCourse.model');
const CampusPost = require('../models/campusPost.model');
const CampusGradeEntry = require('../models/campusGradeEntry.model');

const DEFAULT_SCHOOL_ID = 'comergio-demo';
const DEFAULT_PASSWORD = 'Campus2026!';
const TEACHER_USERNAME = 'laura.medina';
const COORDINATION_USERNAME = 'coordinacion.campus';

const SUBJECT_ASSIGNMENTS = [
  {
    subject: 'Fisica',
    colorToken: '#355070',
    gradeKeys: ['9A', '9B', '10A', '10B', '11A', '11B'],
    description: 'Fisica con enfoque en laboratorio, analisis de movimiento y resolucion guiada de problemas.',
    classSessions: [
      { weekday: 1, startTime: '07:00', endTime: '08:00', label: 'Teoria' },
      { weekday: 3, startTime: '09:00', endTime: '10:00', label: 'Practica' },
      { weekday: 4, startTime: '11:00', endTime: '12:00', label: 'Laboratorio' },
    ],
  },
  {
    subject: 'Matematicas',
    colorToken: '#2a6f97',
    gradeKeys: ['6A', '6B', '7A', '7B', '8A', '8B'],
    description: 'Matematicas con trabajo por competencias, ejercicios semanales y evaluaciones cortas.',
    classSessions: [
      { weekday: 1, startTime: '08:00', endTime: '09:00', label: 'Conceptos base' },
      { weekday: 2, startTime: '10:00', endTime: '11:00', label: 'Taller' },
      { weekday: 4, startTime: '07:00', endTime: '08:00', label: 'Refuerzo' },
    ],
  },
];

const FIRST_NAMES = [
  'Sofia', 'Valentina', 'Samuel', 'Mateo', 'Isabella', 'Santiago', 'Mariana', 'Juan', 'Luciana', 'Daniel',
  'Antonella', 'Nicolas', 'Gabriela', 'Sebastian', 'Emilia', 'Manuel', 'Salome', 'David', 'Sara', 'Jeronimo',
  'Maria', 'Felipe', 'Camila', 'Andres', 'Juliana', 'Martin', 'Paula', 'Miguel', 'Laura', 'Tomas',
  'Manuela', 'Thiago', 'Catalina', 'Emmanuel', 'Victoria', 'Cristian', 'Daniela', 'Alejandro', 'Regina', 'Esteban',
  'Natalia', 'Juanita', 'Josue', 'Mia', 'Simon', 'Zoe', 'Cristina', 'Maximiliano', 'Elena', 'Agustin',
  'Lorena', 'Jose', 'Aitana', 'Kevin', 'Carolina', 'Angel', 'Emma', 'Joaquin', 'Adriana', 'Benjamin',
];

const LAST_NAMES = [
  'Gomez', 'Rodriguez', 'Martinez', 'Garcia', 'Lopez', 'Torres', 'Ramirez', 'Castro', 'Morales', 'Herrera',
  'Rojas', 'Medina', 'Diaz', 'Suarez', 'Vargas', 'Fernandez', 'Romero', 'Ortiz', 'Pineda', 'Cortes',
  'Restrepo', 'Navarro', 'Arias', 'Mendoza', 'Guerrero', 'Nunez', 'Santos', 'Valencia', 'Rivera', 'Acosta',
  'Silva', 'Bautista', 'Leon', 'Franco', 'Velasquez', 'Mejia', 'Reyes', 'Rincon', 'Parra', 'Sarmiento',
];

function parseSchoolId() {
  const argValue = process.argv.find((arg) => arg.startsWith('--schoolId='));
  if (argValue) {
    return String(argValue.split('=').slice(1).join('=') || '').trim() || DEFAULT_SCHOOL_ID;
  }

  return String(process.env.CAMPUS_SEED_SCHOOL_ID || '').trim() || DEFAULT_SCHOOL_ID;
}

function hashString(value) {
  return String(value || '').split('').reduce((accumulator, char) => ((accumulator * 31) + char.charCodeAt(0)) >>> 0, 7);
}

function buildStudentCount(gradeKey) {
  return 17 + (hashString(gradeKey) % 9);
}

function buildStudentName(index) {
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
  const lastName = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  const secondLastName = LAST_NAMES[(index * 7) % LAST_NAMES.length];
  return `${firstName} ${lastName} ${secondLastName}`;
}

function buildSchoolCode(subjectCode, gradeKey, index) {
  return `LM-${subjectCode}-${gradeKey}-${String(index + 1).padStart(2, '0')}`;
}

function buildAcademicPeriods(subject) {
  const componentBlueprints = subject === 'Fisica'
    ? [
      { baseKey: 'workshop', name: 'Taller', weight: 35, order: 10 },
      { baseKey: 'quiz', name: 'Quiz', weight: 25, order: 20 },
      { baseKey: 'lab_or_exam', name: 'Laboratorio / evaluacion', weight: 40, order: 30 },
    ]
    : [
      { baseKey: 'workshop', name: 'Taller', weight: 35, order: 10 },
      { baseKey: 'quiz', name: 'Quiz', weight: 25, order: 20 },
      { baseKey: 'exam', name: 'Evaluacion', weight: 40, order: 30 },
    ];

  return [
    { key: 'period_1', name: 'Periodo 1', weight: 30, order: 10 },
    { key: 'period_2', name: 'Periodo 2', weight: 30, order: 20 },
    { key: 'period_3', name: 'Periodo 3', weight: 40, order: 30 },
  ].map((period) => ({
    ...period,
    gradingComponents: componentBlueprints.map((component) => ({
      key: `${period.key}_${component.baseKey}`,
      name: component.name,
      weight: component.weight,
      order: component.order,
    })),
  }));
}

function buildScore(seed) {
  const base = 2.4 + ((hashString(seed) % 25) / 10);
  return Number(Math.min(5, base).toFixed(1));
}

function buildCourseTitle(subject, gradeKey) {
  return `${subject} ${gradeKey}`;
}

function extractGradeLevel(gradeKey) {
  return String(gradeKey).replace(/[^0-9]+/g, '');
}

function extractSection(gradeKey) {
  return String(gradeKey).replace(/^[0-9]+/g, '');
}

function buildSchedulePool() {
  const slots = [];

  for (const weekday of [1, 2, 3, 4, 5]) {
    for (let hour = 7; hour <= 14; hour += 1) {
      slots.push({
        weekday,
        startTime: `${String(hour).padStart(2, '0')}:30`,
        endTime: `${String(hour + 1).padStart(2, '0')}:30`,
      });
    }
  }

  return slots;
}

async function upsertUser({ schoolId, name, username, email, role, passwordHash }) {
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    existingUser.schoolId = schoolId;
    existingUser.name = name;
    existingUser.email = email;
    existingUser.role = role;
    existingUser.status = 'active';
    existingUser.deletedAt = null;
    existingUser.passwordHash = passwordHash;
    await existingUser.save();
    return existingUser;
  }

  return User.create({
    schoolId,
    name,
    username,
    email,
    passwordHash,
    role,
    status: 'active',
  });
}

async function upsertMembership({ schoolId, userId, memberType, title, notes }) {
  await CampusMembership.updateOne(
    { schoolId, userId, memberType },
    {
      $set: {
        status: 'active',
        permissions: [],
        metadata: {
          title,
          launchPath: memberType === 'campus_teacher' ? '/campus/teacher' : '/campus/coordination',
          notes,
        },
      },
    },
    { upsert: true }
  );
}

async function seedLauraCampus() {
  const schoolId = parseSchoolId();
  const connection = await connectDB();
  console.log(`MongoDB connected (${connection.name})`);
  console.log(`Target schoolId: ${schoolId}`);

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const teacherUser = await upsertUser({
    schoolId,
    name: 'Profe Laura Medina',
    username: TEACHER_USERNAME,
    email: 'laura.medina@campus.local',
    role: 'vendor',
    passwordHash,
  });

  const coordinationUser = await upsertUser({
    schoolId,
    name: 'Coordinacion Academica',
    username: COORDINATION_USERNAME,
    email: 'coordinacion.campus@campus.local',
    role: 'admin',
    passwordHash,
  });

  await upsertMembership({
    schoolId,
    userId: teacherUser._id,
    memberType: 'campus_teacher',
    title: 'Campus Docente',
    notes: 'Docente de Fisica y Matematicas para seed realista de Campus.',
  });

  await upsertMembership({
    schoolId,
    userId: coordinationUser._id,
    memberType: 'campus_coordination',
    title: 'Campus Coordinacion',
    notes: 'Usuario coordinador para asignar la carga academica de Laura Medina.',
  });

  const targetGradeKeys = SUBJECT_ASSIGNMENTS.flatMap((assignment) => assignment.gradeKeys);
  const studentCodePrefixes = ['FIS', 'MAT'].flatMap((subjectCode) => targetGradeKeys.map((gradeKey) => `LM-${subjectCode}-${gradeKey}-`));
  const schoolCodeRegex = new RegExp(`^(${studentCodePrefixes.map((prefix) => prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);

  const existingCourses = await CampusCourse.find({
    schoolId,
    teacherUserId: String(teacherUser._id),
    studentGradeKey: { $in: targetGradeKeys },
  }).select('_id');
  const existingCourseIds = existingCourses.map((course) => course._id);

  if (existingCourseIds.length > 0) {
    await Promise.all([
      CampusGradeEntry.deleteMany({ schoolId, courseId: { $in: existingCourseIds } }),
      CampusPost.deleteMany({ schoolId, courseId: { $in: existingCourseIds } }),
      CampusCourse.deleteMany({ _id: { $in: existingCourseIds } }),
    ]);
  }

  await Student.deleteMany({ schoolId, schoolCode: { $regex: schoolCodeRegex } });

  const studentsByGrade = new Map();
  let globalStudentIndex = 0;
  const schedulePool = buildSchedulePool();
  let scheduleCursor = 0;

  for (const assignment of SUBJECT_ASSIGNMENTS) {
    const subjectCode = assignment.subject === 'Fisica' ? 'FIS' : 'MAT';
    for (const gradeKey of assignment.gradeKeys) {
      const studentCount = buildStudentCount(gradeKey);
      const gradeStudentsPayload = [];
      for (let index = 0; index < studentCount; index += 1) {
        gradeStudentsPayload.push({
          schoolId,
          name: buildStudentName(globalStudentIndex),
          schoolCode: buildSchoolCode(subjectCode, gradeKey, index),
          grade: gradeKey,
          dailyLimit: 25000,
          status: 'active',
        });
        globalStudentIndex += 1;
      }

      const createdStudents = await Student.insertMany(gradeStudentsPayload, { ordered: true });
      studentsByGrade.set(`${assignment.subject}:${gradeKey}`, createdStudents);
    }
  }

  const createdCourses = [];
  for (const assignment of SUBJECT_ASSIGNMENTS) {
    for (const gradeKey of assignment.gradeKeys) {
      const academicPeriods = buildAcademicPeriods(assignment.subject);
      const assignedClassSessions = assignment.classSessions.map((session) => {
        const assignedSlot = schedulePool[scheduleCursor % schedulePool.length];
        scheduleCursor += 1;
        return {
          weekday: assignedSlot.weekday,
          startTime: assignedSlot.startTime,
          endTime: assignedSlot.endTime,
          label: session.label,
        };
      });
      const course = await CampusCourse.create({
        schoolId,
        teacherUserId: String(teacherUser._id),
        assignedByUserId: String(coordinationUser._id),
        title: buildCourseTitle(assignment.subject, gradeKey),
        subject: assignment.subject,
        gradeLevel: extractGradeLevel(gradeKey),
        section: extractSection(gradeKey),
        studentGradeKey: gradeKey,
        description: `${assignment.description} Grupo ${gradeKey}.`,
        colorToken: assignment.colorToken,
        classSessions: assignedClassSessions,
        academicPeriods,
        gradingComponents: academicPeriods[0].gradingComponents,
        status: 'active',
      });

      createdCourses.push({ course, assignment, gradeKey, academicPeriods, assignedClassSessions });
    }
  }

  const gradeEntries = [];
  const posts = [];

  createdCourses.forEach(({ course, assignment, gradeKey, academicPeriods, assignedClassSessions }) => {
    const students = studentsByGrade.get(`${assignment.subject}:${gradeKey}`) || [];
    students.forEach((student) => {
      academicPeriods.forEach((period) => {
        period.gradingComponents.forEach((component) => {
          gradeEntries.push({
            schoolId,
            courseId: course._id,
            teacherUserId: String(teacherUser._id),
            studentId: student._id,
            academicPeriodKey: period.key,
            componentKey: component.key,
            score: buildScore(`${course._id}:${student._id}:${period.key}:${component.key}`),
            feedback: `${component.name} registrada para ${student.name}.`,
            gradedAt: new Date('2026-03-28T10:00:00.000Z'),
          });
        });
      });
    });

    posts.push(
      {
        schoolId,
        teacherUserId: String(teacherUser._id),
        courseId: course._id,
        type: 'Tarea',
        title: `Taller base ${assignment.subject} ${gradeKey}`,
        body: `Actividad principal de ${assignment.subject.toLowerCase()} para el grupo ${gradeKey}.`,
        deliveryMode: 'date',
        dueAt: new Date('2026-04-04T23:59:00.000Z'),
        status: 'published',
        publishedAt: new Date('2026-03-28T08:00:00.000Z'),
      },
      {
        schoolId,
        teacherUserId: String(teacherUser._id),
        courseId: course._id,
        type: 'Material',
        title: `Material de apoyo ${assignment.subject} ${gradeKey}`,
        body: `Guia introductoria y material de repaso para ${assignment.subject.toLowerCase()} en ${gradeKey}.`,
        deliveryMode: 'class',
        scheduledClassDate: new Date('2026-04-01T12:00:00.000Z'),
        scheduledClassSession: assignedClassSessions[0],
        status: 'published',
        publishedAt: new Date('2026-03-28T09:00:00.000Z'),
      }
    );
  });

  if (gradeEntries.length > 0) {
    await CampusGradeEntry.insertMany(gradeEntries, { ordered: false });
  }

  if (posts.length > 0) {
    await CampusPost.insertMany(posts, { ordered: false });
  }

  const totalStudents = Array.from(studentsByGrade.values()).reduce((sum, students) => sum + students.length, 0);
  console.log('Laura Medina campus seed completed successfully.');
  console.log(`Teacher username: ${TEACHER_USERNAME}`);
  console.log(`Coordination username: ${COORDINATION_USERNAME}`);
  console.log(`Default password: ${DEFAULT_PASSWORD}`);
  console.log(`Courses created: ${createdCourses.length}`);
  console.log(`Students created: ${totalStudents}`);
  console.log('Note: Laura uses legacy role vendor because User.role still does not expose a teacher enum; actual campus access comes from campus_teacher membership.');
}

async function run() {
  try {
    await seedLauraCampus();
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Laura Medina campus seed failed:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

run();