require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

const {
  connectDB,
  mongoose,
  runWithSchoolContext,
} = require('../config/db');
require('../models');

const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');
const CampusMembership = require('../models/campusMembership.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const StudentBillingProfile = require('../models/studentBillingProfile.model');
const User = require('../models/user.model');

const DEFAULT_SCHOOL_ID = 'Millennium School';
const DEFAULT_FILE_PATH = '/Users/usuario/Downloads/plantilla-migracion-base-datos-2026-06-18.xlsx';
const DEFAULT_PARENT_PASSWORD = '123456789';
const DEFAULT_ACADEMIC_MONTHLY_DUE_DAY = 10;

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const rawArg = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return rawArg ? rawArg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeHeaderKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeImportedDocumentType(value) {
  const normalized = normalizeHeaderKey(value);
  if (!normalized) return '';
  if (['cc', 'cedula', 'ceduladeciudadania'].includes(normalized)) return 'CC';
  if (['ti', 'tarjetadeidentidad'].includes(normalized)) return 'TI';
  if (['ce', 'ceduladeextranjeria'].includes(normalized)) return 'CE';
  if (['pp', 'pasaporte'].includes(normalized)) return 'PP';
  if (['nit'].includes(normalized)) return 'NIT';
  return '';
}

function normalizeImportedGender(value) {
  const normalized = normalizeHeaderKey(value);
  if (!normalized) return '';
  if (['female', 'femenino', 'mujer', 'f'].includes(normalized)) return 'female';
  if (['male', 'masculino', 'hombre', 'm'].includes(normalized)) return 'male';
  if (['other', 'otro', 'otra', 'o'].includes(normalized)) return 'other';
  return '';
}

function parseDateCell(value) {
  if (value == null || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(`${normalized}T00:00:00.000Z`);
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split('/').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const COLUMN_ALIASES = {
  grade: ['grado'],
  lastName: ['apellidos', 'apellido'],
  firstName: ['nombres', 'nombre'],
  gender: ['genero', 'sexo'],
  studentDocumentType: ['tipodocalumno', 'tipodocumentoalumno', 'tipodocalumna', 'tipodocumento'],
  studentDocumentNumber: ['numerodocalumno', 'numerodocumentoalumno', 'numerodocumento'],
  birthDate: ['fechanacimiento', 'fechadenacimiento'],
  bloodType: ['tiposangre'],
  birthPlace: ['lugarnacimiento'],
  address: ['direccion'],
  motherName: ['nombremadre', 'madre'],
  motherDocumentType: ['tipodocmadre', 'tipodocumentomadre'],
  motherDocumentNumber: ['numerodocmadre', 'numerodocumentomadre'],
  motherPhone: ['telefonomadre', 'celularmadre'],
  motherEmail: ['correomadre', 'emailmadre'],
  fatherName: ['nombrepadre', 'padre'],
  fatherDocumentType: ['tipodocpadre', 'tipodocumentopadre'],
  fatherDocumentNumber: ['numerodocpadre', 'numerodocumentopadre'],
  fatherPhone: ['telefonopadre', 'celularpadre'],
  fatherEmail: ['correopadre', 'emailpadre'],
};

function resolveColumnIndexes(headerRow = []) {
  const normalizedHeaders = headerRow.map((cell) => normalizeHeaderKey(cell));
  const indexes = {};

  Object.entries(COLUMN_ALIASES).forEach(([fieldName, aliases]) => {
    const columnIndex = normalizedHeaders.findIndex((header) => aliases.includes(header));
    if (columnIndex >= 0) {
      indexes[fieldName] = columnIndex;
    }
  });

  return indexes;
}

function findHeaderRow(matrix = []) {
  let bestRowIndex = -1;
  let bestScore = 0;

  for (let index = 0; index < Math.min(matrix.length, 10); index += 1) {
    const row = Array.isArray(matrix[index]) ? matrix[index] : [];
    const indexes = resolveColumnIndexes(row);
    const score = Object.keys(indexes).length;
    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = index;
    }
  }

  if (bestRowIndex < 0 || bestScore < 5) {
    throw new Error('No se pudo identificar la fila de encabezados de la plantilla.');
  }

  return bestRowIndex;
}

function readImportRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) {
    throw new Error('El archivo no tiene hojas para procesar.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  const headerRowIndex = findHeaderRow(matrix);
  const headerRow = matrix[headerRowIndex] || [];
  const columnIndexes = resolveColumnIndexes(headerRow);

  if (typeof columnIndexes.grade !== 'number' || typeof columnIndexes.lastName !== 'number' || typeof columnIndexes.firstName !== 'number') {
    throw new Error('La plantilla debe incluir al menos Grado, Apellidos y Nombres.');
  }

  const rows = [];
  for (let index = headerRowIndex + 1; index < matrix.length; index += 1) {
    const row = Array.isArray(matrix[index]) ? matrix[index] : [];
    const readValue = (fieldName) => {
      const columnIndex = columnIndexes[fieldName];
      return typeof columnIndex === 'number' ? row[columnIndex] : '';
    };

    const parsedRow = {
      rowNumber: index + 1,
      grade: normalizeText(readValue('grade')),
      lastName: normalizeText(readValue('lastName')),
      firstName: normalizeText(readValue('firstName')),
      gender: normalizeImportedGender(readValue('gender')),
      documentType: normalizeImportedDocumentType(readValue('studentDocumentType')),
      documentNumber: normalizeText(readValue('studentDocumentNumber')),
      birthDate: parseDateCell(readValue('birthDate')),
      bloodType: normalizeText(readValue('bloodType')),
      birthPlace: normalizeText(readValue('birthPlace')),
      address: normalizeText(readValue('address')),
      mother: {
        name: normalizeText(readValue('motherName')),
        documentType: normalizeImportedDocumentType(readValue('motherDocumentType')),
        documentNumber: normalizeText(readValue('motherDocumentNumber')),
        phone: normalizeText(readValue('motherPhone')),
        email: normalizeEmail(readValue('motherEmail')),
        address: normalizeText(readValue('address')),
      },
      father: {
        name: normalizeText(readValue('fatherName')),
        documentType: normalizeImportedDocumentType(readValue('fatherDocumentType')),
        documentNumber: normalizeText(readValue('fatherDocumentNumber')),
        phone: normalizeText(readValue('fatherPhone')),
        email: normalizeEmail(readValue('fatherEmail')),
        address: normalizeText(readValue('address')),
      },
    };

    const hasValues = [
      parsedRow.grade,
      parsedRow.lastName,
      parsedRow.firstName,
      parsedRow.documentNumber,
      parsedRow.mother.name,
      parsedRow.father.name,
    ].some(Boolean);

    if (hasValues) {
      rows.push(parsedRow);
    }
  }

  return rows;
}

function buildParentImportCacheKey(parentData, relationship) {
  const email = normalizeEmail(parentData?.email);
  const documentNumber = normalizeText(parentData?.documentNumber);
  const phone = normalizeText(parentData?.phone);
  const name = normalizeText(parentData?.name).toLowerCase();

  if (email) return `${relationship}:email:${email}`;
  if (documentNumber) return `${relationship}:document:${documentNumber}`;
  if (name && phone) return `${relationship}:name-phone:${name}:${phone}`;
  if (name) return `${relationship}:name:${name}`;
  return '';
}

function normalizeStudentIdentity(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function findExistingStudent({ schoolId, studentData }) {
  const documentNumber = normalizeText(studentData?.documentNumber);
  if (documentNumber) {
    const byDocument = await Student.findOne({ schoolId, documentNumber, deletedAt: null });
    if (byDocument) {
      return { student: byDocument, ambiguous: false };
    }
  }

  const studentName = normalizeStudentIdentity(`${studentData?.firstName || ''} ${studentData?.lastName || ''}`);
  if (!studentName) {
    return { student: null, ambiguous: false };
  }

  const query = {
    schoolId,
    deletedAt: null,
    name: new RegExp(`^${escapeRegex(normalizeText(`${studentData?.firstName || ''} ${studentData?.lastName || ''}`))}$`, 'i'),
  };

  if (studentData?.birthDate instanceof Date && !Number.isNaN(studentData.birthDate.getTime())) {
    const start = new Date(studentData.birthDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    query.birthDate = { $gte: start, $lt: end };
  } else if (normalizeText(studentData?.grade)) {
    query.grade = normalizeText(studentData.grade);
  }

  const matches = await Student.find(query).limit(2);
  if (matches.length > 1) {
    return { student: null, ambiguous: true };
  }

  return { student: matches[0] || null, ambiguous: false };
}

function buildBaseUsername(parent) {
  const documentNumber = normalizeText(parent?.documentNumber).replace(/\s+/g, '');
  if (documentNumber) {
    return documentNumber.toLowerCase();
  }

  const email = normalizeEmail(parent?.email);
  if (email) {
    return email.split('@')[0];
  }

  return normalizeText(parent?.name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24);
}

async function ensureUniqueUsername(baseUsername) {
  const normalizedBase = normalizeText(baseUsername).toLowerCase() || `user.${crypto.randomBytes(2).toString('hex')}`;
  let candidate = normalizedBase;
  let attempt = 1;

  while (await User.findOne({ username: candidate }).select('_id').lean()) {
    candidate = `${normalizedBase}.${attempt}`.slice(0, 32);
    attempt += 1;
  }

  return candidate;
}

async function upsertParentAccount({ schoolId, parentData, relationship, passwordHash }) {
  const name = normalizeText(parentData?.name);
  const email = normalizeEmail(parentData?.email);
  const documentNumber = normalizeText(parentData?.documentNumber);
  const phone = normalizeText(parentData?.phone);

  if (!name && !email && !documentNumber) {
    return null;
  }

  let user = null;
  if (email) {
    user = await User.findOne({ schoolId, email, role: 'parent' });
  }
  if (!user && documentNumber) {
    user = await User.findOne({ schoolId, documentNumber, role: 'parent' });
  }
  if (!user && name && phone) {
    user = await User.findOne({
      schoolId,
      role: 'parent',
      phone,
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    });
  }

  const payload = {
    schoolId,
    name: name || relationship,
    email,
    phone,
    address: normalizeText(parentData?.address),
    documentType: normalizeText(parentData?.documentType),
    documentNumber,
    role: 'parent',
    status: 'active',
    deletedAt: null,
    passwordHash,
  };

  if (user) {
    Object.assign(user, payload);
    await user.save();
    return { user, created: false };
  }

  const username = await ensureUniqueUsername(buildBaseUsername(parentData));
  user = await User.create({
    ...payload,
    username,
  });

  return { user, created: true };
}

async function upsertParentMembership({ schoolId, parentId }) {
  await CampusMembership.updateOne(
    { schoolId, userId: parentId, memberType: 'campus_parent' },
    {
      $set: {
        status: 'active',
        permissions: [],
        metadata: {
          title: 'Campus Familias',
          launchPath: '/campus/parent',
          notes: 'Importacion base de datos Millennium School.',
        },
      },
    },
    { upsert: true }
  );
}

async function ensureFeeConfiguration(schoolId, grades = []) {
  let configuration = await AcademicFeeConfiguration.findOne({ schoolId });
  const academicYear = String(new Date().getFullYear());

  if (!configuration) {
    configuration = await AcademicFeeConfiguration.create({
      schoolId,
      academicYear,
      schoolYearStartDate: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)),
      schoolYearEndDate: new Date(Date.UTC(new Date().getUTCFullYear(), 11, 31)),
      lateEnrollmentSurchargeType: 'none',
      lateEnrollmentSurchargeValue: 0,
      benefitRules: [],
      enrollmentBenefitRules: [],
      gradeSettings: grades.map((grade) => ({
        grade,
        enrollmentFee: 0,
        monthlyTuition: 0,
        enrollmentBonus: 0,
        dueDay: DEFAULT_ACADEMIC_MONTHLY_DUE_DAY,
        benefitRules: [],
      })),
    });
  }

  const knownGrades = new Set((configuration.gradeSettings || []).map((item) => normalizeText(item.grade)).filter(Boolean));
  const missingGrades = grades.map(normalizeText).filter((grade) => grade && !knownGrades.has(grade));
  if (missingGrades.length > 0) {
    configuration.gradeSettings = [
      ...(configuration.gradeSettings || []).map((item) => (item.toObject ? item.toObject() : item)),
      ...missingGrades.map((grade) => ({
        grade,
        enrollmentFee: 0,
        monthlyTuition: 0,
        enrollmentBonus: 0,
        dueDay: DEFAULT_ACADEMIC_MONTHLY_DUE_DAY,
        benefitRules: [],
      })),
    ];
    await configuration.save();
  }

  return configuration;
}

function findGradeFeeSetting(configuration, grade) {
  const normalizedGrade = normalizeText(grade).toLowerCase();
  return (configuration?.gradeSettings || []).find((item) => normalizeText(item.grade).toLowerCase() === normalizedGrade) || null;
}

async function importRows({ rows, schoolId, parentPassword, dryRun = false }) {
  const distinctGrades = Array.from(new Set(rows.map((row) => normalizeText(row.grade)).filter(Boolean)));
  const existingSnapshot = {
    students: await Student.countDocuments({ schoolId, deletedAt: null }),
    parents: await User.countDocuments({ schoolId, role: 'parent', deletedAt: null }),
    links: await ParentStudentLink.countDocuments({ schoolId, status: 'active' }),
  };

  const summary = {
    schoolId,
    totalRows: rows.length,
    processedRows: 0,
    createdStudents: 0,
    updatedStudents: 0,
    createdParents: 0,
    updatedParents: 0,
    createdBillingProfiles: 0,
    updatedBillingProfiles: 0,
    createdLinks: 0,
    ensuredParentMemberships: 0,
    skippedRows: 0,
    errors: 0,
    dryRun,
    before: existingSnapshot,
  };
  const rowErrors = [];

  if (dryRun) {
    const parentKeys = new Set();
    for (const row of rows) {
      if (!row.grade || !row.firstName || !row.lastName) {
        summary.skippedRows += 1;
        continue;
      }
      summary.processedRows += 1;
      [row.mother, row.father].forEach((parent, index) => {
        const key = buildParentImportCacheKey(parent, index === 0 ? 'mother' : 'father');
        if (key) parentKeys.add(key);
      });
    }
    return {
      summary: {
        ...summary,
        distinctGrades,
        candidateParents: parentKeys.size,
      },
      rowErrors,
    };
  }

  const feeConfiguration = await ensureFeeConfiguration(schoolId, distinctGrades);
  const passwordHash = await bcrypt.hash(parentPassword, 10);
  const parentCache = new Map();
  const createdParentIds = new Set();
  const updatedParentIds = new Set();
  const membershipParentIds = new Set();

  for (const row of rows) {
    try {
      if (!row.grade || !row.firstName || !row.lastName) {
        summary.skippedRows += 1;
        if (rowErrors.length < 30) {
          rowErrors.push({ row: row.rowNumber, message: 'La fila no tiene Grado, Nombres y Apellidos completos.' });
        }
        continue;
      }

      const linkedParents = [];
      for (const parentEntry of [
        { data: row.mother, relationship: 'mother' },
        { data: row.father, relationship: 'father' },
      ]) {
        const cacheKey = buildParentImportCacheKey(parentEntry.data, parentEntry.relationship);
        let parentResult = cacheKey ? parentCache.get(cacheKey) || null : null;

        if (!parentResult) {
          parentResult = await upsertParentAccount({
            schoolId,
            parentData: parentEntry.data,
            relationship: parentEntry.relationship,
            passwordHash,
          });
          if (parentResult && cacheKey) {
            parentCache.set(cacheKey, parentResult);
          }
        }

        if (parentResult) {
          linkedParents.push({ ...parentResult, relationship: parentEntry.relationship });
          membershipParentIds.add(String(parentResult.user._id));
          if (parentResult.created) {
            createdParentIds.add(String(parentResult.user._id));
          } else {
            updatedParentIds.add(String(parentResult.user._id));
          }
        }
      }

      const existingStudentResult = await findExistingStudent({
        schoolId,
        studentData: {
          firstName: row.firstName,
          lastName: row.lastName,
          documentNumber: row.documentNumber,
          grade: row.grade,
          birthDate: row.birthDate,
        },
      });

      if (existingStudentResult.ambiguous) {
        summary.skippedRows += 1;
        if (rowErrors.length < 30) {
          rowErrors.push({ row: row.rowNumber, message: 'Coincidencias duplicadas: no se pudo decidir si el alumno ya existe.' });
        }
        continue;
      }

      const studentName = normalizeText(`${row.firstName} ${row.lastName}`);
      const studentData = {
        schoolId,
        name: studentName,
        firstName: row.firstName,
        lastName: row.lastName,
        grade: row.grade,
        gender: row.gender,
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        birthDate: row.birthDate,
        bloodType: row.bloodType,
        birthPlace: row.birthPlace,
        address: row.address,
        status: 'active',
        deletedAt: null,
      };

      let student = existingStudentResult.student;
      if (student) {
        Object.assign(student, studentData);
        await student.save();
        summary.updatedStudents += 1;
      } else {
        student = await Student.create({
          ...studentData,
          course: '',
          schoolCode: '',
        });
        summary.createdStudents += 1;
      }

      const gradeFeeSetting = findGradeFeeSetting(feeConfiguration, row.grade);
      const existingBillingProfile = await StudentBillingProfile.findOne({ schoolId, studentId: student._id });
      const billingProfilePayload = {
        schoolId,
        studentId: student._id,
        grade: row.grade,
        academicYear: normalizeText(feeConfiguration?.academicYear) || String(new Date().getFullYear()),
        enrollmentBonusAmount: Number(gradeFeeSetting?.enrollmentBonus || 0),
        annualTuitionAmount: Number(gradeFeeSetting?.enrollmentFee || 0),
        monthlyTuitionAmount: Number(gradeFeeSetting?.monthlyTuition || 0),
        dueDay: DEFAULT_ACADEMIC_MONTHLY_DUE_DAY,
        benefitRules: Array.isArray(gradeFeeSetting?.benefitRules) ? gradeFeeSetting.benefitRules : [],
        active: true,
      };

      if (existingBillingProfile) {
        Object.assign(existingBillingProfile, billingProfilePayload);
        await existingBillingProfile.save();
        summary.updatedBillingProfiles += 1;
      } else {
        await StudentBillingProfile.create(billingProfilePayload);
        summary.createdBillingProfiles += 1;
      }

      for (const parentRecord of linkedParents) {
        const existingLink = await ParentStudentLink.findOne({
          schoolId,
          parentId: parentRecord.user._id,
          studentId: student._id,
        }).select('_id');

        if (!existingLink) {
          summary.createdLinks += 1;
        }

        await ParentStudentLink.findOneAndUpdate(
          { schoolId, parentId: parentRecord.user._id, studentId: student._id },
          {
            schoolId,
            parentId: parentRecord.user._id,
            studentId: student._id,
            relationship: parentRecord.relationship,
            isPrimaryContact: parentRecord.relationship === 'mother',
            status: 'active',
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }

      summary.processedRows += 1;
    } catch (rowError) {
      summary.errors += 1;
      if (rowErrors.length < 30) {
        rowErrors.push({ row: row.rowNumber, message: rowError.message || 'No se pudo importar la fila.' });
      }
    }
  }

  for (const parentId of membershipParentIds) {
    await upsertParentMembership({ schoolId, parentId });
    summary.ensuredParentMemberships += 1;
  }

  summary.createdParents = createdParentIds.size;
  summary.updatedParents = Array.from(updatedParentIds).filter((parentId) => !createdParentIds.has(parentId)).length;
  summary.after = {
    students: await Student.countDocuments({ schoolId, deletedAt: null }),
    parents: await User.countDocuments({ schoolId, role: 'parent', deletedAt: null }),
    links: await ParentStudentLink.countDocuments({ schoolId, status: 'active' }),
    memberships: await CampusMembership.countDocuments({ schoolId, memberType: 'campus_parent', status: 'active' }),
  };

  return { summary, rowErrors };
}

async function run() {
  const filePath = path.resolve(getArg('file', DEFAULT_FILE_PATH));
  const schoolId = getArg('schoolId', DEFAULT_SCHOOL_ID);
  const parentPassword = getArg('password', DEFAULT_PARENT_PASSWORD);
  const dryRun = hasFlag('dry-run');

  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo: ${filePath}`);
  }

  const rows = readImportRows(filePath);
  await connectDB();

  const result = await runWithSchoolContext(schoolId, () => importRows({
    rows,
    schoolId,
    parentPassword,
    dryRun,
  }));

  console.log(JSON.stringify(result, null, 2));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
