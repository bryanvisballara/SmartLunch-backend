const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const { getFeeGradeAliases, findGradeFeeSetting } = require('../utils/feeGradeMatching');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/walletTransaction.model');
const Order = require('../models/order.model');
const MeriendaSubscription = require('../models/meriendaSubscription.model');
const MeriendaSchedule = require('../models/meriendaSchedule.model');
const MeriendaOperation = require('../models/meriendaOperation.model');
const MeriendaIntakeRecord = require('../models/meriendaIntakeRecord.model');
const MeriendaWaitlist = require('../models/meriendaWaitlist.model');
const User = require('../models/user.model');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const ParentPaymentMethod = require('../models/parentPaymentMethod.model');
const AcademicCharge = require('../models/academicCharge.model');
const AcademicChargePayment = require('../models/academicChargePayment.model');
const AcademicCommunication = require('../models/academicCommunication.model');
const AcademicCalendarAssignment = require('../models/academicCalendarAssignment.model');
const CampusCourse = require('../models/campusCourse.model');
const CampusAttendanceSession = require('../models/campusAttendanceSession.model');
const CampusPost = require('../models/campusPost.model');
const AcademicStructure = require('../models/academicStructure.model');
const StudentBillingProfile = require('../models/studentBillingProfile.model');
const CampusGradeEntry = require('../models/campusGradeEntry.model');
const PsychologyCase = require('../models/psychologyCase.model');
const CampusDisciplineObservation = require('../models/campusDisciplineObservation.model');
const SuperAdminSchoolSettings = require('../models/superAdminSchoolSettings.model');
const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');
const {
  isEpaycoConfigured,
  createCardToken: createEpaycoCardToken,
  createOrUpdateCustomer: createEpaycoCustomer,
  toInternalStatus: toEpaycoInternalStatus,
} = require('../services/epayco.service');
const { DEFAULT_TTL_SECONDS, getMenuCache, setMenuCache } = require('../services/menuCache.service');
const {
  deriveThumbUrlFromImageUrl,
  normalizeStoredImageUrl,
  uploadImageMiddleware,
  processAndStoreUploadedImage,
} = require('../utils/imageUpload');
const { queueNotificationsForParents } = require('../services/notification.service');

const router = express.Router();
const uploadParentStudentPhoto = uploadImageMiddleware.single('image');
const ACADEMIC_CYCLE_START_MONTH = 7;
const ACADEMIC_CYCLE_END_MONTH = 4;
const DEFAULT_ACADEMIC_MONTHLY_DUE_DAY = 10;
const DATASCHOOL_WHATSAPP_NUMBER = String(process.env.DATASCHOOL_WHATSAPP_NUMBER || '573007265868').replace(/\D/g, '');
const DEFAULT_PARENT_APP_FEATURES = {
  home: true,
  finance: true,
  academic: true,
  cafeteria: true,
  nursing: true,
  wellbeing: true,
  coexistence: true,
  transport: true,
};

router.use(authMiddleware);
router.use(roleMiddleware('parent', 'admin'));

function normalizeText(value) {
  return String(value || '').trim();
}

function formatAcademicCurrency(value) {
  return Number(value || 0).toLocaleString('es-CO');
}

function normalizeParentAppFeatures(rawFeatures = {}) {
  return Object.keys(DEFAULT_PARENT_APP_FEATURES).reduce((features, key) => {
    features[key] = rawFeatures[key] === undefined ? DEFAULT_PARENT_APP_FEATURES[key] : Boolean(rawFeatures[key]);
    return features;
  }, {});
}

function serializeParentPsychologyCase(item = {}) {
  const rawCase = typeof item?.toObject === 'function' ? item.toObject() : item;
  const student = rawCase.studentId && typeof rawCase.studentId === 'object' ? rawCase.studentId : null;
  const notes = Array.isArray(rawCase.notes)
    ? rawCase.notes
        .filter((note) => ['family', 'shared_all'].includes(normalizeText(note.visibility)))
        .map((note) => ({
          id: String(note._id || ''),
          visibility: normalizeText(note.visibility) || 'private',
          content: normalizeText(note.content),
          recommendations: normalizeText(note.recommendations),
          createdAt: note.createdAt || null,
        }))
    : [];

  return {
    id: String(rawCase._id || ''),
    studentId: String(student?._id || rawCase.studentId || ''),
    student: student ? { id: String(student._id), name: normalizeText(student.name) } : null,
    title: normalizeText(rawCase.title) || 'Seguimiento de bienestar',
    caseType: normalizeText(rawCase.caseType) || 'other',
    priority: normalizeText(rawCase.priority) || 'medium',
    status: normalizeText(rawCase.status) || 'open',
    notes,
    createdAt: rawCase.createdAt || null,
    updatedAt: rawCase.updatedAt || null,
  };
}

function serializeParentCoexistenceObservation(item = {}) {
  const rawObservation = typeof item?.toObject === 'function' ? item.toObject() : item;
  const student = rawObservation.studentId && typeof rawObservation.studentId === 'object' ? rawObservation.studentId : null;

  return {
    id: String(rawObservation._id || ''),
    studentId: String(student?._id || rawObservation.studentId || ''),
    student: student ? { id: String(student._id), name: normalizeText(student.name) } : null,
    teacherName: normalizeText(rawObservation.teacherName),
    courseTitle: normalizeText(rawObservation.courseTitle),
    subject: normalizeText(rawObservation.subject),
    studentGradeKey: normalizeText(rawObservation.studentGradeKey),
    studentName: normalizeText(rawObservation.studentName || student?.name),
    studentSchoolCode: normalizeText(rawObservation.studentSchoolCode),
    studentGrade: normalizeText(rawObservation.studentGrade),
    studentCourse: normalizeText(rawObservation.studentCourse),
    observation: normalizeText(rawObservation.observation),
    status: normalizeText(rawObservation.status) || 'submitted',
    submittedAt: rawObservation.submittedAt || rawObservation.createdAt || null,
    createdAt: rawObservation.createdAt || null,
    updatedAt: rawObservation.updatedAt || null,
  };
}

function buildStoredGradeComponentKey(componentKey, subcomponentKey = '') {
  const normalizedComponentKey = normalizeText(componentKey);
  const normalizedSubcomponentKey = normalizeText(subcomponentKey);
  return normalizedSubcomponentKey ? `${normalizedComponentKey}::${normalizedSubcomponentKey}` : normalizedComponentKey;
}

function defaultParentGradingComponents() {
  return [];
}

function defaultParentAcademicPeriods() {
  return [
    { key: 'period_1', name: 'Periodo 1', weight: 100, order: 10, gradingComponents: defaultParentGradingComponents() },
  ];
}

function getParentCoursePeriodComponents(course, period) {
  if (Array.isArray(period?.gradingComponents) && period.gradingComponents.length > 0) {
    return period.gradingComponents;
  }

  if (Array.isArray(course?.gradingComponents) && course.gradingComponents.length > 0) {
    return course.gradingComponents;
  }

  return defaultParentGradingComponents();
}

function getParentCoursePeriods(course) {
  const periods = Array.isArray(course?.academicPeriods) && course.academicPeriods.length > 0
    ? course.academicPeriods
    : defaultParentAcademicPeriods();

  return periods.map((period) => ({
    ...period,
    gradingComponents: getParentCoursePeriodComponents(course, period),
  }));
}

function normalizeParentSubjectKey(course) {
  return normalizeAiText(course?.subject || course?.title || String(course?._id || '')) || String(course?._id || '');
}

function normalizeParentSubjectValue(value) {
  return normalizeAiText(value).replace(/[^a-z0-9]+/g, '');
}

function hasParentGradebookStructure(course) {
  return getParentCoursePeriods(course).some((period) => Array.isArray(period.gradingComponents) && period.gradingComponents.length > 0);
}

function dedupeParentGradebookCourses(courses = [], gradeEntryCourseIds = new Set(), courseValues = []) {
  const courseValueSet = new Set((Array.isArray(courseValues) ? courseValues : []).map((item) => normalizeAiText(item)).filter(Boolean));
  const bestBySubject = new Map();

  (Array.isArray(courses) ? courses : []).forEach((course) => {
    if (!course?._id) {
      return;
    }

    const subjectKey = normalizeParentSubjectKey(course);
    const courseId = String(course._id);
    const sectionKey = normalizeAiText(course.section);
    const titleKey = normalizeAiText(course.title);
    const score = (gradeEntryCourseIds.has(courseId) ? 1000 : 0)
      + (courseValueSet.has(sectionKey) || courseValueSet.has(titleKey) ? 100 : 0)
      + (hasParentGradebookStructure(course) ? 10 : 0)
      + (normalizeText(course.subject) ? 1 : 0);
    const current = bestBySubject.get(subjectKey);

    if (!current || score > current.score) {
      bestBySubject.set(subjectKey, { course, score });
    }
  });

  return [...bestBySubject.values()]
    .map((item) => item.course)
    .sort((left, right) => normalizeText(left.subject || left.title).localeCompare(normalizeText(right.subject || right.title)));
}

function buildParentCourseKeyValues(gradeValues = [], courseValues = []) {
  return new Set([
    ...(Array.isArray(courseValues) ? courseValues : []),
    ...(Array.isArray(gradeValues) ? gradeValues : []),
  ].map((item) => normalizeText(item).toLowerCase()).filter(Boolean));
}

function buildParentAcademicStructurePeriods(academicStructure) {
  const periods = Array.isArray(academicStructure?.academicPeriods) ? academicStructure.academicPeriods : [];
  return periods.length
    ? periods.map((period, index) => ({
      key: normalizeText(period?.key) || `period_${index + 1}`,
      name: normalizeText(period?.name) || `Periodo ${index + 1}`,
      weight: Number(period?.weight || 0),
      order: Number(period?.order || index + 1),
      startDate: period?.startDate || null,
      endDate: period?.endDate || null,
      gradingComponents: [],
    }))
    : defaultParentAcademicPeriods();
}

function getParentMappedSubjectKeys({ academicStructure, gradeValues = [], courseValues = [], courseTitleValues = [] }) {
  const normalizedGradeValues = new Set((Array.isArray(gradeValues) ? gradeValues : [])
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean));
  const normalizedCourseValues = buildParentCourseKeyValues(gradeValues, [...(courseValues || []), ...(courseTitleValues || [])]);
  const subjectKeys = new Set();
  const addSubjectKey = (value) => {
    const subjectKey = normalizeText(value);
    if (subjectKey) {
      subjectKeys.add(subjectKey);
    }
  };

  (Array.isArray(academicStructure?.subjects) ? academicStructure.subjects : []).forEach((subject) => {
    if (normalizeText(subject?.status || 'active') === 'archived') {
      return;
    }

    const subjectGradeKeys = (Array.isArray(subject?.gradeKeys) ? subject.gradeKeys : [])
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean);
    if (subjectGradeKeys.some((gradeKey) => normalizedGradeValues.has(gradeKey))) {
      addSubjectKey(subject?.key);
    }
  });

  (Array.isArray(academicStructure?.subjectLoadTemplates) ? academicStructure.subjectLoadTemplates : []).forEach((template) => {
    const templateGradeKeys = (Array.isArray(template?.gradeKeys) ? template.gradeKeys : [])
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean);
    if (templateGradeKeys.some((gradeKey) => normalizedGradeValues.has(gradeKey))) {
      addSubjectKey(template?.subjectKey);
    }
  });

  (Array.isArray(academicStructure?.gradeSchedules) ? academicStructure.gradeSchedules : []).forEach((schedule) => {
    const scheduleGradeKey = normalizeText(schedule?.gradeKey).toLowerCase();
    if (!normalizedGradeValues.has(scheduleGradeKey)) {
      return;
    }

    const scheduleCourseKey = normalizeText(schedule?.courseKey).toLowerCase();
    if (scheduleCourseKey && !normalizedCourseValues.has(scheduleCourseKey)) {
      return;
    }

    (Array.isArray(schedule?.subjectLoads) ? schedule.subjectLoads : []).forEach((load) => addSubjectKey(load?.subjectKey));
    (Array.isArray(schedule?.weeklySchedule) ? schedule.weeklySchedule : []).forEach((entry) => {
      if (normalizeText(entry?.entryType || 'class') !== 'break') {
        addSubjectKey(entry?.subjectKey);
      }
    });
  });

  return subjectKeys;
}

function buildParentSubjectTeacherAssignments({ academicStructure, gradeValues = [], courseValues = [], courseTitleValues = [] }) {
  const normalizedGradeValues = new Set((Array.isArray(gradeValues) ? gradeValues : [])
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean));
  const normalizedCourseValues = buildParentCourseKeyValues(gradeValues, [...(courseValues || []), ...(courseTitleValues || [])]);
  const teacherBySubjectKey = new Map();
  const assignTeacher = (subjectKey, teacherUserId) => {
    const normalizedSubjectKey = normalizeText(subjectKey);
    const normalizedTeacherUserId = normalizeText(teacherUserId);
    if (normalizedSubjectKey && normalizedTeacherUserId && !teacherBySubjectKey.has(normalizedSubjectKey)) {
      teacherBySubjectKey.set(normalizedSubjectKey, normalizedTeacherUserId);
    }
  };

  (Array.isArray(academicStructure?.gradeSchedules) ? academicStructure.gradeSchedules : []).forEach((schedule) => {
    const scheduleGradeKey = normalizeText(schedule?.gradeKey).toLowerCase();
    if (!normalizedGradeValues.has(scheduleGradeKey)) {
      return;
    }

    const scheduleCourseKey = normalizeText(schedule?.courseKey).toLowerCase();
    if (scheduleCourseKey && !normalizedCourseValues.has(scheduleCourseKey)) {
      return;
    }

    (Array.isArray(schedule?.subjectLoads) ? schedule.subjectLoads : []).forEach((load) => {
      assignTeacher(load?.subjectKey, load?.teacherUserId);
    });
    (Array.isArray(schedule?.weeklySchedule) ? schedule.weeklySchedule : []).forEach((entry) => {
      if (normalizeText(entry?.entryType || 'class') !== 'break') {
        assignTeacher(entry?.subjectKey, entry?.teacherUserId);
      }
    });
  });

  (Array.isArray(academicStructure?.subjectLoadTemplates) ? academicStructure.subjectLoadTemplates : []).forEach((template) => {
    const templateGradeKeys = (Array.isArray(template?.gradeKeys) ? template.gradeKeys : [])
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean);
    if (templateGradeKeys.some((gradeKey) => normalizedGradeValues.has(gradeKey))) {
      assignTeacher(template?.subjectKey, template?.teacherUserId);
    }
  });

  return teacherBySubjectKey;
}

function findParentCourseForSubject({ subject, courses = [], gradeEntryCourseIds = new Set(), courseValues = [], courseTitleValues = [] }) {
  const subjectKey = normalizeText(subject?.key);
  const subjectLabel = normalizeText(subject?.label || subject?.key);
  const subjectCandidates = new Set([
    normalizeParentSubjectValue(subjectKey),
    normalizeParentSubjectValue(subjectLabel),
  ].filter(Boolean));
  const courseValueSet = new Set([
    ...(Array.isArray(courseValues) ? courseValues : []),
    ...(Array.isArray(courseTitleValues) ? courseTitleValues : []),
  ].map((item) => normalizeAiText(item)).filter(Boolean));

  return (Array.isArray(courses) ? courses : [])
    .filter((course) => {
      const courseSubjectCandidates = [course?.subject, course?.title].map(normalizeParentSubjectValue).filter(Boolean);
      return courseSubjectCandidates.some((candidate) => subjectCandidates.has(candidate));
    })
    .map((course) => {
      const courseId = String(course?._id || '');
      const sectionKey = normalizeAiText(course?.section);
      const titleKey = normalizeAiText(course?.title);
      return {
        course,
        score: (gradeEntryCourseIds.has(courseId) ? 1000 : 0)
          + (courseValueSet.has(sectionKey) || courseValueSet.has(titleKey) ? 100 : 0)
          + (hasParentGradebookStructure(course) ? 10 : 0),
      };
    })
    .sort((left, right) => right.score - left.score)[0]?.course || null;
}

function buildParentGradebookCoursesFromStructure({ academicStructure, gradeValues = [], courseValues = [], courseTitleValues = [], courses = [], gradeEntryCourseIds = new Set() }) {
  const subjectKeys = getParentMappedSubjectKeys({ academicStructure, gradeValues, courseValues, courseTitleValues });
  const teacherBySubjectKey = buildParentSubjectTeacherAssignments({ academicStructure, gradeValues, courseValues, courseTitleValues });
  const subjectsByKey = new Map((Array.isArray(academicStructure?.subjects) ? academicStructure.subjects : [])
    .map((subject) => [normalizeText(subject?.key), subject]));
  const periods = buildParentAcademicStructurePeriods(academicStructure);
  const primaryGradeKey = (Array.isArray(gradeValues) ? gradeValues : []).map(normalizeText).find(Boolean) || '';
  const primaryCourseKey = (Array.isArray(courseValues) ? courseValues : []).map(normalizeText).find(Boolean) || '';
  const mappedCourses = [];

  subjectKeys.forEach((subjectKey) => {
    const subject = subjectsByKey.get(subjectKey) || { key: subjectKey, label: subjectKey };
    const matchedCourse = findParentCourseForSubject({ subject, courses, gradeEntryCourseIds, courseValues, courseTitleValues });
    if (matchedCourse) {
      mappedCourses.push({
        ...matchedCourse,
        subject: normalizeText(matchedCourse.subject) || normalizeText(subject.label || subject.key),
        teacherUserId: normalizeText(matchedCourse.teacherUserId) || teacherBySubjectKey.get(subjectKey) || '',
        academicPeriods: getParentCoursePeriods(matchedCourse),
      });
      return;
    }

    const subjectLabel = normalizeText(subject.label || subject.key) || 'Materia';
    mappedCourses.push({
      _id: `academic-structure:${primaryGradeKey || 'grade'}:${primaryCourseKey || 'course'}:${subjectKey}`,
      title: subjectLabel,
      subject: subjectLabel,
      gradeLevel: primaryGradeKey,
      section: primaryCourseKey,
      studentGradeKey: primaryGradeKey,
      teacherUserId: teacherBySubjectKey.get(subjectKey) || '',
      academicPeriods: periods,
      gradingComponents: [],
      status: 'active',
      isVirtualAcademicStructureCourse: true,
    });
  });

  if (mappedCourses.length > 0) {
    return dedupeParentGradebookCourses(mappedCourses, gradeEntryCourseIds, courseValues);
  }

  return dedupeParentGradebookCourses(courses, gradeEntryCourseIds, courseValues);
}

const DEFAULT_PARENT_PERFORMANCE_LEVELS = [
  { key: 'deficiente', label: 'Deficiente', minScore: 0, maxScore: 59, color: '#ef4444', order: 10 },
  { key: 'insuficiente', label: 'Insuficiente', minScore: 60, maxScore: 69, color: '#f97316', order: 20 },
  { key: 'aceptable', label: 'Aceptable', minScore: 70, maxScore: 79, color: '#eab308', order: 30 },
  { key: 'bueno', label: 'Bueno', minScore: 80, maxScore: 89, color: '#65a30d', order: 40 },
  { key: 'sobresaliente', label: 'Sobresaliente', minScore: 90, maxScore: 95, color: '#15803d', order: 50 },
  { key: 'excelente', label: 'Excelente', minScore: 96, maxScore: 100, color: '#166534', order: 60 },
];

function normalizeParentGradingScale(rawScale = {}) {
  const sourceLevels = Array.isArray(rawScale?.performanceLevels) && rawScale.performanceLevels.length
    ? rawScale.performanceLevels
    : DEFAULT_PARENT_PERFORMANCE_LEVELS;

  return {
    minScore: Number(rawScale?.minScore ?? 0),
    maxScore: Number(rawScale?.maxScore ?? 100),
    passingScore: Number(rawScale?.passingScore ?? 70),
    performanceLevels: sourceLevels
      .map((level, index) => ({
        key: normalizeText(level?.key) || `performance_level_${index + 1}`,
        label: normalizeText(level?.label) || `Nivel ${index + 1}`,
        minScore: Number(level?.minScore ?? 0),
        maxScore: Number(level?.maxScore ?? 100),
        color: normalizeText(level?.color) || DEFAULT_PARENT_PERFORMANCE_LEVELS[index]?.color || '#174a68',
        order: Number(level?.order || (index + 1) * 10),
      }))
      .sort((left, right) => Number(left.minScore || 0) - Number(right.minScore || 0) || Number(left.order || 0) - Number(right.order || 0)),
  };
}

function resolveParentGradingScaleForGrade(academicStructure, gradeValues = []) {
  const defaultScale = normalizeParentGradingScale(academicStructure?.gradingScale || {});
  const normalizedGradeValues = new Set((Array.isArray(gradeValues) ? gradeValues : [])
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean));
  const matchedGrade = (Array.isArray(academicStructure?.grades) ? academicStructure.grades : [])
    .find((grade) => normalizedGradeValues.has(normalizeText(grade?.key).toLowerCase()) || normalizedGradeValues.has(normalizeText(grade?.label).toLowerCase()));
  const levelKey = normalizeText(matchedGrade?.levelKey);
  const levelScale = (Array.isArray(academicStructure?.gradingScalesByLevel) ? academicStructure.gradingScalesByLevel : [])
    .find((scale) => normalizeText(scale?.levelKey) === levelKey);

  return levelScale ? normalizeParentGradingScale(levelScale) : defaultScale;
}

function resolveParentPerformanceLevel(score, gradingScale = {}) {
  if (score === null || score === undefined || score === '') {
    return null;
  }

  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return null;
  }

  return (Array.isArray(gradingScale?.performanceLevels) ? gradingScale.performanceLevels : [])
    .find((level) => numericScore >= Number(level.minScore) && numericScore <= Number(level.maxScore)) || null;
}

function isParentVisibleScore(score, gradingScale = {}) {
  if (score === null || score === undefined || score === '') {
    return false;
  }

  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return false;
  }

  const minScore = Number.isFinite(Number(gradingScale?.minScore)) ? Number(gradingScale.minScore) : 0;
  const maxScore = Number.isFinite(Number(gradingScale?.maxScore)) ? Number(gradingScale.maxScore) : 100;
  return numericScore >= minScore && numericScore <= maxScore;
}

function calculateWeightedAverage(items, getWeight) {
  let total = 0;
  let gradedWeightTotal = 0;
  let hasAnyValue = false;

  (Array.isArray(items) ? items : []).forEach((item) => {
    const currentValue = item?.score ?? item?.average;
    if (currentValue === null || currentValue === undefined || currentValue === '') {
      return;
    }

    hasAnyValue = true;
    const weight = Number(getWeight(item) || 0);
    gradedWeightTotal += weight;
    total += Number(currentValue) * weight;
  });

  return hasAnyValue && gradedWeightTotal > 0 ? Number((total / gradedWeightTotal).toFixed(2)) : null;
}

function toObjectId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(id));
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfCurrentWeek() {
  const now = new Date();
  const dayIndex = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayIndex);
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function currentYearMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatDateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function buildMonthKey(dateValue) {
  const date = new Date(dateValue);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseYearMonth(value, fallbackDate = new Date()) {
  const rawValue = normalizeText(value);
  const match = rawValue.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (year >= 2000 && monthIndex >= 0 && monthIndex <= 11) {
      return new Date(year, monthIndex, 1);
    }
  }

  return new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1);
}

function getMonthRange(value, fallbackDate = new Date()) {
  const monthStart = parseYearMonth(value, fallbackDate);
  return {
    monthStart,
    monthEnd: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1),
    monthKey: buildMonthKey(monthStart),
  };
}

function normalizeAiText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function startOfDayLocal(dateValue) {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDayLocal(dateValue) {
  const date = new Date(dateValue);
  date.setHours(23, 59, 59, 999);
  return date;
}

function formatDateLabelEs(dateValue) {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(dateValue);
}

function normalizeAcademicFeedMedia(mediaItems = []) {
  if (!Array.isArray(mediaItems)) {
    return [];
  }

  return mediaItems
    .map((item, index) => {
      const kind = String(item?.kind || '').trim().toLowerCase() === 'video' ? 'video' : 'image';
      const src = kind === 'image'
        ? normalizeStoredImageUrl(item?.src)
        : String(item?.src || '').trim();

      if (!src) {
        return null;
      }

      return {
        id: `${String(item?._id || 'media')}-${index + 1}`,
        kind,
        src,
        thumbUrl: normalizeStoredImageUrl(item?.thumbUrl) || (kind === 'image' ? deriveThumbUrlFromImageUrl(src) : ''),
        alt: String(item?.alt || '').trim(),
      };
    })
    .filter(Boolean);
}

function getActorName(user = {}) {
  return String(user.name || user.fullName || user.username || user.email || 'Acudiente').trim() || 'Acudiente';
}

function sameObjectId(left, right) {
  return String(left || '') === String(right || '');
}

function normalizeAcademicFeedLike(like = {}) {
  return {
    userId: String(like.userId || ''),
    name: String(like.name || 'Acudiente').trim() || 'Acudiente',
    createdAt: like.createdAt || null,
  };
}

function normalizeUniqueAcademicFeedLikes(rawLikes = []) {
  const likesByUserId = new Map();
  for (const like of Array.isArray(rawLikes) ? rawLikes : []) {
    const normalizedLike = normalizeAcademicFeedLike(like);
    if (!normalizedLike.userId || likesByUserId.has(normalizedLike.userId)) {
      continue;
    }
    likesByUserId.set(normalizedLike.userId, normalizedLike);
  }
  return [...likesByUserId.values()];
}

function buildToggledAcademicFeedLikesExpression(likesExpression, userId, nextLike) {
  return {
    $let: {
      vars: {
        currentLikes: { $ifNull: [likesExpression, []] },
      },
      in: {
        $cond: [
          {
            $in: [
              userId,
              { $map: { input: '$$currentLikes', as: 'like', in: '$$like.userId' } },
            ],
          },
          {
            $filter: {
              input: '$$currentLikes',
              as: 'like',
              cond: { $ne: ['$$like.userId', userId] },
            },
          },
          { $concatArrays: ['$$currentLikes', [nextLike]] },
        ],
      },
    },
  };
}

function serializeAcademicFeedComment(comment = {}, currentUserId = '') {
  const likes = normalizeUniqueAcademicFeedLikes(comment.likes);
  return {
    id: String(comment._id || comment.id || ''),
    userId: String(comment.userId || ''),
    name: String(comment.name || 'Acudiente').trim() || 'Acudiente',
    body: String(comment.body || '').trim(),
    createdAt: comment.createdAt || null,
    likedByMe: likes.some((like) => sameObjectId(like.userId, currentUserId)),
    likesCount: likes.length,
    likes,
    canDelete: sameObjectId(comment.userId, currentUserId),
  };
}

function isCourseTargetSubjectCandidate(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (/^\d{1,2}[A-Z]?$/i.test(normalized)) return false;
  if (/^(PREJARDIN|JARDIN|TRANSICION|PRIMARIA|SECUNDARIA|MEDIA)(:|\b)/i.test(normalized)) return false;
  return true;
}

function buildAcademicFeedAuthorName(item = {}) {
  const authorName = String(item.authorName || '').trim();
  if (authorName) return authorName;

  const createdByName = String(item.createdByName || '').trim();
  const approvalMarker = /\s*[·-]\s*Aprobado desde secretar[ií]a\s*$/i;
  if (!approvalMarker.test(createdByName)) {
    return createdByName || 'Secretaría académica';
  }

  const teacherName = createdByName.replace(approvalMarker, '').trim() || 'Docente';
  const subjectLabel = (Array.isArray(item.courseTargets) ? item.courseTargets : [])
    .map((target) => String(target || '').trim())
    .find(isCourseTargetSubjectCandidate);

  return subjectLabel ? `${teacherName} - ${subjectLabel.split(' - ')[0].trim()}` : teacherName;
}

function serializeAcademicFeedItem(item = {}, currentUserId = '') {
  const likes = normalizeUniqueAcademicFeedLikes(item.likes);
  const comments = Array.isArray(item.comments)
    ? item.comments.map((comment) => serializeAcademicFeedComment(comment, currentUserId)).filter((comment) => comment.id && comment.body)
    : [];

  return {
    ...item,
    authorName: buildAcademicFeedAuthorName(item),
    media: normalizeAcademicFeedMedia(item.media),
    publishedAtLabel: item.sentAt ? formatDateLabelEs(item.sentAt) : formatDateLabelEs(item.createdAt),
    likedByMe: likes.some((like) => sameObjectId(like.userId, currentUserId)),
    likesCount: likes.length,
    likes,
    commentsCount: comments.length,
    comments,
  };
}

async function findParentAcademicCommunication({ schoolId, communicationId, parentUserId }) {
  const communicationObjectId = toObjectId(communicationId);
  if (!communicationObjectId || !parentUserId) {
    return null;
  }

  return AcademicCommunication.findOne({
    _id: communicationObjectId,
    schoolId,
    recipientParentIds: parentUserId,
  });
}

function getApplicableAcademicBenefitRule(benefitRules = [], referenceDate = new Date()) {
  const currentDay = new Date(referenceDate).getDate();
  return (Array.isArray(benefitRules) ? benefitRules : []).find((rule) => currentDay >= Number(rule?.startDay || 0) && currentDay <= Number(rule?.endDay || 0)) || null;
}

function normalizeAcademicAdditionalDiscountPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(100, Math.max(0, parsed));
}

function normalizeBenefitFixedAmountsByGrade(rawAmounts = {}) {
  const entries = rawAmounts instanceof Map ? Array.from(rawAmounts.entries()) : Object.entries(rawAmounts || {});
  return entries.reduce((accumulator, [grade, amount]) => {
    const normalizedGrade = String(grade || '').trim().toLowerCase();
    if (!normalizedGrade) {
      return accumulator;
    }

    accumulator[normalizedGrade] = Math.max(0, Math.round(Number(amount || 0)));
    return accumulator;
  }, {});
}

function doesEnrollmentBenefitRuleApplyToGrade(rule = {}, grade = '') {
  const aliases = new Set(getFeeGradeAliases(grade));
  const targetGradeKeys = Array.isArray(rule?.targetGradeKeys) ? rule.targetGradeKeys.flatMap(getFeeGradeAliases) : [];
  if (targetGradeKeys.length > 0) {
    return targetGradeKeys.some((gradeKey) => aliases.has(gradeKey));
  }

  const amountsByGrade = normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade || {});
  const hasFixedAmountsByGrade = Object.keys(amountsByGrade).length > 0;
  if (String(rule?.discountType || '').trim().toLowerCase() === 'fixed' || hasFixedAmountsByGrade) {
    return getFixedBenefitAmountForGrade(rule, grade) > 0;
  }

  return true;
}

function getApplicableEnrollmentBenefitRule(enrollmentBenefitRules = [], referenceDate = new Date(), grade = '') {
  const safeReferenceDate = startOfDayLocal(referenceDate);
  return (Array.isArray(enrollmentBenefitRules) ? enrollmentBenefitRules : []).find((rule) => {
    if (!doesEnrollmentBenefitRuleApplyToGrade(rule, grade)) {
      return false;
    }

    const startDate = rule?.startDate ? startOfDayLocal(rule.startDate) : null;
    const endDate = rule?.endDate ? startOfDayLocal(rule.endDate) : null;
    if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return false;
    }

    return safeReferenceDate.getTime() >= startDate.getTime() && safeReferenceDate.getTime() <= endDate.getTime();
  }) || null;
}

function resolveAcademicEnrollmentBenefitDiscountAmount(amount, benefitRule = null, grade = '') {
  const safeAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (!benefitRule || safeAmount <= 0) {
    return 0;
  }

  if (String(benefitRule?.discountType || '').trim().toLowerCase() === 'fixed') {
    return Math.min(safeAmount, Math.max(0, Math.round(getFixedBenefitAmountForGrade(benefitRule, grade))));
  }

  return Math.min(safeAmount, Math.round((safeAmount * Math.min(100, Math.max(0, Number(benefitRule.discountPercent || 0)))) / 100));
}

function getFixedBenefitAmountForGrade(rule = {}, grade = '') {
  const amountsByGrade = normalizeBenefitFixedAmountsByGrade(rule.fixedAmountsByGrade || {});
  const aliases = getFeeGradeAliases(grade);
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(amountsByGrade, alias)) {
      return Math.max(0, Number(amountsByGrade[alias] || 0));
    }
  }

  return 0;
}

function resolveAcademicMonthlyDiscountConfig(billingProfile, referenceDate = new Date()) {
  const benefitRule = getApplicableAcademicBenefitRule(billingProfile?.benefitRules || [], referenceDate);
  const isFixedBenefit = String(benefitRule?.discountType || '').trim().toLowerCase() === 'fixed';
  const baseDiscountPercent = isFixedBenefit ? 0 : Math.min(100, Math.max(0, Number(benefitRule?.discountPercent || 0)));
  const fixedDiscountAmount = isFixedBenefit ? getFixedBenefitAmountForGrade(benefitRule, billingProfile?.grade) : 0;
  const additionalDiscountPercent = normalizeAcademicAdditionalDiscountPercent(billingProfile?.monthlyTuitionAdditionalDiscountPercent || 0);
  const discountPercent = Math.min(100, baseDiscountPercent + additionalDiscountPercent);
  const labels = [String(benefitRule?.label || '').trim(), String(billingProfile?.monthlyTuitionAdditionalDiscountLabel || '').trim()].filter(Boolean);

  return {
    discountPercent,
    fixedDiscountAmount,
    benefitLabel: labels.join(' + '),
  };
}

function resolveAcademicChargeAmounts(charge, billingProfile, referenceDate = new Date()) {
  const baseAmount = Math.max(0, Number(charge?.originalAmount || charge?.amount || 0));
  if (String(charge?.category || '') === 'monthly_statement') {
    const { recalculateConsolidatedStatementPricing } = require('../services/academicConsolidatedBilling.service');
    const repriced = billingProfile && String(charge?.status || '') !== 'paid'
      ? recalculateConsolidatedStatementPricing(charge, billingProfile, referenceDate)
      : {
        amount: Math.max(0, Number(charge?.amount || baseAmount || 0)),
        originalAmount: Math.max(0, Number(charge?.originalAmount || baseAmount || 0)),
        benefitLabel: '',
      };
    const effectiveAmount = Math.max(0, Number(repriced.amount || 0));
    return {
      baseAmount: Math.max(0, Number(repriced.originalAmount || effectiveAmount || 0)),
      effectiveAmount,
      discountPercent: 0,
      fixedDiscountAmount: Math.max(0, Number(repriced.originalAmount || 0) - effectiveAmount),
      benefitLabel: repriced.benefitLabel || '',
    };
  }
  if (String(charge?.category || '') === 'annual_tuition') {
    const effectiveAmount = Math.max(0, Number(charge?.amount || baseAmount || 0));
    return {
      baseAmount,
      effectiveAmount,
      discountPercent: 0,
      fixedDiscountAmount: Math.max(0, baseAmount - effectiveAmount),
      benefitLabel: normalizeText(billingProfile?.annualTuitionBenefitLabel) || normalizeText(billingProfile?.annualTuitionAdditionalDiscountLabel),
    };
  }

  const monthlyDiscountConfig = String(charge?.category || '') === 'monthly_tuition'
    ? resolveAcademicMonthlyDiscountConfig(billingProfile, referenceDate)
    : { discountPercent: 0, fixedDiscountAmount: 0, benefitLabel: '' };
  const discountPercent = monthlyDiscountConfig.discountPercent;
  const fixedDiscountAmount = Math.min(baseAmount, Math.max(0, Number(monthlyDiscountConfig.fixedDiscountAmount || 0)));
  const amountAfterFixedDiscount = Math.max(0, baseAmount - fixedDiscountAmount);
  const effectiveAmount = discountPercent > 0 || fixedDiscountAmount > 0
    ? Math.max(0, Math.round(amountAfterFixedDiscount * (1 - (discountPercent / 100))))
    : baseAmount;

  return {
    baseAmount,
    effectiveAmount,
    discountPercent,
    fixedDiscountAmount,
    benefitLabel: monthlyDiscountConfig.benefitLabel,
  };
}

function addMonthsLocal(dateValue, monthsToAdd) {
  const date = new Date(dateValue);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + Number(monthsToAdd || 0));
  date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  date.setHours(0, 0, 0, 0);
  return date;
}

function normalizeAcademicDueDateForBogota(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 5, 0, 0, 0));
}

function addAcademicDueDateMonths(dateValue, monthsToAdd = 0) {
  const baseDate = normalizeAcademicDueDateForBogota(dateValue);
  if (!baseDate) {
    return normalizeAcademicDueDateForBogota(new Date());
  }

  const targetMonth = baseDate.getUTCMonth() + Math.max(0, Number(monthsToAdd || 0));
  const targetYear = baseDate.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedTargetMonth = ((targetMonth % 12) + 12) % 12;
  const lastTargetDay = new Date(Date.UTC(targetYear, normalizedTargetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, normalizedTargetMonth, Math.min(baseDate.getUTCDate(), lastTargetDay), 5, 0, 0, 0));
}

function normalizeAcademicInstallmentCount(value, fallback = 1) {
  const parsed = Number(value || fallback || 1);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(12, Math.max(1, Math.round(parsed)));
}

function splitAcademicAmountIntoInstallments(totalAmount, installmentCount) {
  const safeTotal = Math.max(0, Math.round(Number(totalAmount || 0)));
  const safeInstallments = normalizeAcademicInstallmentCount(installmentCount, 1);
  if (safeTotal <= 0) {
    return [];
  }

  const baseAmount = Math.floor(safeTotal / safeInstallments);
  let remainder = safeTotal % safeInstallments;

  return Array.from({ length: safeInstallments }, () => {
    const nextAmount = baseAmount + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
    return nextAmount;
  }).filter((amount) => amount > 0);
}

function buildAcademicInstallmentDueDate(referenceDateValue = new Date(), installmentIndex = 0) {
  return addMonthsLocal(startOfDayLocal(referenceDateValue), Math.max(0, Number(installmentIndex || 0)));
}

function buildAcademicAnnualTuitionInstallmentDueDate(referenceDateValue = new Date(), installmentIndex = 0) {
  return addAcademicDueDateMonths(referenceDateValue, installmentIndex);
}

function resolveParentAnnualTuitionPricing(profile = {}, feeConfiguration = {}, referenceDate = new Date()) {
  const grade = normalizeText(profile.grade);
  const gradeFeeSetting = findGradeFeeSetting(feeConfiguration, grade);
  const baseAmount = Math.max(0, Math.round(Number(
    profile.annualTuitionBaseAmount
    || profile.annualTuitionAmount
    || gradeFeeSetting?.enrollmentFee
    || 0
  )));
  const activeBenefitRule = getApplicableEnrollmentBenefitRule(feeConfiguration?.enrollmentBenefitRules || [], referenceDate, grade);
  const rectoriaDiscountAmount = resolveAcademicEnrollmentBenefitDiscountAmount(baseAmount, activeBenefitRule, grade);
  const amountAfterRectoriaDiscount = Math.max(0, baseAmount - rectoriaDiscountAmount);
  const additionalDiscountPercent = normalizeAcademicAdditionalDiscountPercent(profile.annualTuitionAdditionalDiscountPercent || 0);
  const additionalDiscountAmount = additionalDiscountPercent > 0
    ? Math.min(amountAfterRectoriaDiscount, Math.round(amountAfterRectoriaDiscount * (additionalDiscountPercent / 100)))
    : Math.min(amountAfterRectoriaDiscount, Math.max(0, Number(profile.annualTuitionAdditionalDiscountAmount || 0)));
  const effectiveAmount = Math.max(0, amountAfterRectoriaDiscount - additionalDiscountAmount);
  const benefitLabels = [
    normalizeText(activeBenefitRule?.label),
    normalizeText(profile.annualTuitionAdditionalDiscountLabel),
  ].filter(Boolean);
  const benefitParts = [];
  if (rectoriaDiscountAmount > 0) {
    benefitParts.push(`Beneficio de matrícula: $${formatAcademicCurrency(rectoriaDiscountAmount)}`);
  }
  if (additionalDiscountAmount > 0) {
    benefitParts.push(`Descuento adicional: $${formatAcademicCurrency(additionalDiscountAmount)}`);
  }

  return {
    baseAmount,
    effectiveAmount,
    benefitDueDate: activeBenefitRule?.endDate ? normalizeAcademicDueDateForBogota(activeBenefitRule.endDate) : null,
    rectoriaDiscountAmount,
    additionalDiscountAmount,
    benefitLabel: benefitLabels.join(' + '),
    description: benefitParts.length ? benefitParts.join('. ') : 'Cargo de matrícula anual generado por calendario académico.',
  };
}

function resolveParentAnnualTuitionFirstDueDate(profile = {}, pricing = {}, fallbackDate = new Date()) {
  return normalizeAcademicDueDateForBogota(pricing?.benefitDueDate || profile?.annualTuitionDueDate)
    || normalizeAcademicDueDateForBogota(fallbackDate)
    || normalizeAcademicDueDateForBogota(new Date());
}

function sameAcademicDueDate(left, right) {
  const leftDate = normalizeAcademicDueDateForBogota(left);
  const rightDate = normalizeAcademicDueDateForBogota(right);
  return Boolean(leftDate && rightDate && leftDate.getTime() === rightDate.getTime());
}

async function syncParentAnnualTuitionDueDatesFromRectoria({ schoolId, studentIds = [], billingProfiles = [], feeConfiguration = null, referenceDate = new Date() }) {
  const linkedStudentIdSet = new Set(studentIds.map((item) => String(item)));
  const profiles = (billingProfiles || []).filter((profile) => linkedStudentIdSet.has(String(profile.studentId)));
  let modifiedCount = 0;

  for (const profile of profiles) {
    const pricing = resolveParentAnnualTuitionPricing(profile, feeConfiguration, referenceDate);
    const firstDueDate = normalizeAcademicDueDateForBogota(pricing.benefitDueDate || profile.annualTuitionDueDate);
    if (!firstDueDate) {
      continue;
    }

    if (pricing.benefitDueDate && !sameAcademicDueDate(profile.annualTuitionDueDate, pricing.benefitDueDate)) {
      await StudentBillingProfile.updateOne(
        { schoolId, _id: profile._id },
        { $set: { annualTuitionDueDate: pricing.benefitDueDate } }
      );
      profile.annualTuitionDueDate = pricing.benefitDueDate;
    }

    const charges = await AcademicCharge.find({
      schoolId,
      studentId: profile.studentId,
      category: 'annual_tuition',
      status: { $in: ['pending', 'overdue'] },
    }).sort({ dueDate: 1, createdAt: 1 });

    for (const [installmentIndex, charge] of charges.entries()) {
      const nextDueDate = buildAcademicAnnualTuitionInstallmentDueDate(firstDueDate, installmentIndex);
      if (sameAcademicDueDate(charge.dueDate, nextDueDate)) {
        continue;
      }

      charge.dueDate = nextDueDate;
      await charge.save();
      modifiedCount += 1;
    }
  }

  return modifiedCount;
}

function resolveAcademicCycleRange(profile = {}, referenceDate = new Date()) {
  const academicYear = normalizeText(profile.academicYear);
  const yearMatch = academicYear.match(/(20\d{2})\D+(20\d{2})/);
  if (yearMatch) {
    return {
      start: new Date(Number(yearMatch[1]), ACADEMIC_CYCLE_START_MONTH, 1),
      end: new Date(Number(yearMatch[2]), ACADEMIC_CYCLE_END_MONTH, 31),
    };
  }

  const singleYearMatch = academicYear.match(/(20\d{2})/);
  if (singleYearMatch) {
    const year = Number(singleYearMatch[1]);
    const safeReferenceDate = new Date(referenceDate);
    const startYear = safeReferenceDate.getMonth() < ACADEMIC_CYCLE_START_MONTH && year === safeReferenceDate.getFullYear()
      ? year - 1
      : year;
    return {
      start: new Date(startYear, ACADEMIC_CYCLE_START_MONTH, 1),
      end: new Date(startYear + 1, ACADEMIC_CYCLE_END_MONTH, 31),
    };
  }

  const safeReferenceDate = new Date(referenceDate);
  const currentYear = safeReferenceDate.getFullYear();
  const currentMonth = safeReferenceDate.getMonth();
  const startYear = currentMonth >= ACADEMIC_CYCLE_START_MONTH ? currentYear : currentYear - 1;
  return {
    start: new Date(startYear, ACADEMIC_CYCLE_START_MONTH, 1),
    end: new Date(startYear + 1, ACADEMIC_CYCLE_END_MONTH, 31),
  };
}

function buildAcademicCycleMonthlyDueDates(profile = {}, referenceDate = new Date()) {
  const { start, end } = resolveAcademicCycleRange(profile, referenceDate);
  const dueDay = Math.min(28, Math.max(1, Number(profile.dueDay || DEFAULT_ACADEMIC_MONTHLY_DUE_DAY)));
  const entryDate = profile.entryDate ? startOfDayLocal(profile.entryDate) : null;
  const effectiveStart = entryDate && entryDate > start ? new Date(entryDate.getFullYear(), entryDate.getMonth(), 1) : start;
  const referenceMonthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  const effectiveEnd = referenceMonthEnd < end ? referenceMonthEnd : end;
  const dueDates = [];

  for (let cursor = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), 1); cursor <= effectiveEnd; cursor = addMonthsLocal(cursor, 1)) {
    dueDates.push(new Date(cursor.getFullYear(), cursor.getMonth(), dueDay));
  }

  return dueDates;
}

async function ensureParentAcademicMonthlyCharges({ schoolId, parentUserId, role, studentIds = [], billingProfiles = [], referenceDate = new Date() }) {
  const linkedStudentIdSet = new Set(studentIds.map((item) => String(item)));
  const profiles = (billingProfiles || []).filter((profile) => linkedStudentIdSet.has(String(profile.studentId)) && Number(profile.monthlyTuitionAmount || 0) > 0);

  for (const profile of profiles) {
    const dueDates = buildAcademicCycleMonthlyDueDates(profile, referenceDate);
    for (const dueDate of dueDates) {
      const monthKey = buildMonthKey(dueDate);
      const existingCharge = await AcademicCharge.exists({
        schoolId,
        studentId: profile.studentId,
        category: 'monthly_tuition',
        monthKey,
        status: { $ne: 'cancelled' },
      });
      if (existingCharge) {
        continue;
      }

      const pricing = resolveAcademicChargeAmounts(
        { category: 'monthly_tuition', amount: Number(profile.monthlyTuitionAmount || 0), originalAmount: Number(profile.monthlyTuitionAmount || 0) },
        profile,
        dueDate
      );
      if (pricing.effectiveAmount <= 0) {
        continue;
      }

      await AcademicCharge.create({
        schoolId,
        createdByUserId: parentUserId,
        createdByRole: role,
        parentId: parentUserId,
        studentId: profile.studentId,
        billingProfileId: profile._id,
        category: 'monthly_tuition',
        concept: `Pensión ${formatDateLabel(dueDate)}`,
        description: pricing.benefitLabel ? `Beneficio aplicado: ${pricing.benefitLabel}` : 'Cargo mensual generado por calendario académico.',
        amount: pricing.effectiveAmount,
        originalAmount: pricing.baseAmount,
        dueDate,
        monthKey,
        audienceType: 'individual',
        targetGrade: profile.grade,
      });
    }
  }
}

async function ensureParentAcademicAnnualTuitionCharges({ schoolId, parentUserId, role, studentIds = [], billingProfiles = [], feeConfiguration = null, referenceDate = new Date() }) {
  const linkedStudentIdSet = new Set(studentIds.map((item) => String(item)));
  const profiles = (billingProfiles || []).filter((profile) => linkedStudentIdSet.has(String(profile.studentId)));

  for (const profile of profiles) {
    const existingCharge = await AcademicCharge.exists({
      schoolId,
      studentId: profile.studentId,
      category: 'annual_tuition',
      status: { $ne: 'cancelled' },
    });
    if (existingCharge) {
      continue;
    }

    const pricing = resolveParentAnnualTuitionPricing(profile, feeConfiguration, referenceDate);
    if (pricing.effectiveAmount <= 0) {
      continue;
    }

    const installmentCount = normalizeAcademicInstallmentCount(profile.annualTuitionInstallments, 1);
    const installmentAmounts = splitAcademicAmountIntoInstallments(pricing.effectiveAmount, installmentCount);
    const baseInstallmentAmounts = splitAcademicAmountIntoInstallments(pricing.baseAmount, installmentCount);
    const firstDueDate = resolveParentAnnualTuitionFirstDueDate(profile, pricing, profile.entryDate || referenceDate);
    const isFinanced = installmentAmounts.length > 1;

    for (const [installmentIndex, installmentAmount] of installmentAmounts.entries()) {
      const dueDate = buildAcademicAnnualTuitionInstallmentDueDate(firstDueDate, installmentIndex);
      await AcademicCharge.create({
        schoolId,
        createdByUserId: parentUserId,
        createdByRole: role,
        parentId: parentUserId,
        studentId: profile.studentId,
        billingProfileId: profile._id,
        category: 'annual_tuition',
        concept: isFinanced ? `Matrícula anual ${dueDate.getFullYear()} · cuota ${installmentIndex + 1}/${installmentAmounts.length}` : `Matrícula anual ${dueDate.getFullYear()}`,
        description: pricing.description,
        amount: installmentAmount,
        originalAmount: baseInstallmentAmounts[installmentIndex] || installmentAmount,
        dueDate,
        audienceType: 'individual',
        targetGrade: profile.grade,
      });
    }
  }
}

function getAcademicChargeSortWeight(charge = {}) {
  const category = String(charge.category || '').toLowerCase();
  if (category === 'annual_tuition') return 0;
  if (category === 'enrollment_bonus') return 1;
  if (category === 'monthly_tuition') return 2;
  return 3;
}

function sortAcademicChargesForDisplay(charges = []) {
  return [...(charges || [])].sort((left, right) => {
    const categoryDiff = getAcademicChargeSortWeight(left) - getAcademicChargeSortWeight(right);
    if (categoryDiff !== 0) return categoryDiff;
    return new Date(left.dueDate || 0) - new Date(right.dueDate || 0);
  });
}

function getAcademicChargeMonthsOverdue(charges = [], referenceDate = new Date()) {
  const overdueMonthKeys = new Set((charges || [])
    .filter((charge) => ['monthly_statement', 'monthly_tuition'].includes(String(charge.category || '')))
    .filter((charge) => ['pending', 'overdue'].includes(String(charge.status || '').toLowerCase()))
    .filter((charge) => new Date(charge.dueDate) < startOfDayLocal(referenceDate))
    .map((charge) => normalizeText(charge.monthKey) || buildMonthKey(charge.dueDate))
    .filter(Boolean));

  return overdueMonthKeys.size;
}

function buildDataSchoolWhatsappUrl({ studentName = '', amount = 0, overdueMonths = 0 } = {}) {
  const message = `Hola DataSchool, necesito ayuda con la cartera academica${studentName ? ` de ${studentName}` : ''}. Tengo ${overdueMonths} meses vencidos y requiero orientacion para normalizar el pago.`;
  return `https://wa.me/${DATASCHOOL_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function buildParentAcademicBillingSummaryByStudent({ charges = [], referenceDate = new Date() }) {
  const grouped = new Map();
  for (const charge of charges || []) {
    const studentId = String(charge.studentId?._id || charge.studentId || '');
    if (!studentId) continue;
    if (!grouped.has(studentId)) {
      grouped.set(studentId, []);
    }
    grouped.get(studentId).push(charge);
  }

  return [...grouped.entries()].map(([studentId, studentCharges]) => {
    const statementCharges = studentCharges.filter((charge) => String(charge.category || '') === 'monthly_statement');
    const pendingCharges = statementCharges.filter((charge) => ['pending', 'overdue'].includes(String(charge.status || '').toLowerCase()));
    const overdueMonths = getAcademicChargeMonthsOverdue(statementCharges, referenceDate);
    const requiresDataSchoolContact = overdueMonths >= 3;
    const currentCharge = pendingCharges.sort((left, right) => new Date(left.dueDate || 0) - new Date(right.dueDate || 0))[0] || null;
    const breakdownItems = Array.isArray(currentCharge?.breakdownItems) ? currentCharge.breakdownItems : [];
    const concepts = breakdownItems.map((item) => ({
      _id: `${currentCharge?._id || 'statement'}-${item.key || item.label}`,
      category: item.key || 'item',
      concept: item.label || 'Concepto',
      description: item.benefitLabel || '',
      amount: Number(item.amount || 0),
      originalAmount: Number(item.originalAmount || item.amount || 0),
      dueDate: currentCharge?.dueDate || null,
      status: currentCharge?.status || 'pending',
      monthKey: currentCharge?.monthKey || '',
    }));
    const amount = requiresDataSchoolContact
      ? pendingCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0)
      : Number(currentCharge?.amount || 0);
    const totalAmount = Number(currentCharge?.chargeOriginalAmount || currentCharge?.chargeAmount || currentCharge?.amount || amount || 0);
    const studentName = normalizeText(currentCharge?.studentName || statementCharges[0]?.studentName) || 'Estudiante';

    return {
      studentId,
      studentName,
      amount,
      totalAmount,
      nextChargeAmount: amount,
      nextChargeId: currentCharge?._id || null,
      pendingCount: currentCharge ? 1 : 0,
      overdueMonths,
      requiresDataSchoolContact,
      dataSchoolWhatsappUrl: requiresDataSchoolContact ? buildDataSchoolWhatsappUrl({ studentName, amount, overdueMonths }) : '',
      payableChargeIds: requiresDataSchoolContact || !currentCharge?._id ? [] : [currentCharge._id],
      concepts,
      breakdownItems,
      currentCharge,
    };
  });
}

function getParentCalendarPostDate(post = {}) {
  const value = post.deliveryMode === 'class' ? post.scheduledClassDate : post.dueAt;
  return value || post.dueAt || post.scheduledClassDate || post.publishedAt || post.createdAt || null;
}

function getParentCalendarAccent(type = '') {
  const normalizedType = normalizeText(type).toLowerCase();
  if (/quiz|examen|evaluaci/.test(normalizedType)) return 'warn';
  if (/tarea|proyecto|entrega|laboratorio/.test(normalizedType)) return 'sky';
  if (/material|aviso/.test(normalizedType)) return 'neutral';
  return 'good';
}

function serializeParentAcademicCalendarPost(post = {}) {
  const postDate = getParentCalendarPostDate(post);
  const course = post.courseId && typeof post.courseId === 'object' ? post.courseId : {};
  const courseTitle = normalizeText(course.title);
  const subject = normalizeText(course.subject) || courseTitle;
  const type = normalizeText(post.type) || 'Aviso';

  return {
    id: String(post._id || post.id || ''),
    date: postDate,
    dateKey: postDate ? buildMonthKey(postDate) + `-${String(new Date(postDate).getDate()).padStart(2, '0')}` : '',
    type,
    accent: getParentCalendarAccent(type),
    title: normalizeText(post.title) || type,
    detail: normalizeText(post.body) || 'Actividad publicada por el docente.',
    courseId: String(course._id || post.courseId || ''),
    courseTitle,
    subject,
    deliveryMode: normalizeText(post.deliveryMode) || 'date',
    dueAt: post.dueAt || null,
    scheduledClassDate: post.scheduledClassDate || null,
    scheduledClassSession: post.scheduledClassSession || null,
    publishedAt: post.publishedAt || null,
    attachments: Array.isArray(post.attachments) ? post.attachments.map((attachment) => ({
      sourceType: normalizeText(attachment.sourceType) || 'file',
      kind: normalizeText(attachment.kind) || 'file',
      title: normalizeText(attachment.title),
      url: normalizeText(attachment.url),
      fileName: normalizeText(attachment.fileName),
      mimeType: normalizeText(attachment.mimeType),
    })) : [],
  };
}

function serializeParentAcademicCalendarAssignment(item = {}) {
  const type = normalizeText(item.type) || 'Actividad';
  return {
    id: String(item._id || item.id || ''),
    date: item.scheduledAt || null,
    dateKey: item.scheduledAt ? buildMonthKey(item.scheduledAt) + `-${String(new Date(item.scheduledAt).getDate()).padStart(2, '0')}` : '',
    type,
    accent: getParentCalendarAccent(type),
    title: normalizeText(item.title) || type,
    detail: normalizeText(item.body) || 'Actividad institucional publicada por el colegio.',
    courseId: '',
    courseTitle: 'Todo el colegio',
    subject: normalizeText(item.scope) === 'all_school' ? 'Actividad institucional' : 'Actividad por grado',
    deliveryMode: 'date',
    dueAt: item.scheduledAt || null,
    scheduledClassDate: null,
    scheduledClassSession: null,
    publishedAt: item.createdAt || null,
    authorName: normalizeText(item.authorName),
    source: 'institutional_assignment',
    attachments: [],
  };
}

function buildDateWithReference(referenceDateValue, day) {
  const referenceDate = new Date(referenceDateValue);
  if (!Number.isFinite(day) || day < 1 || day > 31 || Number.isNaN(referenceDate.getTime())) {
    return null;
  }

  const candidate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), day);
  if (candidate.getMonth() !== referenceDate.getMonth() || candidate.getDate() !== day) {
    return null;
  }

  return startOfDayLocal(candidate);
}

function resolveGioReferenceDate(context = {}, history = []) {
  const candidates = [
    context?.lastDate,
    context?.lastPeakDate,
    context?.lastFromDate,
    context?.lastToDate,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const parsed = new Date(String(candidate));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const recentHistory = Array.isArray(history)
    ? history.filter((item) => item && item.role === 'user').slice(-6).reverse()
    : [];

  for (const item of recentHistory) {
    const rawContent = String(item.content || '').trim();
    const explicitIso = rawContent.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (explicitIso) {
      const parsed = new Date(Number(explicitIso[1]), Number(explicitIso[2]) - 1, Number(explicitIso[3]));
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    const explicitSpanish = normalizeAiText(rawContent).match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?\b/);
    if (explicitSpanish) {
      const monthMap = {
        enero: 0,
        febrero: 1,
        marzo: 2,
        abril: 3,
        mayo: 4,
        junio: 5,
        julio: 6,
        agosto: 7,
        septiembre: 8,
        setiembre: 8,
        octubre: 9,
        noviembre: 10,
        diciembre: 11,
      };
      const parsed = new Date(
        explicitSpanish[3] ? Number(explicitSpanish[3]) : new Date().getFullYear(),
        monthMap[explicitSpanish[2]],
        Number(explicitSpanish[1])
      );
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return null;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFlexibleCompactRegExp(value) {
  const compact = String(value || '').replace(/\s+/g, '');
  if (!compact) {
    return null;
  }

  return new RegExp(compact.split('').map((char) => escapeRegExp(char)).join('\\s*'), 'i');
}

function buildSectionLabelFromCourseToken(grade, courseToken) {
  const normalizedGrade = String(grade || '').replace(/\s+/g, '');
  const normalizedToken = String(courseToken || '').replace(/\s+/g, '');

  if (!normalizedGrade || !normalizedToken) {
    return '';
  }

  if (/^\d+$/.test(normalizedToken)) {
    const index = Number(normalizedToken);
    if (index >= 1 && index <= 26) {
      return `${normalizedGrade}${String.fromCharCode(64 + index)}`;
    }
  }

  if (/^[a-z]$/i.test(normalizedToken)) {
    return `${normalizedGrade}${normalizedToken.toUpperCase()}`;
  }

  if (/^\d+[a-z]$/i.test(normalizedToken)) {
    return normalizedToken.toUpperCase();
  }

  return normalizedToken;
}

function buildLookupMap(items = [], { keyField = 'key', labelField = 'label' } = {}) {
  const map = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = normalizeText(item?.[keyField]);
    if (!key) {
      return;
    }

    map.set(key, normalizeText(item?.[labelField]) || key);
  });

  return map;
}

function parseScheduleTimeToMinutes(value) {
  const match = normalizeText(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return (hours * 60) + minutes;
}

function formatScheduleMinutes(minutes) {
  const safeMinutes = Number(minutes || 0);
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function buildAcademicScheduleBlockSlots(academicStructure, { gradeValues = [], entries = [] } = {}) {
  const normalizedGradeValues = new Set((Array.isArray(gradeValues) ? gradeValues : [])
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean));
  const groups = Array.isArray(academicStructure?.scheduleSettings?.groups) ? academicStructure.scheduleSettings.groups : [];
  const dayRanges = new Map();

  groups.forEach((group) => {
    const groupGradeKeys = new Set((Array.isArray(group?.gradeKeys) ? group.gradeKeys : [])
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean));
    const appliesToGrade = !groupGradeKeys.size || [...normalizedGradeValues].some((gradeKey) => groupGradeKeys.has(gradeKey));
    if (!appliesToGrade) {
      return;
    }

    const weekdays = (Array.isArray(group?.weekdays) ? group.weekdays : []).map((weekday) => Number(weekday)).filter((weekday) => weekday >= 1 && weekday <= 5);
    const startMinutes = parseScheduleTimeToMinutes(group?.dayStartTime);
    if (!weekdays.length || startMinutes === null) {
      return;
    }

    let cursor = startMinutes;
    (Array.isArray(group?.blocks) ? group.blocks : [])
      .slice()
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || Number(left.block || 0) - Number(right.block || 0))
      .forEach((block) => {
        const durationMinutes = Number(block?.durationMinutes || 0);
        if (durationMinutes <= 0) {
          return;
        }
        cursor += durationMinutes;
      });

    weekdays.forEach((weekday) => {
      const existingRange = dayRanges.get(weekday);
      dayRanges.set(weekday, {
        start: Math.min(existingRange?.start ?? startMinutes, startMinutes),
        end: Math.max(existingRange?.end ?? cursor, cursor),
      });
    });
  });

  const entriesByWeekday = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const weekday = Number(entry?.weekday || 0);
    const start = parseScheduleTimeToMinutes(entry?.startTime);
    const end = parseScheduleTimeToMinutes(entry?.endTime);
    if (weekday < 1 || weekday > 5 || start === null || end === null || end <= start) {
      return;
    }

    if (!entriesByWeekday.has(weekday)) {
      entriesByWeekday.set(weekday, []);
    }
    entriesByWeekday.get(weekday).push({ start, end });
  });

  const slotsByKey = new Map();
  dayRanges.forEach((range, weekday) => {
    const dayEntries = (entriesByWeekday.get(weekday) || []).sort((left, right) => left.start - right.start || left.end - right.end);
    let cursor = range.start;

    dayEntries.forEach((entry) => {
      if (entry.start > cursor) {
        const startTime = formatScheduleMinutes(cursor);
        const endTime = formatScheduleMinutes(entry.start);
        slotsByKey.set(`${weekday}:${startTime}-${endTime}`, { weekday, startTime, endTime, order: cursor });
      }

      const startTime = formatScheduleMinutes(entry.start);
      const endTime = formatScheduleMinutes(entry.end);
      slotsByKey.set(`${weekday}:${startTime}-${endTime}`, { weekday, startTime, endTime, order: entry.start });
      cursor = Math.max(cursor, entry.end);
    });

    if (range.end > cursor) {
      const startTime = formatScheduleMinutes(cursor);
      const endTime = formatScheduleMinutes(range.end);
      slotsByKey.set(`${weekday}:${startTime}-${endTime}`, { weekday, startTime, endTime, order: cursor });
    }
  });

  return Array.from(slotsByKey.values()).sort((left, right) => left.order - right.order || left.weekday - right.weekday || left.endTime.localeCompare(right.endTime));
}

function findParentAcademicStructureSchedule(academicStructure, { gradeValues = [], courseValues = [], courseTitleValues = [] } = {}) {
  const normalizedGradeValues = new Set((Array.isArray(gradeValues) ? gradeValues : []).map((item) => normalizeText(item).toLowerCase()).filter(Boolean));
  const normalizedCourseValues = new Set([
    ...(Array.isArray(courseValues) ? courseValues : []),
    ...(Array.isArray(courseTitleValues) ? courseTitleValues : []),
  ].map((item) => normalizeText(item).toLowerCase()).filter(Boolean));

  if (!academicStructure || !normalizedGradeValues.size) {
    return null;
  }

  const schedules = Array.isArray(academicStructure.gradeSchedules) ? academicStructure.gradeSchedules : [];
  const gradeSchedules = schedules.filter((schedule) => normalizedGradeValues.has(normalizeText(schedule?.gradeKey).toLowerCase()));
  const courseSchedule = gradeSchedules.find((schedule) => {
    const courseKey = normalizeText(schedule?.courseKey).toLowerCase();
    return courseKey && normalizedCourseValues.has(courseKey);
  });

  if (courseSchedule) {
    return courseSchedule;
  }

  const gradeMap = new Map((Array.isArray(academicStructure.grades) ? academicStructure.grades : [])
    .map((grade) => [normalizeText(grade?.key).toLowerCase(), grade]));

  for (const schedule of gradeSchedules) {
    const courseKey = normalizeText(schedule?.courseKey);
    if (!courseKey) {
      continue;
    }

    const grade = gradeMap.get(normalizeText(schedule?.gradeKey).toLowerCase()) || null;
    const course = (Array.isArray(grade?.courses) ? grade.courses : []).find((item) => normalizeText(item?.key).toLowerCase() === courseKey.toLowerCase());
    const courseLabels = [course?.label, course?.section].map((item) => normalizeText(item).toLowerCase()).filter(Boolean);
    if (courseLabels.some((label) => normalizedCourseValues.has(label))) {
      return schedule;
    }
  }

  return gradeSchedules.find((schedule) => !normalizeText(schedule?.courseKey)) || null;
}

async function buildParentAcademicScheduleFromStructure({ academicStructure, gradeValues = [], courseValues = [], courseTitleValues = [] }) {
  const gradeSchedule = findParentAcademicStructureSchedule(academicStructure, { gradeValues, courseValues, courseTitleValues });
  const entries = Array.isArray(gradeSchedule?.weeklySchedule) ? gradeSchedule.weeklySchedule : [];
  const blockSlots = buildAcademicScheduleBlockSlots(academicStructure, { gradeValues, entries });

  if (!entries.length && !blockSlots.length) {
    return [];
  }

  const subjectLabelByKey = buildLookupMap(academicStructure?.subjects || []);
  const teacherIds = Array.from(new Set(entries
    .map((entry) => normalizeText(entry?.teacherUserId))
    .filter((teacherId) => mongoose.Types.ObjectId.isValid(teacherId))));
  const teachers = teacherIds.length
    ? await User.find({ _id: { $in: teacherIds } }).select('name').lean()
    : [];
  const teacherNameById = new Map(teachers.map((teacher) => [String(teacher._id), normalizeText(teacher.name)]));

  const scheduleCourses = entries
    .map((entry) => {
      const weekday = Number(entry?.weekday || 0);
      const startTime = normalizeText(entry?.startTime);
      const endTime = normalizeText(entry?.endTime);
      const entryType = normalizeText(entry?.entryType || 'class') === 'break' ? 'break' : 'class';

      if (weekday < 1 || weekday > 5 || !startTime || !endTime) {
        return null;
      }

      const subjectKey = normalizeText(entry?.subjectKey);
      const subject = entryType === 'break'
        ? (normalizeText(entry?.breakLabel) || 'Break')
        : (subjectLabelByKey.get(subjectKey) || subjectKey || 'Clase');
      const teacherName = teacherNameById.get(normalizeText(entry?.teacherUserId)) || '';

      return {
        courseId: normalizeText(entry?.key) || `${weekday}-${entry?.block || startTime}`,
        title: subject,
        subject,
        gradeKey: normalizeText(gradeSchedule?.gradeKey),
        section: normalizeText(gradeSchedule?.courseKey),
        classSessions: [{
          weekday,
          startTime,
          endTime,
          label: entryType === 'break' ? normalizeText(entry?.breakKey) : teacherName,
          type: entryType === 'break' ? (normalizeText(entry?.breakKey) || 'break') : 'class',
        }],
      };
    })
    .filter(Boolean);

  return { courses: scheduleCourses, slots: blockSlots };
}

async function buildParentAcademicGradebook({ schoolId, studentId, courses = [], gradingScale = null }) {
  const normalizedCourses = Array.isArray(courses) ? courses : [];
  const courseIds = normalizedCourses
    .map((course) => course._id)
    .filter((courseId) => mongoose.Types.ObjectId.isValid(String(courseId)));
  if (!studentId || normalizedCourses.length === 0) {
    return [];
  }

  const teacherUserIds = Array.from(new Set(normalizedCourses.map((course) => normalizeText(course.teacherUserId)).filter(Boolean)));
  const [entries, teachers] = await Promise.all([
    courseIds.length
      ? CampusGradeEntry.find({ schoolId, studentId, courseId: { $in: courseIds } }).lean()
      : Promise.resolve([]),
    teacherUserIds.length
      ? User.find({ _id: { $in: teacherUserIds }, schoolId }).select('name username').lean()
      : Promise.resolve([]),
  ]);
  const entriesByCoursePeriodComponent = new Map(entries.map((entry) => [
    `${String(entry.courseId)}:${normalizeText(entry.academicPeriodKey)}:${normalizeText(entry.componentKey)}`,
    entry,
  ]));
  const teachersById = new Map(teachers.map((teacher) => [String(teacher._id), normalizeText(teacher.name || teacher.username)]));

  return normalizedCourses.map((course) => {
    const periods = getParentCoursePeriods(course)
      .map((period, periodIndex) => {
        const components = (Array.isArray(period.gradingComponents) ? period.gradingComponents : [])
          .map((component, componentIndex) => {
            const subcomponents = Array.isArray(component.subcomponents) ? component.subcomponents : [];
            const evaluations = subcomponents.length > 0
              ? subcomponents.map((subcomponent, subcomponentIndex) => {
                const entry = entriesByCoursePeriodComponent.get(`${String(course._id)}:${normalizeText(period.key)}:${buildStoredGradeComponentKey(component.key, subcomponent.key)}`);
                return {
                  id: `${String(course._id)}-${normalizeText(period.key) || periodIndex}-${normalizeText(component.key) || componentIndex}-${normalizeText(subcomponent.key) || subcomponentIndex}`,
                  title: normalizeText(subcomponent.name) || `Subcomponente ${subcomponentIndex + 1}`,
                  date: normalizeText(subcomponent.date),
                  topic: normalizeText(subcomponent.topic) || 'Sin tematica',
                  weight: Number(subcomponent.weight || 0),
                  score: entry ? Number(entry.score) : null,
                  feedback: normalizeText(entry?.feedback),
                  gradedAt: entry?.gradedAt || null,
                };
              })
              : (() => {
                const entry = entriesByCoursePeriodComponent.get(`${String(course._id)}:${normalizeText(period.key)}:${normalizeText(component.key)}`);
                return entry ? [{
                  id: `${String(course._id)}-${normalizeText(period.key) || periodIndex}-${normalizeText(component.key) || componentIndex}`,
                  title: normalizeText(component.name) || `Componente ${componentIndex + 1}`,
                  date: entry.gradedAt || entry.updatedAt || '',
                  topic: normalizeText(course.subject) || 'Sin tematica',
                  weight: Number(component.weight || 0),
                  score: Number(entry.score),
                  feedback: normalizeText(entry.feedback),
                  gradedAt: entry.gradedAt || null,
                }] : [];
              })();
            const visibleEvaluations = evaluations.filter((evaluation) => isParentVisibleScore(evaluation.score, gradingScale));
            const average = subcomponents.length > 0
              ? calculateWeightedAverage(visibleEvaluations, (evaluation) => evaluation.weight)
              : (visibleEvaluations[0]?.score ?? null);

            return {
              id: `${String(course._id)}-${normalizeText(period.key) || periodIndex}-${normalizeText(component.key) || componentIndex}`,
              key: normalizeText(component.key),
              label: normalizeText(component.name) || `Componente ${componentIndex + 1}`,
              weight: Number(component.weight || 0),
              average,
              evaluations: visibleEvaluations,
            };
          })
          .filter((component) => component.label && isParentVisibleScore(component.average, gradingScale));
        const average = calculateWeightedAverage(components, (component) => component.weight);

        return {
          id: `${String(course._id)}-${normalizeText(period.key) || periodIndex}`,
          key: normalizeText(period.key),
          label: normalizeText(period.name) || `Periodo ${periodIndex + 1}`,
          weight: Number(period.weight || 0),
          average,
          components,
        };
      });
    const finalAverage = calculateWeightedAverage(periods, (period) => period.weight);
    const performanceLevel = resolveParentPerformanceLevel(finalAverage, gradingScale);

    return {
      id: String(course._id),
      name: normalizeText(course.subject || course.title) || 'Materia',
      teacher: teachersById.get(normalizeText(course.teacherUserId)) || 'Docente',
      finalAverage,
      performanceLevel: performanceLevel ? {
        key: performanceLevel.key,
        label: performanceLevel.label,
        color: performanceLevel.color,
      } : null,
      color: performanceLevel?.color || '',
      periods,
    };
  }).filter((subject) => subject.name)
    .sort((left, right) => {
      const leftHasGrade = left.finalAverage !== null && left.finalAverage !== undefined;
      const rightHasGrade = right.finalAverage !== null && right.finalAverage !== undefined;
      if (leftHasGrade !== rightHasGrade) {
        return leftHasGrade ? -1 : 1;
      }
      if (leftHasGrade && rightHasGrade && Number(right.finalAverage) !== Number(left.finalAverage)) {
        return Number(right.finalAverage) - Number(left.finalAverage);
      }
      return normalizeText(left.name).localeCompare(normalizeText(right.name));
    });
}

async function buildParentAcademicRanking({ schoolId, selectedStudentId, selectedStudentGrade = '', selectedStudentCourse = '', courses = [], currentAverage = null, gradingScale = null }) {
  const totalStudents = await Student.countDocuments({
    schoolId,
    deletedAt: null,
    grade: selectedStudentGrade,
    course: selectedStudentCourse,
  });

  if (currentAverage === null || currentAverage === undefined || currentAverage === '') {
    return {
      position: null,
      total: totalStudents,
      label: totalStudents ? `Sin ranking/${totalStudents} alumnos` : 'Sin ranking',
    };
  }

  const classmates = await Student.find({
    schoolId,
    deletedAt: null,
    grade: selectedStudentGrade,
    course: selectedStudentCourse,
  }).select('_id').lean();
  const averages = [];

  for (const classmate of classmates) {
    const gradebook = await buildParentAcademicGradebook({
      schoolId,
      studentId: classmate._id,
      courses,
      gradingScale,
    });
    const gradedSubjects = gradebook.filter((subject) => subject.finalAverage !== null && subject.finalAverage !== undefined);
    if (!gradedSubjects.length) {
      continue;
    }

    const average = Math.round(gradedSubjects.reduce((sum, subject) => sum + Number(subject.finalAverage || 0), 0) / gradedSubjects.length);
    averages.push({ studentId: String(classmate._id), average });
  }

  averages.sort((left, right) => right.average - left.average || left.studentId.localeCompare(right.studentId));
  const position = averages.findIndex((item) => item.studentId === String(selectedStudentId)) + 1;

  return {
    position: position || null,
    total: totalStudents,
    label: position && totalStudents ? `${position}/${totalStudents} alumnos` : (totalStudents ? `Sin ranking/${totalStudents} alumnos` : 'Sin ranking'),
  };
}

function formatGioNameList(values) {
  const safeValues = Array.isArray(values)
    ? values.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  if (!safeValues.length) {
    return 'los alumnos';
  }
  if (safeValues.length === 1) {
    return safeValues[0];
  }
  if (safeValues.length === 2) {
    return `${safeValues[0]} y ${safeValues[1]}`;
  }
  return `${safeValues.slice(0, -1).join(', ')} y ${safeValues[safeValues.length - 1]}`;
}

function serializeStudentPhotoFields(student) {
  const imageUrl = normalizeStoredImageUrl(student?.imageUrl);
  const thumbUrl = normalizeStoredImageUrl(student?.thumbUrl) || deriveThumbUrlFromImageUrl(imageUrl);

  return {
    imageUrl,
    thumbUrl,
  };
}

function getGioStudentNameCandidates(student) {
  const fullName = normalizeAiText(student?.name || '');
  const firstName = fullName.split(/\s+/).filter(Boolean)[0] || '';
  return Array.from(new Set([fullName, firstName].filter((item) => item.length >= 3)));
}

function isGioAllStudentsQuestion(rawQuestion) {
  const question = normalizeAiText(rawQuestion);
  if (!question) {
    return false;
  }

  return /\b(todos|todas|ambos|ambas|los dos|las dos|mis hijos|mis alumn|todos mis hijos|todos mis alumn|cada uno)\b/.test(question)
    || (/\b(hijos|alumnos)\b/.test(question) && /\b(cuales|cuantos|que|que tal|como van|saldo|recarga|consumo|limite|datos|informacion|resumen)\b/.test(question));
}

function buildGioChildProfiles({ students, wallets, meriendaSubscriptions }) {
  const walletByStudentId = (Array.isArray(wallets) ? wallets : []).reduce((acc, wallet) => {
    acc[String(wallet.studentId)] = wallet;
    return acc;
  }, {});

  const meriendaByChildName = (Array.isArray(meriendaSubscriptions) ? meriendaSubscriptions : []).reduce((acc, subscription) => {
    const key = normalizeAiText(subscription?.childName || '');
    if (key && !acc[key]) {
      acc[key] = subscription;
    }
    return acc;
  }, {});

  return (Array.isArray(students) ? students : []).map((student) => {
    const wallet = walletByStudentId[String(student._id)] || null;
    const merienda = meriendaByChildName[normalizeAiText(student?.name || '')] || null;
    return {
      _id: String(student._id),
      name: String(student.name || '').trim() || 'Alumno',
      schoolCode: String(student.schoolCode || '').trim(),
      grade: String(student.grade || '').trim(),
      ...serializeStudentPhotoFields(student),
      dailyLimit: Number(student.dailyLimit || 0),
      blockedProducts: Array.isArray(student.blockedProducts)
        ? student.blockedProducts.map((item) => String(item?.name || '').trim()).filter(Boolean)
        : [],
      blockedCategories: Array.isArray(student.blockedCategories)
        ? student.blockedCategories.map((item) => String(item?.name || '').trim()).filter(Boolean)
        : [],
      wallet: {
        balance: Number(wallet?.balance || 0),
        autoDebitEnabled: Boolean(wallet?.autoDebitEnabled),
        autoDebitLimit: Number(wallet?.autoDebitLimit || 0),
        autoDebitAmount: Number(wallet?.autoDebitAmount || 0),
        autoDebitLastChargeAt: wallet?.autoDebitLastChargeAt || null,
        autoDebitRetryAt: wallet?.autoDebitRetryAt || null,
        autoDebitRetryCount: Number(wallet?.autoDebitRetryCount || 0),
        autoDebitMonthlyLimit: Number(wallet?.autoDebitMonthlyLimit || 0),
        autoDebitMonthlyUsed: Number(wallet?.autoDebitMonthlyUsed || 0),
        autoDebitMonthlyPeriod: String(wallet?.autoDebitMonthlyPeriod || ''),
        lowBalanceAlertLevel: String(wallet?.lowBalanceAlertLevel || 'none'),
      },
      merienda: merienda
        ? {
            active: true,
            paymentStatus: Boolean(merienda.paymentStatus),
            currentPeriodMonth: String(merienda.currentPeriodMonth || '').trim(),
            parentRecommendations: String(merienda.parentRecommendations || '').trim(),
            childFoodRestrictions: String(merienda.childAllergies || '').trim(),
            restrictionReason: normalizeFoodRestrictionReason(merienda.childFoodRestrictionReason || ''),
            lastPaymentAt: merienda.lastPaymentAt || null,
            nextRenewalAt: merienda.nextRenewalAt || null,
          }
        : {
            active: false,
            paymentStatus: false,
            currentPeriodMonth: '',
            parentRecommendations: '',
            childFoodRestrictions: '',
            restrictionReason: '',
            lastPaymentAt: null,
            nextRenewalAt: null,
          },
    };
  });
}

function resolveGioTargetStudents(rawQuestion, context = {}, linkedStudents = [], selectedStudentId = null) {
  const safeStudents = Array.isArray(linkedStudents) ? linkedStudents : [];
  if (!safeStudents.length) {
    return [];
  }

  const question = normalizeAiText(rawQuestion);
  const selectedStudent = safeStudents.find((item) => String(item._id) === String(selectedStudentId)) || safeStudents[0];

  if (isGioAllStudentsQuestion(rawQuestion)) {
    return safeStudents;
  }

  const explicitMatches = safeStudents.filter((student) => getGioStudentNameCandidates(student).some((candidate) => {
    const matcher = new RegExp(`(^|\\b)${escapeRegExp(candidate)}(\\b|$)`);
    return matcher.test(question);
  }));

  if (explicitMatches.length) {
    return explicitMatches;
  }

  const lastTargetIds = Array.isArray(context?.lastTargetStudentIds)
    ? context.lastTargetStudentIds.map((item) => String(item))
    : [];
  if (shouldReuseGioScope(rawQuestion) && lastTargetIds.length) {
    const contextTargets = safeStudents.filter((student) => lastTargetIds.includes(String(student._id)));
    if (contextTargets.length) {
      return contextTargets;
    }
  }

  return selectedStudent ? [selectedStudent] : safeStudents.slice(0, 1);
}

function buildGioStudentBreakdownText(perStudentMetrics, currencyFormat) {
  const safeMetrics = Array.isArray(perStudentMetrics)
    ? perStudentMetrics.filter((item) => Number(item?.ordersCount || 0) > 0 || Number(item?.total || 0) > 0)
    : [];

  if (safeMetrics.length <= 1) {
    return '';
  }

  const text = safeMetrics
    .slice(0, 4)
    .map((item) => `${item.name}: ${currencyFormat.format(item.total)} en ${item.ordersCount} orden(es)`)
    .join('; ');
  return ` Detalle por alumno: ${text}.`;
}

function parseDateFromQuestion(rawQuestion, context = {}, history = []) {
  const question = normalizeAiText(rawQuestion);
  if (!question) {
    return null;
  }

  const now = new Date();

  if (/\bhoy\b/.test(question)) {
    return startOfDayLocal(now);
  }

  if (/\bayer\b/.test(question)) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return startOfDayLocal(yesterday);
  }

  const isoLike = rawQuestion.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoLike) {
    const parsed = new Date(Number(isoLike[1]), Number(isoLike[2]) - 1, Number(isoLike[3]));
    if (!Number.isNaN(parsed.getTime())) {
      return startOfDayLocal(parsed);
    }
  }

  const slashLike = rawQuestion.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashLike) {
    const day = Number(slashLike[1]);
    const month = Number(slashLike[2]);
    const year = slashLike[3]
      ? (slashLike[3].length === 2 ? 2000 + Number(slashLike[3]) : Number(slashLike[3]))
      : now.getFullYear();
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) {
      return startOfDayLocal(parsed);
    }
  }

  const monthMap = {
    enero: 0,
    febrero: 1,
    marzo: 2,
    abril: 3,
    mayo: 4,
    junio: 5,
    julio: 6,
    agosto: 7,
    septiembre: 8,
    setiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11,
  };
  const spanishLike = question.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b/);
  if (spanishLike) {
    const day = Number(spanishLike[1]);
    const monthIndex = monthMap[spanishLike[2]];
    const year = spanishLike[3] ? Number(spanishLike[3]) : now.getFullYear();
    if (Number.isInteger(day) && Number.isInteger(monthIndex) && Number.isInteger(year)) {
      const parsed = new Date(year, monthIndex, day);
      if (!Number.isNaN(parsed.getTime())) {
        return startOfDayLocal(parsed);
      }
    }
  }

  const referenceDate = resolveGioReferenceDate(context, history);
  const isPartialDateFollowUp = /^(y\s+)?(el\s+)?\d{1,2}[?.!]?$/i.test(question)
    || /\b(y\s+el|el)\s+\d{1,2}\b/.test(question)
    || /\b(que|qué)\s+consumio\s+el\s+\d{1,2}\b/.test(question)
    || /\b(y\s+que|y\s+qué)\s+consumio\s+el\s+\d{1,2}\b/.test(question);
  const hasRangeSignal = /\b(ultim|dias|dia|semana|mes|promedio|rango|periodo)\b/.test(question);
  const bareDayMatch = !hasRangeSignal && referenceDate
    ? question.match(/(?:^|\b)(?:y\s+)?(?:el\s+)?(\d{1,2})(?:\b|[?.!])/)
    : null;

  if (isPartialDateFollowUp && bareDayMatch) {
    const inferredDate = buildDateWithReference(referenceDate, Number(bareDayMatch[1]));
    if (inferredDate) {
      return inferredDate;
    }
  }

  if (/\bese dia\b|\baquel dia\b|\bestado de ese dia\b/.test(question) && context?.lastDate) {
    const parsed = new Date(String(context.lastDate));
    if (!Number.isNaN(parsed.getTime())) {
      return startOfDayLocal(parsed);
    }
  }

  return null;
}

function parseGioRangeDays(rawQuestion) {
  const question = normalizeAiText(rawQuestion);
  if (!question) {
    return null;
  }

  const explicitDays = question.match(/\bultim(?:o|os|as)?\s+(\d{1,3})\s+dias\b/);
  if (explicitDays) {
    const days = Number(explicitDays[1]);
    if (Number.isFinite(days) && days > 0 && days <= 365) {
      return days;
    }
  }

  if (/\bultima\s+semana\b|\bultimos\s+7\s+dias\b|\besta\s+semana\b/.test(question)) {
    return 7;
  }

  if (/\bultimas\s+2\s+semanas\b|\bultimos\s+14\s+dias\b/.test(question)) {
    return 14;
  }

  if (/\bultimo\s+mes\b|\bultimos\s+30\s+dias\b|\beste\s+mes\b/.test(question)) {
    return 30;
  }

  return null;
}

function shouldReuseGioScope(rawQuestion) {
  const question = normalizeAiText(rawQuestion);
  if (!question) {
    return false;
  }

  return /^(y|entonces|tambien|tambien,|ok|vale|perfecto)\b/.test(question)
    || /\b(ese dia|aquel dia|ese periodo|ese rango|en ese rango|en ese periodo|de ese dia|de ese periodo|ahi|alli)\b/.test(question)
    || /\b(y cuanto|y que|y cuales|cuanto fue|cuantas ordenes|cual fue el promedio|y el promedio)\b/.test(question);
}

function isGioPeakDayQuestion(rawQuestion) {
  const question = normalizeAiText(rawQuestion);
  if (!question) {
    return false;
  }

  return /\b(dia|fecha)\b.*\b(mas gasto|mayor gasto|gasto mas|mas plata|mas dinero)\b/.test(question)
    || /\b(cuando|cual)\b.*\b(gasto mas|fue el mayor gasto)\b/.test(question)
    || /\b(dia pico|pico de gasto)\b/.test(question);
}

function isGioSpecificDayFollowUp(rawQuestion, context = {}) {
  const question = normalizeAiText(rawQuestion);
  if (!question) {
    return false;
  }

  if (!context?.lastPeakDate && !context?.lastDate) {
    return false;
  }

  return /\b(dame|di|quiero|cual|cual es|cual fue)\b.*\b(dia|fecha)\b.*\b(especific|exact|puntual)\b/.test(question)
    || /\b(dame|di)\b.*\b(dia|fecha)\b/.test(question)
    || /\b(cual fue el dia|que dia fue|que fecha fue|la fecha exacta)\b/.test(question);
}

function resolveGioTimeframe(rawQuestion, context = {}, history = []) {
  const parsedDate = parseDateFromQuestion(rawQuestion, context, history);
  if (parsedDate) {
    return {
      scope: 'date',
      parsedDate,
      fromDate: startOfDayLocal(parsedDate),
      toDate: endOfDayLocal(parsedDate),
      rangeDays: 1,
    };
  }

  const question = normalizeAiText(rawQuestion);
  const now = new Date();
  const explicitRangeDays = parseGioRangeDays(rawQuestion);
  if (explicitRangeDays) {
    if (/\beste\s+mes\b/.test(question)) {
      return {
        scope: 'range',
        fromDate: startOfCurrentMonth(),
        toDate: endOfDayLocal(now),
        rangeDays: Math.max(1, Math.round((endOfDayLocal(now) - startOfCurrentMonth()) / 86400000) + 1),
      };
    }

    const fromDate = startOfDayLocal(now);
    fromDate.setDate(fromDate.getDate() - (explicitRangeDays - 1));
    return {
      scope: 'range',
      fromDate,
      toDate: endOfDayLocal(now),
      rangeDays: explicitRangeDays,
    };
  }

  if (/\b(ese periodo|ese rango|en ese rango|en ese periodo)\b/.test(question) && context?.lastFromDate && context?.lastToDate) {
    const fromDate = new Date(String(context.lastFromDate));
    const toDate = new Date(String(context.lastToDate));
    if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
      return {
        scope: context?.lastScope === 'date' ? 'date' : 'range',
        parsedDate: context?.lastScope === 'date' ? fromDate : null,
        fromDate: startOfDayLocal(fromDate),
        toDate: endOfDayLocal(toDate),
        rangeDays: Number(context?.lastRangeDays || 1),
      };
    }
  }

  const recentUserMessages = Array.isArray(history)
    ? history.filter((item) => item && item.role === 'user').slice(-4)
    : [];
  const hasFollowUpSignal = shouldReuseGioScope(rawQuestion)
    || (recentUserMessages.length > 1 && !/\b(hoy|ayer|ultim|semana|mes|dia|dias|fecha|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|enero|febrero)\b/.test(question));

  if (hasFollowUpSignal && context?.lastFromDate && context?.lastToDate) {
    const fromDate = new Date(String(context.lastFromDate));
    const toDate = new Date(String(context.lastToDate));
    if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
      return {
        scope: context?.lastScope === 'date' ? 'date' : 'range',
        parsedDate: context?.lastScope === 'date' ? fromDate : null,
        fromDate: startOfDayLocal(fromDate),
        toDate: endOfDayLocal(toDate),
        rangeDays: Number(context?.lastRangeDays || 1),
      };
    }
  }

  return {
    scope: 'range',
    fromDate: startOfDayLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)),
    toDate: endOfDayLocal(now),
    rangeDays: 30,
  };
}

function inferGioIntent(rawQuestion, parsedDate, context = {}) {
  const question = normalizeAiText(rawQuestion);
  if (!question) {
    return String(context?.lastIntent || 'summary');
  }
  if (/\b(cuales|cuantos|que|qué)\s+(hijos|alumnos)\b|\bmis\s+(hijos|alumnos)\b|\blista\s+de\s+(hijos|alumnos)\b/.test(question)) {
    return 'children_list';
  }
  if (isGioSpecificDayFollowUp(rawQuestion, context)) {
    return 'specific_day';
  }
  if (isGioPeakDayQuestion(rawQuestion)) {
    return 'peak_day';
  }
  if (/\b(saldo|balance|disponible|wallet)\b/.test(question)) {
    return 'balance';
  }
  if (/\b(limite diario|l[ií]mite diario|tope diario|tope|limite)\b/.test(question)) {
    return 'daily_limit';
  }
  if (/\b(bloquead|restringid|prohibid|alerg|intoleranc|categoria bloqueada|producto bloqueado)\b/.test(question)) {
    return 'restrictions';
  }
  if (/\b(grado|curso|salon|sal[oó]n|codigo escolar|codigo|c[oó]digo)\b/.test(question)) {
    return 'student_profile';
  }
  if (/\b(merienda|meriendas|suscripcion|suscripci[oó]n|snack)\b/.test(question)) {
    return 'merienda_status';
  }
  if (/\b(debito automatico|d[eé]bito automatico|autodebito|autod[eé]bito|auto debit|recarga automatica)\b/.test(question)) {
    return 'autodebit_status';
  }
  if (/\b(info|informacion|informaci[oó]n|datos|perfil|resumen|todo sobre|ficha)\b/.test(question)) {
    return 'overview';
  }
  if (/\b(promedio|media|promedi|diario promedio)\b/.test(question)) {
    return 'average';
  }
  if (/\b(cuantas ordenes|cuantos pedidos|cuantas compras|numero de ordenes|numero de pedidos)\b/.test(question)) {
    return 'orders';
  }
  if (/\b(recarga|recargar|recargue|recargué|saldo|wallet|abono|recargo)\b/.test(question)) {
    if (/\b(ultima|ultimo|reciente|mas reciente|cuando fue|cuand[oó])\b/.test(question)) {
      return 'last_recharge';
    }
    if (/\b(cuanto|cuanto le he recargado|cuanto le hice|total)\b/.test(question)) {
      return 'recharge_total';
    }
    return 'last_recharge';
  }
  if (/\b(cuanto|cuanto gasto|cuanto gast[oó]|gasto|valor|total|plata)\b/.test(question)) {
    return 'total';
  }
  if (/\b(productos|que consumio|que compro|que comio|que pidio|detalle|desglose|desglosame|cuales|top|mas frecuente|mas pidio|mas compro)\b/.test(question)) {
    return 'products';
  }
  if (parsedDate && shouldReuseGioScope(rawQuestion) && context?.lastIntent) {
    return String(context.lastIntent);
  }
  if (parsedDate) {
    return 'summary';
  }
  if (/\b(que consumio|que compro|consumo|comio|compro|pedido|orden)\b/.test(question)) {
    return 'products';
  }
  if (shouldReuseGioScope(rawQuestion) && context?.lastIntent) {
    return String(context.lastIntent);
  }
  return 'unsupported';
}

function formatGioWalletMethod(methodValue) {
  const normalized = String(methodValue || '').trim().toLowerCase();
  if (!normalized) {
    return 'un medio no especificado';
  }

  const labels = {
    cash: 'efectivo',
    qr: 'QR',
    transfer: 'transferencia',
    dataphone: 'datáfono',
    daviplata: 'DaviPlata',
    bancolombia: 'Bancolombia',
    mercadopago: 'Mercado Pago',
    bold: 'Bold',
    epayco: 'ePayco',
    system: 'sistema',
  };

  return labels[normalized] || methodValue;
}

async function findGioRechargeMetrics({ schoolId, studentIds }) {
  const safeStudentIds = Array.isArray(studentIds)
    ? studentIds.map((item) => toObjectId(item)).filter(Boolean)
    : [toObjectId(studentIds)].filter(Boolean);
  if (!safeStudentIds.length) {
    return {
      totalAmount: 0,
      count: 0,
      latest: null,
      byStudent: [],
    };
  }

  const transactions = await WalletTransaction.find({
    schoolId,
    studentId: { $in: safeStudentIds },
    cancelledAt: null,
    type: 'recharge',
  })
    .select('studentId amount method createdAt notes')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const totalAmount = safeTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const byStudentMap = new Map();

  for (const item of safeTransactions) {
    const key = String(item.studentId || '');
    const previous = byStudentMap.get(key) || {
      studentId: key,
      totalAmount: 0,
      count: 0,
      latest: null,
    };
    previous.totalAmount += Number(item.amount || 0);
    previous.count += 1;
    if (!previous.latest) {
      previous.latest = item;
    }
    byStudentMap.set(key, previous);
  }

  return {
    totalAmount,
    count: safeTransactions.length,
    latest: safeTransactions[0] || null,
    byStudent: Array.from(byStudentMap.values()),
  };
}

function buildGioMetrics(orders, fromDate, toDate, studentNameById = {}) {
  const safeOrders = Array.isArray(orders) ? orders : [];
  const total = safeOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const daysMap = new Map();
  const productsMap = new Map();
  const studentMetricsMap = new Map();

  for (const order of safeOrders) {
    const dayKey = startOfDayLocal(order.createdAt).toISOString().slice(0, 10);
    const previousDay = daysMap.get(dayKey) || { total: 0, ordersCount: 0 };
    daysMap.set(dayKey, {
      total: previousDay.total + Number(order.total || 0),
      ordersCount: previousDay.ordersCount + 1,
    });

    const studentKey = String(order.studentId || '');
    if (studentKey) {
      const previousStudent = studentMetricsMap.get(studentKey) || {
        studentId: studentKey,
        name: studentNameById[studentKey] || 'Alumno',
        total: 0,
        ordersCount: 0,
      };
      previousStudent.total += Number(order.total || 0);
      previousStudent.ordersCount += 1;
      studentMetricsMap.set(studentKey, previousStudent);
    }

    for (const item of Array.isArray(order.items) ? order.items : []) {
      const name = String(item?.nameSnapshot || 'Producto');
      const quantity = Number(item?.quantity || 0);
      const subtotal = Number(item?.subtotal || 0);
      const previous = productsMap.get(name) || { quantity: 0, subtotal: 0 };
      productsMap.set(name, {
        quantity: previous.quantity + quantity,
        subtotal: previous.subtotal + subtotal,
      });
    }
  }

  const topProducts = Array.from(productsMap.entries())
    .map(([name, data]) => ({ name, quantity: data.quantity, subtotal: data.subtotal }))
    .sort((a, b) => b.subtotal - a.subtotal);

  const dailyTotals = Array.from(daysMap.entries())
    .map(([date, data]) => ({
      date,
      total: Number(data.total || 0),
      ordersCount: Number(data.ordersCount || 0),
    }))
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  const activeDays = daysMap.size;
  const calendarDays = Math.max(1, Math.round((endOfDayLocal(toDate) - startOfDayLocal(fromDate)) / 86400000) + 1);
  const averageByActiveDay = activeDays > 0 ? total / activeDays : 0;
  const averageByCalendarDay = total / calendarDays;

  return {
    total,
    ordersCount: safeOrders.length,
    activeDays,
    calendarDays,
    averageByActiveDay,
    averageByCalendarDay,
    topProducts,
    peakDay: dailyTotals[0] || null,
    perStudent: Array.from(studentMetricsMap.values()).sort((a, b) => b.total - a.total),
  };
}

function formatGioScopeLabel(scope, fromDate, toDate, rangeDays) {
  if (scope === 'date') {
    return formatDateLabelEs(fromDate);
  }

  if (Number(rangeDays) === 7) {
    return 'los últimos 7 días';
  }
  if (Number(rangeDays) === 14) {
    return 'los últimos 14 días';
  }
  if (Number(rangeDays) === 30) {
    return 'los últimos 30 días';
  }
  if (Number(rangeDays) > 1) {
    return `los últimos ${rangeDays} días`;
  }

  return `del ${formatDateLabelEs(fromDate)} al ${formatDateLabelEs(toDate)}`;
}

function normalizeFoodRestrictionReason(value) {
  const normalized = String(value || '').trim();
  if (normalized === 'Religion') {
    return 'Religión';
  }
  return ['Alergia', 'Intolerancia', 'Dieta especial', 'Religión'].includes(normalized) ? normalized : '';
}

function detectCardBrand(cardDigits) {
  const value = String(cardDigits || '');
  if (/^4\d{12,18}$/.test(value)) return 'visa';
  if (/^(5[1-5]\d{14}|2[2-7]\d{14})$/.test(value)) return 'mastercard';
  if (/^3[47]\d{13}$/.test(value)) return 'amex';
  if (/^6(?:011|5\d{2}|4[4-9]\d|22(?:1[2-9]|[2-8]\d|9[01])|9\d{2})\d{12}$/.test(value)) return 'discover';
  return 'unknown';
}

function toEpaycoFranchise(brandValue) {
  const normalized = String(brandValue || '').trim().toLowerCase();
  if (normalized === 'visa') return 'VISA';
  if (normalized === 'mastercard') return 'MASTERCARD';
  if (normalized === 'amex' || normalized === 'american_express' || normalized === 'american express') return 'AMEX';
  if (normalized === 'diners' || normalized === 'diners_club') return 'DINERS';
  if (normalized === 'discover') return 'DISCOVER';
  return '';
}

function parseExpiry(expiryInput) {
  const value = String(expiryInput || '').trim();
  const matched = value.match(/^(\d{2})\s*\/\s*(\d{2}|\d{4})$/);
  if (!matched) {
    return null;
  }

  const month = Number(matched[1]);
  const rawYear = Number(matched[2]);
  const year = matched[2].length === 2 ? 2000 + rawYear : rawYear;

  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return null;
  }

  return { month, year };
}

const CARD_VERIFICATION_WINDOW_HOURS = 24;
const CARD_VERIFICATION_MAX_ATTEMPTS = 5;

function buildCardVerificationChallenge() {
  return Math.floor(Math.random() * 900) + 100;
}

function getCardVerificationExpirationDate() {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CARD_VERIFICATION_WINDOW_HOURS);
  return expiresAt;
}

function serializeCard(card) {
  return {
    _id: card._id,
    token: card.token,
    provider: card.provider || 'epayco',
    brand: card.brand || 'unknown',
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
    holderFirstName: card.holderFirstName,
    holderLastName: card.holderLastName,
    holderDocType: card.holderDocType,
    holderDocument: card.holderDocument,
    verificationStatus: card.verificationStatus || 'pending',
    verificationExpiresAt: card.verificationExpiresAt || null,
    verifiedAt: card.verifiedAt || null,
    status: card.status,
    createdAt: card.createdAt,
  };
}

async function sumOrdersForRange({ schoolId, studentObjectId, fromDate }) {
  const result = await Order.aggregate([
    {
      $match: {
        schoolId,
        studentId: studentObjectId,
        status: 'completed',
        createdAt: { $gte: fromDate },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$total' },
      },
    },
  ]);

  return Number(result?.[0]?.total || 0);
}

router.get('/portal/overview', async (req, res) => {
  try {
    const { schoolId, role, userId, name, username } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    const parentUser = await User.findOne({ _id: parentUserId, schoolId, role: 'parent', deletedAt: null })
      .select('name username')
      .lean();
    const parentName = parentUser?.name || name || username || 'Padre';
    const parentUsername = parentUser?.username || username || '';
    const schoolSettings = await SuperAdminSchoolSettings.findOne({ schoolId }).select('parentFeatures').lean();
    const parentAppFeatures = normalizeParentAppFeatures(schoolSettings?.parentFeatures || {});

    const links = await ParentStudentLink.find({
      schoolId,
      parentId: parentUserId,
      status: 'active',
    })
      .select('studentId')
      .lean();

    const studentIds = links.map((link) => String(link.studentId));

    if (studentIds.length === 0) {
      return res.status(200).json({
        parent: {
          _id: String(parentUserId),
          name: parentName,
          username: parentUsername,
        },
        children: [],
        selectedStudentId: null,
        selectedStudent: null,
        spending: {
          day: 0,
          week: 0,
          month: 0,
        },
        psychologyCases: [],
        coexistenceObservations: [],
        recentTopups: [],
        recentOrders: [],
        parentAppFeatures,
      });
    }

    const requestedStudentId = String(req.query.studentId || '');
    const selectedStudentId = studentIds.includes(requestedStudentId) ? requestedStudentId : studentIds[0];
    const selectedStudentObjectId = toObjectId(selectedStudentId);

    if (!selectedStudentObjectId) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    const [students, wallets, meriendaSubscriptions, psychologyCases, coexistenceObservations] = await Promise.all([
      Student.find({
        schoolId,
        _id: { $in: studentIds },
        deletedAt: null,
      })
        .sort({ name: 1 })
        .lean(),
      Wallet.find({
        schoolId,
        studentId: { $in: studentIds },
      }).lean(),
      MeriendaSubscription.find({
        schoolId,
        parentUserId,
        status: 'active',
      })
        .select('childName paymentStatus currentPeriodMonth parentRecommendations childAllergies')
        .lean(),
      PsychologyCase.find({
        schoolId,
        studentId: { $in: studentIds },
        status: { $in: ['open', 'follow_up', 'escalated'] },
      })
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean(),
      CampusDisciplineObservation.find({
        schoolId,
        studentId: { $in: studentIds },
        status: { $in: ['submitted', 'reviewed'] },
      })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(100)
        .lean(),
    ]);

    const blockedProductIds = Array.from(new Set(students.flatMap((student) => (
      Array.isArray(student.blockedProducts) ? student.blockedProducts.map((id) => String(id)).filter(Boolean) : []
    ))));
    const blockedCategoryIds = Array.from(new Set(students.flatMap((student) => (
      Array.isArray(student.blockedCategories) ? student.blockedCategories.map((id) => String(id)).filter(Boolean) : []
    ))));
    const [blockedProducts, blockedCategories] = await Promise.all([
      blockedProductIds.length ? Product.find({ schoolId, _id: { $in: blockedProductIds } }).select('name').lean() : Promise.resolve([]),
      blockedCategoryIds.length ? Category.find({ schoolId, _id: { $in: blockedCategoryIds } }).select('name').lean() : Promise.resolve([]),
    ]);
    const blockedProductNameById = new Map(blockedProducts.map((item) => [String(item._id), item.name || '']));
    const blockedCategoryNameById = new Map(blockedCategories.map((item) => [String(item._id), item.name || '']));

    const walletByStudentId = wallets.reduce((acc, wallet) => {
      acc[String(wallet.studentId)] = wallet;
      return acc;
    }, {});

    const meriendaByChildName = meriendaSubscriptions.reduce((acc, subscription) => {
      const key = String(subscription.childName || '').trim().toLowerCase();
      if (key && !acc[key]) {
        acc[key] = subscription;
      }
      return acc;
    }, {});

    const children = students.map((student) => {
      const wallet = walletByStudentId[String(student._id)] || null;
      const subKey = String(student.name || '').trim().toLowerCase();
      const merienda = meriendaByChildName[subKey] || null;

      return {
        _id: student._id,
        name: student.name,
        schoolCode: student.schoolCode || '',
        grade: student.grade || '',
        course: student.course || '',
        ...serializeStudentPhotoFields(student),
        dailyLimit: Number(student.dailyLimit || 0),
        blockedProductsCount: Array.isArray(student.blockedProducts) ? student.blockedProducts.length : 0,
        blockedCategoriesCount: Array.isArray(student.blockedCategories) ? student.blockedCategories.length : 0,
        blockedProducts: Array.isArray(student.blockedProducts)
          ? student.blockedProducts.map((item) => {
            const itemId = String(item?._id || item || '');
            return { _id: itemId, name: blockedProductNameById.get(itemId) || '' };
          })
          : [],
        blockedCategories: Array.isArray(student.blockedCategories)
          ? student.blockedCategories.map((item) => {
            const itemId = String(item?._id || item || '');
            return { _id: itemId, name: blockedCategoryNameById.get(itemId) || '' };
          })
          : [],
        wallet: {
          balance: Number(wallet?.balance || 0),
          autoDebitEnabled: Boolean(wallet?.autoDebitEnabled),
          autoDebitLimit: Number(wallet?.autoDebitLimit || 0),
          autoDebitAmount: Number(wallet?.autoDebitAmount || 0),
          autoDebitPaymentMethodId: wallet?.autoDebitPaymentMethodId || null,
          autoDebitAgreementId: String(wallet?.autoDebitAgreementId || ''),
          autoDebitAgreementStatus: String(wallet?.autoDebitAgreementStatus || ''),
          autoDebitInProgress: Boolean(wallet?.autoDebitInProgress),
          autoDebitLockAt: wallet?.autoDebitLockAt || null,
          autoDebitLastAttempt: wallet?.autoDebitLastAttempt || null,
          autoDebitLastChargeAt: wallet?.autoDebitLastChargeAt || null,
          autoDebitRetryAt: wallet?.autoDebitRetryAt || null,
          autoDebitRetryCount: Number(wallet?.autoDebitRetryCount || 0),
          autoDebitMonthlyLimit: Number(wallet?.autoDebitMonthlyLimit || 0),
          autoDebitMonthlyUsed: Number(wallet?.autoDebitMonthlyUsed || 0),
          autoDebitMonthlyPeriod: String(wallet?.autoDebitMonthlyPeriod || ''),
        },
        merienda: merienda
          ? {
              active: true,
              paymentStatus: Boolean(merienda.paymentStatus),
              currentPeriodMonth: merienda.currentPeriodMonth || '',
              parentRecommendations: merienda.parentRecommendations || '',
              childFoodRestrictions: merienda.childAllergies || '',
            }
          : {
              active: false,
              paymentStatus: false,
              currentPeriodMonth: '',
              parentRecommendations: '',
              childFoodRestrictions: '',
            },
      };
    });

    const selectedStudent = children.find((child) => String(child._id) === selectedStudentId) || null;

    const selectedStudentGrade = String(selectedStudent?.grade || '').trim();
    const selectedStudentCourse = String(selectedStudent?.course || '').trim();
    const selectedStudentCourseCompact = selectedStudentCourse.replace(/\s+/g, '');
    const selectedStudentCourseParts = selectedStudentCourse.split(':').map((part) => part.trim()).filter(Boolean);
    const selectedStudentGradeKeyFromCourse = selectedStudentCourseParts.length >= 2
      ? `${selectedStudentCourseParts[0].toLowerCase()}:${selectedStudentCourseParts[1]}`
      : '';
    const selectedStudentCourseToken = selectedStudentCourseParts.length >= 3 ? selectedStudentCourseParts.slice(2).join(':') : '';
    const selectedStudentCourseLabel = buildSectionLabelFromCourseToken(selectedStudentGrade, selectedStudentCourseToken);
    const selectedStudentSection = selectedStudentGrade && selectedStudentCourseCompact.toLowerCase().startsWith(selectedStudentGrade.replace(/\s+/g, '').toLowerCase())
      ? selectedStudentCourseCompact.slice(selectedStudentGrade.replace(/\s+/g, '').length)
      : '';
    const selectedStudentGradeValues = Array.from(new Set([
      selectedStudentGrade,
      selectedStudentGradeKeyFromCourse,
    ].map((item) => String(item || '').trim()).filter(Boolean)));
    const selectedStudentCourseValues = Array.from(new Set([
      selectedStudentCourse,
      selectedStudentCourseCompact,
      selectedStudentSection,
      selectedStudentCourseLabel,
    ].map((item) => String(item || '').trim()).filter(Boolean)));
    const selectedStudentGradeCompact = selectedStudentGrade.replace(/\s+/g, '');
    const selectedStudentCourseTitleValues = Array.from(new Set([
      selectedStudentCourse.includes(':') ? '' : selectedStudentCourse,
      selectedStudentCourse.includes(':') ? '' : selectedStudentCourseCompact,
      selectedStudentSection && selectedStudentGradeCompact ? `${selectedStudentGradeCompact}${selectedStudentSection}` : '',
      selectedStudentCourseLabel,
    ].map((item) => String(item || '').trim()).filter((item) => item.length > 1)));
    const selectedStudentCourseTitleMatchers = selectedStudentCourseTitleValues
      .map((value) => buildFlexibleCompactRegExp(value))
      .filter(Boolean);

    const [day, week, month, recentTopups, recentOrders, academicContentCourses, academicGradeCourses, academicGradeEntryRefs, academicStructure] = await Promise.all([
      sumOrdersForRange({ schoolId, studentObjectId: selectedStudentObjectId, fromDate: startOfToday() }),
      sumOrdersForRange({ schoolId, studentObjectId: selectedStudentObjectId, fromDate: startOfCurrentWeek() }),
      sumOrdersForRange({ schoolId, studentObjectId: selectedStudentObjectId, fromDate: startOfCurrentMonth() }),
      WalletTransaction.find({
        schoolId,
        cancelledAt: null,
        studentId: { $in: studentIds },
        $or: [
          { type: 'recharge' },
          { type: 'refund' },
          { type: 'adjustment' },
        ],
      })
        .populate('createdBy', 'name username role')
        .populate('studentId', 'name schoolCode')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Order.find({
        schoolId,
        studentId: selectedStudentObjectId,
        status: 'completed',
      })
        .populate('storeId', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      selectedStudentGrade
        ? CampusCourse.find({
          schoolId,
          status: 'active',
          studentGradeKey: { $in: selectedStudentGradeValues },
          ...(selectedStudentCourseValues.length ? {
            $or: [
              { section: { $in: selectedStudentCourseValues } },
              ...selectedStudentCourseTitleMatchers.map((matcher) => ({ title: matcher })),
            ],
          } : {}),
        })
          .select('title subject gradeLevel section studentGradeKey academicContent classSessions')
          .sort({ title: 1 })
          .lean()
        : Promise.resolve([]),
      selectedStudentGrade
        ? CampusCourse.find({
          schoolId,
          status: 'active',
          studentGradeKey: { $in: selectedStudentGradeValues },
        })
          .select('title subject gradeLevel section studentGradeKey teacherUserId gradingComponents academicPeriods')
          .sort({ title: 1 })
          .lean()
        : Promise.resolve([]),
      CampusGradeEntry.find({ schoolId, studentId: selectedStudentObjectId })
        .select('courseId')
        .lean(),
      AcademicStructure.findOne({ schoolId }).lean(),
    ]);

    const academicGradeCourseIds = new Set((Array.isArray(academicGradeCourses) ? academicGradeCourses : []).map((course) => String(course._id)));
    const gradeEntryCourseIds = Array.from(new Set((Array.isArray(academicGradeEntryRefs) ? academicGradeEntryRefs : [])
      .map((entry) => String(entry.courseId || ''))
      .filter((courseId) => courseId && !academicGradeCourseIds.has(courseId))));
    const academicGradeEntryCourses = gradeEntryCourseIds.length > 0
      ? await CampusCourse.find({
        schoolId,
        status: 'active',
        _id: { $in: gradeEntryCourseIds },
      })
        .select('title subject gradeLevel section studentGradeKey teacherUserId gradingComponents academicPeriods')
        .sort({ title: 1 })
        .lean()
      : [];
    const gradeEntryCourseIdSet = new Set((Array.isArray(academicGradeEntryRefs) ? academicGradeEntryRefs : [])
      .map((entry) => String(entry.courseId || ''))
      .filter(Boolean));
    const parentGradebookCourses = buildParentGradebookCoursesFromStructure({
      academicStructure,
      gradeValues: selectedStudentGradeValues,
      courseValues: selectedStudentCourseValues,
      courseTitleValues: selectedStudentCourseTitleValues,
      courses: [...academicGradeCourses, ...academicGradeEntryCourses],
      gradeEntryCourseIds: gradeEntryCourseIdSet,
    });

    const academicStructureSchedule = await buildParentAcademicScheduleFromStructure({
      academicStructure,
      gradeValues: selectedStudentGradeValues,
      courseValues: selectedStudentCourseValues,
      courseTitleValues: selectedStudentCourseTitleValues,
    });
    const parentGradingScale = resolveParentGradingScaleForGrade(academicStructure, selectedStudentGradeValues);
    const academicGrades = await buildParentAcademicGradebook({
      schoolId,
      studentId: selectedStudentObjectId,
      courses: parentGradebookCourses,
      gradingScale: parentGradingScale,
    });
    const gradedAcademicSubjects = academicGrades.filter((subject) => subject.finalAverage !== null && subject.finalAverage !== undefined);
    const academicAverage = gradedAcademicSubjects.length
      ? Math.round(gradedAcademicSubjects.reduce((sum, subject) => sum + Number(subject.finalAverage || 0), 0) / gradedAcademicSubjects.length)
      : null;
    const academicRanking = await buildParentAcademicRanking({
      schoolId,
      selectedStudentId: selectedStudentObjectId,
      selectedStudentGrade,
      selectedStudentCourse,
      courses: parentGradebookCourses,
      currentAverage: academicAverage,
      gradingScale: parentGradingScale,
    });
    const academicStructureScheduleCourses = Array.isArray(academicStructureSchedule?.courses) ? academicStructureSchedule.courses : [];
    const academicStructureScheduleSlots = Array.isArray(academicStructureSchedule?.slots) ? academicStructureSchedule.slots : [];

    return res.status(200).json({
      parent: {
        _id: String(parentUserId),
        name: parentName,
        username: parentUsername,
      },
      children,
      psychologyCases: psychologyCases.map(serializeParentPsychologyCase),
      coexistenceObservations: coexistenceObservations.map(serializeParentCoexistenceObservation),
      selectedStudentId,
      selectedStudent,
      spending: {
        day,
        week,
        month,
      },
      recentTopups: recentTopups.map((topup) => ({
        _id: topup._id,
        type: topup.type || 'recharge',
        amount: Number(topup.amount || 0),
        method: topup.method || 'cash',
        notes: String(topup.notes || '').trim(),
        createdAt: topup.createdAt,
        createdBy: topup.createdBy
          ? {
              _id: topup.createdBy._id,
              name: topup.createdBy.name || '',
              username: topup.createdBy.username || '',
              role: topup.createdBy.role || '',
            }
          : null,
        student: topup.studentId
          ? {
              _id: topup.studentId._id,
              name: topup.studentId.name || '',
              schoolCode: topup.studentId.schoolCode || '',
            }
          : null,
      })),
      recentOrders: recentOrders.map((order) => ({
        _id: order._id,
        total: Number(order.total || 0),
        paymentMethod: order.paymentMethod || 'system',
        createdAt: order.createdAt,
        items: Array.isArray(order.items)
          ? order.items.map((item) => ({
              name: item.nameSnapshot || 'Producto',
              quantity: Number(item.quantity || 0),
              unitPrice: Number(item.unitPriceSnapshot || 0),
              subtotal: Number(item.subtotal || 0),
            }))
          : [],
        itemsCount: Array.isArray(order.items)
          ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
          : 0,
        storeName: order.storeId?.name || 'Tienda',
      })),
      academicContent: academicContentCourses.map((course) => ({
        courseId: String(course._id),
        title: String(course.title || '').trim(),
        subject: String(course.subject || '').trim(),
        gradeKey: String(course.studentGradeKey || course.gradeLevel || '').trim(),
        section: String(course.section || '').trim(),
        periods: Array.isArray(course.academicContent) ? course.academicContent.map((period) => ({
          periodKey: String(period.periodKey || '').trim(),
          periodName: String(period.periodName || '').trim(),
          startDate: String(period.startDate || '').trim(),
          endDate: String(period.endDate || '').trim(),
          topics: Array.isArray(period.topics) ? period.topics.map((topic) => ({
            key: String(topic.key || '').trim(),
            title: String(topic.title || '').trim(),
            description: String(topic.description || '').trim(),
          })).filter((topic) => topic.title) : [],
        })) : [],
      })).filter((course) => course.periods.some((period) => period.topics.length > 0)),
      academicGrades,
      academicRanking,
      academicSchedule: {
        gradeKey: selectedStudentGrade,
        section: selectedStudentCourse,
        slots: academicStructureScheduleSlots,
        courses: (academicStructureScheduleCourses.length ? academicStructureScheduleCourses : academicContentCourses.map((course) => ({
          courseId: String(course._id),
          title: String(course.title || '').trim(),
          subject: String(course.subject || '').trim(),
          gradeKey: String(course.studentGradeKey || course.gradeLevel || '').trim(),
          section: String(course.section || '').trim(),
          classSessions: Array.isArray(course.classSessions) ? course.classSessions.map((session) => ({
            weekday: Number(session.weekday || 0),
            startTime: String(session.startTime || '').trim(),
            endTime: String(session.endTime || '').trim(),
            label: String(session.label || '').trim(),
          })).filter((session) => session.weekday >= 1 && session.weekday <= 5 && session.startTime && session.endTime) : [],
        })).filter((course) => course.classSessions.length > 0)),
      },
      parentAppFeatures,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/academic-feed', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    const feed = await AcademicCommunication.find({ schoolId, recipientParentIds: parentUserId })
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json(feed.map((item) => serializeAcademicFeedItem(item, parentUserId)));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/academic-feed/:communicationId/like', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const parentUserId = toObjectId(userId);
    const communicationId = toObjectId(req.params.communicationId);

    if (!parentUserId || !communicationId) {
      return res.status(400).json({ message: 'Invalid communication id' });
    }

    const query = { _id: communicationId, schoolId, recipientParentIds: parentUserId };
    const updatedCommunication = await AcademicCommunication.findOneAndUpdate(
      query,
      [
        {
          $set: {
            likes: buildToggledAcademicFeedLikesExpression('$likes', parentUserId, {
              userId: parentUserId,
              name: getActorName(req.user),
              createdAt: new Date(),
            }),
          },
        },
      ],
      { new: true }
    );
    if (!updatedCommunication) {
      return res.status(404).json({ message: 'Comunicado no encontrado.' });
    }

    return res.status(200).json(serializeAcademicFeedItem(updatedCommunication.toObject(), parentUserId));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/academic-feed/:communicationId/comments', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const parentUserId = toObjectId(userId);
    const body = String(req.body?.body || '').trim();

    if (!body) {
      return res.status(400).json({ message: 'Escribe un comentario.' });
    }

    const communication = await findParentAcademicCommunication({
      schoolId,
      communicationId: req.params.communicationId,
      parentUserId,
    });

    if (!communication) {
      return res.status(404).json({ message: 'Comunicado no encontrado.' });
    }

    communication.comments.push({
      userId: parentUserId,
      name: getActorName(req.user),
      body: body.slice(0, 800),
      likes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await communication.save();
    return res.status(201).json(serializeAcademicFeedItem(communication.toObject(), parentUserId));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/portal/academic-feed/:communicationId/comments/:commentId', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const parentUserId = toObjectId(userId);
    const communication = await findParentAcademicCommunication({
      schoolId,
      communicationId: req.params.communicationId,
      parentUserId,
    });

    if (!communication) {
      return res.status(404).json({ message: 'Comunicado no encontrado.' });
    }

    const comment = communication.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comentario no encontrado.' });
    }

    if (!sameObjectId(comment.userId, parentUserId)) {
      return res.status(403).json({ message: 'Solo puedes borrar tus comentarios.' });
    }

    comment.deleteOne();
    await communication.save();
    return res.status(200).json(serializeAcademicFeedItem(communication.toObject(), parentUserId));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/academic-feed/:communicationId/comments/:commentId/like', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const parentUserId = toObjectId(userId);
    const communicationId = toObjectId(req.params.communicationId);
    const commentId = toObjectId(req.params.commentId);

    if (!parentUserId || !communicationId || !commentId) {
      return res.status(400).json({ message: 'Invalid comment id' });
    }

    const query = {
      _id: communicationId,
      schoolId,
      recipientParentIds: parentUserId,
    };
    const nextCommentLike = { userId: parentUserId, name: getActorName(req.user), createdAt: new Date() };
    const updatedCommunication = await AcademicCommunication.findOneAndUpdate(
      { ...query, 'comments._id': commentId },
      [
        {
          $set: {
            comments: {
              $map: {
                input: { $ifNull: ['$comments', []] },
                as: 'comment',
                in: {
                  $cond: [
                    { $eq: ['$$comment._id', commentId] },
                    {
                      $mergeObjects: [
                        '$$comment',
                        {
                          likes: buildToggledAcademicFeedLikesExpression('$$comment.likes', parentUserId, nextCommentLike),
                        },
                      ],
                    },
                    '$$comment',
                  ],
                },
              },
            },
          },
        },
      ],
      { new: true }
    );
    if (!updatedCommunication) {
      return res.status(404).json({ message: 'Comunicado no encontrado.' });
    }

    return res.status(200).json(serializeAcademicFeedItem(updatedCommunication.toObject(), parentUserId));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/academic-calendar', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId || userId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.query.studentId);

    if (!parentUserId || !studentId) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    const linkedStudent = await ParentStudentLink.exists({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    });

    if (!linkedStudent && role !== 'admin') {
      return res.status(403).json({ message: 'Student does not belong to this parent' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null })
      .select('name grade course')
      .lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const { monthStart, monthEnd, monthKey } = getMonthRange(req.query.month);
    const grade = normalizeText(student.grade);
    const course = normalizeText(student.course);
    const courseCompact = course.replace(/\s+/g, '');
    const courseParts = course.split(':').map((part) => part.trim()).filter(Boolean);
    const gradeKeyFromCourse = courseParts.length >= 2 ? `${courseParts[0].toLowerCase()}:${courseParts[1]}` : '';
    const courseToken = courseParts.length >= 3 ? courseParts.slice(2).join(':') : '';
    const courseLabel = buildSectionLabelFromCourseToken(grade, courseToken);
    const section = grade && courseCompact.toLowerCase().startsWith(grade.replace(/\s+/g, '').toLowerCase())
      ? courseCompact.slice(grade.replace(/\s+/g, '').length)
      : '';
    const gradeValues = Array.from(new Set([grade, gradeKeyFromCourse].map((item) => normalizeText(item)).filter(Boolean)));
    const courseValues = Array.from(new Set([course, courseCompact, section, courseLabel].map((item) => normalizeText(item)).filter(Boolean)));
    const gradeCompact = grade.replace(/\s+/g, '');
    const courseTitleValues = Array.from(new Set([
      course.includes(':') ? '' : course,
      course.includes(':') ? '' : courseCompact,
      section && gradeCompact ? `${gradeCompact}${section}` : '',
      courseLabel,
    ].map((item) => normalizeText(item)).filter((item) => item.length > 1)));
    const courseTitleMatchers = courseTitleValues.map((value) => buildFlexibleCompactRegExp(value)).filter(Boolean);
    const courseQuery = {
      schoolId,
      status: 'active',
      ...(gradeValues.length ? { studentGradeKey: { $in: gradeValues } } : {}),
      ...(courseValues.length || courseTitleMatchers.length ? {
        $or: [
          ...(courseValues.length ? [{ section: { $in: courseValues } }] : []),
          ...courseTitleMatchers.map((matcher) => ({ title: matcher })),
        ],
      } : {}),
    };

    const courses = await CampusCourse.find(courseQuery)
      .select('title subject section studentGradeKey')
      .lean();
    const courseIds = courses.map((item) => item._id).filter(Boolean);
    const assignmentQuery = {
      schoolId,
      status: 'published',
      scheduledAt: { $gte: monthStart, $lt: monthEnd },
      $or: [
        { scope: 'all_school' },
        ...(gradeValues.length ? [{ scope: 'grades', targetGradeKeys: { $in: gradeValues } }] : []),
      ],
    };

    if (!courseIds.length) {
      const assignments = await AcademicCalendarAssignment.find(assignmentQuery)
        .sort({ scheduledAt: 1, createdAt: 1 })
        .lean();

      return res.status(200).json({
        student: { _id: student._id, name: student.name, grade: student.grade, course: student.course },
        month: monthKey,
        items: assignments.map(serializeParentAcademicCalendarAssignment).filter((item) => item.id && item.date),
      });
    }

    const [posts, assignments] = await Promise.all([
      CampusPost.find({
        schoolId,
        courseId: { $in: courseIds },
        status: 'published',
        $or: [
          { dueAt: { $gte: monthStart, $lt: monthEnd } },
          { scheduledClassDate: { $gte: monthStart, $lt: monthEnd } },
          { dueAt: null, scheduledClassDate: null, publishedAt: { $gte: monthStart, $lt: monthEnd } },
        ],
      })
        .populate('courseId', 'title subject section studentGradeKey')
        .sort({ dueAt: 1, scheduledClassDate: 1, publishedAt: 1, createdAt: 1 })
        .lean(),
      AcademicCalendarAssignment.find(assignmentQuery)
        .sort({ scheduledAt: 1, createdAt: 1 })
        .lean(),
    ]);

    return res.status(200).json({
      student: { _id: student._id, name: student.name, grade: student.grade, course: student.course },
      month: monthKey,
      items: [
        ...posts.map(serializeParentAcademicCalendarPost),
        ...assignments.map(serializeParentAcademicCalendarAssignment),
      ].filter((item) => item.id && item.date).sort((left, right) => new Date(left.date) - new Date(right.date)),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/academic-attendance', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId || userId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.query.studentId);

    if (!parentUserId || !studentId) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    const linkedStudent = await ParentStudentLink.exists({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    });

    if (!linkedStudent && role !== 'admin') {
      return res.status(403).json({ message: 'Student does not belong to this parent' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null })
      .select('name grade course')
      .lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const statusLabels = {
      present: 'Presente',
      late: 'Llegada tarde',
      absent: 'Ausente',
      excused: 'Excusado',
    };
    const typeLabels = {
      guidance_routine: 'Llegada al colegio',
      subject_class: 'Asistencia a clase',
    };

    const serializeAttendanceRecord = (session) => {
      const record = (Array.isArray(session.records) ? session.records : [])
        .find((item) => String(item.studentId || '') === String(studentId));
      const status = ['present', 'late', 'absent', 'excused'].includes(String(record?.status || '')) ? String(record.status) : 'present';
      const date = normalizeText(session.date);
      return {
        id: String(session._id),
        date,
        dateLabel: date,
        attendanceType: normalizeText(session.attendanceType),
        attendanceTypeLabel: typeLabels[normalizeText(session.attendanceType)] || 'Asistencia',
        courseTitle: normalizeText(session.courseTitleSnapshot),
        subject: normalizeText(session.subjectSnapshot),
        status,
        statusLabel: statusLabels[status],
        note: normalizeText(record?.notes),
        classSessionKey: normalizeText(session.classSessionKey),
        recordedAt: record?.recordedAt || null,
        submittedAt: session.submittedAt || null,
      };
    };

    const requestedAttendanceType = normalizeText(req.query.attendanceType);
    if (requestedAttendanceType === 'guidance_routine') {
      const requestedPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(10, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
      const query = { schoolId, attendanceType: 'guidance_routine', 'records.studentId': studentId };
      const totalRecords = await CampusAttendanceSession.countDocuments(query);
      const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const sessions = await CampusAttendanceSession.find(query)
        .sort({ date: -1, updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean();

      return res.status(200).json({
        student: { _id: student._id, name: student.name, grade: student.grade, course: student.course },
        records: sessions.map(serializeAttendanceRecord),
        pagination: {
          page,
          pageSize,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      });
    }

    const sessions = await CampusAttendanceSession.find({
      schoolId,
      'records.studentId': studentId,
    })
      .sort({ date: -1, updatedAt: -1 })
      .limit(60)
      .lean();

    const buildAttendanceSummary = (items = []) => {
      const grouped = (Array.isArray(items) ? items : []).reduce((accumulator, item) => {
        accumulator[item.status] = Number(accumulator[item.status] || 0) + 1;
        return accumulator;
      }, { present: 0, late: 0, absent: 0, excused: 0 });
      const totalItems = Number(items.length || 0);

      return {
        total: totalItems,
        present: grouped.present || 0,
        late: grouped.late || 0,
        absent: grouped.absent || 0,
        excused: grouped.excused || 0,
        unexcusedAbsences: grouped.absent || 0,
        excusedAbsences: grouped.excused || 0,
        lateCount: grouped.late || 0,
        attendanceRate: totalItems > 0 ? `${Math.round((Number(grouped.present || 0) / totalItems) * 100)}%` : 'Sin datos',
      };
    };

    const records = sessions.map(serializeAttendanceRecord);

    const guidanceRoutineRecords = records.filter((record) => record.attendanceType === 'guidance_routine');
    const subjectClassRecords = records.filter((record) => record.attendanceType === 'subject_class');
    const subjectGroupsMap = new Map();

    subjectClassRecords.forEach((record) => {
      const groupKey = normalizeText(record.subject) || normalizeText(record.courseTitle) || 'clase';
      const existingGroup = subjectGroupsMap.get(groupKey) || {
        key: groupKey,
        subject: normalizeText(record.subject),
        courseTitle: normalizeText(record.courseTitle),
        records: [],
      };

      existingGroup.records.push(record);
      if (!existingGroup.subject && record.subject) {
        existingGroup.subject = normalizeText(record.subject);
      }
      if (!existingGroup.courseTitle && record.courseTitle) {
        existingGroup.courseTitle = normalizeText(record.courseTitle);
      }
      subjectGroupsMap.set(groupKey, existingGroup);
    });

    const subjectGroups = Array.from(subjectGroupsMap.values())
      .map((group) => ({
        ...group,
        summary: buildAttendanceSummary(group.records),
      }))
      .sort((left, right) => String(left.subject || left.courseTitle || '').localeCompare(String(right.subject || right.courseTitle || ''), 'es', { sensitivity: 'base' }));

    const overallSummary = buildAttendanceSummary(records);

    return res.status(200).json({
      student: { _id: student._id, name: student.name, grade: student.grade, course: student.course },
      summary: overallSummary,
      records,
      guidanceRoutine: {
        summary: buildAttendanceSummary(guidanceRoutineRecords),
        records: [],
      },
      classAttendance: {
        summary: buildAttendanceSummary(subjectClassRecords),
        records: subjectClassRecords,
        subjects: subjectGroups,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/academic-billing', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    const links = await ParentStudentLink.find({
      schoolId,
      parentId: parentUserId,
      status: 'active',
    }).select('studentId').lean();
    const linkedStudentIds = links.map((link) => toObjectId(link.studentId)).filter(Boolean);

    if (!linkedStudentIds.length) {
      return res.status(200).json({
        summary: { pendingAmount: 0, pendingCount: 0 },
        currentCharges: [],
        studentSummaries: [],
        charges: [],
        payments: [],
        paymentHistory: [],
      });
    }

    const {
      ensureConsolidatedMonthlyCharge,
      serializeConsolidatedChargeForParent,
    } = require('../services/academicConsolidatedBilling.service');

    const now = new Date();
    let [billingProfiles, feeConfiguration, academicStructure] = await Promise.all([
      StudentBillingProfile.find({ schoolId, active: true, studentId: { $in: linkedStudentIds } }).lean(),
      AcademicFeeConfiguration.findOne({ schoolId }).lean(),
      AcademicStructure.findOne({ schoolId }).lean(),
    ]);

    const academicGrades = (Array.isArray(academicStructure?.grades) ? academicStructure.grades : [])
      .filter((grade) => normalizeText(grade?.status || 'active') !== 'archived')
      .map((grade) => ({ key: normalizeText(grade.key), levelKey: normalizeText(grade.levelKey) }));

    for (const profile of billingProfiles) {
      await ensureConsolidatedMonthlyCharge({
        schoolId,
        studentId: profile.studentId,
        billingProfile: profile,
        feeConfiguration,
        academicGrades,
        createdByUserId: parentUserId,
        createdByRole: role,
        parentId: parentUserId,
        referenceDate: now,
        sendNotification: false,
      });
    }

    const [statementCharges, payments] = await Promise.all([
      AcademicCharge.find({ schoolId, studentId: { $in: linkedStudentIds }, category: 'monthly_statement' })
        .populate('studentId', 'name grade course')
        .sort({ dueDate: -1, createdAt: -1 })
        .lean(),
      AcademicChargePayment.find({ schoolId, studentId: { $in: linkedStudentIds } })
        .populate('studentId', 'name grade course')
        .populate('chargeId', 'concept monthKey category amount')
        .sort({ paidAt: -1, createdAt: -1 })
        .limit(40)
        .lean(),
    ]);

    const chargePayments = statementCharges.length > 0
      ? await AcademicChargePayment.find({ schoolId, chargeId: { $in: statementCharges.map((charge) => charge._id) } }).select('chargeId amount').lean()
      : [];
    const paymentTotalsByChargeId = new Map();
    chargePayments.forEach((payment) => {
      const chargeKey = String(payment.chargeId || '').trim();
      if (!chargeKey) return;
      paymentTotalsByChargeId.set(chargeKey, Number(paymentTotalsByChargeId.get(chargeKey) || 0) + Number(payment.amount || 0));
    });

    const billingProfileMap = new Map(billingProfiles.map((profile) => [String(profile._id), profile]));
    const normalizedCharges = statementCharges.map((charge) => serializeConsolidatedChargeForParent(
      charge,
      billingProfileMap.get(String(charge.billingProfileId || '')) || null,
      paymentTotalsByChargeId,
      now,
    ));

    const currentCharges = normalizedCharges
      .filter((charge) => ['pending', 'overdue'].includes(String(charge.status || '').toLowerCase()))
      .sort((left, right) => new Date(left.dueDate || 0) - new Date(right.dueDate || 0));

    const paymentHistory = normalizedCharges
      .filter((charge) => String(charge.status) === 'paid')
      .map((charge) => ({
        _id: charge._id,
        concept: charge.concept,
        amount: Number(charge.chargeAmount || charge.paidAmount || charge.amount || 0),
        paidAt: charge.paidAt,
        monthKey: charge.monthKey,
        studentName: charge.studentName,
        studentId: charge.studentId?._id || charge.studentId,
        breakdownItems: charge.breakdownItems || [],
      }));

    const studentSummaries = buildParentAcademicBillingSummaryByStudent({ charges: normalizedCharges, referenceDate: now });

    return res.status(200).json({
      summary: {
        pendingAmount: studentSummaries.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        pendingCount: studentSummaries.reduce((sum, item) => sum + Number(item.pendingCount || 0), 0),
      },
      currentCharges,
      studentSummaries,
      charges: currentCharges,
      payments: payments.map((payment) => ({
        ...payment,
        studentName: payment.studentId?.name || 'Familia',
        concept: payment.chargeId?.concept || payment.concept || 'Pago académico',
      })),
      paymentHistory,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/academic-billing/charges/:chargeId/pay', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body?.parentUserId || userId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const chargeId = toObjectId(req.params.chargeId);

    if (!parentUserId || !chargeId) {
      return res.status(400).json({ message: 'Invalid charge id' });
    }

    const charge = await AcademicCharge.findOne({
      _id: chargeId,
      schoolId,
      status: { $in: ['pending', 'overdue'] },
    });

    if (!charge) {
      return res.status(404).json({ message: 'Charge not found or already paid' });
    }

    const linkedChargeStudent = await ParentStudentLink.exists({
      schoolId,
      parentId: parentUserId,
      studentId: charge.studentId,
      status: 'active',
    });

    if (!linkedChargeStudent) {
      return res.status(403).json({ message: 'Charge does not belong to a linked student' });
    }

    const studentOpenCharges = await AcademicCharge.find({
      schoolId,
      studentId: charge.studentId,
      category: 'monthly_statement',
      status: { $in: ['pending', 'overdue'] },
    })
      .populate('studentId', 'name')
      .lean();
    const overdueMonths = getAcademicChargeMonthsOverdue(studentOpenCharges, new Date());
    if (overdueMonths >= 3) {
      const amount = studentOpenCharges.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const studentName = normalizeText(studentOpenCharges[0]?.studentId?.name) || 'Estudiante';
      return res.status(409).json({
        message: 'Debes comunicarte con DataSchool para normalizar esta cartera.',
        requiresDataSchoolContact: true,
        dataSchoolWhatsappUrl: buildDataSchoolWhatsappUrl({ studentName, amount, overdueMonths }),
      });
    }

    const billingProfile = charge.billingProfileId
      ? await StudentBillingProfile.findOne({ _id: charge.billingProfileId, schoolId }).lean()
      : null;
    const pricing = resolveAcademicChargeAmounts(charge, billingProfile, new Date());
    const previousPayments = await AcademicChargePayment.find({ schoolId, chargeId: charge._id }).select('amount').lean();
    const previousPaidAmount = previousPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const outstandingAmount = Math.max(0, pricing.effectiveAmount - previousPaidAmount);
    if (outstandingAmount <= 0) {
      charge.status = 'paid';
      charge.paidAt = charge.paidAt || new Date();
      await charge.save();
      return res.status(409).json({ message: 'Este cobro ya fue pagado.' });
    }

    const payment = await AcademicChargePayment.create({
      schoolId,
      chargeId: charge._id,
      studentId: charge.studentId || null,
      parentId: parentUserId,
      recordedByUserId: userId,
      recordedByRole: role,
      amount: outstandingAmount,
      method: normalizeText(req.body?.method) || 'parent_portal',
      notes: normalizeText(req.body?.notes),
      paidAt: new Date(),
    });

    charge.status = 'paid';
    charge.paidAt = payment.paidAt;
    charge.paymentMethod = payment.method;
    await charge.save();

    queueNotificationsForParents({
      schoolId,
      parentIds: [parentUserId],
      studentId: charge.studentId,
      title: 'Pago academico registrado',
      body: `Recibimos tu pago de $${formatAcademicCurrency(payment.amount)} por ${normalizeText(charge.concept) || 'un cobro academico'}.`,
      payload: {
        type: 'academic.billing.payment_registered',
        chargeId: String(charge._id),
        paymentId: String(payment._id),
        amount: payment.amount,
        url: '/parent/pagos',
      },
    }).catch((error) => console.warn(`[ACADEMIC_PAYMENT_NOTIFY_WARNING] payment=${payment._id} error=${error.message}`));

    return res.status(200).json({ message: 'Pago registrado con exito.', payment });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/categories', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const cacheKey = `${schoolId}:parent-categories`;
    const cachedPayload = await getMenuCache(cacheKey);
    if (cachedPayload) {
      res.setHeader('X-Menu-Cache', 'HIT');
      return res.status(200).json(cachedPayload);
    }

    const categories = await Category.find({
      schoolId,
      deletedAt: null,
      status: 'active',
    })
      .select('_id name imageUrl thumbUrl')
      .sort({ name: 1 })
      .lean();

    const normalizedCategories = categories.map((category) => ({
      _id: category._id,
      name: category.name || 'Sin nombre',
      imageUrl: normalizeStoredImageUrl(category.imageUrl),
      thumbUrl: normalizeStoredImageUrl(category.thumbUrl) || deriveThumbUrlFromImageUrl(category.imageUrl),
    }));

    await setMenuCache(cacheKey, normalizedCategories, DEFAULT_TTL_SECONDS);
    res.setHeader('X-Menu-Cache', 'MISS');
    return res.status(200).json(normalizedCategories);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/orders-history', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.query.studentId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const links = await ParentStudentLink.find({
      schoolId,
      parentId: parentUserId,
      status: 'active',
    })
      .select('studentId')
      .lean();

    const allowedStudentIds = links.map((link) => String(link.studentId));
    if (!allowedStudentIds.includes(String(studentId))) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const filter = {
      schoolId,
      studentId,
      status: 'completed',
    };

    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();

    if (from || to) {
      filter.createdAt = {};

      if (from) {
        const fromDate = new Date(from);
        if (Number.isNaN(fromDate.getTime())) {
          return res.status(400).json({ message: 'Invalid from date' });
        }
        fromDate.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = fromDate;
      }

      if (to) {
        const toDate = new Date(to);
        if (Number.isNaN(toDate.getTime())) {
          return res.status(400).json({ message: 'Invalid to date' });
        }
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    const orders = await Order.find(filter)
      .populate('storeId', 'name')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.status(200).json({
      studentId: String(studentId),
      orders: orders.map((order) => ({
        _id: order._id,
        total: Number(order.total || 0),
        status: order.status || 'completed',
        paymentMethod: order.paymentMethod || 'system',
        createdAt: order.createdAt,
        items: Array.isArray(order.items)
          ? order.items.map((item) => ({
              name: item.nameSnapshot || 'Producto',
              quantity: Number(item.quantity || 0),
              unitPrice: Number(item.unitPriceSnapshot || 0),
              subtotal: Number(item.subtotal || 0),
            }))
          : [],
        itemsCount: Array.isArray(order.items)
          ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
          : 0,
        storeName: order.storeId?.name || 'Tienda',
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/meriendas', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.query.studentId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const link = await ParentStudentLink.findOne({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    }).lean();

    if (!link) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const month = String(req.query.month || currentYearMonth()).trim();

    const [subscription, operation, schedule] = await Promise.all([
      MeriendaSubscription.findOne({ schoolId, parentUserId, childName: String(student.name || '').trim() })
        .sort({ createdAt: -1 })
        .lean(),
      MeriendaOperation.findOne({ schoolId, month }).lean(),
      MeriendaSchedule.findOne({ schoolId, month })
        .populate('days.firstSnackId', 'title type imageUrl description')
        .populate('days.secondSnackId', 'title type imageUrl description')
        .lean(),
    ]);

    let latestOperatorComment = null;
    if (subscription?._id) {
      const latestRecord = await MeriendaIntakeRecord.findOne({ schoolId, subscriptionId: subscription._id })
        .sort({ date: -1, updatedAt: -1 })
        .lean();

      if (latestRecord && String(latestRecord.observations || '').trim()) {
        latestOperatorComment = {
          text: String(latestRecord.observations || '').trim(),
          date: latestRecord.date || '',
          handledByName: latestRecord.handledByName || '',
        };
      }
    }

    return res.status(200).json({
      month,
      student: {
        _id: student._id,
        name: student.name || '',
        grade: student.grade || '',
        schoolCode: student.schoolCode || '',
      },
      subscriptionCost: Number(operation?.subscriptionMonthlyCost || 0),
      schedule: {
        month,
        days: Array.isArray(schedule?.days)
          ? schedule.days
              .slice()
              .sort((a, b) => Number(a.day || 0) - Number(b.day || 0))
              .map((item) => ({
                day: Number(item.day || 0),
                firstSnack: item.firstSnackId
                  ? {
                      _id: item.firstSnackId._id,
                      title: item.firstSnackId.title || '',
                      type: item.firstSnackId.type || '',
                      imageUrl: normalizeStoredImageUrl(item.firstSnackId.imageUrl),
                      thumbUrl: deriveThumbUrlFromImageUrl(item.firstSnackId.imageUrl),
                      description: item.firstSnackId.description || '',
                    }
                  : null,
                secondSnack: item.secondSnackId
                  ? {
                      _id: item.secondSnackId._id,
                      title: item.secondSnackId.title || '',
                      type: item.secondSnackId.type || '',
                      imageUrl: normalizeStoredImageUrl(item.secondSnackId.imageUrl),
                      thumbUrl: deriveThumbUrlFromImageUrl(item.secondSnackId.imageUrl),
                      description: item.secondSnackId.description || '',
                    }
                  : null,
              }))
          : [],
      },
      subscription: subscription
        ? {
            _id: subscription._id,
            active: Boolean(subscription.status === 'active' && subscription.paymentStatus),
            paymentStatus: Boolean(subscription.paymentStatus),
            currentPeriodMonth: subscription.currentPeriodMonth || '',
            childFoodRestrictions: subscription.childAllergies || '',
            childFoodRestrictionReason: normalizeFoodRestrictionReason(subscription.childFoodRestrictionReason),
            parentComments: subscription.parentRecommendations || '',
            operatorComments: latestOperatorComment,
          }
        : {
            _id: null,
            active: false,
            paymentStatus: false,
            currentPeriodMonth: '',
            childFoodRestrictions: '',
            childFoodRestrictionReason: '',
            parentComments: '',
            operatorComments: null,
          },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/meriendas/subscribe', async (req, res) => {
  try {
    const { schoolId, role, userId, name, username } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.body.studentId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const link = await ParentStudentLink.findOne({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    }).lean();

    if (!link) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const targetMonth = String(req.body.targetMonth || currentYearMonth()).trim();
    const childFoodRestrictions = String(req.body.childFoodRestrictions || '').trim();
    const childFoodRestrictionReason = normalizeFoodRestrictionReason(req.body.childFoodRestrictionReason);

    const subscription = await MeriendaSubscription.findOneAndUpdate(
      { schoolId, parentUserId, childName: String(student.name || '').trim() },
      {
        schoolId,
        parentUserId,
        parentName: String(name || '').trim(),
        parentUsername: String(username || '').trim(),
        childName: String(student.name || '').trim(),
        childGrade: String(student.grade || '').trim(),
        childDocument: String(student.schoolCode || '').trim(),
        childAllergies: childFoodRestrictions,
        childFoodRestrictionReason,
        paymentStatus: true,
        currentPeriodMonth: targetMonth,
        status: 'active',
        startedAt: new Date(),
        endedAt: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      subscription: {
        _id: subscription._id,
        active: Boolean(subscription.status === 'active' && subscription.paymentStatus),
        paymentStatus: Boolean(subscription.paymentStatus),
        currentPeriodMonth: subscription.currentPeriodMonth || '',
        childFoodRestrictions: subscription.childAllergies || '',
        childFoodRestrictionReason: normalizeFoodRestrictionReason(subscription.childFoodRestrictionReason),
        parentComments: subscription.parentRecommendations || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/portal/meriendas/subscription/:id', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const subscriptionId = toObjectId(req.params.id);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!subscriptionId) {
      return res.status(400).json({ message: 'Invalid subscription id' });
    }

    const subscription = await MeriendaSubscription.findOne({
      _id: subscriptionId,
      schoolId,
      parentUserId,
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'childFoodRestrictions')) {
      subscription.childAllergies = String(req.body.childFoodRestrictions || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'childFoodRestrictionReason')) {
      subscription.childFoodRestrictionReason = normalizeFoodRestrictionReason(req.body.childFoodRestrictionReason);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'parentComments')) {
      subscription.parentRecommendations = String(req.body.parentComments || '').trim();
    }

    await subscription.save();

    return res.status(200).json({
      subscription: {
        _id: subscription._id,
        active: Boolean(subscription.status === 'active' && subscription.paymentStatus),
        paymentStatus: Boolean(subscription.paymentStatus),
        currentPeriodMonth: subscription.currentPeriodMonth || '',
        childFoodRestrictions: subscription.childAllergies || '',
        childFoodRestrictionReason: normalizeFoodRestrictionReason(subscription.childFoodRestrictionReason),
        parentComments: subscription.parentRecommendations || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/portal/meriendas/subscription/:id', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const subscriptionId = toObjectId(req.params.id);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!subscriptionId) {
      return res.status(400).json({ message: 'Invalid subscription id' });
    }

    const subscription = await MeriendaSubscription.findOne({
      _id: subscriptionId,
      schoolId,
      parentUserId,
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    subscription.status = 'inactive';
    subscription.paymentStatus = false;
    subscription.endedAt = new Date();
    await subscription.save();

    return res.status(200).json({
      subscription: {
        _id: subscription._id,
        active: false,
        paymentStatus: false,
        currentPeriodMonth: subscription.currentPeriodMonth || '',
        childFoodRestrictions: subscription.childAllergies || '',
        childFoodRestrictionReason: normalizeFoodRestrictionReason(subscription.childFoodRestrictionReason),
        parentComments: subscription.parentRecommendations || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/payment-methods/cards', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    const cards = await ParentPaymentMethod.find({
      schoolId,
      parentUserId,
      type: 'card',
      status: 'active',
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      cards: cards.map((card) => serializeCard(card)),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/payment-methods/cards', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    const parentUser = await User.findOne({ _id: parentUserId, schoolId, role: 'parent', deletedAt: null })
      .select('_id name email username')
      .lean();
    if (!parentUser) {
      return res.status(404).json({ message: 'Parent user not found' });
    }

    const incomingCardToken = String(req.body?.cardToken || '').trim();
    const requestedProvider = String(req.body?.provider || '').trim().toLowerCase();
    const incomingCardLast4 = String(req.body?.cardLast4 || '').trim();
    const incomingCardBrand = String(req.body?.cardBrand || '').trim().toLowerCase();
    const incomingCardExpMonth = Number(req.body?.cardExpMonth);
    const incomingCardExpYear = Number(req.body?.cardExpYear);
    const incomingDeviceId = String(req.body?.deviceId || '').trim();
    const cardNumber = String(req.body?.cardNumber || '').replace(/\D/g, '');
    const expiry = parseExpiry(req.body?.cardExpiry);
    const cvv = String(req.body?.cardCvv || '').replace(/\D/g, '');
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const docType = String(req.body?.documentType || '').trim().toUpperCase();
    const document = String(req.body?.documentNumber || '').replace(/\D/g, '');

    if (firstName.length < 2 || lastName.length < 2) {
      return res.status(400).json({ message: 'Card holder firstName and lastName are required' });
    }
    if (!['CC', 'TI', 'CE', 'NIT', 'PP'].includes(docType)) {
      return res.status(400).json({ message: 'Invalid documentType' });
    }
    if (document.length < 5) {
      return res.status(400).json({ message: 'documentNumber is required' });
    }

    if (!incomingCardToken) {
      if (cardNumber.length < 13 || cardNumber.length > 19) {
        return res.status(400).json({ message: 'cardNumber must contain 13 to 19 digits' });
      }
      if (!expiry) {
        return res.status(400).json({ message: 'cardExpiry must have MM/YY format' });
      }
      if (cvv.length < 3 || cvv.length > 4) {
        return res.status(400).json({ message: 'cardCvv must contain 3 or 4 digits' });
      }
    }

    const fallbackBrand = cardNumber ? detectCardBrand(cardNumber) : 'unknown';
    const fallbackLast4 = cardNumber ? cardNumber.slice(-4) : '0000';

    if (requestedProvider === 'bold') {
      return res.status(400).json({
        message: 'Bold solo esta habilitado para recargas manuales. Para tarjetas y debito automatico usa ePayco.',
      });
    }

    if (!isEpaycoConfigured()) {
      return res.status(503).json({
        message: 'ePayco no está configurado en el backend. Configura EPAYCO_PUBLIC_KEY y EPAYCO_PRIVATE_KEY para registrar tarjetas.',
      });
    }

    const parentEmail = String(parentUser?.email || '').trim().toLowerCase() || `${String(parentUserId)}@comergio.local`;

    let paymentMethod;

    // ── ePayco ─────────────────────────────────────────────────────────────
    if (true) {
      // 1. Tokenize the card (with CVV) to get a one-time token
      const rawCardToken = incomingCardToken || null;
      let tokenResultData = null;
      let oneTimeToken;
      if (rawCardToken) {
        oneTimeToken = rawCardToken;
      } else {
        const tokenResult = await createEpaycoCardToken({
          cardNumber,
          expirationMonth: expiry.month,
          expirationYear: expiry.year,
          securityCode: cvv,
        });
        tokenResultData = tokenResult || null;
        oneTimeToken = String(
          tokenResult?.id
          || tokenResult?.token
          || tokenResult?.cardToken
          || tokenResult?.token_card
          || tokenResult?.card_token
          || ''
        ).trim();
      }

      if (!oneTimeToken) {
        return res.status(400).json({ message: 'No se pudo tokenizar la tarjeta en ePayco.' });
      }

      const existingEpaycoCard = await ParentPaymentMethod.findOne({
        schoolId,
        parentUserId,
        provider: 'epayco',
        deletedAt: null,
        providerCustomerId: { $exists: true, $nin: ['', null] },
      })
        .select('providerCustomerId')
        .lean();

      const existingEpaycoCustomerId = String(existingEpaycoCard?.providerCustomerId || '').trim() || null;

      const resolvedBrand = String(
        incomingCardBrand
        || tokenResultData?.franchise
        || tokenResultData?.brand
        || fallbackBrand
        || 'unknown'
      ).trim();

      const resolvedLast4 = String(
        incomingCardLast4
        || tokenResultData?.last4
        || tokenResultData?.lastFour
        || tokenResultData?.last_digits
        || fallbackLast4
      ).trim();

      const inferredMask = cardNumber
        ? `${cardNumber.slice(0, 6)}******${cardNumber.slice(-4)}`
        : (resolvedLast4 ? `******${resolvedLast4}` : '');

      const resolvedMask = String(tokenResultData?.mask || tokenResultData?.cardMask || inferredMask).trim();
      const resolvedFranchise = String(
        tokenResultData?.franchise
        || tokenResultData?.cardFranchise
        || toEpaycoFranchise(resolvedBrand)
      ).trim();

      // 2. Save customer / save card → get permanent customerId + saved card token
      const customerResult = await createEpaycoCustomer({
        tokenCard: oneTimeToken,
        email: parentEmail,
        firstName,
        lastName,
        docType,
        docNumber: document,
        existingCustomerId: existingEpaycoCustomerId,
        franchise: resolvedFranchise,
        mask: resolvedMask,
      });

      const epaycoCustomerId = String(customerResult?.customerId || customerResult?.customer_id || customerResult?.id || '').trim();
      // The permanent card token returned by ePayco after saving the customer
      const epaycoCardToken = String(
        customerResult?.token
        || customerResult?.token_card
        || customerResult?.cardToken
        || customerResult?.card_token
        || oneTimeToken
      ).trim();

      if (!epaycoCustomerId) {
        return res.status(502).json({ message: 'No fue posible guardar la tarjeta en ePayco.' });
      }

      const existingProviderCard = await ParentPaymentMethod.findOne({
        schoolId,
        parentUserId,
        provider: 'epayco',
        providerCustomerId: epaycoCustomerId,
        deletedAt: null,
      })
        .select('_id')
        .lean();

      if (existingProviderCard) {
        return res.status(409).json({ message: 'Esta tarjeta ya se encuentra registrada.' });
      }

      const fingerprint = crypto
        .createHash('sha256')
        .update(`${schoolId}|${String(parentUserId)}|epayco|${epaycoCustomerId}`)
        .digest('hex');

      paymentMethod = await ParentPaymentMethod.create({
        schoolId,
        parentUserId,
        type: 'card',
        provider: 'epayco',
        token: `ep_${crypto.randomBytes(12).toString('hex')}`,
        providerCustomerId: epaycoCustomerId,
        providerCardId: epaycoCardToken,          // permanent token for future charges
        providerPaymentMethodId: '',
        providerDeviceId: incomingDeviceId,
        fingerprint,
        brand: incomingCardBrand || fallbackBrand || 'unknown',
        last4: incomingCardLast4 || fallbackLast4,
        expMonth: incomingCardExpMonth || expiry?.month || 1,
        expYear: incomingCardExpYear || expiry?.year || 2099,
        holderFirstName: firstName,
        holderLastName: lastName,
        holderDocType: docType,
        holderDocument: document,
        verificationStatus: 'verified',
        verificationAmount: null,
        verificationAttemptCount: 0,
        verificationLastRequestedAt: null,
        verificationExpiresAt: null,
        verifiedAt: new Date(),
      });

    // ── Internal fallback (controlled environments only) ───────────────────
    } else {
      const allowInternalFallback = String(process.env.ALLOW_INTERNAL_CARD_FALLBACK || '').toLowerCase() === 'true';
      if (!allowInternalFallback) {
        return res.status(503).json({
          message: 'Registro manual de tarjetas deshabilitado. Configura ePayco para continuar.',
        });
      }

      const fingerprint = crypto
        .createHash('sha256')
        .update(`${schoolId}|${String(parentUserId)}|${cardNumber}|${expiry.month}|${expiry.year}|${docType}|${document}`)
        .digest('hex');

      const existing = await ParentPaymentMethod.findOne({
        schoolId,
        parentUserId,
        fingerprint,
        deletedAt: null,
      })
        .select('_id')
        .lean();

      if (existing) {
        return res.status(409).json({ message: 'Esta tarjeta ya se encuentra registrada.' });
      }

      paymentMethod = await ParentPaymentMethod.create({
        schoolId,
        parentUserId,
        type: 'card',
        provider: 'internal',
        token: `pm_${crypto.randomBytes(18).toString('hex')}`,
        fingerprint,
        brand: fallbackBrand,
        last4: fallbackLast4,
        expMonth: expiry.month,
        expYear: expiry.year,
        holderFirstName: firstName,
        holderLastName: lastName,
        holderDocType: docType,
        holderDocument: document,
        verificationStatus: 'pending',
        verificationAmount: buildCardVerificationChallenge(),
        verificationAttemptCount: 0,
        verificationLastRequestedAt: new Date(),
        verificationExpiresAt: getCardVerificationExpirationDate(),
      });
    }

    return res.status(201).json({
      paymentMethod: {
        ...serializeCard(paymentMethod),
        type: paymentMethod.type,
        provider: paymentMethod.provider,
      },
      verificationRequired: paymentMethod.verificationStatus !== 'verified',
      verificationWindowHours: CARD_VERIFICATION_WINDOW_HOURS,
    });
  } catch (error) {
    if (error?.code === 'EPAYCO_INVALID_CLIENT') {
      return res.status(502).json({
        message: error.message,
        code: 'EPAYCO_INVALID_CLIENT',
      });
    }

    if (error?.code === 'EPAYCO_CUSTOMER_ID_REQUIRED') {
      return res.status(502).json({
        message: error.message,
        code: 'EPAYCO_CUSTOMER_ID_REQUIRED',
        providerPath: error.providerPath || null,
        providerStatus: Number.isFinite(error?.status) ? error.status : null,
        providerPayload: error.providerPayload || null,
      });
    }

    if (error?.providerPayload || error?.providerPath) {
      return res.status(502).json({
        message: error.message || 'Error de ePayco al registrar la tarjeta.',
        code: 'EPAYCO_REQUEST_FAILED',
        providerPath: error.providerPath || null,
        providerStatus: Number.isFinite(error?.status) ? error.status : null,
        providerPayload: error.providerPayload || null,
      });
    }

    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Esta tarjeta ya se encuentra registrada.' });
    }
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/payment-methods/cards/:cardId/verification/request', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const cardId = toObjectId(req.params.cardId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!cardId) {
      return res.status(400).json({ message: 'Invalid card id' });
    }

    const card = await ParentPaymentMethod.findOne({
      _id: cardId,
      schoolId,
      parentUserId,
      type: 'card',
      status: 'active',
      deletedAt: null,
    });

    if (!card) {
      return res.status(404).json({ message: 'Tarjeta no encontrada.' });
    }

    if (card.verificationStatus === 'verified') {
      return res.status(200).json({
        card: serializeCard(card),
        verificationRequired: false,
      });
    }

    card.verificationStatus = 'pending';
    card.verificationAmount = buildCardVerificationChallenge();
    card.verificationAttemptCount = 0;
    card.verificationLastRequestedAt = new Date();
    card.verificationExpiresAt = getCardVerificationExpirationDate();
    card.verifiedAt = null;
    await card.save();

    return res.status(200).json({
      card: serializeCard(card),
      verificationRequired: true,
      verificationWindowHours: CARD_VERIFICATION_WINDOW_HOURS,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/payment-methods/cards/:cardId/verification/confirm', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const cardId = toObjectId(req.params.cardId);
    const amount = Number(req.body?.amount);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!cardId) {
      return res.status(400).json({ message: 'Invalid card id' });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'El monto de verificación no es válido.' });
    }

    const card = await ParentPaymentMethod.findOne({
      _id: cardId,
      schoolId,
      parentUserId,
      type: 'card',
      status: 'active',
      deletedAt: null,
    });

    if (!card) {
      return res.status(404).json({ message: 'Tarjeta no encontrada.' });
    }

    if (card.verificationStatus === 'verified') {
      return res.status(200).json({
        verified: true,
        card: serializeCard(card),
      });
    }

    if (!card.verificationAmount || !card.verificationExpiresAt) {
      return res.status(409).json({ message: 'La tarjeta no tiene una verificación pendiente activa.' });
    }

    if (new Date(card.verificationExpiresAt).getTime() < Date.now()) {
      card.verificationStatus = 'failed';
      await card.save();
      return res.status(400).json({
        message: 'La verificación expiró. Solicita una nueva verificación para continuar.',
        code: 'CARD_VERIFICATION_EXPIRED',
      });
    }

    if (card.verificationAttemptCount >= CARD_VERIFICATION_MAX_ATTEMPTS) {
      card.verificationStatus = 'failed';
      await card.save();
      return res.status(400).json({
        message: 'Se alcanzó el máximo de intentos. Solicita una nueva verificación.',
        code: 'CARD_VERIFICATION_ATTEMPTS_EXCEEDED',
      });
    }

    if (Number(card.verificationAmount) !== Math.round(amount)) {
      card.verificationAttemptCount = Number(card.verificationAttemptCount || 0) + 1;
      if (card.verificationAttemptCount >= CARD_VERIFICATION_MAX_ATTEMPTS) {
        card.verificationStatus = 'failed';
      }
      await card.save();
      return res.status(400).json({
        message: 'El valor ingresado no coincide con el cobro de verificación.',
        attemptsRemaining: Math.max(CARD_VERIFICATION_MAX_ATTEMPTS - Number(card.verificationAttemptCount || 0), 0),
        code: 'CARD_VERIFICATION_MISMATCH',
      });
    }

    card.verificationStatus = 'verified';
    card.verificationAttemptCount = 0;
    card.verificationAmount = null;
    card.verifiedAt = new Date();
    await card.save();

    return res.status(200).json({
      verified: true,
      card: serializeCard(card),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/portal/payment-methods/cards/:cardId', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const cardId = toObjectId(req.params.cardId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!cardId) {
      return res.status(400).json({ message: 'Invalid card id' });
    }

    const card = await ParentPaymentMethod.findOne({
      _id: cardId,
      schoolId,
      parentUserId,
      type: 'card',
      deletedAt: null,
    });

    if (!card) {
      return res.status(404).json({ message: 'Tarjeta no encontrada.' });
    }

    card.status = 'inactive';
    card.deletedAt = new Date();
    await card.save();

    return res.status(200).json({ message: 'Tarjeta eliminada correctamente.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/portal/students/:studentId/auto-debit', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.params.studentId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    const link = await ParentStudentLink.findOne({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    }).lean();

    if (!link) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const wallet = await Wallet.findOne({ schoolId, studentId });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    const enabled = Boolean(req.body?.enabled);
    if (!enabled) {
      wallet.autoDebitEnabled = false;
      wallet.autoDebitLimit = 0;
      wallet.autoDebitAmount = 0;
      wallet.autoDebitPaymentMethodId = null;
      wallet.autoDebitAgreementId = '';
      wallet.autoDebitAgreementStatus = '';
      wallet.autoDebitAgreementLastSyncAt = null;
      wallet.autoDebitInProgress = false;
      wallet.autoDebitLockAt = null;
      wallet.autoDebitLastAttempt = null;
      wallet.autoDebitLastChargeAt = null;
      wallet.autoDebitRetryAt = null;
      wallet.autoDebitRetryCount = 0;
      wallet.autoDebitMonthlyUsed = 0;
      wallet.autoDebitMonthlyPeriod = '';
      await wallet.save();

      return res.status(200).json({
        student: {
          _id: studentId,
          wallet: {
            autoDebitEnabled: false,
            autoDebitLimit: 0,
            autoDebitAmount: 0,
            autoDebitPaymentMethodId: null,
            autoDebitAgreementId: '',
            autoDebitAgreementStatus: '',
            autoDebitInProgress: false,
            autoDebitLockAt: null,
            autoDebitLastAttempt: null,
            autoDebitLastChargeAt: null,
            autoDebitRetryAt: null,
            autoDebitRetryCount: 0,
            autoDebitMonthlyLimit: Number(wallet.autoDebitMonthlyLimit || 0),
            autoDebitMonthlyUsed: 0,
            autoDebitMonthlyPeriod: '',
          },
        },
      });
    }

    const confirmAuthorization = Boolean(req.body?.confirmAuthorization);
    const requestedAutoDebitPaymentMethodId = toObjectId(req.body?.autoDebitPaymentMethodId);
    const requestedAutoDebitLimit = Number(req.body?.autoDebitLimit);
    const requestedAutoDebitAmount = Number(req.body?.autoDebitAmount);
    const requestedMonthlyLimit = Number(req.body?.autoDebitMonthlyLimit);
    const fallbackMonthlyLimit = Number(wallet.autoDebitMonthlyLimit || 0);
    const defaultMonthlyLimit = Number(process.env.AUTO_DEBIT_DEFAULT_MONTHLY_LIMIT || 1000000);
    const autoDebitLimit = Number.isFinite(requestedAutoDebitLimit) && requestedAutoDebitLimit > 0
      ? requestedAutoDebitLimit
      : Number(wallet.autoDebitLimit || 0);
    const autoDebitAmount = Number.isFinite(requestedAutoDebitAmount) && requestedAutoDebitAmount > 0
      ? requestedAutoDebitAmount
      : Number(wallet.autoDebitAmount || 0);
    const autoDebitMonthlyLimit = Number.isFinite(requestedMonthlyLimit) && requestedMonthlyLimit > 0
      ? requestedMonthlyLimit
      : (fallbackMonthlyLimit > 0
        ? fallbackMonthlyLimit
        : (Number.isFinite(defaultMonthlyLimit) && defaultMonthlyLimit > 0 ? defaultMonthlyLimit : 1000000));

    if (!Number.isFinite(autoDebitLimit) || autoDebitLimit < 20000) {
      return res.status(400).json({ message: 'autoDebitLimit must be at least 20000' });
    }

    if (!Number.isFinite(autoDebitAmount) || autoDebitAmount < 20000) {
      return res.status(400).json({ message: 'autoDebitAmount must be at least 20000' });
    }

    const parentUser = await User.findOne({ _id: parentUserId, schoolId, role: 'parent', deletedAt: null })
      .select('_id email name')
      .lean();

    if (!parentUser) {
      return res.status(404).json({ message: 'Parent user not found' });
    }

    if (!isEpaycoConfigured()) {
      return res.status(503).json({ message: 'ePayco no está configurado en este momento.' });
    }

    if (!confirmAuthorization) {
      const verifiedCardFilter = {
        schoolId,
        parentUserId,
        type: 'card',
        provider: 'epayco',
        status: 'active',
        deletedAt: null,
        verificationStatus: 'verified',
        providerCustomerId: { $ne: '' },
        providerCardId: { $ne: '' },
      };

      if (requestedAutoDebitPaymentMethodId) {
        verifiedCardFilter._id = requestedAutoDebitPaymentMethodId;
      }

      const verifiedCard = await ParentPaymentMethod.findOne(verifiedCardFilter)
        .sort({ verifiedAt: -1, createdAt: -1 })
        .select('_id')
        .lean();

      if (!verifiedCard?._id) {
        return res.status(409).json({
          requiresVerifiedCard: true,
          message: requestedAutoDebitPaymentMethodId
            ? 'La tarjeta seleccionada no está verificada o no está disponible para recarga automática.'
            : 'Debes registrar y verificar una tarjeta en ePayco para activar la recarga automática por umbral.',
        });
      }

      wallet.autoDebitEnabled = true;
      wallet.autoDebitLimit = autoDebitLimit;
      wallet.autoDebitAmount = autoDebitAmount;
      wallet.autoDebitMonthlyLimit = autoDebitMonthlyLimit;
      wallet.autoDebitPaymentMethodId = verifiedCard._id;
      wallet.autoDebitAgreementId = '';
      wallet.autoDebitAgreementStatus = '';
      wallet.autoDebitAgreementLastSyncAt = null;
      wallet.autoDebitInProgress = false;
      wallet.autoDebitLockAt = null;
      wallet.autoDebitRetryAt = null;
      wallet.autoDebitRetryCount = 0;
      await wallet.save();

      return res.status(200).json({
        requiresAuthorization: false,
        mode: 'card_tokenized_threshold',
        student: {
          _id: studentId,
          wallet: {
            autoDebitEnabled: true,
            autoDebitLimit,
            autoDebitAmount,
            autoDebitMonthlyLimit,
            autoDebitPaymentMethodId: verifiedCard._id,
            autoDebitAgreementId: '',
            autoDebitAgreementStatus: '',
            autoDebitInProgress: false,
            autoDebitLockAt: null,
            autoDebitRetryAt: null,
            autoDebitRetryCount: 0,
            autoDebitMonthlyUsed: Number(wallet.autoDebitMonthlyUsed || 0),
            autoDebitMonthlyPeriod: String(wallet.autoDebitMonthlyPeriod || ''),
          },
        },
      });
    }

    return res.status(400).json({ message: 'confirmAuthorization is not supported. Use the ePayco card tokenized threshold flow.' });
  } catch (error) {
    return res.status(500).json({ message: error?.message || 'Error activando recarga automatica.' });
  }
});

router.patch('/portal/students/:studentId/blocks', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.params.studentId);
    const { type, targetId, blocked } = req.body;

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    if (!['category', 'product'].includes(String(type || ''))) {
      return res.status(400).json({ message: 'type must be category or product' });
    }

    const targetObjectId = toObjectId(targetId);
    if (!targetObjectId) {
      return res.status(400).json({ message: 'Invalid targetId' });
    }

    const link = await ParentStudentLink.findOne({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    }).lean();

    if (!link) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const student = await Student.findOne({
      _id: studentId,
      schoolId,
      deletedAt: null,
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const shouldBlock = Boolean(blocked);

    if (String(type) === 'category') {
      const category = await Category.findOne({ _id: targetObjectId, schoolId, deletedAt: null }).lean();
      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
      }

      const current = Array.isArray(student.blockedCategories) ? student.blockedCategories.map((id) => String(id)) : [];
      if (shouldBlock) {
        if (!current.includes(String(targetObjectId))) {
          student.blockedCategories.push(targetObjectId);
        }
      } else {
        student.blockedCategories = student.blockedCategories.filter((id) => String(id) !== String(targetObjectId));
      }
    }

    if (String(type) === 'product') {
      const product = await Product.findOne({ _id: targetObjectId, schoolId, deletedAt: null }).lean();
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const current = Array.isArray(student.blockedProducts) ? student.blockedProducts.map((id) => String(id)) : [];
      if (shouldBlock) {
        if (!current.includes(String(targetObjectId))) {
          student.blockedProducts.push(targetObjectId);
        }
      } else {
        student.blockedProducts = student.blockedProducts.filter((id) => String(id) !== String(targetObjectId));
      }
    }

    await student.save();

    const updated = await Student.findOne({ _id: studentId, schoolId, deletedAt: null })
      .populate('blockedProducts', 'name')
      .populate('blockedCategories', 'name')
      .lean();

    return res.status(200).json({
      student: {
        _id: updated._id,
        blockedProducts: Array.isArray(updated.blockedProducts)
          ? updated.blockedProducts.map((item) => ({ _id: item._id, name: item.name || '' }))
          : [],
        blockedCategories: Array.isArray(updated.blockedCategories)
          ? updated.blockedCategories.map((item) => ({ _id: item._id, name: item.name || '' }))
          : [],
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/portal/students/:studentId/daily-limit', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.params.studentId);
    const parsedLimit = Number(req.body?.dailyLimit);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    if (!Number.isFinite(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({ message: 'dailyLimit must be a number greater than or equal to 0' });
    }

    const link = await ParentStudentLink.findOne({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    }).lean();

    if (!link) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const student = await Student.findOneAndUpdate(
      {
        _id: studentId,
        schoolId,
        deletedAt: null,
      },
      {
        dailyLimit: Math.round(parsedLimit),
      },
      {
        new: true,
      }
    ).lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.status(200).json({
      student: {
        _id: student._id,
        dailyLimit: Number(student.dailyLimit || 0),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/portal/students/:studentId/grade', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.params.studentId);
    const gradeValue = String(req.body?.grade || '').trim();

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    if (!gradeValue) {
      return res.status(400).json({ message: 'El curso es obligatorio.' });
    }

    if (gradeValue.length > 40) {
      return res.status(400).json({ message: 'El curso no puede superar 40 caracteres.' });
    }

    const link = await ParentStudentLink.findOne({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    }).lean();

    if (!link) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const student = await Student.findOneAndUpdate(
      {
        _id: studentId,
        schoolId,
        deletedAt: null,
      },
      {
        grade: gradeValue,
      },
      {
        new: true,
      }
    ).lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.status(200).json({
      student: {
        _id: student._id,
        grade: student.grade || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/students/:studentId/photo', (req, res) => {
  uploadParentStudentPhoto(req, res, async (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        message: 'La imagen supera el limite permitido. Usa una imagen mas liviana.',
      });
    }

    if (error) {
      return res.status(400).json({ message: error.message || 'No se pudo cargar la foto del alumno.' });
    }

    try {
      const { schoolId, role, userId } = req.user;
      const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
      const parentUserId = toObjectId(requestedParentUserId);
      const studentId = toObjectId(req.params.studentId);

      if (!parentUserId) {
        return res.status(400).json({ message: 'Invalid parent user id' });
      }

      if (!studentId) {
        return res.status(400).json({ message: 'Invalid student id' });
      }

      const link = await ParentStudentLink.findOne({
        schoolId,
        parentId: parentUserId,
        studentId,
        status: 'active',
      }).lean();

      if (!link) {
        return res.status(403).json({ message: 'Forbidden studentId' });
      }

      const student = await Student.findOne({
        _id: studentId,
        schoolId,
        deletedAt: null,
      });

      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }

      const saved = await processAndStoreUploadedImage({
        file: req.file,
        folder: 'students',
        preferredName: req.body?.preferredName || student.name || req.file?.originalname,
        requireCloudinary: true,
      });

      if (saved.storage !== 'cloudinary') {
        return res.status(503).json({
          message: 'La foto del alumno solo se puede guardar en Cloudinary.',
        });
      }

      student.imageUrl = normalizeStoredImageUrl(saved.url);
      student.thumbUrl = normalizeStoredImageUrl(saved.thumbUrl);
      await student.save();

      return res.status(200).json({
        student: {
          _id: student._id,
          ...serializeStudentPhotoFields(student),
        },
      });
    } catch (processingError) {
      return res.status(400).json({ message: processingError.message || 'No se pudo guardar la foto del alumno.' });
    }
  });
});

router.post('/portal/gio-ia/chat', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin'
      ? req.body.parentUserId || req.query.parentUserId || userId
      : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const selectedStudentId = toObjectId(req.body.studentId || req.query.studentId);
    const message = String(req.body?.message || '').trim();
    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const history = Array.isArray(req.body?.history)
      ? req.body.history
        .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
        .map((item) => ({
          role: item.role,
          content: String(item.content || '').trim(),
        }))
        .filter((item) => item.content)
        .slice(-20)
      : [];

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!selectedStudentId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    if (message.length < 2) {
      return res.status(400).json({ message: 'message is required' });
    }

    const links = await ParentStudentLink.find({
      schoolId,
      parentId: parentUserId,
      status: 'active',
    })
      .select('studentId')
      .lean();

    const allowedStudentIds = links.map((item) => String(item.studentId));
    if (!allowedStudentIds.length) {
      return res.status(404).json({ message: 'No linked students found' });
    }

    if (!allowedStudentIds.includes(String(selectedStudentId))) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const [students, wallets, meriendaSubscriptions] = await Promise.all([
      Student.find({
        schoolId,
        _id: { $in: allowedStudentIds },
        deletedAt: null,
      })
        .populate('blockedProducts', 'name')
        .populate('blockedCategories', 'name')
        .sort({ name: 1 })
        .lean(),
      Wallet.find({
        schoolId,
        studentId: { $in: allowedStudentIds },
      }).lean(),
      MeriendaSubscription.find({
        schoolId,
        parentUserId,
        status: 'active',
      })
        .select('childName paymentStatus currentPeriodMonth parentRecommendations childAllergies childFoodRestrictionReason lastPaymentAt nextRenewalAt')
        .lean(),
    ]);

    const linkedStudents = buildGioChildProfiles({
      students,
      wallets,
      meriendaSubscriptions,
    });
    const selectedStudent = linkedStudents.find((item) => String(item._id) === String(selectedStudentId));

    if (!selectedStudent) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const targetStudents = resolveGioTargetStudents(message, context, linkedStudents, String(selectedStudentId));
    const effectiveTargets = targetStudents.length ? targetStudents : [selectedStudent];
    const targetStudentIds = effectiveTargets.map((item) => String(item._id));
    const targetStudentObjectIds = targetStudentIds.map((item) => toObjectId(item)).filter(Boolean);
    const targetLabel = formatGioNameList(effectiveTargets.map((item) => item.name));
    const isMultiTarget = effectiveTargets.length > 1;
    const studentNameById = effectiveTargets.reduce((acc, item) => {
      acc[String(item._id)] = item.name;
      return acc;
    }, {});

    const timeframe = resolveGioTimeframe(message, context, history);
    const parsedDate = timeframe?.parsedDate || null;
    const intent = inferGioIntent(message, parsedDate, context);
    const fromDate = startOfDayLocal(timeframe.fromDate);
    const toDate = endOfDayLocal(timeframe.toDate);
    const scopeLabel = formatGioScopeLabel(timeframe.scope, fromDate, toDate, timeframe.rangeDays);
    const currencyFormat = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    });
    const nextContext = {
      studentId: String(selectedStudentId),
      studentName: selectedStudent.name,
      lastIntent: intent,
      lastDate: timeframe.scope === 'date' ? fromDate.toISOString().slice(0, 10) : context?.lastDate || null,
      lastScope: timeframe.scope,
      lastFromDate: fromDate.toISOString().slice(0, 10),
      lastToDate: toDate.toISOString().slice(0, 10),
      lastRangeDays: Number(timeframe.rangeDays || 1),
      lastPeakDate: context?.lastPeakDate || null,
      lastTargetStudentIds: targetStudentIds,
      lastTargetStudentNames: effectiveTargets.map((item) => item.name),
    };
    let answer = '';

    if (intent === 'children_list') {
      answer = linkedStudents.length === 1
        ? `Tienes 1 alumno vinculado en Comergio: ${linkedStudents[0].name}.`
        : `Tienes ${linkedStudents.length} alumnos vinculados en Comergio: ${formatGioNameList(linkedStudents.map((item) => item.name))}.`;
      nextContext.lastTargetStudentIds = linkedStudents.map((item) => String(item._id));
      nextContext.lastTargetStudentNames = linkedStudents.map((item) => item.name);
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'balance') {
      if (effectiveTargets.length === 1) {
        const target = effectiveTargets[0];
        const autoDebitText = target.wallet.autoDebitEnabled
          ? ` Tiene débito automático activo por ${currencyFormat.format(target.wallet.autoDebitAmount || 0)}.`
          : ' No tiene débito automático activo.';
        answer = `${target.name} tiene un saldo disponible de ${currencyFormat.format(target.wallet.balance)}.${autoDebitText}`;
      } else {
        const totalBalance = effectiveTargets.reduce((sum, item) => sum + Number(item.wallet.balance || 0), 0);
        const detail = effectiveTargets
          .map((item) => `${item.name}: ${currencyFormat.format(item.wallet.balance)}`)
          .join('; ');
        answer = `Saldos actuales de ${targetLabel}: ${detail}. Total combinado: ${currencyFormat.format(totalBalance)}.`;
      }
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'daily_limit') {
      answer = effectiveTargets.length === 1
        ? `${effectiveTargets[0].name} tiene un límite diario de ${currencyFormat.format(effectiveTargets[0].dailyLimit)}.`
        : `Límites diarios: ${effectiveTargets.map((item) => `${item.name}: ${currencyFormat.format(item.dailyLimit)}`).join('; ')}.`;
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'student_profile') {
      answer = effectiveTargets.length === 1
        ? `${effectiveTargets[0].name} está en ${effectiveTargets[0].grade || 'curso no registrado'}, código escolar ${effectiveTargets[0].schoolCode || 'no registrado'} y límite diario ${currencyFormat.format(effectiveTargets[0].dailyLimit)}.`
        : `Datos de ${targetLabel}: ${effectiveTargets.map((item) => `${item.name} (${item.grade || 'curso no registrado'}, código ${item.schoolCode || 'sin código'})`).join('; ')}.`;
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'restrictions') {
      const detail = effectiveTargets.map((item) => {
        const blockedProductsText = item.blockedProducts.length
          ? `productos bloqueados: ${item.blockedProducts.join(', ')}`
          : 'sin productos bloqueados';
        const blockedCategoriesText = item.blockedCategories.length
          ? `categorías bloqueadas: ${item.blockedCategories.join(', ')}`
          : 'sin categorías bloqueadas';
        const meriendaText = item.merienda.childFoodRestrictions
          ? `restricciones alimentarias: ${item.merienda.childFoodRestrictions}`
          : 'sin restricciones alimentarias registradas';
        return `${item.name}: ${blockedProductsText}; ${blockedCategoriesText}; ${meriendaText}`;
      }).join(' | ');
      answer = detail;
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'merienda_status') {
      answer = effectiveTargets.map((item) => {
        if (!item.merienda.active) {
          return `${item.name}: sin suscripción activa de meriendas.`;
        }
        return `${item.name}: meriendas activas, pago ${item.merienda.paymentStatus ? 'al día' : 'pendiente'}, período ${item.merienda.currentPeriodMonth || 'sin período'}, restricciones ${item.merienda.childFoodRestrictions || 'no registradas'}.`;
      }).join(' ');
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'autodebit_status') {
      answer = effectiveTargets.map((item) => {
        if (!item.wallet.autoDebitEnabled) {
          return `${item.name}: sin débito automático activo.`;
        }
        return `${item.name}: débito automático activo por ${currencyFormat.format(item.wallet.autoDebitAmount || 0)}, límite ${currencyFormat.format(item.wallet.autoDebitLimit || 0)}, usado este mes ${currencyFormat.format(item.wallet.autoDebitMonthlyUsed || 0)}.`;
      }).join(' ');
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'overview') {
      const detail = effectiveTargets.map((item) => `${item.name}: saldo ${currencyFormat.format(item.wallet.balance)}, curso ${item.grade || 'no registrado'}, código ${item.schoolCode || 'no registrado'}, límite diario ${currencyFormat.format(item.dailyLimit)}, débito automático ${item.wallet.autoDebitEnabled ? 'activo' : 'inactivo'}.`).join(' ');
      answer = detail;
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'last_recharge' || intent === 'recharge_total') {
      const rechargeMetrics = await findGioRechargeMetrics({
        schoolId,
        studentIds: targetStudentIds,
      });

      nextContext.lastIntent = intent;

      if (!rechargeMetrics.latest) {
        answer = effectiveTargets.length === 1
          ? `${effectiveTargets[0].name} no tiene recargas registradas todavía.`
          : `${targetLabel} no tienen recargas registradas todavía.`;
        return res.status(200).json({ answer, context: nextContext });
      }

      if (intent === 'recharge_total') {
        const rechargeDetail = rechargeMetrics.byStudent.length > 1
          ? ` Detalle: ${rechargeMetrics.byStudent
            .map((item) => `${studentNameById[item.studentId] || 'Alumno'} ${currencyFormat.format(item.totalAmount)} en ${item.count} recarga(s)`)
            .join('; ')}.`
          : '';
        answer = `${targetLabel} ${isMultiTarget ? 'registran' : 'registra'} ${rechargeMetrics.count} recarga(s) por un total acumulado de ${currencyFormat.format(rechargeMetrics.totalAmount)}.${rechargeDetail}`;
        return res.status(200).json({ answer, context: nextContext });
      }

      nextContext.lastDate = startOfDayLocal(rechargeMetrics.latest.createdAt).toISOString().slice(0, 10);
      answer = effectiveTargets.length === 1
        ? `La última recarga de ${effectiveTargets[0].name} fue el ${formatDateLabelEs(rechargeMetrics.latest.createdAt)} por ${currencyFormat.format(rechargeMetrics.latest.amount)} vía ${formatGioWalletMethod(rechargeMetrics.latest.method)}.`
        : `La recarga más reciente entre ${targetLabel} fue la de ${studentNameById[String(rechargeMetrics.latest.studentId)] || 'Alumno'} el ${formatDateLabelEs(rechargeMetrics.latest.createdAt)} por ${currencyFormat.format(rechargeMetrics.latest.amount)} vía ${formatGioWalletMethod(rechargeMetrics.latest.method)}.`;
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'unsupported') {
      answer = `Puedo ayudarte con consumo, órdenes, promedios, días específicos, saldos, recargas, límites diarios, bloqueos, meriendas y débito automático de ${targetLabel}. Si quieres, pregúntame por ejemplo: "¿qué consumió?", "¿cuánto saldo tiene?" o "¿cuándo fue la última recarga?".`;
      return res.status(200).json({ answer, context: nextContext });
    }

    const matchingOrders = await Order.find({
      schoolId,
      studentId: { $in: targetStudentObjectIds },
      status: 'completed',
      createdAt: { $gte: fromDate, $lte: toDate },
    })
      .select('studentId createdAt total items')
      .sort({ createdAt: -1 })
      .lean();
    const metrics = buildGioMetrics(matchingOrders, fromDate, toDate, studentNameById);

    const topProducts = metrics.topProducts.slice(0, 5);
    const studentBreakdownText = buildGioStudentBreakdownText(metrics.perStudent, currencyFormat);

    if (!matchingOrders.length) {
      answer = timeframe.scope === 'date'
        ? `${targetLabel} no ${isMultiTarget ? 'tienen' : 'tiene'} consumos registrados el ${formatDateLabelEs(fromDate)}.`
        : `No encontré consumos de ${targetLabel} en ${scopeLabel}.`;
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'average') {
      if (timeframe.scope === 'date') {
        const averagePerOrder = metrics.ordersCount > 0 ? metrics.total / metrics.ordersCount : 0;
        answer = `${targetLabel} ${isMultiTarget ? 'registraron' : 'registró'} ${metrics.ordersCount} orden(es) el ${formatDateLabelEs(fromDate)} por ${currencyFormat.format(metrics.total)}. Promedio por orden: ${currencyFormat.format(averagePerOrder)}.${studentBreakdownText}`;
      } else {
        answer = `En ${scopeLabel}, ${targetLabel} ${isMultiTarget ? 'llevan' : 'lleva'} ${currencyFormat.format(metrics.total)} en ${metrics.ordersCount} orden(es). Promedio por día con consumo: ${currencyFormat.format(metrics.averageByActiveDay)}. Promedio diario del período: ${currencyFormat.format(metrics.averageByCalendarDay)}.${studentBreakdownText}`;
      }
      return res.status(200).json({
        answer,
        context: nextContext,
      });
    }

    if (intent === 'peak_day') {
      const peakDayDate = metrics.peakDay ? startOfDayLocal(metrics.peakDay.date) : null;
      if (!peakDayDate || Number.isNaN(peakDayDate.getTime())) {
        answer = timeframe.scope === 'date'
          ? `${targetLabel} solo ${isMultiTarget ? 'tienen' : 'tiene'} consumos el ${formatDateLabelEs(fromDate)}.`
          : `No pude determinar un día pico de gasto para ${targetLabel} en ${scopeLabel}.`;
        return res.status(200).json({ answer, context: nextContext });
      }

      nextContext.lastIntent = 'peak_day';
      nextContext.lastDate = peakDayDate.toISOString().slice(0, 10);
      nextContext.lastPeakDate = peakDayDate.toISOString().slice(0, 10);
      answer = `${targetLabel} ${isMultiTarget ? 'tuvieron' : 'tuvo'} su mayor gasto en ${scopeLabel} el ${formatDateLabelEs(peakDayDate)}: ${currencyFormat.format(metrics.peakDay.total)} en ${metrics.peakDay.ordersCount} orden(es).${studentBreakdownText}`;
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'specific_day') {
      const referenceDateValue = context?.lastPeakDate || context?.lastDate || null;
      const referenceDate = referenceDateValue ? startOfDayLocal(referenceDateValue) : null;
      if (!referenceDate || Number.isNaN(referenceDate.getTime())) {
        answer = `Necesito una fecha o un período previo para decirte el día específico de ${studentName}.`;
        return res.status(200).json({ answer, context: nextContext });
      }

      nextContext.lastIntent = 'specific_day';
      nextContext.lastDate = referenceDate.toISOString().slice(0, 10);
      nextContext.lastPeakDate = context?.lastPeakDate || referenceDate.toISOString().slice(0, 10);
      answer = `${targetLabel} ${isMultiTarget ? 'tuvieron' : 'tuvo'} ese consumo el ${formatDateLabelEs(referenceDate)}.`;
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'orders') {
      answer = timeframe.scope === 'date'
        ? `${targetLabel} ${isMultiTarget ? 'hicieron' : 'hizo'} ${metrics.ordersCount} orden(es) el ${formatDateLabelEs(fromDate)}.${studentBreakdownText}`
        : `${targetLabel} ${isMultiTarget ? 'hicieron' : 'hizo'} ${metrics.ordersCount} orden(es) en ${scopeLabel}, repartidas en ${metrics.activeDays} día(s) con consumo.${studentBreakdownText}`;
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'total') {
      answer = timeframe.scope === 'date'
        ? `${targetLabel} ${isMultiTarget ? 'gastaron' : 'gastó'} ${currencyFormat.format(metrics.total)} el ${formatDateLabelEs(fromDate)} en ${metrics.ordersCount} orden(es).${studentBreakdownText}`
        : `${targetLabel} ${isMultiTarget ? 'gastaron' : 'gastó'} ${currencyFormat.format(metrics.total)} en ${scopeLabel}, con ${metrics.ordersCount} orden(es) en ${metrics.activeDays} día(s) de consumo.${studentBreakdownText}`;
      return res.status(200).json({ answer, context: nextContext });
    }

    if (intent === 'products') {
      const productsText = topProducts.length
        ? topProducts.map((item) => `${item.name} x${item.quantity}`).join(', ')
        : 'sin detalle de productos';
      answer = timeframe.scope === 'date'
        ? `${targetLabel} ${isMultiTarget ? 'consumieron' : 'consumió'} el ${formatDateLabelEs(fromDate)}: ${productsText}. Total del día: ${currencyFormat.format(metrics.total)} en ${metrics.ordersCount} orden(es).${studentBreakdownText}`
        : `En ${scopeLabel}, ${targetLabel} ${isMultiTarget ? 'consumieron' : 'consumió'} principalmente: ${productsText}. Total del período: ${currencyFormat.format(metrics.total)} en ${metrics.ordersCount} orden(es).${studentBreakdownText}`;
      return res.status(200).json({ answer, context: nextContext });
    }

    const topProductsText = topProducts.length
      ? ` Productos más frecuentes: ${topProducts.slice(0, 3).map((item) => `${item.name} x${item.quantity}`).join(', ')}.`
      : '';
    answer = timeframe.scope === 'date'
      ? `${targetLabel} ${isMultiTarget ? 'consumieron' : 'consumió'} ${currencyFormat.format(metrics.total)} el ${formatDateLabelEs(fromDate)} en ${metrics.ordersCount} orden(es).${topProductsText}${studentBreakdownText}`
      : `${targetLabel} ${isMultiTarget ? 'llevan' : 'lleva'} ${currencyFormat.format(metrics.total)} en ${scopeLabel}, con ${metrics.ordersCount} orden(es) en ${metrics.activeDays} día(s) de consumo.${topProductsText}${studentBreakdownText} Si quieres, te detallo productos, promedio, saldo, recargas o un día específico.`;

    return res.status(200).json({
      answer,
      context: nextContext,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Waitlist for meriendas (service not yet open)
router.post('/portal/meriendas/waitlist', roleMiddleware('parent'), async (req, res) => {
  try {
    const { schoolId, userId, name, username } = req.user;

    const links = await ParentStudentLink.find({ schoolId, parentId: userId, status: 'active' })
      .select('studentId')
      .lean();

    const studentIds = links.map((l) => String(l.studentId));
    let childName = '';
    let childGrade = '';

    if (studentIds.length > 0) {
      const student = await Student.findOne({ schoolId, _id: { $in: studentIds }, deletedAt: null })
        .select('name grade')
        .lean();
      childName = student?.name || '';
      childGrade = student?.grade || '';
    }

    await MeriendaWaitlist.findOneAndUpdate(
      { schoolId, parentUserId: userId },
      {
        schoolId,
        parentUserId: userId,
        parentName: name || '',
        parentUsername: username || '',
        childName,
        childGrade,
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({ message: 'Agregado a la lista de espera correctamente.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
