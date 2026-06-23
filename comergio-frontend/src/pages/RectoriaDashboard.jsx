import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import './SchoolCreationWizard.css';
import './RectoriaDashboard.css';
import { buildAcademicEnrollmentProrationTable } from '../lib/academicEnrollment';
import { findMatchingFeeSetting, getFeeGradeAliases, resolveStructureGradeKeyForStudent, studentMatchesAnyGradeKey, buildAcademicStructureGradeMetadataIndex, gradesMatchForFilter } from '../lib/feeGradeMatching';
import { resolveGradeCourses, resolveStudentCourseKey, studentHasAssignedCourseInGrade } from '../lib/academicGradeCourses';
import { formatEducationalGradeLabel } from '../lib/educationalGradeLabels';
import AdmissionsDashboard from './AdmissionsDashboard';
import useAuthStore from '../store/auth.store';
import BrandConfirmModal from '../components/BrandConfirmModal';
import { getSchoolDisplayName } from '../lib/schools';
import { resolveApiAssetUrl } from '../lib/api';
import {
  createAdminUser,
  deleteAdminUser,
  getAdminHomepage,
  getAdminUsers,
  updateAdminUser,
} from '../services/admin.service';
import {
  approveAcademicSecretaryCommunicationRequest,
  archiveAcademicCalendarAssignment,
  assignAcademicManagementStudentCourse,
  createAcademicCalendarAssignment,
  createAcademicManagementCourse,
  createAcademicManagementGrade,
  createAcademicManagementLevel,
  createAcademicManagementSubject,
  importAcademicSecretaryDatabase,
  createAcademicSecretaryCharge,
  createAcademicSecretaryBillingFollowUp,
  createAcademicSecretaryCommunicationAuthor,
  createAcademicSecretaryCommunication,
  deleteAcademicSecretaryCommunicationAuthor,
  deleteAcademicSecretaryCommunicationComment,
  deleteAcademicManagementLevel,
  deleteAcademicManagementSubject,
  deleteAcademicManagementCourse,
  deleteAcademicManagementGrade,
  generateAcademicManagementWeeklySchedule,
  getAcademicSecretaryBootstrap,
  getAcademicSecretaryFeeSettings,
  rejectAcademicSecretaryCommunicationRequest,
  requestAcademicSecretaryGradePromotion,
  saveAcademicManagementPeriods,
  saveAcademicManagementScheduleBreaks,
  saveAcademicManagementScheduleSettings,
  saveAcademicManagementSubjectLoadTemplates,
  saveAcademicManagementScheduleLoad,
  saveAcademicManagementTeachingAvailability,
  saveAcademicSecretaryFeeSettings,
  saveAcademicManagementWeeklySchedule,
  sendAcademicSecretaryReminder,
  updateAcademicSecretaryCommunicationAuthor,
  updateAcademicSecretaryDatabaseRow,
  updateAcademicManagementCourseName,
  updateAcademicManagementCourseHeadroomTeacher,
  updateAcademicManagementLevelName,
  updateAcademicManagementGradeLevel,
  updateAcademicManagementSubject,
  updateAcademicManagementGradeName,
  updateAcademicManagementSubjectGrades,
  uploadAcademicSecretaryCommunicationImage,
} from '../services/academicSecretary.service';
import AcademicAssignmentsPanel from '../components/AcademicAssignmentsPanel';
import CoordinationLevelDashboard from '../components/CoordinationLevelDashboard';
import CoordinationSchedulePanel from '../components/CoordinationSchedulePanel';
import { getCampusCoordinationCourses, getCampusCoordinationDashboard, getCampusCoordinationTeachers, getCampusDisciplineObservations } from '../campus/services/campus.service';
import {
  approveHrSupplyRequest,
  consolidateHrPlannerRequests,
  createHrPlannerCycle,
  getHrCoordinationPlannerRequests,
  getHrDashboard,
  getHrPlannerCycles,
  getHrSupplyItems,
  getHrSupplyRequests,
  rejectHrSupplyRequest,
} from '../services/hr.service';
import { getStudents } from '../services/students.service';

const INSTITUTIONAL_ROLES = ['admin', 'rectoria', 'direccion', 'coordination', 'teacher', 'psychology', 'nursing', 'academic_secretary', 'admissions', 'billing', 'human_resources', 'school_route'];

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Cafeterías escolares' },
  { value: 'rectoria', label: 'Rectoría' },
  { value: 'direccion', label: 'Dirección' },
  { value: 'coordination', label: 'Coordinación' },
  { value: 'teacher', label: 'Docencia' },
  { value: 'psychology', label: 'Psicología - bienestar' },
  { value: 'nursing', label: 'Enfermería' },
  { value: 'academic_secretary', label: 'Secretaría académica' },
  { value: 'admissions', label: 'Admisiones' },
  { value: 'billing', label: 'Cartera' },
  { value: 'human_resources', label: 'Recursos y gestion de compras' },
  { value: 'school_route', label: 'Ruta escolar' },
];
const BASE_SECTION_OPTIONS = [
  { key: 'overview', label: 'Resumen institucional' },
  { key: 'admissions', label: 'Admisiones' },
  { key: 'communications', label: 'Comunicados' },
  { key: 'team', label: 'Cuerpo académico' },
  { key: 'resources', label: 'Recursos y compras' },
  { key: 'students', label: 'Gestión academica' },
  { key: 'database', label: 'Base de datos' },
  { key: 'fees', label: 'Costos' },
];
const ACADEMIC_MANAGEMENT_SECTION_OPTIONS = [
  { key: 'grades_courses', label: 'Grados y cursos' },
  { key: 'periods', label: 'Periodos y calificaciones' },
  { key: 'subjects', label: 'Asignaturas' },
  { key: 'schedule', label: 'Horario académico' },
  { key: 'content', label: 'Contenido académico' },
  { key: 'assignments', label: 'Asignaciones' },
];
const ADMISSIONS_SECTION_OPTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'aspirantes', label: 'Aspirantes' },
  { key: 'desistidos', label: 'Desistidos' },
];
const ACADEMIC_SCHEDULE_WEEKDAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];
const ACADEMIC_SCHEDULE_ALLOWED_DURATIONS = Array.from({ length: 12 }, (_, index) => (index + 1) * 15);
const ACADEMIC_SCHEDULE_SUBJECT_DRAG_MIME = 'application/x-comergio-rectoria-schedule-subject';
const ACADEMIC_SCHEDULE_BLOCK_DRAG_MIME = 'application/x-comergio-rectoria-schedule-block';
const ACADEMIC_SCHEDULE_ENTRY_DRAG_MIME = 'application/x-comergio-rectoria-schedule-entry';
const ACADEMIC_SCHEDULE_SPECIAL_BLOCKS = [
  { key: 'break', label: 'Break', className: 'school-creation-calendar-break' },
  { key: 'guidance', label: 'Guidance Routine', className: 'school-creation-calendar-break school-creation-calendar-break--guidance' },
  { key: 'control', label: 'Control', className: 'school-creation-calendar-break school-creation-calendar-break--control' },
];
const DEFAULT_ACADEMIC_SCHEDULE_GROUP_NAME_PATTERN = /^Jornada\s+\d+$/i;

const emptyInstitutionalCommunicationForm = {
  title: '',
  body: '',
  authorId: '',
  audienceType: 'general',
  gradeTargets: [],
  courseTargets: [],
  parentTargets: [],
  studentTargets: [],
};

const emptyCommunicationAuthorDraft = {
  name: '',
  photoUrl: '',
  thumbUrl: '',
  uploading: false,
  error: '',
};

function createInstitutionalApprovalDraft(request = null) {
  return {
    title: request?.title || request?.originalTitle || '',
    body: request?.body || request?.originalBody || '',
    audienceType: request?.audienceType || 'general',
    gradeTargets: Array.isArray(request?.gradeTargets) ? request.gradeTargets.map(String) : [],
    courseTargets: Array.isArray(request?.courseTargets) ? request.courseTargets.map(String) : [],
    parentTargets: Array.isArray(request?.parentTargets) ? request.parentTargets.map(String) : [],
    studentTargets: Array.isArray(request?.studentTargets) ? request.studentTargets.map(String) : [],
    media: Array.isArray(request?.media) ? request.media : [],
    reviewNotes: '',
  };
}

function normalizeSchoolYearLevelSettings(raw = {}, academicGrades = [], academicLevels = []) {
  const globalFallback = {
    schoolYearStartDate: formatDateInputValue(raw?.schoolYearStartDate),
    schoolYearEndDate: formatDateInputValue(raw?.schoolYearEndDate),
    lateEnrollmentSurchargeType: ['percent', 'fixed'].includes(String(raw?.lateEnrollmentSurchargeType || '').trim()) ? String(raw?.lateEnrollmentSurchargeType || '').trim() : 'none',
    lateEnrollmentSurchargeValue: Number(raw?.lateEnrollmentSurchargeValue || 0),
  };
  const rawLevels = Array.isArray(raw?.schoolYearLevels) ? raw.schoolYearLevels : [];
  const configuredLevels = Array.isArray(academicLevels) && academicLevels.length > 0
    ? academicLevels.map((level) => ({ key: normalizeText(level?.key), label: normalizeText(level?.label || level?.key) })).filter((level) => level.key)
    : rawLevels.map((level) => ({ key: normalizeText(level?.levelKey), label: normalizeText(level?.label || level?.levelKey) })).filter((level) => level.key);
  const gradesByLevel = (Array.isArray(academicGrades) ? academicGrades : []).reduce((accumulator, grade) => {
    const levelKey = normalizeText(grade?.levelKey);
    const gradeKey = normalizeAcademicGradeKey(grade?.key || grade?.grade || grade?.label);
    if (!levelKey || !gradeKey) {
      return accumulator;
    }

    accumulator[levelKey] = accumulator[levelKey] || [];
    accumulator[levelKey].push(gradeKey);
    return accumulator;
  }, {});

  return configuredLevels.map((level) => {
    const existing = rawLevels.find((item) => normalizeText(item?.levelKey) === level.key) || {};
    const surchargeType = ['percent', 'fixed'].includes(String(existing?.lateEnrollmentSurchargeType || '').trim())
      ? String(existing?.lateEnrollmentSurchargeType || '').trim()
      : globalFallback.lateEnrollmentSurchargeType;
    return {
      levelKey: level.key,
      label: level.label || level.key,
      gradeKeys: Array.from(new Set((Array.isArray(existing?.gradeKeys) && existing.gradeKeys.length > 0 ? existing.gradeKeys : gradesByLevel[level.key] || [])
        .map((gradeKey) => normalizeAcademicGradeKey(gradeKey))
        .filter(Boolean))),
      schoolYearStartDate: formatDateInputValue(existing?.schoolYearStartDate) || globalFallback.schoolYearStartDate,
      schoolYearEndDate: formatDateInputValue(existing?.schoolYearEndDate) || globalFallback.schoolYearEndDate,
      lateEnrollmentSurchargeType: surchargeType,
      lateEnrollmentSurchargeValue: surchargeType === 'none' ? 0 : Number(existing?.lateEnrollmentSurchargeValue ?? globalFallback.lateEnrollmentSurchargeValue ?? 0),
    };
  });
}

function RectoriaCommunicationMediaPreview({ items = [] }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="rectoria-communication-media-empty">El docente no adjuntó contenido visual.</p>;
  }

  return (
    <div className="rectoria-communication-media-strip">
      {items.map((item, index) => (
        <article className="rectoria-communication-media-card" key={`${item.kind || 'image'}-${item.src || 'media'}-${index}`}>
          <div className="rectoria-communication-media-thumb">
            {item.kind === 'video'
              ? <span>Video</span>
              : <img alt={item.alt || `Adjunto ${index + 1}`} src={item.thumbUrl || item.src} />}
          </div>
          <div className="rectoria-communication-media-copy">
            <strong>{item.kind === 'video' ? 'Video del docente' : `Adjunto ${index + 1}`}</strong>
            <span>{item.src || 'Sin URL'}</span>
          </div>
          <a href={item.src || '#'} rel="noreferrer" target="_blank">Abrir</a>
        </article>
      ))}
    </div>
  );
}

function createDefaultAcademicScheduleDayBlocks() {
  return Array.from({ length: 8 }, (_, index) => ({
    block: index + 1,
    durationMinutes: 60,
    order: (index + 1) * 10,
  }));
}

function normalizeCampusCourseForAcademicContent(course = {}) {
  const key = String(course.key || course.id || course._id || course.title || course.section || '').trim();
  return {
    key,
    id: String(course.id || course._id || course.key || '').trim(),
    label: String(course.label || course.title || course.section || '').trim(),
    title: String(course.title || course.label || '').trim(),
    teacherUserId: String(course.teacherUserId || '').trim(),
    gradeKey: String(course.gradeKey || course.studentGradeKey || course.gradeLevel || '').trim(),
    studentGradeKey: String(course.studentGradeKey || course.gradeKey || course.gradeLevel || '').trim(),
    sourceCourseKey: String(course.sourceCourseKey || '').trim(),
    subject: String(course.subject || '').trim(),
    section: String(course.section || '').trim(),
    academicContent: Array.isArray(course.academicContent) ? course.academicContent : [],
    stats: course.stats && typeof course.stats === 'object' ? course.stats : null,
  };
}

function buildRectoriaStudentScoreKey(student = {}) {
  return String(student.studentId || student.schoolCode || `${student.name || ''}-${student.grade || ''}`).trim();
}

function buildRectoriaCourseGroupKey(course = {}) {
  const gradeKey = String(course.gradeKey || course.studentGradeKey || course.gradeLevel || '').trim();
  const section = String(course.section || course.key || course.label || '').trim();
  return `${gradeKey}::${section}`;
}

function normalizeInstitutionalLabelCompare(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, ' ');
}

function looksLikeTechnicalCourseKey(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return true;
  }

  if (/^[0-9]+[A-Z]?$/i.test(normalized) || /^[A-Z]$/i.test(normalized)) {
    return false;
  }

  return normalized.includes('_') || /^[A-Z0-9_:-]+$/.test(normalized);
}

function formatRectoriaInstitutionalCourseLabel(course = {}, labelContext = {}) {
  const getGradeLabel = labelContext.getGradeLabel || ((value) => String(value || '').trim());
  const getCourseLabel = labelContext.getCourseLabel || ((value) => String(value || '').trim());
  const getSubjectLabel = labelContext.getSubjectLabel || ((value) => String(value || '').trim());

  const subjectKey = String(course.subject || '').trim();
  const subjectLabel = getSubjectLabel(subjectKey) || subjectKey;
  const gradeKey = normalizeAcademicGradeKey(
    course.gradeKey || course.studentGradeKey || course.gradeLevel || ''
  );
  const gradeLabel = gradeKey ? getGradeLabel(gradeKey) : '';

  const sourceCourseKey = String(course.sourceCourseKey || '').trim();
  const sectionValue = String(course.section || '').trim();
  const courseKeyCandidate = sourceCourseKey || sectionValue;
  let courseGroupLabel = courseKeyCandidate ? getCourseLabel(courseKeyCandidate) : '';

  if (
    !courseGroupLabel
    || courseGroupLabel === courseKeyCandidate
    || looksLikeTechnicalCourseKey(courseGroupLabel)
  ) {
    if (/^[A-Z]$/i.test(sectionValue) && gradeLabel) {
      courseGroupLabel = `${gradeLabel}${sectionValue.toUpperCase()}`;
    } else {
      courseGroupLabel = gradeLabel;
    }
  }

  const parts = [];
  if (subjectLabel) {
    parts.push(subjectLabel);
  }

  const subjectCompare = normalizeInstitutionalLabelCompare(subjectLabel);
  const groupCompare = normalizeInstitutionalLabelCompare(courseGroupLabel);
  const gradeCompare = normalizeInstitutionalLabelCompare(gradeLabel);

  if (courseGroupLabel && groupCompare && groupCompare !== subjectCompare && !subjectCompare.includes(groupCompare)) {
    parts.push(courseGroupLabel);
  } else if (gradeLabel && gradeCompare !== subjectCompare && !parts.some((part) => normalizeInstitutionalLabelCompare(part) === gradeCompare)) {
    parts.push(gradeLabel);
  }

  return parts.filter(Boolean).join(' · ') || subjectLabel || 'Curso';
}

function resolveRectoriaPerformanceMeta(score, gradingScale = defaultAcademicGradingScale) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return { tone: 'neutral', label: 'Sin calificaciones', color: '#64748b' };
  }

  const performanceLevels = Array.isArray(gradingScale?.performanceLevels) && gradingScale.performanceLevels.length > 0
    ? gradingScale.performanceLevels
    : defaultAcademicPerformanceLevels;
  const match = performanceLevels.find((level) => (
    numericScore >= Number(level.minScore)
    && numericScore <= Number(level.maxScore)
  ));
  const passingScore = Number(gradingScale?.passingScore ?? defaultAcademicGradingScale.passingScore);

  if (numericScore < passingScore) {
    return { tone: 'danger', label: match?.label || 'Bajo umbral', color: match?.color || '#ef4444' };
  }

  if (numericScore < passingScore + Math.max(4, (Number(gradingScale?.maxScore || 100) - passingScore) * 0.15)) {
    return { tone: 'warn', label: match?.label || 'En umbral', color: match?.color || '#f97316' };
  }

  return { tone: 'good', label: match?.label || 'Aprobado', color: match?.color || '#15803d' };
}

function buildRectoriaStudentPerformanceRows(courses = [], { teacherLabelById = {} } = {}) {
  const buckets = new Map();

  courses.forEach((course) => {
    const evaluatedStudents = Array.isArray(course.stats?.evaluatedStudents) ? course.stats.evaluatedStudents : [];
    evaluatedStudents.forEach((student) => {
      const studentKey = buildRectoriaStudentScoreKey(student);
      if (!studentKey || !Number.isFinite(Number(student.finalScore))) {
        return;
      }

      const current = buckets.get(studentKey) || {
        studentId: student.studentId,
        name: student.name,
        schoolCode: student.schoolCode,
        grade: student.grade || course.gradeKey,
        scores: [],
        courseLabels: new Set(),
        subjects: new Set(),
        teacherLabels: new Set(),
      };

      current.scores.push(Number(student.finalScore));
      if (course.displayLabel) {
        current.courseLabels.add(course.displayLabel);
      } else if (course.label) {
        current.courseLabels.add(course.label);
      }
      if (course.subject) current.subjects.add(course.subject);
      current.teacherLabels.add(teacherLabelById[course.teacherUserId] || 'Docente sin asignar');
      buckets.set(studentKey, current);
    });
  });

  return Array.from(buckets.values())
    .map((student) => ({
      studentId: student.studentId,
      name: student.name,
      schoolCode: student.schoolCode,
      grade: student.grade,
      finalScore: student.scores.length > 0
        ? Number((student.scores.reduce((sum, score) => sum + score, 0) / student.scores.length).toFixed(2))
        : null,
      courseLabel: Array.from(student.courseLabels).slice(0, 2).join(' · ') || 'Curso',
      subject: Array.from(student.subjects).slice(0, 2).join(' · ') || 'Asignatura',
      teacherLabel: Array.from(student.teacherLabels).slice(0, 2).join(' · ') || 'Docente sin asignar',
    }))
    .filter((student) => Number.isFinite(Number(student.finalScore)));
}

function buildRectoriaInstitutionalPerformanceSnapshot({
  courses = [],
  gradingScale = defaultAcademicGradingScale,
  teacherLabelById = {},
  educationalLevelSummaries = [],
  groupedEducationalLevels = [],
  courseAttentionScore = 70,
}) {
  const passingScore = Number(gradingScale.passingScore ?? defaultAcademicGradingScale.passingScore);
  const coursesWithAverage = courses.filter((course) => (
    Number(course.stats?.evaluatedStudentCount || 0) > 0
    && Number.isFinite(Number(course.averageScore))
    && Array.isArray(course.stats?.evaluatedStudents)
    && course.stats.evaluatedStudents.some((student) => Number.isFinite(Number(student.finalScore)))
  ));

  const evaluatedStudents = buildRectoriaStudentPerformanceRows(coursesWithAverage, { teacherLabelById });
  const evaluatedStudentCount = evaluatedStudents.length;
  const weightedAverage = evaluatedStudentCount > 0
    ? Number((evaluatedStudents.reduce((sum, student) => sum + Number(student.finalScore || 0), 0) / evaluatedStudentCount).toFixed(2))
    : null;
  const atRiskStudents = evaluatedStudents
    .filter((student) => Number(student.finalScore) < passingScore)
    .sort((left, right) => Number(left.finalScore || 0) - Number(right.finalScore || 0));

  const courseAttentionBuckets = coursesWithAverage
    .filter((course) => Number(course.averageScore) < courseAttentionScore || Number(course.atRiskCount || 0) > 0)
    .reduce((accumulator, course) => {
      const groupKey = buildRectoriaCourseGroupKey(course);
        const current = accumulator.get(groupKey) || {
          ...course,
          key: groupKey,
          label: course.displayLabel || course.section || course.label,
        subjects: [],
        atRiskCount: 0,
        evaluatedStudentCount: 0,
        weightedScoreTotal: 0,
      };
      current.subjects.push(course.subject);
      current.atRiskCount += Number(course.atRiskCount || 0);
      current.evaluatedStudentCount += Number(course.evaluatedStudentCount || 0);
      current.weightedScoreTotal += Number(course.averageScore || 0) * Number(course.evaluatedStudentCount || 0);
      current.averageScore = current.evaluatedStudentCount > 0
        ? Number((current.weightedScoreTotal / current.evaluatedStudentCount).toFixed(2))
        : course.averageScore;
      accumulator.set(groupKey, current);
      return accumulator;
    }, new Map());

  const coursesNeedingAttention = Array.from(courseAttentionBuckets.values())
    .sort((left, right) => Number(right.atRiskCount || 0) - Number(left.atRiskCount || 0) || Number(left.averageScore || 10) - Number(right.averageScore || 10));

  const teacherBuckets = coursesWithAverage.reduce((accumulator, course) => {
    const teacherKey = String(course.teacherUserId || 'sin-docente');
    if (!accumulator[teacherKey]) {
      accumulator[teacherKey] = {
        key: teacherKey,
        label: teacherLabelById[teacherKey] || 'Docente sin asignar',
        courseIds: new Set(),
        studentKeys: new Set(),
        atRiskStudentKeys: new Set(),
        pendingGradingCount: 0,
        scoreTotal: 0,
        scoreCount: 0,
      };
    }

    const current = accumulator[teacherKey];
    current.courseIds.add(String(course.id || course.key || course.label || ''));
    current.pendingGradingCount += Number(course.pendingGradingCount || 0);
    (Array.isArray(course.stats?.evaluatedStudents) ? course.stats.evaluatedStudents : []).forEach((student) => {
      const studentKey = buildRectoriaStudentScoreKey(student);
      if (!studentKey || !Number.isFinite(Number(student.finalScore))) {
        return;
      }

      current.studentKeys.add(studentKey);
      current.scoreTotal += Number(student.finalScore);
      current.scoreCount += 1;
      if (Number(student.finalScore) < passingScore) {
        current.atRiskStudentKeys.add(studentKey);
      }
    });

    return accumulator;
  }, {});

  const teacherAttentionRows = Object.values(teacherBuckets)
    .map((teacher) => ({
      key: teacher.key,
      label: teacher.label,
      coursesCount: teacher.courseIds.size,
      evaluatedStudentCount: teacher.studentKeys.size,
      atRiskCount: teacher.atRiskStudentKeys.size,
      pendingGradingCount: teacher.pendingGradingCount,
      averageScore: teacher.scoreCount > 0 ? Number((teacher.scoreTotal / teacher.scoreCount).toFixed(2)) : null,
    }))
    .filter((teacher) => teacher.averageScore !== null)
    .sort((left, right) => Number(right.atRiskCount || 0) - Number(left.atRiskCount || 0) || Number(left.averageScore || 10) - Number(right.averageScore || 10));

  const levelRows = educationalLevelSummaries.map((level) => {
    const gradeKeys = new Set((groupedEducationalLevels.find((group) => group.key === level.key)?.grades || []).map((grade) => grade.key));
    const levelCourses = coursesWithAverage.filter((course) => gradeKeys.has(course.gradeKey));
    const levelStudents = buildRectoriaStudentPerformanceRows(levelCourses, { teacherLabelById });
    const levelAverage = levelStudents.length > 0
      ? Number((levelStudents.reduce((sum, student) => sum + Number(student.finalScore || 0), 0) / levelStudents.length).toFixed(2))
      : null;
    const levelAtRisk = levelStudents.filter((student) => Number(student.finalScore) < passingScore).length;
    const attentionCourses = levelCourses.filter((course) => (
      Number(course.averageScore) < courseAttentionScore || Number(course.atRiskCount || 0) > 0
    ));

    return {
      ...level,
      averageScore: levelAverage,
      evaluatedStudentCount: levelStudents.length,
      atRiskCount: levelAtRisk,
      lowCoursesCount: new Set(attentionCourses.map(buildRectoriaCourseGroupKey)).size,
      lowestCourses: levelCourses
        .filter((course) => Number(course.stats?.evaluatedStudentCount || 0) > 0 && Number.isFinite(Number(course.averageScore)))
        .sort((left, right) => Number(left.averageScore || 10) - Number(right.averageScore || 10))
        .slice(0, 3),
      performanceMeta: resolveRectoriaPerformanceMeta(levelAverage, gradingScale),
    };
  });

  return {
    coursesWithAverage,
    weightedAverage,
    evaluatedStudentCount,
    atRiskStudents,
    coursesNeedingAttention,
    teacherAttentionRows,
    levelRows,
    pendingGradingCount: courses.reduce((sum, course) => sum + Number(course.pendingGradingCount || 0), 0),
    performanceMeta: resolveRectoriaPerformanceMeta(weightedAverage, gradingScale),
  };
}

function createDefaultAcademicScheduleGroupSettings(index = 0, { weekdays = [], gradeKeys = [] } = {}) {
  return {
    key: `schedule_group_${index + 1}`,
    name: '',
    weekdays: weekdays.map(Number).filter((weekday) => ACADEMIC_SCHEDULE_WEEKDAYS.some((item) => item.value === weekday)),
    gradeKeys: gradeKeys.map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean),
    dayStartTime: '07:00',
    blocks: createDefaultAcademicScheduleDayBlocks(),
    order: (index + 1) * 10,
  };
}

const DEFAULT_ACADEMIC_SCHEDULE_SETTINGS = {
  groups: [],
};

function isImplicitDefaultAcademicScheduleGroup(group, totalGroups = 0) {
  const normalizedName = String(group?.name || '').trim();
  const normalizedWeekdays = Array.from(new Set((Array.isArray(group?.weekdays) ? group.weekdays : []).map(Number))).sort((left, right) => left - right);
  const expectedWeekdays = ACADEMIC_SCHEDULE_WEEKDAYS.map((weekday) => weekday.value);
  const normalizedGradeKeys = (Array.isArray(group?.gradeKeys) ? group.gradeKeys : []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean);
  const normalizedBlocks = Array.isArray(group?.blocks) ? group.blocks : [];
  const hasDefaultBlocks = normalizedBlocks.length === 8
    && normalizedBlocks.every((block, index) => Number(block?.durationMinutes || 0) === 60 && Number(block?.order || 0) === (index + 1) * 10);

  return totalGroups === 1
    && normalizedGradeKeys.length === 0
    && String(group?.dayStartTime || '').trim() === '07:00'
    && hasDefaultBlocks
    && normalizedWeekdays.length === expectedWeekdays.length
    && normalizedWeekdays.every((weekday, index) => weekday === expectedWeekdays[index])
    && (!normalizedName || normalizedName === 'Jornada general' || DEFAULT_ACADEMIC_SCHEDULE_GROUP_NAME_PATTERN.test(normalizedName));
}

function sanitizeAcademicScheduleGroups(groups = []) {
  const normalizedGroups = Array.isArray(groups) ? groups : [];
  if (normalizedGroups.length !== 1) {
    return normalizedGroups;
  }

  return isImplicitDefaultAcademicScheduleGroup(normalizedGroups[0], normalizedGroups.length) ? [] : normalizedGroups;
}

const NEW_SCHEDULE_GROUP_KEY = '__new_schedule_group__';
const NEW_SUBJECT_LOAD_TEMPLATE_KEY = '__new_subject_load_template__';
const NEW_TEACHING_AVAILABILITY_KEY = '__new_teaching_availability__';

function createDefaultAcademicSubjectLoadTemplate(index = 0, { gradeKeys = [] } = {}) {
  return {
    key: `subject_load_template_${index + 1}`,
    subjectKey: '',
    teacherUserId: '',
    weeklyHours: 0,
    gradeKeys: gradeKeys.map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean),
    order: (index + 1) * 10,
  };
}

function createDefaultAcademicTeachingAvailability(index = 0, { weekdays = [1], gradeKeys = [] } = {}) {
  return {
    key: `teaching_availability_${index + 1}`,
    subjectKey: '',
    teacherUserId: '',
    gradeKeys: gradeKeys.map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean),
    windows: Array.from(new Set((Array.isArray(weekdays) ? weekdays : []).map(Number))).map((weekday) => ({
      weekday,
      startTime: '07:00',
      endTime: '12:00',
    })),
    order: (index + 1) * 10,
  };
}

function normalizeAcademicSubjectLoadTemplates(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((item, index) => ({
      key: String(item?.key || `subject_load_template_${index + 1}`).trim(),
      subjectKey: String(item?.subjectKey || '').trim(),
      teacherUserId: String(item?.teacherUserId || '').trim(),
      weeklyHours: Math.max(0, Math.min(40, Number(item?.weeklyHours || 0))),
      gradeKeys: Array.from(new Set((Array.isArray(item?.gradeKeys) ? item.gradeKeys : []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean))),
      order: Number(item?.order || (index + 1) * 10),
    }))
    .filter((item) => item.subjectKey)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
}

function normalizeAcademicTeachingAvailability(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((item, index) => ({
      key: String(item?.key || `teaching_availability_${index + 1}`).trim(),
      subjectKey: String(item?.subjectKey || '').trim(),
      teacherUserId: String(item?.teacherUserId || '').trim(),
      gradeKeys: Array.from(new Set((Array.isArray(item?.gradeKeys) ? item.gradeKeys : []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean))),
      windows: (Array.isArray(item?.windows) ? item.windows : [])
        .map((windowItem) => ({
          weekday: Number(windowItem?.weekday || 0),
          startTime: String(windowItem?.startTime || '07:00').trim() || '07:00',
          endTime: String(windowItem?.endTime || '12:00').trim() || '12:00',
        }))
        .filter((windowItem) => ACADEMIC_SCHEDULE_WEEKDAYS.some((weekday) => weekday.value === windowItem.weekday))
        .sort((left, right) => left.weekday - right.weekday),
      order: Number(item?.order || (index + 1) * 10),
    }))
    .filter((item) => item.subjectKey && item.teacherUserId)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
}

const emptyChargeForm = {
  concept: '',
  description: '',
  amount: '',
  dueDate: '',
  audienceType: 'general',
  gradeTargets: [],
  courseTargets: [],
  parentTargets: [],
  studentTargets: [],
};

const HR_REQUEST_STATUS_LABELS = {
  pending_coordination_review: 'Revisión coordinación',
  consolidated: 'Consolidada',
  pending_hr_review: 'Revisión RRHH',
  pending_purchasing_review: 'Gestión de compras',
  pending_approval: 'Pendiente aprobación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  delivered: 'Entregada',
  partially_delivered: 'Parcial',
  cancelled: 'Cancelada',
};

function createEmptyResourcePlannerCycleDraft() {
  return {
    title: '',
    startDate: '',
    endDate: '',
    submissionDeadline: '',
    instructions: '',
  };
}

function formatResourceDate(value) {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
  return parsed.toLocaleDateString('es-CO', { dateStyle: 'medium' });
}

function getResourceRequestItemsLabel(request) {
  const items = Array.isArray(request?.items) ? request.items : [];
  if (!items.length) return 'Sin materiales registrados';
  return items
    .map((entry) => `${entry.item?.name || entry.customName || 'Material'} x${entry.quantity}`)
    .join(' · ');
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return 'Sin fecha';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function formatDate(value) {
  if (!value) {
    return 'Sin fecha';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function formatGenderLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'female') return 'Femenino';
  if (normalized === 'male') return 'Masculino';
  if (normalized === 'other') return 'Otro';
  return value || 'No definido';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEducationalLevelKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function normalizeAcademicGradeKey(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }

  if (/^\d{1,2}$/.test(normalized)) {
    return normalized;
  }

  const normalizedLetters = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (normalizedLetters.includes('prejardin')) return 'Prejardin';
  if (normalizedLetters.includes('jardin')) return 'Jardin';
  if (normalizedLetters.includes('transicion')) return 'Transicion';

  if (/[a-z]/i.test(normalized)) {
    return normalizeEducationalLevelKey(normalized);
  }

  const leadingNumericMatch = normalized.match(/^(\d{1,2})/);
  if (leadingNumericMatch) {
    return leadingNumericMatch[1];
  }

  return normalizeEducationalLevelKey(normalized) || normalized;
}

function normalizeAcademicScheduleSlotKey(weekday, block) {
  return `d${Number(weekday)}_b${Number(block)}`;
}

function academicScheduleTimeToMinutes(value) {
  const normalized = normalizeText(value);
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    return null;
  }

  const [hours, minutes] = normalized.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return (hours * 60) + minutes;
}

function academicScheduleMinutesToTime(totalMinutes) {
  const hours = Math.floor(Number(totalMinutes || 0) / 60);
  const minutes = Number(totalMinutes || 0) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function academicScheduleMinutesToAmPmLabel(totalMinutes) {
  const normalizedMinutes = Number(totalMinutes || 0);
  const hours24 = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}

function getAcademicScheduleGroupEndTime(group) {
  const blocks = buildAcademicScheduleBlocksFromGroup(group);
  return blocks.length > 0 ? String(blocks[blocks.length - 1].endTime || group?.dayStartTime || '07:00') : String(group?.dayStartTime || '07:00');
}

function splitAcademicMeridiemTime(value) {
  const normalized = normalizeText(value);
  const minutes = academicScheduleTimeToMinutes(normalized);
  if (minutes === null) {
    return { time: '07:00', meridiem: 'am' };
  }

  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const meridiem = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 || 12;
  return {
    time: `${String(hours12).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
    meridiem,
  };
}

function convertAcademicMeridiemTimeTo24Hour(value, meridiem) {
  const normalized = normalizeText(value);
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return '';
  }

  const hours12 = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours12) || hours12 < 1 || hours12 > 12 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return '';
  }

  const normalizedMeridiem = String(meridiem || 'am').trim().toLowerCase() === 'pm' ? 'pm' : 'am';
  let hours24 = hours12 % 12;
  if (normalizedMeridiem === 'pm') {
    hours24 += 12;
  }

  return `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function isValidAcademicScheduleTime(value) {
  return academicScheduleTimeToMinutes(normalizeText(value)) !== null;
}

function buildAcademicScheduleBlocksFromRange(startTime, endTime) {
  const startMinutes = academicScheduleTimeToMinutes(startTime);
  const endMinutes = academicScheduleTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return [];
  }

  const totalMinutes = endMinutes - startMinutes;
  if (totalMinutes % 15 !== 0) {
    return [];
  }

  const blocks = [];
  const blockCount = totalMinutes / 15;
  for (let index = 0; index < blockCount; index += 1) {
    const blockIndex = index + 1;
    blocks.push({
      block: blockIndex,
      durationMinutes: 15,
      order: blockIndex * 10,
    });
  }

  return blocks;
}

function buildAcademicScheduleBlocksFromGroup(group) {
  let runningMinutes = academicScheduleTimeToMinutes(group?.dayStartTime);
  if (runningMinutes === null) {
    runningMinutes = academicScheduleTimeToMinutes('07:00');
  }

  const slots = [];
  (Array.isArray(group?.blocks) ? group.blocks : createDefaultAcademicScheduleDayBlocks()).forEach((item) => {
    const durationMinutes = Number(item?.durationMinutes || 60);
    const parts = Math.max(1, Math.ceil(durationMinutes / 15));
    for (let index = 0; index < parts; index += 1) {
      const slotStart = runningMinutes;
      const slotEnd = Math.min(runningMinutes + 15, slotStart + durationMinutes - (index * 15));
      runningMinutes = slotEnd;
      const block = slots.length + 1;
      slots.push({
        block,
        durationMinutes: Math.max(15, slotEnd - slotStart),
        startTime: academicScheduleMinutesToTime(slotStart),
        endTime: academicScheduleMinutesToTime(slotEnd),
        label: `${academicScheduleMinutesToTime(slotStart)} - ${academicScheduleMinutesToTime(slotEnd)}`,
        order: block * 10,
      });
    }
  });

  return slots;
}

function resolveAcademicScheduleGroup(groups, weekday, gradeKey) {
  const normalizedWeekday = Number(weekday || 0);
  const normalizedGradeKey = normalizeAcademicGradeKey(gradeKey);
  const candidates = (Array.isArray(groups) ? groups : []).filter((group) => Array.isArray(group?.weekdays) && group.weekdays.includes(normalizedWeekday));
  const specificMatch = normalizedGradeKey
    ? candidates.find((group) => Array.isArray(group?.gradeKeys) && group.gradeKeys.includes(normalizedGradeKey))
    : null;
  if (specificMatch) {
    return specificMatch;
  }

  const universalMatch = candidates.find((group) => !Array.isArray(group?.gradeKeys) || group.gradeKeys.length === 0);
  if (universalMatch) {
    return universalMatch;
  }

  return createDefaultAcademicScheduleGroupSettings(0, { weekdays: [normalizedWeekday], gradeKeys: normalizedGradeKey ? [normalizedGradeKey] : [] });
}

function normalizeAcademicScheduleSettings(raw) {
  const incomingGroups = Array.isArray(raw?.groups) && raw.groups.length > 0 ? raw.groups : null;
  const incomingDays = Array.isArray(raw?.days) && raw.days.length > 0 ? raw.days : null;
  const legacyDayStartTime = normalizeText(raw?.dayStartTime);
  const legacyBlocks = Array.isArray(raw?.blocks) && raw.blocks.length > 0 ? raw.blocks : null;
  const groupsSource = incomingGroups && incomingGroups.length > 0
    ? incomingGroups
    : incomingDays && incomingDays.length > 0
      ? incomingDays.map((day, index) => ({
        key: String(day?.key || `schedule_group_day_${index + 1}`).trim(),
        name: String(day?.name || '').trim(),
        weekdays: [Number(day?.weekday || 0)],
        gradeKeys: [],
        dayStartTime: String(day?.dayStartTime || '').trim(),
        blocks: day?.blocks,
        order: Number(day?.order || (index + 1) * 10),
      }))
      : legacyBlocks || legacyDayStartTime
        ? [{
          key: 'schedule_group_legacy',
          name: 'Jornada general',
          weekdays: ACADEMIC_SCHEDULE_WEEKDAYS.map((weekday) => weekday.value),
          gradeKeys: [],
          dayStartTime: legacyDayStartTime,
          blocks: legacyBlocks,
          order: 10,
        }]
        : [];

  const normalizedGroups = groupsSource.map((group, index) => {
    const blocks = Array.isArray(group?.blocks) && group.blocks.length > 0
      ? group.blocks
      : createDefaultAcademicScheduleDayBlocks();
    return {
      key: String(group?.key || `schedule_group_${index + 1}`).trim(),
      name: String(group?.name || '').trim() || `Jornada ${index + 1}`,
      weekdays: Array.from(new Set((Array.isArray(group?.weekdays) ? group.weekdays : []).map(Number))).filter((weekday) => ACADEMIC_SCHEDULE_WEEKDAYS.some((item) => item.value === weekday)),
      gradeKeys: Array.from(new Set((Array.isArray(group?.gradeKeys) ? group.gradeKeys : []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean))),
      dayStartTime: String(group?.dayStartTime || legacyDayStartTime || '07:00').trim() || '07:00',
      blocks: blocks.map((item, blockIndex) => ({
        block: blockIndex + 1,
        durationMinutes: ACADEMIC_SCHEDULE_ALLOWED_DURATIONS.includes(Number(item?.durationMinutes))
          ? Number(item.durationMinutes)
          : 60,
        order: Number(item?.order || (blockIndex + 1) * 10),
      })),
      order: Number(group?.order || (index + 1) * 10),
    };
  }).filter((group) => group.weekdays.length > 0);

  return {
    groups: sanitizeAcademicScheduleGroups(normalizedGroups),
  };
}

function buildAcademicScheduleBlocksByWeekday(scheduleSettings, { gradeKey = '' } = {}) {
  const normalizedSettings = normalizeAcademicScheduleSettings(scheduleSettings);
  return ACADEMIC_SCHEDULE_WEEKDAYS.reduce((accumulator, weekday) => {
    const matchedGroup = resolveAcademicScheduleGroup(normalizedSettings.groups, weekday.value, gradeKey);
    accumulator[weekday.value] = buildAcademicScheduleBlocksFromGroup(matchedGroup).map((slot) => ({ ...slot, weekday: weekday.value }));
    return accumulator;
  }, {});
}

function buildConfiguredAcademicScheduleBlocksByWeekday(groups = [], { gradeKey = '' } = {}) {
  const normalizedGradeKey = normalizeAcademicGradeKey(gradeKey);
  return ACADEMIC_SCHEDULE_WEEKDAYS.reduce((accumulator, weekday) => {
    const candidates = (Array.isArray(groups) ? groups : []).filter((group) => Array.isArray(group?.weekdays) && group.weekdays.includes(weekday.value));
    const matchedGroup = normalizedGradeKey
      ? candidates.find((group) => Array.isArray(group?.gradeKeys) && group.gradeKeys.includes(normalizedGradeKey))
      : null;
    const universalGroup = candidates.find((group) => !Array.isArray(group?.gradeKeys) || group.gradeKeys.length === 0);
    const group = matchedGroup || universalGroup || null;
    accumulator[weekday.value] = group ? buildAcademicScheduleBlocksFromGroup(group).map((slot) => ({ ...slot, weekday: weekday.value })) : [];
    return accumulator;
  }, {});
}

function buildAcademicScheduleBlocks(scheduleSettings, { gradeKey = '', weekday = null } = {}) {
  const blocksByWeekday = buildAcademicScheduleBlocksByWeekday(scheduleSettings, { gradeKey });
  if (weekday !== null) {
    return blocksByWeekday[weekday] || [];
  }

  return ACADEMIC_SCHEDULE_WEEKDAYS.flatMap((day) => blocksByWeekday[day.value] || []);
}

function createDefaultAcademicScheduleTemplate(scheduleSettings = DEFAULT_ACADEMIC_SCHEDULE_SETTINGS, { gradeKey = '' } = {}) {
  const blocksByWeekday = buildAcademicScheduleBlocksByWeekday(scheduleSettings, { gradeKey });
  return ACADEMIC_SCHEDULE_WEEKDAYS.flatMap((weekday) => (
    (blocksByWeekday[weekday.value] || []).map((slot) => ({
      key: normalizeAcademicScheduleSlotKey(weekday.value, slot.block),
      weekday: weekday.value,
      block: slot.block,
      startTime: slot.startTime,
      endTime: slot.endTime,
      subjectKey: '',
      teacherUserId: '',
    }))
  ));
}

function buildSharedAcademicScheduleBlocksForGrades(scheduleSettings, gradeKeys = [], weekday) {
  const normalizedGradeKeys = Array.from(new Set((Array.isArray(gradeKeys) ? gradeKeys : []).map((gradeKey) => normalizeAcademicGradeKey(gradeKey)).filter(Boolean)));
  if (normalizedGradeKeys.length === 0) {
    return buildAcademicScheduleBlocks(scheduleSettings, { weekday });
  }

  const blocksPerGrade = normalizedGradeKeys.map((gradeKey) => buildAcademicScheduleBlocks(scheduleSettings, { gradeKey, weekday }));
  const referenceBlocks = blocksPerGrade[0] || [];
  return referenceBlocks.filter((referenceBlock) => (
    blocksPerGrade.every((gradeBlocks) => {
      const matchingBlock = gradeBlocks.find((item) => item.block === referenceBlock.block);
      return matchingBlock && matchingBlock.startTime === referenceBlock.startTime && matchingBlock.endTime === referenceBlock.endTime;
    })
  ));
}

function normalizeAcademicScheduleMatch(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function resolveCoordinationLevelKeys(academicStructure = {}, coordinationScope = '') {
  const normalizedScope = normalizeAcademicScheduleMatch(coordinationScope);
  const levels = Array.isArray(academicStructure?.levels) ? academicStructure.levels : [];

  if (!normalizedScope) {
    return new Set();
  }

  const exactMatches = levels.filter((level) => {
    const levelKey = normalizeAcademicScheduleMatch(level?.key);
    const levelLabel = normalizeAcademicScheduleMatch(level?.label);
    return normalizedScope === levelKey || normalizedScope === levelLabel;
  });

  const matchedLevels = exactMatches.length > 0
    ? exactMatches
    : levels.filter((level) => {
      const levelKey = normalizeAcademicScheduleMatch(level?.key);
      const levelLabel = normalizeAcademicScheduleMatch(level?.label);
      return levelKey.includes(normalizedScope)
        || levelLabel.includes(normalizedScope)
        || normalizedScope.includes(levelKey)
        || normalizedScope.includes(levelLabel);
    });

  return new Set(matchedLevels.map((level) => String(level?.key || '').trim()).filter(Boolean));
}

function filterAcademicStructureByLevelKeys(academicStructure = {}, levelKeys = new Set()) {
  if (!levelKeys?.size) {
    return academicStructure;
  }

  const grades = (Array.isArray(academicStructure.grades) ? academicStructure.grades : [])
    .filter((grade) => levelKeys.has(String(grade?.levelKey || '').trim()));
  const gradeKeys = new Set(grades.map((grade) => String(grade?.key || '').trim()).filter(Boolean));
  const filterGradeKeys = (values = []) => (Array.isArray(values) ? values : [])
    .map((gradeKey) => String(gradeKey || '').trim())
    .filter((gradeKey) => gradeKeys.has(gradeKey));

  return {
    ...academicStructure,
    levels: (Array.isArray(academicStructure.levels) ? academicStructure.levels : [])
      .filter((level) => levelKeys.has(String(level?.key || '').trim())),
    grades,
    subjects: (Array.isArray(academicStructure.subjects) ? academicStructure.subjects : [])
      .map((subject) => ({ ...subject, gradeKeys: filterGradeKeys(subject.gradeKeys) }))
      .filter((subject) => subject.gradeKeys.length > 0),
    gradeSchedules: (Array.isArray(academicStructure.gradeSchedules) ? academicStructure.gradeSchedules : [])
      .filter((schedule) => gradeKeys.has(String(schedule?.gradeKey || '').trim())),
    scheduleBreaks: (Array.isArray(academicStructure.scheduleBreaks) ? academicStructure.scheduleBreaks : [])
      .map((item) => ({ ...item, gradeKeys: filterGradeKeys(item.gradeKeys) }))
      .filter((item) => item.gradeKeys.length > 0),
    subjectLoadTemplates: (Array.isArray(academicStructure.subjectLoadTemplates) ? academicStructure.subjectLoadTemplates : [])
      .map((item) => ({ ...item, gradeKeys: filterGradeKeys(item.gradeKeys) }))
      .filter((item) => !Array.isArray(item.gradeKeys) || item.gradeKeys.length > 0),
    teachingAvailability: (Array.isArray(academicStructure.teachingAvailability) ? academicStructure.teachingAvailability : [])
      .map((item) => ({ ...item, gradeKeys: filterGradeKeys(item.gradeKeys) }))
      .filter((item) => !Array.isArray(item.gradeKeys) || item.gradeKeys.length > 0),
    scheduleSettings: {
      ...(academicStructure.scheduleSettings || {}),
      groups: (Array.isArray(academicStructure.scheduleSettings?.groups) ? academicStructure.scheduleSettings.groups : [])
        .map((group) => ({ ...group, gradeKeys: filterGradeKeys(group.gradeKeys) }))
        .filter((group) => group.gradeKeys.length > 0),
    },
  };
}

function filterStudentsByGradeKeys(students = [], gradeKeys = new Set()) {
  if (!gradeKeys?.size) {
    return students;
  }

  const scopedGradeKeys = [...gradeKeys];
  return (Array.isArray(students) ? students : [])
    .filter((student) => studentMatchesAnyGradeKey(student?.grade, scopedGradeKeys));
}

function filterBillingBootstrapByGradeKeys(bootstrap = {}, gradeKeys = new Set()) {
  if (!gradeKeys?.size) {
    return bootstrap;
  }

  const scopedGradeKeys = [...gradeKeys];
  const gradeMatches = (value) => studentMatchesAnyGradeKey(value, scopedGradeKeys);
  const courseKeySet = new Set((Array.isArray(bootstrap.courseOptions) ? bootstrap.courseOptions : [])
    .filter((course) => gradeMatches(course?.gradeKey || course?.gradeLabel))
    .map((course) => String(course?.value || '').trim())
    .filter(Boolean));

  return {
    ...bootstrap,
    students: filterStudentsByGradeKeys(bootstrap.students, gradeKeys),
    grades: (Array.isArray(bootstrap.grades) ? bootstrap.grades : []).filter(gradeMatches),
    courses: (Array.isArray(bootstrap.courses) ? bootstrap.courses : []).filter((course) => courseKeySet.size === 0 || courseKeySet.has(String(course || '').trim())),
    courseOptions: (Array.isArray(bootstrap.courseOptions) ? bootstrap.courseOptions : []).filter((course) => gradeMatches(course?.gradeKey || course?.gradeLabel)),
    campusCourses: (Array.isArray(bootstrap.campusCourses) ? bootstrap.campusCourses : []).filter((course) => gradeMatches(course?.gradeKey || course?.gradeLevel || course?.studentGradeKey)),
    academicDatabase: (Array.isArray(bootstrap.academicDatabase) ? bootstrap.academicDatabase : []).filter((row) => gradeMatches(row?.grade)),
  };
}

function normalizePhoneForWhatsapp(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) {
    return '';
  }

  if (digits.length === 10) {
    return `57${digits}`;
  }

  return digits;
}

function buildWhatsappMessage({ parentName, schoolName, amount, overdueDays }) {
  return `Estimado/a ${parentName || 'acudiente'},\n\nReciba un cordial saludo de parte del colegio ${schoolName || 'Comergio'}.\n\nLe informamos que actualmente presenta un saldo pendiente por valor de ${formatCurrency(amount)} correspondiente a obligaciones escolares, con ${Number(overdueDays || 0)} dias vencidos.\n\nAgradecemos realizar el pago a la mayor brevedad posible para evitar inconvenientes en los servicios académicos.\n\nSi ya realizó el pago, por favor omitir este mensaje o enviarnos el soporte para actualizar su estado.\n\nQuedamos atentos a cualquier inquietud.`;
}

function buildBillingMessageDraft({ parentName, schoolName, amount, overdueDays }) {
  return `Estimado/a ${parentName || 'acudiente'},\n\nReciba un cordial saludo de parte del colegio ${schoolName || 'Comergio'}.\n\nLe informamos que actualmente presenta un saldo pendiente por valor de ${formatCurrency(amount)} con ${Number(overdueDays || 0)} dias de mora.\n\nAgradecemos realizar el pago a la mayor brevedad posible.\n\nQuedamos atentos a cualquier inquietud.`;
}

function followUpActionLabel(value) {
  if (value === 'push_email') return 'Push + correo';
  if (value === 'whatsapp') return 'WhatsApp';
  if (value === 'manual_note') return 'Nota manual';
  return value || 'Seguimiento';
}

function ClickableOptionPicker({ label, options = [], selectedValues = [], emptyLabel, onAdd, onRemove }) {
  const selectedSet = new Set((selectedValues || []).map((value) => String(value)));
  const availableOptions = (options || []).filter((option) => !selectedSet.has(String(option.value)));

  return (
    <div className="rectoria-selection-group">
      <div className="rectoria-selection-label">{label}</div>
      <div className="rectoria-option-list" role="listbox" aria-label={label}>
        {availableOptions.length === 0 ? (
          <p className="rectoria-option-list-empty">No hay más opciones disponibles.</p>
        ) : availableOptions.map((option) => (
          <button className="rectoria-option-item" key={String(option.value)} onClick={() => onAdd(String(option.value))} type="button">
            {option.label}
          </button>
        ))}
      </div>
      <div className="rectoria-selected-list">
        {(selectedValues || []).length === 0 ? <p className="rectoria-option-list-empty">{emptyLabel}</p> : null}
        {(selectedValues || []).map((value) => {
          const option = (options || []).find((item) => String(item.value) === String(value));
          return (
            <button className="rectoria-selected-chip" key={String(value)} onClick={() => onRemove(String(value))} type="button">
              {option?.label || value}
              <span>x</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NotificationIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function WhatsappIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20.5 11.5A8.5 8.5 0 0 1 8 19l-4 1 1.1-3.8A8.5 8.5 0 1 1 20.5 11.5Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M9.5 8.8c.2-.5.4-.5.7-.5h.6c.2 0 .4.1.5.4l.7 1.8c.1.2 0 .5-.1.7l-.5.6c-.1.1-.1.3 0 .4.4.7 1 1.4 1.7 1.8.2.1.3.1.4 0l.7-.5c.2-.1.5-.2.7-.1l1.7.8c.3.1.4.3.4.5v.6c0 .3 0 .5-.5.7-.4.2-1.1.3-2-.1a9 9 0 0 1-4.5-4.5c-.4-.9-.3-1.6-.1-2Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 20h9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function DownloadExcelIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M14 2v5h5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M12 11v6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="m9.5 14.5 2.5 2.5 2.5-2.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4h11l3 3v13H5z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M9 4v6h6V4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M9 17h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

const ACADEMIC_DATABASE_HEADERS = [
  'Grado',
  'Apellidos',
  'Nombres',
  'Genero',
  'Tipo doc. alumno',
  'Numero doc. alumno',
  'Fecha nacimiento',
  'Edad',
  'Tipo sangre',
  'Lugar nacimiento',
  'Direccion',
  'Nombre madre',
  'Tipo doc. madre',
  'Numero doc. madre',
  'Telefono madre',
  'Correo madre',
  'Nombre padre',
  'Tipo doc. padre',
  'Numero doc. padre',
  'Telefono padre',
  'Correo padre',
];

const ACADEMIC_DATABASE_TEMPLATE_ROWS = [[
  '5A',
  'Gomez',
  'Valentina',
  'female',
  'TI',
  '10203040',
  '2015-08-14',
  '10',
  'O+',
  'Barranquilla',
  'Cra 10 #20-30',
  'Laura Perez',
  'CC',
  '52345678',
  '3001234567',
  'laura@example.com',
  'Carlos Gomez',
  'CC',
  '80123456',
  '3009876543',
  'carlos@example.com',
]];

function formatDateForExcel(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function downloadExcelWorkbook(sheetName, headers, rows, fileBaseName) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileBaseName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function createAcademicDatabaseEditDraft(item) {
  return {
    grade: item?.grade || '',
    course: item?.course || '',
    lastName: item?.lastName || '',
    firstName: item?.firstName || '',
    gender: item?.gender || '',
    documentType: item?.documentType || '',
    documentNumber: item?.documentNumber || '',
    birthDate: formatDateForExcel(item?.birthDate),
    bloodType: item?.bloodType || '',
    birthPlace: item?.birthPlace || '',
    address: item?.address || '',
    motherId: item?.motherId || '',
    motherName: item?.motherName || '',
    motherDocumentType: item?.motherDocumentType || '',
    motherDocumentNumber: item?.motherDocumentNumber || '',
    motherPhone: item?.motherPhone || '',
    motherEmail: item?.motherEmail || '',
    fatherId: item?.fatherId || '',
    fatherName: item?.fatherName || '',
    fatherDocumentType: item?.fatherDocumentType || '',
    fatherDocumentNumber: item?.fatherDocumentNumber || '',
    fatherPhone: item?.fatherPhone || '',
    fatherEmail: item?.fatherEmail || '',
  };
}

function createEmptyUserForm() {
  return {
    title: 'Mr',
    name: '',
    username: '',
    phone: '',
    password: '',
    role: 'academic_secretary',
    coordinationScope: '',
    assignedSubjectsText: '',
  };
}

function createEmptyEditUserModal() {
  return {
    open: false,
    userId: '',
    name: '',
    username: '',
    password: '',
    error: '',
  };
}

function createEmptyBenefitRule(index = 0) {
  return {
    label: `Beneficio ${index + 1}`,
    startDay: 1,
    endDay: 10,
    discountType: 'percent',
    discountPercent: 0,
    fixedAmountsByGrade: {},
  };
}

function createEmptyEnrollmentBenefitRule(index = 0) {
  return {
    label: `Beneficio matricula ${index + 1}`,
    startDate: '',
    endDate: '',
    discountType: 'percent',
    discountPercent: 0,
    fixedAmountsByGrade: {},
  };
}

function createEmptyGradeSetting(grade = '', index = 0) {
  return {
    grade,
    enrollmentBonus: 0,
    enrollmentFee: 0,
    monthlyTuition: 0,
    dueDay: 10,
    benefitRules: [],
  };
}

function normalizeFeeBenefitRules(rules = []) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule, ruleIndex) => {
      const discountType = String(rule?.discountType || '').trim() === 'fixed' ? 'fixed' : 'percent';
      return {
        label: String(rule?.label || `Beneficio ${ruleIndex + 1}`).trim(),
        startDay: Number(rule?.startDay || 1),
        endDay: Number(rule?.endDay || 10),
        discountType,
        discountPercent: discountType === 'percent' ? Number(rule?.discountPercent || 0) : 0,
        fixedAmountsByGrade: normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade || {}),
      };
    })
    .filter((rule) => rule.label || rule.discountPercent > 0 || Object.values(rule.fixedAmountsByGrade || {}).some((amount) => Number(amount || 0) > 0));
}

function normalizeEnrollmentBenefitRules(rules = []) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule, ruleIndex) => {
      const discountType = String(rule?.discountType || '').trim() === 'fixed' ? 'fixed' : 'percent';
      return {
        label: String(rule?.label || `Beneficio matricula ${ruleIndex + 1}`).trim(),
        startDate: formatDateInputValue(rule?.startDate),
        endDate: formatDateInputValue(rule?.endDate),
        discountType,
        discountPercent: discountType === 'percent' ? Number(rule?.discountPercent || 0) : 0,
        fixedAmountsByGrade: normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade || {}),
      };
    })
    .filter((rule) => rule.label || rule.startDate || rule.endDate || rule.discountPercent > 0 || Object.values(rule.fixedAmountsByGrade || {}).some((amount) => Number(amount || 0) > 0));
}

function normalizeBenefitFixedAmountsByGrade(rawAmounts = {}) {
  const entries = rawAmounts instanceof Map ? Array.from(rawAmounts.entries()) : Object.entries(rawAmounts || {});
  return entries.reduce((accumulator, [grade, amount]) => {
    const normalizedGrade = String(grade || '').trim().toLowerCase();
    if (!normalizedGrade) {
      return accumulator;
    }

    accumulator[normalizedGrade] = Math.max(0, Number(amount || 0));
    return accumulator;
  }, {});
}

function getFixedBenefitAmountForGrade(rule = {}, grade = '') {
  const fixedAmountsByGrade = normalizeBenefitFixedAmountsByGrade(rule.fixedAmountsByGrade || {});
  const aliases = getFeeGradeAliases(grade);
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(fixedAmountsByGrade, alias)) {
      return Math.max(0, Number(fixedAmountsByGrade[alias] || 0));
    }
  }

  return 0;
}

function calculateBenefitTuitionAmount(monthlyTuition, rule = {}, grade = '') {
  const baseAmount = Math.max(0, Number(monthlyTuition || 0));
  if (rule.discountType === 'fixed') {
    return Math.max(0, Math.round(baseAmount - getFixedBenefitAmountForGrade(rule, grade)));
  }

  const discountPercent = Math.min(100, Math.max(0, Number(rule.discountPercent || 0)));
  return Math.max(0, Math.round(baseAmount * (1 - (discountPercent / 100))));
}

function hasFeeSettingAmounts(setting) {
  return Number(setting?.enrollmentBonus || 0) > 0
    || Number(setting?.enrollmentFee || 0) > 0
    || Number(setting?.monthlyTuition || 0) > 0;
}

function formatDateInputValue(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function createEmptyAcademicPeriodDraft(index = 0) {
  return {
    key: `period_${index + 1}`,
    name: `Periodo ${index + 1}`,
    weight: index === 0 ? 100 : 0,
    order: (index + 1) * 10,
    startDate: '',
    endDate: '',
  };
}

function createEmptyPerformanceLevelDraft(index = 0, scale = {}) {
  const minScore = Number(scale?.minScore ?? 0);
  const maxScore = Number(scale?.maxScore ?? 100);
  return {
    key: `performance_level_${index + 1}`,
    label: '',
    minScore,
    maxScore,
    color: '#174a68',
    order: (index + 1) * 10,
  };
}

const defaultAcademicPerformanceLevels = [
  { key: 'deficiente', label: 'Deficiente', minScore: 0, maxScore: 59, color: '#ef4444', order: 10 },
  { key: 'insuficiente', label: 'Insuficiente', minScore: 60, maxScore: 69, color: '#f97316', order: 20 },
  { key: 'aceptable', label: 'Aceptable', minScore: 70, maxScore: 79, color: '#eab308', order: 30 },
  { key: 'bueno', label: 'Bueno', minScore: 80, maxScore: 89, color: '#65a30d', order: 40 },
  { key: 'sobresaliente', label: 'Sobresaliente', minScore: 90, maxScore: 95, color: '#15803d', order: 50 },
  { key: 'excelente', label: 'Excelente', minScore: 96, maxScore: 100, color: '#166534', order: 60 },
];

const defaultAcademicGradingScale = {
  minScore: 0,
  maxScore: 100,
  passingScore: 70,
  performanceLevels: defaultAcademicPerformanceLevels,
};

function normalizeAcademicGradingScale(raw = {}) {
  const hasPerformanceLevels = Array.isArray(raw?.performanceLevels) && raw.performanceLevels.length > 0;
  const shouldUseDefaultScale = !raw || Object.keys(raw).length === 0 || (!hasPerformanceLevels && Number(raw?.maxScore ?? 100) <= 5 && Number(raw?.passingScore ?? 70) <= 3);
  const sourceScale = shouldUseDefaultScale ? defaultAcademicGradingScale : raw;
  const minScore = Number(sourceScale?.minScore ?? defaultAcademicGradingScale.minScore);
  const maxScore = Number(sourceScale?.maxScore ?? defaultAcademicGradingScale.maxScore);
  const passingScore = Number(sourceScale?.passingScore ?? defaultAcademicGradingScale.passingScore);
  const normalizedMin = Number.isFinite(minScore) ? minScore : 0;
  const normalizedMax = Number.isFinite(maxScore) && maxScore > normalizedMin ? maxScore : defaultAcademicGradingScale.maxScore;
  const normalizedPassing = Number.isFinite(passingScore) ? Math.min(Math.max(passingScore, normalizedMin), normalizedMax) : defaultAcademicGradingScale.passingScore;
  const performanceLevels = (Array.isArray(sourceScale?.performanceLevels) ? sourceScale.performanceLevels : defaultAcademicPerformanceLevels)
    .map((level, index) => ({
      key: String(level?.key || `performance_level_${index + 1}`).trim(),
      label: String(level?.label || '').trim(),
      minScore: Number.isFinite(Number(level?.minScore)) ? Number(level.minScore) : normalizedMin,
      maxScore: Number.isFinite(Number(level?.maxScore)) ? Number(level.maxScore) : normalizedMax,
      color: String(level?.color || defaultAcademicPerformanceLevels[index]?.color || '#174a68').trim(),
      order: Number(level?.order || (index + 1) * 10),
    }))
    .filter((level) => level.key)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));

  return {
    minScore: normalizedMin,
    maxScore: normalizedMax,
    passingScore: normalizedPassing,
    performanceLevels,
  };
}

function normalizeAcademicGradingScalesByLevel(rawScales = []) {
  const entries = Array.isArray(rawScales)
    ? rawScales
    : Object.entries(rawScales || {}).map(([levelKey, gradingScale]) => ({ levelKey, ...(gradingScale || {}) }));

  return entries
    .map((item) => ({
      levelKey: String(item?.levelKey || item?.key || '').trim(),
      ...normalizeAcademicGradingScale(item?.gradingScale || item || {}),
    }))
    .filter((item) => item.levelKey);
}

function getAcademicGradingScaleForLevel(draft = {}, levelKey = '') {
  const normalizedLevelKey = String(levelKey || '').trim();
  const matchedScale = (Array.isArray(draft?.gradingScalesByLevel) ? draft.gradingScalesByLevel : [])
    .find((scale) => String(scale?.levelKey || '').trim() === normalizedLevelKey);
  return normalizeAcademicGradingScale(matchedScale || draft?.gradingScale || {});
}

function setAcademicGradingScaleForLevel(draft = {}, levelKey = '', updater) {
  const normalizedLevelKey = String(levelKey || '').trim();
  if (!normalizedLevelKey) {
    return draft;
  }

  const currentScales = normalizeAcademicGradingScalesByLevel(draft.gradingScalesByLevel || []);
  const currentScale = getAcademicGradingScaleForLevel(draft, normalizedLevelKey);
  const nextScale = typeof updater === 'function' ? updater(currentScale) : updater;
  const normalizedNextScale = normalizeAcademicGradingScale(nextScale || {});
  const nextScales = currentScales.filter((scale) => scale.levelKey !== normalizedLevelKey);

  return {
    ...draft,
    gradingScalesByLevel: [
      ...nextScales,
      { levelKey: normalizedLevelKey, ...normalizedNextScale },
    ],
  };
}

function formatAcademicScore(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '3.0';
  }

  return numericValue.toLocaleString('es-CO', {
    minimumFractionDigits: numericValue % 1 === 0 ? 1 : 0,
    maximumFractionDigits: 2,
  });
}

function createEmptyAcademicStructureDraft() {
  return {
    academicYear: '',
    levels: [],
    subjects: [],
    grades: [],
    scheduleSettings: normalizeAcademicScheduleSettings({ groups: [] }),
    scheduleBreaks: [],
    teachingAvailability: [],
    subjectLoadTemplates: [],
    gradeSchedules: [],
    academicPeriods: [createEmptyAcademicPeriodDraft()],
    gradingScale: normalizeAcademicGradingScale(),
    gradingScalesByLevel: [],
  };
}

function normalizeAcademicStructureDraft(raw) {
  const levels = Array.isArray(raw?.levels) ? raw.levels : [];
  const subjects = Array.isArray(raw?.subjects) ? raw.subjects : [];
  const grades = Array.isArray(raw?.grades) ? raw.grades : [];
  const scheduleSettings = normalizeAcademicScheduleSettings(raw?.scheduleSettings || { groups: [] });
  const scheduleBreaks = Array.isArray(raw?.scheduleBreaks) ? raw.scheduleBreaks : [];
  const teachingAvailability = normalizeAcademicTeachingAvailability(raw?.teachingAvailability);
  const subjectLoadTemplates = normalizeAcademicSubjectLoadTemplates(raw?.subjectLoadTemplates);
  const gradeSchedules = Array.isArray(raw?.gradeSchedules) ? raw.gradeSchedules : [];
  const academicPeriods = Array.isArray(raw?.academicPeriods) ? raw.academicPeriods : [];
  const gradingScale = normalizeAcademicGradingScale(raw?.gradingScale || {});
  const gradingScalesByLevel = normalizeAcademicGradingScalesByLevel(raw?.gradingScalesByLevel || []);

  return {
    academicYear: String(raw?.academicYear || '').trim(),
    levels: levels
      .map((level, levelIndex) => ({
        key: String(level?.key || level?.label || '').trim(),
        label: String(level?.label || level?.key || '').trim(),
        order: Number(level?.order || (levelIndex + 1) * 10),
      }))
      .filter((level) => level.key),
    subjects: subjects
      .map((subject, subjectIndex) => ({
        key: String(subject?.key || subject?.label || '').trim(),
        label: String(subject?.label || subject?.key || '').trim(),
        kind: String(subject?.kind || 'principal').trim().toLowerCase() === 'secundaria' ? 'secundaria' : 'principal',
        gradeKeys: (Array.isArray(subject?.gradeKeys) ? subject.gradeKeys : []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean),
        order: Number(subject?.order || (subjectIndex + 1) * 10),
      }))
      .filter((subject) => subject.key),
    grades: grades
      .map((grade, gradeIndex) => {
        const normalizedGrade = {
          key: String(grade?.key || grade?.label || '').trim(),
          label: String(grade?.label || grade?.key || '').trim(),
          levelKey: String(grade?.levelKey || '').trim(),
          order: Number(grade?.order || (gradeIndex + 1) * 10),
          courses: (Array.isArray(grade?.courses) ? grade.courses : [])
            .map((course, courseIndex) => ({
              key: String(course?.key || course?.label || '').trim(),
              label: String(course?.label || course?.key || '').trim(),
              section: String(course?.section || '').trim(),
              headroomTeacherUserId: String(course?.headroomTeacherUserId || '').trim(),
              order: Number(course?.order || (courseIndex + 1) * 10),
              status: String(course?.status || 'active').trim(),
            }))
            .filter((course) => course.key),
        };

        return {
          ...normalizedGrade,
          courses: resolveGradeCourses(normalizedGrade),
        };
      })
      .filter((grade) => grade.key),
    scheduleSettings,
    scheduleBreaks: scheduleBreaks
      .map((item, index) => ({
        key: String(item?.key || `break_${index + 1}`).trim(),
        label: String(item?.label || `Break ${index + 1}`).trim(),
        weekday: Number(item?.weekday || 0),
        startTime: String(item?.startTime || '').trim(),
        endTime: String(item?.endTime || '').trim(),
        gradeKeys: (Array.isArray(item?.gradeKeys) ? item.gradeKeys : []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean),
        order: Number(item?.order || (index + 1) * 10),
      }))
      .filter((item) => item.weekday && item.startTime && item.endTime),
    teachingAvailability,
    subjectLoadTemplates,
    gradeSchedules: gradeSchedules
      .map((gradeSchedule) => ({
        gradeKey: String(gradeSchedule?.gradeKey || '').trim(),
        courseKey: String(gradeSchedule?.courseKey || '').trim(),
        subjectLoads: (Array.isArray(gradeSchedule?.subjectLoads) ? gradeSchedule.subjectLoads : [])
          .map((load, loadIndex) => ({
            subjectKey: String(load?.subjectKey || '').trim(),
            weeklyHours: Number(load?.weeklyHours || 0),
            teacherUserId: String(load?.teacherUserId || '').trim(),
            order: Number(load?.order || (loadIndex + 1) * 10),
          }))
          .filter((load) => load.subjectKey),
        weeklySchedule: (Array.isArray(gradeSchedule?.weeklySchedule) ? gradeSchedule.weeklySchedule : [])
          .map((entry, entryIndex) => ({
            key: String(entry?.key || normalizeAcademicScheduleSlotKey(entry?.weekday, entry?.block)).trim(),
            weekday: Number(entry?.weekday || 0),
            block: Number(entry?.block || 0),
            startTime: String(entry?.startTime || '').trim(),
            endTime: String(entry?.endTime || '').trim(),
            entryType: String(entry?.entryType || 'class').trim() === 'break' ? 'break' : 'class',
            subjectKey: String(entry?.entryType || 'class').trim() === 'break' ? '' : String(entry?.subjectKey || '').trim(),
            breakKey: String(entry?.breakKey || '').trim(),
            breakLabel: String(entry?.breakLabel || '').trim(),
            teacherUserId: String(entry?.entryType || 'class').trim() === 'break' ? '' : String(entry?.teacherUserId || '').trim(),
            order: Number(entry?.order || (entryIndex + 1) * 10),
          }))
          .filter((entry) => entry.weekday && entry.block && entry.startTime && entry.endTime),
        updatedAt: gradeSchedule?.updatedAt || null,
      }))
      .filter((gradeSchedule) => gradeSchedule.gradeKey),
    academicPeriods: academicPeriods.length > 0
      ? academicPeriods.map((period, index) => ({
        key: String(period?.key || `period_${index + 1}`).trim(),
        name: String(period?.name || `Periodo ${index + 1}`).trim(),
        weight: Number(period?.weight || 0),
        order: Number(period?.order || (index + 1) * 10),
        startDate: formatDateInputValue(period?.startDate),
        endDate: formatDateInputValue(period?.endDate),
      }))
      : [createEmptyAcademicPeriodDraft()],
    gradingScale,
    gradingScalesByLevel,
  };
}

function buildAcademicStructureFallbackGrades(bootstrap = {}) {
  const students = Array.isArray(bootstrap?.students) ? bootstrap.students : [];
  const gradeOrderMap = new Map();
  const courseMapByGrade = new Map();

  const ensureGrade = (rawGradeKey) => {
    const gradeKey = normalizeAcademicGradeKey(rawGradeKey);
    if (!gradeKey) {
      return '';
    }

    if (!gradeOrderMap.has(gradeKey)) {
      gradeOrderMap.set(gradeKey, gradeOrderMap.size + 1);
    }

    if (!courseMapByGrade.has(gradeKey)) {
      courseMapByGrade.set(gradeKey, new Map());
    }

    return gradeKey;
  };

  const ensureCourse = (gradeKey, rawCourseKey) => {
    const normalizedGradeKey = ensureGrade(gradeKey);
    const courseKey = String(rawCourseKey || '').trim();
    if (!normalizedGradeKey || !courseKey) {
      return;
    }

    const gradeCourses = courseMapByGrade.get(normalizedGradeKey);
    if (!gradeCourses.has(courseKey)) {
      gradeCourses.set(courseKey, {
        key: courseKey,
        label: courseKey,
        section: '',
        order: (gradeCourses.size + 1) * 10,
      });
    }
  };

  students.forEach((student) => {
    const gradeKey = ensureGrade(student?.grade);
    if (!gradeKey) {
      return;
    }

    ensureCourse(gradeKey, student?.course);
  });

  return Array.from(gradeOrderMap.keys())
    .sort((left, right) => left.localeCompare(right, 'es', { numeric: true }))
    .map((gradeKey, index) => ({
      key: gradeKey,
      label: gradeKey,
      levelKey: '',
      order: Number(index + 1) * 10,
      courses: Array.from((courseMapByGrade.get(gradeKey) || new Map()).values())
        .sort((left, right) => String(left.label || left.key).localeCompare(String(right.label || right.key), 'es', { numeric: true })),
    }));
}

function getAcademicCourseSectionFromKey(courseKey = '') {
  const parts = String(courseKey || '').split(':').map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

function buildRectoriaCourseOptionLabel(grade = {}, course = {}, siblingCourses = []) {
  const gradeLabel = String(grade?.label || grade?.key || '').trim();
  const courseLabel = String(course?.label || course?.section || getAcademicCourseSectionFromKey(course?.key) || course?.key || '').trim();
  const section = String(course?.section || getAcademicCourseSectionFromKey(course?.key) || '').trim();
  const siblingSections = (Array.isArray(siblingCourses) ? siblingCourses : [])
    .map((item) => String(item?.section || getAcademicCourseSectionFromKey(item?.key) || item?.label || '').trim().toUpperCase())
    .filter(Boolean);
  const hasLetteredSibling = siblingSections.some((item) => /^[0-9]+[A-Z]$/.test(item) || /^[A-Z]$/.test(item));

  if (!courseLabel) {
    return gradeLabel;
  }

  if (gradeLabel && courseLabel.toLowerCase() === gradeLabel.toLowerCase() && hasLetteredSibling) {
    return `${gradeLabel}A`;
  }

  if (gradeLabel && /^[A-Z]$/i.test(section)) {
    return `${gradeLabel}${section.toUpperCase()}`;
  }

  if (gradeLabel && /^[0-9]+[A-Z]$/i.test(section)) {
    return section.toUpperCase();
  }

  return courseLabel;
}

function normalizeAcademicStructureDraftWithBootstrap(raw, bootstrap = {}) {
  const normalized = normalizeAcademicStructureDraft(raw);
  const fallbackGrades = buildAcademicStructureFallbackGrades(bootstrap);
  if (fallbackGrades.length === 0) {
    return normalized;
  }

  if (normalized.levels.length > 0 || normalized.grades.length > 0) {
    const fallbackByGradeKey = new Map(fallbackGrades.map((grade) => [grade.key, grade]));

    return {
      ...normalized,
      grades: normalized.grades.map((grade) => {
        const fallbackGrade = fallbackByGradeKey.get(grade.key);
        if (!fallbackGrade) {
          return grade;
        }

        const mergedCourses = new Map((fallbackGrade.courses || []).map((course) => [course.key, course]));
        grade.courses.forEach((course, courseIndex) => {
          mergedCourses.set(course.key, { ...course, order: Number(course.order || (courseIndex + 1) * 10) });
        });

        return {
          ...grade,
          courses: Array.from(mergedCourses.values())
            .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || String(left.label || left.key).localeCompare(String(right.label || right.key), 'es', { numeric: true })),
        };
      }),
    };
  }

  const mergedGrades = new Map(fallbackGrades.map((grade) => [grade.key, { ...grade, courses: [...grade.courses] }]));

  normalized.grades.forEach((grade, gradeIndex) => {
    const fallbackGrade = mergedGrades.get(grade.key);
    if (!fallbackGrade) {
      mergedGrades.set(grade.key, { ...grade, order: Number(grade.order || (gradeIndex + 1) * 10), courses: [...grade.courses] });
      return;
    }

    const mergedCourses = new Map(fallbackGrade.courses.map((course) => [course.key, course]));
    grade.courses.forEach((course, courseIndex) => {
      mergedCourses.set(course.key, { ...course, order: Number(course.order || (courseIndex + 1) * 10) });
    });

    mergedGrades.set(grade.key, {
      ...fallbackGrade,
      ...grade,
      courses: Array.from(mergedCourses.values())
        .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || String(left.label || left.key).localeCompare(String(right.label || right.key), 'es', { numeric: true })),
    });
  });

  return {
    ...normalized,
    grades: Array.from(mergedGrades.values())
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || String(left.label || left.key).localeCompare(String(right.label || right.key), 'es', { numeric: true })),
  };
}

function calculateOverdueDays(value) {
  if (!value) {
    return 0;
  }

  const dueDate = new Date(value);
  if (Number.isNaN(dueDate.getTime())) {
    return 0;
  }

  const now = new Date();
  const diffMs = now.getTime() - dueDate.getTime();
  return diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;
}

function roleLabel(role) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role || 'Sin rol';
}

function formatInstitutionalUserLabel(user) {
  const title = String(user?.title || '').trim();
  const name = String(user?.name || '').trim();
  const username = String(user?.username || '').trim();
  const baseLabel = name || username || 'Usuario';
  return title ? `${title} ${baseLabel}` : baseLabel;
}

function parseSubjectsInput(value) {
  return Array.from(new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

const TEAM_ROLE_PANEL_COPY = {
  admin: 'Agrupa a los administradores de cafeterías escolares que crean y gestionan cafeterías, productos e inventario.',
  rectoria: 'Monitorea el equipo rector, su estado operativo y la cobertura institucional asignada.',
  direccion: 'Además del equipo de dirección, aquí se orquesta la asignación de coordinadores por nivel y la lectura rápida de KPIs académicos.',
  coordination: 'Revisa qué coordinadores están activos y cuál es el alcance académico que tienen asignado hoy.',
  teacher: 'Centraliza la vinculación entre docentes, asignaturas y grados para preparar la operación académica.',
  psychology: 'Consulta rápidamente la disponibilidad del equipo psicosocial y su estado operativo.',
  nursing: 'Valida el personal clínico activo que soporta la operación estudiantil del colegio.',
  academic_secretary: 'Agrupa al equipo que sostiene matrículas, comunicados, estructura y seguimiento académico.',
  admissions: 'Muestra el equipo responsable de registrar aspirantes, cargar documentos y mover cada caso por el embudo de admisiones.',
  billing: 'Muestra quién está cubriendo cartera y seguimiento financiero dentro del colegio.',
  human_resources: 'Agrupa al equipo responsable de talento humano, contratación y soporte interno del colegio.',
  school_route: 'Consolida el personal responsable de la operación y soporte de ruta escolar.',
};

function createEmptyTeamTeacherAssignment() {
  return {
    teacherUserId: '',
    subjectKeys: [],
    gradeKeys: [],
    weeklyHours: 0,
  };
}

function getTeamTeacherAssignmentSubjectKeys(assignment = {}) {
  if (Array.isArray(assignment.subjectKeys) && assignment.subjectKeys.length > 0) {
    return assignment.subjectKeys.map((subjectKey) => String(subjectKey || '').trim()).filter(Boolean);
  }

  const legacySubjectKey = String(assignment.subjectKey || '').trim();
  return legacySubjectKey ? [legacySubjectKey] : [];
}

function resolveSubjectAssignmentGradeKeys(subject = {}, selectedGradeKeys = []) {
  const normalizedSelectedGradeKeys = Array.from(new Set(
    (Array.isArray(selectedGradeKeys) ? selectedGradeKeys : []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean),
  ));
  const linkedGradeKeys = Array.isArray(subject.gradeKeys)
    ? subject.gradeKeys.map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean)
    : [];

  if (linkedGradeKeys.length === 0) {
    return normalizedSelectedGradeKeys;
  }

  return normalizedSelectedGradeKeys.filter((gradeKey) => linkedGradeKeys.includes(gradeKey));
}

function createEmptyHeadroomTeacherAssignment() {
  return {
    teacherUserId: '',
    gradeKey: '',
    courseKey: '',
  };
}

function normalizeFeeSettingsDraft(raw, academicGrades = [], academicLevels = []) {
  const gradeSettings = Array.isArray(raw?.gradeSettings) ? raw.gradeSettings : [];
  const normalizedSettings = gradeSettings.map((setting, index) => ({
    grade: String(setting?.grade || '').trim(),
    enrollmentBonus: Number(setting?.enrollmentBonus || 0),
    enrollmentFee: Number(setting?.enrollmentFee || 0),
    monthlyTuition: Number(setting?.monthlyTuition || 0),
    dueDay: Number(setting?.dueDay || 10),
    benefitRules: normalizeFeeBenefitRules(setting?.benefitRules || []),
  }));
  const legacyBenefitRules = gradeSettings.flatMap((setting) => Array.isArray(setting?.benefitRules) ? setting.benefitRules : []);
  const normalizedBenefitRules = Array.isArray(raw?.benefitRules) && raw.benefitRules.length
    ? normalizeFeeBenefitRules(raw.benefitRules)
    : legacyBenefitRules.length > 0
      ? normalizeFeeBenefitRules(legacyBenefitRules)
      : [createEmptyBenefitRule()];

  const normalizedAcademicGrades = Array.isArray(academicGrades)
    ? academicGrades.map((grade) => ({
      key: String(grade?.key || '').trim(),
      label: String(grade?.label || grade?.key || '').trim(),
    })).filter((grade) => grade.key)
    : [];

  const mergedGradeSettings = normalizedAcademicGrades.length > 0
    ? normalizedAcademicGrades.map((grade, index) => {
      const matchedSetting = findMatchingFeeSetting(normalizedSettings, grade);
      return matchedSetting
        ? { ...matchedSetting, grade: grade.key }
        : createEmptyGradeSetting(grade.key, index);
    })
    : normalizedSettings;

  return {
    academicYear: String(raw?.academicYear || '').trim(),
    schoolYearStartDate: formatDateInputValue(raw?.schoolYearStartDate),
    schoolYearEndDate: formatDateInputValue(raw?.schoolYearEndDate),
    lateEnrollmentSurchargeType: ['percent', 'fixed'].includes(String(raw?.lateEnrollmentSurchargeType || '').trim()) ? String(raw?.lateEnrollmentSurchargeType || '').trim() : 'none',
    lateEnrollmentSurchargeValue: Number(raw?.lateEnrollmentSurchargeValue || 0),
    schoolYearLevels: normalizeSchoolYearLevelSettings(raw, academicGrades, academicLevels),
    benefitRules: normalizedBenefitRules,
    enrollmentBenefitRules: normalizeEnrollmentBenefitRules(raw?.enrollmentBenefitRules || []),
    gradeSettings: mergedGradeSettings,
  };
}

function buildFeeSettingsPayload(draft) {
  return {
    academicYear: normalizeText(draft?.academicYear),
    schoolYearStartDate: normalizeText(draft?.schoolYearStartDate),
    schoolYearEndDate: normalizeText(draft?.schoolYearEndDate),
    lateEnrollmentSurchargeType: ['percent', 'fixed'].includes(normalizeText(draft?.lateEnrollmentSurchargeType)) ? normalizeText(draft?.lateEnrollmentSurchargeType) : 'none',
    lateEnrollmentSurchargeValue: Math.max(0, Number(draft?.lateEnrollmentSurchargeValue || 0)),
    schoolYearLevels: (Array.isArray(draft?.schoolYearLevels) ? draft.schoolYearLevels : [])
      .map((setting) => {
        const surchargeType = ['percent', 'fixed'].includes(normalizeText(setting?.lateEnrollmentSurchargeType)) ? normalizeText(setting?.lateEnrollmentSurchargeType) : 'none';
        return {
          levelKey: normalizeText(setting?.levelKey),
          label: normalizeText(setting?.label),
          gradeKeys: Array.from(new Set((Array.isArray(setting?.gradeKeys) ? setting.gradeKeys : []).map((gradeKey) => normalizeAcademicGradeKey(gradeKey)).filter(Boolean))),
          schoolYearStartDate: normalizeText(setting?.schoolYearStartDate),
          schoolYearEndDate: normalizeText(setting?.schoolYearEndDate),
          lateEnrollmentSurchargeType: surchargeType,
          lateEnrollmentSurchargeValue: surchargeType === 'none' ? 0 : Math.max(0, Number(setting?.lateEnrollmentSurchargeValue || 0)),
        };
      })
      .filter((setting) => setting.levelKey && setting.gradeKeys.length > 0 && setting.schoolYearStartDate && setting.schoolYearEndDate),
    benefitRules: (Array.isArray(draft?.benefitRules) ? draft.benefitRules : [])
      .map((rule, index) => {
        const discountType = normalizeText(rule?.discountType) === 'fixed' ? 'fixed' : 'percent';
        return {
          label: normalizeText(rule?.label) || `Beneficio ${index + 1}`,
          startDay: Number(rule?.startDay || 1),
          endDay: Number(rule?.endDay || 10),
          discountType,
          discountPercent: discountType === 'percent' ? Number(rule?.discountPercent || 0) : 0,
          fixedAmountsByGrade: discountType === 'fixed' ? normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade || {}) : {},
        };
      }),
    enrollmentBenefitRules: (Array.isArray(draft?.enrollmentBenefitRules) ? draft.enrollmentBenefitRules : [])
      .map((rule, index) => {
        const discountType = normalizeText(rule?.discountType) === 'fixed' ? 'fixed' : 'percent';
        return {
          label: normalizeText(rule?.label) || `Beneficio matricula ${index + 1}`,
          startDate: normalizeText(rule?.startDate),
          endDate: normalizeText(rule?.endDate),
          discountType,
          discountPercent: discountType === 'percent' ? Number(rule?.discountPercent || 0) : 0,
          fixedAmountsByGrade: discountType === 'fixed' ? normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade || {}) : {},
        };
      })
      .filter((rule) => rule.startDate && rule.endDate),
    gradeSettings: (Array.isArray(draft?.gradeSettings) ? draft.gradeSettings : [])
      .map((setting) => ({
        grade: normalizeText(setting?.grade),
        enrollmentBonus: Number(setting?.enrollmentBonus || 0),
        enrollmentFee: Number(setting?.enrollmentFee || 0),
        monthlyTuition: Number(setting?.monthlyTuition || 0),
        dueDay: Number(setting?.dueDay || 10),
        benefitRules: normalizeFeeBenefitRules(setting?.benefitRules || []),
      }))
      .filter((setting) => setting.grade),
  };
}

function RectoriaDashboard() {
  const user = useAuthStore((state) => state.user);
  const academicDatabaseImportInputRef = useRef(null);
  const scheduleAutosaveTimerRef = useRef(null);
  const scheduleAutosaveSignatureRef = useRef('');
  const currentRole = String(user?.role || '').trim();
  const isDireccionPortal = currentRole === 'direccion';
  const isCoordinationPortal = currentRole === 'coordination';
  const coordinationScope = String(user?.coordinationScope || '').trim();
  const portalLabel = isCoordinationPortal ? 'coordinación' : (isDireccionPortal ? 'dirección' : 'rectoría');
  const portalAuthorName = portalLabel === 'rectoría' ? 'Rectoría' : (portalLabel === 'dirección' ? 'Dirección' : 'Coordinación');
  const schoolName = getSchoolDisplayName(user || localStorage.getItem('selectedSchoolId'), 'Colegio');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [expandedSidebarSection, setExpandedSidebarSection] = useState('');
  const [activeAcademicManagementSection, setActiveAcademicManagementSection] = useState('grades_courses');
  const [homeData, setHomeData] = useState(null);
  const [disciplineObservations, setDisciplineObservations] = useState([]);
  const [coordinationDashboard, setCoordinationDashboard] = useState(null);
  const [resourceDashboard, setResourceDashboard] = useState(null);
  const [resourceItems, setResourceItems] = useState([]);
  const [resourcePlannerCycles, setResourcePlannerCycles] = useState([]);
  const [resourcePlannerRequests, setResourcePlannerRequests] = useState([]);
  const [resourceRequests, setResourceRequests] = useState([]);
  const [resourceStatusFilter, setResourceStatusFilter] = useState('');
  const [resourcePlannerCycleDraft, setResourcePlannerCycleDraft] = useState(createEmptyResourcePlannerCycleDraft);
  const [selectedResourcePlannerRequestIds, setSelectedResourcePlannerRequestIds] = useState([]);
  const [resourcePlannerConsolidationNote, setResourcePlannerConsolidationNote] = useState('');
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [billingBootstrap, setBillingBootstrap] = useState({
    parents: [],
    students: [],
    communications: [],
    communicationAuthors: [],
    communicationRequests: [],
    communicationRequestCounts: { pending: 0, approved: 0, rejected: 0 },
    calendarAssignments: [],
    grades: [],
    courses: [],
    campusCourses: [],
    academicDatabase: [],
    academicStructure: null,
    billing: null,
  });
  const [academicStructureDraft, setAcademicStructureDraft] = useState(createEmptyAcademicStructureDraft());
  const [feeSettingsDraft, setFeeSettingsDraft] = useState({ academicYear: '', schoolYearStartDate: '', schoolYearEndDate: '', lateEnrollmentSurchargeType: 'none', lateEnrollmentSurchargeValue: 0, schoolYearLevels: [], benefitRules: [createEmptyBenefitRule()], enrollmentBenefitRules: [], gradeSettings: [] });
  const [selectedSchoolYearLevelKey, setSelectedSchoolYearLevelKey] = useState('');
  const [selectedFeeGradeKey, setSelectedFeeGradeKey] = useState('');
  const [userForm, setUserForm] = useState(createEmptyUserForm());
  const [editUserModal, setEditUserModal] = useState(createEmptyEditUserModal());
  const [selectedTeamRole, setSelectedTeamRole] = useState(ROLE_OPTIONS[0]?.value || 'rectoria');
  const [teamCoordinatorSelections, setTeamCoordinatorSelections] = useState({});
  const [teamTeacherAssignment, setTeamTeacherAssignment] = useState(createEmptyTeamTeacherAssignment());
  const [headroomTeacherAssignment, setHeadroomTeacherAssignment] = useState(createEmptyHeadroomTeacherAssignment());
  const [chargeForm, setChargeForm] = useState(emptyChargeForm);
  const [institutionalCommunicationForm, setInstitutionalCommunicationForm] = useState(emptyInstitutionalCommunicationForm);
  const [communicationAuthorDraft, setCommunicationAuthorDraft] = useState(emptyCommunicationAuthorDraft);
  const [editingCommunicationAuthorId, setEditingCommunicationAuthorId] = useState('');
  const [selectedCommunicationRequestId, setSelectedCommunicationRequestId] = useState('');
  const [communicationApprovalDraft, setCommunicationApprovalDraft] = useState(createInstitutionalApprovalDraft(null));
  const [createdUserModal, setCreatedUserModal] = useState({ open: false, name: '', role: '', username: '' });
  const [followUpModal, setFollowUpModal] = useState({ open: false, type: '', item: null, title: '', body: '' });
  const [communicationEngagementModal, setCommunicationEngagementModal] = useState({ open: false, type: 'comments', item: null });
  const [deleteAuthorModal, setDeleteAuthorModal] = useState({ open: false, author: null });
  const [deleteCommentModal, setDeleteCommentModal] = useState({ open: false, communication: null, comment: null });
  const [editLevelModal, setEditLevelModal] = useState({ open: false, levelKey: '', levelLabel: '', error: '' });
  const [selectedAcademicGradingLevelKey, setSelectedAcademicGradingLevelKey] = useState('');
  const [deleteLevelModal, setDeleteLevelModal] = useState({ open: false, levelKey: '', levelLabel: '', password: '', error: '' });
  const [editSubjectModal, setEditSubjectModal] = useState({ open: false, subjectKey: '', subjectLabel: '', subjectKind: 'principal', error: '' });
  const [deleteSubjectModal, setDeleteSubjectModal] = useState({ open: false, subjectKey: '', subjectLabel: '', password: '', error: '' });
  const [editGradeModal, setEditGradeModal] = useState({ open: false, gradeKey: '', gradeLabel: '', error: '' });
  const [editCourseModal, setEditCourseModal] = useState({ open: false, gradeKey: '', courseKey: '', courseLabel: '', error: '' });
  const [deleteGradeModal, setDeleteGradeModal] = useState({ open: false, gradeKey: '', password: '', error: '' });
  const [deleteCourseModal, setDeleteCourseModal] = useState({ open: false, gradeKey: '', courseKey: '', password: '', error: '' });
  const [courseStudentsModal, setCourseStudentsModal] = useState({ open: false, courseKey: '', gradeKey: '' });
  const [editingAcademicRowId, setEditingAcademicRowId] = useState('');
  const [academicDatabaseDrafts, setAcademicDatabaseDrafts] = useState({});
  const [academicDatabaseFilters, setAcademicDatabaseFilters] = useState({
    level: '',
    grade: '',
    course: '',
    student: '',
    father: '',
    mother: '',
  });
  const [studentSearch, setStudentSearch] = useState('');
  const [studentDrafts, setStudentDrafts] = useState({});
  const [newEducationalLevelName, setNewEducationalLevelName] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectKind, setNewSubjectKind] = useState('principal');
  const [subjectGradeDrafts, setSubjectGradeDrafts] = useState({});
  const [selectedLevelKeyForGrade, setSelectedLevelKeyForGrade] = useState('');
  const [levelGradeSelections, setLevelGradeSelections] = useState({});
  const [newGradeName, setNewGradeName] = useState('');
  const [courseForms, setCourseForms] = useState({});
  const [selectedScheduleGradeKey, setSelectedScheduleGradeKey] = useState('');
  const [selectedScheduleCourseKey, setSelectedScheduleCourseKey] = useState('');
  const [draggedScheduleSubjectKey, setDraggedScheduleSubjectKey] = useState('');
  const [draggedScheduleBlockKey, setDraggedScheduleBlockKey] = useState('');
  const [draggedScheduleEntryKey, setDraggedScheduleEntryKey] = useState('');
  const [scheduleDropPreview, setScheduleDropPreview] = useState(null);
  const [selectedScheduleSlotKey, setSelectedScheduleSlotKey] = useState('');
  const [scheduleClipboardEntry, setScheduleClipboardEntry] = useState(null);
  const [scheduleSlotModal, setScheduleSlotModal] = useState({ open: false, mode: 'create', slotKey: '', weekday: 0, block: 0, startTime: '', endTime: '', entryType: 'class', subjectKey: '', teacherUserId: '', breakKey: 'break' });
  const [showCustomScheduleBlockForm, setShowCustomScheduleBlockForm] = useState(false);
  const [customScheduleBlockName, setCustomScheduleBlockName] = useState('');
  const [customScheduleBlocks, setCustomScheduleBlocks] = useState([]);
  const [selectedScheduleGroupKey, setSelectedScheduleGroupKey] = useState(NEW_SCHEDULE_GROUP_KEY);
  const [scheduleGroupEditor, setScheduleGroupEditor] = useState({ ...createDefaultAcademicScheduleGroupSettings(0), dayEndTime: '15:00' });
  const [selectedSubjectLoadTemplateKey, setSelectedSubjectLoadTemplateKey] = useState(NEW_SUBJECT_LOAD_TEMPLATE_KEY);
  const [subjectLoadTemplateEditor, setSubjectLoadTemplateEditor] = useState(createDefaultAcademicSubjectLoadTemplate(0));
  const [selectedTeachingAvailabilityKey, setSelectedTeachingAvailabilityKey] = useState(NEW_TEACHING_AVAILABILITY_KEY);
  const [teachingAvailabilityEditor, setTeachingAvailabilityEditor] = useState(createDefaultAcademicTeachingAvailability(0));
  const [newScheduleBreakLabel, setNewScheduleBreakLabel] = useState('');
  const [newScheduleBreakWeekdays, setNewScheduleBreakWeekdays] = useState([1]);
  const [newScheduleBreakStartTime, setNewScheduleBreakStartTime] = useState('09:00');
  const [newScheduleBreakEndTime, setNewScheduleBreakEndTime] = useState('10:00');
  const [newScheduleBreakGradeKeys, setNewScheduleBreakGradeKeys] = useState([]);
  const [scheduleBreakGradeSelections, setScheduleBreakGradeSelections] = useState({});
  const [activeAdmissionsView, setActiveAdmissionsView] = useState('dashboard');

  const sectionOptions = useMemo(
    () => {
      if (isCoordinationPortal) {
        return [
          { key: 'overview', label: 'Tablero de nivel' },
          { key: 'communications', label: 'Comunicados' },
          { key: 'resources', label: 'Recursos y compras' },
          { key: 'schedule', label: 'Horario académico' },
        ];
      }

      return BASE_SECTION_OPTIONS.flatMap((option) => (
        option.key === 'fees'
          ? [{ key: 'billing', label: 'Cartera' }, option]
          : [option]
      ));
    },
    [isCoordinationPortal]
  );
  const communicationAuthors = useMemo(() => (billingBootstrap.communicationAuthors || []).filter((author) => author && author._id), [billingBootstrap.communicationAuthors]);
  const defaultCommunicationAuthor = communicationAuthors.find((author) => author.isDefault) || null;
  const selectedCommunicationAuthorId = String(institutionalCommunicationForm.authorId || defaultCommunicationAuthor?._id || '');
  const selectedCommunicationAuthor = communicationAuthors.find((author) => String(author._id) === selectedCommunicationAuthorId) || defaultCommunicationAuthor || null;
  const canDeleteSelectedCommunicationAuthor = Boolean(selectedCommunicationAuthor?._id) && (
    !selectedCommunicationAuthor.isDefault
    || communicationAuthors.some((author) => String(author._id) !== String(selectedCommunicationAuthor._id))
  );

  const onSidebarSectionClick = (sectionKey) => {
    setActiveSection(sectionKey);
    setExpandedSidebarSection((previous) => (previous === sectionKey ? '' : sectionKey));
  };

  useEffect(() => {
    if (!sectionOptions.some((section) => section.key === activeSection)) {
      setActiveSection(sectionOptions[0]?.key || 'overview');
    }
  }, [activeSection, sectionOptions]);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const closeSuccessModal = () => {
    setSuccess('');
  };

  const closeErrorModal = () => {
    setError('');
  };

  const closeCommunicationEngagementModal = () => {
    setCommunicationEngagementModal({ open: false, type: 'comments', item: null });
  };

  const refreshCommunicationInBootstrap = (communication) => {
    if (!communication?._id) return;
    setBillingBootstrap((previous) => ({
      ...previous,
      communications: (previous.communications || []).map((item) => (String(item._id) === String(communication._id) ? communication : item)),
    }));
    setCommunicationEngagementModal((previous) => (previous.item && String(previous.item._id) === String(communication._id)
      ? { ...previous, item: communication }
      : previous));
  };

  const openDeleteCommunicationCommentModal = (communication, comment) => {
    if (!communication?._id || !comment?.id) return;
    setDeleteCommentModal({ open: true, communication, comment });
  };

  const closeDeleteCommunicationCommentModal = () => {
    if (busy) return;
    setDeleteCommentModal({ open: false, communication: null, comment: null });
  };

  const onDeleteCommunicationComment = async () => {
    const { communication, comment } = deleteCommentModal;
    if (!communication?._id || !comment?.id) return;

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await deleteAcademicSecretaryCommunicationComment(communication._id, comment.id);
      refreshCommunicationInBootstrap(response?.data?.communication);
      setDeleteCommentModal({ open: false, communication: null, comment: null });
      setSuccess('Comentario eliminado correctamente.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo borrar el comentario.');
    } finally {
      setBusy(false);
    }
  };

  const onInstitutionalCommunicationMultiSelect = (event, field, setter) => {
    const selectedValues = Array.from(event.target.selectedOptions || []).map((option) => option.value);
    setter((previous) => ({ ...previous, [field]: selectedValues }));
  };

  const resetCommunicationAuthorDraft = () => {
    setCommunicationAuthorDraft(emptyCommunicationAuthorDraft);
    setEditingCommunicationAuthorId('');
  };

  const onCommunicationAuthorPhotoSelected = async (event) => {
    const [file] = Array.from(event.target.files || []).filter((item) => String(item.type || '').startsWith('image/'));
    if (!file) {
      return;
    }

    setCommunicationAuthorDraft((previous) => ({ ...previous, uploading: true, error: '' }));
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const response = await uploadAcademicSecretaryCommunicationImage(file, {
        preferredName: `${communicationAuthorDraft.name || 'autor-comunicado'}-perfil`,
      });
      const payload = response?.data || {};
      const photoUrl = payload.imageUrl || payload.url || '';
      const thumbUrl = payload.thumbUrl || photoUrl;
      if (!photoUrl) {
        throw new Error('No se recibió URL pública para la foto del autor.');
      }

      setCommunicationAuthorDraft((previous) => ({ ...previous, photoUrl, thumbUrl, uploading: false, error: '' }));
      setSuccess('Foto del autor cargada correctamente.');
    } catch (requestError) {
      const message = requestError?.response?.data?.message || requestError?.message || 'No se pudo subir la foto del autor.';
      setCommunicationAuthorDraft((previous) => ({ ...previous, uploading: false, error: message }));
      setError(message);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const onEditCommunicationAuthor = (author) => {
    if (!author?._id) return;
    setEditingCommunicationAuthorId(String(author._id));
    setCommunicationAuthorDraft({
      name: author.name || '',
      photoUrl: author.photoUrl || '',
      thumbUrl: author.thumbUrl || author.photoUrl || '',
      uploading: false,
      error: '',
    });
  };

  const onCreateCommunicationAuthor = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const authorPayload = {
        name: communicationAuthorDraft.name,
        photoUrl: communicationAuthorDraft.photoUrl,
        thumbUrl: communicationAuthorDraft.thumbUrl,
      };
      const response = editingCommunicationAuthorId
        ? await updateAcademicSecretaryCommunicationAuthor(editingCommunicationAuthorId, authorPayload)
        : await createAcademicSecretaryCommunicationAuthor(authorPayload);
      const author = response?.data?.author;
      if (author?._id) {
        setInstitutionalCommunicationForm((previous) => ({ ...previous, authorId: String(author._id) }));
      }
      resetCommunicationAuthorDraft();
      await loadPortal({ silent: true });
      setSuccess(editingCommunicationAuthorId ? 'Autor actualizado y aplicado a sus comunicados.' : 'Autor agregado y seleccionado para el comunicado.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'No se pudo guardar el autor.');
    } finally {
      setBusy(false);
    }
  };

  const openDeleteCommunicationAuthorModal = (author) => {
    if (!author?._id) return;
    setDeleteAuthorModal({ open: true, author });
  };

  const closeDeleteCommunicationAuthorModal = () => {
    if (busy) return;
    setDeleteAuthorModal({ open: false, author: null });
  };

  const onDeleteCommunicationAuthor = async () => {
    const author = deleteAuthorModal.author;
    if (!author?._id) return;

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await deleteAcademicSecretaryCommunicationAuthor(author._id);
      if (String(institutionalCommunicationForm.authorId || '') === String(author._id)) {
        setInstitutionalCommunicationForm((previous) => ({ ...previous, authorId: '' }));
      }
      if (String(editingCommunicationAuthorId || '') === String(author._id)) {
        resetCommunicationAuthorDraft();
      }
      setDeleteAuthorModal({ open: false, author: null });
      await loadPortal({ silent: true });
      setSuccess('Autor eliminado correctamente.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'No se pudo eliminar el autor.');
    } finally {
      setBusy(false);
    }
  };

  const buildInstitutionalCommunicationPayload = (draft, selectedAuthor = null) => ({
    ...draft,
    gradeTargets: draft.audienceType === 'grade' ? draft.gradeTargets : [],
    courseTargets: draft.audienceType === 'course' ? draft.courseTargets : [],
    parentTargets: draft.audienceType === 'individual' ? draft.parentTargets : [],
    studentTargets: draft.audienceType === 'individual' ? draft.studentTargets : [],
    emailSubject: draft.title,
    schoolName,
    authorId: selectedAuthor?._id || '',
    authorName: selectedAuthor?.name || portalAuthorName,
    authorPhotoUrl: selectedAuthor?.photoUrl || '',
    authorThumbUrl: selectedAuthor?.thumbUrl || selectedAuthor?.photoUrl || '',
    channels: { push: true, email: true },
  });

  const onSubmitInstitutionalCommunication = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await createAcademicSecretaryCommunication(buildInstitutionalCommunicationPayload(institutionalCommunicationForm, selectedCommunicationAuthor));
      setInstitutionalCommunicationForm(emptyInstitutionalCommunicationForm);
      await loadPortal({ silent: true });
      setSuccess('Comunicado publicado correctamente.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo publicar el comunicado.');
    } finally {
      setBusy(false);
    }
  };

  const onApproveCommunicationRequest = async () => {
    if (!selectedCommunicationRequest?._id) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await approveAcademicSecretaryCommunicationRequest(
        selectedCommunicationRequest._id,
        buildInstitutionalCommunicationPayload(communicationApprovalDraft)
      );
      await loadPortal({ silent: true });
      setSuccess('Solicitud docente aprobada y publicada.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo aprobar la solicitud docente.');
    } finally {
      setBusy(false);
    }
  };

  const onRejectCommunicationRequest = async () => {
    if (!selectedCommunicationRequest?._id) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await rejectAcademicSecretaryCommunicationRequest(selectedCommunicationRequest._id, { reviewNotes: communicationApprovalDraft.reviewNotes });
      await loadPortal({ silent: true });
      setSuccess('Solicitud docente rechazada.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo rechazar la solicitud docente.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCalendarAssignment = async (draft) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await createAcademicCalendarAssignment(draft);
      const item = response.data?.item;
      if (item) {
        setBillingBootstrap((previous) => ({
          ...previous,
          calendarAssignments: [item, ...(previous.calendarAssignments || [])],
        }));
      }
      setSuccess('Asignación publicada en el calendario escolar.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo publicar la asignación.');
      throw requestError;
    } finally {
      setBusy(false);
    }
  };

  const handleArchiveCalendarAssignment = async (item) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await archiveAcademicCalendarAssignment(item.id);
      setBillingBootstrap((previous) => ({
        ...previous,
        calendarAssignments: (previous.calendarAssignments || []).filter((assignment) => assignment.id !== item.id),
      }));
      setSuccess('Asignación archivada.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo archivar la asignación.');
    } finally {
      setBusy(false);
    }
  };

  const closeCreatedUserModal = () => {
    setCreatedUserModal({ open: false, name: '', role: '', username: '' });
  };

  const loadPortal = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    clearMessages();

    try {
      const requestResults = await Promise.allSettled([
        isCoordinationPortal ? Promise.resolve({ data: null }) : getAdminHomepage(),
        isCoordinationPortal ? getCampusCoordinationTeachers() : getAdminUsers(),
        getStudents(),
        isCoordinationPortal ? Promise.resolve({ data: {} }) : getAcademicSecretaryFeeSettings(),
        getAcademicSecretaryBootstrap(),
        getCampusCoordinationCourses(),
        getCampusDisciplineObservations({ limit: 30 }),
        isCoordinationPortal ? getCampusCoordinationDashboard() : Promise.resolve(null),
        isCoordinationPortal ? Promise.resolve({ data: null }) : getHrDashboard(),
        getHrSupplyItems({ status: 'active' }),
        getHrPlannerCycles({ status: 'active' }),
        getHrCoordinationPlannerRequests({ status: 'pending_coordination_review' }),
        getHrSupplyRequests(),
      ]);

      const [
        homeResult,
        usersResult,
        studentsResult,
        feeSettingsResult,
        billingBootstrapResult,
        campusCoursesResult,
        disciplineObservationsResult,
        coordinationDashboardResult,
        resourceDashboardResult,
        resourceItemsResult,
        resourcePlannerCyclesResult,
        resourcePlannerRequestsResult,
        resourceRequestsResult,
      ] = requestResults;

      const failedSections = [];
      if (!isCoordinationPortal && homeResult.status === 'rejected') failedSections.push('resumen institucional');
      if (!isCoordinationPortal && usersResult.status === 'rejected') failedSections.push('cuerpo académico');
      if (studentsResult.status === 'rejected') failedSections.push('gestión academica');
      if (!isCoordinationPortal && feeSettingsResult.status === 'rejected') failedSections.push('costos por grado');
      if (!isCoordinationPortal && billingBootstrapResult?.status === 'rejected') failedSections.push('cartera');
      if (campusCoursesResult.status === 'rejected') failedSections.push('contenido académico');
      if (disciplineObservationsResult.status === 'rejected') failedSections.push('convivencia escolar');
      if (isCoordinationPortal && coordinationDashboardResult.status === 'rejected') {
        const dashboardStatus = coordinationDashboardResult.reason?.response?.status;
        if (dashboardStatus === 404) {
          failedSections.push('tablero de coordinación (reinicia el backend local para cargar la ruta nueva)');
        } else {
          const dashboardMessage = coordinationDashboardResult.reason?.response?.data?.message;
          failedSections.push(dashboardMessage ? `tablero de coordinación (${dashboardMessage})` : 'tablero de coordinación');
        }
      }
      if (!isCoordinationPortal && resourceDashboardResult.status === 'rejected') failedSections.push('resumen de recursos');
      if (resourceItemsResult.status === 'rejected' || resourcePlannerCyclesResult.status === 'rejected' || resourcePlannerRequestsResult.status === 'rejected' || resourceRequestsResult.status === 'rejected') failedSections.push('recursos y compras');

      const nextHomeData = homeResult.status === 'fulfilled' ? (homeResult.value?.data || null) : homeData;
      const nextUsers = usersResult.status === 'fulfilled'
        ? (isCoordinationPortal
          ? (usersResult.value?.teachers || []).map((teacher) => ({
            _id: teacher.userId,
            name: teacher.name,
            username: teacher.username,
            role: 'teacher',
            status: 'active',
            assignedSubjects: [],
          }))
          : (Array.isArray(usersResult.value?.data) ? usersResult.value.data : users))
        : users;
      let nextStudents = studentsResult.status === 'fulfilled' && Array.isArray(studentsResult.value?.data)
        ? studentsResult.value.data
        : students;
      const syncedCampusCourses = campusCoursesResult.status === 'fulfilled'
        ? (campusCoursesResult.value?.courses || []).map(normalizeCampusCourseForAcademicContent).filter((course) => course.key)
        : [];
      let nextBillingBootstrap = billingBootstrapResult?.status === 'fulfilled'
        ? {
          parents: billingBootstrapResult.value?.data?.parents || [],
          students: billingBootstrapResult.value?.data?.students || [],
          communications: billingBootstrapResult.value?.data?.communications || [],
          communicationAuthors: billingBootstrapResult.value?.data?.communicationAuthors || [],
          communicationRequests: billingBootstrapResult.value?.data?.communicationRequests || [],
          communicationRequestCounts: billingBootstrapResult.value?.data?.communicationRequestCounts || { pending: 0, approved: 0, rejected: 0 },
          calendarAssignments: billingBootstrapResult.value?.data?.calendarAssignments || [],
          grades: billingBootstrapResult.value?.data?.grades || [],
          courses: billingBootstrapResult.value?.data?.courses || [],
          campusCourses: syncedCampusCourses.length > 0
            ? syncedCampusCourses
            : (billingBootstrapResult.value?.data?.campusCourses || []).map(normalizeCampusCourseForAcademicContent).filter((course) => course.key),
          academicDatabase: billingBootstrapResult.value?.data?.academicDatabase || [],
          academicStructure: billingBootstrapResult.value?.data?.academicStructure || null,
          billing: billingBootstrapResult.value?.data?.billing || null,
        }
        : {
          ...billingBootstrap,
          campusCourses: syncedCampusCourses.length > 0 ? syncedCampusCourses : billingBootstrap.campusCourses,
        };
      let nextAcademicStructure = billingBootstrapResult?.status === 'fulfilled'
        ? normalizeAcademicStructureDraftWithBootstrap(billingBootstrapResult.value?.data?.academicStructure || {}, nextBillingBootstrap)
        : academicStructureDraft;
      const coordinationLevelKeys = isCoordinationPortal
        ? resolveCoordinationLevelKeys(nextAcademicStructure, coordinationScope)
        : new Set();
      const coordinationGradeKeys = coordinationLevelKeys.size > 0
        ? new Set(nextAcademicStructure.grades
          .filter((grade) => coordinationLevelKeys.has(String(grade.levelKey || '').trim()))
          .map((grade) => String(grade.key || '').trim())
          .filter(Boolean))
        : new Set();

      if (isCoordinationPortal) {
        nextAcademicStructure = filterAcademicStructureByLevelKeys(nextAcademicStructure, coordinationLevelKeys);
        nextStudents = filterStudentsByGradeKeys(nextStudents, coordinationGradeKeys);
        nextBillingBootstrap = filterBillingBootstrapByGradeKeys(nextBillingBootstrap, coordinationGradeKeys);
      }
      const nextFeeSettings = feeSettingsResult.status === 'fulfilled'
        ? normalizeFeeSettingsDraft(feeSettingsResult.value?.data || {}, nextAcademicStructure.grades, nextAcademicStructure.levels)
        : normalizeFeeSettingsDraft(feeSettingsDraft, nextAcademicStructure.grades, nextAcademicStructure.levels);

      setHomeData(nextHomeData);
      setDisciplineObservations(disciplineObservationsResult.status === 'fulfilled' ? (disciplineObservationsResult.value?.observations || []) : disciplineObservations);
      if (isCoordinationPortal) {
        setCoordinationDashboard(
          coordinationDashboardResult.status === 'fulfilled'
            ? (coordinationDashboardResult.value || null)
            : coordinationDashboard
        );
      }
      setResourceDashboard(resourceDashboardResult.status === 'fulfilled' ? (resourceDashboardResult.value?.data || null) : resourceDashboard);
      setResourceItems(resourceItemsResult.status === 'fulfilled' ? (resourceItemsResult.value?.data?.items || []) : resourceItems);
      setResourcePlannerCycles(resourcePlannerCyclesResult.status === 'fulfilled' ? (resourcePlannerCyclesResult.value?.data?.cycles || []) : resourcePlannerCycles);
      setResourcePlannerRequests(resourcePlannerRequestsResult.status === 'fulfilled' ? (resourcePlannerRequestsResult.value?.data?.requests || []) : resourcePlannerRequests);
      setResourceRequests(resourceRequestsResult.status === 'fulfilled' ? (resourceRequestsResult.value?.data?.requests || []) : resourceRequests);
      setUsers(nextUsers);
      setStudents(nextStudents);
      setFeeSettingsDraft(nextFeeSettings);
      setBillingBootstrap(nextBillingBootstrap);
      setAcademicStructureDraft(nextAcademicStructure);
      if (studentsResult.status === 'fulfilled') {
        setStudentDrafts(
          nextStudents.reduce((accumulator, student) => {
            accumulator[String(student._id)] = {
              grade: String(student.grade || '').trim(),
              course: String(student.course || '').trim(),
            };
            return accumulator;
          }, {})
        );
      }

      if (failedSections.length > 0) {
        setError(`No se pudo actualizar: ${failedSections.join(', ')}. El resto del portal sigue mostrando la ultima informacion disponible.`);
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.message || `No se pudo cargar el portal de ${portalLabel}.`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPortal();
  }, []);

  useEffect(() => {
    const availableLevelKeys = academicStructureDraft.levels.map((level) => level.key).filter(Boolean);
    if (availableLevelKeys.length === 0) {
      if (selectedLevelKeyForGrade) {
        setSelectedLevelKeyForGrade('');
      }
      return;
    }

    if (!availableLevelKeys.includes(selectedLevelKeyForGrade)) {
      setSelectedLevelKeyForGrade(availableLevelKeys[0]);
    }
  }, [academicStructureDraft.levels, selectedLevelKeyForGrade]);

  useEffect(() => {
    const availableLevelKeys = feeSettingsDraft.schoolYearLevels.map((level) => level.levelKey).filter(Boolean);
    if (availableLevelKeys.length === 0) {
      if (selectedSchoolYearLevelKey) {
        setSelectedSchoolYearLevelKey('');
      }
      return;
    }

    if (!availableLevelKeys.includes(selectedSchoolYearLevelKey)) {
      setSelectedSchoolYearLevelKey(availableLevelKeys[0]);
    }
  }, [feeSettingsDraft.schoolYearLevels, selectedSchoolYearLevelKey]);

  useEffect(() => {
    const availableGradeKeys = academicStructureDraft.grades.map((grade) => grade.key).filter(Boolean);
    if (availableGradeKeys.length === 0) {
      if (selectedScheduleGradeKey) {
        setSelectedScheduleGradeKey('');
      }
      return;
    }

    if (!availableGradeKeys.includes(selectedScheduleGradeKey)) {
      setSelectedScheduleGradeKey(availableGradeKeys[0]);
    }
  }, [academicStructureDraft.grades, selectedScheduleGradeKey]);

  useEffect(() => {
    const selectedGrade = academicStructureDraft.grades.find((grade) => grade.key === selectedScheduleGradeKey);
    const availableCourseKeys = (selectedGrade?.courses || []).map((course) => course.key).filter(Boolean);

    if (!selectedScheduleGradeKey || availableCourseKeys.length === 0) {
      if (selectedScheduleCourseKey) {
        setSelectedScheduleCourseKey('');
      }
      return;
    }

    if (!availableCourseKeys.includes(selectedScheduleCourseKey)) {
      setSelectedScheduleCourseKey(availableCourseKeys[0]);
    }
  }, [academicStructureDraft.grades, selectedScheduleCourseKey, selectedScheduleGradeKey]);

  const visibleRoleOptions = useMemo(
    () => ROLE_OPTIONS,
    []
  );

  const filteredResourceRequests = useMemo(
    () => (resourceStatusFilter
      ? resourceRequests.filter((request) => String(request.status || '') === resourceStatusFilter)
      : resourceRequests),
    [resourceRequests, resourceStatusFilter]
  );

  const resourceLowStockItems = useMemo(
    () => resourceItems.filter((item) => item.lowStock),
    [resourceItems]
  );

  const resourcePendingApprovalCount = useMemo(
    () => resourceRequests.filter((request) => request.status === 'pending_approval').length,
    [resourceRequests]
  );

  const resourcePurchasingCount = useMemo(
    () => resourceRequests.filter((request) => request.status === 'pending_purchasing_review').length,
    [resourceRequests]
  );

  const billing = useMemo(
    () => billingBootstrap.billing || { kpis: { pendingAmount: 0, totalPendingCharges: 0, paidThisMonth: 0, overdueBuckets: {} }, charges: [], overdueParents: [], recentPayments: [], followUps: [] },
    [billingBootstrap]
  );

  const chargeRowsByParentId = useMemo(() => {
    const rowsMap = new Map();

    (billing.charges || []).forEach((charge) => {
      const normalizedStatus = String(charge?.status || '').trim();
      if (!['pending', 'overdue', 'paid'].includes(normalizedStatus)) {
        return;
      }

      const parentId = String(charge?.parentId?._id || charge?.parentId || '').trim();
      if (!parentId) {
        return;
      }

      if (!rowsMap.has(parentId)) {
        rowsMap.set(parentId, []);
      }

      rowsMap.get(parentId).push(charge);
    });

    return rowsMap;
  }, [billing.charges]);

  const parentOptions = useMemo(
    () => (billingBootstrap.parents || []).map((parent) => ({ value: String(parent._id), label: `${parent.name}${parent.email ? ` · ${parent.email}` : ''}` })),
    [billingBootstrap.parents]
  );

  const billingStudentOptions = useMemo(
    () => (billingBootstrap.students || []).map((student) => ({ value: String(student._id), label: `${student.name} · ${student.grade || 'Sin grado'}${student.course ? ` · ${student.course}` : ''}` })),
    [billingBootstrap.students]
  );

  const gradeOptions = useMemo(() => {
    const fallbackGrades = Array.isArray(billingBootstrap.grades) ? billingBootstrap.grades : [];
    if (academicStructureDraft.grades.length > 0) {
      return academicStructureDraft.grades.map((grade) => ({ value: grade.key, label: grade.label || grade.key }));
    }

    return fallbackGrades.map((grade) => ({ value: grade, label: grade }));
  }, [academicStructureDraft.grades, billingBootstrap.grades]);

  const courseOptions = useMemo(() => {
    const structureCourses = academicStructureDraft.grades.flatMap((grade) => resolveGradeCourses(grade).map((course) => ({
      value: course.key,
      label: buildRectoriaCourseOptionLabel(grade, course, resolveGradeCourses(grade)),
    })));
    const fallbackCourses = Array.isArray(billingBootstrap.courses) ? billingBootstrap.courses : [];
    const sourceCourses = structureCourses.length > 0
      ? structureCourses
      : fallbackCourses.map((course) => ({ value: course, label: course }));

    return sourceCourses;
  }, [academicStructureDraft.grades, billingBootstrap.courses]);

  const communicationCourseLabelByValue = useMemo(
    () => courseOptions.reduce((accumulator, course) => {
      accumulator[String(course.value || '').trim()] = course.label || course.value;
      return accumulator;
    }, {}),
    [courseOptions]
  );

  const formatCommunicationCourseTargets = (courseTargets = [], fallbackCourseTitle = '') => {
    const labels = Array.from(new Set([
      fallbackCourseTitle,
      ...(Array.isArray(courseTargets) ? courseTargets : []),
    ].map((item) => String(item || '').trim()).filter(Boolean)))
      .map((item) => communicationCourseLabelByValue[item] || getCourseLabel(item) || item);

    return labels.length > 0 ? labels.join(', ') : 'Sin curso indicado';
  };

  const pendingCommunicationRequests = useMemo(
    () => (billingBootstrap.communicationRequests || []).filter((request) => request.status === 'pending'),
    [billingBootstrap.communicationRequests]
  );

  const selectedCommunicationRequest = useMemo(
    () => pendingCommunicationRequests.find((request) => request._id === selectedCommunicationRequestId) || pendingCommunicationRequests[0] || null,
    [pendingCommunicationRequests, selectedCommunicationRequestId]
  );

  useEffect(() => {
    if (!selectedCommunicationRequest) {
      setSelectedCommunicationRequestId('');
      setCommunicationApprovalDraft(createInstitutionalApprovalDraft(null));
      return;
    }

    setSelectedCommunicationRequestId(selectedCommunicationRequest._id);
    setCommunicationApprovalDraft(createInstitutionalApprovalDraft(selectedCommunicationRequest));
  }, [selectedCommunicationRequest]);

  const courseOptionsByGrade = useMemo(
    () => academicStructureDraft.grades.reduce((accumulator, grade) => {
      accumulator[grade.key] = resolveGradeCourses(grade).map((course) => ({
        value: course.key,
        label: buildRectoriaCourseOptionLabel(grade, course, resolveGradeCourses(grade)),
        isImplicit: Boolean(course.isImplicit),
      }));
      return accumulator;
    }, {}),
    [academicStructureDraft.grades]
  );

  const configuredLevelLabels = useMemo(
    () => academicStructureDraft.levels.reduce((accumulator, level) => {
      accumulator[level.key] = level.label || level.key;
      return accumulator;
    }, {}),
    [academicStructureDraft.levels]
  );

  const getLevelLabel = (levelKey) => configuredLevelLabels[levelKey] || levelKey;

  const schoolYearLevelOptions = useMemo(
    () => (feeSettingsDraft.schoolYearLevels || []).map((level) => ({ value: level.levelKey, label: level.label || getLevelLabel(level.levelKey) })).filter((option) => option.value),
    [feeSettingsDraft.schoolYearLevels, configuredLevelLabels]
  );
  const selectedSchoolYearLevelSetting = useMemo(
    () => (feeSettingsDraft.schoolYearLevels || []).find((level) => level.levelKey === selectedSchoolYearLevelKey) || null,
    [feeSettingsDraft.schoolYearLevels, selectedSchoolYearLevelKey]
  );

  const configuredGradeLabels = useMemo(
    () => academicStructureDraft.grades.reduce((accumulator, grade) => {
      accumulator[grade.key] = grade.label || grade.key;
      return accumulator;
    }, {}),
    [academicStructureDraft.grades]
  );

  const configuredCourseLabels = useMemo(
    () => academicStructureDraft.grades.reduce((accumulator, grade) => {
      resolveGradeCourses(grade).forEach((course) => {
        accumulator[course.key] = buildRectoriaCourseOptionLabel(grade, course, resolveGradeCourses(grade));
      });
      return accumulator;
    }, {}),
    [academicStructureDraft.grades]
  );

  const getGradeLabel = (gradeKey) => {
    const rawKey = String(gradeKey || '').trim();
    const normalizedKey = normalizeAcademicGradeKey(rawKey);
    const keyCandidates = Array.from(new Set([
      rawKey,
      normalizedKey,
      normalizeEducationalLevelKey(rawKey),
      rawKey.replace(/_/g, ' '),
    ].filter(Boolean)));

    for (const candidate of keyCandidates) {
      const configuredLabel = configuredGradeLabels[candidate];
      if (configuredLabel && normalizeInstitutionalLabelCompare(configuredLabel) !== normalizeInstitutionalLabelCompare(candidate)) {
        return configuredLabel;
      }
    }

    const matchedGrade = academicStructureDraft.grades.find((grade) => (
      keyCandidates.some((candidate) => normalizeInstitutionalLabelCompare(grade.key) === normalizeInstitutionalLabelCompare(candidate))
      || keyCandidates.some((candidate) => normalizeInstitutionalLabelCompare(normalizeAcademicGradeKey(grade.key)) === normalizeInstitutionalLabelCompare(normalizedKey))
    ));
    if (matchedGrade?.label) {
      return matchedGrade.label;
    }

    return formatEducationalGradeLabel(rawKey)
      || formatEducationalGradeLabel(normalizedKey)
      || String(rawKey).replace(/_/g, ' ').trim();
  };
  const getCourseLabel = (courseKey) => {
    const rawKey = String(courseKey || '').trim();
    if (!rawKey) {
      return '';
    }

    const configuredLabel = configuredCourseLabels[rawKey];
    if (configuredLabel && !looksLikeTechnicalCourseKey(configuredLabel)) {
      return configuredLabel;
    }

    const matchedCourse = academicStructureDraft.grades
      .flatMap((grade) => resolveGradeCourses(grade))
      .find((course) => (
        normalizeInstitutionalLabelCompare(course.key) === normalizeInstitutionalLabelCompare(rawKey)
        || normalizeInstitutionalLabelCompare(course.section) === normalizeInstitutionalLabelCompare(rawKey)
      ));

    if (matchedCourse) {
      const matchedGrade = academicStructureDraft.grades.find((grade) => (
        resolveGradeCourses(grade).some((course) => course.key === matchedCourse.key)
      ));
      if (matchedGrade) {
        return buildRectoriaCourseOptionLabel(matchedGrade, matchedCourse, resolveGradeCourses(matchedGrade));
      }
    }

    return configuredLabel && !looksLikeTechnicalCourseKey(configuredLabel)
      ? configuredLabel
      : rawKey.replace(/_/g, ' ').trim();
  };
  const getSubjectLabel = (subjectKey) => {
    const normalizedKey = String(subjectKey || '').trim().toLowerCase();
    const matchedSubject = academicStructureDraft.subjects.find((subject) => (
      String(subject.key || '').trim().toLowerCase() === normalizedKey
      || String(subject.label || '').trim().toLowerCase() === normalizedKey
    ));

    return matchedSubject?.label || subjectKey;
  };
  const institutionalCourseLabelContext = useMemo(
    () => ({
      getGradeLabel,
      getCourseLabel,
      getSubjectLabel,
    }),
    [configuredCourseLabels, configuredGradeLabels, academicStructureDraft.grades, academicStructureDraft.subjects]
  );
  const academicGradingLevelOptions = useMemo(
    () => academicStructureDraft.levels.map((level) => ({ value: level.key, label: level.label || level.key })).filter((option) => option.value),
    [academicStructureDraft.levels]
  );
  const selectedAcademicGradingScale = useMemo(
    () => getAcademicGradingScaleForLevel(academicStructureDraft, selectedAcademicGradingLevelKey),
    [academicStructureDraft, selectedAcademicGradingLevelKey]
  );
  const academicDatabaseGradeMetadata = useMemo(
    () => buildAcademicStructureGradeMetadataIndex(academicStructureDraft.grades, configuredLevelLabels),
    [academicStructureDraft.grades, configuredLevelLabels]
  );
  const academicDatabaseRowMetaById = useMemo(
    () => (billingBootstrap.academicDatabase || []).reduce((accumulator, item) => {
      const rowId = String(item?._id || '').trim();
      const resolvedGradeKey = resolveStructureGradeKeyForStudent(item?.grade, academicStructureDraft.grades);
      const metadata = academicDatabaseGradeMetadata[String(item?.grade || '').trim()]
        || academicDatabaseGradeMetadata[resolvedGradeKey]
        || null;
      const levelKey = String(metadata?.levelKey || '').trim();
      accumulator[rowId] = {
        levelKey,
        levelLabel: levelKey ? getLevelLabel(levelKey) : (metadata?.levelLabel || 'Sin nivel'),
        gradeLabel: metadata?.gradeLabel || getGradeLabel(resolvedGradeKey || item?.grade) || 'Sin grado',
        courseLabel: String(item?.course || '').trim() ? getCourseLabel(String(item?.course || '').trim()) : 'Sin curso',
        resolvedGradeKey: resolvedGradeKey || String(item?.grade || '').trim(),
      };
      return accumulator;
    }, {}),
    [billingBootstrap.academicDatabase, academicDatabaseGradeMetadata, academicStructureDraft.grades, configuredCourseLabels, configuredGradeLabels, configuredLevelLabels]
  );
  const academicDatabaseLevelOptions = useMemo(() => {
    const options = academicStructureDraft.levels.map((level) => ({ value: level.key, label: level.label || level.key })).filter((option) => option.value);
    const seenLabels = new Set(options.map((option) => option.label));

    (billingBootstrap.academicDatabase || []).forEach((item) => {
      const levelLabel = academicDatabaseRowMetaById[String(item?._id || '')]?.levelLabel || '';
      if (levelLabel && levelLabel !== 'Sin nivel' && !seenLabels.has(levelLabel)) {
        seenLabels.add(levelLabel);
        options.push({ value: levelLabel, label: levelLabel });
      }
    });

    return options;
  }, [academicStructureDraft.levels, billingBootstrap.academicDatabase, academicDatabaseRowMetaById]);
  const academicDatabaseGradeOptions = useMemo(() => {
    const optionMap = new Map(gradeOptions.map((option) => [String(option.value), option]));

    (billingBootstrap.academicDatabase || []).forEach((item) => {
      const gradeValue = String(item?.grade || '').trim();
      if (!gradeValue || optionMap.has(gradeValue)) {
        return;
      }

      optionMap.set(gradeValue, {
        value: gradeValue,
        label: academicDatabaseRowMetaById[String(item?._id || '')]?.gradeLabel || getGradeLabel(gradeValue),
      });
    });

    return Array.from(optionMap.values());
  }, [billingBootstrap.academicDatabase, gradeOptions, academicDatabaseRowMetaById, configuredGradeLabels]);
  const academicDatabaseCourseOptions = useMemo(() => {
    const optionMap = new Map(courseOptions.map((option) => [String(option.value), { value: String(option.value), label: option.label }]));

    (billingBootstrap.academicDatabase || []).forEach((item) => {
      const courseValue = String(item?.course || '').trim();
      if (courseValue && !optionMap.has(courseValue)) {
        optionMap.set(courseValue, { value: courseValue, label: getCourseLabel(courseValue) || courseValue });
      }
    });

    return Array.from(optionMap.values()).filter((option) => option.value);
  }, [billingBootstrap.academicDatabase, courseOptions, configuredCourseLabels]);
  const academicDatabaseRows = useMemo(
    () => (billingBootstrap.academicDatabase || []).map((item) => ([
      academicDatabaseRowMetaById[String(item?._id || '')]?.gradeLabel || getGradeLabel(item.grade),
      item.lastName || '',
      item.firstName || '',
      formatGenderLabel(item.gender),
      item.documentType || '',
      item.documentNumber || '',
      formatDateForExcel(item.birthDate),
      item.age ?? '',
      item.bloodType || '',
      item.birthPlace || '',
      item.address || '',
      item.motherName || '',
      item.motherDocumentType || '',
      item.motherDocumentNumber || '',
      item.motherPhone || '',
      item.motherEmail || '',
      item.fatherName || '',
      item.fatherDocumentType || '',
      item.fatherDocumentNumber || '',
      item.fatherPhone || '',
      item.fatherEmail || '',
    ])),
    [billingBootstrap.academicDatabase, academicDatabaseRowMetaById, configuredGradeLabels]
  );
  const filteredAcademicDatabase = useMemo(() => {
    const levelFilter = String(academicDatabaseFilters.level || '').trim();
    const gradeFilter = String(academicDatabaseFilters.grade || '').trim();
    const courseFilter = String(academicDatabaseFilters.course || '').trim();
    const studentQuery = String(academicDatabaseFilters.student || '').trim().toLowerCase();
    const fatherQuery = String(academicDatabaseFilters.father || '').trim().toLowerCase();
    const motherQuery = String(academicDatabaseFilters.mother || '').trim().toLowerCase();

    return (billingBootstrap.academicDatabase || []).filter((item) => {
      const rowMeta = academicDatabaseRowMetaById[String(item?._id || '')] || { levelKey: '', levelLabel: 'Sin nivel' };
      const courseValue = String(item?.course || '').trim();
      const studentValue = `${String(item?.firstName || '')} ${String(item?.lastName || '')}`.trim().toLowerCase();
      const fatherValue = String(item?.fatherName || '').toLowerCase();
      const motherValue = String(item?.motherName || '').toLowerCase();

      if (levelFilter && rowMeta.levelKey !== levelFilter && rowMeta.levelLabel !== levelFilter) return false;
      if (gradeFilter) {
        const resolvedStudentGrade = rowMeta.resolvedGradeKey || resolveStructureGradeKeyForStudent(item?.grade, academicStructureDraft.grades);
        if (!gradesMatchForFilter(resolvedStudentGrade, gradeFilter) && !gradesMatchForFilter(item?.grade, gradeFilter)) {
          return false;
        }
      }
      if (courseFilter && courseValue !== courseFilter) return false;
      if (studentQuery && !studentValue.includes(studentQuery)) return false;
      if (fatherQuery && !fatherValue.includes(fatherQuery)) return false;
      if (motherQuery && !motherValue.includes(motherQuery)) return false;
      return true;
    });
  }, [billingBootstrap.academicDatabase, academicDatabaseFilters, academicDatabaseRowMetaById, academicStructureDraft.grades]);
  const academicDatabaseLevelCounts = useMemo(() => {
    const countsByLevel = (billingBootstrap.academicDatabase || []).reduce((accumulator, item) => {
      const levelLabel = academicDatabaseRowMetaById[String(item?._id || '')]?.levelLabel || 'Sin nivel';
      accumulator[levelLabel] = Number(accumulator[levelLabel] || 0) + 1;
      return accumulator;
    }, {});

    const entries = academicDatabaseLevelOptions.map((option) => ({
      key: option.value,
      label: option.label,
      count: Number(countsByLevel[option.label] || 0),
    }));

    if (Number(countsByLevel['Sin nivel'] || 0) > 0) {
      entries.push({ key: 'sin-nivel', label: 'Sin nivel', count: Number(countsByLevel['Sin nivel'] || 0) });
    }

    return entries;
  }, [billingBootstrap.academicDatabase, academicDatabaseLevelOptions, academicDatabaseRowMetaById]);
  const feeGradeCards = useMemo(
    () => feeSettingsDraft.gradeSettings.map((setting, index) => ({
      key: setting.grade,
      label: getGradeLabel(setting.grade),
      index,
      enrollmentBonus: Number(setting.enrollmentBonus || 0),
      enrollmentFee: Number(setting.enrollmentFee || 0),
      monthlyTuition: Number(setting.monthlyTuition || 0),
    })),
    [feeSettingsDraft.gradeSettings, configuredGradeLabels]
  );
  const fixedBenefitGradeRows = useMemo(() => {
    const rowsByGrade = new Map();
    const addRow = (gradeKey, gradeLabel, setting = {}) => {
      const normalizedGradeKey = String(gradeKey || '').trim().toLowerCase();
      if (!normalizedGradeKey || rowsByGrade.has(normalizedGradeKey)) {
        return;
      }

      rowsByGrade.set(normalizedGradeKey, {
        key: normalizedGradeKey,
        grade: String(gradeKey || '').trim(),
        label: String(gradeLabel || getGradeLabel(gradeKey) || gradeKey).trim(),
        enrollmentFee: Number(setting?.enrollmentFee || 0),
        monthlyTuition: Number(setting?.monthlyTuition || 0),
      });
    };

    gradeOptions.forEach((gradeOption) => {
      const matchedSetting = findMatchingFeeSetting(feeSettingsDraft.gradeSettings || [], {
        key: gradeOption.value,
        label: gradeOption.label,
      });
      addRow(gradeOption.value, gradeOption.label, matchedSetting || {});
    });

    feeSettingsDraft.gradeSettings.forEach((setting) => {
      addRow(setting.grade, getGradeLabel(setting.grade), setting);
    });

    return Array.from(rowsByGrade.values());
  }, [feeSettingsDraft.gradeSettings, gradeOptions, configuredGradeLabels]);
  const selectedFeeSettingIndex = useMemo(
    () => feeSettingsDraft.gradeSettings.findIndex((setting) => setting.grade === selectedFeeGradeKey),
    [feeSettingsDraft.gradeSettings, selectedFeeGradeKey]
  );
  const selectedFeeSetting = selectedFeeSettingIndex >= 0 ? feeSettingsDraft.gradeSettings[selectedFeeSettingIndex] : null;
  const selectedFeeProrationPreview = useMemo(
    () => buildAcademicEnrollmentProrationTable(
      selectedFeeSetting?.enrollmentFee || 0,
      feeSettingsDraft,
      selectedFeeSetting?.grade || '',
      { academicGrades: academicStructureDraft.grades || [] },
    ),
    [academicStructureDraft.grades, feeSettingsDraft, selectedFeeSetting?.enrollmentFee, selectedFeeSetting?.grade]
  );
  const selectedFeeBenefitRules = useMemo(() => {
    const gradeBenefitRules = normalizeFeeBenefitRules(selectedFeeSetting?.benefitRules || []);
    return gradeBenefitRules.length ? gradeBenefitRules : normalizeFeeBenefitRules(feeSettingsDraft.benefitRules || []);
  }, [feeSettingsDraft.benefitRules, selectedFeeSetting?.benefitRules]);

  useEffect(() => {
    if (feeSettingsDraft.gradeSettings.length === 0) {
      if (selectedFeeGradeKey) {
        setSelectedFeeGradeKey('');
      }
      return;
    }

    const hasSelectedFeeGrade = feeSettingsDraft.gradeSettings.some((setting) => setting.grade === selectedFeeGradeKey);
    if (!hasSelectedFeeGrade) {
      setSelectedFeeGradeKey(feeSettingsDraft.gradeSettings[0]?.grade || '');
    }
  }, [feeSettingsDraft.gradeSettings, selectedFeeGradeKey]);

  useEffect(() => {
    const availableRoleKeys = visibleRoleOptions.map((option) => option.value);
    if (!availableRoleKeys.length) {
      return;
    }

    if (!availableRoleKeys.includes(selectedTeamRole)) {
      setSelectedTeamRole(availableRoleKeys[0]);
    }
  }, [selectedTeamRole, visibleRoleOptions]);

  useEffect(() => {
    if (academicGradingLevelOptions.length === 0) {
      if (selectedAcademicGradingLevelKey) {
        setSelectedAcademicGradingLevelKey('');
      }
      return;
    }

    if (!academicGradingLevelOptions.some((option) => option.value === selectedAcademicGradingLevelKey)) {
      setSelectedAcademicGradingLevelKey(academicGradingLevelOptions[0].value);
    }
  }, [academicGradingLevelOptions, selectedAcademicGradingLevelKey]);

  const gradeOptionsForSubjects = useMemo(
    () => academicStructureDraft.grades.map((grade) => ({ value: grade.key, label: grade.label || grade.key })),
    [academicStructureDraft.grades]
  );

  const gradeOptionsForSchedule = useMemo(
    () => gradeOptions,
    [gradeOptions]
  );

  const courseOptionsForSchedule = useMemo(() => gradeOptionsForSchedule.flatMap((grade) => (
    courseOptionsByGrade[grade.value] || []
  ).map((course) => ({
    ...course,
    value: `${grade.value}::${course.value}`,
    gradeKey: grade.value,
    courseKey: course.value,
    label: course.isImplicit ? grade.label : `${course.label} · ${grade.label}`,
  }))), [courseOptionsByGrade, gradeOptionsForSchedule]);

  const selectedScheduleCourseOptionValue = selectedScheduleGradeKey && selectedScheduleCourseKey ? `${selectedScheduleGradeKey}::${selectedScheduleCourseKey}` : '';

  const allRegisteredGradeOptions = useMemo(
    () => gradeOptions,
    [gradeOptions]
  );

  const subjectOptionsForSchedule = useMemo(
    () => academicStructureDraft.subjects.map((subject) => ({ value: subject.key, label: subject.label || subject.key, kind: subject.kind })),
    [academicStructureDraft.subjects]
  );

  const academicScheduleGroups = useMemo(
    () => sanitizeAcademicScheduleGroups(normalizeAcademicScheduleSettings(academicStructureDraft.scheduleSettings).groups),
    [academicStructureDraft.scheduleSettings]
  );

  const academicSubjectLoadTemplates = useMemo(
    () => normalizeAcademicSubjectLoadTemplates(academicStructureDraft.subjectLoadTemplates),
    [academicStructureDraft.subjectLoadTemplates]
  );

  const academicTeachingAvailability = useMemo(
    () => normalizeAcademicTeachingAvailability(academicStructureDraft.teachingAvailability),
    [academicStructureDraft.teachingAvailability]
  );

  const scheduleGroupsForVisibleBoard = useMemo(() => {
    if (academicScheduleGroups.length > 0) {
      return academicScheduleGroups;
    }

    const normalizedStartTime = String(scheduleGroupEditor.dayStartTime || '07:00').trim() || '07:00';
    const normalizedEndTime = String(scheduleGroupEditor.dayEndTime || '15:00').trim() || '15:00';
    const previewBlocks = buildAcademicScheduleBlocksFromRange(normalizedStartTime, normalizedEndTime);
    const previewWeekdays = Array.from(new Set((scheduleGroupEditor.weekdays || []).map(Number))).filter((weekday) => ACADEMIC_SCHEDULE_WEEKDAYS.some((item) => item.value === weekday));
    const previewGradeKeys = Array.from(new Set((scheduleGroupEditor.gradeKeys || []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean)));

    if (previewBlocks.length === 0 || previewWeekdays.length === 0 || previewGradeKeys.length === 0) {
      return [];
    }

    return [{
      key: scheduleGroupEditor.key || NEW_SCHEDULE_GROUP_KEY,
      name: scheduleGroupEditor.name || 'Jornada en edición',
      weekdays: previewWeekdays,
      gradeKeys: previewGradeKeys,
      dayStartTime: normalizedStartTime,
      blocks: previewBlocks,
      order: Number(scheduleGroupEditor.order || 10),
    }];
  }, [academicScheduleGroups, scheduleGroupEditor]);

  const newScheduleBreakAvailableBlocks = useMemo(
    () => {
      if (!Array.isArray(newScheduleBreakWeekdays) || newScheduleBreakWeekdays.length === 0) {
        return [];
      }

      const blocksByWeekday = newScheduleBreakWeekdays.map((weekdayValue) => (
        buildSharedAcademicScheduleBlocksForGrades(academicStructureDraft.scheduleSettings, newScheduleBreakGradeKeys, weekdayValue)
      ));
      const [firstWeekdayBlocks, ...otherWeekdayBlocks] = blocksByWeekday;

      return firstWeekdayBlocks.filter((candidateBlock) => (
        otherWeekdayBlocks.every((weekdayBlocks) => weekdayBlocks.some((block) => (
          block.block === candidateBlock.block
            && block.startTime === candidateBlock.startTime
            && block.endTime === candidateBlock.endTime
        )))
      ));
    },
    [academicStructureDraft.scheduleSettings, newScheduleBreakGradeKeys, newScheduleBreakWeekdays]
  );

  useEffect(() => {
    const firstAvailableBlock = newScheduleBreakAvailableBlocks[0];
    if (!firstAvailableBlock) {
      return;
    }

    const currentStartTime = normalizeText(newScheduleBreakStartTime);
    const currentEndTime = normalizeText(newScheduleBreakEndTime);
    if (currentStartTime && currentEndTime) {
      return;
    }

    setNewScheduleBreakStartTime(firstAvailableBlock.startTime);
    setNewScheduleBreakEndTime(firstAvailableBlock.endTime);
  }, [newScheduleBreakAvailableBlocks, newScheduleBreakEndTime, newScheduleBreakStartTime]);

  useEffect(() => {
    if (academicScheduleGroups.length === 0) {
      setSelectedScheduleGroupKey(NEW_SCHEDULE_GROUP_KEY);
      setScheduleGroupEditor({ ...createDefaultAcademicScheduleGroupSettings(0), dayEndTime: '15:00' });
      return;
    }

    if (selectedScheduleGroupKey === NEW_SCHEDULE_GROUP_KEY) {
      return;
    }

    const matchedGroup = academicScheduleGroups.find((group) => group.key === selectedScheduleGroupKey) || academicScheduleGroups[0];
    setSelectedScheduleGroupKey(matchedGroup.key);
    setScheduleGroupEditor({
      key: matchedGroup.key,
      name: matchedGroup.name || '',
      weekdays: [...(matchedGroup.weekdays || [])],
      gradeKeys: [...(matchedGroup.gradeKeys || [])],
      dayStartTime: matchedGroup.dayStartTime,
      dayEndTime: getAcademicScheduleGroupEndTime(matchedGroup),
      blocks: (matchedGroup.blocks || []).map((block) => ({ ...block })),
      order: matchedGroup.order,
    });
  }, [academicScheduleGroups, selectedScheduleGroupKey]);

  useEffect(() => {
    if (academicSubjectLoadTemplates.length === 0) {
      setSelectedSubjectLoadTemplateKey(NEW_SUBJECT_LOAD_TEMPLATE_KEY);
      setSubjectLoadTemplateEditor(createDefaultAcademicSubjectLoadTemplate(0));
      return;
    }

    if (selectedSubjectLoadTemplateKey === NEW_SUBJECT_LOAD_TEMPLATE_KEY) {
      return;
    }

    const matchedTemplate = academicSubjectLoadTemplates.find((item) => item.key === selectedSubjectLoadTemplateKey) || academicSubjectLoadTemplates[0];
    setSelectedSubjectLoadTemplateKey(matchedTemplate.key);
    setSubjectLoadTemplateEditor({
      key: matchedTemplate.key,
      subjectKey: matchedTemplate.subjectKey,
      teacherUserId: matchedTemplate.teacherUserId || '',
      weeklyHours: matchedTemplate.weeklyHours,
      gradeKeys: [...(matchedTemplate.gradeKeys || [])],
      order: matchedTemplate.order,
    });
  }, [academicSubjectLoadTemplates, selectedSubjectLoadTemplateKey]);

  useEffect(() => {
    if (academicTeachingAvailability.length === 0) {
      setSelectedTeachingAvailabilityKey(NEW_TEACHING_AVAILABILITY_KEY);
      setTeachingAvailabilityEditor(createDefaultAcademicTeachingAvailability(0));
      return;
    }

    if (selectedTeachingAvailabilityKey === NEW_TEACHING_AVAILABILITY_KEY) {
      return;
    }

    const matchedAvailability = academicTeachingAvailability.find((item) => item.key === selectedTeachingAvailabilityKey) || academicTeachingAvailability[0];
    setSelectedTeachingAvailabilityKey(matchedAvailability.key);
    setTeachingAvailabilityEditor({
      key: matchedAvailability.key,
      subjectKey: matchedAvailability.subjectKey,
      teacherUserId: matchedAvailability.teacherUserId || '',
      gradeKeys: [...(matchedAvailability.gradeKeys || [])],
      windows: (matchedAvailability.windows || []).map((windowItem) => ({ ...windowItem })),
      order: matchedAvailability.order,
    });
  }, [academicTeachingAvailability, selectedTeachingAvailabilityKey]);

  const teacherUsers = useMemo(
    () => users
      .filter((item) => String(item.role || '') === 'teacher' && String(item.status || '') === 'active')
      .map((item) => ({
        value: String(item._id),
        label: formatInstitutionalUserLabel(item),
        assignedSubjects: Array.isArray(item.assignedSubjects) ? item.assignedSubjects : [],
      })),
    [users]
  );

  const teacherLabelById = useMemo(
    () => teacherUsers.reduce((accumulator, teacher) => {
      accumulator[teacher.value] = teacher.label;
      return accumulator;
    }, {}),
    [teacherUsers]
  );

  const subjectsByGrade = useMemo(
    () => academicStructureDraft.grades.reduce((accumulator, grade) => {
      accumulator[grade.key] = academicStructureDraft.subjects.filter((subject) => Array.isArray(subject.gradeKeys) && subject.gradeKeys.includes(grade.key));
      return accumulator;
    }, {}),
    [academicStructureDraft.grades, academicStructureDraft.subjects]
  );

  const selectedScheduleSubjects = useMemo(
    () => subjectsByGrade[selectedScheduleGradeKey] || [],
    [selectedScheduleGradeKey, subjectsByGrade]
  );

  const scheduleBlockChips = useMemo(
    () => [
      ...ACADEMIC_SCHEDULE_SPECIAL_BLOCKS,
      ...customScheduleBlocks.map((block) => ({
        key: block.key,
        label: block.label,
        className: 'school-creation-calendar-break school-creation-calendar-break--other',
      })),
    ],
    [customScheduleBlocks]
  );

  const scheduleBlockByKey = useMemo(
    () => scheduleBlockChips.reduce((accumulator, block) => {
      accumulator[block.key] = block;
      return accumulator;
    }, {}),
    [scheduleBlockChips]
  );

  const selectedScheduleTeacherOptionsBySubjectKey = useMemo(() => {
    return selectedScheduleSubjects.reduce((accumulator, subject) => {
      const subjectKey = String(subject.key || '').trim();
      const subjectMatchers = new Set([
        normalizeAcademicScheduleMatch(subject.label),
        normalizeAcademicScheduleMatch(subject.key),
      ].filter(Boolean));
      const candidateMap = new Map();
      const existingSchedule = academicStructureDraft.gradeSchedules.find((schedule) => schedule.gradeKey === selectedScheduleGradeKey && String(schedule.courseKey || '') === selectedScheduleCourseKey)
        || academicStructureDraft.gradeSchedules.find((schedule) => schedule.gradeKey === selectedScheduleGradeKey && !String(schedule.courseKey || '').trim());
      const existingLoad = (Array.isArray(existingSchedule?.subjectLoads) ? existingSchedule.subjectLoads : [])
        .find((load) => String(load.subjectKey || '').trim() === subjectKey && String(load.teacherUserId || '').trim());
      if (existingLoad?.teacherUserId) {
        const teacherUserId = String(existingLoad.teacherUserId || '').trim();
        candidateMap.set(teacherUserId, {
          value: teacherUserId,
          label: teacherLabelById[teacherUserId] || 'Docente asignado',
        });
      }
      academicSubjectLoadTemplates
        .filter((template) => (
          String(template.subjectKey || '').trim() === subjectKey
          && String(template.teacherUserId || '').trim()
          && (!Array.isArray(template.gradeKeys) || template.gradeKeys.length === 0 || template.gradeKeys.includes(selectedScheduleGradeKey))
        ))
        .sort((left, right) => {
          const leftAppliesToGrade = !Array.isArray(left.gradeKeys) || left.gradeKeys.length === 0 || left.gradeKeys.includes(selectedScheduleGradeKey);
          const rightAppliesToGrade = !Array.isArray(right.gradeKeys) || right.gradeKeys.length === 0 || right.gradeKeys.includes(selectedScheduleGradeKey);
          return Number(rightAppliesToGrade) - Number(leftAppliesToGrade) || Number(left.order || 0) - Number(right.order || 0);
        })
        .forEach((template) => {
          const teacherUserId = String(template.teacherUserId || '').trim();
          if (teacherUserId && !candidateMap.has(teacherUserId)) {
            candidateMap.set(teacherUserId, {
              value: teacherUserId,
              label: teacherLabelById[teacherUserId] || 'Docente asignado',
            });
          }
        });

      teacherUsers.filter((teacher) => (
        Array.isArray(teacher.assignedSubjects)
        && teacher.assignedSubjects.some((assignedSubject) => subjectMatchers.has(normalizeAcademicScheduleMatch(assignedSubject)))
      )).forEach((teacher) => {
        if (!candidateMap.has(teacher.value)) {
          candidateMap.set(teacher.value, teacher);
        }
      });

      accumulator[subjectKey] = Array.from(candidateMap.values());

      return accumulator;
    }, {});
  }, [academicStructureDraft.gradeSchedules, academicSubjectLoadTemplates, selectedScheduleGradeKey, selectedScheduleSubjects, teacherLabelById, teacherUsers]);

  const selectedScheduleTeacherBySubjectKey = useMemo(() => (
    Object.entries(selectedScheduleTeacherOptionsBySubjectKey).reduce((accumulator, [subjectKey, candidates]) => {
      if (Array.isArray(candidates) && candidates.length === 1) {
        accumulator[subjectKey] = candidates[0].value;
      }
      return accumulator;
    }, {})
  ), [selectedScheduleTeacherOptionsBySubjectKey]);

  const selectedScheduleConfiguredBlocksByWeekday = useMemo(
    () => buildConfiguredAcademicScheduleBlocksByWeekday(scheduleGroupsForVisibleBoard, { gradeKey: selectedScheduleGradeKey }),
    [scheduleGroupsForVisibleBoard, selectedScheduleGradeKey]
  );

  const selectedScheduleConfiguredBlocks = useMemo(
    () => ACADEMIC_SCHEDULE_WEEKDAYS.flatMap((weekday) => selectedScheduleConfiguredBlocksByWeekday[weekday.value] || []),
    [selectedScheduleConfiguredBlocksByWeekday]
  );

  const selectedScheduleHasConfiguredJornada = selectedScheduleConfiguredBlocks.length > 0;

  const assignableGradesByBreak = useMemo(
    () => academicStructureDraft.scheduleBreaks.reduce((accumulator, item) => {
      const selectedSet = new Set(item.gradeKeys);
      accumulator[item.key] = allRegisteredGradeOptions.filter((grade) => !selectedSet.has(grade.value));
      return accumulator;
    }, {}),
    [academicStructureDraft.scheduleBreaks, allRegisteredGradeOptions]
  );

  const scheduleBreakSummaryCards = useMemo(() => {
    const breakItems = Array.isArray(academicStructureDraft.scheduleBreaks) ? academicStructureDraft.scheduleBreaks : [];
    const uniqueWeekdays = new Set(breakItems.map((item) => Number(item.weekday || 0)).filter(Boolean));
    const uniqueGradeKeys = new Set(breakItems.flatMap((item) => (Array.isArray(item.gradeKeys) ? item.gradeKeys : []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean)));

    return [
      {
        key: 'configured-breaks',
        title: 'Breaks configurados',
        description: breakItems.length === 1 ? '1 rango activo en la jornada.' : `${breakItems.length} rangos activos en la jornada.`,
      },
      {
        key: 'covered-days',
        title: 'Días cubiertos',
        description: uniqueWeekdays.size === 0 ? 'Aún no hay días asignados.' : `${uniqueWeekdays.size} día(s) con descansos definidos.`,
      },
      {
        key: 'impacted-grades',
        title: 'Grados impactados',
        description: uniqueGradeKeys.size === 0 ? 'Sin grados asociados todavía.' : `${uniqueGradeKeys.size} grado(s) usan estos descansos.`,
      },
    ];
  }, [academicStructureDraft.scheduleBreaks]);

  const scheduleBreakDays = useMemo(() => ACADEMIC_SCHEDULE_WEEKDAYS.map((weekday) => {
    const items = academicStructureDraft.scheduleBreaks
      .filter((item) => Number(item.weekday) === weekday.value)
      .map((item) => {
        return {
          ...item,
          rangeStart: item.startTime || '99:99',
          rangeEnd: item.endTime || '99:99',
          rangeLabel: `${item.startTime || '--:--'} - ${item.endTime || '--:--'}`,
        };
      })
      .sort((left, right) => {
        if (left.rangeStart === right.rangeStart) {
          return left.rangeEnd.localeCompare(right.rangeEnd);
        }
        return left.rangeStart.localeCompare(right.rangeStart);
      });

    return {
      ...weekday,
      items,
      countLabel: items.length === 1 ? '1 break' : `${items.length} breaks`,
      overview: items.length === 0 ? 'Sin descansos configurados.' : items.map((item) => item.rangeLabel).join(' · '),
    };
  }), [academicStructureDraft.scheduleBreaks, academicStructureDraft.scheduleSettings]);

  const selectedGradeSchedule = useMemo(() => {
    const courseSchedule = academicStructureDraft.gradeSchedules.find((schedule) => schedule.gradeKey === selectedScheduleGradeKey && String(schedule.courseKey || '') === selectedScheduleCourseKey);
    const gradeSchedule = academicStructureDraft.gradeSchedules.find((schedule) => schedule.gradeKey === selectedScheduleGradeKey && !String(schedule.courseKey || '').trim());
    const existingSchedule = courseSchedule || gradeSchedule;
    const subjectLoadSource = gradeSchedule || existingSchedule;
    const subjectLoadMap = new Map((Array.isArray(subjectLoadSource?.subjectLoads) ? subjectLoadSource.subjectLoads : []).map((load) => [load.subjectKey, load]));
    const subjectLoads = selectedScheduleSubjects.map((subject, index) => ({
      subjectKey: subject.key,
      weeklyHours: Number(subjectLoadMap.get(subject.key)?.weeklyHours || 0),
      teacherUserId: String(subjectLoadMap.get(subject.key)?.teacherUserId || selectedScheduleTeacherBySubjectKey[subject.key] || '').trim(),
      order: Number(subjectLoadMap.get(subject.key)?.order || (index + 1) * 10),
    }));
    const weeklySchedule = Array.isArray(existingSchedule?.weeklySchedule) && existingSchedule.weeklySchedule.length > 0
      ? existingSchedule.weeklySchedule.map((entry) => ({
        key: entry.key || normalizeAcademicScheduleSlotKey(entry.weekday, entry.block),
        weekday: Number(entry.weekday || 0),
        block: Number(entry.block || 0),
        startTime: String(entry.startTime || '').trim(),
        endTime: String(entry.endTime || '').trim(),
        entryType: String(entry.entryType || 'class').trim() === 'break' ? 'break' : 'class',
        subjectKey: String(entry.subjectKey || '').trim(),
        breakKey: String(entry.breakKey || '').trim(),
        breakLabel: String(entry.breakLabel || '').trim(),
        teacherUserId: String(entry.teacherUserId || '').trim(),
      })).filter((entry) => entry.entryType === 'break' || entry.subjectKey)
      : [];

    return {
      gradeKey: selectedScheduleGradeKey,
      courseKey: selectedScheduleCourseKey,
      subjectLoads,
      weeklySchedule,
      updatedAt: existingSchedule?.updatedAt || null,
    };
  }, [academicStructureDraft.gradeSchedules, selectedScheduleCourseKey, selectedScheduleGradeKey, selectedScheduleSubjects, selectedScheduleTeacherBySubjectKey]);

  const selectedScheduleBoardEntriesByWeekday = useMemo(
    () => ACADEMIC_SCHEDULE_WEEKDAYS.reduce((accumulator, weekday) => {
      accumulator[weekday.value] = selectedGradeSchedule.weeklySchedule
        .filter((entry) => Number(entry.weekday) === weekday.value)
        .sort((left, right) => {
          const leftStart = academicScheduleTimeToMinutes(left.startTime) ?? 0;
          const rightStart = academicScheduleTimeToMinutes(right.startTime) ?? 0;
          return leftStart - rightStart || Number(left.block || 0) - Number(right.block || 0);
        });
      return accumulator;
    }, {}),
    [selectedGradeSchedule.weeklySchedule]
  );

  const selectedScheduleBoardWindow = useMemo(() => {
    const jornadaMinutes = selectedScheduleConfiguredBlocks.flatMap((entry) => [
      academicScheduleTimeToMinutes(entry.startTime),
      academicScheduleTimeToMinutes(entry.endTime),
    ]).filter((value) => value !== null);
    const outOfRangeEntryMinutes = selectedGradeSchedule.weeklySchedule.flatMap((entry) => {
      const startMinute = academicScheduleTimeToMinutes(entry.startTime);
      const endMinute = academicScheduleTimeToMinutes(entry.endTime);
      const entryWeekdayBlocks = selectedScheduleConfiguredBlocks.filter((block) => Number(block.weekday) === Number(entry.weekday));
      const weekdayStart = Math.min(...entryWeekdayBlocks.map((block) => academicScheduleTimeToMinutes(block.startTime)).filter((value) => value !== null));
      const weekdayEnd = Math.max(...entryWeekdayBlocks.map((block) => academicScheduleTimeToMinutes(block.endTime)).filter((value) => value !== null));
      const isOutsideJornada = entryWeekdayBlocks.length > 0 && (
        (startMinute !== null && startMinute < weekdayStart)
        || (endMinute !== null && endMinute > weekdayEnd)
      );
      return isOutsideJornada ? [startMinute, endMinute] : [];
    }).filter((value) => value !== null);
    const sourceMinutes = jornadaMinutes.length > 0 ? [...jornadaMinutes, ...outOfRangeEntryMinutes] : outOfRangeEntryMinutes;
    const start = sourceMinutes.length > 0 ? Math.min(...sourceMinutes) : 7 * 60;
    const end = sourceMinutes.length > 0 ? Math.max(...sourceMinutes) : 15 * 60;
    const roundedStart = Math.max(0, Math.floor(start / 60) * 60);
    const roundedEnd = Math.min(24 * 60, Math.ceil(end / 60) * 60);

    return {
      start: roundedStart,
      end: Math.max(roundedStart + 60, roundedEnd),
    };
  }, [selectedGradeSchedule.weeklySchedule, selectedScheduleConfiguredBlocks]);

  const selectedScheduleBoardRows = useMemo(
    () => Array.from({ length: Math.max(1, Math.ceil((selectedScheduleBoardWindow.end - selectedScheduleBoardWindow.start) / 15) + 1) }, (_, index) => {
      const minute = selectedScheduleBoardWindow.start + index * 15;
      return {
        minute,
        label: minute % 60 === 0 ? academicScheduleMinutesToAmPmLabel(minute) : '',
        isHour: minute % 60 === 0,
        isHalfHour: minute % 60 === 30,
      };
    }),
    [selectedScheduleBoardWindow]
  );

  const selectedScheduleBoardRowHeight = 24;

  const selectedScheduleBoardDays = ACADEMIC_SCHEDULE_WEEKDAYS;

  const selectedScheduleBoardHeight = selectedScheduleBoardRows.length * selectedScheduleBoardRowHeight;

  const selectedScheduleConfiguredSlotByKey = useMemo(
    () => selectedScheduleConfiguredBlocks.reduce((accumulator, slot) => {
      accumulator[normalizeAcademicScheduleSlotKey(slot.weekday, slot.block)] = slot;
      return accumulator;
    }, {}),
    [selectedScheduleConfiguredBlocks]
  );

  const selectedScheduleEntryByKey = useMemo(
    () => selectedGradeSchedule.weeklySchedule.reduce((accumulator, entry) => {
      accumulator[String(entry.key || normalizeAcademicScheduleSlotKey(entry.weekday, entry.block))] = entry;
      return accumulator;
    }, {}),
    [selectedGradeSchedule.weeklySchedule]
  );

  const overdueFamilyRows = useMemo(() => {
    return Array.from(chargeRowsByParentId.entries())
      .map(([parentId, relatedCharges]) => {
        const pendingCharges = relatedCharges.filter((charge) => ['pending', 'overdue'].includes(String(charge?.status || '')));
        const paidCharges = relatedCharges.filter((charge) => String(charge?.status || '') === 'paid');
        const overdueDays = pendingCharges.reduce((maxDays, charge) => Math.max(maxDays, calculateOverdueDays(charge?.dueDate)), 0);
        const overdueMonths = pendingCharges.reduce((maxMonths, charge) => Math.max(maxMonths, Number(charge?.overdueMonths || 0)), 0);
        const hasOverdue = pendingCharges.some((charge) => String(charge?.status || '') === 'overdue' || Number(charge?.overdueMonths || 0) > 0 || calculateOverdueDays(charge?.dueDate) > 0);
        const firstCharge = relatedCharges[0] || {};
        const students = Array.from(new Set(relatedCharges.map((charge) => charge?.studentName).filter(Boolean)));
        const amount = pendingCharges.reduce((sum, charge) => sum + Number(charge?.amount || 0), 0);

        return {
          parentId: parentId || String(firstCharge?.parentName || 'sin-acudiente'),
          parentName: firstCharge?.parentName || 'Acudiente',
          parentPhone: firstCharge?.parentPhone || '',
          students,
          amount,
          overdueDays,
          overdueMonths,
          statusLabel: pendingCharges.length ? (hasOverdue ? 'En mora' : 'Pendiente de pago') : (paidCharges.length ? 'Ya pagado' : 'Sin pago activo'),
        };
      })
      .sort((left, right) => {
        if (Number(right.amount > 0) !== Number(left.amount > 0)) return Number(right.amount > 0) - Number(left.amount > 0);
        if (right.overdueDays !== left.overdueDays) {
          return right.overdueDays - left.overdueDays;
        }
        if (right.overdueMonths !== left.overdueMonths) {
          return right.overdueMonths - left.overdueMonths;
        }
        return right.amount - left.amount;
      });
  }, [chargeRowsByParentId]);

  const visibleInstitutionalRoles = useMemo(
    () => visibleRoleOptions.map((option) => option.value).filter((value) => INSTITUTIONAL_ROLES.includes(value)),
    [visibleRoleOptions]
  );

  const institutionalUsers = useMemo(
    () => users.filter((item) => visibleInstitutionalRoles.includes(String(item.role || ''))),
    [users, visibleInstitutionalRoles]
  );

  const roleSummary = useMemo(
    () => visibleRoleOptions.map((option) => ({
      ...option,
      count: institutionalUsers.filter((item) => item.role === option.value).length,
    })),
    [institutionalUsers, visibleRoleOptions]
  );

  const usersByRole = useMemo(
    () => visibleRoleOptions.map((option) => ({
      ...option,
      users: institutionalUsers.filter((item) => item.role === option.value),
    })),
    [institutionalUsers, visibleRoleOptions]
  );

  const selectedTeamGroup = useMemo(
    () => usersByRole.find((group) => group.value === selectedTeamRole) || usersByRole[0] || null,
    [selectedTeamRole, usersByRole]
  );

  const coordinationUsers = useMemo(
    () => institutionalUsers.filter((item) => String(item.role || '') === 'coordination'),
    [institutionalUsers]
  );

  const pendingCourseStudents = useMemo(
    () => students
      .filter((student) => {
        if (!normalizeText(student.grade)) {
          return false;
        }

        const gradeKey = resolveStructureGradeKeyForStudent(student.grade, academicStructureDraft.grades);
        const grade = academicStructureDraft.grades.find((entry) => entry.key === gradeKey);
        if (!grade) {
          return !normalizeText(student.course);
        }

        return !studentHasAssignedCourseInGrade(student, grade);
      })
      .sort((left, right) => {
        const gradeComparison = String(left.grade || '').localeCompare(String(right.grade || ''), 'es', { numeric: true });
        if (gradeComparison !== 0) {
          return gradeComparison;
        }
        return String(left.name || '').localeCompare(String(right.name || ''), 'es', { sensitivity: 'base' });
      }),
    [students, academicStructureDraft.grades]
  );

  const studentCountsByCourse = useMemo(
    () => students.reduce((accumulator, student) => {
      const gradeKey = resolveStructureGradeKeyForStudent(student.grade, academicStructureDraft.grades);
      const grade = academicStructureDraft.grades.find((entry) => entry.key === gradeKey);
      const courseKey = grade
        ? resolveStudentCourseKey(student, grade)
        : normalizeText(student.course);
      if (!courseKey) {
        return accumulator;
      }

      accumulator[courseKey] = Number(accumulator[courseKey] || 0) + 1;
      return accumulator;
    }, {}),
    [students, academicStructureDraft.grades]
  );

  const studentsByCourse = useMemo(
    () => students.reduce((accumulator, student) => {
      const gradeKey = resolveStructureGradeKeyForStudent(student.grade, academicStructureDraft.grades);
      const grade = academicStructureDraft.grades.find((entry) => entry.key === gradeKey);
      const courseKey = grade
        ? resolveStudentCourseKey(student, grade)
        : normalizeText(student.course);
      if (!courseKey) {
        return accumulator;
      }

      if (!accumulator[courseKey]) {
        accumulator[courseKey] = [];
      }

      accumulator[courseKey].push(student);
      return accumulator;
    }, {}),
    [students, academicStructureDraft.grades]
  );

  const selectedCourseStudents = useMemo(() => {
    const courseKey = String(courseStudentsModal.courseKey || '').trim();
    if (!courseKey) {
      return [];
    }

    return [...(studentsByCourse[courseKey] || [])].sort((left, right) => (
      String(left.name || '').localeCompare(String(right.name || ''), 'es', { sensitivity: 'base' })
    ));
  }, [courseStudentsModal.courseKey, studentsByCourse]);

  const filteredPendingStudents = useMemo(() => {
    const query = String(studentSearch || '').trim().toLowerCase();
    if (!query) {
      return pendingCourseStudents;
    }

    return pendingCourseStudents.filter((student) => {
      const haystack = `${student.name || ''} ${student.schoolCode || ''} ${student.grade || ''} ${student.course || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [pendingCourseStudents, studentSearch]);


  const assignedStudentCountsByGrade = useMemo(
    () => academicStructureDraft.grades.reduce((accumulator, grade) => {
      accumulator[grade.key] = resolveGradeCourses(grade).reduce(
        (sum, course) => sum + Number(studentCountsByCourse[course.key] || 0),
        0
      );
      return accumulator;
    }, {}),
    [academicStructureDraft.grades, studentCountsByCourse]
  );

  const pendingStudentCountsByGrade = useMemo(
    () => pendingCourseStudents.reduce((accumulator, student) => {
      const gradeKey = resolveStructureGradeKeyForStudent(student.grade, academicStructureDraft.grades)
        || normalizeAcademicGradeKey(student.grade);
      if (!gradeKey) {
        return accumulator;
      }

      accumulator[gradeKey] = Number(accumulator[gradeKey] || 0) + 1;
      return accumulator;
    }, {}),
    [pendingCourseStudents, academicStructureDraft.grades]
  );

  const educationalLevelOptions = useMemo(
    () => academicStructureDraft.levels.map((level) => ({ value: level.key, label: level.label || level.key })),
    [academicStructureDraft.levels]
  );

  const groupedEducationalLevels = useMemo(() => {
    const levels = academicStructureDraft.levels.map((level) => ({
      ...level,
      grades: academicStructureDraft.grades.filter((grade) => grade.levelKey === level.key),
    }));

    const unassignedGrades = academicStructureDraft.grades.filter((grade) => !grade.levelKey);
    if (unassignedGrades.length > 0) {
      levels.push({
        key: '__without_level__',
        label: 'Sin nivel educativo',
        order: Number.MAX_SAFE_INTEGER,
        grades: unassignedGrades,
      });
    }

    return levels;
  }, [academicStructureDraft.grades, academicStructureDraft.levels]);

  const subjectMapLevelOptions = useMemo(
    () => groupedEducationalLevels
      .filter((level) => (level.grades || []).length > 0)
      .map((level) => ({ value: level.key, label: level.label || level.key, gradeCount: level.grades.length })),
    [groupedEducationalLevels]
  );

  const assignableGradesByLevel = useMemo(
    () => groupedEducationalLevels.reduce((accumulator, level) => {
      if (level.key === '__without_level__') {
        accumulator[level.key] = [];
        return accumulator;
      }

      accumulator[level.key] = academicStructureDraft.grades
        .filter((grade) => grade.levelKey !== level.key)
        .map((grade) => ({
          value: grade.key,
          label: grade.levelKey && configuredLevelLabels[grade.levelKey]
            ? `${grade.label || grade.key} · hoy en ${configuredLevelLabels[grade.levelKey]}`
            : (grade.label || grade.key),
        }));
      return accumulator;
    }, {}),
    [academicStructureDraft.grades, configuredLevelLabels, groupedEducationalLevels]
  );

  const teamLevelOptions = useMemo(() => academicStructureDraft.levels.map((level) => ({
    key: level.key,
    label: level.label || level.key,
  })), [academicStructureDraft.levels]);

  const coordinationUsersByLevelKey = useMemo(
    () => teamLevelOptions.reduce((accumulator, level) => {
      const levelMatchers = new Set([
        normalizeAcademicScheduleMatch(level.key),
        normalizeAcademicScheduleMatch(level.label),
      ].filter(Boolean));
      accumulator[level.key] = coordinationUsers.filter((item) => levelMatchers.has(normalizeAcademicScheduleMatch(item.coordinationScope)));
      return accumulator;
    }, {}),
    [coordinationUsers, teamLevelOptions]
  );

  const educationalLevelSummaries = useMemo(() => {
    if (groupedEducationalLevels.length > 0) {
      return groupedEducationalLevels
        .filter((level) => level.key !== '__without_level__')
        .map((level) => ({
          key: level.key,
          label: level.label,
          gradesCount: level.grades.length,
          coursesCount: level.grades.reduce((sum, grade) => sum + (grade.courses || []).length, 0),
          assignedStudents: level.grades.reduce((sum, grade) => sum + Number(assignedStudentCountsByGrade[grade.key] || 0), 0),
          pendingStudents: level.grades.reduce((sum, grade) => sum + Number(pendingStudentCountsByGrade[grade.key] || 0), 0),
          coordinatorCount: Number((coordinationUsersByLevelKey[level.key] || []).length || 0),
        }));
    }

    return teamLevelOptions.map((level) => ({
      key: level.key,
      label: level.label,
      gradesCount: 0,
      coursesCount: 0,
      assignedStudents: 0,
      pendingStudents: 0,
      coordinatorCount: Number((coordinationUsersByLevelKey[level.key] || []).length || 0),
    }));
  }, [assignedStudentCountsByGrade, coordinationUsersByLevelKey, groupedEducationalLevels, pendingStudentCountsByGrade, teamLevelOptions]);

  const educationalLevelSummaryByKey = useMemo(
    () => educationalLevelSummaries.reduce((accumulator, level) => {
      accumulator[level.key] = level;
      return accumulator;
    }, {}),
    [educationalLevelSummaries]
  );

  const campusPerformanceCourses = useMemo(
    () => (billingBootstrap.campusCourses || [])
      .map((course) => {
        const normalizedCourse = normalizeCampusCourseForAcademicContent(course);
        return {
          ...normalizedCourse,
          displayLabel: formatRectoriaInstitutionalCourseLabel(normalizedCourse, institutionalCourseLabelContext),
          averageScore: Number.isFinite(Number(course.stats?.averageScore)) ? Number(course.stats.averageScore) : null,
          studentCount: Number(course.stats?.studentCount || 0),
          evaluatedStudentCount: Number(course.stats?.evaluatedStudentCount || 0),
          atRiskCount: Number(course.stats?.atRiskCount || 0),
          pendingGradingCount: Number(course.stats?.pendingGradingCount || 0),
          gradingCoverageRate: Number.isFinite(Number(course.stats?.gradingCoverageRate)) ? Number(course.stats.gradingCoverageRate) : null,
          atRiskStudents: Array.isArray(course.stats?.atRiskStudents) ? course.stats.atRiskStudents : [],
          stats: course.stats,
        };
      })
      .filter((course) => course.stats),
    [billingBootstrap.campusCourses, institutionalCourseLabelContext]
  );

  const academicGradingScale = useMemo(
    () => normalizeAcademicGradingScale(academicStructureDraft.gradingScale || {}),
    [academicStructureDraft.gradingScale]
  );
  const passingScoreLabel = formatAcademicScore(academicGradingScale.passingScore);
  const courseAttentionScore = Math.min(
    academicGradingScale.maxScore,
    Number((Number(academicGradingScale.passingScore || 3) + ((Number(academicGradingScale.maxScore || 5) - Number(academicGradingScale.minScore || 0)) * 0.1)).toFixed(2))
  );

  const overviewAcademicPerformance = useMemo(
    () => buildRectoriaInstitutionalPerformanceSnapshot({
      courses: campusPerformanceCourses,
      gradingScale: academicGradingScale,
      teacherLabelById,
      educationalLevelSummaries,
      groupedEducationalLevels,
      courseAttentionScore,
    }),
    [academicGradingScale, campusPerformanceCourses, courseAttentionScore, educationalLevelSummaries, groupedEducationalLevels, teacherLabelById]
  );

  const overviewAcademicLevelKpi = useMemo(() => {
    const levels = educationalLevelSummaries.map((level) => ({
      ...level,
      totalStudents: Number(level.assignedStudents || 0) + Number(level.pendingStudents || 0),
    }));

    return {
      levels,
      totalLevels: levels.length,
      totalGrades: levels.reduce((sum, level) => sum + Number(level.gradesCount || 0), 0),
      totalCourses: levels.reduce((sum, level) => sum + Number(level.coursesCount || 0), 0),
      assignedStudents: levels.reduce((sum, level) => sum + Number(level.assignedStudents || 0), 0),
      pendingStudents: levels.reduce((sum, level) => sum + Number(level.pendingStudents || 0), 0),
    };
  }, [educationalLevelSummaries]);

  const overviewBillingKpis = useMemo(() => {
    const overdueCriticalFamilies = overdueFamilyRows.filter((item) => item.overdueDays >= 30).length;
    return {
      pendingAmount: Number(billing.kpis?.pendingAmount || 0),
      paidThisMonth: Number(billing.kpis?.paidThisMonth || 0),
      totalPendingCharges: Number(billing.kpis?.totalPendingCharges || 0),
      overdueFamilies: overdueFamilyRows.length,
      overdueCriticalFamilies,
    };
  }, [billing.kpis, overdueFamilyRows]);

  const selectedTeamStatCards = useMemo(() => {
    if (!selectedTeamGroup) {
      return [];
    }

    const activeCount = selectedTeamGroup.users.filter((item) => item.status === 'active').length;
    const inactiveCount = selectedTeamGroup.users.length - activeCount;
    const cards = [
      { key: 'members', label: 'Integrantes', value: selectedTeamGroup.users.length, helper: 'Total registrados en este rol.' },
      { key: 'active', label: 'Activos', value: activeCount, helper: 'Disponibles hoy en operación.' },
      { key: 'inactive', label: 'Inactivos', value: inactiveCount, helper: 'Pendientes de reactivar o retirar.' },
    ];

    if (selectedTeamRole === 'coordination') {
      cards.push({
        key: 'scope',
        label: 'Con alcance definido',
        value: selectedTeamGroup.users.filter((item) => normalizeText(item.coordinationScope)).length,
        helper: 'Coordinadores ya asignados a un nivel.',
      });
    }

    if (selectedTeamRole === 'teacher') {
      cards.push({
        key: 'subjects',
        label: 'Con asignaturas',
        value: selectedTeamGroup.users.filter((item) => {
          const teacherUserId = String(item._id || '').trim();
          const hasBaseSubjects = Array.isArray(item.assignedSubjects) && item.assignedSubjects.length > 0;
          const hasLinkedSubjects = academicSubjectLoadTemplates.some((template) => String(template.teacherUserId || '').trim() === teacherUserId);
          return hasBaseSubjects || hasLinkedSubjects;
        }).length,
        helper: 'Docentes con materias registradas o vinculadas.',
      });
    }

    if (selectedTeamRole === 'coordination') {
      cards.push({
        key: 'levels',
        label: 'Niveles educativos',
        value: educationalLevelSummaries.length,
        helper: 'Niveles disponibles para asignar coordinacion.',
      });
    }

    return cards;
  }, [academicSubjectLoadTemplates, educationalLevelSummaries.length, selectedTeamGroup, selectedTeamRole]);

  const teamTeacherAssignmentCoursePreview = useMemo(() => {
    const subjectKeys = getTeamTeacherAssignmentSubjectKeys(teamTeacherAssignment);
    const selectedGradeKeys = teamTeacherAssignment.gradeKeys || [];
    if (!subjectKeys.length || !selectedGradeKeys.length) {
      return [];
    }

    return Array.from(new Map(
      subjectKeys.flatMap((subjectKey) => {
        const subject = academicStructureDraft.subjects.find((item) => item.key === subjectKey);
        const gradeKeysForSubject = resolveSubjectAssignmentGradeKeys(subject, selectedGradeKeys);
        return gradeKeysForSubject.flatMap((gradeKey) => (
          (courseOptionsByGrade[gradeKey] || []).map((course) => [
            `${subjectKey}::${gradeKey}::${course.value}`,
            `${subject?.label || subjectKey} · ${getGradeLabel(gradeKey)} · ${course.label}`,
          ])
        ));
      }),
    ).entries()).map(([value, label]) => ({ value, label }));
  }, [academicStructureDraft.subjects, courseOptionsByGrade, getGradeLabel, teamTeacherAssignment]);

  const teamTeacherAssignmentRows = useMemo(
    () => academicSubjectLoadTemplates
      .filter((item) => item.teacherUserId || item.subjectKey)
      .map((item) => ({
        ...item,
        teacherLabel: teacherLabelById[item.teacherUserId] || 'Sin docente asignado',
        subjectLabel: subjectOptionsForSchedule.find((subject) => subject.value === item.subjectKey)?.label || item.subjectKey || 'Sin asignatura',
        gradeLabels: item.gradeKeys.map((gradeKey) => getGradeLabel(gradeKey)).filter(Boolean),
        courseLabels: Array.from(new Map(
          item.gradeKeys.flatMap((gradeKey) => (
            (courseOptionsByGrade[gradeKey] || []).map((course) => [`${gradeKey}::${course.value}`, `${getGradeLabel(gradeKey)} · ${course.label}`])
          ))
        ).values()),
      }))
      .sort((left, right) => (
        left.teacherLabel.localeCompare(right.teacherLabel, 'es', { sensitivity: 'base' })
        || left.subjectLabel.localeCompare(right.subjectLabel, 'es', { sensitivity: 'base' })
      )),
    [academicSubjectLoadTemplates, courseOptionsByGrade, getGradeLabel, subjectOptionsForSchedule, teacherLabelById]
  );

  const selectedTeamTeacherAssignmentRows = useMemo(() => {
    const teacherUserId = String(teamTeacherAssignment.teacherUserId || '').trim();
    if (!teacherUserId) {
      return teamTeacherAssignmentRows;
    }

    return teamTeacherAssignmentRows.filter((assignment) => String(assignment.teacherUserId || '').trim() === teacherUserId);
  }, [teamTeacherAssignment.teacherUserId, teamTeacherAssignmentRows]);

  const headroomCourseOptions = useMemo(() => (
    academicStructureDraft.grades.flatMap((grade) => resolveGradeCourses(grade).map((course) => ({
      value: course.key,
      label: `${grade.label || grade.key} · ${course.label || course.section || course.key}`,
      gradeKey: grade.key,
      teacherUserId: String(course.headroomTeacherUserId || '').trim(),
    })))
  ), [academicStructureDraft.grades]);

  const selectedHeadroomCourseOptions = useMemo(() => {
    const gradeKey = String(headroomTeacherAssignment.gradeKey || '').trim();
    return gradeKey ? (courseOptionsByGrade[gradeKey] || []) : [];
  }, [courseOptionsByGrade, headroomTeacherAssignment.gradeKey]);

  const headroomAssignmentRows = useMemo(() => (
    headroomCourseOptions
      .filter((course) => course.teacherUserId)
      .map((course) => ({
        ...course,
        teacherLabel: teacherLabelById[course.teacherUserId] || 'Docente no encontrado',
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }))
  ), [headroomCourseOptions, teacherLabelById]);

  const headroomCourseLabelsByTeacherId = useMemo(() => (
    headroomCourseOptions.reduce((accumulator, course) => {
      const teacherUserId = String(course.teacherUserId || '').trim();
      if (!teacherUserId) {
        return accumulator;
      }

      accumulator[teacherUserId] = [...(accumulator[teacherUserId] || []), course.label];
      return accumulator;
    }, {})
  ), [headroomCourseOptions]);

  const teacherTeachingSummaryById = useMemo(() => {
    const subjectLabelByKey = new Map(subjectOptionsForSchedule.map((subject) => [subject.value, subject.label]));
    const appendTeacherAssignment = (accumulator, { teacherUserId, subjectKey, subjectLabel, courseLabels, gradeLabels }) => {
      const normalizedTeacherUserId = String(teacherUserId || '').trim();
      if (!normalizedTeacherUserId) {
        return accumulator;
      }

      const current = accumulator[normalizedTeacherUserId] || {
        subjects: new Map(),
        courses: new Map(),
      };
      const normalizedSubjectKey = String(subjectKey || subjectLabel || '').trim();
      const effectiveSubjectLabel = subjectLabel || subjectLabelByKey.get(normalizedSubjectKey) || normalizedSubjectKey || 'Asignatura';
      const effectiveCourseLabels = Array.isArray(courseLabels) && courseLabels.length > 0 ? courseLabels : gradeLabels;

      if (effectiveSubjectLabel) {
        current.subjects.set(normalizedSubjectKey || effectiveSubjectLabel, effectiveSubjectLabel);
      }
      (Array.isArray(effectiveCourseLabels) ? effectiveCourseLabels : []).filter(Boolean).forEach((courseLabel) => {
        current.courses.set(courseLabel, courseLabel);
      });

      accumulator[normalizedTeacherUserId] = current;
      return accumulator;
    };

    const summaryByTeacherId = teamTeacherAssignmentRows.reduce((accumulator, assignment) => {
      const teacherUserId = String(assignment.teacherUserId || '').trim();
      if (!teacherUserId) {
        return accumulator;
      }

      return appendTeacherAssignment(accumulator, {
        teacherUserId,
        subjectKey: assignment.subjectKey,
        subjectLabel: assignment.subjectLabel,
        courseLabels: assignment.courseLabels,
        gradeLabels: assignment.gradeLabels,
      });
    }, {});

    (Array.isArray(academicStructureDraft.gradeSchedules) ? academicStructureDraft.gradeSchedules : []).forEach((gradeSchedule) => {
      const gradeKey = String(gradeSchedule.gradeKey || '').trim();
      if (!gradeKey) {
        return;
      }

      const courseKey = String(gradeSchedule.courseKey || '').trim();
      const courseLabels = courseKey
        ? [`${getGradeLabel(gradeKey)} · ${getCourseLabel(courseKey)}`]
        : (courseOptionsByGrade[gradeKey] || []).map((course) => `${getGradeLabel(gradeKey)} · ${course.label}`);
      const fallbackGradeLabels = [getGradeLabel(gradeKey)].filter(Boolean);
      const scheduleAssignments = new Map();

      (Array.isArray(gradeSchedule.subjectLoads) ? gradeSchedule.subjectLoads : []).forEach((load) => {
        const teacherUserId = String(load.teacherUserId || '').trim();
        const subjectKey = String(load.subjectKey || '').trim();
        if (teacherUserId && subjectKey) {
          scheduleAssignments.set(`${teacherUserId}::${subjectKey}`, { teacherUserId, subjectKey });
        }
      });

      (Array.isArray(gradeSchedule.weeklySchedule) ? gradeSchedule.weeklySchedule : []).forEach((entry) => {
        const teacherUserId = String(entry.teacherUserId || '').trim();
        const subjectKey = String(entry.subjectKey || '').trim();
        if (String(entry.entryType || 'class') !== 'break' && teacherUserId && subjectKey) {
          scheduleAssignments.set(`${teacherUserId}::${subjectKey}`, { teacherUserId, subjectKey });
        }
      });

      scheduleAssignments.forEach((assignment) => {
        appendTeacherAssignment(summaryByTeacherId, {
          ...assignment,
          subjectLabel: subjectLabelByKey.get(assignment.subjectKey) || assignment.subjectKey,
          courseLabels,
          gradeLabels: fallbackGradeLabels,
        });
      });
    });

    return summaryByTeacherId;
  }, [academicStructureDraft.gradeSchedules, courseOptionsByGrade, getCourseLabel, getGradeLabel, subjectOptionsForSchedule, teamTeacherAssignmentRows]);

  const selectedTeamTeacherSummary = useMemo(() => {
    const teacherUserId = String(teamTeacherAssignment.teacherUserId || '').trim();
    if (!teacherUserId) {
      return null;
    }

    return teacherTeachingSummaryById[teacherUserId] || { subjects: new Map(), courses: new Map() };
  }, [teamTeacherAssignment.teacherUserId, teacherTeachingSummaryById]);

  const onUserFormChange = (field, value) => {
    setUserForm((prev) => ({ ...prev, [field]: value }));
  };

  const onResourcePlannerCycleChange = (field, value) => {
    setResourcePlannerCycleDraft((prev) => ({ ...prev, [field]: value }));
  };

  const onCreateResourcePlannerCycle = async (event) => {
    event.preventDefault();
    clearMessages();

    if (!String(resourcePlannerCycleDraft.title || '').trim() || !String(resourcePlannerCycleDraft.submissionDeadline || '').trim()) {
      setError('Escribe titulo y fecha limite del planner.');
      return;
    }

    setBusy(true);
    try {
      await createHrPlannerCycle(resourcePlannerCycleDraft);
      setResourcePlannerCycleDraft(createEmptyResourcePlannerCycleDraft());
      setSuccess('Planner docente creado para los profesores.');
      await loadPortal({ silent: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo crear el planner docente.');
    } finally {
      setBusy(false);
    }
  };

  const onToggleResourcePlannerRequest = (requestId) => {
    setSelectedResourcePlannerRequestIds((currentIds) => (
      currentIds.includes(requestId)
        ? currentIds.filter((id) => id !== requestId)
        : [...currentIds, requestId]
    ));
  };

  const onConsolidateResourcePlannerRequests = async () => {
    clearMessages();
    if (!selectedResourcePlannerRequestIds.length) {
      setError('Selecciona al menos un planner docente para consolidar.');
      return;
    }

    setBusy(true);
    try {
      await consolidateHrPlannerRequests({
        requestIds: selectedResourcePlannerRequestIds,
        reviewNotes: resourcePlannerConsolidationNote,
      });
      setSelectedResourcePlannerRequestIds([]);
      setResourcePlannerConsolidationNote('');
      setSuccess('Requerimientos consolidados y enviados a gestión de compras.');
      await loadPortal({ silent: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudieron consolidar los planners docentes.');
    } finally {
      setBusy(false);
    }
  };

  const onApproveResourceRequest = async (request) => {
    clearMessages();
    setBusy(true);
    try {
      await approveHrSupplyRequest(request.id, {
        items: (request.items || []).map((entry) => ({
          requestItemId: entry.id,
          itemId: entry.itemId,
          approvedQuantity: entry.quantity,
        })),
      });
      setSuccess('Requerimiento aprobado.');
      await loadPortal({ silent: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo aprobar el requerimiento.');
    } finally {
      setBusy(false);
    }
  };

  const onRejectResourceRequest = async (request) => {
    const rejectionReason = window.prompt('Motivo del rechazo');
    if (rejectionReason === null) return;

    clearMessages();
    setBusy(true);
    try {
      await rejectHrSupplyRequest(request.id, { rejectionReason });
      setSuccess('Requerimiento rechazado.');
      await loadPortal({ silent: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo rechazar el requerimiento.');
    } finally {
      setBusy(false);
    }
  };

  const onCreateUser = async (event) => {
    event.preventDefault();
    clearMessages();

    const createdUserPreview = {
      name: String(userForm.name || '').trim(),
      role: String(userForm.role || '').trim(),
      username: String(userForm.username || '').trim(),
    };

    if (userForm.role === 'coordination' && !userForm.coordinationScope) {
      setError('Debes definir el alcance de la coordinación.');
      return;
    }

    setBusy(true);
    try {
      await createAdminUser({
        title: userForm.title,
        name: userForm.name,
        username: userForm.username,
        phone: userForm.phone,
        password: userForm.password,
        role: userForm.role,
        coordinationScope: userForm.role === 'coordination' ? userForm.coordinationScope : undefined,
      });
      setCreatedUserModal({ open: true, ...createdUserPreview });
      setUserForm(createEmptyUserForm());
      await loadPortal({ silent: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo crear el usuario.');
    } finally {
      setBusy(false);
    }
  };

  const openEditUserModal = (targetUser) => {
    clearMessages();
    setEditUserModal({
      open: true,
      userId: String(targetUser?._id || ''),
      name: String(targetUser?.name || '').trim(),
      username: String(targetUser?.username || '').trim(),
      password: '',
      error: '',
    });
  };

  const closeEditUserModal = () => {
    if (busy) {
      return;
    }
    setEditUserModal(createEmptyEditUserModal());
  };

  const onSaveEditedUser = async (event) => {
    event.preventDefault();
    const userId = String(editUserModal.userId || '').trim();
    const name = String(editUserModal.name || '').trim();
    const username = String(editUserModal.username || '').trim().toLowerCase();
    const password = String(editUserModal.password || '');

    if (!userId) {
      setEditUserModal((previous) => ({ ...previous, error: 'No se encontró el usuario a editar.' }));
      return;
    }

    if (!name) {
      setEditUserModal((previous) => ({ ...previous, error: 'Escribe el nombre del integrante.' }));
      return;
    }

    if (!username) {
      setEditUserModal((previous) => ({ ...previous, error: 'Escribe el correo de acceso.' }));
      return;
    }

    if (password.trim() && password.trim().length < 6) {
      setEditUserModal((previous) => ({ ...previous, error: 'La nueva contraseña debe tener al menos 6 caracteres.' }));
      return;
    }

    setBusy(true);
    setEditUserModal((previous) => ({ ...previous, error: '' }));
    try {
      await updateAdminUser(userId, {
        name,
        username,
        ...(password.trim() ? { password: password.trim() } : {}),
      });
      setEditUserModal(createEmptyEditUserModal());
      setSuccess('Integrante actualizado correctamente.');
      await loadPortal({ silent: true });
    } catch (requestError) {
      setEditUserModal((previous) => ({
        ...previous,
        error: requestError?.response?.data?.message || 'No se pudo actualizar el integrante.',
      }));
    } finally {
      setBusy(false);
    }
  };

  const onToggleUserStatus = async (targetUser) => {
    clearMessages();
    setBusy(true);
    try {
      await updateAdminUser(targetUser._id, {
        status: targetUser.status === 'active' ? 'inactive' : 'active',
      });
      setSuccess('Estado del usuario actualizado.');
      await loadPortal({ silent: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo actualizar el usuario.');
    } finally {
      setBusy(false);
    }
  };

  const onDeleteUser = async (targetUser) => {
    clearMessages();
    setBusy(true);
    try {
      await deleteAdminUser(targetUser._id);
      setSuccess('Usuario retirado del portal.');
      await loadPortal({ silent: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo eliminar el usuario.');
    } finally {
      setBusy(false);
    }
  };

  const onTeamTeacherAssignmentChange = (field, value) => {
    if (field === 'teacherUserId') {
      const teacherUserId = String(value || '').trim();
      const existingAssignments = academicSubjectLoadTemplates.filter(
        (item) => String(item.teacherUserId || '').trim() === teacherUserId,
      );
      const subjectKeys = Array.from(new Set(existingAssignments.map((item) => String(item.subjectKey || '').trim()).filter(Boolean)));
      const gradeKeys = Array.from(new Set(existingAssignments.flatMap((item) => (
        Array.isArray(item.gradeKeys) ? item.gradeKeys : []
      )).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean)));

      setTeamTeacherAssignment({
        ...createEmptyTeamTeacherAssignment(),
        teacherUserId: value,
        subjectKeys,
        gradeKeys,
      });
      return;
    }

    setTeamTeacherAssignment((prev) => ({
      ...prev,
      [field]: field === 'weeklyHours' ? Math.max(0, Number(value || 0)) : value,
    }));
  };

  const onToggleTeamTeacherAssignmentGrade = (gradeKey) => {
    setTeamTeacherAssignment((prev) => ({
      ...prev,
      gradeKeys: prev.gradeKeys.includes(gradeKey)
        ? prev.gradeKeys.filter((item) => item !== gradeKey)
        : [...prev.gradeKeys, gradeKey],
    }));
  };

  const onToggleTeamTeacherAssignmentSubject = (subjectKey) => {
    setTeamTeacherAssignment((prev) => {
      const currentSubjectKeys = getTeamTeacherAssignmentSubjectKeys(prev);
      const normalizedSubjectKey = String(subjectKey || '').trim();
      if (!normalizedSubjectKey) {
        return prev;
      }

      return {
        ...prev,
        subjectKeys: currentSubjectKeys.includes(normalizedSubjectKey)
          ? currentSubjectKeys.filter((item) => item !== normalizedSubjectKey)
          : [...currentSubjectKeys, normalizedSubjectKey],
      };
    });
  };

  const onTeamCoordinatorSelectionChange = (levelKey, coordinatorId) => {
    setTeamCoordinatorSelections((prev) => ({
      ...prev,
      [levelKey]: coordinatorId,
    }));
  };

  const onHeadroomTeacherAssignmentChange = (field, value) => {
    setHeadroomTeacherAssignment((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'gradeKey' ? { courseKey: '' } : {}),
    }));
  };

  const onAssignCoordinatorLevel = async (levelKey) => {
    const coordinatorId = String(teamCoordinatorSelections[levelKey] || '').trim();
    if (!coordinatorId) {
      setError('Selecciona un coordinador antes de asignarlo al nivel educativo.');
      return;
    }

    clearMessages();
    setBusy(true);
    try {
      await updateAdminUser(coordinatorId, { coordinationScope: levelKey });
      setSuccess('Coordinador asignado al nivel educativo.');
      setTeamCoordinatorSelections((prev) => ({ ...prev, [levelKey]: '' }));
      await loadPortal({ silent: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo asignar el coordinador al nivel educativo.');
    } finally {
      setBusy(false);
    }
  };

  const onSaveTeamTeacherAssignment = async () => {
    const normalizedTeacherUserId = String(teamTeacherAssignment.teacherUserId || '').trim();
    const normalizedSubjectKeys = getTeamTeacherAssignmentSubjectKeys(teamTeacherAssignment);
    const normalizedGradeKeys = Array.from(new Set((teamTeacherAssignment.gradeKeys || []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean)));

    if (!normalizedTeacherUserId) {
      setError('Selecciona el docente que se va a vincular.');
      return;
    }

    if (normalizedSubjectKeys.length === 0) {
      setError('Selecciona al menos una asignatura.');
      return;
    }

    if (normalizedGradeKeys.length === 0) {
      setError('Selecciona al menos un grado para la vinculación docente.');
      return;
    }

    const assignmentsToSave = [];

    for (const normalizedSubjectKey of normalizedSubjectKeys) {
      const subject = academicStructureDraft.subjects.find((item) => String(item.key || '').trim() === normalizedSubjectKey);
      const gradeKeysForSubject = resolveSubjectAssignmentGradeKeys(subject, normalizedGradeKeys);

      if (gradeKeysForSubject.length === 0) {
        setError(`La asignatura ${subject?.label || normalizedSubjectKey} no tiene grados en común con tu selección. Revísala en el mapa de asignaturas.`);
        return;
      }

      const currentSubjectGradeKeys = Array.isArray(subject?.gradeKeys)
        ? subject.gradeKeys.map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean)
        : [];
      const nextSubjectGradeKeys = Array.from(new Set([...currentSubjectGradeKeys, ...gradeKeysForSubject]));

      if (nextSubjectGradeKeys.length !== currentSubjectGradeKeys.length) {
        const saved = await onSaveSubjectGradeKeys(normalizedSubjectKey, nextSubjectGradeKeys);
        if (!saved) {
          return;
        }
      }

      const existingAssignment = academicSubjectLoadTemplates.find((item) => (
        String(item.teacherUserId || '').trim() === normalizedTeacherUserId
        && String(item.subjectKey || '').trim() === normalizedSubjectKey
      ));

      assignmentsToSave.push({
        key: existingAssignment?.key || `subject_load_template_${normalizedSubjectKey}_${Date.now()}`,
        subjectKey: normalizedSubjectKey,
        teacherUserId: normalizedTeacherUserId,
        weeklyHours: Math.max(Number(existingAssignment?.weeklyHours || 0), 0),
        gradeKeys: Array.from(new Set([...(existingAssignment?.gradeKeys || []), ...gradeKeysForSubject])),
        order: Number(existingAssignment?.order || (academicSubjectLoadTemplates.length + assignmentsToSave.length + 1) * 10),
      });
    }

    const assignmentKeysToReplace = new Set(
      assignmentsToSave.map((assignment) => `${assignment.teacherUserId}::${assignment.subjectKey}`),
    );

    const nextTemplates = normalizeAcademicSubjectLoadTemplates([
      ...academicSubjectLoadTemplates.filter((item) => (
        !assignmentKeysToReplace.has(`${String(item.teacherUserId || '').trim()}::${String(item.subjectKey || '').trim()}`)
      )),
      ...assignmentsToSave,
    ]);

    const saved = await persistAcademicSubjectLoadTemplates(
      nextTemplates,
      normalizedSubjectKeys.length > 1
        ? `Vinculación guardada para ${normalizedSubjectKeys.length} asignaturas.`
        : 'Vinculación docente guardada.',
    );

    if (!saved) {
      return;
    }

    setTeamTeacherAssignment((prev) => ({
      ...createEmptyTeamTeacherAssignment(),
      teacherUserId: prev.teacherUserId,
      subjectKeys: normalizedSubjectKeys,
      gradeKeys: normalizedGradeKeys,
    }));
  };

  const onSaveHeadroomTeacherAssignment = async () => {
    const teacherUserId = String(headroomTeacherAssignment.teacherUserId || '').trim();
    const courseKey = String(headroomTeacherAssignment.courseKey || '').trim();

    if (!courseKey) {
      setError('Selecciona el curso donde se asignara el headroom teacher.');
      return;
    }

    if (!teacherUserId) {
      setError('Selecciona el docente headroom para este curso.');
      return;
    }

    clearMessages();
    setBusy(true);
    try {
      const response = await updateAcademicManagementCourseHeadroomTeacher(courseKey, { teacherUserId });
      const nextAcademicStructure = normalizeAcademicStructureDraftWithBootstrap(response.data?.academicStructure || {}, billingBootstrap);
      setAcademicStructureDraft(nextAcademicStructure);
      setSuccess('Headroom teacher asignado al curso.');
      setHeadroomTeacherAssignment(createEmptyHeadroomTeacherAssignment());
      await loadPortal({ silent: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo asignar el headroom teacher.');
    } finally {
      setBusy(false);
    }
  };

  const onClearHeadroomTeacherAssignment = async (courseKey) => {
    const normalizedCourseKey = String(courseKey || '').trim();
    if (!normalizedCourseKey) {
      return;
    }

    clearMessages();
    setBusy(true);
    try {
      const response = await updateAcademicManagementCourseHeadroomTeacher(normalizedCourseKey, { teacherUserId: '' });
      const nextAcademicStructure = normalizeAcademicStructureDraftWithBootstrap(response.data?.academicStructure || {}, billingBootstrap);
      setAcademicStructureDraft(nextAcademicStructure);
      setSuccess('Headroom teacher retirado del curso.');
      await loadPortal({ silent: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo retirar el headroom teacher.');
    } finally {
      setBusy(false);
    }
  };

  const onStudentDraftChange = (studentId, field, value) => {
    setStudentDrafts((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [field]: value,
      },
    }));
  };

  const syncAcademicStructureState = (structurePayload) => {
    const nextDraft = normalizeAcademicStructureDraftWithBootstrap(structurePayload || {}, billingBootstrap);
    setAcademicStructureDraft(nextDraft);
    setFeeSettingsDraft((prev) => normalizeFeeSettingsDraft(prev, nextDraft.grades));
    setBillingBootstrap((prev) => ({
      ...prev,
      grades: nextDraft.grades.map((grade) => grade.key),
      courses: nextDraft.grades.flatMap((grade) => grade.courses.map((course) => course.key)),
      academicStructure: structurePayload || prev.academicStructure,
    }));
  };

  const upsertGradeScheduleDraft = (gradeKey, updater, { courseKey = '' } = {}) => {
    const normalizedCourseKey = String(courseKey || '').trim();
    setAcademicStructureDraft((prev) => {
      const nextGradeSchedules = Array.isArray(prev.gradeSchedules) ? [...prev.gradeSchedules] : [];
      const existingIndex = nextGradeSchedules.findIndex((schedule) => schedule.gradeKey === gradeKey && String(schedule.courseKey || '') === normalizedCourseKey);
      const baseSchedule = existingIndex >= 0
        ? nextGradeSchedules[existingIndex]
        : {
          gradeKey,
          courseKey: normalizedCourseKey,
          subjectLoads: [],
          weeklySchedule: [],
          updatedAt: null,
        };
      const nextSchedule = { ...updater(baseSchedule), gradeKey, courseKey: normalizedCourseKey };
      if (existingIndex >= 0) {
        nextGradeSchedules[existingIndex] = nextSchedule;
      } else {
        nextGradeSchedules.push(nextSchedule);
      }

      return {
        ...prev,
        gradeSchedules: nextGradeSchedules,
      };
    });
  };

  const persistScheduleBreaks = async (nextBreaks, successMessage = 'Breaks actualizados.') => {
    clearMessages();
    setBusy(true);
    try {
      const response = await saveAcademicManagementScheduleBreaks({ breaks: nextBreaks });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setSuccess(successMessage);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudieron guardar los breaks del horario.');
    } finally {
      setBusy(false);
    }
  };

  const onScheduleGroupEditorChange = (field, value) => {
    setScheduleGroupEditor((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const onToggleScheduleGroupWeekday = (weekday) => {
    setScheduleGroupEditor((prev) => {
      const selectedWeekdays = new Set(prev.weekdays || []);
      if (selectedWeekdays.has(weekday)) {
        selectedWeekdays.delete(weekday);
      } else {
        selectedWeekdays.add(weekday);
      }

      return {
        ...prev,
        weekdays: Array.from(selectedWeekdays).sort((left, right) => left - right),
      };
    });
  };

  const onToggleScheduleGroupGrade = (gradeKey) => {
    setScheduleGroupEditor((prev) => {
      const selectedGradeKeys = new Set(prev.gradeKeys || []);
      if (selectedGradeKeys.has(gradeKey)) {
        selectedGradeKeys.delete(gradeKey);
      } else {
        selectedGradeKeys.add(gradeKey);
      }

      return {
        ...prev,
        gradeKeys: Array.from(selectedGradeKeys),
      };
    });
  };

  const onCreateNewScheduleGroup = () => {
    setSelectedScheduleGroupKey(NEW_SCHEDULE_GROUP_KEY);
    setScheduleGroupEditor({ ...createDefaultAcademicScheduleGroupSettings(academicScheduleGroups.length), dayEndTime: '15:00' });
  };

  const onEditScheduleGroup = (groupKey) => {
    const group = academicScheduleGroups.find((item) => item.key === groupKey);
    if (!group) {
      return;
    }

    setSelectedScheduleGroupKey(group.key);
    setScheduleGroupEditor({
      key: group.key,
      name: group.name || '',
      weekdays: [...(group.weekdays || [])],
      gradeKeys: [...(group.gradeKeys || [])],
      dayStartTime: group.dayStartTime,
      dayEndTime: getAcademicScheduleGroupEndTime(group),
      blocks: (group.blocks || []).map((block) => ({ ...block })),
      order: group.order,
    });
  };

  const onDeleteScheduleGroup = async (groupKey) => {
    const currentSettings = normalizeAcademicScheduleSettings(academicStructureDraft.scheduleSettings);
    const nextSettings = {
      groups: sanitizeAcademicScheduleGroups(currentSettings.groups).filter((group) => group.key !== groupKey),
    };

    clearMessages();
    setBusy(true);
    try {
      const response = await saveAcademicManagementScheduleSettings(normalizeAcademicScheduleSettings(nextSettings));
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setSuccess('Jornada compartida eliminada.');
      setSelectedScheduleGroupKey(NEW_SCHEDULE_GROUP_KEY);
      setScheduleGroupEditor({ ...createDefaultAcademicScheduleGroupSettings(0), dayEndTime: '15:00' });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo eliminar la jornada compartida.');
    } finally {
      setBusy(false);
    }
  };

  const onSaveAcademicScheduleSettings = async () => {
    const normalizedName = String(scheduleGroupEditor.name || '').trim();
    const normalizedStartTime = String(scheduleGroupEditor.dayStartTime || '07:00').trim() || '07:00';
    const normalizedEndTime = String(scheduleGroupEditor.dayEndTime || '').trim();
    const generatedBlocks = buildAcademicScheduleBlocksFromRange(normalizedStartTime, normalizedEndTime);
    const normalizedEditor = {
      ...scheduleGroupEditor,
      name: normalizedName || `Jornada ${academicScheduleGroups.length + (selectedScheduleGroupKey === NEW_SCHEDULE_GROUP_KEY ? 1 : 0)}`,
      weekdays: Array.from(new Set((scheduleGroupEditor.weekdays || []).map(Number))).sort((left, right) => left - right),
      gradeKeys: Array.from(new Set((scheduleGroupEditor.gradeKeys || []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean))),
      dayStartTime: normalizedStartTime,
      blocks: generatedBlocks,
      order: Number(scheduleGroupEditor.order || ((academicScheduleGroups.length || 0) + 1) * 10),
    };

    if (!normalizedEndTime) {
      setError('Define la hora de fin de la jornada.');
      return;
    }

    if (generatedBlocks.length === 0) {
      setError('La jornada debe tener una hora de fin posterior al inicio y usar intervalos válidos de 15 minutos.');
      return;
    }

    if (normalizedEditor.weekdays.length === 0) {
      setError('Selecciona al menos un día para la jornada.');
      return;
    }

    if (normalizedEditor.gradeKeys.length === 0) {
      setError('Selecciona al menos un grado para compartir esta jornada.');
      return;
    }

    clearMessages();
    setBusy(true);
    try {
      const currentSettings = normalizeAcademicScheduleSettings(academicStructureDraft.scheduleSettings);
      const currentGroupKey = selectedScheduleGroupKey === NEW_SCHEDULE_GROUP_KEY ? '' : selectedScheduleGroupKey;
      const nextGroupKey = currentGroupKey || normalizedEditor.key || `schedule_group_${Date.now()}`;
      const groupsWithoutCurrent = sanitizeAcademicScheduleGroups(currentSettings.groups).filter((group) => group.key !== currentGroupKey);
      const nextSettings = normalizeAcademicScheduleSettings({
        groups: [...groupsWithoutCurrent, {
          ...normalizedEditor,
          key: nextGroupKey,
        }],
      });
      const response = await saveAcademicManagementScheduleSettings(nextSettings);
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setSelectedScheduleGroupKey(nextGroupKey);
      setSuccess('Jornada compartida guardada. Los horarios y breaks se actualizaron con la nueva configuración.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar la jornada compartida.');
    } finally {
      setBusy(false);
    }
  };

  const onSubjectLoadTemplateEditorChange = (field, value) => {
    setSubjectLoadTemplateEditor((prev) => ({
      ...prev,
      [field]: field === 'weeklyHours' ? (value === '' ? '' : Math.max(0, Number(value))) : value,
    }));
  };

  const onToggleSubjectLoadTemplateGrade = (gradeKey) => {
    setSubjectLoadTemplateEditor((prev) => {
      const selectedGradeKeys = new Set(prev.gradeKeys || []);
      if (selectedGradeKeys.has(gradeKey)) {
        selectedGradeKeys.delete(gradeKey);
      } else {
        selectedGradeKeys.add(gradeKey);
      }

      return {
        ...prev,
        gradeKeys: Array.from(selectedGradeKeys),
      };
    });
  };

  const onCreateNewSubjectLoadTemplate = () => {
    setSelectedSubjectLoadTemplateKey(NEW_SUBJECT_LOAD_TEMPLATE_KEY);
    setSubjectLoadTemplateEditor(createDefaultAcademicSubjectLoadTemplate(academicSubjectLoadTemplates.length));
  };

  const onEditSubjectLoadTemplate = (templateKey) => {
    const template = academicSubjectLoadTemplates.find((item) => item.key === templateKey);
    if (!template) {
      return;
    }

    setSelectedSubjectLoadTemplateKey(template.key);
    setSubjectLoadTemplateEditor({
      key: template.key,
      subjectKey: template.subjectKey,
      teacherUserId: template.teacherUserId || '',
      weeklyHours: template.weeklyHours,
      gradeKeys: [...(template.gradeKeys || [])],
      order: template.order,
    });
  };

  const persistAcademicSubjectLoadTemplates = async (nextTemplates, successMessage) => {
    clearMessages();
    setBusy(true);
    try {
      const response = await saveAcademicManagementSubjectLoadTemplates({ subjectLoadTemplates: nextTemplates });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setSuccess(successMessage);
      return true;
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar la carga académica compartida.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onDeleteSubjectLoadTemplate = async (templateKey) => {
    const nextTemplates = academicSubjectLoadTemplates.filter((item) => item.key !== templateKey);
    await persistAcademicSubjectLoadTemplates(nextTemplates, 'Carga académica compartida eliminada.');
    setSelectedSubjectLoadTemplateKey(NEW_SUBJECT_LOAD_TEMPLATE_KEY);
    setSubjectLoadTemplateEditor(createDefaultAcademicSubjectLoadTemplate(0));
  };

  const onSaveAcademicSubjectLoadTemplates = async () => {
    const normalizedEditor = {
      ...subjectLoadTemplateEditor,
      subjectKey: String(subjectLoadTemplateEditor.subjectKey || '').trim(),
      teacherUserId: String(subjectLoadTemplateEditor.teacherUserId || '').trim(),
      weeklyHours: Math.max(0, Math.min(40, Number(subjectLoadTemplateEditor.weeklyHours || 0))),
      gradeKeys: Array.from(new Set((subjectLoadTemplateEditor.gradeKeys || []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean))),
      order: Number(subjectLoadTemplateEditor.order || ((academicSubjectLoadTemplates.length || 0) + 1) * 10),
    };

    if (!normalizedEditor.subjectKey) {
      setError('Selecciona una asignatura para la carga académica compartida.');
      return;
    }

    if (normalizedEditor.gradeKeys.length === 0) {
      setError('Selecciona al menos un grado para la carga académica compartida.');
      return;
    }

    const currentTemplateKey = selectedSubjectLoadTemplateKey === NEW_SUBJECT_LOAD_TEMPLATE_KEY ? '' : selectedSubjectLoadTemplateKey;
    const nextTemplateKey = currentTemplateKey || normalizedEditor.key || `subject_load_template_${Date.now()}`;
    const nextTemplates = normalizeAcademicSubjectLoadTemplates([
      ...academicSubjectLoadTemplates.filter((item) => item.key !== currentTemplateKey),
      { ...normalizedEditor, key: nextTemplateKey },
    ]);
    await persistAcademicSubjectLoadTemplates(nextTemplates, 'Carga académica compartida guardada.');
    setSelectedSubjectLoadTemplateKey(nextTemplateKey);
  };

  const onTeachingAvailabilityEditorChange = (field, value) => {
    setTeachingAvailabilityEditor((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const onToggleTeachingAvailabilityGrade = (gradeKey) => {
    setTeachingAvailabilityEditor((prev) => {
      const selectedGradeKeys = new Set(prev.gradeKeys || []);
      if (selectedGradeKeys.has(gradeKey)) {
        selectedGradeKeys.delete(gradeKey);
      } else {
        selectedGradeKeys.add(gradeKey);
      }

      return {
        ...prev,
        gradeKeys: Array.from(selectedGradeKeys),
      };
    });
  };

  const onToggleTeachingAvailabilityWeekday = (weekdayValue) => {
    setTeachingAvailabilityEditor((prev) => {
      const currentWindows = Array.isArray(prev.windows) ? prev.windows : [];
      const hasWeekday = currentWindows.some((windowItem) => windowItem.weekday === weekdayValue);
      return {
        ...prev,
        windows: hasWeekday
          ? currentWindows.filter((windowItem) => windowItem.weekday !== weekdayValue)
          : [...currentWindows, { weekday: weekdayValue, startTime: '07:00', endTime: '12:00' }].sort((left, right) => left.weekday - right.weekday),
      };
    });
  };

  const onTeachingAvailabilityWindowChange = (weekdayValue, field, value) => {
    setTeachingAvailabilityEditor((prev) => ({
      ...prev,
      windows: (prev.windows || []).map((windowItem) => (
        windowItem.weekday === weekdayValue
          ? { ...windowItem, [field]: value }
          : windowItem
      )),
    }));
  };

  const onCreateNewTeachingAvailability = () => {
    setSelectedTeachingAvailabilityKey(NEW_TEACHING_AVAILABILITY_KEY);
    setTeachingAvailabilityEditor(createDefaultAcademicTeachingAvailability(academicTeachingAvailability.length));
  };

  const onEditTeachingAvailability = (availabilityKey) => {
    const availabilityRule = academicTeachingAvailability.find((item) => item.key === availabilityKey);
    if (!availabilityRule) {
      return;
    }

    setSelectedTeachingAvailabilityKey(availabilityRule.key);
    setTeachingAvailabilityEditor({
      key: availabilityRule.key,
      subjectKey: availabilityRule.subjectKey,
      teacherUserId: availabilityRule.teacherUserId || '',
      gradeKeys: [...(availabilityRule.gradeKeys || [])],
      windows: (availabilityRule.windows || []).map((windowItem) => ({ ...windowItem })),
      order: availabilityRule.order,
    });
  };

  const persistAcademicTeachingAvailability = async (nextTeachingAvailability, successMessage) => {
    clearMessages();
    setBusy(true);
    try {
      const response = await saveAcademicManagementTeachingAvailability({ teachingAvailability: nextTeachingAvailability });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setSuccess(successMessage);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar la disponibilidad de docencia.');
    } finally {
      setBusy(false);
    }
  };

  const onDeleteTeachingAvailability = async (availabilityKey) => {
    const nextTeachingAvailability = academicTeachingAvailability.filter((item) => item.key !== availabilityKey);
    await persistAcademicTeachingAvailability(nextTeachingAvailability, 'Disponibilidad docente eliminada.');
    setSelectedTeachingAvailabilityKey(NEW_TEACHING_AVAILABILITY_KEY);
    setTeachingAvailabilityEditor(createDefaultAcademicTeachingAvailability(0));
  };

  const onSaveAcademicTeachingAvailability = async () => {
    const normalizedWindows = (teachingAvailabilityEditor.windows || [])
      .map((windowItem) => ({
        weekday: Number(windowItem.weekday || 0),
        startTime: String(windowItem.startTime || '07:00').trim() || '07:00',
        endTime: String(windowItem.endTime || '12:00').trim() || '12:00',
      }))
      .filter((windowItem) => ACADEMIC_SCHEDULE_WEEKDAYS.some((weekday) => weekday.value === windowItem.weekday));
    const normalizedEditor = {
      ...teachingAvailabilityEditor,
      subjectKey: String(teachingAvailabilityEditor.subjectKey || '').trim(),
      teacherUserId: String(teachingAvailabilityEditor.teacherUserId || '').trim(),
      gradeKeys: Array.from(new Set((teachingAvailabilityEditor.gradeKeys || []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean))),
      windows: normalizedWindows,
      order: Number(teachingAvailabilityEditor.order || ((academicTeachingAvailability.length || 0) + 1) * 10),
    };

    if (!normalizedEditor.subjectKey) {
      setError('Selecciona una asignatura para la disponibilidad docente.');
      return;
    }

    if (!normalizedEditor.teacherUserId) {
      setError('Selecciona un docente para la disponibilidad.');
      return;
    }

    if (normalizedEditor.gradeKeys.length === 0) {
      setError('Selecciona al menos un grado para la disponibilidad docente.');
      return;
    }

    if (normalizedEditor.windows.length === 0) {
      setError('Selecciona al menos un día con su horario disponible.');
      return;
    }

    const currentAvailabilityKey = selectedTeachingAvailabilityKey === NEW_TEACHING_AVAILABILITY_KEY ? '' : selectedTeachingAvailabilityKey;
    const nextAvailabilityKey = currentAvailabilityKey || normalizedEditor.key || `teaching_availability_${Date.now()}`;
    const nextTeachingAvailability = normalizeAcademicTeachingAvailability([
      ...academicTeachingAvailability.filter((item) => item.key !== currentAvailabilityKey),
      { ...normalizedEditor, key: nextAvailabilityKey },
    ]);
    await persistAcademicTeachingAvailability(nextTeachingAvailability, 'Disponibilidad docente guardada.');
    setSelectedTeachingAvailabilityKey(nextAvailabilityKey);
  };

  const onToggleNewScheduleBreakGrade = (gradeKey) => {
    setNewScheduleBreakGradeKeys((prev) => (
      prev.includes(gradeKey)
        ? prev.filter((item) => item !== gradeKey)
        : [...prev, gradeKey]
    ));
  };

  const onToggleNewScheduleBreakWeekday = (weekdayValue) => {
    setNewScheduleBreakWeekdays((prev) => (
      prev.includes(weekdayValue)
        ? prev.filter((item) => item !== weekdayValue)
        : [...prev, weekdayValue].sort((left, right) => left - right)
    ));
  };

  const onCreateScheduleBreak = async (event) => {
    event.preventDefault();

    if (newScheduleBreakWeekdays.length === 0) {
      setError('Selecciona al menos un día para el break.');
      return;
    }

    const breakStartTime24 = normalizeText(newScheduleBreakStartTime);
    const breakEndTime24 = normalizeText(newScheduleBreakEndTime);
    if (!isValidAcademicScheduleTime(breakStartTime24) || !isValidAcademicScheduleTime(breakEndTime24)) {
      setError('Escribe una hora válida de inicio y fin para el break.');
      return;
    }

    const breakStartMinutes = academicScheduleTimeToMinutes(breakStartTime24);
    const breakEndMinutes = academicScheduleTimeToMinutes(breakEndTime24);
    if (breakStartMinutes === null || breakEndMinutes === null || breakEndMinutes <= breakStartMinutes) {
      setError('La hora de fin del break debe ser posterior a la hora de inicio.');
      return;
    }

    const slot = newScheduleBreakAvailableBlocks.find((item) => {
      const slotStartMinutes = academicScheduleTimeToMinutes(item.startTime);
      const slotEndMinutes = academicScheduleTimeToMinutes(item.endTime);
      return slotStartMinutes !== null
        && slotEndMinutes !== null
        && breakStartMinutes >= slotStartMinutes
        && breakEndMinutes <= slotEndMinutes;
    });
    if (!slot) {
      const availableRanges = newScheduleBreakAvailableBlocks
        .map((item) => item.label || `${item.startTime} - ${item.endTime}`)
        .join(', ');
      setError(
        availableRanges
          ? `El break debe quedar dentro de una franja válida de la jornada configurada. 12:00 PM es mediodía; el problema no es AM/PM. Franjas disponibles: ${availableRanges}.`
          : 'El break debe quedar dentro de una franja válida de la jornada configurada. 12:00 PM es mediodía; el problema no es AM/PM.'
      );
      return;
    }

    if (newScheduleBreakGradeKeys.length === 0) {
      setError('Selecciona al menos un grado para el break.');
      return;
    }

    const baseLabel = normalizeText(newScheduleBreakLabel) || `Break ${academicStructureDraft.scheduleBreaks.length + 1}`;
    const nextBreaks = [
      ...academicStructureDraft.scheduleBreaks,
      ...newScheduleBreakWeekdays.map((weekdayValue, index) => ({
        key: `break_${Number(weekdayValue)}_${breakStartTime24.replace(':', '')}_${breakEndTime24.replace(':', '')}_${Date.now()}_${index}`,
        label: baseLabel,
        weekday: Number(weekdayValue),
        startTime: breakStartTime24,
        endTime: breakEndTime24,
        gradeKeys: [...newScheduleBreakGradeKeys],
        order: (academicStructureDraft.scheduleBreaks.length + index + 1) * 10,
      })),
    ];

    await persistScheduleBreaks(nextBreaks, newScheduleBreakWeekdays.length > 1 ? 'Breaks creados y aplicados a los días seleccionados.' : 'Break creado y aplicado a los horarios seleccionados.');
    setNewScheduleBreakLabel('');
    setNewScheduleBreakGradeKeys([]);
    setNewScheduleBreakWeekdays([1]);
    setNewScheduleBreakStartTime('09:00');
    setNewScheduleBreakEndTime('10:00');
  };

  const onDeleteScheduleBreak = async (breakKey) => {
    const nextBreaks = academicStructureDraft.scheduleBreaks.filter((item) => item.key !== breakKey);
    await persistScheduleBreaks(nextBreaks, 'Break eliminado del horario académico.');
  };

  const onScheduleBreakGradeSelectionChange = (breakKey, gradeKey) => {
    setScheduleBreakGradeSelections((prev) => ({
      ...prev,
      [breakKey]: gradeKey,
    }));
  };

  const onAddGradeToScheduleBreak = async (breakKey) => {
    const gradeKey = String(scheduleBreakGradeSelections[breakKey] || '').trim();
    if (!gradeKey) {
      setError('Selecciona un grado para agregarlo al break.');
      return;
    }

    const nextBreaks = academicStructureDraft.scheduleBreaks.map((item) => (
      item.key === breakKey
        ? { ...item, gradeKeys: Array.from(new Set([...(item.gradeKeys || []), gradeKey])) }
        : item
    ));

    await persistScheduleBreaks(nextBreaks, `${getGradeLabel(gradeKey)} agregado al break.`);
    setScheduleBreakGradeSelections((prev) => ({ ...prev, [breakKey]: '' }));
  };

  const onRemoveGradeFromScheduleBreak = async (breakKey, gradeKey) => {
    const nextBreaks = academicStructureDraft.scheduleBreaks
      .map((item) => (
        item.key === breakKey
          ? { ...item, gradeKeys: (item.gradeKeys || []).filter((currentGradeKey) => currentGradeKey !== gradeKey) }
          : item
      ))
      .filter((item) => Array.isArray(item.gradeKeys) && item.gradeKeys.length > 0);

    await persistScheduleBreaks(nextBreaks, `${getGradeLabel(gradeKey)} retirado del break.`);
  };

  const getTeacherOptionsForSubject = (subject) => {
    const subjectMatchers = new Set([
      normalizeAcademicScheduleMatch(subject?.label),
      normalizeAcademicScheduleMatch(subject?.key),
    ].filter(Boolean));

    return teacherUsers.filter((teacher) => {
      if (!Array.isArray(teacher.assignedSubjects) || teacher.assignedSubjects.length === 0) {
        return true;
      }

      return teacher.assignedSubjects.some((assignedSubject) => subjectMatchers.has(normalizeAcademicScheduleMatch(assignedSubject)));
    });
  };

  const onScheduleLoadChange = (gradeKey, subjectKey, field, value) => {
    const subjectsForGrade = subjectsByGrade[gradeKey] || [];
    upsertGradeScheduleDraft(gradeKey, (currentSchedule) => {
      const subjectLoadMap = new Map((Array.isArray(currentSchedule.subjectLoads) ? currentSchedule.subjectLoads : []).map((load) => [load.subjectKey, load]));
      const nextSubjectLoads = subjectsForGrade.map((subject, index) => {
        const currentLoad = subjectLoadMap.get(subject.key) || { subjectKey: subject.key, weeklyHours: 0, teacherUserId: '', order: (index + 1) * 10 };
        return {
          ...currentLoad,
          [field]: field === 'weeklyHours' ? Math.max(0, Number(value || 0)) : value,
          order: (index + 1) * 10,
        };
      });

      const nextLoadMap = new Map(nextSubjectLoads.map((load) => [load.subjectKey, load]));
      const nextWeeklySchedule = (Array.isArray(currentSchedule.weeklySchedule) && currentSchedule.weeklySchedule.length > 0
        ? currentSchedule.weeklySchedule
        : createDefaultAcademicScheduleTemplate(academicStructureDraft.scheduleSettings, { gradeKey }))
        .map((entry) => {
          if (entry.entryType === 'break') {
            return { ...entry, subjectKey: '', teacherUserId: '' };
          }

          const selectedLoad = nextLoadMap.get(entry.subjectKey);
          if (!entry.subjectKey || !selectedLoad) {
            return { ...entry, teacherUserId: '' };
          }

          return {
            ...entry,
            teacherUserId: String(selectedLoad.teacherUserId || '').trim(),
          };
        });

      return {
        ...currentSchedule,
        gradeKey,
        subjectLoads: nextSubjectLoads,
        weeklySchedule: nextWeeklySchedule,
      };
    }, { courseKey: selectedScheduleCourseKey });
  };

  const buildScheduleEntryForSlot = (slotKey, payload = {}) => {
    const slotTemplate = selectedScheduleConfiguredSlotByKey[slotKey];
    if (!slotTemplate) return null;
    const startMinutes = academicScheduleTimeToMinutes(payload.startTime || slotTemplate.startTime) ?? academicScheduleTimeToMinutes(slotTemplate.startTime);
    const requestedEndMinutes = academicScheduleTimeToMinutes(payload.endTime || '') ?? (startMinutes + 15);
    const endMinutes = Math.max(startMinutes + 15, requestedEndMinutes);
    const subjectKey = String(payload.subjectKey || '').trim();
    const block = payload.entryType === 'break' ? scheduleBlockByKey[String(payload.breakKey || '').trim()] : null;

    return {
      key: slotKey,
      weekday: Number(slotTemplate.weekday || 0),
      block: Number(slotTemplate.block || 0),
      startTime: academicScheduleMinutesToTime(startMinutes),
      endTime: academicScheduleMinutesToTime(endMinutes),
      entryType: payload.entryType === 'break' ? 'break' : 'class',
      subjectKey: payload.entryType === 'break' ? '' : subjectKey,
      teacherUserId: payload.entryType === 'break' ? '' : String(payload.teacherUserId || '').trim(),
      breakKey: payload.entryType === 'break' ? (block?.key || 'break') : '',
      breakLabel: payload.entryType === 'break' ? (block?.label || 'Break') : '',
    };
  };

  const upsertScheduleEntry = (gradeKey, nextEntry) => {
    if (!gradeKey || !nextEntry?.key) return;
    upsertGradeScheduleDraft(gradeKey, (currentSchedule) => {
      const loadMap = new Map((Array.isArray(currentSchedule.subjectLoads) ? currentSchedule.subjectLoads : []).map((load) => [load.subjectKey, load]));
      const currentWeeklySchedule = Array.isArray(currentSchedule.weeklySchedule) ? currentSchedule.weeklySchedule : [];
      const withTeacher = nextEntry.entryType === 'break'
        ? { ...nextEntry, subjectKey: '', teacherUserId: '', breakLabel: nextEntry.breakLabel || 'Break' }
        : { ...nextEntry, teacherUserId: String(nextEntry.teacherUserId || loadMap.get(nextEntry.subjectKey)?.teacherUserId || selectedScheduleTeacherBySubjectKey[nextEntry.subjectKey] || '').trim(), breakKey: '', breakLabel: '' };
      const nextWeeklySchedule = [
        ...currentWeeklySchedule.filter((entry) => String(entry.key) !== String(nextEntry.key)),
        withTeacher,
      ].sort((left, right) => Number(left.weekday || 0) - Number(right.weekday || 0) || Number(left.block || 0) - Number(right.block || 0));

      return {
        ...currentSchedule,
        gradeKey,
        weeklySchedule: nextWeeklySchedule,
      };
    }, { courseKey: selectedScheduleCourseKey });
  };

  const moveScheduleEntryToSlot = (gradeKey, entryKey, targetSlotKey) => {
    const currentEntry = selectedScheduleEntryByKey[entryKey];
    const targetSlot = selectedScheduleConfiguredSlotByKey[targetSlotKey];
    if (!currentEntry || !targetSlot) return;

    const currentStart = academicScheduleTimeToMinutes(currentEntry.startTime) ?? 0;
    const currentEnd = academicScheduleTimeToMinutes(currentEntry.endTime) ?? (currentStart + 15);
    const duration = Math.max(15, currentEnd - currentStart);
    const targetStart = academicScheduleTimeToMinutes(targetSlot.startTime) ?? currentStart;
    const nextEntry = {
      ...currentEntry,
      key: targetSlotKey,
      weekday: Number(targetSlot.weekday || 0),
      block: Number(targetSlot.block || 0),
      startTime: academicScheduleMinutesToTime(targetStart),
      endTime: academicScheduleMinutesToTime(targetStart + duration),
    };

    upsertGradeScheduleDraft(gradeKey, (currentSchedule) => ({
      ...currentSchedule,
      gradeKey,
      weeklySchedule: [
        ...(Array.isArray(currentSchedule.weeklySchedule) ? currentSchedule.weeklySchedule : []).filter((entry) => String(entry.key) !== String(entryKey) && String(entry.key) !== String(targetSlotKey)),
        nextEntry,
      ].sort((left, right) => Number(left.weekday || 0) - Number(right.weekday || 0) || Number(left.block || 0) - Number(right.block || 0)),
    }), { courseKey: selectedScheduleCourseKey });
    setSelectedScheduleSlotKey(targetSlotKey);
  };

  const openScheduleSlotModal = (slotKey, existingEntry = null, overrides = {}) => {
    const slotTemplate = selectedScheduleConfiguredSlotByKey[slotKey];
    if (!slotTemplate && !existingEntry) return;
    const subjectKey = overrides.subjectKey || existingEntry?.subjectKey || selectedScheduleSubjects[0]?.key || '';
    setScheduleSlotModal({
      open: true,
      mode: existingEntry ? 'edit' : 'create',
      slotKey,
      weekday: Number(existingEntry?.weekday || slotTemplate?.weekday || 0),
      block: Number(existingEntry?.block || slotTemplate?.block || 0),
      startTime: overrides.startTime || existingEntry?.startTime || slotTemplate?.startTime || '',
      endTime: overrides.endTime || existingEntry?.endTime || (slotTemplate ? slotTemplate.endTime : ''),
      entryType: overrides.entryType || (existingEntry?.entryType === 'break' ? 'break' : 'class'),
      subjectKey,
      teacherUserId: overrides.teacherUserId || existingEntry?.teacherUserId || selectedScheduleTeacherBySubjectKey[subjectKey] || '',
      breakKey: overrides.breakKey || existingEntry?.breakKey || 'break',
    });
  };

  const onSaveScheduleSlotModal = (event) => {
    event.preventDefault();
    const teacherCandidates = selectedScheduleTeacherOptionsBySubjectKey[scheduleSlotModal.subjectKey] || [];
    if (scheduleSlotModal.entryType !== 'break' && teacherCandidates.length > 1 && !scheduleSlotModal.teacherUserId) {
      setError('Selecciona el docente que dictará esta materia en el bloque.');
      return;
    }
    const nextEntry = buildScheduleEntryForSlot(scheduleSlotModal.slotKey, scheduleSlotModal);
    if (!nextEntry) return;
    upsertScheduleEntry(selectedScheduleGradeKey, nextEntry);
    setScheduleSlotModal((previous) => ({ ...previous, open: false }));
    setSelectedScheduleSlotKey(nextEntry.key);
  };

  const onScheduleResizePointerDown = (event, entryKey, edge) => {
    const currentEntry = selectedScheduleEntryByKey[entryKey];
    if (!currentEntry) return;
    event.preventDefault();
    event.stopPropagation();

    const startPointerY = event.clientY;
    const originalStart = academicScheduleTimeToMinutes(currentEntry.startTime) ?? 0;
    const originalEnd = academicScheduleTimeToMinutes(currentEntry.endTime) ?? (originalStart + 15);
    let lastDeltaSlots = 0;

    const onPointerMove = (moveEvent) => {
      moveEvent.preventDefault();
      const deltaSlots = Math.round((moveEvent.clientY - startPointerY) / selectedScheduleBoardRowHeight);
      if (deltaSlots === lastDeltaSlots) return;
      lastDeltaSlots = deltaSlots;
      const deltaMinutes = deltaSlots * 15;
      const nextStart = edge === 'top'
        ? Math.min(originalEnd - 15, Math.max(0, originalStart + deltaMinutes))
        : originalStart;
      const nextEnd = edge === 'bottom'
        ? Math.max(originalStart + 15, Math.min(24 * 60, originalEnd + deltaMinutes))
        : originalEnd;
      upsertScheduleEntry(selectedScheduleGradeKey, {
        ...currentEntry,
        startTime: academicScheduleMinutesToTime(nextStart),
        endTime: academicScheduleMinutesToTime(nextEnd),
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  };

  const onScheduleSlotSubjectChange = (gradeKey, slotKey, subjectKey) => {
    const normalizedSubjectKey = String(subjectKey || '').trim();
    upsertGradeScheduleDraft(gradeKey, (currentSchedule) => {
      const loadMap = new Map((Array.isArray(currentSchedule.subjectLoads) ? currentSchedule.subjectLoads : []).map((load) => [load.subjectKey, load]));
      const currentWeeklySchedule = Array.isArray(currentSchedule.weeklySchedule) ? currentSchedule.weeklySchedule : [];
      const existingEntry = currentWeeklySchedule.find((entry) => String(entry.key) === String(slotKey));
      const slotTemplate = selectedScheduleConfiguredBlocks.find((slot) => String(normalizeAcademicScheduleSlotKey(slot.weekday, slot.block)) === String(slotKey));

      if (!normalizedSubjectKey) {
        return {
          ...currentSchedule,
          gradeKey,
          weeklySchedule: currentWeeklySchedule.filter((entry) => String(entry.key) !== String(slotKey) || entry.entryType === 'break'),
        };
      }

      if (!existingEntry && !slotTemplate) {
        return currentSchedule;
      }

      const scheduleWithTarget = existingEntry ? currentWeeklySchedule : [...currentWeeklySchedule, {
        key: slotKey,
        weekday: Number(slotTemplate.weekday || 0),
        block: Number(slotTemplate.block || 0),
        startTime: slotTemplate.startTime,
        endTime: slotTemplate.endTime,
        entryType: 'class',
        subjectKey: '',
        teacherUserId: '',
      }];

      const nextWeeklySchedule = scheduleWithTarget
        .map((entry) => {
          if (String(entry.key) !== String(slotKey)) {
            return entry;
          }

          const nextLoad = loadMap.get(normalizedSubjectKey);
          return {
            ...entry,
            entryType: 'class',
            subjectKey: normalizedSubjectKey,
            teacherUserId: normalizedSubjectKey ? String(nextLoad?.teacherUserId || selectedScheduleTeacherBySubjectKey[normalizedSubjectKey] || '').trim() : '',
            breakKey: '',
            breakLabel: '',
          };
        })
        .sort((left, right) => Number(left.weekday || 0) - Number(right.weekday || 0) || Number(left.block || 0) - Number(right.block || 0));

      return {
        ...currentSchedule,
        gradeKey,
        weeklySchedule: nextWeeklySchedule,
      };
    }, { courseKey: selectedScheduleCourseKey });
  };

  const onScheduleSlotBlockChange = (gradeKey, slotKey, blockKey) => {
    const block = scheduleBlockByKey[String(blockKey || '').trim()];
    if (!block) {
      return;
    }

    upsertGradeScheduleDraft(gradeKey, (currentSchedule) => {
      const currentWeeklySchedule = Array.isArray(currentSchedule.weeklySchedule) ? currentSchedule.weeklySchedule : [];
      const existingEntry = currentWeeklySchedule.find((entry) => String(entry.key) === String(slotKey));
      const slotTemplate = selectedScheduleConfiguredBlocks.find((slot) => String(normalizeAcademicScheduleSlotKey(slot.weekday, slot.block)) === String(slotKey));

      if (!existingEntry && !slotTemplate) {
        return currentSchedule;
      }

      const scheduleWithTarget = existingEntry ? currentWeeklySchedule : [...currentWeeklySchedule, {
        key: slotKey,
        weekday: Number(slotTemplate.weekday || 0),
        block: Number(slotTemplate.block || 0),
        startTime: slotTemplate.startTime,
        endTime: slotTemplate.endTime,
        entryType: 'break',
        subjectKey: '',
        teacherUserId: '',
      }];

      const nextWeeklySchedule = scheduleWithTarget
        .map((entry) => {
          if (String(entry.key) !== String(slotKey)) {
            return entry;
          }

          return {
            ...entry,
            entryType: 'break',
            subjectKey: '',
            teacherUserId: '',
            breakKey: block.key,
            breakLabel: block.label,
          };
        })
        .sort((left, right) => Number(left.weekday || 0) - Number(right.weekday || 0) || Number(left.block || 0) - Number(right.block || 0));

      return {
        ...currentSchedule,
        gradeKey,
        weeklySchedule: nextWeeklySchedule,
      };
    }, { courseKey: selectedScheduleCourseKey });
  };

  const onRemoveScheduleSlot = (gradeKey, slotKey) => {
    upsertGradeScheduleDraft(gradeKey, (currentSchedule) => ({
      ...currentSchedule,
      gradeKey,
      weeklySchedule: (Array.isArray(currentSchedule.weeklySchedule) ? currentSchedule.weeklySchedule : [])
        .filter((entry) => String(entry.key) !== String(slotKey)),
    }), { courseKey: selectedScheduleCourseKey });
  };

  const onScheduleSubjectDragStart = (event, subjectKey) => {
    const normalizedSubjectKey = String(subjectKey || '').trim();
    if (!normalizedSubjectKey) return;

    setDraggedScheduleSubjectKey(normalizedSubjectKey);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(ACADEMIC_SCHEDULE_SUBJECT_DRAG_MIME, normalizedSubjectKey);
  };

  const onScheduleSubjectDragEnd = () => {
    setDraggedScheduleSubjectKey('');
    setDraggedScheduleBlockKey('');
    setDraggedScheduleEntryKey('');
    setScheduleDropPreview(null);
  };

  const onScheduleBlockDragStart = (event, blockKey) => {
    const normalizedBlockKey = String(blockKey || '').trim();
    if (!normalizedBlockKey) return;

    setDraggedScheduleBlockKey(normalizedBlockKey);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(ACADEMIC_SCHEDULE_BLOCK_DRAG_MIME, normalizedBlockKey);
  };

  const onScheduleSlotDrop = (event, slotKey) => {
    event.preventDefault();
    setScheduleDropPreview(null);
    const entryKey = event.dataTransfer.getData(ACADEMIC_SCHEDULE_ENTRY_DRAG_MIME) || draggedScheduleEntryKey;
    if (selectedScheduleGradeKey && entryKey) {
      moveScheduleEntryToSlot(selectedScheduleGradeKey, entryKey, slotKey);
      setDraggedScheduleEntryKey('');
      return;
    }

    const blockKey = event.dataTransfer.getData(ACADEMIC_SCHEDULE_BLOCK_DRAG_MIME) || draggedScheduleBlockKey;
    if (selectedScheduleGradeKey && blockKey) {
      const nextEntry = buildScheduleEntryForSlot(slotKey, { entryType: 'break', breakKey: blockKey });
      upsertScheduleEntry(selectedScheduleGradeKey, nextEntry);
      setSelectedScheduleSlotKey(slotKey);
      setDraggedScheduleBlockKey('');
      setDraggedScheduleSubjectKey('');
      return;
    }

    const subjectKey = event.dataTransfer.getData(ACADEMIC_SCHEDULE_SUBJECT_DRAG_MIME) || draggedScheduleSubjectKey;
    if (!selectedScheduleGradeKey || !subjectKey) return;
    const teacherCandidates = selectedScheduleTeacherOptionsBySubjectKey[subjectKey] || [];
    if (teacherCandidates.length > 1) {
      const slotTemplate = selectedScheduleConfiguredSlotByKey[slotKey];
      openScheduleSlotModal(slotKey, null, {
        entryType: 'class',
        subjectKey,
        teacherUserId: '',
        startTime: slotTemplate?.startTime || '',
        endTime: slotTemplate ? academicScheduleMinutesToTime((academicScheduleTimeToMinutes(slotTemplate.startTime) ?? 0) + 15) : '',
      });
      setSelectedScheduleSlotKey(slotKey);
      setDraggedScheduleSubjectKey('');
      return;
    }
    const nextEntry = buildScheduleEntryForSlot(slotKey, { entryType: 'class', subjectKey });
    upsertScheduleEntry(selectedScheduleGradeKey, nextEntry);
    setSelectedScheduleSlotKey(slotKey);
    setDraggedScheduleSubjectKey('');
  };

  const onScheduleEntryDragStart = (event, entryKey) => {
    setDraggedScheduleEntryKey(entryKey);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(ACADEMIC_SCHEDULE_ENTRY_DRAG_MIME, entryKey);
  };

  const onAddCustomScheduleBlock = (event) => {
    event.preventDefault();
    const normalizedName = String(customScheduleBlockName || '').trim();
    if (!normalizedName) {
      return;
    }

    setCustomScheduleBlocks((previous) => {
      if (previous.some((block) => block.label.toLowerCase() === normalizedName.toLowerCase())) {
        return previous;
      }
      return [...previous, {
        key: `other_${Date.now()}`,
        label: normalizedName,
      }];
    });
    setCustomScheduleBlockName('');
    setShowCustomScheduleBlockForm(false);
  };

  useEffect(() => {
    const onScheduleKeyDown = (event) => {
      if (activeAcademicManagementSection !== 'schedule' || !selectedScheduleSlotKey) return;
      const isCopy = (event.metaKey || event.ctrlKey) && String(event.key || '').toLowerCase() === 'c';
      const isPaste = (event.metaKey || event.ctrlKey) && String(event.key || '').toLowerCase() === 'v';
      if (!isCopy && !isPaste) return;

      const selectedEntry = selectedScheduleEntryByKey[selectedScheduleSlotKey];
      if (isCopy && selectedEntry) {
        event.preventDefault();
        setScheduleClipboardEntry({ ...selectedEntry });
        return;
      }

      if (isPaste && scheduleClipboardEntry) {
        event.preventDefault();
        const selectedSlot = selectedScheduleConfiguredSlotByKey[selectedScheduleSlotKey];
        if (!selectedSlot) return;
        const selectedStart = academicScheduleTimeToMinutes(selectedSlot.startTime);
        const targetSlot = selectedScheduleConfiguredBlocks.find((slot) => (
          Number(slot.weekday) > Number(selectedSlot.weekday)
          && academicScheduleTimeToMinutes(slot.startTime) === selectedStart
        )) || selectedScheduleConfiguredBlocks.find((slot) => (
          Number(slot.weekday) < Number(selectedSlot.weekday)
          && academicScheduleTimeToMinutes(slot.startTime) === selectedStart
        )) || selectedScheduleConfiguredBlocks.find((slot) => (
          Number(slot.weekday) === Number(selectedSlot.weekday)
          && Number(slot.block) === Number(selectedSlot.block) + 1
        ));
        if (!targetSlot) return;
        const targetKey = normalizeAcademicScheduleSlotKey(targetSlot.weekday, targetSlot.block);
        const sourceStart = academicScheduleTimeToMinutes(scheduleClipboardEntry.startTime) ?? 0;
        const sourceEnd = academicScheduleTimeToMinutes(scheduleClipboardEntry.endTime) ?? (sourceStart + 15);
        const duration = Math.max(15, sourceEnd - sourceStart);
        const targetStart = academicScheduleTimeToMinutes(targetSlot.startTime) ?? sourceStart;
        upsertScheduleEntry(selectedScheduleGradeKey, {
          ...scheduleClipboardEntry,
          key: targetKey,
          weekday: targetSlot.weekday,
          block: targetSlot.block,
          startTime: academicScheduleMinutesToTime(targetStart),
          endTime: academicScheduleMinutesToTime(targetStart + duration),
        });
        setSelectedScheduleSlotKey(targetKey);
      }
    };

    window.addEventListener('keydown', onScheduleKeyDown);
    return () => window.removeEventListener('keydown', onScheduleKeyDown);
  }, [activeAcademicManagementSection, scheduleClipboardEntry, selectedScheduleConfiguredBlocks, selectedScheduleConfiguredSlotByKey, selectedScheduleEntryByKey, selectedScheduleGradeKey, selectedScheduleSlotKey]);

  const onSaveAcademicScheduleLoad = async () => {
    if (!selectedScheduleGradeKey) {
      setError('Selecciona un grado para guardar la carga académica.');
      return;
    }

    clearMessages();
    setBusy(true);
    try {
      const response = await saveAcademicManagementScheduleLoad(selectedScheduleGradeKey, {
        subjectLoads: selectedGradeSchedule.subjectLoads,
      });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setSuccess(`Carga académica semanal guardada para ${getGradeLabel(selectedScheduleGradeKey)}.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar la carga académica semanal.');
    } finally {
      setBusy(false);
    }
  };

  const onSaveAcademicWeeklySchedule = async () => {
    if (!selectedScheduleGradeKey) {
      setError('Selecciona un grado para guardar el horario.');
      return;
    }
    if (!selectedScheduleCourseKey) {
      setError('Selecciona un curso para guardar el horario.');
      return;
    }

    clearMessages();
    setBusy(true);
    try {
      const weeklySchedule = selectedGradeSchedule.weeklySchedule.filter((entry) => entry.entryType === 'break' || entry.subjectKey);
      const response = await saveAcademicManagementWeeklySchedule(selectedScheduleGradeKey, {
        courseKey: selectedScheduleCourseKey,
        weeklySchedule,
      });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      scheduleAutosaveSignatureRef.current = JSON.stringify({
        gradeKey: selectedScheduleGradeKey,
        courseKey: selectedScheduleCourseKey,
        weeklySchedule,
      });
      setSuccess(`Horario semanal guardado para ${getGradeLabel(selectedScheduleGradeKey)} ${selectedScheduleCourseKey ? `· ${getCourseLabel(selectedScheduleCourseKey)}` : ''}.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar el horario semanal.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (activeAcademicManagementSection !== 'schedule' || !selectedScheduleGradeKey || !selectedScheduleCourseKey) {
      return undefined;
    }

    const weeklySchedule = selectedGradeSchedule.weeklySchedule.filter((entry) => entry.entryType === 'break' || entry.subjectKey);
    const signature = JSON.stringify({
      gradeKey: selectedScheduleGradeKey,
      courseKey: selectedScheduleCourseKey,
      weeklySchedule,
    });

    if (scheduleAutosaveSignatureRef.current === signature) {
      return undefined;
    }

    if (scheduleAutosaveTimerRef.current) {
      clearTimeout(scheduleAutosaveTimerRef.current);
    }

    scheduleAutosaveTimerRef.current = window.setTimeout(async () => {
      scheduleAutosaveSignatureRef.current = signature;
      try {
        await saveAcademicManagementWeeklySchedule(selectedScheduleGradeKey, {
          courseKey: selectedScheduleCourseKey,
          weeklySchedule,
        });
      } catch (requestError) {
        scheduleAutosaveSignatureRef.current = '';
        console.warn('No se pudo guardar automáticamente el horario semanal.', requestError?.response?.data?.message || requestError?.message || requestError);
      }
    }, 900);

    return () => {
      if (scheduleAutosaveTimerRef.current) {
        clearTimeout(scheduleAutosaveTimerRef.current);
      }
    };
  }, [activeAcademicManagementSection, selectedGradeSchedule.weeklySchedule, selectedScheduleCourseKey, selectedScheduleGradeKey]);

  const onGenerateAcademicWeeklySchedule = async () => {
    if (!selectedScheduleGradeKey) {
      setError('Selecciona un grado para generar el horario.');
      return;
    }

    clearMessages();
    setBusy(true);
    try {
      const response = await generateAcademicManagementWeeklySchedule(selectedScheduleGradeKey, {
        slotTemplates: selectedGradeSchedule.weeklySchedule,
      });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setSuccess(`Horario automático generado para ${getGradeLabel(selectedScheduleGradeKey)}.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo generar el horario automático.');
    } finally {
      setBusy(false);
    }
  };

  const onSaveStudentAssignment = async (studentId) => {
    const draft = studentDrafts[studentId] || {};
    clearMessages();
    setBusy(true);
    try {
      const response = await assignAcademicManagementStudentCourse(studentId, {
        course: draft.course,
      });
      const updatedStudent = response?.data?.student || null;
      const updatedStructure = response?.data?.academicStructure || null;
      if (updatedStructure) {
        syncAcademicStructureState(updatedStructure);
      }
      if (updatedStudent?._id) {
        setStudents((prev) => prev.map((student) => (String(student._id) === String(updatedStudent._id)
          ? { ...student, course: updatedStudent.course }
          : student)));
        setStudentDrafts((prev) => ({
          ...prev,
          [String(updatedStudent._id)]: {
            ...(prev[String(updatedStudent._id)] || {}),
            grade: updatedStudent.grade || prev[String(updatedStudent._id)]?.grade || '',
            course: updatedStudent.course || '',
          },
        }));
      }
      setSuccess('Curso asignado correctamente.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar la asignación del curso.');
    } finally {
      setBusy(false);
    }
  };

  const onCreateAcademicGrade = async (event) => {
    event.preventDefault();
    clearMessages();

    if (!selectedLevelKeyForGrade) {
      setError('Primero selecciona un nivel educativo para el grado.');
      return;
    }

    setBusy(true);
    try {
      const response = await createAcademicManagementGrade({ grade: newGradeName, levelKey: selectedLevelKeyForGrade });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setNewGradeName('');
      setSuccess('Grado creado correctamente.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo crear el grado.');
    } finally {
      setBusy(false);
    }
  };

  const onCreateEducationalLevel = async (event) => {
    event.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      const response = await createAcademicManagementLevel({ level: newEducationalLevelName });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setSelectedLevelKeyForGrade(normalizeEducationalLevelKey(newEducationalLevelName));
      setNewEducationalLevelName('');
      setSuccess('Nivel educativo creado correctamente.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo crear el nivel educativo.');
    } finally {
      setBusy(false);
    }
  };

  const onCreateAcademicSubject = async (event) => {
    event.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      const response = await createAcademicManagementSubject({ subject: newSubjectName, kind: newSubjectKind });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setNewSubjectName('');
      setNewSubjectKind('principal');
      setSuccess('Asignatura creada correctamente.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo crear la asignatura.');
    } finally {
      setBusy(false);
    }
  };

  const onSubjectGradeDraftOpen = (subjectKey, gradeKeys = []) => {
    setSubjectGradeDrafts((prev) => {
      if (Array.isArray(prev[subjectKey])) {
        return prev;
      }
      return {
        ...prev,
        [subjectKey]: Array.from(new Set((Array.isArray(gradeKeys) ? gradeKeys : []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean))),
      };
    });
  };

  const getSubjectGradeDraft = (subjectKey, savedGradeKeys = []) => {
    const draft = subjectGradeDrafts[subjectKey];
    if (Array.isArray(draft)) {
      return draft;
    }
    return Array.from(new Set((Array.isArray(savedGradeKeys) ? savedGradeKeys : []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean)));
  };

  const hasSubjectGradeDraftChanges = (subjectKey, savedGradeKeys = []) => {
    const draft = getSubjectGradeDraft(subjectKey, savedGradeKeys);
    const saved = Array.from(new Set((Array.isArray(savedGradeKeys) ? savedGradeKeys : []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean)));
    if (draft.length !== saved.length) {
      return true;
    }
    return draft.some((gradeKey) => !saved.includes(gradeKey));
  };

  const onToggleSubjectGradeDraft = (subjectKey, gradeKey, savedGradeKeys = []) => {
    const normalizedGradeKey = String(gradeKey || '').trim();
    if (!normalizedGradeKey) {
      return;
    }

    setSubjectGradeDrafts((prev) => {
      const currentKeys = Array.isArray(prev[subjectKey])
        ? prev[subjectKey]
        : Array.from(new Set((Array.isArray(savedGradeKeys) ? savedGradeKeys : []).map((item) => String(item || '').trim()).filter(Boolean)));
      const current = new Set(currentKeys);
      if (current.has(normalizedGradeKey)) {
        current.delete(normalizedGradeKey);
      } else {
        current.add(normalizedGradeKey);
      }
      return { ...prev, [subjectKey]: Array.from(current) };
    });
  };

  const onToggleSubjectLevelDraft = (subjectKey, levelKey, savedGradeKeys = []) => {
    const level = groupedEducationalLevels.find((item) => item.key === levelKey);
    const levelGradeKeys = (level?.grades || []).map((grade) => grade.key).filter(Boolean);
    if (!levelGradeKeys.length) {
      return;
    }

    setSubjectGradeDrafts((prev) => {
      const currentKeys = Array.isArray(prev[subjectKey])
        ? prev[subjectKey]
        : Array.from(new Set((Array.isArray(savedGradeKeys) ? savedGradeKeys : []).map((item) => String(item || '').trim()).filter(Boolean)));
      const current = new Set(currentKeys);
      const allSelected = levelGradeKeys.every((gradeKey) => current.has(gradeKey));
      levelGradeKeys.forEach((gradeKey) => {
        if (allSelected) {
          current.delete(gradeKey);
        } else {
          current.add(gradeKey);
        }
      });
      return { ...prev, [subjectKey]: Array.from(current) };
    });
  };

  const isSubjectLevelFullySelected = (subjectKey, levelKey, savedGradeKeys = []) => {
    const level = groupedEducationalLevels.find((item) => item.key === levelKey);
    const levelGradeKeys = (level?.grades || []).map((grade) => grade.key).filter(Boolean);
    if (!levelGradeKeys.length) {
      return false;
    }
    const draft = new Set(getSubjectGradeDraft(subjectKey, savedGradeKeys));
    return levelGradeKeys.every((gradeKey) => draft.has(gradeKey));
  };

  const onSaveSubjectGradeKeys = async (subjectKey, nextGradeKeys) => {
    clearMessages();
    setBusy(true);
    try {
      const response = await updateAcademicManagementSubjectGrades(subjectKey, { gradeKeys: nextGradeKeys });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setSubjectGradeDrafts((prev) => ({
        ...prev,
        [subjectKey]: Array.from(new Set((Array.isArray(nextGradeKeys) ? nextGradeKeys : []).map((gradeKey) => String(gradeKey || '').trim()).filter(Boolean))),
      }));
      return true;
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar el mapa de asignaturas.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSaveSubjectGradeDraft = async (subjectKey, savedGradeKeys = []) => {
    const nextGradeKeys = getSubjectGradeDraft(subjectKey, savedGradeKeys);
    const saved = await onSaveSubjectGradeKeys(subjectKey, nextGradeKeys);
    if (saved) {
      const subject = academicStructureDraft.subjects.find((item) => item.key === subjectKey);
      setSuccess(`Mapa actualizado para ${subject?.label || 'la asignatura'} (${nextGradeKeys.length} grado(s)).`);
    }
  };

  const onLevelGradeSelectionChange = (levelKey, gradeKey) => {
    setLevelGradeSelections((prev) => ({
      ...prev,
      [levelKey]: gradeKey,
    }));
  };

  const onAssignExistingGradeToLevel = async (levelKey) => {
    const selectedGradeKey = String(levelGradeSelections[levelKey] || '').trim();
    if (!selectedGradeKey) {
      setError('Selecciona un grado creado para agregarlo al nivel educativo.');
      return;
    }

    clearMessages();
    setBusy(true);
    try {
      const response = await updateAcademicManagementGradeLevel(selectedGradeKey, { levelKey });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setLevelGradeSelections((prev) => ({ ...prev, [levelKey]: '' }));
      setSuccess(`${getGradeLabel(selectedGradeKey)} agregado al nivel correctamente.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo agregar el grado al nivel educativo.');
    } finally {
      setBusy(false);
    }
  };

  const onCourseFormChange = (gradeKey, value) => {
    setCourseForms((prev) => ({
      ...prev,
      [gradeKey]: value,
    }));
  };

  const syncStudentsAfterCourseRemoval = ({ clearedGrade = '', clearedCourses = [] } = {}) => {
    const normalizedGrade = String(clearedGrade || '').trim();
    const normalizedCourses = new Set((Array.isArray(clearedCourses) ? clearedCourses : []).map((item) => String(item || '').trim()).filter(Boolean));

    const shouldClearStudentCourse = (student) => {
      const studentGrade = String(student?.grade || '').trim();
      const studentCourse = String(student?.course || '').trim();
      if (normalizedGrade && studentGrade === normalizedGrade) {
        return true;
      }
      return studentCourse && normalizedCourses.has(studentCourse);
    };

    const clearCourse = (student) => (shouldClearStudentCourse(student) ? { ...student, course: '' } : student);

    setStudents((prev) => prev.map(clearCourse));
    setBillingBootstrap((prev) => ({
      ...prev,
      students: (prev.students || []).map(clearCourse),
    }));
    setStudentDrafts((prev) => Object.fromEntries(
      Object.entries(prev).map(([studentId, draft]) => {
        const currentStudent = students.find((item) => String(item._id) === String(studentId));
        const shouldClear = currentStudent
          ? shouldClearStudentCourse(currentStudent)
          : (normalizedGrade && String(draft?.grade || '').trim() === normalizedGrade)
            || (String(draft?.course || '').trim() && normalizedCourses.has(String(draft?.course || '').trim()));

        return [studentId, shouldClear ? { ...(draft || {}), course: '' } : draft];
      })
    ));
  };

  const onCreateAcademicCourse = async (gradeKey) => {
    clearMessages();
    setBusy(true);
    try {
      const response = await createAcademicManagementCourse({
        grade: gradeKey,
        courseKey: courseForms[gradeKey],
      });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setCourseForms((prev) => ({ ...prev, [gradeKey]: '' }));
      setSuccess(`Curso agregado a ${getGradeLabel(gradeKey)}.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo crear el curso.');
    } finally {
      setBusy(false);
    }
  };

  const openDeleteGradeModal = (gradeKey) => {
    clearMessages();
    setDeleteGradeModal({ open: true, gradeKey, password: '', error: '' });
  };

  const openEditGradeModal = (gradeKey, gradeLabel) => {
    clearMessages();
    setEditGradeModal({ open: true, gradeKey, gradeLabel, error: '' });
  };

  const openDeleteSubjectModal = (subjectKey, subjectLabel) => {
    clearMessages();
    setDeleteSubjectModal({ open: true, subjectKey, subjectLabel, password: '', error: '' });
  };

  const openEditSubjectModal = (subject) => {
    clearMessages();
    setEditSubjectModal({
      open: true,
      subjectKey: String(subject?.key || '').trim(),
      subjectLabel: String(subject?.label || '').trim(),
      subjectKind: subject?.kind === 'secundaria' ? 'secundaria' : 'principal',
      error: '',
    });
  };

  const openDeleteLevelModal = (levelKey, levelLabel) => {
    clearMessages();
    setDeleteLevelModal({ open: true, levelKey, levelLabel, password: '', error: '' });
  };

  const openEditLevelModal = (levelKey, levelLabel) => {
    clearMessages();
    setEditLevelModal({ open: true, levelKey, levelLabel, error: '' });
  };

  const openDeleteCourseModal = (gradeKey, courseKey) => {
    clearMessages();
    setDeleteCourseModal({ open: true, gradeKey, courseKey, password: '', error: '' });
  };

  const openEditCourseModal = (gradeKey, courseKey, courseLabel) => {
    clearMessages();
    setEditCourseModal({ open: true, gradeKey, courseKey, courseLabel, error: '' });
  };

  const openCourseStudentsModal = (gradeKey, courseKey) => {
    setCourseStudentsModal({ open: true, courseKey, gradeKey });
  };

  const closeCourseStudentsModal = () => {
    setCourseStudentsModal({ open: false, courseKey: '', gradeKey: '' });
  };

  const closeDeleteGradeModal = () => {
    if (busy) {
      return;
    }
    setDeleteGradeModal({ open: false, gradeKey: '', password: '', error: '' });
  };

  const closeEditGradeModal = () => {
    if (busy) {
      return;
    }
    setEditGradeModal({ open: false, gradeKey: '', gradeLabel: '', error: '' });
  };

  const closeDeleteLevelModal = () => {
    if (busy) {
      return;
    }
    setDeleteLevelModal({ open: false, levelKey: '', levelLabel: '', password: '', error: '' });
  };

  const closeEditLevelModal = () => {
    if (busy) {
      return;
    }
    setEditLevelModal({ open: false, levelKey: '', levelLabel: '', error: '' });
  };

  const closeDeleteSubjectModal = () => {
    if (busy) {
      return;
    }
    setDeleteSubjectModal({ open: false, subjectKey: '', subjectLabel: '', password: '', error: '' });
  };

  const closeEditSubjectModal = () => {
    if (busy) {
      return;
    }
    setEditSubjectModal({ open: false, subjectKey: '', subjectLabel: '', subjectKind: 'principal', error: '' });
  };

  const closeDeleteCourseModal = () => {
    if (busy) {
      return;
    }
    setDeleteCourseModal({ open: false, gradeKey: '', courseKey: '', password: '', error: '' });
  };

  const closeEditCourseModal = () => {
    if (busy) {
      return;
    }
    setEditCourseModal({ open: false, gradeKey: '', courseKey: '', courseLabel: '', error: '' });
  };

  const onRenameAcademicGrade = async (event) => {
    event.preventDefault();

    const gradeKey = String(editGradeModal.gradeKey || '').trim();
    const gradeLabel = String(editGradeModal.gradeLabel || '').trim();
    if (!gradeKey) {
      return;
    }

    if (!gradeLabel) {
      setEditGradeModal((previous) => ({ ...previous, error: 'Escribe el nuevo nombre del grado.' }));
      return;
    }

    clearMessages();
    setEditGradeModal((previous) => ({ ...previous, error: '' }));
    setBusy(true);
    try {
      const response = await updateAcademicManagementGradeName(gradeKey, { label: gradeLabel });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setEditGradeModal({ open: false, gradeKey: '', gradeLabel: '', error: '' });
      setSuccess(`${gradeLabel} actualizado correctamente.`);
    } catch (requestError) {
      setEditGradeModal((previous) => ({
        ...previous,
        error: requestError?.response?.data?.message || 'No se pudo actualizar el nombre del grado.',
      }));
    } finally {
      setBusy(false);
    }
  };

  const onRenameAcademicCourse = async (event) => {
    event.preventDefault();

    const courseKey = String(editCourseModal.courseKey || '').trim();
    const courseLabel = String(editCourseModal.courseLabel || '').trim();
    if (!courseKey) {
      return;
    }

    if (!courseLabel) {
      setEditCourseModal((previous) => ({ ...previous, error: 'Escribe el nuevo nombre del curso.' }));
      return;
    }

    clearMessages();
    setEditCourseModal((previous) => ({ ...previous, error: '' }));
    setBusy(true);
    try {
      const response = await updateAcademicManagementCourseName(courseKey, { label: courseLabel });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setEditCourseModal({ open: false, gradeKey: '', courseKey: '', courseLabel: '', error: '' });
      setSuccess(`Curso ${courseLabel} actualizado correctamente.`);
    } catch (requestError) {
      setEditCourseModal((previous) => ({
        ...previous,
        error: requestError?.response?.data?.message || 'No se pudo actualizar el nombre del curso.',
      }));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteAcademicGrade = async (event) => {
    event.preventDefault();

    const gradeKey = String(deleteGradeModal.gradeKey || '').trim();
    if (!gradeKey) {
      return;
    }

    clearMessages();
    setDeleteGradeModal((previous) => ({ ...previous, error: '' }));
    setBusy(true);
    try {
      const response = await deleteAcademicManagementGrade(gradeKey, { password: deleteGradeModal.password });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      syncStudentsAfterCourseRemoval({
        clearedGrade: response?.data?.clearedStudentGrade || gradeKey,
        clearedCourses: response?.data?.clearedCourseKeys || [],
      });
      setCourseForms((prev) => {
        const next = { ...prev };
        delete next[gradeKey];
        return next;
      });
      setDeleteGradeModal({ open: false, gradeKey: '', password: '', error: '' });
      setSuccess(`${getGradeLabel(gradeKey)} eliminado.`);
    } catch (requestError) {
      setDeleteGradeModal((previous) => ({
        ...previous,
        error: requestError?.response?.data?.message || 'No se pudo eliminar el grado.',
      }));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteAcademicLevel = async (event) => {
    event.preventDefault();

    const levelKey = String(deleteLevelModal.levelKey || '').trim();
    if (!levelKey) {
      return;
    }

    clearMessages();
    setDeleteLevelModal((previous) => ({ ...previous, error: '' }));
    setBusy(true);
    try {
      const response = await deleteAcademicManagementLevel(levelKey, { password: deleteLevelModal.password });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setLevelGradeSelections((prev) => {
        const next = { ...prev };
        delete next[levelKey];
        return next;
      });
      setDeleteLevelModal({ open: false, levelKey: '', levelLabel: '', password: '', error: '' });
      setSuccess(`Nivel educativo ${deleteLevelModal.levelLabel || levelKey} eliminado.`);
    } catch (requestError) {
      setDeleteLevelModal((previous) => ({
        ...previous,
        error: requestError?.response?.data?.message || 'No se pudo eliminar el nivel educativo.',
      }));
    } finally {
      setBusy(false);
    }
  };

  const onRenameAcademicLevel = async (event) => {
    event.preventDefault();

    const levelKey = String(editLevelModal.levelKey || '').trim();
    const levelLabel = String(editLevelModal.levelLabel || '').trim();
    if (!levelKey) {
      return;
    }

    if (!levelLabel) {
      setEditLevelModal((previous) => ({ ...previous, error: 'Escribe el nuevo nombre del nivel educativo.' }));
      return;
    }

    clearMessages();
    setEditLevelModal((previous) => ({ ...previous, error: '' }));
    setBusy(true);
    try {
      const response = await updateAcademicManagementLevelName(levelKey, { label: levelLabel });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setEditLevelModal({ open: false, levelKey: '', levelLabel: '', error: '' });
      setSuccess(`Nivel educativo ${levelLabel} actualizado correctamente.`);
    } catch (requestError) {
      setEditLevelModal((previous) => ({
        ...previous,
        error: requestError?.response?.data?.message || 'No se pudo actualizar el nombre del nivel educativo.',
      }));
    } finally {
      setBusy(false);
    }
  };

  const onUpdateAcademicSubject = async (event) => {
    event.preventDefault();

    const subjectKey = String(editSubjectModal.subjectKey || '').trim();
    const subjectLabel = String(editSubjectModal.subjectLabel || '').trim();
    const subjectKind = editSubjectModal.subjectKind === 'secundaria' ? 'secundaria' : 'principal';
    if (!subjectKey) {
      return;
    }

    if (!subjectLabel) {
      setEditSubjectModal((previous) => ({ ...previous, error: 'Escribe el nuevo nombre de la asignatura.' }));
      return;
    }

    clearMessages();
    setEditSubjectModal((previous) => ({ ...previous, error: '' }));
    setBusy(true);
    try {
      const response = await updateAcademicManagementSubject(subjectKey, { label: subjectLabel, kind: subjectKind });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setEditSubjectModal({ open: false, subjectKey: '', subjectLabel: '', subjectKind: 'principal', error: '' });
      setSuccess(`Asignatura ${subjectLabel} actualizada correctamente.`);
    } catch (requestError) {
      setEditSubjectModal((previous) => ({
        ...previous,
        error: requestError?.response?.data?.message || 'No se pudo actualizar la asignatura.',
      }));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteAcademicSubject = async (event) => {
    event.preventDefault();

    const subjectKey = String(deleteSubjectModal.subjectKey || '').trim();
    if (!subjectKey) {
      return;
    }

    clearMessages();
    setDeleteSubjectModal((previous) => ({ ...previous, error: '' }));
    setBusy(true);
    try {
      const response = await deleteAcademicManagementSubject(subjectKey, { password: deleteSubjectModal.password });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setSubjectGradeDrafts((prev) => {
        const next = { ...prev };
        delete next[subjectKey];
        return next;
      });
      setDeleteSubjectModal({ open: false, subjectKey: '', subjectLabel: '', password: '', error: '' });
      setSuccess(`Asignatura ${deleteSubjectModal.subjectLabel || subjectKey} eliminada.`);
    } catch (requestError) {
      setDeleteSubjectModal((previous) => ({
        ...previous,
        error: requestError?.response?.data?.message || 'No se pudo eliminar la asignatura.',
      }));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteAcademicCourse = async (event) => {
    event.preventDefault();

    const gradeKey = String(deleteCourseModal.gradeKey || '').trim();
    const courseKey = String(deleteCourseModal.courseKey || '').trim();
    if (!courseKey) {
      return;
    }

    clearMessages();
    setDeleteCourseModal((previous) => ({ ...previous, error: '' }));
    setBusy(true);
    try {
      const response = await deleteAcademicManagementCourse(courseKey, { password: deleteCourseModal.password });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      syncStudentsAfterCourseRemoval({
        clearedCourses: response?.data?.clearedCourseKeys || [courseKey],
      });
      setDeleteCourseModal({ open: false, gradeKey: '', courseKey: '', password: '', error: '' });
      setSuccess(`Curso ${courseKey} eliminado de ${getGradeLabel(gradeKey)}.`);
    } catch (requestError) {
      setDeleteCourseModal((previous) => ({
        ...previous,
        error: requestError?.response?.data?.message || 'No se pudo eliminar el curso.',
      }));
    } finally {
      setBusy(false);
    }
  };

  const onAcademicPeriodChange = (index, field, value) => {
    setAcademicStructureDraft((prev) => ({
      ...prev,
      academicPeriods: prev.academicPeriods.map((period, periodIndex) => (
        periodIndex === index ? { ...period, [field]: value } : period
      )),
    }));
  };

  const onAcademicGradingScaleChange = (field, value) => {
    setAcademicStructureDraft((prev) => setAcademicGradingScaleForLevel(prev, selectedAcademicGradingLevelKey, (gradingScale) => ({
      ...gradingScale,
      [field]: value,
    })));
  };

  const onAcademicPerformanceLevelChange = (index, field, value) => {
    setAcademicStructureDraft((prev) => setAcademicGradingScaleForLevel(prev, selectedAcademicGradingLevelKey, (gradingScale) => ({
      ...gradingScale,
      performanceLevels: gradingScale.performanceLevels.map((level, levelIndex) => (
        levelIndex === index ? { ...level, [field]: value } : level
      )),
    })));
  };

  const onAddAcademicPerformanceLevel = () => {
    setAcademicStructureDraft((prev) => setAcademicGradingScaleForLevel(prev, selectedAcademicGradingLevelKey, (gradingScale) => ({
      ...gradingScale,
      performanceLevels: [
        ...gradingScale.performanceLevels,
        createEmptyPerformanceLevelDraft(gradingScale.performanceLevels.length, gradingScale),
      ],
    })));
  };

  const onRemoveAcademicPerformanceLevel = (index) => {
    setAcademicStructureDraft((prev) => setAcademicGradingScaleForLevel(prev, selectedAcademicGradingLevelKey, (gradingScale) => ({
      ...gradingScale,
      performanceLevels: gradingScale.performanceLevels.filter((_, levelIndex) => levelIndex !== index),
    })));
  };

  const onAddAcademicPeriod = () => {
    setAcademicStructureDraft((prev) => ({
      ...prev,
      academicPeriods: [...prev.academicPeriods, createEmptyAcademicPeriodDraft(prev.academicPeriods.length)],
    }));
  };

  const onRemoveAcademicPeriod = (index) => {
    setAcademicStructureDraft((prev) => {
      const nextPeriods = prev.academicPeriods.filter((_, periodIndex) => periodIndex !== index);
      return {
        ...prev,
        academicPeriods: nextPeriods.length > 0 ? nextPeriods : [createEmptyAcademicPeriodDraft()],
      };
    });
  };

  const saveAcademicPeriodsConfiguration = async (successMessage = 'Periodos y calificaciones guardados.') => {
    clearMessages();
    setBusy(true);
    try {
      const response = await saveAcademicManagementPeriods({
        academicYear: academicStructureDraft.academicYear,
        periods: academicStructureDraft.academicPeriods,
        gradingScale: academicStructureDraft.gradingScale,
        gradingScalesByLevel: academicStructureDraft.levels.map((level) => ({
          levelKey: level.key,
          ...getAcademicGradingScaleForLevel(academicStructureDraft, level.key),
        })),
      });
      syncAcademicStructureState(response?.data?.academicStructure || {});
      setSuccess(successMessage);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudieron guardar los periodos y calificaciones.');
    } finally {
      setBusy(false);
    }
  };

  const onSaveAcademicPeriods = async () => {
    await saveAcademicPeriodsConfiguration('Periodos y calificaciones guardados.');
  };

  const onSaveAcademicPerformanceLevelColor = async () => {
    await saveAcademicPeriodsConfiguration('Color de categoría guardado en la escala.');
  };

  const onFeeSettingChange = (index, field, value) => {
    setFeeSettingsDraft((prev) => ({
      ...prev,
      gradeSettings: prev.gradeSettings.map((setting, settingIndex) => (
        settingIndex === index ? { ...setting, [field]: value } : setting
      )),
    }));
  };

  const onBenefitRuleChange = (ruleIndex, field, value) => {
    setFeeSettingsDraft((prev) => ({
      ...prev,
      benefitRules: prev.benefitRules.map((rule, currentRuleIndex) => (
        currentRuleIndex === ruleIndex ? { ...rule, [field]: value } : rule
      )),
    }));
  };

  const onBenefitFixedAmountChange = (ruleIndex, grade, value) => {
    setFeeSettingsDraft((prev) => ({
      ...prev,
      benefitRules: prev.benefitRules.map((rule, currentRuleIndex) => (
        currentRuleIndex === ruleIndex
          ? {
            ...rule,
            fixedAmountsByGrade: {
              ...(rule.fixedAmountsByGrade || {}),
              [grade]: value,
            },
          }
          : rule
      )),
    }));
  };

  const onAddBenefitRule = () => {
    setFeeSettingsDraft((prev) => ({
      ...prev,
      benefitRules: [...(Array.isArray(prev.benefitRules) ? prev.benefitRules : []), createEmptyBenefitRule((prev.benefitRules || []).length)],
    }));
  };

  const onRemoveBenefitRule = (ruleIndex) => {
    setFeeSettingsDraft((prev) => ({
      ...prev,
      benefitRules: (() => {
        const nextRules = (Array.isArray(prev.benefitRules) ? prev.benefitRules : []).filter((_, currentRuleIndex) => currentRuleIndex !== ruleIndex);
        return nextRules.length ? nextRules : [createEmptyBenefitRule()];
      })(),
    }));
  };

  const onEnrollmentBenefitRuleChange = (ruleIndex, field, value) => {
    setFeeSettingsDraft((prev) => ({
      ...prev,
      enrollmentBenefitRules: (Array.isArray(prev.enrollmentBenefitRules) ? prev.enrollmentBenefitRules : []).map((rule, currentRuleIndex) => (
        currentRuleIndex === ruleIndex ? { ...rule, [field]: value } : rule
      )),
    }));
  };

  const onEnrollmentBenefitFixedAmountChange = (ruleIndex, grade, value) => {
    setFeeSettingsDraft((prev) => ({
      ...prev,
      enrollmentBenefitRules: (Array.isArray(prev.enrollmentBenefitRules) ? prev.enrollmentBenefitRules : []).map((rule, currentRuleIndex) => (
        currentRuleIndex === ruleIndex
          ? {
            ...rule,
            fixedAmountsByGrade: {
              ...(rule.fixedAmountsByGrade || {}),
              [grade]: value,
            },
          }
          : rule
      )),
    }));
  };

  const onSchoolYearLevelSettingChange = (fieldName, value) => {
    if (!selectedSchoolYearLevelKey) {
      return;
    }

    setFeeSettingsDraft((prev) => ({
      ...prev,
      schoolYearLevels: (Array.isArray(prev.schoolYearLevels) ? prev.schoolYearLevels : []).map((setting) => (
        setting.levelKey === selectedSchoolYearLevelKey
          ? {
            ...setting,
            [fieldName]: value,
            lateEnrollmentSurchargeValue: fieldName === 'lateEnrollmentSurchargeType' && value === 'none' ? 0 : setting.lateEnrollmentSurchargeValue,
          }
          : setting
      )),
    }));
  };

  const onAddEnrollmentBenefitRule = () => {
    setFeeSettingsDraft((prev) => ({
      ...prev,
      enrollmentBenefitRules: [
        ...(Array.isArray(prev.enrollmentBenefitRules) ? prev.enrollmentBenefitRules : []),
        createEmptyEnrollmentBenefitRule((prev.enrollmentBenefitRules || []).length),
      ],
    }));
  };

  const onRemoveEnrollmentBenefitRule = (ruleIndex) => {
    setFeeSettingsDraft((prev) => ({
      ...prev,
      enrollmentBenefitRules: (Array.isArray(prev.enrollmentBenefitRules) ? prev.enrollmentBenefitRules : []).filter((_, currentRuleIndex) => currentRuleIndex !== ruleIndex),
    }));
  };

  const persistFeeSettings = async (successMessage = 'Configuración académica actualizada.') => {
    clearMessages();
    setBusy(true);
    try {
      const payload = buildFeeSettingsPayload(feeSettingsDraft);
      const response = await saveAcademicSecretaryFeeSettings(payload);
      setFeeSettingsDraft(normalizeFeeSettingsDraft(response.data || payload, academicStructureDraft.grades, academicStructureDraft.levels));
      setSuccess(successMessage);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar la configuración académica.');
    } finally {
      setBusy(false);
    }
  };

  const onSaveSchoolCalendarSettings = async () => {
    await persistFeeSettings('Calendario escolar y matrícula tardía actualizados.');
  };

  const onSaveFeeSettings = async () => {
    await persistFeeSettings('Costos académicos actualizados.');
  };

  const onAddMultiSelectValue = (fieldName, value) => {
    const normalizedValue = String(value || '');
    if (!normalizedValue) {
      return;
    }

    setChargeForm((previous) => ({
      ...previous,
      [fieldName]: (previous[fieldName] || []).map(String).includes(normalizedValue)
        ? (previous[fieldName] || []).map(String)
        : [...(previous[fieldName] || []).map(String), normalizedValue],
    }));
  };

  const onRemoveMultiSelectValue = (fieldName, value) => {
    const normalizedValue = String(value || '');
    setChargeForm((previous) => ({
      ...previous,
      [fieldName]: (previous[fieldName] || []).map(String).filter((item) => item !== normalizedValue),
    }));
  };

  const onSubmitCharge = async (event) => {
    event.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      await createAcademicSecretaryCharge(chargeForm);
      setChargeForm(emptyChargeForm);
      setSuccess('Cobro adicional creado y notificado.');
      await loadPortal({ silent: true });
      setActiveSection('billing');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo crear el cobro.');
    } finally {
      setBusy(false);
    }
  };

  const onSendReminder = async (bucket) => {
    clearMessages();
    setBusy(true);
    try {
      await sendAcademicSecretaryReminder({ bucket });
      setSuccess('Recordatorio enviado al grupo seleccionado.');
      setActiveSection('billing');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo enviar el recordatorio.');
    } finally {
      setBusy(false);
    }
  };

  const openPushEmailModal = (item) => {
    setFollowUpModal({
      open: true,
      type: 'push_email',
      item,
      title: 'Recordatorio de cartera académica',
      body: buildBillingMessageDraft({
        parentName: item.parentName,
        schoolName,
        amount: item.amount,
        overdueDays: item.overdueDays,
      }),
    });
  };

  const openManualNoteModal = (item) => {
    setFollowUpModal({
      open: true,
      type: 'manual_note',
      item,
      title: 'Nota manual',
      body: '',
    });
  };

  const closeFollowUpModal = () => {
    setFollowUpModal({ open: false, type: '', item: null, title: '', body: '' });
  };

  const onSubmitFollowUp = async (event) => {
    event.preventDefault();
    const target = followUpModal.item;
    if (!target) {
      return;
    }

    clearMessages();
    setBusy(true);
    try {
      await createAcademicSecretaryBillingFollowUp({
        actionType: followUpModal.type,
        parentId: target.parentId,
        parentName: target.parentName,
        parentPhone: target.parentPhone,
        studentNames: target.students,
        outstandingAmount: target.amount,
        overdueDays: target.overdueDays,
        overdueMonths: target.overdueMonths,
        title: followUpModal.title,
        body: followUpModal.body,
        schoolName,
      });
      setSuccess(followUpModal.type === 'manual_note' ? 'Nota manual registrada en seguimiento.' : 'Push y correo enviados; seguimiento registrado.');
      closeFollowUpModal();
      await loadPortal({ silent: true });
      setActiveSection('billing');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo registrar el seguimiento.');
    } finally {
      setBusy(false);
    }
  };

  const onOpenWhatsapp = async (item) => {
    const normalizedPhone = normalizePhoneForWhatsapp(item.parentPhone);
    if (!normalizedPhone) {
      setError('Este acudiente no tiene un teléfono válido para WhatsApp.');
      return;
    }

    const message = buildWhatsappMessage({
      parentName: item.parentName,
      schoolName,
      amount: item.amount,
      overdueDays: item.overdueDays,
    });
    const whatsappUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

    clearMessages();
    setBusy(true);
    try {
      await createAcademicSecretaryBillingFollowUp({
        actionType: 'whatsapp',
        parentId: item.parentId,
        parentName: item.parentName,
        parentPhone: item.parentPhone,
        studentNames: item.students,
        outstandingAmount: item.amount,
        overdueDays: item.overdueDays,
        overdueMonths: item.overdueMonths,
        title: 'Mensaje abierto en WhatsApp',
        body: message,
        whatsappUrl,
        schoolName,
      });
      setSuccess('WhatsApp abierto y seguimiento registrado.');
      await loadPortal({ silent: true });
      setActiveSection('billing');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Se abrió WhatsApp, pero no se pudo guardar el seguimiento.');
    } finally {
      setBusy(false);
    }
  };

  const onDownloadAcademicDatabase = () => {
    downloadExcelWorkbook('Base de datos', ACADEMIC_DATABASE_HEADERS, academicDatabaseRows, 'base-datos-academica-rectoria');
  };

  const onDownloadAcademicDatabaseTemplate = () => {
    downloadExcelWorkbook('Plantilla migracion', ACADEMIC_DATABASE_HEADERS, ACADEMIC_DATABASE_TEMPLATE_ROWS, 'plantilla-migracion-base-datos');
  };

  const onOpenAcademicDatabaseImportPicker = () => {
    if (busy) return;
    academicDatabaseImportInputRef.current?.click();
  };

  const onAcademicDatabaseImportSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    clearMessages();
    setBusy(true);
    try {
      const response = await importAcademicSecretaryDatabase(file);
      await loadPortal({ silent: true });
      const summary = response?.data?.summary || {};
      setSuccess(`Migración completada. Alumnos creados: ${Number(summary.createdStudents || 0)}. Alumnos actualizados: ${Number(summary.updatedStudents || 0)}. Padres creados: ${Number(summary.createdParents || 0)}. Padres actualizados: ${Number(summary.updatedParents || 0)}. Filas omitidas: ${Number(summary.skippedRows || 0)}.`);
      setActiveSection('database');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo migrar la base de datos académica.');
    } finally {
      setBusy(false);
    }
  };

  const onEditAcademicDatabaseRow = (item) => {
    const rowId = String(item?._id || '');
    if (!rowId) return;

    setEditingAcademicRowId(rowId);
    setAcademicDatabaseDrafts((previous) => ({
      ...previous,
      [rowId]: createAcademicDatabaseEditDraft(item),
    }));
  };

  const onChangeAcademicDatabaseDraft = (rowId, fieldName, value) => {
    setAcademicDatabaseDrafts((previous) => ({
      ...previous,
      [rowId]: {
        ...(previous[rowId] || {}),
        [fieldName]: value,
      },
    }));
  };

  const onSaveAcademicDatabaseRow = async (item) => {
    const rowId = String(item?._id || '');
    const draft = academicDatabaseDrafts[rowId];
    if (!rowId || !draft) return;

    clearMessages();
    setBusy(true);
    try {
      await updateAcademicSecretaryDatabaseRow(rowId, draft);
      await loadPortal({ silent: true });
      setEditingAcademicRowId('');
      setSuccess('Fila académica actualizada.');
      setActiveSection('database');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo actualizar la fila académica.');
    } finally {
      setBusy(false);
    }
  };

  const onRequestGradePromotion = async () => {
    clearMessages();
    setBusy(true);
    try {
      await requestAcademicSecretaryGradePromotion();
      setSuccess('Solicitud enviada para subir un grado a todos los alumnos.');
      setActiveSection('database');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo solicitar la promoción de grado.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <section className="rectoria-shell"><p>{`Cargando portal de ${portalLabel}...`}</p></section>;
  }

  return (
    <section className="rectoria-shell">
      <header className="rectoria-hero panel">
        <div>
          <span className="rectoria-kicker">{isCoordinationPortal ? 'Portal de coordinación' : (isDireccionPortal ? 'Portal de dirección' : 'Portal de rectoría')}</span>
          <h1>{isCoordinationPortal ? `Coordinación ${coordinationScope || schoolName}` : (isDireccionPortal ? `Dirección institucional de ${schoolName}` : `Rectoría ${schoolName}`)}</h1>
          <p>
            {isCoordinationPortal
              ? 'Tablero operativo del nivel, comunicados, recursos y horarios académicos del nivel asignado.'
              : 'Controla el equipo académico, el mapa de alumnos por curso, los costos por grado y los puntos críticos de la operación institucional.'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => loadPortal({ silent: true })} type="button" disabled={refreshing || busy}>
          {refreshing ? 'Actualizando...' : 'Actualizar portal'}
        </button>
      </header>

      <div className="rectoria-portal-layout">
        <aside className="rectoria-sidebar" aria-label="Navegación de rectoría">
          <span className="rectoria-sidebar-eyebrow">Portal</span>
          <nav className="rectoria-tabs">
            {sectionOptions.map((section) => (
              <div className={`rectoria-sidebar-section${expandedSidebarSection === section.key ? ' is-open' : ''}`} key={section.key}>
                <button
                  className={`rectoria-tab ${activeSection === section.key ? 'is-active' : ''}`}
                  onClick={() => onSidebarSectionClick(section.key)}
                  type="button"
                >
                  <span>{section.label}</span>
                </button>
                {expandedSidebarSection === section.key && section.key === 'team' ? (
                  <div className="rectoria-sidebar-subnav" aria-label="Roles institucionales">
                    {roleSummary.map((group) => (
                      <button
                        key={group.value}
                        className={`rectoria-sidebar-subitem${selectedTeamRole === group.value ? ' is-active' : ''}`}
                        type="button"
                        onClick={() => setSelectedTeamRole(group.value)}
                      >
                        <span>{group.label}</span>
                        <strong>{group.count}</strong>
                      </button>
                    ))}
                  </div>
                ) : null}
                {expandedSidebarSection === section.key && section.key === 'admissions' ? (
                  <div className="rectoria-sidebar-subnav" aria-label="Secciones de admisiones">
                    {ADMISSIONS_SECTION_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        className={`rectoria-sidebar-subitem${activeAdmissionsView === option.key ? ' is-active' : ''}`}
                        type="button"
                        onClick={() => {
                          setActiveSection('admissions');
                          setActiveAdmissionsView(option.key);
                        }}
                      >
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {expandedSidebarSection === section.key && section.key === 'students' ? (
                  <div className="rectoria-sidebar-subnav" aria-label="Bloques de gestión académica">
                    {ACADEMIC_MANAGEMENT_SECTION_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          className={`rectoria-sidebar-subitem${activeAcademicManagementSection === option.key ? ' is-active' : ''}`}
                          type="button"
                          onClick={() => setActiveAcademicManagementSection(option.key)}
                        >
                          <span>{option.label}</span>
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>
        </aside>

        <main className="rectoria-content">
      {activeSection === 'admissions' ? (
        <AdmissionsDashboard activeView={activeAdmissionsView} embedded />
      ) : null}

      {activeSection === 'schedule' && isCoordinationPortal ? (
        <section className="panel rectoria-panel rectoria-panel--school-schedule">
          <CoordinationSchedulePanel
            academicStructure={academicStructureDraft}
            gradeLabels={configuredGradeLabels}
            teacherLabels={teacherLabelById}
            scopeLabel={coordinationDashboard?.scope?.label || coordinationScope || schoolName}
          />
        </section>
      ) : null}

      {activeSection === 'overview' ? (
        isCoordinationPortal ? (
          <CoordinationLevelDashboard
            dashboard={coordinationDashboard}
            loading={loading || (refreshing && !coordinationDashboard)}
            onRefresh={() => loadPortal({ silent: true })}
          />
        ) : (
        <div className="rectoria-stack rectoria-stack--overview">
          <div className="rectoria-overview-command-grid">
            {!isCoordinationPortal ? <article className="rectoria-overview-kpi rectoria-overview-kpi--billing">
              <span>Cartera por cobrar</span>
              <strong>{formatCurrency(overviewBillingKpis.pendingAmount)}</strong>
              <p>{overviewBillingKpis.totalPendingCharges} cargos pendientes · {overviewBillingKpis.overdueFamilies} familias en mora</p>
              <div className="rectoria-overview-kpi-strip">
                <div>
                  <span>Pagado este mes</span>
                  <strong>{formatCurrency(overviewBillingKpis.paidThisMonth)}</strong>
                </div>
                <div>
                  <span>Mora crítica</span>
                  <strong>{overviewBillingKpis.overdueCriticalFamilies}</strong>
                </div>
              </div>
            </article> : null}

            <article className="rectoria-overview-kpi">
              <span>{isCoordinationPortal ? 'Estudiantes del nivel asignado' : 'Total estudiantes matriculados'}</span>
              <strong>{students.length}</strong>
              <p>{overviewAcademicLevelKpi.assignedStudents} con curso asignado · {overviewAcademicLevelKpi.pendingStudents} pendientes por curso</p>
            </article>

          </div>

          <article className="panel rectoria-panel rectoria-overview-levels-panel">
            <div className="rectoria-overview-levels-hero">
              <div className="rectoria-overview-levels-copy">
                <span className="rectoria-panel-kicker">Resumen institucional</span>
                <h3>Niveles académicos</h3>
                <p>{isCoordinationPortal ? 'Lectura ejecutiva del nivel académico asignado para seguimiento y planes de refuerzo.' : 'Promedio consolidado por estudiante único, usando solo cursos con calificaciones registradas.'}</p>
              </div>
              <div className={`rectoria-overview-levels-total is-tone-${overviewAcademicPerformance.performanceMeta?.tone || 'neutral'}`}>
                <span>Promedio general</span>
                <strong>{overviewAcademicPerformance.weightedAverage === null ? '—' : formatAcademicScore(overviewAcademicPerformance.weightedAverage)}</strong>
                <small>{overviewAcademicPerformance.performanceMeta?.label || 'Sin calificaciones'}</small>
              </div>
            </div>
            <div className="rectoria-overview-level-summary">
              <div className="rectoria-overview-metric-card">
                <span>Estudiantes evaluados</span>
                <strong>{overviewAcademicPerformance.evaluatedStudentCount}</strong>
                <small>Con notas publicadas en al menos un curso</small>
              </div>
              <div className="rectoria-overview-metric-card">
                <span>Cursos en atención</span>
                <strong>{overviewAcademicPerformance.coursesNeedingAttention.length}</strong>
                <small>Promedio bajo o alumnos en riesgo</small>
              </div>
              <div className="rectoria-overview-metric-card">
                <span>Estudiantes bajo {passingScoreLabel}</span>
                <strong>{overviewAcademicPerformance.atRiskStudents.length}</strong>
                <small>Promedio consolidado por alumno</small>
              </div>
              <div className="rectoria-overview-metric-card">
                <span>Pendientes por calificar</span>
                <strong>{overviewAcademicPerformance.pendingGradingCount}</strong>
                <small>Actividades evaluativas activas</small>
              </div>
            </div>
            {overviewAcademicPerformance.levelRows.length === 0 ? <p className="rectoria-overview-empty-note">No hay niveles académicos configurados todavía.</p> : null}
            <div className="rectoria-overview-level-grid">
              {overviewAcademicPerformance.levelRows.map((level) => (
                <div className="rectoria-overview-level-card" key={level.key}>
                  <div className="rectoria-overview-level-card-head">
                    <div>
                      <span>{level.label}</span>
                      <small>{level.evaluatedStudentCount} estudiantes evaluados</small>
                    </div>
                    <div className={`rectoria-overview-level-score is-tone-${level.performanceMeta?.tone || 'neutral'}`}>
                      <strong>{level.averageScore === null ? '—' : formatAcademicScore(level.averageScore)}</strong>
                      <small>{level.performanceMeta?.label || 'Sin calificaciones'}</small>
                    </div>
                  </div>
                  <div className="rectoria-overview-mini-grid">
                    <div><span>En riesgo</span><strong>{level.atRiskCount}</strong></div>
                    <div><span>Cursos bajos</span><strong>{level.lowCoursesCount}</strong></div>
                    <div><span>Coordinadores</span><strong>{level.coordinatorCount}</strong></div>
                    <div><span>Grados</span><strong>{level.gradesCount || 0}</strong></div>
                  </div>
                  {level.lowestCourses.length > 0 ? (
                    <div className="rectoria-overview-attention-list">
                      {level.lowestCourses.map((course) => (
                        <p key={`${level.key}-${course.key || course.id || course.label}`}>
                          <strong>{course.displayLabel || formatRectoriaInstitutionalCourseLabel(course, institutionalCourseLabelContext)}</strong>
                          <span>Promedio {formatAcademicScore(course.averageScore)} · {course.atRiskCount} estudiantes bajo {passingScoreLabel}</span>
                        </p>
                      ))}
                    </div>
                  ) : <p className="rectoria-overview-empty-note">Sin cursos con calificaciones en este nivel.</p>}
                </div>
              ))}
            </div>

            <div className="rectoria-overview-academic-alerts">
              <article>
                <h4>Estudiantes con promedios bajos</h4>
                {overviewAcademicPerformance.atRiskStudents.length === 0 ? <p className="rectoria-overview-empty-note">No hay estudiantes bajo {passingScoreLabel} con calificaciones registradas.</p> : null}
                {overviewAcademicPerformance.atRiskStudents.slice(0, 6).map((student) => (
                  <p key={`${student.studentId || student.schoolCode || student.name}`}>
                    <strong>{student.name || 'Alumno'}</strong>
                    <span>{formatAcademicScore(student.finalScore)} · {student.courseLabel} · {student.teacherLabel}</span>
                  </p>
                ))}
              </article>
              <article>
                <h4>Cursos con promedios bajos</h4>
                {overviewAcademicPerformance.coursesNeedingAttention.length === 0 ? <p className="rectoria-overview-empty-note">No hay cursos por debajo del umbral de atención.</p> : null}
                {overviewAcademicPerformance.coursesNeedingAttention.slice(0, 6).map((course) => (
                  <p key={course.key}>
                    <strong>{course.displayLabel || course.label || course.subject || 'Curso'}</strong>
                    <span>Promedio {formatAcademicScore(course.averageScore)} · {course.atRiskCount} bajo {passingScoreLabel} · {teacherLabelById[course.teacherUserId] || 'Docente sin asignar'}</span>
                  </p>
                ))}
              </article>
              <article>
                <h4>Docentes a revisar</h4>
                {overviewAcademicPerformance.teacherAttentionRows.length === 0 ? <p className="rectoria-overview-empty-note">No hay suficientes calificaciones para priorizar docentes.</p> : null}
                {overviewAcademicPerformance.teacherAttentionRows.slice(0, 6).map((teacher) => (
                  <p key={teacher.key}>
                    <strong>{teacher.label}</strong>
                    <span>Promedio {formatAcademicScore(teacher.averageScore)} · {teacher.atRiskCount} estudiantes en riesgo · {teacher.coursesCount} cursos</span>
                  </p>
                ))}
              </article>
            </div>
          </article>

          <div className="rectoria-grid rectoria-grid--overview">
            <article className="panel rectoria-panel">
              <h3>Prioridades inmediatas</h3>
              <div className="rectoria-signal-grid rectoria-signal-grid--priority">
                <div>
                  <span>Alumnos sin curso</span>
                  <strong>{pendingCourseStudents.length}</strong>
                </div>
                <div>
                  <span>Observaciones convivencia</span>
                  <strong>{disciplineObservations.length}</strong>
                </div>
              </div>
            </article>
          </div>
        </div>
        )
      ) : null}

      {activeSection === 'communications' ? (
        <div className="rectoria-stack">
          <section className="panel rectoria-panel rectoria-communications-panel">
            <div className="rectoria-panel-heading">
              <div>
                <span className="rectoria-panel-kicker">Publicación institucional</span>
                <h3>Nuevo comunicado</h3>
                <p>Publica en el feed de familias con envío de push y correo a los acudientes seleccionados.</p>
              </div>
            </div>
            <form className="rectoria-communication-form" onSubmit={onSubmitInstitutionalCommunication}>
              <label>Título<input required value={institutionalCommunicationForm.title} onChange={(event) => setInstitutionalCommunicationForm((previous) => ({ ...previous, title: event.target.value }))} /></label>
              <label>Mensaje<textarea required value={institutionalCommunicationForm.body} onChange={(event) => setInstitutionalCommunicationForm((previous) => ({ ...previous, body: event.target.value }))} /></label>
              <div className="rectoria-communication-author-box">
                <div>
                  <h4>Autor del comunicado</h4>
                  <p>Agrega autores institucionales y selecciona quién firma esta publicación en la app de padres.</p>
                </div>
                <div className="rectoria-communication-form-grid">
                  <label>Autor<select value={selectedCommunicationAuthorId} onChange={(event) => setInstitutionalCommunicationForm((previous) => ({ ...previous, authorId: event.target.value }))}>{communicationAuthors.length ? communicationAuthors.map((author) => <option key={author._id} value={author._id}>{author.name}</option>) : <option value="">{portalAuthorName}</option>}</select></label>
                  <div className="rectoria-author-preview">
                    <span className="rectoria-author-avatar">{selectedCommunicationAuthor?.thumbUrl || selectedCommunicationAuthor?.photoUrl ? <img alt={selectedCommunicationAuthor.name} src={resolveApiAssetUrl(selectedCommunicationAuthor.thumbUrl || selectedCommunicationAuthor.photoUrl)} /> : String(selectedCommunicationAuthor?.name || portalAuthorName).slice(0, 2).toUpperCase()}</span>
                    <div><strong>{selectedCommunicationAuthor?.name || portalAuthorName}</strong><small>Así aparecerá en el feed del padre.</small></div>
                    {selectedCommunicationAuthor ? <button className="btn" onClick={() => onEditCommunicationAuthor(selectedCommunicationAuthor)} type="button">Editar autor</button> : null}
                    {canDeleteSelectedCommunicationAuthor ? <button className="btn" onClick={() => openDeleteCommunicationAuthorModal(selectedCommunicationAuthor)} type="button">Eliminar autor</button> : null}
                  </div>
                </div>
                <div className="rectoria-author-creator">
                  <div className="rectoria-author-preview">
                    <span className="rectoria-author-avatar">{communicationAuthorDraft.thumbUrl || communicationAuthorDraft.photoUrl ? <img alt={communicationAuthorDraft.name || 'Nuevo autor'} src={resolveApiAssetUrl(communicationAuthorDraft.thumbUrl || communicationAuthorDraft.photoUrl)} /> : '+'}</span>
                    <div><strong>{editingCommunicationAuthorId ? 'Editar autor' : 'Nuevo autor'}</strong><small>{editingCommunicationAuthorId ? 'Cambia nombre o foto de perfil.' : 'Nombre y foto de perfil.'}</small></div>
                  </div>
                  <label>Nombre<input value={communicationAuthorDraft.name} onChange={(event) => setCommunicationAuthorDraft((previous) => ({ ...previous, name: event.target.value }))} placeholder="Ej. Deportes" /></label>
                  <label>Foto de perfil<input accept="image/*" disabled={communicationAuthorDraft.uploading} onChange={onCommunicationAuthorPhotoSelected} type="file" /></label>
                  <button className="btn" disabled={busy || communicationAuthorDraft.uploading || !communicationAuthorDraft.name.trim() || (!editingCommunicationAuthorId && !communicationAuthorDraft.photoUrl)} onClick={onCreateCommunicationAuthor} type="button">{editingCommunicationAuthorId ? 'Guardar autor' : 'Agregar autor'}</button>
                  {editingCommunicationAuthorId ? <button className="btn" onClick={resetCommunicationAuthorDraft} type="button">Cancelar</button> : null}
                </div>
                {communicationAuthorDraft.error ? <p className="rectoria-form-error">{communicationAuthorDraft.error}</p> : null}
              </div>
              <div className="rectoria-communication-form-grid">
                <label>Audiencia<select value={institutionalCommunicationForm.audienceType} onChange={(event) => setInstitutionalCommunicationForm((previous) => ({ ...previous, audienceType: event.target.value, gradeTargets: [], courseTargets: [], parentTargets: [], studentTargets: [] }))}><option value="general">General</option><option value="grade">Por grado</option><option value="course">Por curso</option><option value="individual">Individual</option></select></label>
                {institutionalCommunicationForm.audienceType === 'grade' ? <label>Grados<select multiple value={institutionalCommunicationForm.gradeTargets} onChange={(event) => onInstitutionalCommunicationMultiSelect(event, 'gradeTargets', setInstitutionalCommunicationForm)}>{gradeOptions.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}</select></label> : null}
                {institutionalCommunicationForm.audienceType === 'course' ? <label>Cursos<select multiple value={institutionalCommunicationForm.courseTargets} onChange={(event) => onInstitutionalCommunicationMultiSelect(event, 'courseTargets', setInstitutionalCommunicationForm)}>{courseOptions.map((course) => <option key={course.value} value={course.value}>{course.label}</option>)}</select></label> : null}
              </div>
              {institutionalCommunicationForm.audienceType === 'individual' ? <div className="rectoria-communication-form-grid"><label>Acudientes<select multiple value={institutionalCommunicationForm.parentTargets} onChange={(event) => onInstitutionalCommunicationMultiSelect(event, 'parentTargets', setInstitutionalCommunicationForm)}>{parentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Alumnos<select multiple value={institutionalCommunicationForm.studentTargets} onChange={(event) => onInstitutionalCommunicationMultiSelect(event, 'studentTargets', setInstitutionalCommunicationForm)}>{billingStudentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div> : null}
              <div className="rectoria-communication-actions"><button className="btn btn-primary" disabled={busy} type="submit">Publicar comunicado</button></div>
            </form>
          </section>

          <section className="panel rectoria-panel rectoria-communications-panel">
            <div className="rectoria-panel-heading">
              <div>
                <span className="rectoria-panel-kicker">Solicitudes docentes</span>
                <h3>Aprobar comunicados</h3>
                <p>Revisa, ajusta y publica solicitudes enviadas por docentes.</p>
              </div>
              <strong className="rectoria-communication-count">{billingBootstrap.communicationRequestCounts?.pending || 0} pendientes</strong>
            </div>
            <div className="rectoria-approval-layout">
              <div className="rectoria-approval-list">
                {pendingCommunicationRequests.length === 0 ? <p className="rectoria-empty-state">No hay solicitudes docentes pendientes.</p> : pendingCommunicationRequests.map((request) => <button className={selectedCommunicationRequest?._id === request._id ? 'is-active' : ''} key={request._id} onClick={() => setSelectedCommunicationRequestId(request._id)} type="button"><strong>{request.title}</strong><span>{request.teacherName || 'Docente'} · {formatDateTime(request.submittedAt || request.createdAt)}</span><span>Curso: {formatCommunicationCourseTargets(request.courseTargets, request.courseTitle)}</span></button>)}
              </div>
              {!selectedCommunicationRequest ? <p className="rectoria-empty-state">Selecciona una solicitud para revisarla.</p> : <div className="rectoria-approval-editor"><div className="rectoria-communication-original"><h4>Original docente</h4><label>Título<input disabled readOnly value={selectedCommunicationRequest.originalTitle || selectedCommunicationRequest.title || ''} /></label><label>Mensaje<textarea disabled readOnly value={selectedCommunicationRequest.originalBody || selectedCommunicationRequest.body || ''} /></label><label>Curso solicitado por el docente<input disabled readOnly value={formatCommunicationCourseTargets(selectedCommunicationRequest.courseTargets, selectedCommunicationRequest.courseTitle)} /></label><div><h4>Adjuntos del docente</h4><RectoriaCommunicationMediaPreview items={selectedCommunicationRequest.media || []} /></div></div><form className="rectoria-communication-form" onSubmit={(event) => event.preventDefault()}><h4>Versión a publicar</h4><label>Título<input value={communicationApprovalDraft.title} onChange={(event) => setCommunicationApprovalDraft((previous) => ({ ...previous, title: event.target.value }))} /></label><label>Mensaje<textarea value={communicationApprovalDraft.body} onChange={(event) => setCommunicationApprovalDraft((previous) => ({ ...previous, body: event.target.value }))} /></label><div className="rectoria-communication-form-grid"><label>Audiencia<select value={communicationApprovalDraft.audienceType} onChange={(event) => setCommunicationApprovalDraft((previous) => ({ ...previous, audienceType: event.target.value, gradeTargets: [], courseTargets: [], parentTargets: [], studentTargets: [] }))}><option value="general">General</option><option value="grade">Por grado</option><option value="course">Por curso</option><option value="individual">Individual</option></select></label>{communicationApprovalDraft.audienceType === 'grade' ? <label>Grados<select multiple value={communicationApprovalDraft.gradeTargets} onChange={(event) => onInstitutionalCommunicationMultiSelect(event, 'gradeTargets', setCommunicationApprovalDraft)}>{gradeOptions.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}</select></label> : null}{communicationApprovalDraft.audienceType === 'course' ? <label>Cursos<select multiple value={communicationApprovalDraft.courseTargets} onChange={(event) => onInstitutionalCommunicationMultiSelect(event, 'courseTargets', setCommunicationApprovalDraft)}>{courseOptions.map((course) => <option key={course.value} value={course.value}>{course.label}</option>)}</select></label> : null}</div>{communicationApprovalDraft.audienceType === 'individual' ? <div className="rectoria-communication-form-grid"><label>Acudientes<select multiple value={communicationApprovalDraft.parentTargets} onChange={(event) => onInstitutionalCommunicationMultiSelect(event, 'parentTargets', setCommunicationApprovalDraft)}>{parentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Alumnos<select multiple value={communicationApprovalDraft.studentTargets} onChange={(event) => onInstitutionalCommunicationMultiSelect(event, 'studentTargets', setCommunicationApprovalDraft)}>{billingStudentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div> : null}<div><h4>Adjuntos a publicar</h4><RectoriaCommunicationMediaPreview items={communicationApprovalDraft.media || []} /></div><label>Notas de revisión<textarea value={communicationApprovalDraft.reviewNotes} onChange={(event) => setCommunicationApprovalDraft((previous) => ({ ...previous, reviewNotes: event.target.value }))} /></label><div className="rectoria-communication-actions"><button className="btn btn-primary" disabled={busy} onClick={onApproveCommunicationRequest} type="button">Aprobar y publicar</button><button className="btn" disabled={busy} onClick={onRejectCommunicationRequest} type="button">Rechazar</button></div></form></div>}
            </div>
          </section>

          <section className="panel rectoria-panel rectoria-communications-panel">
            <div className="rectoria-panel-heading">
              <div>
                <span className="rectoria-panel-kicker">Feed de familias</span>
                <h3>Comunicados académicos</h3>
                <p>Consulta las publicaciones enviadas a acudientes y modera comentarios cuando sea necesario.</p>
              </div>
            </div>
            <div className="rectoria-communications-list">
              {(billingBootstrap.communications || []).length === 0 ? <p className="rectoria-empty-state">Aún no hay comunicados enviados.</p> : (billingBootstrap.communications || []).map((item) => (
                <article className="rectoria-communication-card" key={item._id}>
                  <div>
                    <span>{item.authorName || 'Secretaría académica'} · {formatDateTime(item.sentAt || item.createdAt)}</span>
                    <h4>{item.title}</h4>
                    <p>{item.body}</p>
                  </div>
                  <div className="rectoria-communication-actions">
                    <button onClick={() => setCommunicationEngagementModal({ open: true, type: 'likes', item })} type="button">{item.likesCount || item.likes?.length || 0} likes</button>
                    <button onClick={() => setCommunicationEngagementModal({ open: true, type: 'comments', item })} type="button">{item.commentsCount || item.comments?.length || 0} comentarios</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeSection === 'team' ? (
        <div className="rectoria-stack rectoria-stack--team">
          <form className="panel rectoria-panel rectoria-form" onSubmit={onCreateUser}>
            <h3 className="rectoria-form-title">Crear nuevo integrante</h3>
            <div className="rectoria-form-row">
              <label className="rectoria-form-field rectoria-form-field--title">
                Titulo
                <select value={userForm.title} onChange={(event) => onUserFormChange('title', event.target.value)}>
                  <option value="Mr">Mr</option>
                  <option value="Ms">Ms</option>
                  <option value="Mrs">Mrs</option>
                  <option value="Dr">Dr</option>
                </select>
              </label>
              <label className="rectoria-form-field rectoria-form-field--name">
                Nombre
                <input value={userForm.name} onChange={(event) => onUserFormChange('name', event.target.value)} required />
              </label>
              <label className="rectoria-form-field rectoria-form-field--email">
                Correo
                <input
                  type="email"
                  autoComplete="email"
                  value={userForm.username}
                  onChange={(event) => onUserFormChange('username', event.target.value)}
                  required
                />
              </label>
              <label className="rectoria-form-field rectoria-form-field--phone">
                Teléfono
                <input value={userForm.phone} onChange={(event) => onUserFormChange('phone', event.target.value)} />
              </label>
              <label className="rectoria-form-field rectoria-form-field--password">
                Password
                <input value={userForm.password} onChange={(event) => onUserFormChange('password', event.target.value)} required />
              </label>
              <label className="rectoria-form-field rectoria-form-field--role">
                Rol
                <select value={userForm.role} onChange={(event) => onUserFormChange('role', event.target.value)}>
                  {visibleRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              {userForm.role === 'coordination' ? (
                <label className="rectoria-form-field rectoria-form-field--scope">
                  Alcance
                  {teamLevelOptions.length > 0 ? (
                    <select value={userForm.coordinationScope} onChange={(event) => onUserFormChange('coordinationScope', event.target.value)} required>
                      <option value="">Selecciona alcance</option>
                      {teamLevelOptions.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={userForm.coordinationScope} onChange={(event) => onUserFormChange('coordinationScope', event.target.value)} placeholder="Nivel educativo" required />
                  )}
                </label>
              ) : null}
              <button className="btn btn-primary rectoria-form-submit" type="submit" disabled={busy}>Crear usuario</button>
            </div>
          </form>

          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Cuerpo académico actual</h3>
                <p>Selecciona un rol para ver su equipo, métricas operativas y los flujos de asignación que lo sostienen.</p>
              </div>
            </div>

            {selectedTeamGroup ? (
              <div className="rectoria-team-role-surface">
                <div className="rectoria-team-role-header">
                  <div>
                    <h4>{selectedTeamGroup.label}</h4>
                    <p>{TEAM_ROLE_PANEL_COPY[selectedTeamGroup.value] || 'Consulta el detalle operativo de este rol institucional.'}</p>
                  </div>
                  <span className="rectoria-team-role-count">{selectedTeamGroup.users.length} integrantes</span>
                </div>

                <div className="rectoria-team-stat-grid">
                  {selectedTeamStatCards.map((card) => (
                    <article className="rectoria-team-stat-card" key={card.key}>
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                      <p>{card.helper}</p>
                    </article>
                  ))}
                </div>

                <div className="rectoria-user-list">
                  {selectedTeamGroup.users.length === 0 ? <p className="rectoria-role-empty">Todavía no hay integrantes asignados a este rol.</p> : null}
                  {selectedTeamGroup.users.map((item) => {
                    const teacherSummary = item.role === 'teacher' ? teacherTeachingSummaryById[String(item._id)] : null;
                    const teacherSubjectLabels = teacherSummary ? Array.from(teacherSummary.subjects.values()) : [];
                    const teacherCourseLabels = teacherSummary ? Array.from(teacherSummary.courses.values()) : [];
                    const teacherBaseSubjectLabels = Array.isArray(item.assignedSubjects) ? item.assignedSubjects.filter(Boolean) : [];
                    const teacherDisplaySubjectLabels = Array.from(new Map(
                      [...teacherBaseSubjectLabels, ...teacherSubjectLabels]
                        .map((subjectLabel) => String(subjectLabel || '').trim())
                        .filter(Boolean)
                        .map((subjectLabel) => [subjectLabel.toLowerCase(), subjectLabel])
                    ).values());
                    const teacherHeadroomCourseLabels = item.role === 'teacher' ? (headroomCourseLabelsByTeacherId[String(item._id)] || []) : [];

                    return (
                      <article className="rectoria-user-card" key={item._id}>
                        <div className="rectoria-user-card__body">
                          <header className="rectoria-user-card__header">
                            <div>
                              <strong>{item.name || item.username}</strong>
                              <span>{roleLabel(item.role)}</span>
                            </div>
                            <span className="rectoria-user-card__email">{item.username}</span>
                          </header>
                          {item.role === 'coordination' && item.coordinationScope ? (
                            <div className="rectoria-user-card__section">
                              <span>Alcance</span>
                              <p>{getLevelLabel(item.coordinationScope)}</p>
                            </div>
                          ) : null}
                          {item.role === 'teacher' ? (
                            <div className="rectoria-user-card__teaching-grid">
                              <div className="rectoria-user-card__section">
                                <span>Asignaturas</span>
                                <p>{teacherDisplaySubjectLabels.length ? teacherDisplaySubjectLabels.join(', ') : 'Sin asignaturas configuradas'}</p>
                              </div>
                              <div className="rectoria-user-card__section">
                                <span>Cursos donde dicta clase</span>
                                <div className="rectoria-user-card__chip-list">
                                  {teacherCourseLabels.length ? teacherCourseLabels.map((courseLabel) => (
                                    <span className="rectoria-user-card__chip" key={courseLabel}>{courseLabel}</span>
                                  )) : <p>Sin cursos configurados</p>}
                                </div>
                              </div>
                              <div className="rectoria-user-card__section rectoria-user-card__section--headroom">
                                <span>Headroom de</span>
                                <div className="rectoria-user-card__chip-list">
                                  {teacherHeadroomCourseLabels.length ? teacherHeadroomCourseLabels.map((courseLabel) => (
                                    <span className="rectoria-user-card__chip rectoria-user-card__chip--headroom" key={courseLabel}>{courseLabel}</span>
                                  )) : <p>No asignado como headroom</p>}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="rectoria-user-actions">
                          <button className="btn btn-primary" type="button" onClick={() => openEditUserModal(item)} disabled={busy}>
                            Editar
                          </button>
                          <button className="btn" type="button" onClick={() => onToggleUserStatus(item)} disabled={busy}>
                            {item.status === 'active' ? 'Inactivar' : 'Activar'}
                          </button>
                          <button className="btn btn-danger" type="button" onClick={() => onDeleteUser(item)} disabled={busy}>
                            Retirar
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {selectedTeamRole === 'coordination' ? (
                  <div className="rectoria-team-detail-grid">
                    <article className="rectoria-team-detail-card">
                      <div className="rectoria-section-header rectoria-section-header--compact">
                        <div>
                          <h4>Vinculacion de coordinadores por nivel educativo</h4>
                          <p>Revisa como queda distribuida la coordinacion institucional en cada nivel educativo.</p>
                        </div>
                      </div>

                      <div className="rectoria-team-level-grid">
                        {teamLevelOptions.map((level) => {
                          const levelSummary = educationalLevelSummaryByKey[level.key] || null;
                          const assignedCoordinators = coordinationUsersByLevelKey[level.key] || [];

                          return (
                            <article className="rectoria-team-level-card rectoria-team-level-card--coordination" key={level.key}>
                              <div className="rectoria-team-level-top">
                                <div className="rectoria-team-level-title-block">
                                  <span className="rectoria-team-level-eyebrow">Nivel educativo</span>
                                  <strong>{level.label}</strong>
                                </div>
                                <span className="rectoria-team-level-count-badge">{assignedCoordinators.length} coordinadores</span>
                              </div>

                              <p className="rectoria-team-level-summary">
                                {Number(levelSummary?.gradesCount || 0)} grados y {Number(levelSummary?.coursesCount || 0)} cursos listos para coordinacion.
                              </p>

                              <div className="rectoria-team-level-current">
                                <span className="rectoria-team-level-current-label">Asignados actualmente</span>
                                {assignedCoordinators.length > 0 ? (
                                  <div className="rectoria-team-badge-list">
                                    {assignedCoordinators.map((item) => (
                                      <span className="rectoria-team-badge" key={`${level.key}-${item._id}`}>{item.name || item.username}</span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="rectoria-team-level-empty">Aun no hay coordinadores vinculados a este nivel.</p>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </article>

                    <article className="rectoria-team-detail-card">
                      <div className="rectoria-section-header rectoria-section-header--compact">
                        <div>
                          <h4>KPI por nivel educativo</h4>
                          <p>Consulta cuántos grados, cursos y alumnos concentra cada nivel antes de asignar coordinacion.</p>
                        </div>
                      </div>

                      <div className="rectoria-team-level-kpi-grid">
                        {educationalLevelSummaries.map((level) => (
                          <article className="rectoria-team-level-kpi-card" key={level.key}>
                            <div className="rectoria-team-level-kpi-top">
                              <div className="rectoria-team-level-kpi-title-block">
                                <span className="rectoria-team-level-kpi-eyebrow">Nivel educativo</span>
                                <strong>{level.label}</strong>
                              </div>
                              <span className="rectoria-team-level-kpi-badge">
                                {level.coordinatorCount} coordinadores
                              </span>
                            </div>
                            <p className="rectoria-team-level-kpi-summary">
                              {level.gradesCount} grados y {level.coursesCount} cursos en este frente academico.
                            </p>
                            <div className="rectoria-team-level-kpi-list">
                              <div className="rectoria-team-level-kpi-metric">
                                <span>Grados</span>
                                <strong>{level.gradesCount}</strong>
                              </div>
                              <div className="rectoria-team-level-kpi-metric">
                                <span>Cursos</span>
                                <strong>{level.coursesCount}</strong>
                              </div>
                              <div className="rectoria-team-level-kpi-metric">
                                <span>Alumnos asignados</span>
                                <strong>{level.assignedStudents}</strong>
                              </div>
                              <div className="rectoria-team-level-kpi-metric">
                                <span>Pendientes por ubicar</span>
                                <strong>{level.pendingStudents}</strong>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </article>
                  </div>
                ) : null}

                {selectedTeamRole === 'teacher' ? (
                  <div className="rectoria-team-detail-grid">
                    <article className="rectoria-team-detail-card">
                      <div className="rectoria-section-header rectoria-section-header--compact">
                        <div>
                          <h4>Vinculación docente a asignaturas</h4>
                          <p>Selecciona el docente, una o más asignaturas y los grados que dictará en cada una.</p>
                        </div>
                      </div>

                      <div className="rectoria-team-link-form">
                        <label>
                          Docente
                          <select value={teamTeacherAssignment.teacherUserId} onChange={(event) => onTeamTeacherAssignmentChange('teacherUserId', event.target.value)}>
                            <option value="">Selecciona docente</option>
                            {teacherUsers.map((teacher) => (
                              <option key={teacher.value} value={teacher.value}>{teacher.label}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="rectoria-inline-help">Asignaturas</div>
                      <div className="rectoria-break-grade-picker">
                        {subjectOptionsForSchedule.length === 0 ? (
                          <p className="rectoria-role-empty">Primero crea asignaturas en Gestión académica.</p>
                        ) : subjectOptionsForSchedule.map((subject) => (
                          <button
                            key={`team-teacher-subject-${subject.value}`}
                            className={`rectoria-break-grade-chip${getTeamTeacherAssignmentSubjectKeys(teamTeacherAssignment).includes(subject.value) ? ' is-selected' : ''}`}
                            disabled={busy}
                            onClick={() => onToggleTeamTeacherAssignmentSubject(subject.value)}
                            type="button"
                          >
                            {subject.label}
                          </button>
                        ))}
                      </div>

                      <ClickableOptionPicker
                        label="Grados a cubrir"
                        options={gradeOptionsForSubjects}
                        selectedValues={teamTeacherAssignment.gradeKeys}
                        emptyLabel="Selecciona uno o más grados para esta vinculación."
                        onAdd={onToggleTeamTeacherAssignmentGrade}
                        onRemove={onToggleTeamTeacherAssignmentGrade}
                      />

                      <div className="rectoria-team-course-preview">
                        <strong>Cursos incluidos</strong>
                        {teamTeacherAssignmentCoursePreview.length > 0 ? (
                          <div className="rectoria-team-badge-list">
                            {teamTeacherAssignmentCoursePreview.map((course) => (
                              <span className="rectoria-team-badge" key={course.value}>{course.label}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="rectoria-option-list-empty">Al elegir grados, aquí aparecerán los cursos que el docente cubrirá dentro de cada uno.</p>
                        )}
                      </div>

                      {teamTeacherAssignment.teacherUserId ? (
                        <div className="rectoria-team-course-preview rectoria-team-teacher-current-load">
                          <strong>Materias actuales del docente</strong>
                          {selectedTeamTeacherSummary && Array.from(selectedTeamTeacherSummary.subjects.values()).length > 0 ? (
                            <>
                              <div className="rectoria-team-badge-list">
                                {Array.from(selectedTeamTeacherSummary.subjects.values()).map((subjectLabel) => (
                                  <span className="rectoria-team-badge" key={subjectLabel}>{subjectLabel}</span>
                                ))}
                              </div>
                              <p className="rectoria-option-list-empty">
                                Cursos: {Array.from(selectedTeamTeacherSummary.courses.values()).join(', ') || 'Sin cursos configurados'}
                              </p>
                            </>
                          ) : (
                            <p className="rectoria-option-list-empty">Este docente todavia no tiene asignaturas vinculadas.</p>
                          )}
                        </div>
                      ) : null}

                      <div className="rectoria-team-detail-actions">
                        <button className="btn btn-primary" type="button" onClick={onSaveTeamTeacherAssignment} disabled={busy}>
                          Guardar vinculación
                        </button>
                      </div>
                    </article>

                    <article className="rectoria-team-detail-card">
                      <div className="rectoria-section-header rectoria-section-header--compact">
                        <div>
                          <h4>Vinculaciones activas</h4>
                          <p>Revisa qué docente quedó asociado a cada asignatura y en qué grados ya tiene cobertura.</p>
                        </div>
                      </div>

                      <div className="rectoria-team-assignment-list">
                        {teamTeacherAssignment.teacherUserId ? (
                          <div className="rectoria-team-selected-teacher-summary">
                            <strong>{teacherLabelById[teamTeacherAssignment.teacherUserId] || 'Docente seleccionado'}</strong>
                            <span>
                              {selectedTeamTeacherSummary && Array.from(selectedTeamTeacherSummary.subjects.values()).length > 0
                                ? `Dicta: ${Array.from(selectedTeamTeacherSummary.subjects.values()).join(', ')}`
                                : 'Sin materias vinculadas todavia'}
                            </span>
                          </div>
                        ) : null}
                        {selectedTeamTeacherAssignmentRows.length === 0 ? (
                          <p className="rectoria-role-empty">Todavía no hay vinculaciones docentes registradas{teamTeacherAssignment.teacherUserId ? ' para este docente' : ''}.</p>
                        ) : selectedTeamTeacherAssignmentRows.map((assignment) => (
                          <article className="rectoria-team-assignment-card" key={assignment.key}>
                            <div>
                              <strong>{assignment.teacherLabel}</strong>
                              <p>{assignment.subjectLabel}</p>
                              <p>Grados: {assignment.gradeLabels.length ? assignment.gradeLabels.join(', ') : 'Sin grados'}</p>
                              <p>Cursos: {assignment.courseLabels.length ? assignment.courseLabels.join(', ') : 'Sin cursos configurados'}</p>
                            </div>
                            <div className="rectoria-user-actions">
                              <button className="btn btn-danger" type="button" onClick={() => onDeleteSubjectLoadTemplate(assignment.key)} disabled={busy}>
                                Retirar vínculo
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </article>

                    <article className="rectoria-team-detail-card rectoria-team-detail-card--wide">
                      <div className="rectoria-section-header rectoria-section-header--compact">
                        <div>
                          <h4>Headroom teacher</h4>
                          <p>Define el docente encargado del guidance routine de cada curso y su planilla de asistencia de la mañana.</p>
                        </div>
                      </div>

                      <div className="rectoria-team-link-form rectoria-team-link-form--three">
                        <label>
                          Docente
                          <select value={headroomTeacherAssignment.teacherUserId} onChange={(event) => onHeadroomTeacherAssignmentChange('teacherUserId', event.target.value)}>
                            <option value="">Selecciona docente</option>
                            {teacherUsers.map((teacher) => (
                              <option key={teacher.value} value={teacher.value}>{teacher.label}</option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Grado
                          <select value={headroomTeacherAssignment.gradeKey} onChange={(event) => onHeadroomTeacherAssignmentChange('gradeKey', event.target.value)}>
                            <option value="">Selecciona grado</option>
                            {gradeOptionsForSubjects.map((grade) => (
                              <option key={grade.value} value={grade.value}>{grade.label}</option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Curso
                          <select value={headroomTeacherAssignment.courseKey} onChange={(event) => onHeadroomTeacherAssignmentChange('courseKey', event.target.value)} disabled={!headroomTeacherAssignment.gradeKey}>
                            <option value="">Selecciona curso</option>
                            {selectedHeadroomCourseOptions.map((course) => (
                              <option key={course.value} value={course.value}>{course.label}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="rectoria-team-detail-actions">
                        <button className="btn btn-primary" type="button" onClick={onSaveHeadroomTeacherAssignment} disabled={busy}>
                          Guardar headroom teacher
                        </button>
                      </div>

                      <div className="rectoria-team-assignment-list">
                        {headroomAssignmentRows.length === 0 ? (
                          <p className="rectoria-role-empty">Todavía no hay headroom teachers configurados.</p>
                        ) : headroomAssignmentRows.map((assignment) => (
                          <article className="rectoria-team-assignment-card" key={assignment.value}>
                            <div>
                              <strong>{assignment.teacherLabel}</strong>
                              <p>{assignment.label}</p>
                              <p>Guidance routine y planilla de asistencia de la mañana.</p>
                            </div>
                            <div className="rectoria-user-actions">
                              <button className="btn btn-danger" type="button" onClick={() => onClearHeadroomTeacherAssignment(assignment.value)} disabled={busy}>
                                Retirar
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </article>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {activeSection === 'resources' ? (
        <div className="rectoria-stack">
          <div className="rectoria-kpis">
            <article className="rectoria-card">
              <span>Planners activos</span>
              <strong>{resourcePlannerCycles.length}</strong>
            </article>
            <article className="rectoria-card">
              <span>Planners por revisar</span>
              <strong>{resourcePlannerRequests.length}</strong>
            </article>
            <article className="rectoria-card">
              <span>Gestión de compras</span>
              <strong>{resourcePurchasingCount}</strong>
            </article>
            <article className="rectoria-card">
              <span>Pendientes aprobación</span>
              <strong>{resourceDashboard?.summary?.pendingApprovalCount ?? resourcePendingApprovalCount}</strong>
            </article>
            <article className="rectoria-card">
              <span>Stock bajo</span>
              <strong>{resourceDashboard?.summary?.lowStockCount ?? resourceLowStockItems.length}</strong>
            </article>
          </div>

          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Planner docente</h3>
                <p>Define los ciclos de planner que los docentes deben diligenciar con actividades y materiales requeridos.</p>
              </div>
            </div>

            <form className="rectoria-billing-form" onSubmit={onCreateResourcePlannerCycle}>
              <div className="rectoria-billing-grid rectoria-billing-grid--headline">
                <label>
                  Título
                  <input value={resourcePlannerCycleDraft.title} onChange={(event) => onResourcePlannerCycleChange('title', event.target.value)} placeholder="Planner semana cultural" />
                </label>
                <label>
                  Desde
                  <input type="date" value={resourcePlannerCycleDraft.startDate} onChange={(event) => onResourcePlannerCycleChange('startDate', event.target.value)} />
                </label>
                <label>
                  Hasta
                  <input type="date" value={resourcePlannerCycleDraft.endDate} onChange={(event) => onResourcePlannerCycleChange('endDate', event.target.value)} />
                </label>
                <label>
                  Fecha límite
                  <input type="date" value={resourcePlannerCycleDraft.submissionDeadline} onChange={(event) => onResourcePlannerCycleChange('submissionDeadline', event.target.value)} />
                </label>
              </div>
              <label>
                Indicaciones
                <textarea value={resourcePlannerCycleDraft.instructions} onChange={(event) => onResourcePlannerCycleChange('instructions', event.target.value)} />
              </label>
              <div className="rectoria-fee-actions">
                <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Guardando...' : 'Definir planner'}</button>
              </div>
            </form>

            <div className="rectoria-team-assignment-list">
              {resourcePlannerCycles.length === 0 ? <p className="rectoria-role-empty">No hay planners activos.</p> : resourcePlannerCycles.map((cycle) => (
                <article className="rectoria-team-assignment-card" key={cycle.id}>
                  <div>
                    <strong>{cycle.title}</strong>
                    <p>{formatResourceDate(cycle.startDate)} - {formatResourceDate(cycle.endDate)}</p>
                    <p>Límite: {formatResourceDate(cycle.submissionDeadline)}</p>
                    {cycle.instructions ? <p>{cycle.instructions}</p> : null}
                  </div>
                  <span className="rectoria-pill">{cycle.status || 'active'}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Planners recibidos de docentes</h3>
                <p>Revisa los planners pendientes y consolida sus materiales para enviarlos a gestión de compras.</p>
              </div>
              <button className="btn" type="button" onClick={() => loadPortal({ silent: true })} disabled={refreshing || busy}>Actualizar</button>
            </div>

            <div className="rectoria-team-assignment-list">
              {resourcePlannerRequests.length === 0 ? <p className="rectoria-role-empty">No hay planners docentes pendientes de consolidar.</p> : resourcePlannerRequests.map((request) => (
                <button className={`rectoria-team-assignment-card${selectedResourcePlannerRequestIds.includes(request.id) ? ' is-active' : ''}`} key={request.id} type="button" onClick={() => onToggleResourcePlannerRequest(request.id)}>
                  <div>
                    <strong>{request.requestedBy?.name || 'Docente'}</strong>
                    <p>{request.plannerCycle?.title || 'Planner'} · {request.requestedForArea || 'Sin área'}</p>
                    <p>{getResourceRequestItemsLabel(request)}</p>
                    {request.plannerActivities?.length ? <p>{request.plannerActivities.length} actividad(es) registradas</p> : null}
                  </div>
                  <span className="rectoria-pill">{selectedResourcePlannerRequestIds.includes(request.id) ? 'Seleccionado' : 'Seleccionar'}</span>
                </button>
              ))}
            </div>

            <label className="rectoria-form-field">
              Nota para compras
              <textarea value={resourcePlannerConsolidationNote} onChange={(event) => setResourcePlannerConsolidationNote(event.target.value)} />
            </label>
            <div className="rectoria-fee-actions">
              <button className="btn btn-primary" type="button" onClick={onConsolidateResourcePlannerRequests} disabled={busy || selectedResourcePlannerRequestIds.length === 0}>
                Enviar consolidado a compras
              </button>
            </div>
          </section>

          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Requerimientos y trazabilidad</h3>
                <p>Consulta solicitudes de materiales, estado de compras, aprobaciones y entregas registradas.</p>
              </div>
              <select value={resourceStatusFilter} onChange={(event) => setResourceStatusFilter(event.target.value)}>
                <option value="">Todos los estados</option>
                {Object.entries(HR_REQUEST_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            <div className="rectoria-student-table-wrap">
              <table className="rectoria-table">
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th>Solicitante</th>
                    <th>Área / planner</th>
                    <th>Requerimientos</th>
                    <th>Fecha</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResourceRequests.length === 0 ? (
                    <tr>
                      <td colSpan="6">No hay requerimientos registrados con este filtro.</td>
                    </tr>
                  ) : filteredResourceRequests.map((request) => (
                    <tr key={request.id}>
                      <td><span className="rectoria-pill">{HR_REQUEST_STATUS_LABELS[request.status] || request.status}</span></td>
                      <td>{request.requestedBy?.name || 'Usuario'}</td>
                      <td>
                        <strong>{request.requestedForArea || (request.consolidatedFromRequestIds?.length ? 'Consolidado de planners' : 'Sin área')}</strong>
                        {request.plannerCycle ? <div>{request.plannerCycle.title}</div> : null}
                        {request.purpose ? <div>{request.purpose}</div> : null}
                      </td>
                      <td>{getResourceRequestItemsLabel(request)}</td>
                      <td>{formatDateTime(request.updatedAt || request.createdAt)}</td>
                      <td>
                        {request.status === 'pending_approval' && !isCoordinationPortal ? (
                          <div className="rectoria-row-actions">
                            <button className="btn btn-primary" type="button" onClick={() => onApproveResourceRequest(request)} disabled={busy}>Aprobar</button>
                            <button className="btn btn-danger" type="button" onClick={() => onRejectResourceRequest(request)} disabled={busy}>Rechazar</button>
                          </div>
                        ) : <span className="rectoria-role-empty">Sin acción</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Inventario de materiales</h3>
                <p>Vista de materiales activos disponibles para planners y requerimientos institucionales.</p>
              </div>
            </div>

            <div className="rectoria-student-table-wrap">
              <table className="rectoria-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Categoría</th>
                    <th>Stock</th>
                    <th>Ubicación</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {resourceItems.length === 0 ? (
                    <tr>
                      <td colSpan="5">No hay materiales activos en inventario.</td>
                    </tr>
                  ) : resourceItems.slice(0, 80).map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong><div>{item.sku || 'Sin código'}</div></td>
                      <td>{item.category || 'other'}</td>
                      <td>{item.stock} {item.unit || 'unidad'} · min {item.minStock}</td>
                      <td>{item.location || '-'}</td>
                      <td><span className="rectoria-pill">{item.lowStock ? 'Stock bajo' : 'Disponible'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {activeSection === 'students' ? (
        <div className="rectoria-stack">
          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Gestión académica</h3>
                <p>Organiza esta área por bloques internos para trabajar estructura, asignaturas y horario semanal sin alargar toda la página.</p>
              </div>
            </div>
          </section>

          {activeAcademicManagementSection === 'assignments' ? (
            <AcademicAssignmentsPanel
              assignments={billingBootstrap.calendarAssignments}
              busy={busy}
              gradeOptions={academicDatabaseGradeOptions}
              onArchive={handleArchiveCalendarAssignment}
              onCreate={handleCreateCalendarAssignment}
              variant="rectoria"
            />
          ) : null}

          {activeAcademicManagementSection === 'content' ? (
            <section className="panel rectoria-panel">
              <div className="rectoria-section-header">
                <div>
                  <h3>Contenido académico</h3>
                  <p>Consulta los temas que cada docente va cargando por asignatura, curso y periodo académico.</p>
                </div>
              </div>

              <div className="rectoria-team-assignment-list">
                {(billingBootstrap.campusCourses || []).filter((course) => (course.academicContent || []).some((period) => (period.topics || []).length > 0)).length === 0 ? (
                  <p className="rectoria-role-empty">Todavía no hay temas cargados por docentes.</p>
                ) : (billingBootstrap.campusCourses || [])
                  .filter((course) => (course.academicContent || []).some((period) => (period.topics || []).length > 0))
                  .map((course) => (
                    <article className="rectoria-team-assignment-card" key={course.key}>
                      <div>
                        <strong>{course.label}</strong>
                        <p>{[course.subject, course.gradeKey, course.section].filter(Boolean).join(' · ')}</p>
                        {(course.academicContent || []).map((period) => (
                          <div className="rectoria-team-course-preview" key={`${course.key}-${period.periodKey}`}>
                            <strong>{period.periodName}</strong>
                            <p>{[period.startDate, period.endDate].filter(Boolean).join(' - ') || 'Sin fechas'}</p>
                            {(period.topics || []).length > 0 ? (
                              <div className="rectoria-team-badge-list">
                                {(period.topics || []).map((topic) => (
                                  <span className="rectoria-team-badge" key={topic.key}>{topic.title}</span>
                                ))}
                              </div>
                            ) : <p className="rectoria-option-list-empty">Sin temas para este periodo.</p>}
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          ) : null}

          {activeAcademicManagementSection === 'grades_courses' ? (
            <>
          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Alumnos pendientes por asignar un curso</h3>
              </div>
              <input
                className="rectoria-search"
                placeholder="Buscar por nombre, código o grado"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
              />
            </div>

            <div className="rectoria-student-table-wrap">
              <table className="rectoria-table">
                <thead>
                  <tr>
                    <th>Alumno</th>
                    <th>Código</th>
                    <th>Grado</th>
                    <th>Curso a asignar</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPendingStudents.map((student) => {
                    const draft = studentDrafts[String(student._id)] || { grade: student.grade || '', course: student.course || '' };
                    const studentGrade = resolveStructureGradeKeyForStudent(student.grade, academicStructureDraft.grades)
                      || normalizeAcademicGradeKey(student.grade);
                    const availableCourses = courseOptionsByGrade[studentGrade] || [];
                    return (
                      <tr key={student._id}>
                        <td>{student.name || 'Alumno'}</td>
                        <td>{student.schoolCode || '-'}</td>
                        <td>{configuredGradeLabels[studentGrade] || '-'}</td>
                        <td>
                          <select
                            className="rectoria-select"
                            value={draft.course || ''}
                            onChange={(event) => onStudentDraftChange(String(student._id), 'course', event.target.value)}
                          >
                            <option value="">Selecciona un curso</option>
                            {availableCourses.map((course) => (
                              <option key={course.value} value={course.value}>{course.label}</option>
                            ))}
                          </select>
                          {availableCourses.length === 0 ? <p className="rectoria-inline-help">Primero crea un curso para {studentGrade ? getGradeLabel(studentGrade) : 'el grado configurado'}.</p> : null}
                        </td>
                        <td>
                          <button className="btn btn-primary" type="button" onClick={() => onSaveStudentAssignment(String(student._id))} disabled={busy || !draft.course}>
                            Asignar curso
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPendingStudents.length === 0 ? (
                    <tr>
                      <td colSpan="5">Todos los alumnos con grado ya tienen curso asignado.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

            <section className="panel rectoria-panel">
              <div className="rectoria-section-header">
                <div>
                  <h3>Nivel educativo</h3>
                  <p>Crea los niveles educativos con los nombres propios del colegio y revisa los grados y cursos organizados dentro de cada uno.</p>
                </div>
              </div>

              <form className="rectoria-inline-form" onSubmit={onCreateEducationalLevel}>
                <input
                  value={newEducationalLevelName}
                  onChange={(event) => setNewEducationalLevelName(event.target.value)}
                  placeholder="Nuevo nivel educativo, por ejemplo Primaria"
                />
                <button className="btn btn-primary" type="submit" disabled={busy || !newEducationalLevelName.trim()}>
                  Crear nivel
                </button>
              </form>

              <div className="rectoria-grade-accordion-list">
                {groupedEducationalLevels.length === 0 ? <p className="rectoria-role-empty">Todavía no hay niveles educativos creados.</p> : groupedEducationalLevels.map((level) => {
                  const levelCoursesCount = level.grades.reduce((sum, grade) => sum + grade.courses.length, 0);

                  return (
                    <details className="rectoria-grade-accordion" key={level.key}>
                      <summary className="rectoria-grade-accordion-summary">
                        <div>
                          <strong>{level.label}</strong>
                          <span>{level.grades.length === 0 ? 'Sin grados creados' : level.grades.map((grade) => grade.label || grade.key).join(', ')}</span>
                          <p>{level.grades.length} grado(s) · {levelCoursesCount} curso(s)</p>
                        </div>
                        {level.key !== '__without_level__' ? (
                          <div className="rectoria-grade-accordion-actions">
                            <button
                              className="btn"
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openEditLevelModal(level.key, level.label);
                              }}
                              disabled={busy}
                            >
                              Modificar
                            </button>
                            <button
                              className="btn btn-danger"
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openDeleteLevelModal(level.key, level.label);
                              }}
                              disabled={busy}
                            >
                              Eliminar nivel
                            </button>
                          </div>
                        ) : null}
                      </summary>

                      <div className="rectoria-grade-accordion-body">
                        {level.key !== '__without_level__' ? (
                          <div className="rectoria-level-assign-row">
                            <select
                              value={levelGradeSelections[level.key] || ''}
                              onChange={(event) => onLevelGradeSelectionChange(level.key, event.target.value)}
                              disabled={busy || (assignableGradesByLevel[level.key] || []).length === 0}
                            >
                              <option value="">Agregar grado creado</option>
                              {(assignableGradesByLevel[level.key] || []).map((gradeOption) => (
                                <option key={gradeOption.value} value={gradeOption.value}>{gradeOption.label}</option>
                              ))}
                            </select>
                            <button
                              className="btn"
                              type="button"
                              onClick={() => onAssignExistingGradeToLevel(level.key)}
                              disabled={busy || !String(levelGradeSelections[level.key] || '').trim()}
                            >
                              Agregar grado
                            </button>
                          </div>
                        ) : null}
                        {level.key !== '__without_level__' && (assignableGradesByLevel[level.key] || []).length === 0 ? <p className="rectoria-inline-help">No hay otros grados creados disponibles para agregar a este nivel.</p> : null}
                        {level.grades.length === 0 ? <p className="rectoria-role-empty">Todavía no hay grados creados dentro de este nivel.</p> : (
                          <div className="rectoria-level-grade-list">
                            {level.grades.map((grade) => (
                              <article className="rectoria-grade-course-card" key={`${level.key}-${grade.key}`}>
                                <div>
                                  <strong>{grade.label || grade.key}</strong>
                                  <p>{grade.courses.length === 0 ? 'Sin cursos creados.' : grade.courses.map((course) => course.label || course.key).join(', ')}</p>
                                </div>
                                <span className="rectoria-level-grade-meta">{grade.courses.length} curso(s)</span>
                              </article>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>

            <section className="panel rectoria-panel">
              <div className="rectoria-section-header">
                <div>
                  <h3>Grados y cursos</h3>
                  <p>Define los grados institucionales y crea los cursos de cada uno dentro del nivel educativo correspondiente.</p>
                </div>
              </div>

              <form className="rectoria-inline-form" onSubmit={onCreateAcademicGrade}>
                <select value={selectedLevelKeyForGrade} onChange={(event) => setSelectedLevelKeyForGrade(event.target.value)}>
                  <option value="">Selecciona un nivel educativo</option>
                  {educationalLevelOptions.map((level) => (
                    <option key={level.value} value={level.value}>{level.label}</option>
                  ))}
                </select>
                <input
                  value={newGradeName}
                  onChange={(event) => setNewGradeName(event.target.value)}
                  placeholder="Nuevo grado, por ejemplo 6"
                />
                <button className="btn btn-primary" type="submit" disabled={busy || !newGradeName.trim() || !selectedLevelKeyForGrade}>
                  Crear grado
                </button>
              </form>
              {educationalLevelOptions.length === 0 ? <p className="rectoria-inline-help">Primero crea un nivel educativo para poder registrar grados.</p> : null}

              <div className="rectoria-grade-accordion-list">
                {academicStructureDraft.grades.length === 0 ? <p className="rectoria-role-empty">Todavía no hay grados creados.</p> : academicStructureDraft.grades.map((grade) => (
                  <details className="rectoria-grade-accordion" key={grade.key}>
                    <summary className="rectoria-grade-accordion-summary">
                      <div>
                        <strong>{grade.label || grade.key}</strong>
                        <small className="rectoria-grade-level-label">{configuredLevelLabels[grade.levelKey] || 'Sin nivel educativo'}</small>
                        <span>{grade.courses.length === 0 ? 'Sin cursos creados' : grade.courses.map((course) => course.label || course.key).join(', ')}</span>
                        <p>
                          {Number(assignedStudentCountsByGrade[grade.key] || 0)} alumno(s) asignados a cursos
                          {Number(pendingStudentCountsByGrade[grade.key] || 0) > 0 ? ` · ${Number(pendingStudentCountsByGrade[grade.key] || 0)} pendiente(s) sin curso` : ''}
                        </p>
                      </div>
                      <div className="rectoria-grade-accordion-actions">
                        <button
                          className="btn"
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            openEditGradeModal(grade.key, grade.label || grade.key);
                          }}
                          disabled={busy}
                        >
                          Modificar
                        </button>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            openDeleteGradeModal(grade.key);
                          }}
                          disabled={busy}
                        >
                          Eliminar grado
                        </button>
                      </div>
                    </summary>

                    <div className="rectoria-grade-accordion-body">
                      {grade.courses.length === 0 ? <p className="rectoria-role-empty">No hay cursos creados para este grado.</p> : (
                        <div className="rectoria-grade-course-list">
                          {grade.courses.map((course) => (
                            <article
                              className="rectoria-grade-course-card rectoria-grade-course-card--interactive"
                              key={course.key}
                              onClick={() => openCourseStudentsModal(grade.key, course.key)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  openCourseStudentsModal(grade.key, course.key);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div>
                                <strong>{course.label || course.key}</strong>
                                <p>{Number(studentCountsByCourse[course.key] || 0)} alumno(s) en este curso.</p>
                              </div>
                              <button
                                className="btn"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditCourseModal(grade.key, course.key, course.label || course.key);
                                }}
                                disabled={busy}
                              >
                                Modificar
                              </button>
                              <button
                                className="btn btn-danger"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openDeleteCourseModal(grade.key, course.key);
                                }}
                                disabled={busy}
                              >
                                Eliminar curso
                              </button>
                            </article>
                          ))}
                        </div>
                      )}

                      <div className="rectoria-inline-form rectoria-inline-form--tight rectoria-inline-form--grade-course">
                        <input
                          value={courseForms[grade.key] || ''}
                          onChange={(event) => onCourseFormChange(grade.key, event.target.value.toUpperCase())}
                          placeholder={`Curso para ${getGradeLabel(grade.key)}, ejemplo A`}
                        />
                        <button className="btn" type="button" onClick={() => onCreateAcademicCourse(grade.key)} disabled={busy || !String(courseForms[grade.key] || '').trim()}>
                          Crear curso
                        </button>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </section>
            </>
          ) : null}

          {activeAcademicManagementSection === 'subjects' && !isCoordinationPortal ? (
            <>
              <section className="panel rectoria-panel">
                <div className="rectoria-section-header">
                  <div>
                    <h3>Creación de asignatura</h3>
                    <p>Registra las asignaturas institucionales y clasifícalas como principales o secundarias.</p>
                  </div>
                </div>

                <form className="rectoria-inline-form" onSubmit={onCreateAcademicSubject}>
                  <input
                    value={newSubjectName}
                    onChange={(event) => setNewSubjectName(event.target.value)}
                    placeholder="Nombre de la asignatura, por ejemplo Matemáticas"
                  />
                  <select value={newSubjectKind} onChange={(event) => setNewSubjectKind(event.target.value)}>
                    <option value="principal">Asignatura principal</option>
                    <option value="secundaria">Asignatura secundaria</option>
                  </select>
                  <button className="btn btn-primary" type="submit" disabled={busy || !newSubjectName.trim()}>
                    Crear asignatura
                  </button>
                </form>

                <div className="rectoria-subject-list">
                  {academicStructureDraft.subjects.length === 0 ? <p className="rectoria-role-empty">Todavía no hay asignaturas creadas.</p> : academicStructureDraft.subjects.map((subject) => (
                    <article className="rectoria-grade-course-card" key={subject.key}>
                      <div>
                        <strong>{subject.label}</strong>
                        <p>{subject.kind === 'secundaria' ? 'Asignatura secundaria' : 'Asignatura principal'}</p>
                      </div>
                      <div className="rectoria-subject-actions">
                        <span className={`rectoria-subject-badge rectoria-subject-badge--${subject.kind}`}>
                          {subject.kind === 'secundaria' ? 'Secundaria' : 'Principal'}
                        </span>
                        <button className="btn" type="button" onClick={() => openEditSubjectModal(subject)} disabled={busy}>
                          Editar asignatura
                        </button>
                        <button className="btn btn-danger" type="button" onClick={() => openDeleteSubjectModal(subject.key, subject.label)} disabled={busy}>
                          Eliminar asignatura
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel rectoria-panel">
                <div className="rectoria-section-header">
                  <div>
                    <h3>Mapa de asignaturas</h3>
                    <p>Enlaza cada asignatura con los grados donde debe dictarse para construir el mapa académico real del colegio.</p>
                  </div>
                </div>

                <div className="rectoria-grade-accordion-list">
                  {academicStructureDraft.subjects.length === 0 ? <p className="rectoria-role-empty">Primero crea una asignatura para mapear sus grados.</p> : academicStructureDraft.subjects.map((subject) => {
                    const mappedGradeKeys = Array.isArray(subject.gradeKeys) ? subject.gradeKeys : [];
                    const draftGradeKeys = getSubjectGradeDraft(subject.key, mappedGradeKeys);
                    const hasDraftChanges = hasSubjectGradeDraftChanges(subject.key, mappedGradeKeys);
                    return (
                      <details
                        className="rectoria-grade-accordion"
                        key={`subject-map-${subject.key}`}
                        onToggle={(event) => {
                          if (event.currentTarget.open) {
                            onSubjectGradeDraftOpen(subject.key, mappedGradeKeys);
                          }
                        }}
                      >
                        <summary className="rectoria-grade-accordion-summary">
                          <div>
                            <strong>{subject.label}</strong>
                            <span>{mappedGradeKeys.length === 0 ? 'Sin grados enlazados' : mappedGradeKeys.map((gradeKey) => getGradeLabel(gradeKey)).join(', ')}</span>
                            <p>{subject.kind === 'secundaria' ? 'Asignatura secundaria' : 'Asignatura principal'} · {mappedGradeKeys.length} grado(s) enlazados</p>
                          </div>
                        </summary>

                        <div className="rectoria-grade-accordion-body rectoria-subject-map-body">
                          {gradeOptionsForSubjects.length === 0 ? (
                            <p className="rectoria-role-empty">Primero crea grados en la estructura académica para enlazarlos aquí.</p>
                          ) : (
                            <>
                              {subjectMapLevelOptions.length > 0 ? (
                                <>
                                  <div className="rectoria-inline-help">Niveles académicos</div>
                                  <div className="rectoria-break-grade-picker">
                                    {subjectMapLevelOptions.map((level) => (
                                      <button
                                        key={`subject-map-level-${subject.key}-${level.value}`}
                                        className={`rectoria-break-grade-chip${isSubjectLevelFullySelected(subject.key, level.value, mappedGradeKeys) ? ' is-selected' : ''}`}
                                        disabled={busy}
                                        onClick={() => onToggleSubjectLevelDraft(subject.key, level.value, mappedGradeKeys)}
                                        type="button"
                                      >
                                        {level.label} · {level.gradeCount}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              ) : null}

                              <div className="rectoria-inline-help">Grados</div>
                              <div className="rectoria-break-grade-picker">
                                {gradeOptionsForSubjects.map((gradeOption) => (
                                  <button
                                    key={`subject-map-grade-${subject.key}-${gradeOption.value}`}
                                    className={`rectoria-break-grade-chip${draftGradeKeys.includes(gradeOption.value) ? ' is-selected' : ''}`}
                                    disabled={busy}
                                    onClick={() => onToggleSubjectGradeDraft(subject.key, gradeOption.value, mappedGradeKeys)}
                                    type="button"
                                  >
                                    {gradeOption.label}
                                  </button>
                                ))}
                              </div>

                              <div className="rectoria-subject-map-actions">
                                <span className="rectoria-inline-help">
                                  {draftGradeKeys.length} grado(s) seleccionado(s){hasDraftChanges ? ' · cambios sin guardar' : ''}
                                </span>
                                <button
                                  className="btn btn-primary"
                                  disabled={busy || !hasDraftChanges}
                                  onClick={() => onSaveSubjectGradeDraft(subject.key, mappedGradeKeys)}
                                  type="button"
                                >
                                  Guardar mapa
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}

          {activeAcademicManagementSection === 'periods' && !isCoordinationPortal ? (
              <section className="panel rectoria-panel">
                <div className="rectoria-section-header">
                  <div>
                    <h3>Periodos y calificaciones</h3>
                    <p>Estos periodos salen de la configuración definida en la creación del colegio; debajo puedes ajustar la escala y las categorías de calificación.</p>
                  </div>
                  <div className="rectoria-fee-actions">
                    <input
                      value={academicStructureDraft.academicYear}
                      onChange={(event) => setAcademicStructureDraft((prev) => ({ ...prev, academicYear: event.target.value }))}
                      placeholder="Año académico"
                    />
                    <button className="btn" type="button" onClick={onAddAcademicPeriod}>Agregar periodo</button>
                    <button className="btn btn-primary" type="button" onClick={onSaveAcademicPeriods} disabled={busy}>Guardar periodos</button>
                  </div>
                </div>

                <p className="rectoria-inline-help">
                  Total configurado: {academicStructureDraft.academicPeriods.reduce((sum, period) => sum + Number(period.weight || 0), 0)}%
                </p>

                <div className="rectoria-period-list">
                  {academicStructureDraft.academicPeriods.map((period, index) => (
                    <div className="rectoria-period-row" key={period.key || `period-${index}`}>
                      <input
                        value={period.name}
                        onChange={(event) => onAcademicPeriodChange(index, 'name', event.target.value)}
                        placeholder="Nombre del periodo"
                      />
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={period.weight}
                        onChange={(event) => onAcademicPeriodChange(index, 'weight', event.target.value)}
                        placeholder="Peso %"
                      />
                      <input
                        type="date"
                        value={period.startDate || ''}
                        onChange={(event) => onAcademicPeriodChange(index, 'startDate', event.target.value)}
                      />
                      <input
                        type="date"
                        value={period.endDate || ''}
                        onChange={(event) => onAcademicPeriodChange(index, 'endDate', event.target.value)}
                      />
                      <button className="btn btn-danger" type="button" onClick={() => onRemoveAcademicPeriod(index)}>
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>

                <div className="rectoria-period-list rectoria-grading-scale-list">
                  <div className="rectoria-grading-levels-head">
                    <div>
                      <strong>Escala de calificaciones</strong>
                      <span>Selecciona el nivel educativo y define su escala individual.</span>
                    </div>
                    <label className="rectoria-grading-level-selector">
                      <span>Nivel educativo</span>
                      <select value={selectedAcademicGradingLevelKey} onChange={(event) => setSelectedAcademicGradingLevelKey(event.target.value)}>
                        {academicGradingLevelOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {academicGradingLevelOptions.length === 0 ? (
                    <p className="rectoria-role-empty">Primero crea niveles educativos para asignarles una escala de calificaciones.</p>
                  ) : (
                    <>
                      <div className="rectoria-period-row">
                        <label>
                          <span>Calificación mínima</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={selectedAcademicGradingScale.minScore ?? 0}
                            onChange={(event) => onAcademicGradingScaleChange('minScore', event.target.value)}
                          />
                        </label>
                        <label>
                          <span>Calificación máxima</span>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            step="0.1"
                            value={selectedAcademicGradingScale.maxScore ?? 100}
                            onChange={(event) => onAcademicGradingScaleChange('maxScore', event.target.value)}
                          />
                        </label>
                        <label>
                          <span>Calificación aprobatoria</span>
                          <input
                            type="number"
                            min={selectedAcademicGradingScale.minScore ?? 0}
                            max={selectedAcademicGradingScale.maxScore ?? 100}
                            step="0.1"
                            value={selectedAcademicGradingScale.passingScore ?? 70}
                            onChange={(event) => onAcademicGradingScaleChange('passingScore', event.target.value)}
                          />
                        </label>
                      </div>

                      <div className="rectoria-grading-levels-head">
                        <div>
                          <strong>Categorías de desempeño</strong>
                          <span>Define cómo se interpreta cada rango de calificaciones para este nivel.</span>
                        </div>
                        <div className="rectoria-fee-actions">
                          <button className="btn" type="button" onClick={onAddAcademicPerformanceLevel} disabled={busy || !selectedAcademicGradingLevelKey}>Agregar categoría</button>
                        </div>
                      </div>

                      {(selectedAcademicGradingScale.performanceLevels || []).length === 0 ? (
                        <p className="rectoria-role-empty">Todavía no hay categorías de desempeño configuradas para este nivel.</p>
                      ) : null}

                      {(selectedAcademicGradingScale.performanceLevels || []).map((level, index) => (
                        <div className="rectoria-grading-level-row" key={level.key || `performance-level-${index}`}>
                          <label>
                            <span>Categoría</span>
                            <input
                              value={level.label || ''}
                              onChange={(event) => onAcademicPerformanceLevelChange(index, 'label', event.target.value)}
                              placeholder="Ej. Excelente"
                            />
                          </label>
                          <label>
                            <span>Desde</span>
                            <input
                              type="number"
                              min={selectedAcademicGradingScale.minScore ?? 0}
                              max={selectedAcademicGradingScale.maxScore ?? 100}
                              step="0.1"
                              value={level.minScore ?? ''}
                              onChange={(event) => onAcademicPerformanceLevelChange(index, 'minScore', event.target.value)}
                            />
                          </label>
                          <label>
                            <span>Hasta</span>
                            <input
                              type="number"
                              min={selectedAcademicGradingScale.minScore ?? 0}
                              max={selectedAcademicGradingScale.maxScore ?? 100}
                              step="0.1"
                              value={level.maxScore ?? ''}
                              onChange={(event) => onAcademicPerformanceLevelChange(index, 'maxScore', event.target.value)}
                            />
                          </label>
                          <div className="rectoria-grading-color-cell">
                            <label>
                              <span>Color</span>
                              <span className="rectoria-grading-color-control">
                                <span className="rectoria-grading-color-swatch" style={{ background: level.color || '#174a68' }} aria-hidden="true" />
                                <input
                                  type="color"
                                  value={level.color || '#174a68'}
                                  onChange={(event) => onAcademicPerformanceLevelChange(index, 'color', event.target.value)}
                                  title="Color que verán los padres para este rango"
                                />
                              </span>
                            </label>
                            <button className="btn" type="button" onClick={onSaveAcademicPerformanceLevelColor} disabled={busy || !selectedAcademicGradingLevelKey}>
                              Guardar color
                            </button>
                          </div>
                          <button className="btn btn-danger" type="button" onClick={() => onRemoveAcademicPerformanceLevel(index)} disabled={busy}>Quitar</button>
                        </div>
                      ))}
                    </>
                  )}
                  <div className="rectoria-fee-actions">
                    <button className="btn btn-primary" type="button" onClick={onSaveAcademicPeriods} disabled={busy}>Guardar</button>
                  </div>
                </div>
              </section>
          ) : null}

          {activeAcademicManagementSection === 'schedule' && !isCoordinationPortal ? (
            <>
              <section className="panel rectoria-panel">
                <div className="rectoria-section-header">
                  <div>
                    <h3>Horario académico</h3>
                    <p>Configura primero la jornada, luego los breaks, después la disponibilidad de docencia y la carga académica compartida. Solo al final seleccionas el grado para armar o generar la malla.</p>
                  </div>
                </div>
                {gradeOptionsForSchedule.length === 0 ? <p className="rectoria-role-empty">Aún no hay grados creados, pero ya puedes dejar configuradas la jornada, los breaks, la disponibilidad docente y la carga compartida.</p> : null}
              </section>

                  <section className="panel rectoria-panel rectoria-schedule-config-hidden">
                    <div className="rectoria-section-header">
                      <div>
                        <h3>Breaks</h3>
                        <p>Configura descansos por bloque y agrega los grados que comparten ese break. Al guardarlo, el bloque queda reservado de inmediato en sus horarios.</p>
                      </div>
                    </div>

                    <form className="rectoria-inline-form rectoria-inline-form--breaks" onSubmit={onCreateScheduleBreak}>
                      <label>
                        Nombre del break
                        <input
                          value={newScheduleBreakLabel}
                          onChange={(event) => setNewScheduleBreakLabel(event.target.value)}
                          placeholder="Nombre opcional, por ejemplo Descanso mañana"
                        />
                      </label>
                      <label>
                        Horario inicio
                        <input
                          type="time"
                          step="900"
                          value={newScheduleBreakStartTime}
                          onChange={(event) => setNewScheduleBreakStartTime(event.target.value)}
                        />
                      </label>
                      <label>
                        Horario fin
                        <input
                          type="time"
                          step="900"
                          value={newScheduleBreakEndTime}
                          onChange={(event) => setNewScheduleBreakEndTime(event.target.value)}
                        />
                      </label>
                      <button className="btn btn-primary" type="submit" disabled={busy || newScheduleBreakGradeKeys.length === 0}>
                        Crear break
                      </button>
                    </form>

                    <div className="rectoria-inline-help">Días que utilizarán este break</div>
                    <div className="rectoria-break-grade-picker">
                      {ACADEMIC_SCHEDULE_WEEKDAYS.map((weekday) => (
                        <button
                          key={`new-break-weekday-${weekday.value}`}
                          className={`rectoria-break-grade-chip${newScheduleBreakWeekdays.includes(weekday.value) ? ' is-selected' : ''}`}
                          type="button"
                          onClick={() => onToggleNewScheduleBreakWeekday(weekday.value)}
                        >
                          {weekday.label}
                        </button>
                      ))}
                    </div>

                    <div className="rectoria-inline-help">Grados que utilizarán este break</div>
                    <div className="rectoria-break-grade-picker">
                      {allRegisteredGradeOptions.map((grade) => (
                        <button
                          key={`new-break-grade-${grade.value}`}
                          className={`rectoria-break-grade-chip${newScheduleBreakGradeKeys.includes(grade.value) ? ' is-selected' : ''}`}
                          type="button"
                          onClick={() => onToggleNewScheduleBreakGrade(grade.value)}
                        >
                          {grade.label}
                        </button>
                      ))}
                    </div>

                    <div className="rectoria-break-section-shell">
                      <div className="rectoria-schedule-summary-grid rectoria-break-summary-grid">
                        {scheduleBreakSummaryCards.map((card) => (
                          <article className="rectoria-schedule-summary-card rectoria-break-summary-card" key={card.key}>
                            <strong>{card.title}</strong>
                            <p>{card.description}</p>
                          </article>
                        ))}
                      </div>

                      <div className="rectoria-break-accordion-list rectoria-break-day-list">
                        {scheduleBreakDays.map((day) => (
                          <details className="rectoria-break-accordion rectoria-break-day-card" key={`break-day-${day.value}`} open={day.items.length > 0 ? undefined : false}>
                            <summary className="rectoria-break-accordion-summary rectoria-break-day-summary">
                              <div className="rectoria-break-accordion-copy">
                                <strong>{day.label}</strong>
                                <span>{day.countLabel}</span>
                                <p>{day.overview}</p>
                              </div>
                              <div className="rectoria-break-accordion-meta">
                                <span className="rectoria-break-accordion-badge">{day.items.reduce((total, item) => total + item.gradeKeys.length, 0)} grados</span>
                                <small>{day.items.length > 0 ? 'Ver horarios' : 'Sin detalle'}</small>
                              </div>
                            </summary>

                            <div className="rectoria-break-accordion-body rectoria-break-day-body">
                              {day.items.length === 0 ? (
                                <p className="rectoria-role-empty">No hay breaks configurados para este día.</p>
                              ) : (
                                <div className="rectoria-break-day-table" role="table" aria-label={`Breaks del ${day.label}`}>
                                  <div className="rectoria-break-day-table-head" role="rowgroup">
                                    <div className="rectoria-break-day-table-row rectoria-break-day-table-row--head" role="row">
                                      <span role="columnheader">Break</span>
                                      <span role="columnheader">Horario</span>
                                      <span role="columnheader">Grados</span>
                                      <span role="columnheader">Acciones</span>
                                    </div>
                                  </div>
                                  <div className="rectoria-break-day-table-body" role="rowgroup">
                                    {day.items.map((item) => (
                                      <div className="rectoria-break-day-table-row" role="row" key={item.key}>
                                        <div className="rectoria-break-day-table-cell" role="cell">
                                          <strong>{item.label}</strong>
                                        </div>
                                        <div className="rectoria-break-day-table-cell" role="cell">
                                          <span>{item.rangeLabel}</span>
                                        </div>
                                        <div className="rectoria-break-day-table-cell" role="cell">
                                          <div className="rectoria-subject-grade-chip-list rectoria-break-day-grade-list">
                                            {item.gradeKeys.map((gradeKey) => (
                                              <div className="rectoria-subject-grade-chip" key={`${item.key}-${gradeKey}`}>
                                                <span>{getGradeLabel(gradeKey)}</span>
                                                <button className="btn btn-danger" type="button" onClick={() => onRemoveGradeFromScheduleBreak(item.key, gradeKey)} disabled={busy}>
                                                  Quitar
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                        <div className="rectoria-break-day-table-cell" role="cell">
                                          <div className="rectoria-break-card-actions rectoria-break-day-actions">
                                            <select
                                              value={scheduleBreakGradeSelections[item.key] || ''}
                                              onChange={(event) => onScheduleBreakGradeSelectionChange(item.key, event.target.value)}
                                              disabled={busy || (assignableGradesByBreak[item.key] || []).length === 0}
                                            >
                                              <option value="">Agregar grado</option>
                                              {(assignableGradesByBreak[item.key] || []).map((grade) => (
                                                <option key={`${item.key}-${grade.value}`} value={grade.value}>{grade.label}</option>
                                              ))}
                                            </select>
                                            <button className="btn" type="button" onClick={() => onAddGradeToScheduleBreak(item.key)} disabled={busy || !String(scheduleBreakGradeSelections[item.key] || '').trim()}>
                                              Agregar grado
                                            </button>
                                            <button className="btn btn-danger" type="button" onClick={() => onDeleteScheduleBreak(item.key)} disabled={busy}>
                                              Eliminar break
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="panel rectoria-panel rectoria-schedule-config-hidden">
                    <div className="rectoria-section-header">
                      <div>
                        <h3>Disponibilidad de docencia</h3>
                        <p>Define barreras reales por docente y asignatura. Si un profesor solo puede de 8:00 a 12:00 o solo asiste un día, el generador respetará ese rango al ubicar clases.</p>
                      </div>
                      <div className="rectoria-fee-actions">
                        <button className="btn" type="button" onClick={onCreateNewTeachingAvailability} disabled={busy}>
                          Nueva disponibilidad
                        </button>
                        <button className="btn btn-primary" type="button" onClick={onSaveAcademicTeachingAvailability} disabled={busy}>
                          Guardar disponibilidad
                        </button>
                      </div>
                    </div>

                    <div className="rectoria-break-list">
                      {academicTeachingAvailability.length === 0 ? <p className="rectoria-role-empty">Todavía no hay disponibilidades docentes configuradas.</p> : academicTeachingAvailability.map((item) => (
                        <article className="rectoria-break-card" key={item.key}>
                          <div>
                            <strong>{item.key === selectedTeachingAvailabilityKey ? 'Disponibilidad en edición' : 'Disponibilidad guardada'}</strong>
                            <p>
                              {(subjectOptionsForSchedule.find((subject) => subject.value === item.subjectKey)?.label) || item.subjectKey} · {(teacherLabelById[item.teacherUserId] || 'Docente')} · {(item.gradeKeys || []).map((gradeKey) => configuredGradeLabels[gradeKey] || gradeKey).join(', ')}
                            </p>
                          </div>
                          <div className="rectoria-break-card-actions">
                            <button className="btn" type="button" onClick={() => onEditTeachingAvailability(item.key)} disabled={busy}>Editar</button>
                            <button className="btn btn-danger" type="button" onClick={() => onDeleteTeachingAvailability(item.key)} disabled={busy}>Eliminar</button>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="rectoria-schedule-day-card">
                      <div className="rectoria-section-header rectoria-section-header--compact">
                        <div>
                          <h4>{selectedTeachingAvailabilityKey !== NEW_TEACHING_AVAILABILITY_KEY ? 'Editar disponibilidad docente' : 'Nueva disponibilidad docente'}</h4>
                          <p>Selecciona docente, asignatura, grados y los días con la franja exacta permitida.</p>
                        </div>
                      </div>

                      <div className="rectoria-period-list">
                        <div className="rectoria-period-row rectoria-period-row--schedule-start">
                          <select value={teachingAvailabilityEditor.subjectKey || ''} onChange={(event) => onTeachingAvailabilityEditorChange('subjectKey', event.target.value)}>
                            <option value="">Selecciona asignatura</option>
                            {subjectOptionsForSchedule.map((subject) => (
                              <option key={`availability-subject-${subject.value}`} value={subject.value}>{subject.label}</option>
                            ))}
                          </select>
                          <select value={teachingAvailabilityEditor.teacherUserId || ''} onChange={(event) => onTeachingAvailabilityEditorChange('teacherUserId', event.target.value)}>
                            <option value="">Selecciona docente</option>
                            {(teachingAvailabilityEditor.subjectKey ? getTeacherOptionsForSubject(subjectOptionsForSchedule.find((subject) => subject.value === teachingAvailabilityEditor.subjectKey) || null) : teacherUsers).map((teacher) => (
                              <option key={`availability-teacher-${teacher.value}`} value={teacher.value}>{teacher.label}</option>
                            ))}
                          </select>
                        </div>
                        {(teachingAvailabilityEditor.windows || []).map((windowItem) => {
                          const weekdayLabel = ACADEMIC_SCHEDULE_WEEKDAYS.find((weekday) => weekday.value === windowItem.weekday)?.label || `Día ${windowItem.weekday}`;
                          return (
                            <div className="rectoria-period-row rectoria-period-row--schedule" key={`availability-window-${windowItem.weekday}`}>
                              <input value={weekdayLabel} readOnly />
                              <input type="time" value={windowItem.startTime || '07:00'} onChange={(event) => onTeachingAvailabilityWindowChange(windowItem.weekday, 'startTime', event.target.value)} />
                              <input type="time" value={windowItem.endTime || '12:00'} onChange={(event) => onTeachingAvailabilityWindowChange(windowItem.weekday, 'endTime', event.target.value)} />
                              <button className="btn btn-danger" type="button" onClick={() => onToggleTeachingAvailabilityWeekday(windowItem.weekday)} disabled={busy}>Quitar</button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="rectoria-inline-help">Días donde este docente sí puede dictar esta asignatura</div>
                      <div className="rectoria-break-grade-picker">
                        {ACADEMIC_SCHEDULE_WEEKDAYS.map((weekday) => (
                          <button
                            key={`availability-weekday-${weekday.value}`}
                            className={`rectoria-break-grade-chip${(teachingAvailabilityEditor.windows || []).some((windowItem) => windowItem.weekday === weekday.value) ? ' is-selected' : ''}`}
                            type="button"
                            onClick={() => onToggleTeachingAvailabilityWeekday(weekday.value)}
                          >
                            {weekday.label}
                          </button>
                        ))}
                      </div>

                      <div className="rectoria-inline-help">Grados donde aplica esta disponibilidad</div>
                      <div className="rectoria-break-grade-picker">
                        {gradeOptionsForSchedule.map((grade) => (
                          <button
                            key={`availability-grade-${grade.value}`}
                            className={`rectoria-break-grade-chip${(teachingAvailabilityEditor.gradeKeys || []).includes(grade.value) ? ' is-selected' : ''}`}
                            type="button"
                            onClick={() => onToggleTeachingAvailabilityGrade(grade.value)}
                          >
                            {grade.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="panel rectoria-panel rectoria-schedule-config-hidden">
                    <div className="rectoria-section-header">
                      <div>
                        <h3>Carga académica semanal</h3>
                        <p>Define cargas compartidas por asignatura para varios grados a la vez. Ejemplo: Matemáticas 5 horas y aplicarla a 6, 7 y 8.</p>
                      </div>
                      <div className="rectoria-fee-actions">
                        <button className="btn" type="button" onClick={onCreateNewSubjectLoadTemplate} disabled={busy}>Nueva carga</button>
                        <button className="btn btn-primary" type="button" onClick={onSaveAcademicSubjectLoadTemplates} disabled={busy}>Guardar carga</button>
                      </div>
                    </div>

                    <div className="rectoria-break-list">
                      {academicSubjectLoadTemplates.length === 0 ? <p className="rectoria-role-empty">Todavía no hay cargas académicas compartidas.</p> : academicSubjectLoadTemplates.map((item) => (
                        <article className="rectoria-break-card" key={item.key}>
                          <div>
                            <strong>{item.key === selectedSubjectLoadTemplateKey ? 'Carga en edición' : 'Carga guardada'}</strong>
                            <p>{(subjectOptionsForSchedule.find((subject) => subject.value === item.subjectKey)?.label) || item.subjectKey} · {Number(item.weeklyHours || 0)} hora(s) · {(teacherLabelById[item.teacherUserId] || 'Sin docente fijo')}</p>
                          </div>
                          <div className="rectoria-break-card-actions">
                            <button className="btn" type="button" onClick={() => onEditSubjectLoadTemplate(item.key)} disabled={busy}>Editar</button>
                            <button className="btn btn-danger" type="button" onClick={() => onDeleteSubjectLoadTemplate(item.key)} disabled={busy}>Eliminar</button>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="rectoria-schedule-day-card">
                      <div className="rectoria-section-header rectoria-section-header--compact">
                        <div>
                          <h4>{selectedSubjectLoadTemplateKey !== NEW_SUBJECT_LOAD_TEMPLATE_KEY ? 'Editar carga compartida' : 'Nueva carga compartida'}</h4>
                          <p>Asigna horas semanales y docente a una asignatura, luego marca los grados que compartirán esa misma carga.</p>
                        </div>
                      </div>

                      <div className="rectoria-period-list">
                        <div className="rectoria-period-row rectoria-period-row--schedule-start">
                          <select value={subjectLoadTemplateEditor.subjectKey || ''} onChange={(event) => onSubjectLoadTemplateEditorChange('subjectKey', event.target.value)}>
                            <option value="">Selecciona asignatura</option>
                            {subjectOptionsForSchedule.map((subject) => (
                              <option key={`subject-load-option-${subject.value}`} value={subject.value}>{subject.label}</option>
                            ))}
                          </select>
                          <input type="number" min="0" max="40" value={subjectLoadTemplateEditor.weeklyHours ?? 0} onChange={(event) => onSubjectLoadTemplateEditorChange('weeklyHours', event.target.value)} placeholder="Horas por semana" />
                          <select value={subjectLoadTemplateEditor.teacherUserId || ''} onChange={(event) => onSubjectLoadTemplateEditorChange('teacherUserId', event.target.value)}>
                            <option value="">Sin docente fijo</option>
                            {(subjectLoadTemplateEditor.subjectKey ? getTeacherOptionsForSubject(subjectOptionsForSchedule.find((subject) => subject.value === subjectLoadTemplateEditor.subjectKey) || null) : teacherUsers).map((teacher) => (
                              <option key={`subject-load-teacher-${teacher.value}`} value={teacher.value}>{teacher.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="rectoria-inline-help">Grados que compartirán esta carga semanal</div>
                      <div className="rectoria-break-grade-picker">
                        {gradeOptionsForSchedule.map((grade) => (
                          <button
                            key={`subject-load-grade-${grade.value}`}
                            className={`rectoria-break-grade-chip${(subjectLoadTemplateEditor.gradeKeys || []).includes(grade.value) ? ' is-selected' : ''}`}
                            type="button"
                            onClick={() => onToggleSubjectLoadTemplateGrade(grade.value)}
                          >
                            {grade.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="panel rectoria-panel rectoria-panel--school-schedule">
                    <div className="school-creation-step-grid rectoria-schedule-wizard-surface">
                      <div className="rectoria-schedule-jornada-setup">
                        <div className="rectoria-section-header rectoria-section-header--compact">
                          <div>
                            <h3>{selectedScheduleGroupKey === NEW_SCHEDULE_GROUP_KEY ? 'Nueva jornada' : 'Editar jornada'}</h3>
                            <p>Agrega jornadas por días y grados. Cada jornada guardada queda abajo como card desplegable para modificarla cuando necesites.</p>
                          </div>
                          <div className="rectoria-fee-actions">
                            <button className="btn" type="button" onClick={onCreateNewScheduleGroup} disabled={busy}>
                              Nueva jornada
                            </button>
                            <button className="btn btn-primary" type="button" onClick={onSaveAcademicScheduleSettings} disabled={busy}>
                              Guardar jornada
                            </button>
                          </div>
                        </div>

                        <div className="rectoria-period-row rectoria-period-row--schedule-range">
                          <label>
                            Nombre de la jornada
                            <input
                              type="text"
                              value={scheduleGroupEditor.name || ''}
                              onChange={(event) => onScheduleGroupEditorChange('name', event.target.value)}
                              placeholder="Ej: Jornada mañana"
                            />
                          </label>
                          <label>
                            Hora de inicio
                            <input
                              type="time"
                              step="900"
                              value={scheduleGroupEditor.dayStartTime || '07:00'}
                              onChange={(event) => onScheduleGroupEditorChange('dayStartTime', event.target.value)}
                            />
                          </label>
                          <label>
                            Hora de fin
                            <input
                              type="time"
                              step="900"
                              value={scheduleGroupEditor.dayEndTime || '15:00'}
                              onChange={(event) => onScheduleGroupEditorChange('dayEndTime', event.target.value)}
                            />
                          </label>
                        </div>

                        <div className="rectoria-inline-help">Días de la jornada</div>
                        <div className="rectoria-break-grade-picker">
                          {ACADEMIC_SCHEDULE_WEEKDAYS.map((weekday) => (
                            <button
                              key={`visible-schedule-group-weekday-${weekday.value}`}
                              className={`rectoria-break-grade-chip${(scheduleGroupEditor.weekdays || []).includes(weekday.value) ? ' is-selected' : ''}`}
                              type="button"
                              onClick={() => onToggleScheduleGroupWeekday(weekday.value)}
                            >
                              {weekday.label}
                            </button>
                          ))}
                        </div>

                        <div className="rectoria-inline-help">Grados que usarán esta jornada</div>
                        <div className="rectoria-break-grade-picker">
                          {allRegisteredGradeOptions.map((grade) => (
                            <button
                              key={`visible-schedule-group-grade-${grade.value}`}
                              className={`rectoria-break-grade-chip${(scheduleGroupEditor.gradeKeys || []).includes(grade.value) ? ' is-selected' : ''}`}
                              type="button"
                              onClick={() => onToggleScheduleGroupGrade(grade.value)}
                            >
                              {grade.label}
                            </button>
                          ))}
                        </div>

                        <div className="rectoria-schedule-jornada-card-list">
                          {academicScheduleGroups.length === 0 ? (
                            <p className="rectoria-role-empty">No hay jornadas guardadas todavía.</p>
                          ) : academicScheduleGroups.map((group) => {
                            const weekdayLabels = (group.weekdays || [])
                              .map((weekdayValue) => ACADEMIC_SCHEDULE_WEEKDAYS.find((weekday) => weekday.value === weekdayValue)?.label || `Día ${weekdayValue}`);
                            const gradeLabels = (group.gradeKeys || [])
                              .map((gradeKey) => configuredGradeLabels[gradeKey] || gradeKey);
                            return (
                              <details className="rectoria-schedule-jornada-card" key={`visible-schedule-group-card-${group.key}`}>
                                <summary>
                                  <div>
                                    <strong>{group.name || 'Jornada sin nombre'}</strong>
                                    <span>{`${weekdayLabels.join(', ') || 'Sin días'} · ${gradeLabels.join(', ') || 'Sin grados'} · ${group.dayStartTime} - ${getAcademicScheduleGroupEndTime(group)}`}</span>
                                  </div>
                                  <button className="btn" type="button" onClick={(event) => { event.preventDefault(); onEditScheduleGroup(group.key); }} disabled={busy}>
                                    Editar
                                  </button>
                                </summary>
                                <div className="rectoria-schedule-jornada-card-body">
                                  <div className="rectoria-break-grade-picker">
                                    {weekdayLabels.map((label) => <span className="rectoria-break-grade-chip is-selected" key={`${group.key}-day-${label}`}>{label}</span>)}
                                  </div>
                                  <div className="rectoria-break-grade-picker">
                                    {gradeLabels.map((label) => <span className="rectoria-break-grade-chip is-selected" key={`${group.key}-grade-${label}`}>{label}</span>)}
                                  </div>
                                  <div className="rectoria-fee-actions">
                                    <button className="btn" type="button" onClick={() => onEditScheduleGroup(group.key)} disabled={busy}>Cargar en formulario</button>
                                    <button className="btn btn-danger" type="button" onClick={() => onDeleteScheduleGroup(group.key)} disabled={busy}>Eliminar jornada</button>
                                  </div>
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </div>

                      <div className="school-creation-level-box rectoria-schedule-builder-shell">
                        <div className="school-creation-calendar-toolbar">
                          <label>
                            Curso
                            <select
                              value={selectedScheduleCourseOptionValue}
                              onChange={(event) => {
                                const selectedCourse = courseOptionsForSchedule.find((course) => course.value === event.target.value);
                                setSelectedScheduleGradeKey(selectedCourse?.gradeKey || '');
                                setSelectedScheduleCourseKey(selectedCourse?.courseKey || '');
                              }}
                            >
                              <option value="">Selecciona un curso</option>
                              {courseOptionsForSchedule.map((course) => (
                                <option key={course.value} value={course.value}>{course.label}</option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="school-creation-calendar-subjects">
                          {scheduleBlockChips.map((block) => (
                            <button
                              key={`schedule-drag-block-${block.key}`}
                              className={`school-creation-chip tiny rectoria-schedule-block-chip${draggedScheduleBlockKey === block.key ? ' is-active' : ''}`}
                              draggable
                              onDragEnd={onScheduleSubjectDragEnd}
                              onDragStart={(event) => onScheduleBlockDragStart(event, block.key)}
                              type="button"
                            >
                              {block.label}
                            </button>
                          ))}
                          <button
                            className={`school-creation-chip tiny rectoria-schedule-block-chip${showCustomScheduleBlockForm ? ' is-active' : ''}`}
                            onClick={() => setShowCustomScheduleBlockForm((previous) => !previous)}
                            type="button"
                          >
                            Otro
                          </button>
                          {showCustomScheduleBlockForm ? (
                            <form className="rectoria-schedule-other-form" onSubmit={onAddCustomScheduleBlock}>
                              <input
                                aria-label="Nombre del bloque personalizado"
                                value={customScheduleBlockName}
                                onChange={(event) => setCustomScheduleBlockName(event.target.value)}
                                placeholder="Nombre del bloque"
                              />
                              <button className="btn btn-primary" type="submit">Agregar</button>
                            </form>
                          ) : null}
                          {selectedScheduleSubjects.map((subject) => (
                            <button
                              key={`schedule-drag-subject-${subject.key}`}
                              className={`school-creation-chip tiny${draggedScheduleSubjectKey === subject.key ? ' is-active' : ''}`}
                              draggable
                              onDragEnd={onScheduleSubjectDragEnd}
                              onDragStart={(event) => onScheduleSubjectDragStart(event, subject.key)}
                              type="button"
                            >
                              {subject.label}
                            </button>
                          ))}
                          {selectedScheduleGradeKey && selectedScheduleSubjects.length === 0 ? (
                            <span className="rectoria-schedule-empty-subjects">Sin asignaturas enlazadas</span>
                          ) : null}
                        </div>

                        <div className="school-creation-calendar-board-wrap rectoria-schedule-calendar-board-wrap">
                          <div className="school-creation-calendar-times">
                            <div className="school-creation-calendar-time-header" />
                            {selectedScheduleBoardRows.map((row) => (
                              <div
                                className={`school-creation-calendar-time-row${row.isHour ? ' is-hour' : ''}${row.isHalfHour ? ' is-half-hour' : ''}`}
                                key={`schedule-time-${row.minute}`}
                                style={{ height: `${selectedScheduleBoardRowHeight}px` }}
                              >
                                <span>{row.label}</span>
                              </div>
                            ))}
                          </div>

                          <div className="school-creation-calendar-board" style={{ gridTemplateColumns: `repeat(${selectedScheduleBoardDays.length}, minmax(150px, 1fr))` }}>
                            {selectedScheduleBoardDays.map((weekday) => (
                              <div className="school-creation-calendar-day-column" key={`schedule-board-day-${weekday.value}`}>
                                <div className="school-creation-calendar-day-header">{weekday.label}</div>
                                <div className="school-creation-calendar-day-grid" style={{ height: selectedScheduleBoardHeight }}>
                                  {selectedScheduleBoardRows.map((row) => (
                                    <div
                                      className={`school-creation-calendar-cell${row.isHour ? ' is-hour' : ''}${row.isHalfHour ? ' is-half-hour' : ''}`}
                                      key={`schedule-cell-${weekday.value}-${row.minute}`}
                                      style={{ height: `${selectedScheduleBoardRowHeight}px` }}
                                    />
                                  ))}

                                  {(selectedScheduleConfiguredBlocksByWeekday[weekday.value] || []).map((slot) => {
                                    const slotKey = normalizeAcademicScheduleSlotKey(slot.weekday, slot.block);
                                    const startMinutes = academicScheduleTimeToMinutes(slot.startTime) ?? selectedScheduleBoardWindow.start;
                                    const endMinutes = academicScheduleTimeToMinutes(slot.endTime) ?? (startMinutes + 60);
                                    const top = ((startMinutes - selectedScheduleBoardWindow.start) / 15) * selectedScheduleBoardRowHeight;
                                    const height = Math.max(selectedScheduleBoardRowHeight, ((endMinutes - startMinutes) / 15) * selectedScheduleBoardRowHeight);

                                    return (
                                      <div
                                        className="rectoria-schedule-enabled-slot"
                                        key={`schedule-enabled-slot-${slotKey}`}
                                        style={{ top, height }}
                                      />
                                    );
                                  })}

                                  {selectedScheduleHasConfiguredJornada ? (selectedScheduleConfiguredBlocksByWeekday[weekday.value] || [])
                                    .filter((slot) => !(selectedScheduleBoardEntriesByWeekday[weekday.value] || []).some((entry) => String(entry.key) === String(normalizeAcademicScheduleSlotKey(slot.weekday, slot.block))))
                                    .map((slot) => {
                                      const slotKey = normalizeAcademicScheduleSlotKey(slot.weekday, slot.block);
                                      const startMinutes = academicScheduleTimeToMinutes(slot.startTime) ?? selectedScheduleBoardWindow.start;
                                      const endMinutes = academicScheduleTimeToMinutes(slot.endTime) ?? (startMinutes + 60);
                                      const top = ((startMinutes - selectedScheduleBoardWindow.start) / 15) * selectedScheduleBoardRowHeight;
                                      const height = Math.max(selectedScheduleBoardRowHeight, ((endMinutes - startMinutes) / 15) * selectedScheduleBoardRowHeight);

                                      return (
                                        <div
                                          className="rectoria-schedule-empty-slot"
                                          key={`schedule-empty-slot-${slotKey}`}
                                          onDoubleClick={() => openScheduleSlotModal(slotKey)}
                                          onDragOver={(event) => { event.preventDefault(); setScheduleDropPreview({ slotKey, top, height: selectedScheduleBoardRowHeight }); }}
                                          onDragLeave={() => setScheduleDropPreview((previous) => (previous?.slotKey === slotKey ? null : previous))}
                                          onDrop={(event) => onScheduleSlotDrop(event, slotKey)}
                                          style={{ top, height }}
                                        />
                                      );
                                    }) : null}

                                  {scheduleDropPreview?.slotKey?.startsWith(`d${weekday.value}_`) ? (
                                    <div
                                      className="rectoria-schedule-drop-preview"
                                      style={{ top: scheduleDropPreview.top, height: scheduleDropPreview.height }}
                                    />
                                  ) : null}

                                {(selectedScheduleBoardEntriesByWeekday[weekday.value] || []).map((entry) => {
                                  const slotKey = normalizeAcademicScheduleSlotKey(entry.weekday, entry.block);
                                  const startMinutes = academicScheduleTimeToMinutes(entry.startTime) ?? selectedScheduleBoardWindow.start;
                                  const endMinutes = academicScheduleTimeToMinutes(entry.endTime) ?? (startMinutes + 60);
                                  const top = ((startMinutes - selectedScheduleBoardWindow.start) / 15) * selectedScheduleBoardRowHeight;
                                  const height = Math.max(selectedScheduleBoardRowHeight, ((endMinutes - startMinutes) / 15) * selectedScheduleBoardRowHeight);
                                  const subject = selectedScheduleSubjects.find((item) => item.key === entry.subjectKey);
                                  const resolvedTeacherUserId = String(entry.teacherUserId || selectedScheduleTeacherBySubjectKey[entry.subjectKey] || '').trim();
                                  const teacherLabel = resolvedTeacherUserId ? (teacherLabelById[resolvedTeacherUserId] || 'Docente asignado') : 'Sin docente fijo';

                                  if (entry.entryType === 'break') {
                                    const breakBlock = scheduleBlockByKey[String(entry.breakKey || '').trim()];
                                    const breakDisplayLabel = String(entry.breakLabel || breakBlock?.label || 'Break').trim();
                                    const normalizedBreakLabel = breakDisplayLabel.toLowerCase();
                                    const shouldShowBreakTime = height >= selectedScheduleBoardRowHeight * 2;
                                    const breakClassName = breakBlock?.className
                                      || (normalizedBreakLabel.includes('guidance')
                                        ? 'school-creation-calendar-break school-creation-calendar-break--guidance'
                                        : normalizedBreakLabel.includes('control')
                                          ? 'school-creation-calendar-break school-creation-calendar-break--control'
                                          : normalizedBreakLabel && normalizedBreakLabel !== 'break'
                                            ? 'school-creation-calendar-break school-creation-calendar-break--other'
                                            : 'school-creation-calendar-break');
                                    return (
                                      <div
                                        className={`${breakClassName}${selectedScheduleSlotKey === slotKey ? ' is-selected' : ''}`}
                                        key={`schedule-break-${slotKey}`}
                                        draggable
                                        onClick={() => setSelectedScheduleSlotKey(slotKey)}
                                        onDoubleClick={() => openScheduleSlotModal(slotKey, entry)}
                                        onDragEnd={onScheduleSubjectDragEnd}
                                        onDragStart={(event) => onScheduleEntryDragStart(event, slotKey)}
                                        onDragOver={(event) => event.preventDefault()}
                                        onDrop={(event) => onScheduleSlotDrop(event, slotKey)}
                                        style={{ top, height }}
                                      >
                                        <button className="rectoria-schedule-resize-handle rectoria-schedule-resize-handle--top" onPointerDown={(event) => onScheduleResizePointerDown(event, slotKey, 'top')} type="button" />
                                        <span>{breakDisplayLabel}</span>
                                        {shouldShowBreakTime ? <small>{`${entry.startTime} - ${entry.endTime}`}</small> : null}
                                        <button
                                          aria-label="Quitar bloque"
                                          className="school-creation-planner-entry-remove"
                                          onClick={() => onRemoveScheduleSlot(selectedScheduleGradeKey, slotKey)}
                                          type="button"
                                        >
                                          x
                                        </button>
                                        <button className="rectoria-schedule-resize-handle rectoria-schedule-resize-handle--bottom" onPointerDown={(event) => onScheduleResizePointerDown(event, slotKey, 'bottom')} type="button" />
                                      </div>
                                    );
                                  }

                                  return (
                                    <div
                                      className={`${subject ? 'school-creation-calendar-subject-slot school-creation-schedule-preview-slot' : 'school-creation-calendar-class-space school-creation-schedule-preview-slot'}${selectedScheduleSlotKey === slotKey ? ' is-selected' : ''}`}
                                      key={`schedule-slot-${slotKey}`}
                                      onClick={() => setSelectedScheduleSlotKey(slotKey)}
                                      onDoubleClick={() => openScheduleSlotModal(slotKey, entry)}
                                      onDragOver={(event) => event.preventDefault()}
                                      onDrop={(event) => onScheduleSlotDrop(event, slotKey)}
                                      style={{ top, height }}
                                    >
                                      <button className="rectoria-schedule-resize-handle rectoria-schedule-resize-handle--top" onPointerDown={(event) => onScheduleResizePointerDown(event, slotKey, 'top')} type="button" />
                                      <div
                                        className="school-creation-calendar-subject-slot-head school-creation-calendar-subject-slot-head--draggable"
                                        draggable
                                        onDragEnd={onScheduleSubjectDragEnd}
                                        onDragStart={(event) => onScheduleEntryDragStart(event, slotKey)}
                                      >
                                        <strong>{subject?.label || 'Arrastra una materia'}</strong>
                                        <button
                                          aria-label="Quitar asignatura"
                                          className="school-creation-planner-entry-remove"
                                          onClick={() => onRemoveScheduleSlot(selectedScheduleGradeKey, slotKey)}
                                          type="button"
                                        >
                                          x
                                        </button>
                                      </div>
                                      <small>{`${entry.startTime} - ${entry.endTime}`}</small>
                                      <small>{teacherLabel}</small>
                                      <button className="rectoria-schedule-resize-handle rectoria-schedule-resize-handle--bottom" onPointerDown={(event) => onScheduleResizePointerDown(event, slotKey, 'bottom')} type="button" />
                                    </div>
                                  );
                                })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rectoria-schedule-save-bar">
                          <span>{`${selectedGradeSchedule.weeklySchedule.filter((entry) => entry.entryType === 'break' || entry.subjectKey).length} bloques en este horario`}</span>
                          <button
                            className="btn btn-primary"
                            disabled={busy || !selectedScheduleGradeKey || !selectedScheduleCourseKey}
                            onClick={onSaveAcademicWeeklySchedule}
                            type="button"
                          >
                            Guardar horario
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                  {scheduleSlotModal.open ? (
                    <div className="rectoria-modal-overlay" role="presentation">
                      <form className="rectoria-modal-card rectoria-modal-form" onSubmit={onSaveScheduleSlotModal}>
                        <div className="rectoria-modal-head">
                          <div>
                            <span className="rectoria-modal-eyebrow">Horario semanal</span>
                            <h3>{scheduleSlotModal.mode === 'edit' ? 'Editar bloque' : 'Agregar bloque'}</h3>
                            <p>Define el tipo, horario y contenido del bloque seleccionado.</p>
                          </div>
                          <button className="rectoria-modal-close" type="button" onClick={() => setScheduleSlotModal((previous) => ({ ...previous, open: false }))}>x</button>
                        </div>

                        <label>
                          Tipo de bloque
                          <select value={scheduleSlotModal.entryType} onChange={(event) => setScheduleSlotModal((previous) => ({
                            ...previous,
                            entryType: event.target.value,
                            teacherUserId: event.target.value === 'break' ? '' : (selectedScheduleTeacherBySubjectKey[previous.subjectKey] || previous.teacherUserId || ''),
                          }))}>
                            <option value="class">Asignatura</option>
                            <option value="break">Bloque especial</option>
                          </select>
                        </label>

                        {scheduleSlotModal.entryType === 'break' ? (
                          <label>
                            Bloque
                            <select value={scheduleSlotModal.breakKey} onChange={(event) => setScheduleSlotModal((previous) => ({ ...previous, breakKey: event.target.value }))}>
                              {scheduleBlockChips.map((block) => <option key={`modal-block-${block.key}`} value={block.key}>{block.label}</option>)}
                            </select>
                          </label>
                        ) : (
                          <>
                            <label>
                              Asignatura
                              <select value={scheduleSlotModal.subjectKey} onChange={(event) => {
                                const nextSubjectKey = event.target.value;
                                setScheduleSlotModal((previous) => ({
                                  ...previous,
                                  subjectKey: nextSubjectKey,
                                  teacherUserId: selectedScheduleTeacherBySubjectKey[nextSubjectKey] || '',
                                }));
                              }}>
                                <option value="">Selecciona una asignatura</option>
                                {selectedScheduleSubjects.map((subject) => <option key={`modal-subject-${subject.key}`} value={subject.key}>{subject.label}</option>)}
                              </select>
                            </label>
                            <label>
                              Docente
                              <select value={scheduleSlotModal.teacherUserId} onChange={(event) => setScheduleSlotModal((previous) => ({ ...previous, teacherUserId: event.target.value }))}>
                                <option value="">Selecciona un docente</option>
                                {(selectedScheduleTeacherOptionsBySubjectKey[scheduleSlotModal.subjectKey] || []).map((teacher) => (
                                  <option key={`modal-subject-teacher-${teacher.value}`} value={teacher.value}>{teacher.label}</option>
                                ))}
                              </select>
                            </label>
                          </>
                        )}

                        <div className="rectoria-period-row rectoria-period-row--schedule-range">
                          <label>
                            Inicio
                            <input type="time" step="900" value={scheduleSlotModal.startTime} onChange={(event) => setScheduleSlotModal((previous) => ({ ...previous, startTime: event.target.value }))} />
                          </label>
                          <label>
                            Fin
                            <input type="time" step="900" value={scheduleSlotModal.endTime} onChange={(event) => setScheduleSlotModal((previous) => ({ ...previous, endTime: event.target.value }))} />
                          </label>
                        </div>

                        <div className="rectoria-modal-actions">
                          {scheduleSlotModal.mode === 'edit' ? (
                            <button className="btn btn-danger" type="button" onClick={() => { onRemoveScheduleSlot(selectedScheduleGradeKey, scheduleSlotModal.slotKey); setScheduleSlotModal((previous) => ({ ...previous, open: false })); }}>Eliminar</button>
                          ) : null}
                          <button className="btn" type="button" onClick={() => setScheduleSlotModal((previous) => ({ ...previous, open: false }))}>Cancelar</button>
                          <button className="btn btn-primary" type="submit">Guardar bloque</button>
                        </div>
                      </form>
                    </div>
                  ) : null}
              </>
          ) : null}
        </div>
      ) : null}

      {!isCoordinationPortal && activeSection === 'database' ? (
        <div className="rectoria-stack">
          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Base de datos académica</h3>
                <p>Ficha consolidada de alumnos y acudientes con filtros por nivel, grado y curso.</p>
              </div>
              <div className="rectoria-fee-actions">
                <span className="rectoria-pill">Mostrando {filteredAcademicDatabase.length} de {billingBootstrap.academicDatabase.length} estudiantes</span>
              </div>
            </div>

            <div className="rectoria-database-filters">
              <label>
                Filtrar por nivel educativo
                <select value={academicDatabaseFilters.level} onChange={(event) => setAcademicDatabaseFilters((previous) => ({ ...previous, level: event.target.value }))}>
                  <option value="">Todos los niveles</option>
                  {academicDatabaseLevelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                Filtrar por grado
                <select value={academicDatabaseFilters.grade} onChange={(event) => setAcademicDatabaseFilters((previous) => ({ ...previous, grade: event.target.value }))}>
                  <option value="">Todos los grados</option>
                  {academicDatabaseGradeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                Filtrar por curso
                <select value={academicDatabaseFilters.course} onChange={(event) => setAcademicDatabaseFilters((previous) => ({ ...previous, course: event.target.value }))}>
                  <option value="">Todos los cursos</option>
                  {academicDatabaseCourseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                Filtrar por alumno
                <input value={academicDatabaseFilters.student} onChange={(event) => setAcademicDatabaseFilters((previous) => ({ ...previous, student: event.target.value }))} placeholder="Nombre o apellido" />
              </label>
              <label>
                Filtrar por padre
                <input value={academicDatabaseFilters.father} onChange={(event) => setAcademicDatabaseFilters((previous) => ({ ...previous, father: event.target.value }))} placeholder="Nombre del padre" />
              </label>
              <label>
                Filtrar por madre
                <input value={academicDatabaseFilters.mother} onChange={(event) => setAcademicDatabaseFilters((previous) => ({ ...previous, mother: event.target.value }))} placeholder="Nombre de la madre" />
              </label>
            </div>

            <div className="rectoria-kpis rectoria-kpis--database">
              <article className="rectoria-card">
                <span>Total estudiantes</span>
                <strong>{billingBootstrap.academicDatabase.length}</strong>
              </article>
              {academicDatabaseLevelCounts.map((item) => (
                <article className="rectoria-card" key={item.key}>
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </article>
              ))}
            </div>

            <div className="rectoria-database-toolbar">
              <button className="rectoria-database-button is-secondary" onClick={onDownloadAcademicDatabaseTemplate} type="button">
                <DownloadExcelIcon />
                <span>Plantilla migración</span>
              </button>
              <button className="rectoria-database-button is-secondary" disabled={busy} onClick={onOpenAcademicDatabaseImportPicker} type="button">
                <DownloadExcelIcon />
                <span>Migrar base de datos</span>
              </button>
              <button className="rectoria-database-button" onClick={onDownloadAcademicDatabase} type="button">
                <DownloadExcelIcon />
                <span>Descargar Excel</span>
              </button>
            </div>

            <input
              ref={academicDatabaseImportInputRef}
              accept=".xlsx,.xls,.csv"
              onChange={onAcademicDatabaseImportSelected}
              style={{ display: 'none' }}
              type="file"
            />

            <div className="rectoria-student-table-wrap rectoria-student-table-wrap--database">
              <table className="rectoria-table rectoria-table--database">
                <thead>
                  <tr>
                    <th>Nivel educativo</th>
                    <th>
                      <div className="rectoria-database-grade-head">
                        <button className="rectoria-promote-button" disabled={busy} onClick={onRequestGradePromotion} type="button">Subir un grado</button>
                        <span>Grado</span>
                      </div>
                    </th>
                    <th>Curso</th>
                    <th>Apellidos</th>
                    <th>Nombres</th>
                    <th>Género</th>
                    <th>Tipo doc.</th>
                    <th>Número doc.</th>
                    <th>Fecha nacimiento</th>
                    <th>Edad</th>
                    <th>Tipo sangre</th>
                    <th>Lugar nacimiento</th>
                    <th>Dirección</th>
                    <th>Nombre madre</th>
                    <th>Tipo doc.</th>
                    <th>Número doc.</th>
                    <th>Teléfono madre</th>
                    <th>Correo madre</th>
                    <th>Nombre padre</th>
                    <th>Tipo doc.</th>
                    <th>Número doc.</th>
                    <th>Teléfono padre</th>
                    <th>Correo padre</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {billingBootstrap.academicDatabase.length === 0 ? (
                    <tr>
                      <td colSpan="24">Aún no hay alumnos registrados en la base académica.</td>
                    </tr>
                  ) : filteredAcademicDatabase.length === 0 ? (
                    <tr>
                      <td colSpan="24">No hay registros que coincidan con los filtros actuales.</td>
                    </tr>
                  ) : filteredAcademicDatabase.map((item) => {
                    const rowId = String(item._id);
                    const isEditing = editingAcademicRowId === rowId;
                    const draft = academicDatabaseDrafts[rowId] || createAcademicDatabaseEditDraft(item);
                    const rowMeta = academicDatabaseRowMetaById[rowId] || {
                      levelLabel: 'Sin nivel',
                      gradeLabel: getGradeLabel(item.grade),
                      courseLabel: String(item?.course || '').trim() || 'Sin curso',
                    };

                    return (
                      <tr key={item._id}>
                        <td>{rowMeta.levelLabel}</td>
                        <td>{isEditing ? <input value={draft.grade} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'grade', event.target.value)} /> : rowMeta.gradeLabel}</td>
                        <td>{isEditing ? <input value={draft.course} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'course', event.target.value)} /> : rowMeta.courseLabel}</td>
                        <td>{isEditing ? <input value={draft.lastName} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'lastName', event.target.value)} /> : item.lastName}</td>
                        <td>{isEditing ? <input value={draft.firstName} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'firstName', event.target.value)} /> : item.firstName}</td>
                        <td>{isEditing ? <select value={draft.gender} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'gender', event.target.value)}><option value="">Selecciona</option><option value="female">Femenino</option><option value="male">Masculino</option><option value="other">Otro</option></select> : formatGenderLabel(item.gender)}</td>
                        <td>{isEditing ? <select value={draft.documentType} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'documentType', event.target.value)}><option value="">Selecciona</option><option value="TI">TI</option><option value="CC">CC</option><option value="CE">CE</option><option value="PP">PP</option><option value="NIT">NIT</option></select> : item.documentType}</td>
                        <td>{isEditing ? <input value={draft.documentNumber} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'documentNumber', event.target.value)} /> : item.documentNumber}</td>
                        <td>{isEditing ? <input type="date" value={draft.birthDate} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'birthDate', event.target.value)} /> : item.birthDate ? formatDate(item.birthDate) : 'Sin fecha'}</td>
                        <td>{item.age ?? ''}</td>
                        <td>{isEditing ? <input value={draft.bloodType} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'bloodType', event.target.value)} /> : item.bloodType}</td>
                        <td>{isEditing ? <input value={draft.birthPlace} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'birthPlace', event.target.value)} /> : item.birthPlace}</td>
                        <td>{isEditing ? <input value={draft.address} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'address', event.target.value)} /> : item.address}</td>
                        <td>{isEditing ? <input value={draft.motherName} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'motherName', event.target.value)} /> : item.motherName}</td>
                        <td>{isEditing ? <select value={draft.motherDocumentType} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'motherDocumentType', event.target.value)}><option value="">Selecciona</option><option value="CC">CC</option><option value="TI">TI</option><option value="CE">CE</option><option value="PP">PP</option><option value="NIT">NIT</option></select> : item.motherDocumentType}</td>
                        <td>{isEditing ? <input value={draft.motherDocumentNumber} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'motherDocumentNumber', event.target.value)} /> : item.motherDocumentNumber}</td>
                        <td>{isEditing ? <input value={draft.motherPhone} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'motherPhone', event.target.value)} /> : item.motherPhone}</td>
                        <td>{isEditing ? <input value={draft.motherEmail} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'motherEmail', event.target.value)} /> : item.motherEmail}</td>
                        <td>{isEditing ? <input value={draft.fatherName} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'fatherName', event.target.value)} /> : item.fatherName}</td>
                        <td>{isEditing ? <select value={draft.fatherDocumentType} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'fatherDocumentType', event.target.value)}><option value="">Selecciona</option><option value="CC">CC</option><option value="TI">TI</option><option value="CE">CE</option><option value="PP">PP</option><option value="NIT">NIT</option></select> : item.fatherDocumentType}</td>
                        <td>{isEditing ? <input value={draft.fatherDocumentNumber} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'fatherDocumentNumber', event.target.value)} /> : item.fatherDocumentNumber}</td>
                        <td>{isEditing ? <input value={draft.fatherPhone} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'fatherPhone', event.target.value)} /> : item.fatherPhone}</td>
                        <td>{isEditing ? <input value={draft.fatherEmail} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'fatherEmail', event.target.value)} /> : item.fatherEmail}</td>
                        <td>
                          <div className="rectoria-database-row-actions">
                            <button aria-label="Editar fila" className="rectoria-database-icon-button" onClick={() => onEditAcademicDatabaseRow(item)} type="button"><PencilIcon /></button>
                            <button aria-label="Guardar fila" className="rectoria-database-icon-button is-primary" disabled={!isEditing || busy} onClick={() => onSaveAcademicDatabaseRow(item)} type="button"><SaveIcon /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {!isCoordinationPortal && activeSection === 'fees' ? (
        <div className="rectoria-stack">
          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Calendario escolar y matrícula tardía</h3>
                <p>Define las fechas y recargos por nivel educativo para que el prorrateo respete cada calendario.</p>
              </div>
              <div className="rectoria-fee-actions">
                <button className="btn btn-primary" type="button" onClick={onSaveSchoolCalendarSettings} disabled={busy}>Guardar calendario</button>
              </div>
            </div>

            <article className="rectoria-fee-card rectoria-fee-card--detail">
              <div className="rectoria-fee-grid">
                <label>
                  Nivel educativo
                  <select value={selectedSchoolYearLevelKey} onChange={(event) => setSelectedSchoolYearLevelKey(event.target.value)}>
                    {schoolYearLevelOptions.length === 0 ? <option value="">Sin niveles configurados</option> : null}
                    {schoolYearLevelOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Inicio año escolar
                  <input type="date" value={selectedSchoolYearLevelSetting?.schoolYearStartDate || ''} disabled={!selectedSchoolYearLevelSetting} onChange={(event) => onSchoolYearLevelSettingChange('schoolYearStartDate', event.target.value)} />
                </label>
                <label>
                  Fin año escolar
                  <input type="date" value={selectedSchoolYearLevelSetting?.schoolYearEndDate || ''} disabled={!selectedSchoolYearLevelSetting} onChange={(event) => onSchoolYearLevelSettingChange('schoolYearEndDate', event.target.value)} />
                </label>
                <label>
                  Recargo matrícula tardía
                  <select value={selectedSchoolYearLevelSetting?.lateEnrollmentSurchargeType || 'none'} disabled={!selectedSchoolYearLevelSetting} onChange={(event) => onSchoolYearLevelSettingChange('lateEnrollmentSurchargeType', event.target.value)}>
                    <option value="none">Sin recargo</option>
                    <option value="percent">Porcentaje adicional</option>
                    <option value="fixed">Tarifa fija</option>
                  </select>
                </label>
                <label>
                  Valor del recargo
                  <input type="number" min="0" value={selectedSchoolYearLevelSetting?.lateEnrollmentSurchargeValue || 0} disabled={!selectedSchoolYearLevelSetting || selectedSchoolYearLevelSetting.lateEnrollmentSurchargeType === 'none'} onChange={(event) => onSchoolYearLevelSettingChange('lateEnrollmentSurchargeValue', event.target.value)} />
                </label>
              </div>

              <p className="rectoria-benefits-help">El prorrateo tomará el nivel del grado del estudiante. Preescolar puede manejar 11 meses y primaria o secundaria 10 meses configurando fechas distintas para cada nivel.</p>
            </article>
          </section>

          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Costos</h3>
                <p>Define bono, matrícula y pensión por cada grado existente desde rectoría.</p>
              </div>
              <div className="rectoria-fee-actions">
                <input
                  value={feeSettingsDraft.academicYear}
                  onChange={(event) => setFeeSettingsDraft((prev) => ({ ...prev, academicYear: event.target.value }))}
                  placeholder="Año académico"
                />
                <button className="btn btn-primary" type="button" onClick={onSaveFeeSettings} disabled={busy}>Guardar costos</button>
              </div>
            </div>

            {feeSettingsDraft.gradeSettings.length === 0 ? <p className="rectoria-role-empty">Primero crea grados en gestión académica para definir sus costos.</p> : (
              <div className="rectoria-fee-layout">
                <div className="rectoria-fee-card-grid">
                  {feeGradeCards.map((card) => (
                    <button
                      className={`rectoria-fee-grade-card${selectedFeeGradeKey === card.key ? ' is-active' : ''}`}
                      key={card.key || `fee-card-${card.index}`}
                      onClick={() => setSelectedFeeGradeKey(card.key)}
                      type="button"
                    >
                      <span className="rectoria-fee-grade-label">{card.label}</span>
                      <strong>{formatCurrency(card.monthlyTuition)}</strong>
                      <small>Bono {formatCurrency(card.enrollmentBonus)} · Matrícula {formatCurrency(card.enrollmentFee)}</small>
                    </button>
                  ))}
                </div>

                {selectedFeeSetting ? (
                  <article className="rectoria-fee-card rectoria-fee-card--detail">
                    <div className="rectoria-fee-detail-header">
                      <div>
                        <span className="rectoria-modal-eyebrow">Grado seleccionado</span>
                        <h4>{getGradeLabel(selectedFeeSetting.grade)}</h4>
                        <p>Edita aquí el bono único, la matrícula anual y la pensión mensual del grado.</p>
                      </div>
                    </div>

                    <div className="rectoria-fee-grid">
                      <label>
                        Grado
                        <input disabled readOnly value={getGradeLabel(selectedFeeSetting.grade)} />
                      </label>
                      <label>
                        Bono único
                        <input type="number" min="0" value={selectedFeeSetting.enrollmentBonus} onChange={(event) => onFeeSettingChange(selectedFeeSettingIndex, 'enrollmentBonus', event.target.value)} />
                      </label>
                      <label>
                        Matrícula anual
                        <input type="number" min="0" value={selectedFeeSetting.enrollmentFee} onChange={(event) => onFeeSettingChange(selectedFeeSettingIndex, 'enrollmentFee', event.target.value)} />
                      </label>
                      <label>
                        Pensión mensual
                        <input type="number" min="0" value={selectedFeeSetting.monthlyTuition} onChange={(event) => onFeeSettingChange(selectedFeeSettingIndex, 'monthlyTuition', event.target.value)} />
                      </label>
                    </div>

                    <p className="rectoria-fee-preview">Pensión base: {formatCurrency(selectedFeeSetting.monthlyTuition)}</p>

                    <div className="rectoria-fee-proration">
                      <div className="rectoria-fee-detail-header">
                        <div>
                          <h4>Beneficios del grado</h4>
                          <p>Descuentos configurados para la pensión de {getGradeLabel(selectedFeeSetting.grade)}.</p>
                        </div>
                      </div>

                      {selectedFeeBenefitRules.length ? (
                        <div className="rectoria-fee-proration-grid">
                          {selectedFeeBenefitRules.map((rule, ruleIndex) => (
                            <div className="rectoria-fee-proration-card" key={`selected-benefit-${rule.label || 'beneficio'}-${ruleIndex}`}>
                              <strong>{rule.label || `Beneficio ${ruleIndex + 1}`}</strong>
                              <span>Días {rule.startDay} al {rule.endDay}</span>
                              <span>{rule.discountType === 'fixed' ? `Descuento fijo: ${formatCurrency(getFixedBenefitAmountForGrade(rule, selectedFeeSetting.grade))}` : `Descuento: ${Number(rule.discountPercent || 0)}%`}</span>
                              <strong>{formatCurrency(calculateBenefitTuitionAmount(selectedFeeSetting.monthlyTuition, rule, selectedFeeSetting.grade))}</strong>
                            </div>
                          ))}
                        </div>
                      ) : <p className="rectoria-role-empty">No hay beneficios configurados para este grado.</p>}
                    </div>

                    <div className="rectoria-fee-proration">
                      <div className="rectoria-fee-detail-header">
                        <div>
                          <h4>Prorrateo automático de matrícula</h4>
                          <p>Cuando Secretaría seleccione la fecha de ingreso del alumno, la matrícula se calculará según el calendario escolar definido arriba y podrá sumar el recargo por matrícula tardía.</p>
                        </div>
                      </div>

                      <div className="rectoria-fee-proration-grid">
                        {selectedFeeProrationPreview.map((item) => (
                          <div className="rectoria-fee-proration-card" key={`proration-${item.key}`}>
                            <strong>{item.label}</strong>
                            <span>{item.remainingMonths} de {item.totalMonths} mes(es) facturables</span>
                            <span>{item.lateEnrollmentSurchargeAmount > 0 ? `Incluye recargo tardío de ${formatCurrency(item.lateEnrollmentSurchargeAmount)}` : 'Sin recargo tardío'}</span>
                            <span>{item.enrollmentBenefitDiscountAmount > 0 ? `${item.enrollmentBenefitLabel || 'Beneficio matrícula'}: -${formatCurrency(item.enrollmentBenefitDiscountAmount)}` : 'Sin beneficio de matrícula'}</span>
                            <strong>{formatCurrency(item.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                ) : null}
              </div>
            )}
          </section>

          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Beneficios - Descuentos sobre pensiones</h3>
                <p>Define descuentos de pensión por día de pago y, cuando sea valor fijo, configúralos por grado.</p>
              </div>
            </div>

            <article className="rectoria-fee-card rectoria-fee-card--detail">
              <div className="rectoria-fee-detail-header">
                <div>
                  <span className="rectoria-modal-eyebrow">Beneficios - Descuentos sobre pensiones</span>
                  <h4>Beneficios - Descuentos sobre pensiones</h4>
                  <p>Cada fila se guarda como beneficio de pensión del colegio y puede tener valores diferentes por grado.</p>
                </div>
              </div>

              <div className="rectoria-benefits">
                <div className="rectoria-benefits-header">
                  <h4>Beneficios - Descuentos sobre pensiones</h4>
                  <button className="btn" type="button" onClick={() => onAddBenefitRule()}>Agregar beneficio</button>
                </div>
                {(feeSettingsDraft.benefitRules || []).map((rule, ruleIndex) => (
                  <div className="rectoria-benefit-row" key={`global-benefit-rule-${ruleIndex}`}>
                    <label className="rectoria-benefit-field">
                      <span>Nombre del beneficio</span>
                      <input value={rule.label} onChange={(event) => onBenefitRuleChange(ruleIndex, 'label', event.target.value)} placeholder="Ej: Pronto pago" />
                    </label>
                    <label className="rectoria-benefit-field">
                      <span>Día inicial</span>
                      <input type="number" min="1" max="31" value={rule.startDay} onChange={(event) => onBenefitRuleChange(ruleIndex, 'startDay', event.target.value)} placeholder="1" />
                    </label>
                    <label className="rectoria-benefit-field">
                      <span>Día final</span>
                      <input type="number" min="1" max="31" value={rule.endDay} onChange={(event) => onBenefitRuleChange(ruleIndex, 'endDay', event.target.value)} placeholder="10" />
                    </label>
                    <label className="rectoria-benefit-field">
                      <span>Tipo</span>
                      <select value={rule.discountType || 'percent'} onChange={(event) => onBenefitRuleChange(ruleIndex, 'discountType', event.target.value)}>
                        <option value="percent">Porcentaje</option>
                        <option value="fixed">Valor fijo por grado</option>
                      </select>
                    </label>
                    {rule.discountType !== 'fixed' ? <label className="rectoria-benefit-field">
                      <span>Descuento (%)</span>
                      <input type="number" min="0" max="100" value={rule.discountPercent} onChange={(event) => onBenefitRuleChange(ruleIndex, 'discountPercent', event.target.value)} placeholder="0" />
                    </label> : null}
                    {rule.discountType === 'fixed' ? (
                      <div className="rectoria-benefit-fixed-grid">
                        {fixedBenefitGradeRows.length ? (
                          <>
                            <div className="rectoria-benefit-fixed-row rectoria-benefit-fixed-row--header">
                              <span>Grado</span>
                              <span>Pensión actual</span>
                              <span>Beneficio fijo</span>
                              <span>Pensión final</span>
                            </div>
                            {fixedBenefitGradeRows.map((setting) => {
                              const fixedAmount = getFixedBenefitAmountForGrade(rule, setting.grade);
                              const benefitTuition = Math.max(0, Number(setting.monthlyTuition || 0) - fixedAmount);
                              return (
                                <div className="rectoria-benefit-fixed-row" key={`fixed-benefit-${ruleIndex}-${setting.key}`}>
                                  <span>{setting.label}</span>
                                  <strong>{formatCurrency(setting.monthlyTuition || 0)}</strong>
                                  <input type="number" min="0" value={rule.fixedAmountsByGrade?.[setting.key] || ''} onChange={(event) => onBenefitFixedAmountChange(ruleIndex, setting.key, event.target.value)} placeholder="0" />
                                  <strong>{formatCurrency(benefitTuition)}</strong>
                                </div>
                              );
                            })}
                          </>
                        ) : <p className="rectoria-role-empty">Primero crea grados en gestión académica para configurar beneficios fijos.</p>}
                      </div>
                    ) : null}
                    <button className="btn btn-primary" type="button" onClick={onSaveFeeSettings} disabled={busy}>Guardar</button>
                    <button className="btn btn-danger" type="button" onClick={() => onRemoveBenefitRule(ruleIndex)}>Quitar</button>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Beneficios - Descuentos sobre matrículas</h3>
                <p>Define ventanas por fecha para aplicar descuentos sobre la matrícula según el día de ingreso del alumno.</p>
              </div>
            </div>

            <article className="rectoria-fee-card rectoria-fee-card--detail">
              <div className="rectoria-fee-detail-header">
                <div>
                  <span className="rectoria-modal-eyebrow">Beneficios - Descuentos sobre matrículas</span>
                  <h4>Calendario de beneficios de matrícula</h4>
                  <p>Usa fechas exactas para configurar periodos como pronto pago, segunda ventana o valor pleno.</p>
                </div>
              </div>

              <div className="rectoria-benefits">
                <div className="rectoria-benefits-header">
                  <h4>Beneficios - Descuentos sobre matrículas</h4>
                  <button className="btn" type="button" onClick={() => onAddEnrollmentBenefitRule()}>Agregar beneficio</button>
                </div>
                {(feeSettingsDraft.enrollmentBenefitRules || []).length ? (feeSettingsDraft.enrollmentBenefitRules || []).map((rule, ruleIndex) => (
                  <div className="rectoria-benefit-row" key={`enrollment-benefit-rule-${ruleIndex}`}>
                    <label className="rectoria-benefit-field">
                      <span>Nombre del beneficio</span>
                      <input value={rule.label} onChange={(event) => onEnrollmentBenefitRuleChange(ruleIndex, 'label', event.target.value)} placeholder="Ej: Descuento matrícula 13 al 30 de junio" />
                    </label>
                    <label className="rectoria-benefit-field">
                      <span>Fecha inicial</span>
                      <input type="date" value={rule.startDate} onChange={(event) => onEnrollmentBenefitRuleChange(ruleIndex, 'startDate', event.target.value)} />
                    </label>
                    <label className="rectoria-benefit-field">
                      <span>Fecha final</span>
                      <input type="date" value={rule.endDate} onChange={(event) => onEnrollmentBenefitRuleChange(ruleIndex, 'endDate', event.target.value)} />
                    </label>
                    <label className="rectoria-benefit-field">
                      <span>Tipo</span>
                      <select value={rule.discountType || 'percent'} onChange={(event) => onEnrollmentBenefitRuleChange(ruleIndex, 'discountType', event.target.value)}>
                        <option value="percent">Porcentaje</option>
                        <option value="fixed">Valor fijo</option>
                      </select>
                    </label>
                    {rule.discountType !== 'fixed' ? <label className="rectoria-benefit-field">
                      <span>Descuento (%)</span>
                      <input type="number" min="0" max="100" value={rule.discountPercent} onChange={(event) => onEnrollmentBenefitRuleChange(ruleIndex, 'discountPercent', event.target.value)} placeholder="0" />
                    </label> : null}
                    {rule.discountType === 'fixed' ? (
                      <div className="rectoria-benefit-fixed-grid">
                        {fixedBenefitGradeRows.length ? (
                          <>
                            <div className="rectoria-benefit-fixed-row rectoria-benefit-fixed-row--header">
                              <span>Grado</span>
                              <span>Matrícula actual</span>
                              <span>Beneficio fijo</span>
                              <span>Matrícula final</span>
                            </div>
                            {fixedBenefitGradeRows.map((setting) => {
                              const fixedAmount = getFixedBenefitAmountForGrade(rule, setting.grade);
                              const benefitEnrollmentFee = Math.max(0, Number(setting.enrollmentFee || 0) - fixedAmount);
                              return (
                                <div className="rectoria-benefit-fixed-row" key={`fixed-enrollment-benefit-${ruleIndex}-${setting.key}`}>
                                  <span>{setting.label}</span>
                                  <strong>{formatCurrency(setting.enrollmentFee || 0)}</strong>
                                  <input type="number" min="0" value={rule.fixedAmountsByGrade?.[setting.key] || ''} onChange={(event) => onEnrollmentBenefitFixedAmountChange(ruleIndex, setting.key, event.target.value)} placeholder="0" />
                                  <strong>{formatCurrency(benefitEnrollmentFee)}</strong>
                                </div>
                              );
                            })}
                          </>
                        ) : <p className="rectoria-role-empty">Primero crea grados en gestión académica para configurar beneficios fijos.</p>}
                      </div>
                    ) : null}
                    <button className="btn btn-primary" type="button" onClick={onSaveFeeSettings} disabled={busy}>Guardar</button>
                    <button className="btn btn-danger" type="button" onClick={() => onRemoveEnrollmentBenefitRule(ruleIndex)}>Quitar</button>
                  </div>
                )) : <p className="rectoria-role-empty">No hay beneficios sobre matrícula configurados.</p>}
              </div>
            </article>
          </section>
        </div>
      ) : null}

      {!isCoordinationPortal && activeSection === 'billing' ? (
        <div className="rectoria-stack">
          <section className="panel rectoria-panel rectoria-billing-intro">
            <div>
              <span className="rectoria-billing-eyebrow">Control de cartera</span>
              <h3>Seguimiento financiero institucional</h3>
              <p>Concentra aquí la morosidad, los cobros pendientes y la operación de nuevos cargos sin salir del portal de rectoría.</p>
            </div>
          </section>

          <div className="rectoria-kpis">
            <article className="rectoria-card">
              <span>Cartera pendiente</span>
              <strong>{formatCurrency(billing.kpis?.pendingAmount || 0)}</strong>
            </article>
            <article className="rectoria-card">
              <span>Cobros activos</span>
              <strong>{billing.kpis?.totalPendingCharges || 0}</strong>
            </article>
            <article className="rectoria-card">
              <span>Recaudo del mes</span>
              <strong>{formatCurrency(billing.kpis?.paidThisMonth || 0)}</strong>
            </article>
          </div>

          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Estado de cartera por alumno</h3>
                <p>Consulta una sola tabla alimentada desde la cartera real del colegio, incluyendo cargos pendientes y pagos registrados.</p>
              </div>
            </div>

            <div className="rectoria-student-table-wrap">
              <table className="rectoria-table rectoria-table--billing rectoria-table--overdue">
                <thead>
                  <tr>
                    <th>Acudiente</th>
                    <th>Teléfono</th>
                    <th>Alumnos</th>
                    <th>Estado</th>
                    <th>Valor pendiente</th>
                    <th>Días</th>
                    <th>Meses</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueFamilyRows.length === 0 ? (
                    <tr>
                      <td colSpan="8">No hay familias con cargos académicos.</td>
                    </tr>
                  ) : overdueFamilyRows.map((item) => (
                    <tr key={item.parentId}>
                      <td>
                        <strong>{item.parentName}</strong>
                      </td>
                      <td>{item.parentPhone || '-'}</td>
                      <td>{item.students.join(', ') || 'Sin alumnos enlazados'}</td>
                      <td>{item.statusLabel}</td>
                      <td>{item.amount > 0 ? formatCurrency(item.amount) : 'Ya pagado'}</td>
                      <td>{item.overdueDays}</td>
                      <td>{item.overdueMonths}</td>
                      <td>
                        <div className="rectoria-row-actions">
                          <button className="rectoria-icon-button" type="button" onClick={() => openPushEmailModal(item)} disabled={busy || item.amount <= 0} title="Enviar push y correo">
                            <NotificationIcon />
                          </button>
                          <button className="rectoria-icon-button rectoria-icon-button--whatsapp" type="button" onClick={() => onOpenWhatsapp(item)} disabled={busy || item.amount <= 0 || !normalizePhoneForWhatsapp(item.parentPhone)} title="Escribir por WhatsApp">
                            <WhatsappIcon />
                          </button>
                          <button className="rectoria-icon-button rectoria-icon-button--note" type="button" onClick={() => openManualNoteModal(item)} disabled={busy || item.amount <= 0} title="Registrar nota manual">
                            <PencilIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Seguimiento de cartera</h3>
                <p>Aquí quedan registradas las gestiones hechas desde la tabla de morosidad: push, correo, WhatsApp y notas manuales.</p>
              </div>
            </div>

            <div className="rectoria-student-table-wrap">
              <table className="rectoria-table rectoria-table--billing">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Acudiente</th>
                    <th>Gestión</th>
                    <th>Detalle</th>
                    <th>Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {(billing.followUps || []).length === 0 ? (
                    <tr>
                      <td colSpan="5">Todavía no hay gestiones registradas.</td>
                    </tr>
                  ) : (billing.followUps || []).map((entry) => (
                    <tr key={entry._id}>
                      <td>{formatDateTime(entry.createdAt)}</td>
                      <td>
                        <strong>{entry.parentName}</strong>
                        <div>{entry.parentPhone || '-'}</div>
                      </td>
                      <td>
                        <span className={`rectoria-followup-badge rectoria-followup-badge--${entry.actionType}`}>{followUpActionLabel(entry.actionType)}</span>
                      </td>
                      <td>
                        <strong>{entry.title || 'Seguimiento de cartera'}</strong>
                        <div>{entry.body || 'Sin detalle adicional.'}</div>
                      </td>
                      <td>{entry.createdByName || entry.createdByRole || 'Equipo institucional'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel rectoria-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Histórico de pagos</h3>
                <p>Consulta los últimos pagos académicos registrados con su método y fecha real de recaudo.</p>
              </div>
            </div>

            <div className="rectoria-student-table-wrap">
              <table className="rectoria-table rectoria-table--billing">
                <thead>
                  <tr>
                    <th>Alumno / familia</th>
                    <th>Acudiente</th>
                    <th>Concepto</th>
                    <th>Método de pago</th>
                    <th>Fecha</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {(billing.recentPayments || []).length === 0 ? (
                    <tr>
                      <td colSpan="6">No hay pagos registrados.</td>
                    </tr>
                  ) : (billing.recentPayments || []).slice(0, 120).map((payment) => (
                    <tr key={payment._id}>
                      <td>
                        <strong>{payment.studentName}</strong>
                        <div>{payment.grade || 'Sin grado'}{payment.course ? ` · ${payment.course}` : ''}</div>
                      </td>
                      <td>{payment.parentName}</td>
                      <td>{payment.concept}</td>
                      <td>{payment.methodLabel || 'Sin método'}</td>
                      <td>{new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(payment.paidAt || payment.createdAt))}</td>
                      <td>{formatCurrency(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel rectoria-panel rectoria-billing-create-panel">
            <div className="rectoria-section-header">
              <div>
                <h3>Crear cobro</h3>
                <p>Programa nuevos cargos después de revisar la cartera viva y la morosidad del colegio.</p>
              </div>
            </div>

            <form className="rectoria-billing-form" onSubmit={onSubmitCharge}>
              <div className="rectoria-billing-grid rectoria-billing-grid--headline">
                <label>
                  Concepto del cobro
                  <input required value={chargeForm.concept} onChange={(event) => setChargeForm((previous) => ({ ...previous, concept: event.target.value }))} />
                </label>
                <label>
                  Valor
                  <input required min="1" type="number" value={chargeForm.amount} onChange={(event) => setChargeForm((previous) => ({ ...previous, amount: event.target.value }))} />
                </label>
                <label>
                  Vence el
                  <input required type="date" value={chargeForm.dueDate} onChange={(event) => setChargeForm((previous) => ({ ...previous, dueDate: event.target.value }))} />
                </label>
                <label>
                  Audiencia
                  <select value={chargeForm.audienceType} onChange={(event) => setChargeForm((previous) => ({ ...previous, audienceType: event.target.value, gradeTargets: [], courseTargets: [], parentTargets: [], studentTargets: [] }))}>
                    <option value="general">{schoolName}</option>
                    <option value="grade">Por grado</option>
                    <option value="course">Por curso</option>
                    <option value="individual">Individual</option>
                  </select>
                </label>
              </div>

              <label>
                Descripción
                <textarea value={chargeForm.description} onChange={(event) => setChargeForm((previous) => ({ ...previous, description: event.target.value }))} />
              </label>

              {chargeForm.audienceType === 'general' ? (
                <p className="rectoria-selection-hint">Este cobro se enviará a todos los acudientes activos del colegio.</p>
              ) : null}

              {chargeForm.audienceType === 'grade' ? (
                <ClickableOptionPicker
                  emptyLabel="Haz clic en un grado para agregarlo."
                  label="Grados"
                  onAdd={(value) => onAddMultiSelectValue('gradeTargets', value)}
                  onRemove={(value) => onRemoveMultiSelectValue('gradeTargets', value)}
                  options={gradeOptions}
                  selectedValues={chargeForm.gradeTargets}
                />
              ) : null}
              {chargeForm.audienceType === 'course' ? (
                <ClickableOptionPicker
                  emptyLabel="Haz clic en un curso para agregarlo."
                  label="Cursos"
                  onAdd={(value) => onAddMultiSelectValue('courseTargets', value)}
                  onRemove={(value) => onRemoveMultiSelectValue('courseTargets', value)}
                  options={courseOptions}
                  selectedValues={chargeForm.courseTargets}
                />
              ) : null}
              {chargeForm.audienceType === 'individual' ? (
                <div className="rectoria-billing-grid">
                  <ClickableOptionPicker
                    emptyLabel="Haz clic en un acudiente para agregarlo."
                    label="Acudientes"
                    onAdd={(value) => onAddMultiSelectValue('parentTargets', value)}
                    onRemove={(value) => onRemoveMultiSelectValue('parentTargets', value)}
                    options={parentOptions}
                    selectedValues={chargeForm.parentTargets}
                  />
                  <ClickableOptionPicker
                    emptyLabel="Haz clic en un alumno para agregarlo."
                    label="Alumnos"
                    onAdd={(value) => onAddMultiSelectValue('studentTargets', value)}
                    onRemove={(value) => onRemoveMultiSelectValue('studentTargets', value)}
                    options={billingStudentOptions}
                    selectedValues={chargeForm.studentTargets}
                  />
                </div>
              ) : null}
              <div className="rectoria-billing-actions">
                <button className="btn btn-primary" disabled={busy} type="submit">Crear cobro</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

        </main>
      </div>

      {followUpModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label={followUpModal.type === 'manual_note' ? 'Registrar nota manual' : 'Enviar push y correo'}>
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Seguimiento de cartera</span>
                <h3>{followUpModal.type === 'manual_note' ? 'Registrar nota manual' : 'Enviar push y correo'}</h3>
                <p>{followUpModal.item?.parentName || 'Acudiente'}</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeFollowUpModal} disabled={busy}>Cerrar</button>
            </div>

            <form className="rectoria-modal-form" onSubmit={onSubmitFollowUp}>
              <label>
                Título
                <input value={followUpModal.title} onChange={(event) => setFollowUpModal((previous) => ({ ...previous, title: event.target.value }))} required />
              </label>
              <label>
                {followUpModal.type === 'manual_note' ? 'Detalle del seguimiento' : 'Texto del mensaje'}
                <textarea value={followUpModal.body} onChange={(event) => setFollowUpModal((previous) => ({ ...previous, body: event.target.value }))} required />
              </label>
              <div className="rectoria-modal-actions">
                <button className="btn" type="button" onClick={closeFollowUpModal} disabled={busy}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Guardando...' : 'Enviar'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {communicationEngagementModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Interacciones del comunicado">
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Comunicados</span>
                <h3>{communicationEngagementModal.type === 'likes' ? 'Likes' : 'Comentarios'}</h3>
                <p>{communicationEngagementModal.item?.title || 'Comunicado seleccionado'}</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeCommunicationEngagementModal} disabled={busy}>Cerrar</button>
            </div>
            {communicationEngagementModal.type === 'likes' ? (
              <div className="rectoria-engagement-list">
                {(communicationEngagementModal.item?.likes || []).length ? communicationEngagementModal.item.likes.map((like) => (
                  <article key={`${like.userId}-${like.createdAt || ''}`}><strong>{like.name || 'Acudiente'}</strong><span>{formatDateTime(like.createdAt)}</span></article>
                )) : <p>No hay likes en esta publicación.</p>}
              </div>
            ) : (
              <div className="rectoria-engagement-list">
                {(communicationEngagementModal.item?.comments || []).length ? communicationEngagementModal.item.comments.map((comment) => (
                  <article key={comment.id}>
                    <div><strong>{comment.name || 'Acudiente'}</strong><span>{formatDateTime(comment.createdAt)} · {comment.likesCount || 0} likes</span></div>
                    <p>{comment.body}</p>
                    <button className="rectoria-danger-chip" disabled={busy} onClick={() => openDeleteCommunicationCommentModal(communicationEngagementModal.item, comment)} type="button">Borrar comentario</button>
                  </article>
                )) : <p>No hay comentarios en esta publicación.</p>}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {deleteCommentModal.open ? (
        <BrandConfirmModal
          confirmLabel="Borrar"
          eyebrow="Comergio Campus"
          loading={busy}
          message="Esta acción eliminará el comentario del comunicado para los usuarios que pueden verlo."
          onCancel={closeDeleteCommunicationCommentModal}
          onConfirm={onDeleteCommunicationComment}
          title="¿Borrar este comentario?"
        />
      ) : null}

      {deleteAuthorModal.open ? (
        <BrandConfirmModal
          confirmLabel="Eliminar autor"
          eyebrow="Comergio Campus"
          loading={busy}
          message="Esta acción desactiva el autor seleccionado. Los comunicados asociados conservarán o reasignarán su firma según la configuración institucional."
          onCancel={closeDeleteCommunicationAuthorModal}
          onConfirm={onDeleteCommunicationAuthor}
          title={`¿Eliminar ${deleteAuthorModal.author?.name || 'este autor'}?`}
        />
      ) : null}

      {editUserModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Editar integrante del cuerpo académico">
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Cuerpo académico</span>
                <h3>Editar integrante</h3>
                <p>Actualiza el nombre visible, el correo de acceso o asigna una nueva contraseña.</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeEditUserModal} disabled={busy}>Cerrar</button>
            </div>

            <form className="rectoria-modal-form" onSubmit={onSaveEditedUser}>
              {editUserModal.error ? <p className="rectoria-modal-error">{editUserModal.error}</p> : null}
              <label>
                Nombre
                <input
                  value={editUserModal.name}
                  onChange={(event) => setEditUserModal((previous) => ({ ...previous, name: event.target.value, error: '' }))}
                  required
                />
              </label>
              <label>
                Correo de acceso
                <input
                  autoComplete="username"
                  type="email"
                  value={editUserModal.username}
                  onChange={(event) => setEditUserModal((previous) => ({ ...previous, username: event.target.value, error: '' }))}
                  required
                />
              </label>
              <label>
                Nueva contraseña
                <input
                  autoComplete="new-password"
                  placeholder="Dejar en blanco para conservarla"
                  type="password"
                  value={editUserModal.password}
                  onChange={(event) => setEditUserModal((previous) => ({ ...previous, password: event.target.value, error: '' }))}
                />
              </label>
              <div className="rectoria-modal-actions">
                <button className="btn" type="button" onClick={closeEditUserModal} disabled={busy}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={busy || !String(editUserModal.name || '').trim() || !String(editUserModal.username || '').trim()}>
                  {busy ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {createdUserModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Integrante creado correctamente">
          <div className="rectoria-modal-card rectoria-modal-card--success">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow rectoria-modal-eyebrow--success">Integrante creado</span>
                <h3>El usuario ya quedó registrado</h3>
                <p>La cuenta institucional fue creada correctamente y ya aparece en el equipo del rol correspondiente.</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeCreatedUserModal}>Cerrar</button>
            </div>

            <div className="rectoria-modal-form">
              <div className="rectoria-success-summary-grid">
                <div className="rectoria-success-summary-card">
                  <span>Integrante</span>
                  <strong>{createdUserModal.name || 'Nuevo usuario'}</strong>
                </div>
                <div className="rectoria-success-summary-card">
                  <span>Rol</span>
                  <strong>{roleLabel(createdUserModal.role)}</strong>
                </div>
                <div className="rectoria-success-summary-card">
                  <span>Correo de acceso</span>
                  <strong>{createdUserModal.username || 'Sin correo'}</strong>
                </div>
              </div>
              <div className="rectoria-modal-actions">
                <button className="btn btn-primary" type="button" onClick={closeCreatedUserModal}>Entendido</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {success ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Respuesta del portal de rectoría">
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Actualización</span>
                <h3>Acción completada</h3>
                <p>El backend respondió correctamente y la actualización ya fue aplicada.</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeSuccessModal}>Cerrar</button>
            </div>

            <div className="rectoria-modal-form">
              <p>{success}</p>
              <div className="rectoria-modal-actions">
                <button className="btn btn-primary" type="button" onClick={closeSuccessModal}>Entendido</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Error del portal de rectoría">
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Error</span>
                <h3>No se pudo completar la acción</h3>
                <p>Revisa el detalle del error y vuelve a intentarlo.</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeErrorModal}>Cerrar</button>
            </div>

            <div className="rectoria-modal-form">
              <p className="rectoria-modal-error">{error}</p>
              <div className="rectoria-modal-actions">
                <button className="btn btn-primary" type="button" onClick={closeErrorModal}>Entendido</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editGradeModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Modificar nombre de grado">
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Modificar grado</span>
                <h3>Actualiza el nombre de {getGradeLabel(editGradeModal.gradeKey)}</h3>
                <p>La clave interna del grado no cambia. Solo se actualiza el nombre visible en el sistema.</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeEditGradeModal} disabled={busy}>Cerrar</button>
            </div>

            <form className="rectoria-modal-form" onSubmit={onRenameAcademicGrade}>
              {editGradeModal.error ? <p className="rectoria-modal-error">{editGradeModal.error}</p> : null}
              <label>
                Nuevo nombre del grado
                <input
                  value={editGradeModal.gradeLabel}
                  onChange={(event) => setEditGradeModal((previous) => ({ ...previous, gradeLabel: event.target.value, error: '' }))}
                  required
                />
              </label>
              <div className="rectoria-modal-actions">
                <button className="btn" type="button" onClick={closeEditGradeModal} disabled={busy}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={busy || !String(editGradeModal.gradeLabel || '').trim()}>
                  {busy ? 'Guardando...' : 'Guardar nombre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editCourseModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Modificar nombre de curso">
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Modificar curso</span>
                <h3>Actualiza el nombre de {getCourseLabel(editCourseModal.courseKey)}</h3>
                <p>La clave interna del curso no cambia. Solo se actualiza el nombre visible en el sistema.</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeEditCourseModal} disabled={busy}>Cerrar</button>
            </div>

            <form className="rectoria-modal-form" onSubmit={onRenameAcademicCourse}>
              {editCourseModal.error ? <p className="rectoria-modal-error">{editCourseModal.error}</p> : null}
              <label>
                Nuevo nombre del curso
                <input
                  value={editCourseModal.courseLabel}
                  onChange={(event) => setEditCourseModal((previous) => ({ ...previous, courseLabel: event.target.value, error: '' }))}
                  required
                />
              </label>
              <div className="rectoria-modal-actions">
                <button className="btn" type="button" onClick={closeEditCourseModal} disabled={busy}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={busy || !String(editCourseModal.courseLabel || '').trim()}>
                  {busy ? 'Guardando...' : 'Guardar nombre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteGradeModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmar eliminación de grado">
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Eliminar grado</span>
                <h3>Confirma la eliminación de {getGradeLabel(deleteGradeModal.gradeKey)}</h3>
                <p>Ingresa tu clave de acceso para confirmar. Los alumnos de este grado quedarán pendientes por asignar un curso.</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeDeleteGradeModal} disabled={busy}>Cerrar</button>
            </div>

            <form className="rectoria-modal-form" onSubmit={onDeleteAcademicGrade}>
              {deleteGradeModal.error ? <p className="rectoria-modal-error">{deleteGradeModal.error}</p> : null}
              <label>
                Clave del usuario
                <input
                  type="password"
                  value={deleteGradeModal.password}
                  onChange={(event) => setDeleteGradeModal((previous) => ({ ...previous, password: event.target.value, error: '' }))}
                  required
                />
              </label>
              <div className="rectoria-modal-actions">
                <button className="btn" type="button" onClick={closeDeleteGradeModal} disabled={busy}>Cancelar</button>
                <button className="btn btn-danger" type="submit" disabled={busy || !String(deleteGradeModal.password || '').trim()}>
                  {busy ? 'Eliminando...' : 'Eliminar grado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editLevelModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Modificar nombre de nivel educativo">
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Modificar nivel educativo</span>
                <h3>Actualiza el nombre de {getLevelLabel(editLevelModal.levelKey)}</h3>
                <p>La clave interna del nivel no cambia. Solo se actualiza el nombre visible en el sistema.</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeEditLevelModal} disabled={busy}>Cerrar</button>
            </div>

            <form className="rectoria-modal-form" onSubmit={onRenameAcademicLevel}>
              {editLevelModal.error ? <p className="rectoria-modal-error">{editLevelModal.error}</p> : null}
              <label>
                Nuevo nombre del nivel educativo
                <input
                  value={editLevelModal.levelLabel}
                  onChange={(event) => setEditLevelModal((previous) => ({ ...previous, levelLabel: event.target.value, error: '' }))}
                  required
                />
              </label>
              <div className="rectoria-modal-actions">
                <button className="btn" type="button" onClick={closeEditLevelModal} disabled={busy}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={busy || !String(editLevelModal.levelLabel || '').trim()}>
                  {busy ? 'Guardando...' : 'Guardar nombre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editSubjectModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Modificar asignatura">
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Modificar asignatura</span>
                <h3>Actualiza {editSubjectModal.subjectLabel || editSubjectModal.subjectKey}</h3>
                <p>La clave interna de la asignatura no cambia. Solo se actualizan el nombre visible y su clasificación.</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeEditSubjectModal} disabled={busy}>Cerrar</button>
            </div>

            <form className="rectoria-modal-form" onSubmit={onUpdateAcademicSubject}>
              {editSubjectModal.error ? <p className="rectoria-modal-error">{editSubjectModal.error}</p> : null}
              <label>
                Nombre de la asignatura
                <input
                  value={editSubjectModal.subjectLabel}
                  onChange={(event) => setEditSubjectModal((previous) => ({ ...previous, subjectLabel: event.target.value, error: '' }))}
                  required
                />
              </label>
              <label>
                Clasificación
                <select
                  value={editSubjectModal.subjectKind}
                  onChange={(event) => setEditSubjectModal((previous) => ({ ...previous, subjectKind: event.target.value, error: '' }))}
                >
                  <option value="principal">Asignatura principal</option>
                  <option value="secundaria">Asignatura secundaria</option>
                </select>
              </label>
              <div className="rectoria-modal-actions">
                <button className="btn" type="button" onClick={closeEditSubjectModal} disabled={busy}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={busy || !String(editSubjectModal.subjectLabel || '').trim()}>
                  {busy ? 'Guardando...' : 'Guardar asignatura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteLevelModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmar eliminación de nivel educativo">
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Eliminar nivel educativo</span>
                <h3>Confirma la eliminación de {deleteLevelModal.levelLabel || deleteLevelModal.levelKey}</h3>
                <p>Ingresa tu clave de acceso para confirmar. Los grados de este nivel quedarán sin nivel educativo asignado.</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeDeleteLevelModal} disabled={busy}>Cerrar</button>
            </div>

            <form className="rectoria-modal-form" onSubmit={onDeleteAcademicLevel}>
              {deleteLevelModal.error ? <p className="rectoria-modal-error">{deleteLevelModal.error}</p> : null}
              <label>
                Clave del usuario
                <input
                  type="password"
                  value={deleteLevelModal.password}
                  onChange={(event) => setDeleteLevelModal((previous) => ({ ...previous, password: event.target.value, error: '' }))}
                  required
                />
              </label>
              <div className="rectoria-modal-actions">
                <button className="btn" type="button" onClick={closeDeleteLevelModal} disabled={busy}>Cancelar</button>
                <button className="btn btn-danger" type="submit" disabled={busy || !String(deleteLevelModal.password || '').trim()}>
                  {busy ? 'Eliminando...' : 'Eliminar nivel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteSubjectModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmar eliminación de asignatura">
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Eliminar asignatura</span>
                <h3>Confirma la eliminación de {deleteSubjectModal.subjectLabel || deleteSubjectModal.subjectKey}</h3>
                <p>Ingresa tu clave de acceso para confirmar. El mapa de grados enlazados a esta asignatura también se eliminará.</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeDeleteSubjectModal} disabled={busy}>Cerrar</button>
            </div>

            <form className="rectoria-modal-form" onSubmit={onDeleteAcademicSubject}>
              {deleteSubjectModal.error ? <p className="rectoria-modal-error">{deleteSubjectModal.error}</p> : null}
              <label>
                Clave del usuario
                <input
                  type="password"
                  value={deleteSubjectModal.password}
                  onChange={(event) => setDeleteSubjectModal((previous) => ({ ...previous, password: event.target.value, error: '' }))}
                  required
                />
              </label>
              <div className="rectoria-modal-actions">
                <button className="btn" type="button" onClick={closeDeleteSubjectModal} disabled={busy}>Cancelar</button>
                <button className="btn btn-danger" type="submit" disabled={busy || !String(deleteSubjectModal.password || '').trim()}>
                  {busy ? 'Eliminando...' : 'Eliminar asignatura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteCourseModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmar eliminación de curso">
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Eliminar curso</span>
                <h3>Confirma la eliminación de {getCourseLabel(deleteCourseModal.courseKey)}</h3>
                <p>Ingresa tu clave de acceso para confirmar. Los alumnos de este curso quedarán pendientes por asignar un curso.</p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeDeleteCourseModal} disabled={busy}>Cerrar</button>
            </div>

            <form className="rectoria-modal-form" onSubmit={onDeleteAcademicCourse}>
              {deleteCourseModal.error ? <p className="rectoria-modal-error">{deleteCourseModal.error}</p> : null}
              <label>
                Clave del usuario
                <input
                  type="password"
                  value={deleteCourseModal.password}
                  onChange={(event) => setDeleteCourseModal((previous) => ({ ...previous, password: event.target.value, error: '' }))}
                  required
                />
              </label>
              <div className="rectoria-modal-actions">
                <button className="btn" type="button" onClick={closeDeleteCourseModal} disabled={busy}>Cancelar</button>
                <button className="btn btn-danger" type="submit" disabled={busy || !String(deleteCourseModal.password || '').trim()}>
                  {busy ? 'Eliminando...' : 'Eliminar curso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {courseStudentsModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label={`Alumnos del curso ${getCourseLabel(courseStudentsModal.courseKey)}`}>
          <div className="rectoria-modal-card">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Alumnos por curso</span>
                <h3>{getCourseLabel(courseStudentsModal.courseKey)}</h3>
                <p>
                  {getGradeLabel(courseStudentsModal.gradeKey)} · {selectedCourseStudents.length} alumno(s)
                </p>
              </div>
              <button className="rectoria-modal-close" type="button" onClick={closeCourseStudentsModal}>Cerrar</button>
            </div>

            <div className="rectoria-course-students-list">
              {selectedCourseStudents.length === 0 ? <p className="rectoria-role-empty">Este curso no tiene alumnos asignados.</p> : selectedCourseStudents.map((student) => (
                <article className="rectoria-course-student-row" key={student._id}>
                  <div>
                    <strong>{student.name || 'Alumno'}</strong>
                  </div>
                  <div className="rectoria-course-student-meta">
                    <span>{student.grade ? getGradeLabel(normalizeAcademicGradeKey(student.grade)) : 'Sin grado'}</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="rectoria-modal-actions">
              <button className="btn btn-primary" type="button" onClick={closeCourseStudentsModal}>Cerrar</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default RectoriaDashboard;