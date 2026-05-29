require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const User = require('../models/user.model');
const Student = require('../models/student.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Wallet = require('../models/wallet.model');
const Store = require('../models/store.model');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const CampusMembership = require('../models/campusMembership.model');
const CampusCourse = require('../models/campusCourse.model');
const CampusPost = require('../models/campusPost.model');
const CampusGradeEntry = require('../models/campusGradeEntry.model');

const SCHOOL_ID = 'Millennium School';
const DEFAULT_PASSWORD = 'Millennium2026!';
const PARENT_USERNAME = 'millennium.parent';
const TEACHER_USERNAME = 'millennium.docente';
const COORDINATION_USERNAME = 'millennium.coordinacion';

function buildAcademicPeriods() {
  return [
    {
      key: 'period_1',
      name: 'Periodo 1',
      weight: 30,
      order: 10,
      gradingComponents: [
        { key: 'period_1_taller', name: 'Taller', weight: 35, order: 10, subcomponents: [] },
        { key: 'period_1_quiz', name: 'Quiz', weight: 25, order: 20, subcomponents: [] },
        { key: 'period_1_proyecto', name: 'Proyecto', weight: 40, order: 30, subcomponents: [] },
      ],
    },
    {
      key: 'period_2',
      name: 'Periodo 2',
      weight: 30,
      order: 20,
      gradingComponents: [
        { key: 'period_2_taller', name: 'Taller', weight: 35, order: 10, subcomponents: [] },
        { key: 'period_2_quiz', name: 'Quiz', weight: 25, order: 20, subcomponents: [] },
        { key: 'period_2_proyecto', name: 'Proyecto', weight: 40, order: 30, subcomponents: [] },
      ],
    },
    {
      key: 'period_3',
      name: 'Periodo 3',
      weight: 40,
      order: 30,
      gradingComponents: [
        { key: 'period_3_taller', name: 'Taller', weight: 30, order: 10, subcomponents: [] },
        { key: 'period_3_quiz', name: 'Quiz', weight: 20, order: 20, subcomponents: [] },
        { key: 'period_3_examen', name: 'Examen final', weight: 50, order: 30, subcomponents: [] },
      ],
    },
  ];
}

function buildScore(seed) {
  const normalized = String(seed || '');
  let hash = 11;
  for (const char of normalized) {
    hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  }
  const value = 3.1 + ((hash % 18) / 10);
  return Number(Math.min(5, value).toFixed(1));
}

async function upsertScopedUser({ name, username, email, role, passwordHash }) {
  const existingUser = await User.findOne({ username });

  if (existingUser && existingUser.schoolId !== SCHOOL_ID) {
    throw new Error(`El username ${username} ya existe en ${existingUser.schoolId}. Usa otro username para Millennium School.`);
  }

  if (existingUser) {
    existingUser.schoolId = SCHOOL_ID;
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
    schoolId: SCHOOL_ID,
    name,
    username,
    email,
    passwordHash,
    role,
    status: 'active',
  });
}

async function upsertMembership({ userId, memberType, title, launchPath, notes }) {
  await CampusMembership.updateOne(
    { schoolId: SCHOOL_ID, userId, memberType },
    {
      $set: {
        status: 'active',
        permissions: [],
        metadata: {
          title,
          launchPath,
          notes,
        },
      },
    },
    { upsert: true }
  );
}

async function run() {
  try {
    const connection = await connectDB();
    console.log(`MongoDB connected (${connection.name})`);

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    const [parentUser, teacherUser, coordinationUser] = await Promise.all([
      upsertScopedUser({
        name: 'Acudiente Millennium',
        username: PARENT_USERNAME,
        email: 'acudiente@millennium.local',
        role: 'parent',
        passwordHash,
      }),
      upsertScopedUser({
        name: 'Profe Valeria Torres',
        username: TEACHER_USERNAME,
        email: 'docente@millennium.local',
        role: 'vendor',
        passwordHash,
      }),
      upsertScopedUser({
        name: 'Coordinacion Millennium',
        username: COORDINATION_USERNAME,
        email: 'coordinacion@millennium.local',
        role: 'admin',
        passwordHash,
      }),
    ]);

    await Promise.all([
      CampusMembership.deleteMany({ schoolId: SCHOOL_ID }),
      ParentStudentLink.deleteMany({ schoolId: SCHOOL_ID }),
      Wallet.deleteMany({ schoolId: SCHOOL_ID }),
      CampusGradeEntry.deleteMany({ schoolId: SCHOOL_ID }),
      CampusPost.deleteMany({ schoolId: SCHOOL_ID }),
      CampusCourse.deleteMany({ schoolId: SCHOOL_ID }),
      Product.deleteMany({ schoolId: SCHOOL_ID }),
      Category.deleteMany({ schoolId: SCHOOL_ID }),
      Store.deleteMany({ schoolId: SCHOOL_ID }),
      Student.deleteMany({ schoolId: SCHOOL_ID }),
    ]);

    await Promise.all([
      upsertMembership({
        userId: parentUser._id,
        memberType: 'campus_parent',
        title: 'Campus Familias',
        launchPath: '/campus/parent',
        notes: 'Acudiente principal de Millennium School.',
      }),
      upsertMembership({
        userId: teacherUser._id,
        memberType: 'campus_teacher',
        title: 'Campus Docente',
        launchPath: '/campus/teacher',
        notes: 'Docente base para pruebas academicas de Millennium School.',
      }),
      upsertMembership({
        userId: coordinationUser._id,
        memberType: 'campus_coordination',
        title: 'Campus Coordinacion',
        launchPath: '/campus/coordination',
        notes: 'Usuario de coordinacion para asignar cursos y horarios.',
      }),
    ]);

    const students = await Student.insertMany([
      {
        schoolId: SCHOOL_ID,
        name: 'Sofia Medina',
        schoolCode: 'MIL-001',
        grade: '6A',
        dailyLimit: 18000,
        status: 'active',
      },
      {
        schoolId: SCHOOL_ID,
        name: 'Tomas Medina',
        schoolCode: 'MIL-002',
        grade: '10A',
        dailyLimit: 22000,
        status: 'active',
      },
    ], { ordered: true });

    await ParentStudentLink.insertMany(students.map((student) => ({
      schoolId: SCHOOL_ID,
      parentId: parentUser._id,
      studentId: student._id,
      relationship: 'acudiente',
      status: 'active',
    })));

    await Wallet.insertMany([
      { schoolId: SCHOOL_ID, studentId: students[0]._id, balance: 85000, status: 'active' },
      { schoolId: SCHOOL_ID, studentId: students[1]._id, balance: 120000, status: 'active' },
    ]);

    const store = await Store.create({
      schoolId: SCHOOL_ID,
      name: 'Cafeteria Millennium',
      location: 'Bloque central',
      status: 'active',
    });

    const [beveragesCategory, snacksCategory] = await Category.create([
      { schoolId: SCHOOL_ID, name: 'Bebidas', status: 'active' },
      { schoolId: SCHOOL_ID, name: 'Snacks', status: 'active' },
    ]);

    await Product.insertMany([
      {
        schoolId: SCHOOL_ID,
        name: 'Jugo natural',
        categoryId: beveragesCategory._id,
        storeId: store._id,
        price: 4500,
        cost: 1800,
        stock: 80,
        inventoryAlertStock: 12,
        status: 'active',
      },
      {
        schoolId: SCHOOL_ID,
        name: 'Wrap de pollo',
        categoryId: snacksCategory._id,
        storeId: store._id,
        price: 9800,
        cost: 4300,
        stock: 42,
        inventoryAlertStock: 8,
        status: 'active',
      },
      {
        schoolId: SCHOOL_ID,
        name: 'Barra de cereal',
        categoryId: snacksCategory._id,
        storeId: store._id,
        price: 3200,
        cost: 1300,
        stock: 100,
        inventoryAlertStock: 14,
        status: 'active',
      },
    ]);

    const academicPeriods = buildAcademicPeriods();
    const courses = await CampusCourse.insertMany([
      {
        schoolId: SCHOOL_ID,
        teacherUserId: String(teacherUser._id),
        assignedByUserId: String(coordinationUser._id),
        title: 'Matematicas 7A',
        subject: 'Matematicas',
        gradeLevel: '7',
        section: 'A',
        studentGradeKey: '7A',
        description: 'Curso base para pruebas del panel docente y consulta de acudientes.',
        colorToken: '#1d4e89',
        classSessions: [
          { weekday: 1, startTime: '07:00', endTime: '08:00', label: 'Conceptos' },
          { weekday: 3, startTime: '09:00', endTime: '10:00', label: 'Taller' },
        ],
        academicPeriods,
        gradingComponents: academicPeriods[0].gradingComponents,
        status: 'active',
      },
      {
        schoolId: SCHOOL_ID,
        teacherUserId: String(teacherUser._id),
        assignedByUserId: String(coordinationUser._id),
        title: 'Fisica 9A',
        subject: 'Fisica',
        gradeLevel: '9',
        section: 'A',
        studentGradeKey: '9A',
        description: 'Curso con notas y publicaciones para validar la experiencia Campus.',
        colorToken: '#0f766e',
        classSessions: [
          { weekday: 2, startTime: '08:00', endTime: '09:00', label: 'Teoria' },
          { weekday: 4, startTime: '10:00', endTime: '11:00', label: 'Laboratorio' },
        ],
        academicPeriods,
        gradingComponents: academicPeriods[0].gradingComponents,
        status: 'active',
      },
    ]);

    const studentByGrade = new Map(students.map((student) => [student.grade, student]));
    const gradeEntries = [];
    const posts = [];

    courses.forEach((course) => {
      const student = studentByGrade.get(course.studentGradeKey);
      if (!student) {
        return;
      }

      academicPeriods.forEach((period) => {
        period.gradingComponents.forEach((component) => {
          gradeEntries.push({
            schoolId: SCHOOL_ID,
            courseId: course._id,
            teacherUserId: String(teacherUser._id),
            studentId: student._id,
            academicPeriodKey: period.key,
            componentKey: component.key,
            score: buildScore(`${course.title}:${student.schoolCode}:${component.key}`),
            feedback: `${component.name} registrada para ${student.name}.`,
            gradedAt: new Date('2026-04-10T14:00:00.000Z'),
          });
        });
      });

      posts.push(
        {
          schoolId: SCHOOL_ID,
          teacherUserId: String(teacherUser._id),
          courseId: course._id,
          type: 'Tarea',
          title: `Tarea inicial ${course.title}`,
          body: `Actividad publicada para validar entregas y seguimiento en ${course.title}.`,
          deliveryMode: 'date',
          dueAt: new Date('2026-04-25T23:59:00.000Z'),
          status: 'published',
          publishedAt: new Date('2026-04-18T08:00:00.000Z'),
        },
        {
          schoolId: SCHOOL_ID,
          teacherUserId: String(teacherUser._id),
          courseId: course._id,
          type: 'Material',
          title: `Guia de apoyo ${course.title}`,
          body: `Material corto para probar publicaciones del docente en ${course.title}.`,
          deliveryMode: 'class',
          scheduledClassDate: new Date('2026-04-22T12:00:00.000Z'),
          scheduledClassSession: course.classSessions[0],
          status: 'published',
          publishedAt: new Date('2026-04-18T09:00:00.000Z'),
        }
      );
    });

    if (gradeEntries.length > 0) {
      await CampusGradeEntry.insertMany(gradeEntries, { ordered: true });
    }

    if (posts.length > 0) {
      await CampusPost.insertMany(posts, { ordered: true });
    }

    console.log('Millennium School seed completed successfully.');
    console.log(`School: ${SCHOOL_ID}`);
    console.log(`Parent username: ${PARENT_USERNAME}`);
    console.log(`Teacher username: ${TEACHER_USERNAME}`);
    console.log(`Coordination username: ${COORDINATION_USERNAME}`);
    console.log(`Default password: ${DEFAULT_PASSWORD}`);
    console.log(`Students created: ${students.length}`);
    console.log(`Courses created: ${courses.length}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Millennium School seed failed:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

run();