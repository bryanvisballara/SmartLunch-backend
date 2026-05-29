require('dotenv').config();

const { connectDB, listTenantSchoolContexts, runWithSchoolContext, mongoose } = require('../config/db');
require('../models/student.model');
require('../models/parentStudentLink.model');
require('../models/studentBillingProfile.model');
require('../models/academicCharge.model');

const Student = require('../models/student.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const StudentBillingProfile = require('../models/studentBillingProfile.model');
const AcademicCharge = require('../models/academicCharge.model');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeIdentity(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeDateKey(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function getArgValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
}

function isApplyMode() {
  return process.argv.includes('--apply');
}

function buildStudentKey(student) {
  const name = normalizeIdentity(`${student.firstName || ''} ${student.lastName || ''}`) || normalizeIdentity(student.name);
  const grade = normalizeIdentity(student.grade);
  const documentNumber = normalizeText(student.documentNumber);
  const birthDate = normalizeDateKey(student.birthDate);
  return [documentNumber ? `doc:${documentNumber}` : `name:${name}`, `grade:${grade}`, birthDate ? `birth:${birthDate}` : 'birth:'].join('|');
}

async function getParentIdsByStudentId(studentIds) {
  const links = await ParentStudentLink.find({ studentId: { $in: studentIds }, status: 'active' }).select('studentId parentId').lean();
  const result = new Map();

  links.forEach((link) => {
    const studentId = String(link.studentId);
    if (!result.has(studentId)) {
      result.set(studentId, new Set());
    }
    result.get(studentId).add(String(link.parentId));
  });

  return result;
}

function hasSharedParent(studentIds, parentsByStudentId) {
  const seen = new Set();
  for (const studentId of studentIds) {
    const parentIds = parentsByStudentId.get(String(studentId)) || new Set();
    for (const parentId of parentIds) {
      if (seen.has(parentId)) {
        return true;
      }
      seen.add(parentId);
    }
  }
  return false;
}

async function scoreStudent(student) {
  const [linkCount, billingCount, activeChargeCount] = await Promise.all([
    ParentStudentLink.countDocuments({ studentId: student._id, status: 'active' }),
    StudentBillingProfile.countDocuments({ studentId: student._id, active: true }),
    AcademicCharge.countDocuments({ studentId: student._id, status: { $ne: 'cancelled' } }),
  ]);

  return (normalizeText(student.course) ? 1000 : 0)
    + (normalizeText(student.schoolCode) ? 100 : 0)
    + (normalizeText(student.documentNumber) ? 100 : 0)
    + (linkCount * 10)
    + (billingCount * 5)
    + activeChargeCount;
}

async function pickKeeper(students) {
  const scored = [];
  for (const student of students) {
    scored.push({ student, score: await scoreStudent(student) });
  }

  return scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return new Date(left.student.createdAt || 0).getTime() - new Date(right.student.createdAt || 0).getTime();
  })[0].student;
}

async function mergeDuplicateGroup({ schoolId, students, apply }) {
  const keeper = await pickKeeper(students);
  const duplicates = students.filter((student) => String(student._id) !== String(keeper._id));
  const keeperActiveEnrollmentCharges = await AcademicCharge.countDocuments({
    schoolId,
    studentId: keeper._id,
    audienceType: 'enrollment',
    status: { $ne: 'cancelled' },
  });

  const report = {
    keeper: { id: String(keeper._id), name: keeper.name, grade: keeper.grade, course: keeper.course || '' },
    duplicates: duplicates.map((student) => ({ id: String(student._id), name: student.name, grade: student.grade, course: student.course || '' })),
    actions: [],
  };

  if (!apply) {
    return report;
  }

  for (const duplicate of duplicates) {
    const duplicateLinks = await ParentStudentLink.find({ schoolId, studentId: duplicate._id });
    for (const link of duplicateLinks) {
      const existingKeeperLink = await ParentStudentLink.findOne({ schoolId, parentId: link.parentId, studentId: keeper._id });
      if (existingKeeperLink) {
        await link.deleteOne();
        report.actions.push(`deleted duplicate parent link ${link._id}`);
      } else {
        link.studentId = keeper._id;
        await link.save();
        report.actions.push(`moved parent link ${link._id}`);
      }
    }

    const duplicateProfile = await StudentBillingProfile.findOne({ schoolId, studentId: duplicate._id });
    if (duplicateProfile) {
      const keeperProfile = await StudentBillingProfile.findOne({ schoolId, studentId: keeper._id });
      if (keeperProfile) {
        duplicateProfile.active = false;
        await duplicateProfile.save();
        report.actions.push(`deactivated duplicate billing profile ${duplicateProfile._id}`);
      } else {
        duplicateProfile.studentId = keeper._id;
        await duplicateProfile.save();
        report.actions.push(`moved billing profile ${duplicateProfile._id}`);
      }
    }

    if (keeperActiveEnrollmentCharges > 0) {
      const updateResult = await AcademicCharge.updateMany(
        { schoolId, studentId: duplicate._id, audienceType: 'enrollment', status: { $ne: 'cancelled' } },
        { $set: { status: 'cancelled', description: 'Cancelado por reparación de matrícula duplicada.' } }
      );
      if (updateResult.modifiedCount) {
        report.actions.push(`cancelled ${updateResult.modifiedCount} duplicate enrollment charge(s)`);
      }
    } else {
      const updateResult = await AcademicCharge.updateMany({ schoolId, studentId: duplicate._id }, { $set: { studentId: keeper._id } });
      if (updateResult.modifiedCount) {
        report.actions.push(`moved ${updateResult.modifiedCount} charge(s)`);
      }
    }

    await Student.updateOne({ _id: duplicate._id, schoolId }, {
      $set: {
        status: 'inactive',
        deletedAt: new Date(),
        name: `${duplicate.name} (duplicado fusionado)`,
      },
    });
    report.actions.push(`soft-deleted duplicate student ${duplicate._id}`);
  }

  return report;
}

async function repairSchool({ schoolId, apply, nameFilter }) {
  return runWithSchoolContext(schoolId, async () => {
    const query = { schoolId, deletedAt: null };
    if (nameFilter) {
      query.name = new RegExp(nameFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    const students = await Student.find(query).sort({ createdAt: 1 }).lean();
    const groups = new Map();
    students.forEach((student) => {
      const key = buildStudentKey(student);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(student);
    });

    const reports = [];
    for (const groupStudents of groups.values()) {
      if (groupStudents.length < 2) continue;
      const parentsByStudentId = await getParentIdsByStudentId(groupStudents.map((student) => student._id));
      if (!hasSharedParent(groupStudents.map((student) => student._id), parentsByStudentId)) continue;
      reports.push(await mergeDuplicateGroup({ schoolId, students: groupStudents, apply }));
    }

    return reports;
  });
}

async function main() {
  const apply = isApplyMode();
  const requestedSchoolId = getArgValue('schoolId');
  const nameFilter = getArgValue('name');

  await connectDB();

  const contexts = requestedSchoolId
    ? [{ schoolId: requestedSchoolId }]
    : await listTenantSchoolContexts();

  const allReports = [];
  for (const context of contexts) {
    const reports = await repairSchool({ schoolId: context.schoolId, apply, nameFilter });
    if (reports.length) {
      allReports.push({ schoolId: context.schoolId, reports });
    }
  }

  console.log(JSON.stringify({ apply, matchedSchools: allReports.length, results: allReports }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
