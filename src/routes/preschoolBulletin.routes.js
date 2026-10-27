const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const AcademicStructure = require('../models/academicStructure.model');
const CampusCourse = require('../models/campusCourse.model');
const PreschoolBulletinReport = require('../models/preschoolBulletinReport.model');
const PreschoolBulletinTemplate = require('../models/preschoolBulletinTemplate.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const { getFeeGradeAliases } = require('../utils/feeGradeMatching');

const router = express.Router();
router.use(authMiddleware);

const managerRoles = ['admin', 'rectoria', 'direccion', 'coordination'];

function normalizeText(value) {
  return String(value || '').trim();
}

function compactKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function aliasesFor(value) {
  return new Set(getFeeGradeAliases(value).map((item) => compactKey(item)).filter(Boolean));
}

function valuesMatch(left, right) {
  const a = compactKey(left);
  const b = compactKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const leftAliases = aliasesFor(left);
  const rightAliases = aliasesFor(right);
  return [...leftAliases].some((item) => rightAliases.has(item));
}

function findCatalogGrade(grades, gradeKey) {
  const wanted = compactKey(gradeKey);
  const list = Array.isArray(grades) ? grades : [];
  return list.find((item) => item.key === gradeKey || compactKey(item.key) === wanted || compactKey(item.label) === wanted)
    || list.find((item) => valuesMatch(item.key, gradeKey) || valuesMatch(item.label, gradeKey))
    || null;
}

const DEFAULT_PRESCHOOL_PERFORMANCE_LEVELS = [
  { key: 'ip', label: 'Iniciando proceso (IP)', minScore: 0, maxScore: 40, color: '#ef4444', order: 10 },
  { key: 'ep', label: 'En proceso (EP)', minScore: 41, maxScore: 79, color: '#f97316', order: 20 },
  { key: 'ia', label: 'Indicador alcanzado (IA)', minScore: 80, maxScore: 100, color: '#15803d', order: 30 },
];

function serializePerformanceLevels(levels) {
  return (Array.isArray(levels) ? levels : [])
    .map((level) => ({
      key: normalizeText(level?.key),
      label: normalizeText(level?.label),
      minScore: Number(level?.minScore),
      maxScore: Number(level?.maxScore),
      color: normalizeText(level?.color),
      order: Number(level?.order || 0),
    }))
    .filter((level) => level.key && level.label)
    .sort((left, right) => left.order - right.order || left.minScore - right.minScore);
}

async function loadPreschoolPerformanceLevels(schoolId, gradeKey) {
  const structure = await AcademicStructure.findOne({ schoolId })
    .select('grades gradingScalesByLevel')
    .lean();
  const grade = (Array.isArray(structure?.grades) ? structure.grades : [])
    .find((item) => valuesMatch(item?.key, gradeKey) || valuesMatch(item?.label, gradeKey));
  const levelKey = normalizeText(grade?.levelKey) || 'preescolar';
  const scale = (Array.isArray(structure?.gradingScalesByLevel) ? structure.gradingScalesByLevel : [])
    .find((item) => compactKey(item?.levelKey) === compactKey(levelKey));
  const levels = serializePerformanceLevels(scale?.performanceLevels);
  return levels.length ? levels : DEFAULT_PRESCHOOL_PERFORMANCE_LEVELS;
}

function findCatalogPeriod(periods, periodKey) {
  const wanted = compactKey(periodKey);
  const list = Array.isArray(periods) ? periods : [];
  return list.find((item) => item.key === periodKey || compactKey(item.key) === wanted || compactKey(item.name) === wanted) || null;
}

function serializeIndicator(indicator = {}) {
  return {
    id: String(indicator._id || indicator.id || ''),
    text: normalizeText(indicator.text),
    subjectKey: normalizeText(indicator.subjectKey),
    subjectLabel: normalizeText(indicator.subjectLabel),
  };
}

function serializeBlock(block = {}) {
  return {
    id: String(block._id || block.id || ''),
    kind: block.kind === 'topic' ? 'topic' : 'dimension',
    name: normalizeText(block.name),
    teacherUserId: block.teacherUserId ? String(block.teacherUserId) : '',
    teacherName: normalizeText(block.teacherName),
    indicators: (Array.isArray(block.indicators) ? block.indicators : []).map(serializeIndicator),
  };
}

function serializeTemplate(template) {
  if (!template) return null;
  return {
    id: String(template._id || ''),
    gradeKey: normalizeText(template.gradeKey),
    gradeLabel: normalizeText(template.gradeLabel),
    academicPeriodKey: normalizeText(template.academicPeriodKey),
    academicPeriodLabel: normalizeText(template.academicPeriodLabel),
    blocks: (Array.isArray(template.blocks) ? template.blocks : []).map(serializeBlock),
    updatedAt: template.updatedAt || null,
    updatedByName: normalizeText(template.updatedByName),
  };
}

function subjectLabelByKey(subjects, subjectKey) {
  const match = (Array.isArray(subjects) ? subjects : []).find((subject) => (
    valuesMatch(subject?.key, subjectKey) || valuesMatch(subject?.label, subjectKey)
  ));
  return normalizeText(match?.label || match?.key || subjectKey);
}

function collectGradeSubjects(academicStructure, gradeKey) {
  const subjects = Array.isArray(academicStructure?.subjects) ? academicStructure.subjects : [];
  const schedules = (Array.isArray(academicStructure?.gradeSchedules) ? academicStructure.gradeSchedules : [])
    .filter((item) => valuesMatch(item?.gradeKey, gradeKey));
  const loads = schedules.flatMap((schedule) => (Array.isArray(schedule?.subjectLoads) ? schedule.subjectLoads : []));
  const seen = new Set();
  const options = [];

  loads.forEach((load) => {
    const key = normalizeText(load?.subjectKey);
    if (!key) return;
    const compact = compactKey(key);
    if (seen.has(compact)) return;
    seen.add(compact);
    options.push({
      key,
      label: subjectLabelByKey(subjects, key),
      teacherUserId: load?.teacherUserId ? String(load.teacherUserId) : '',
    });
  });

  return options.sort((left, right) => left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }));
}

const PRESCHOOL_SUBJECT_ALIAS_GROUPS = [
  ['musica', 'music'],
  ['danza', 'dance'],
  ['deporte', 'edfisica', 'educacionfisica', 'sports', 'sport'],
];

function subjectCompactTokens(subjectKey, subjectLabel) {
  const tokens = new Set([compactKey(subjectKey), compactKey(subjectLabel)].filter(Boolean));
  PRESCHOOL_SUBJECT_ALIAS_GROUPS.forEach((group) => {
    const hit = group.some((part) => [...tokens].some((token) => token.includes(part) || part.includes(token)));
    if (hit) group.forEach((part) => tokens.add(part));
  });
  return tokens;
}

function subjectsAlign(leftKey, leftLabel, rightKey, rightLabel) {
  if (valuesMatch(leftKey, rightKey) || valuesMatch(leftKey, rightLabel)
    || valuesMatch(leftLabel, rightKey) || valuesMatch(leftLabel, rightLabel)) {
    return true;
  }
  const leftTokens = subjectCompactTokens(leftKey, leftLabel);
  const rightTokens = subjectCompactTokens(rightKey, rightLabel);
  return [...leftTokens].some((token) => rightTokens.has(token));
}

function courseMatchesSubject(course, subjectKey, subjectLabel) {
  const courseKeys = [course?.subjectKey, course?.subject, course?.title].map(normalizeText).filter(Boolean);
  return courseKeys.some((value) => subjectsAlign(value, value, subjectKey, subjectLabel));
}

function courseAppliesToGrade(course, gradeKey, gradeLabel = '') {
  if (valuesMatch(course?.studentGradeKey, gradeKey) || valuesMatch(course?.gradeLevel, gradeKey)) {
    return true;
  }
  const titleHaystack = compactKey([
    course?.title,
    course?.section,
    course?.subject,
  ].filter(Boolean).join(' '));
  const gradeTokens = [compactKey(gradeKey), compactKey(gradeLabel)].filter(Boolean);
  return gradeTokens.some((token) => token && titleHaystack.includes(token));
}

function indicatorVisibleToTeacher(indicator, block, teacherUserId, courses, gradeSubjects, gradeKey, gradeLabel = '') {
  if (String(block.teacherUserId || '') === String(teacherUserId || '')) {
    return true;
  }
  const indicatorKey = normalizeText(indicator.subjectKey) || normalizeText(indicator.subjectLabel);
  const indicatorLabel = normalizeText(indicator.subjectLabel) || indicatorKey;
  if (!indicatorKey) {
    return false;
  }

  const teacherCourses = Array.isArray(courses) ? courses : [];
  if (teacherCourses.some((course) => (
    courseMatchesSubject(course, indicatorKey, indicatorLabel)
    && courseAppliesToGrade(course, gradeKey, gradeLabel)
  ))) {
    return true;
  }

  const gradeCourses = teacherCourses.filter((course) => courseAppliesToGrade(course, gradeKey, gradeLabel));
  if (gradeCourses.some((course) => courseMatchesSubject(course, indicatorKey, indicatorLabel))) {
    return true;
  }

  return (Array.isArray(gradeSubjects) ? gradeSubjects : []).some((subject) => (
    String(subject.teacherUserId || '') === String(teacherUserId || '')
    && subjectsAlign(subject.key, subject.label, indicatorKey, indicatorLabel)
  ));
}

async function loadCatalog(schoolId) {
  const [academicStructure, courses] = await Promise.all([
    AcademicStructure.findOne({ schoolId })
      .select('grades subjects gradeSchedules academicPeriods')
      .lean(),
    CampusCourse.find({ schoolId, status: 'active' })
      .select('subject subjectKey studentGradeKey gradeLevel teacherUserId')
      .lean(),
  ]);
  const grades = (Array.isArray(academicStructure?.grades) ? academicStructure.grades : [])
    .filter((grade) => normalizeText(grade?.status || 'active') !== 'archived')
    .map((grade) => {
      const subjects = collectGradeSubjects(academicStructure, grade.key);
      const byCompact = new Map(subjects.map((subject) => [compactKey(subject.key), subject]));
      courses
        .filter((course) => valuesMatch(course.studentGradeKey, grade.key) || valuesMatch(course.gradeLevel, grade.key) || valuesMatch(course.gradeLevel, grade.label))
        .forEach((course) => {
          const label = normalizeText(course.subject);
          const key = normalizeText(course.subjectKey) || label;
          const compact = compactKey(key) || compactKey(label);
          if (!label || !compact) return;
          if (valuesMatch(label, grade.key) || valuesMatch(label, grade.label)) return;
          const teacherUserId = course.teacherUserId ? String(course.teacherUserId) : '';
          const existing = byCompact.get(compact);
          if (existing) {
            if (!existing.teacherUserId && teacherUserId) {
              existing.teacherUserId = teacherUserId;
            }
            return;
          }
          const entry = { key, label, teacherUserId };
          byCompact.set(compact, entry);
          subjects.push(entry);
        });
      subjects.sort((left, right) => left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }));
      return {
        key: normalizeText(grade.key),
        label: normalizeText(grade.label || grade.key),
        order: Number(grade.order || 0),
        subjects,
      };
    })
    .filter((grade) => grade.key)
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, 'es', { numeric: true }));
  const periods = (Array.isArray(academicStructure?.academicPeriods) ? academicStructure.academicPeriods : [])
    .map((period) => ({
      key: normalizeText(period.key),
      name: normalizeText(period.name || period.key),
      order: Number(period.order || 0),
    }))
    .filter((period) => period.key)
    .sort((left, right) => left.order - right.order);
  const teachers = await User.find({
    schoolId,
    role: 'teacher',
    status: 'active',
    deletedAt: null,
  }).select('name username').sort({ name: 1 }).lean();

  return {
    grades,
    periods,
    teachers: teachers.map((teacher) => ({
      id: String(teacher._id),
      name: normalizeText(teacher.name) || normalizeText(teacher.username) || 'Docente',
    })),
  };
}

function normalizeBlocks(rawBlocks, gradeSubjects, teachers = []) {
  return (Array.isArray(rawBlocks) ? rawBlocks : [])
    .map((block) => {
      const name = normalizeText(block?.name);
      if (!name) return null;
      const teacher = teachers.find((item) => String(item.id) === normalizeText(block?.teacherUserId));
      const indicators = (Array.isArray(block?.indicators) ? block.indicators : [])
        .map((indicator) => {
          const text = normalizeText(indicator?.text);
          if (!text) return null;
          const subjectKey = normalizeText(indicator?.subjectKey);
          const subjectLabelRaw = normalizeText(indicator?.subjectLabel);
          const subject = gradeSubjects.find((item) => (
            subjectsAlign(item.key, item.label, subjectKey, subjectLabelRaw || subjectKey)
          ));
          const resolvedKey = subject ? subject.key : subjectKey;
          const resolvedLabel = subject ? subject.label : (subjectLabelRaw || subjectKey);
          return {
            text,
            subjectKey: resolvedKey,
            subjectLabel: resolvedLabel,
          };
        })
        .filter(Boolean);
      const needsTeacher = indicators.some((indicator) => !indicator.subjectKey);
      if (needsTeacher && !teacher) {
        const error = new Error(`Asigna un docente a "${name}" para calificar los indicadores sin materia.`);
        error.statusCode = 400;
        throw error;
      }
      return {
        kind: block?.kind === 'topic' ? 'topic' : 'dimension',
        name,
        teacherUserId: teacher ? teacher.id : null,
        teacherName: teacher ? teacher.name : '',
        indicators,
      };
    })
    .filter(Boolean);
}

async function findTemplateForGradePeriod(schoolId, gradeKey, periodKey) {
  const exact = await PreschoolBulletinTemplate.findOne({
    schoolId,
    gradeKey,
    academicPeriodKey: periodKey,
  }).lean();
  if (exact) return exact;
  return PreschoolBulletinTemplate.findOne({
    schoolId,
    gradeKey,
    $or: [
      { academicPeriodKey: '' },
      { academicPeriodKey: null },
      { academicPeriodKey: { $exists: false } },
    ],
  }).lean();
}

router.get('/catalog', roleMiddleware(managerRoles), async (req, res) => {
  try {
    const catalog = await loadCatalog(req.user.schoolId);
    const templates = await PreschoolBulletinTemplate.find({ schoolId: req.user.schoolId })
      .select('gradeKey academicPeriodKey updatedAt')
      .lean();
    const configured = templates
      .map((item) => ({
        gradeKey: normalizeText(item.gradeKey),
        periodKey: normalizeText(item.academicPeriodKey),
      }))
      .filter((item) => item.gradeKey && item.periodKey);
    const configuredGradeKeys = [...new Set(configured.map((item) => item.gradeKey))];
    return res.status(200).json({ ...catalog, configured, configuredGradeKeys });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/templates/:gradeKey', roleMiddleware(managerRoles), async (req, res) => {
  try {
    const gradeKey = normalizeText(req.params.gradeKey);
    const periodKey = normalizeText(req.query.periodKey);
    if (!periodKey) {
      return res.status(400).json({ message: 'Selecciona el periodo.' });
    }
    const catalog = await loadCatalog(req.user.schoolId);
    const grade = findCatalogGrade(catalog.grades, gradeKey);
    const period = findCatalogPeriod(catalog.periods, periodKey);
    if (!grade) {
      return res.status(404).json({ message: 'El grado seleccionado no existe en la malla académica.' });
    }
    if (!period) {
      return res.status(404).json({ message: 'El periodo seleccionado no existe.' });
    }
    const template = await findTemplateForGradePeriod(req.user.schoolId, grade.key, period.key);
    return res.status(200).json({ template: serializeTemplate(template) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/templates/:gradeKey', roleMiddleware(managerRoles), async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const gradeKey = normalizeText(req.params.gradeKey);
    const periodKey = normalizeText(req.body?.periodKey);
    if (!periodKey) {
      return res.status(400).json({ message: 'Selecciona el periodo.' });
    }
    const catalog = await loadCatalog(schoolId);
    const grade = findCatalogGrade(catalog.grades, gradeKey);
    const period = findCatalogPeriod(catalog.periods, periodKey);
    if (!grade) {
      return res.status(404).json({ message: 'El grado seleccionado no existe en la malla académica.' });
    }
    if (!period) {
      return res.status(404).json({ message: 'El periodo seleccionado no existe.' });
    }

    let blocks;
    try {
      blocks = normalizeBlocks(req.body?.blocks, grade.subjects, catalog.teachers);
    } catch (validationError) {
      return res.status(validationError.statusCode || 400).json({ message: validationError.message });
    }

    const existing = await PreschoolBulletinTemplate.findOne({
      schoolId,
      gradeKey: grade.key,
      academicPeriodKey: period.key,
    });
    const legacy = existing ? null : await PreschoolBulletinTemplate.findOne({
      schoolId,
      gradeKey: grade.key,
      $or: [
        { academicPeriodKey: '' },
        { academicPeriodKey: null },
        { academicPeriodKey: { $exists: false } },
      ],
    });
    const template = legacy
      ? await PreschoolBulletinTemplate.findOneAndUpdate(
        { _id: legacy._id, schoolId },
        {
          $set: {
            gradeLabel: grade.label,
            academicPeriodKey: period.key,
            academicPeriodLabel: period.name,
            blocks,
            updatedByUserId: userId,
            updatedByName: normalizeText(name),
          },
        },
        { new: true }
      )
      : await PreschoolBulletinTemplate.findOneAndUpdate(
        { schoolId, gradeKey: grade.key, academicPeriodKey: period.key },
        {
          $set: {
            gradeLabel: grade.label,
            academicPeriodLabel: period.name,
            blocks,
            updatedByUserId: userId,
            updatedByName: normalizeText(name),
          },
          $setOnInsert: { schoolId, gradeKey: grade.key, academicPeriodKey: period.key },
        },
        { new: true, upsert: true }
      );
    return res.status(200).json({ template: serializeTemplate(template) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/workspace', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const catalog = await loadCatalog(schoolId);
    const courses = await CampusCourse.find({
      schoolId,
      teacherUserId: userId,
      status: 'active',
    }).select('title subject subjectKey studentGradeKey gradeLevel section').lean();
    const templates = await PreschoolBulletinTemplate.find({ schoolId }).lean();
    const requestedPeriodKey = normalizeText(req.query.periodKey) || catalog.periods[0]?.key || '';
    const period = findCatalogPeriod(catalog.periods, requestedPeriodKey);
    const periodTemplates = templates.filter((template) => (
      period && compactKey(template.academicPeriodKey) === compactKey(period.key)
    ));

    const assignments = [];
    periodTemplates.forEach((template) => {
      const grade = findCatalogGrade(catalog.grades, template.gradeKey) || {
        key: template.gradeKey,
        label: template.gradeLabel,
        subjects: [],
      };
      const blocks = serializeTemplate(template).blocks
        .map((block) => ({
          ...block,
          indicators: block.indicators.filter((indicator) => indicatorVisibleToTeacher(
            indicator,
            block,
            userId,
            courses,
            grade.subjects,
            grade.key,
            grade.label,
          )),
        }))
        .filter((block) => block.indicators.length);
      if (!blocks.length) return;
      const matchedCourse = courses.find((course) => (
        valuesMatch(course.studentGradeKey, grade.key) || valuesMatch(course.gradeLevel, grade.key)
      ));
      assignments.push({
        gradeKey: grade.key,
        gradeLabel: grade.label || template.gradeLabel,
        courseId: matchedCourse ? String(matchedCourse._id) : '',
        blocks,
      });
    });

    const requestedGradeKey = normalizeText(req.query.gradeKey);
    const selected = (requestedGradeKey
      ? assignments.find((item) => item.gradeKey === requestedGradeKey)
      : assignments[0]) || null;
    if (!selected) {
      return res.status(200).json({
        assignments: assignments.map((item) => ({
          gradeKey: item.gradeKey,
          gradeLabel: item.gradeLabel,
        })),
        periods: catalog.periods,
        periodKey: period?.key || '',
        assignment: null,
        students: [],
        report: null,
      });
    }

    const periodKey = period?.key || '';
    const gradeAliases = [...aliasesFor(selected.gradeKey), compactKey(selected.gradeLabel)].filter(Boolean);
    const students = await Student.find({ schoolId, status: 'active', deletedAt: null })
      .select('name grade schoolCode')
      .lean();
    const roster = students
      .filter((student) => {
        const studentAliases = aliasesFor(student.grade);
        return gradeAliases.some((alias) => studentAliases.has(alias) || compactKey(student.grade) === alias);
      })
      .map((student) => ({
        id: String(student._id),
        name: normalizeText(student.name),
        schoolCode: normalizeText(student.schoolCode),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }));

    const report = periodKey
      ? await PreschoolBulletinReport.findOne({
        schoolId,
        gradeKey: selected.gradeKey,
        academicPeriodKey: periodKey,
        teacherUserId: userId,
      }).lean()
      : null;

    return res.status(200).json({
      assignments: assignments.map((item) => ({
        gradeKey: item.gradeKey,
        gradeLabel: item.gradeLabel,
      })),
      periods: catalog.periods,
      periodKey,
      performanceLevels: await loadPreschoolPerformanceLevels(schoolId, selected.gradeKey),
      assignment: selected,
      students: roster,
      report: report ? {
        status: report.status,
        submittedAt: report.submittedAt || null,
        entries: (report.entries || []).map((entry) => ({
          studentId: String(entry.studentId),
          indicatorId: entry.indicatorId,
          observation: entry.observation || '',
          performanceKey: normalizeText(entry.performanceKey),
          performanceLabel: normalizeText(entry.performanceLabel),
          score: entry.score === null || entry.score === undefined ? null : Number(entry.score),
        })),
        blockComments: (report.blockComments || []).map((item) => ({
          studentId: String(item.studentId),
          blockId: normalizeText(item.blockId),
          comment: normalizeText(item.comment),
        })),
      } : { status: 'draft', submittedAt: null, entries: [], blockComments: [] },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/workspace', async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const gradeKey = normalizeText(req.body?.gradeKey);
    const periodKey = normalizeText(req.body?.periodKey);
    const status = req.body?.status === 'submitted' ? 'submitted' : 'draft';
    if (!gradeKey || !periodKey) {
      return res.status(400).json({ message: 'Selecciona el grado y el periodo.' });
    }

    const templates = await PreschoolBulletinTemplate.find({ schoolId }).lean();
    const activeTemplate = templates.find((item) => (
      valuesMatch(item.gradeKey, gradeKey) && valuesMatch(item.academicPeriodKey, periodKey)
    ));
    if (!activeTemplate) {
      return res.status(404).json({ message: 'Este grado todavía no tiene modelo de boletín de preescolar para el periodo seleccionado.' });
    }

    const [catalog, courses] = await Promise.all([
      loadCatalog(schoolId),
      CampusCourse.find({ schoolId, teacherUserId: userId, status: 'active' })
        .select('title subject subjectKey studentGradeKey gradeLevel section')
        .lean(),
    ]);
    const grade = findCatalogGrade(catalog.grades, activeTemplate.gradeKey) || {
      key: activeTemplate.gradeKey,
      label: activeTemplate.gradeLabel,
      subjects: [],
    };
    const allowedIndicatorIds = new Set(
      serializeTemplate(activeTemplate).blocks.flatMap((block) => (
        block.indicators.filter((indicator) => indicatorVisibleToTeacher(
          indicator,
          block,
          userId,
          courses,
          grade.subjects,
          grade.key,
          grade.label,
        ))
      )).map((indicator) => indicator.id)
    );
    if (!allowedIndicatorIds.size) {
      return res.status(403).json({ message: 'No tienes indicadores asignados en este grado.' });
    }
    const allowedBlockIds = new Set(
      serializeTemplate(activeTemplate).blocks
        .filter((block) => (block.indicators || []).some((indicator) => allowedIndicatorIds.has(indicator.id)))
        .map((block) => normalizeText(block.id))
        .filter(Boolean)
    );
    const matchedCourse = courses.find((course) => (
      valuesMatch(course.studentGradeKey, grade.key) || valuesMatch(course.gradeLevel, grade.key)
    ));

    const performanceLevels = await loadPreschoolPerformanceLevels(schoolId, activeTemplate.gradeKey);
    const performanceByKey = new Map(performanceLevels.map((level) => [level.key, level]));
    const entries = (Array.isArray(req.body?.entries) ? req.body.entries : [])
      .map((entry) => {
        const performance = performanceByKey.get(normalizeText(entry?.performanceKey));
        return {
          studentId: normalizeText(entry?.studentId),
          studentName: normalizeText(entry?.studentName),
          indicatorId: normalizeText(entry?.indicatorId),
          observation: normalizeText(entry?.observation),
          performanceKey: performance ? performance.key : '',
          performanceLabel: performance ? performance.label : '',
          score: performance ? performance.minScore : null,
        };
      })
      .filter((entry) => mongoose.Types.ObjectId.isValid(entry.studentId) && allowedIndicatorIds.has(entry.indicatorId));

    const blockComments = (Array.isArray(req.body?.blockComments) ? req.body.blockComments : [])
      .map((item) => ({
        studentId: normalizeText(item?.studentId),
        blockId: normalizeText(item?.blockId),
        comment: normalizeText(item?.comment),
      }))
      .filter((item) => (
        mongoose.Types.ObjectId.isValid(item.studentId)
        && allowedBlockIds.has(item.blockId)
        && item.comment
      ))
      .map((item) => ({
        studentId: item.studentId,
        blockId: item.blockId,
        comment: item.comment,
      }));

    if (status === 'submitted' && entries.every((entry) => !entry.performanceKey)) {
      return res.status(400).json({ message: 'Califica al menos un indicador antes de generar el boletín.' });
    }

    const report = await PreschoolBulletinReport.findOneAndUpdate(
      {
        schoolId,
        gradeKey: activeTemplate.gradeKey,
        academicPeriodKey: periodKey,
        teacherUserId: userId,
      },
      {
        $set: {
          campusCourseId: matchedCourse?._id || null,
          teacherName: normalizeText(name),
          status,
          entries,
          blockComments,
          submittedAt: status === 'submitted' ? new Date() : null,
        },
        $setOnInsert: {
          schoolId,
          gradeKey: activeTemplate.gradeKey,
          academicPeriodKey: periodKey,
          teacherUserId: userId,
        },
      },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      status: report.status,
      submittedAt: report.submittedAt,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
