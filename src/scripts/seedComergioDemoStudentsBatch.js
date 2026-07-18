require('dotenv').config();

const bcrypt = require('bcryptjs');
const { connectDB, runWithSchoolContext } = require('../config/db');
const User = require('../models/user.model');
const Student = require('../models/student.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const CampusMembership = require('../models/campusMembership.model');
const Wallet = require('../models/wallet.model');
const { upsertStudentAccount } = require('../utils/studentAccount');

const SCHOOL_ID = String(process.env.SEED_DEMO_SCHOOL_ID || 'comergio_demo_kns8p').trim();
const SHARED_PASSWORD = '123456789';
const GENERIC_ADDRESS = 'Calle 10 #20-30, Bogotá D.C.';
const BATCH_TAG = 'demo-batch-50';
const TOTAL = 50;

const FIRST_NAMES = [
  'Ana', 'Luis', 'Maria', 'Carlos', 'Laura', 'Pedro', 'Sofia', 'Diego', 'Camila', 'Andres',
  'Valentina', 'Juan', 'Isabella', 'Mateo', 'Lucia', 'Samuel', 'Emma', 'Nicolas', 'Martina', 'David',
  'Paula', 'Santiago', 'Juliana', 'Daniel', 'Manuela', 'Felipe', 'Sara', 'Sebastian', 'Elena', 'Tomas',
  'Catalina', 'Miguel', 'Daniela', 'Gabriel', 'Antonella', 'Martin', 'Natalia', 'Emilio', 'Regina', 'Javier',
  'Adriana', 'Hector', 'Bianca', 'Ivan', 'Clara', 'Oscar', 'Renata', 'Bruno', 'Alicia', 'Pablo',
];

const LAST_NAMES = [
  'Garcia', 'Rodriguez', 'Martinez', 'Lopez', 'Gonzalez', 'Perez', 'Sanchez', 'Ramirez', 'Torres', 'Flores',
  'Rivera', 'Gomez', 'Diaz', 'Reyes', 'Cruz', 'Morales', 'Ortiz', 'Gutierrez', 'Chavez', 'Ramos',
  'Vargas', 'Castillo', 'Jimenez', 'Moreno', 'Herrera', 'Medina', 'Aguilar', 'Vargas', 'Romero', 'Navarro',
  'Molina', 'Silva', 'Rojas', 'Soto', 'Vega', 'Mendoza', 'Guerrero', 'Pena', 'Rios', 'Campos',
  'Leon', 'Vargas', 'Castro', 'Ruiz', 'Alvarez', 'Mendez', 'Vargas', 'Delgado', 'Nunez', 'Ibarra',
];

const PARENT_FIRST_MALE = [
  'Jose', 'Carlos', 'Luis', 'Miguel', 'Andres', 'Jorge', 'Fernando', 'Ricardo', 'Eduardo', 'Roberto',
  'Francisco', 'Manuel', 'Alberto', 'Raul', 'Victor', 'Hector', 'Sergio', 'Oscar', 'Pablo', 'Diego',
  'Julian', 'Mario', 'Enrique', 'Gustavo', 'Rafael',
];

const PARENT_FIRST_FEMALE = [
  'Maria', 'Ana', 'Carmen', 'Lucia', 'Patricia', 'Sandra', 'Gloria', 'Claudia', 'Monica', 'Diana',
  'Adriana', 'Martha', 'Rosa', 'Elena', 'Paula', 'Andrea', 'Natalia', 'Liliana', 'Beatriz', 'Yolanda',
  'Teresa', 'Silvia', 'Pilar', 'Angela', 'Veronica',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function buildFamily(index) {
  const n = index + 1;
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
  const last1 = LAST_NAMES[index % LAST_NAMES.length];
  const last2 = LAST_NAMES[(index * 3 + 7) % LAST_NAMES.length];
  const studentName = `${firstName} ${last1} ${last2}`;
  const fatherFirst = PARENT_FIRST_MALE[index % PARENT_FIRST_MALE.length];
  const motherFirst = PARENT_FIRST_FEMALE[index % PARENT_FIRST_FEMALE.length];
  const grade = index < 25 ? '1' : 'kinder_3';

  return {
    index: n,
    grade,
    student: {
      name: studentName,
      firstName,
      lastName: `${last1} ${last2}`,
      documentType: 'TI',
      documentNumber: String(1099000100 + n),
      schoolCode: `DEMO-${pad(n)}`,
      usernameHint: `alumno.demo${pad(n)}`,
      email: `alumno.demo${pad(n)}@comergio.demo`,
    },
    father: {
      name: `${fatherFirst} ${last1} ${last2}`,
      username: `papa.demo${pad(n)}`,
      email: `papa.demo${pad(n)}@comergio.demo`,
      documentType: 'CC',
      documentNumber: String(1098000100 + n),
    },
    mother: {
      name: `${motherFirst} ${last1} ${last2}`,
      username: `mama.demo${pad(n)}`,
      email: `mama.demo${pad(n)}@comergio.demo`,
      documentType: 'CC',
      documentNumber: String(1097000100 + n),
    },
  };
}

async function upsertParentUser({ fixture, passwordHash }) {
  const existing = await User.findOne({ username: fixture.username });
  const payload = {
    schoolId: SCHOOL_ID,
    name: fixture.name,
    username: fixture.username,
    email: fixture.email,
    phone: '3000000000',
    address: GENERIC_ADDRESS,
    documentType: fixture.documentType,
    documentNumber: fixture.documentNumber,
    role: 'parent',
    status: 'active',
    deletedAt: null,
    passwordHash,
  };

  let user;
  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    user = existing;
  } else {
    user = await User.create(payload);
  }

  await CampusMembership.findOneAndUpdate(
    { schoolId: SCHOOL_ID, userId: user._id, memberType: 'campus_parent' },
    {
      schoolId: SCHOOL_ID,
      userId: user._id,
      memberType: 'campus_parent',
      status: 'active',
      permissions: [],
      metadata: {
        title: 'Campus Familias',
        launchPath: '/campus/parent',
        notes: BATCH_TAG,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return user;
}

async function upsertStudentRecord(family) {
  const existing = await Student.findOne({
    schoolId: SCHOOL_ID,
    schoolCode: family.student.schoolCode,
    deletedAt: null,
  });

  const payload = {
    schoolId: SCHOOL_ID,
    name: family.student.name,
    firstName: family.student.firstName,
    lastName: family.student.lastName,
    schoolCode: family.student.schoolCode,
    grade: family.grade,
    course: '',
    gender: '',
    documentType: family.student.documentType,
    documentNumber: family.student.documentNumber,
    address: GENERIC_ADDRESS,
    status: 'active',
    deletedAt: null,
  };

  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    return existing;
  }

  return Student.create(payload);
}

async function ensureWallet(studentId) {
  await Wallet.findOneAndUpdate(
    { schoolId: SCHOOL_ID, studentId },
    {
      $setOnInsert: {
        schoolId: SCHOOL_ID,
        studentId,
        balance: 0,
        status: 'active',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function linkParent(parentId, studentId, relationship, isPrimaryContact) {
  await ParentStudentLink.findOneAndUpdate(
    { schoolId: SCHOOL_ID, parentId, studentId },
    {
      schoolId: SCHOOL_ID,
      parentId,
      studentId,
      relationship,
      isPrimaryContact,
      status: 'active',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function forceSharedPassword(userId, passwordHash) {
  await User.updateOne(
    { _id: userId, schoolId: SCHOOL_ID },
    { $set: { passwordHash, status: 'active', deletedAt: null } }
  );
}

async function main() {
  await connectDB();
  console.log(`Seeding ${TOTAL} students + parents into ${SCHOOL_ID}`);
  console.log(`Shared password: ${SHARED_PASSWORD}`);

  const summary = await runWithSchoolContext(SCHOOL_ID, async () => {
    const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);
    const result = {
      createdStudents: 0,
      updatedStudents: 0,
      parents: 0,
      grade1: 0,
      kinder3: 0,
      samples: [],
    };

    for (let i = 0; i < TOTAL; i += 1) {
      const family = buildFamily(i);
      const before = await Student.findOne({
        schoolId: SCHOOL_ID,
        schoolCode: family.student.schoolCode,
        deletedAt: null,
      }).select('_id').lean();

      const student = await upsertStudentRecord(family);
      await ensureWallet(student._id);

      const father = await upsertParentUser({ fixture: family.father, passwordHash });
      const mother = await upsertParentUser({ fixture: family.mother, passwordHash });
      result.parents += before ? 0 : 2;

      await linkParent(father._id, student._id, 'padre', true);
      await linkParent(mother._id, student._id, 'madre', false);

      const account = await upsertStudentAccount({ schoolId: SCHOOL_ID, student });
      if (account?.user?._id) {
        await forceSharedPassword(account.user._id, passwordHash);
        // Keep a predictable demo email while preserving generated username uniqueness.
        await User.updateOne(
          { _id: account.user._id },
          {
            $set: {
              email: family.student.email,
              address: GENERIC_ADDRESS,
              phone: '3000000000',
            },
          }
        );
      }

      if (before) {
        result.updatedStudents += 1;
      } else {
        result.createdStudents += 1;
      }
      if (family.grade === '1') result.grade1 += 1;
      else result.kinder3 += 1;

      if (i < 3 || i === 24 || i === 25 || i === 49) {
        result.samples.push({
          student: family.student.name,
          grade: family.grade,
          schoolCode: family.student.schoolCode,
          studentUsername: account?.username || '',
          father: family.father.username,
          mother: family.mother.username,
        });
      }
    }

    return result;
  });

  console.log(JSON.stringify(summary, null, 2));
  console.log('Done.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
