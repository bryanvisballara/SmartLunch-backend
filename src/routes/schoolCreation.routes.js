const express = require('express');
const bcrypt = require('bcryptjs');

const { runWithSchoolContext, slugifySchoolId } = require('../config/db');
const { signAccessToken } = require('../utils/token');
const User = require('../models/user.model');
const AcademicStructure = require('../models/academicStructure.model');
const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');
const CampusCourse = require('../models/campusCourse.model');
const CampusMembership = require('../models/campusMembership.model');
const SchoolCreationSnapshot = require('../models/schoolCreationSnapshot.model');

const router = express.Router();

const ROLE_MAP = {
  rectoria: 'rectoria',
  direccion: 'direccion',
  coordinacion: 'coordination',
  docencia: 'teacher',
  psicologia: 'psychology',
  enfermeria: 'nursing',
  secretaria: 'academic_secretary',
  cartera: 'billing',
  recursosHumanos: 'human_resources',
  rutas: 'school_route',
};

const DEFAULT_GRADES_BY_LEVEL = {
  preescolar: ['Prejardin', 'Jardin', 'Transicion'],
  primaria: ['1', '2', '3', '4', '5'],
  secundaria: ['6', '7', '8', '9'],
  media: ['10', '11'],
};

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function readMappedArray(map, candidates) {
  if (!map || typeof map !== 'object') return [];
  const exactCandidates = Array.from(new Set(candidates.map(normalizeText).filter(Boolean)));
  for (const candidate of exactCandidates) {
    if (Array.isArray(map[candidate])) return map[candidate];
  }

  const normalizedCandidates = new Set(exactCandidates.map(normalizeKey).filter(Boolean));
  const matchedEntry = Object.entries(map).find(([key, value]) => Array.isArray(value) && normalizedCandidates.has(normalizeKey(key)));
  return matchedEntry ? matchedEntry[1] : [];
}

function toNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : fallback;
}

function parseDate(value) {
  const text = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return new Date(`${text}T00:00:00.000Z`);
}

function toAuthResponse(user) {
  return {
    token: signAccessToken(user),
    user: {
      id: user._id,
      schoolId: user.schoolId,
      name: user.name,
      username: user.username,
      role: user.role,
      biometricEnabled: Boolean(user.webauthn?.credentials?.length),
      assignedStore: null,
    },
  };
}

function buildUniqueSchoolId(schoolName) {
  const baseId = slugifySchoolId(schoolName);
  const suffix = Date.now().toString(36).slice(-5);
  return `${baseId}_${suffix}`;
}

function buildSelectedLevels(payload) {
  const availableLevels = Array.isArray(payload.availableLevels) ? payload.availableLevels : [];
  const selectedIds = new Set(Array.isArray(payload.selectedLevelIds) ? payload.selectedLevelIds.map(normalizeText).filter(Boolean) : []);
  return availableLevels
    .filter((level) => selectedIds.has(normalizeText(level?.id)))
    .map((level, index) => ({
      key: normalizeKey(level?.id || level?.name) || `nivel_${index + 1}`,
      sourceId: normalizeText(level?.id),
      label: normalizeText(level?.name || level?.id) || `Nivel ${index + 1}`,
      order: (index + 1) * 10,
      status: 'active',
    }));
}

function buildGradeRows(payload, levels) {
  const gradesByLevel = payload.gradesByLevel || {};
  const coursesByGrade = payload.coursesByGrade || {};
  const singleCourseGrades = payload.singleCourseGrades || {};
  const rows = [];

  levels.forEach((level) => {
    const sourceLevelId = level.sourceId || level.key;
    const rawGrades = readMappedArray(gradesByLevel, [sourceLevelId, level.key, level.label]);
    const fallbackGrades = rawGrades.length > 0 ? rawGrades : DEFAULT_GRADES_BY_LEVEL[normalizeKey(sourceLevelId)] || DEFAULT_GRADES_BY_LEVEL[normalizeKey(level.key)] || [];
    fallbackGrades.forEach((gradeLabel, gradeIndex) => {
      const grade = normalizeText(gradeLabel);
      if (!grade) return;
      const gradeKey = `${sourceLevelId}:${grade}`;
      const configuredCourses = readMappedArray(coursesByGrade, [gradeKey, `${level.key}:${grade}`, grade]).map(normalizeText).filter(Boolean);
      const courseLabels = singleCourseGrades[gradeKey] || configuredCourses.length === 0 ? [grade] : configuredCourses;
      rows.push({
        key: gradeKey,
        label: grade,
        levelKey: level.key,
        order: rows.length * 10 + gradeIndex + 10,
        status: 'active',
        courses: courseLabels.map((courseLabel, courseIndex) => ({
          key: `${gradeKey}:${normalizeKey(courseLabel) || `curso_${courseIndex + 1}`}`,
          label: courseLabel,
          section: courseLabel,
          order: (courseIndex + 1) * 10,
          status: 'active',
        })),
      });
    });
  });

  return rows;
}

function buildSubjects(payload, gradeRows) {
  const subjectMapByGrade = payload.subjectMapByGrade || {};
  return (Array.isArray(payload.subjects) ? payload.subjects : [])
    .map(normalizeText)
    .filter(Boolean)
    .map((subject, index) => ({
      key: normalizeKey(subject) || `asignatura_${index + 1}`,
      label: subject,
      kind: 'principal',
      gradeKeys: gradeRows
        .filter((row) => readMappedArray(subjectMapByGrade, [row.key, row.label]).map(normalizeText).includes(subject))
        .map((row) => row.key),
      order: (index + 1) * 10,
      status: 'active',
    }));
}

function buildPeriods(payload) {
  return (Array.isArray(payload.periods) ? payload.periods : [])
    .map((period, index) => ({
      key: normalizeKey(period?.name) || `periodo_${index + 1}`,
      name: normalizeText(period?.name) || `Periodo ${index + 1}`,
      weight: Math.min(100, toNumber(period?.weight, 0)),
      order: (index + 1) * 10,
      startDate: parseDate(period?.startDate),
      endDate: parseDate(period?.endDate),
    }))
    .filter((period) => period.name);
}

function buildBenefitRules(payload) {
  return (Array.isArray(payload.economicBenefits) ? payload.economicBenefits : [])
    .map((benefit) => {
      const label = normalizeText(benefit?.name);
      const discountPercent = Math.min(100, toNumber(benefit?.value, 0));
      const dayLimit = Math.min(31, Math.max(1, Number.parseInt(benefit?.promptPaymentDayLimit || '10', 10) || 10));
      return {
        label,
        startDay: 1,
        endDay: dayLimit,
        discountPercent,
      };
    })
    .filter((rule) => rule.label && rule.discountPercent > 0);
}

function buildGradeSettings(payload, gradeRows, benefitRules) {
  const costsByGrade = payload.financialCostsByGrade || {};
  return gradeRows.map((row) => {
    const costs = costsByGrade[row.key] || {};
    return {
      grade: row.key,
      enrollmentFee: toNumber(costs.enrollment, 0),
      monthlyTuition: toNumber(costs.tuition, 0),
      enrollmentBonus: toNumber(costs.bond, 0),
      dueDay: 10,
      benefitRules,
    };
  });
}

function getValidMembers(payload) {
  const staffByRole = payload.staffByRole || {};
  return Object.entries(staffByRole).flatMap(([roleKey, roleData]) => {
    if (roleData?.skip) return [];
    const appRole = ROLE_MAP[roleKey];
    if (!appRole) return [];
    return (Array.isArray(roleData?.members) ? roleData.members : [])
      .map((member, index) => ({ roleKey, appRole, member, index }))
      .filter(({ member }) => normalizeText(member?.name) && normalizeEmail(member?.email) && normalizeText(member?.password));
  });
}

async function createUsers({ schoolId, payload }) {
  const validMembers = getValidMembers(payload);
  const createdUsers = new Map();

  for (const entry of validMembers) {
    const { appRole, member } = entry;
    const username = normalizeEmail(member.email);
    const existing = await User.findOne({ username, deletedAt: null });
    if (existing) {
      throw Object.assign(new Error(`El correo ${username} ya existe en el sistema.`), { statusCode: 409 });
    }

    const user = await User.create({
      schoolId,
      name: normalizeText(member.name),
      username,
      email: username,
      passwordHash: await bcrypt.hash(String(member.password), 10),
      role: appRole,
      coordinationScope: appRole === 'coordination' ? normalizeText((member.levels || [])[0]) : '',
      assignedSubjects: appRole === 'teacher' ? (Array.isArray(member.subjects) ? member.subjects.map(normalizeText).filter(Boolean) : []) : [],
      status: 'active',
    });

    createdUsers.set(`${entry.roleKey}:${entry.index}`, user);

    if (appRole === 'teacher') {
      await CampusMembership.create({
        schoolId,
        userId: user._id,
        memberType: 'campus_teacher',
        status: 'active',
        permissions: ['campus.teacher'],
        metadata: { title: 'Docente', launchPath: '/campus/teacher', notes: '' },
      });
    }

    if (appRole === 'coordination') {
      await CampusMembership.create({
        schoolId,
        userId: user._id,
        memberType: 'campus_coordination',
        status: 'active',
        permissions: ['campus.coordination'],
        metadata: { title: 'Coordinación', launchPath: '/campus/coordination', notes: '' },
      });
    }
  }

  return createdUsers;
}

async function createCampusCourses({ schoolId, payload, createdUsers, periods }) {
  const docencia = payload.staffByRole?.docencia;
  if (!docencia || docencia.skip) return [];

  const courses = [];
  for (const [index, member] of (Array.isArray(docencia.members) ? docencia.members : []).entries()) {
    const teacher = createdUsers.get(`docencia:${index}`);
    if (!teacher) continue;

    const subjects = Array.isArray(member.subjects) ? member.subjects.map(normalizeText).filter(Boolean) : [];
    const gradeKeys = Array.isArray(member.courses) ? member.courses.map(normalizeText).filter(Boolean) : [];

    for (const gradeKey of gradeKeys) {
      for (const subject of subjects) {
        courses.push(await CampusCourse.create({
          schoolId,
          teacherUserId: String(teacher._id),
          assignedByUserId: String(teacher._id),
          title: `${subject} - ${gradeKey}`,
          subject,
          gradeLevel: gradeKey,
          section: gradeKey,
          studentGradeKey: gradeKey,
          description: 'Creado desde el asistente de creación de colegio.',
          academicPeriods: periods.map((period) => ({
            key: period.key,
            name: period.name,
            weight: period.weight,
            order: period.order,
            gradingComponents: [],
          })),
          status: 'active',
        }));
      }
    }
  }

  return courses;
}

router.post('/complete', async (req, res) => {
  try {
    const payload = req.body || {};
    const schoolName = normalizeText(payload.schoolName);
    if (schoolName.length < 3) {
      return res.status(400).json({ message: 'El nombre del colegio es requerido.' });
    }

    const schoolId = buildUniqueSchoolId(schoolName);

    const result = await runWithSchoolContext(schoolId, async () => {
      const levels = buildSelectedLevels(payload);
      const gradeRows = buildGradeRows(payload, levels);
      const subjects = buildSubjects(payload, gradeRows);
      const periods = buildPeriods(payload);
      const benefitRules = buildBenefitRules(payload);
      const gradeSettings = buildGradeSettings(payload, gradeRows, benefitRules);
      const createdUsers = await createUsers({ schoolId, payload });
      const rectorUser = [...createdUsers.values()].find((user) => user.role === 'rectoria');

      if (!rectorUser) {
        throw Object.assign(new Error('Debes configurar al menos un usuario de Rectoría para iniciar sesión automáticamente.'), { statusCode: 400 });
      }

      const teacherAvailability = [];
      const docencia = payload.staffByRole?.docencia;
      if (docencia && !docencia.skip) {
        (Array.isArray(docencia.members) ? docencia.members : []).forEach((member, index) => {
          const teacher = createdUsers.get(`docencia:${index}`);
          if (!teacher) return;
          (Array.isArray(member.subjects) ? member.subjects : []).forEach((subject, subjectIndex) => {
            teacherAvailability.push({
              key: `teacher_${index + 1}_${normalizeKey(subject) || subjectIndex + 1}`,
              subjectKey: normalizeKey(subject) || normalizeText(subject),
              teacherUserId: teacher._id,
              gradeKeys: Array.isArray(member.courses) ? member.courses.map(normalizeText).filter(Boolean) : [],
              windows: [],
              order: teacherAvailability.length * 10 + 10,
            });
          });
        });
      }

      const academicStructure = await AcademicStructure.findOneAndUpdate(
        { schoolId },
        {
          schoolId,
          schoolName,
          academicYear: String(new Date().getFullYear()),
          levels,
          subjects,
          grades: gradeRows,
          teachingAvailability: teacherAvailability,
          subjectLoadTemplates: [],
          gradeSchedules: gradeRows.map((row) => ({ gradeKey: row.key, subjectLoads: [], weeklySchedule: [], updatedAt: new Date() })),
          academicPeriods: periods.length ? periods : undefined,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const financialCalendar = payload.financialCalendar || {};
      const feeConfiguration = await AcademicFeeConfiguration.findOneAndUpdate(
        { schoolId },
        {
          schoolId,
          academicYear: String(new Date().getFullYear()),
          schoolYearStartDate: parseDate(financialCalendar.enrollmentStartDate),
          schoolYearEndDate: null,
          lateEnrollmentSurchargeType: toNumber(financialCalendar.lateEnrollmentSurchargePercent, 0) > 0 ? 'percent' : 'none',
          lateEnrollmentSurchargeValue: toNumber(financialCalendar.lateEnrollmentSurchargePercent, 0),
          benefitRules,
          gradeSettings,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const campusCourses = await createCampusCourses({ schoolId, payload, createdUsers, periods: periods.length ? periods : [] });

      const snapshot = await SchoolCreationSnapshot.findOneAndUpdate(
        { schoolId },
        { schoolId, schoolName, payload, completedAt: new Date() },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return {
        auth: toAuthResponse(rectorUser),
        school: { schoolId, schoolName },
        created: {
          users: createdUsers.size,
          academicStructureId: academicStructure._id,
          feeConfigurationId: feeConfiguration._id,
          campusCourses: campusCourses.length,
          snapshotId: snapshot._id,
        },
      };
    });

    return res.status(201).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

module.exports = router;
