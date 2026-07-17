import { useEffect, useMemo, useRef, useState } from 'react';
import Select from 'react-select';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LOGIN_PATH } from '../../lib/authNavigation';
import { ColibriBootSplash } from '../../components/ColibriBootSplash';
import DismissibleNotice from '../../components/DismissibleNotice';
import useAuthStore from '../../store/auth.store';
import { createHrSupplyRequest, getHrPlannerCycles, getHrSupplyItems, getHrSupplyRequests } from '../../services/hr.service';
import {
  createCampusTeacherPost,
  createCampusTeacherDisciplineObservation,
  createCampusTeacherParentFeedRequest,
  getCampusTeacherAttendance,
  getCampusTeacherCourseDetail,
  getCampusTeacherDisciplineObservations,
  getCampusTeacherParentFeedRequests,
  getCampusTeacherCalendar,
  getCampusTeacherOverviewShell,
  getCampusTeacherOverviewMetrics,
  saveCampusTeacherAttendance,
  saveCampusTeacherStudentGrades,
  uploadCampusTeacherParentFeedMedia,
  uploadCampusTeacherProfilePhoto,
  updateCampusTeacherAcademicContent,
  updateCampusTeacherGradingScheme,
  updateCampusTeacherPost,
} from '../services/campus.service';
import { resolveApiAssetUrl } from '../../lib/api';
import { isEducationalLevelKey } from '../../lib/feeGradeMatching';
import { resolveEducationalGradeLabel } from '../../lib/educationalGradeLabels';
import { mockTeacherWorkspace } from '../mockCampusContext';
import '../campus.css';

const campusPreviewEnabled = import.meta.env.DEV && String(import.meta.env.VITE_CAMPUS_PREVIEW || '').trim() === 'true';
const suggestedPostTypes = ['Aviso', 'Material', 'Tarea', 'Quiz', 'Exposición', 'Examen', 'Proyecto', 'Laboratorio'];
const weekdayShortLabels = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const weekdayLongLabels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const maxMaterialFileBytes = 25 * 1024 * 1024;
const maxMaterialFileCount = 6;

const teacherNavGroups = [
  { id: 'main', label: null, keys: ['dashboard', 'schedule', 'courses'] },
  {
    id: 'teaching',
    label: 'Enseñanza',
    keys: [
      'guidance_routine',
      'attendance',
      'academic_management',
      'academic_content',
      'school_coexistence',
      'social_publications',
      'resource_requests',
    ],
  },
];

function TeacherSectionIcon({ icon }) {
  const common = {
    fill: 'none',
    viewBox: '0 0 24 24',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  };

  switch (icon) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common}>
          <path d="M7 3v2M17 3v2M4.5 9h15M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'courses':
      return (
        <svg {...common}>
          <path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M4 12.5 12 17l8-4.5M4 17.5 12 22l8-4.5" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'guidance':
      return (
        <svg {...common}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M9 12h6M9 16h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case 'attendance':
      return (
        <svg {...common}>
          <path d="M9 11l2 2 4-4M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'academic':
      return (
        <svg {...common}>
          <path d="M12 3v18M8 7.5 12 5.5l4 2M8 12.5 12 10.5l4 2M8 17.5 12 15.5l4 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'content':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M14 2v6h6M8 13h8M8 17h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case 'coexistence':
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.7" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case 'publications':
      return (
        <svg {...common}>
          <path d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16M14 14l1.586-1.586a2 2 0 0 1 2.828 0L22 18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M3 20h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'resources':
      return (
        <svg {...common}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
  }
}

const teacherSectionOptions = [
  { key: 'dashboard', label: 'Inicio', icon: 'home', description: 'Un resumen claro de tus cursos, alumnos y pendientes de hoy.' },
  { key: 'schedule', label: 'Horario', icon: 'calendar', description: 'Consultar el horario asignado desde Rectoría.' },
  { key: 'courses', label: 'Cursos', icon: 'courses', description: 'Ver todos los cursos donde dictas clase.' },
  { key: 'guidance_routine', label: 'Guidance Routine', icon: 'guidance', description: 'Tomar asistencia de la rutina de orientacion del curso asignado.' },
  { key: 'attendance', label: 'Asistencia a clase', icon: 'attendance', description: 'Registrar si el alumno entró a tiempo, llegó tarde o no asistió a tu clase.' },
  { key: 'academic_management', label: 'Gestión académica', icon: 'academic', description: 'Definir evaluación y crear contenido académico por materia.' },
  { key: 'academic_content', label: 'Contenido académico', icon: 'content', description: 'Planear los temas de estudio por grado y asignatura.' },
  { key: 'school_coexistence', label: 'Convivencia escolar', icon: 'coexistence', description: 'Registrar observaciones de comportamiento para seguimiento institucional.' },
  { key: 'social_publications', label: 'Publicaciones', icon: 'publications', description: 'Enviar fotos, videos y relatos a revisión de Secretaría Académica.' },
  { key: 'resource_requests', label: 'Solicitud de recursos', icon: 'resources', description: 'Solicitar materiales institucionales a Recursos y gestion de compras.' },
];

const teacherResourcePriorityOptions = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const teacherResourceStatusLabels = {
  pending_coordination_review: 'En revisión de coordinación',
  consolidated: 'Consolidada por coordinación',
  pending_purchasing_review: 'En gestión de compras',
  pending_hr_review: 'En revisión por RRHH',
  pending_approval: 'En aprobación directiva',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  delivered: 'Entregada',
  partially_delivered: 'Entrega parcial',
  cancelled: 'Cancelada',
};

function createTeacherResourceRequestDraft() {
  return {
    requestedForArea: '',
    plannerCycleId: '',
    activityDate: '',
    activityTitle: '',
    activityDescription: '',
    purpose: '',
    neededByDate: '',
    priority: 'medium',
    itemId: '',
    customName: '',
    quantity: '1',
  };
}

function createTeacherSocialPublicationDraft() {
  return {
    courseId: '',
    title: '',
    body: '',
    media: [],
  };
}

function createTeacherDisciplineObservationDraft() {
  return {
    courseId: '',
    studentId: '',
    observation: '',
  };
}

function normalizeCampusGradingScale(rawScale = {}) {
  const minScore = Number(rawScale?.minScore ?? 0);
  const maxScore = Number(rawScale?.maxScore ?? 100);
  const passingScore = Number(rawScale?.passingScore ?? 70);
  const normalizedMin = Number.isFinite(minScore) ? minScore : 0;
  const normalizedMax = Number.isFinite(maxScore) && maxScore > normalizedMin ? maxScore : 100;
  const normalizedPassing = Number.isFinite(passingScore) ? Math.min(Math.max(passingScore, normalizedMin), normalizedMax) : 70;
  const performanceLevels = (Array.isArray(rawScale?.performanceLevels) ? rawScale.performanceLevels : [])
    .map((level, index) => ({
      key: String(level?.key || `performance_level_${index + 1}`).trim(),
      label: String(level?.label || '').trim(),
      minScore: Number.isFinite(Number(level?.minScore)) ? Number(level.minScore) : normalizedMin,
      maxScore: Number.isFinite(Number(level?.maxScore)) ? Number(level.maxScore) : normalizedMax,
      order: Number(level?.order || (index + 1) * 10),
    }))
    .filter((level) => level.key && level.label);

  return {
    minScore: normalizedMin,
    maxScore: normalizedMax,
    passingScore: normalizedPassing,
    performanceLevels,
  };
}

const teacherSocialPublicationStatusLabels = {
  pending: 'En revisión',
  approved: 'Publicada',
  rejected: 'Rechazada',
};

function normalizeTeacherPublicationHistoryMedia(item, index) {
  const kind = String(item?.kind || '').trim().toLowerCase();
  const rawUrl = String(item?.url || item?.src || item?.imageUrl || item?.videoUrl || '').trim();
  const rawThumbUrl = String(item?.thumbUrl || item?.imageUrl || rawUrl).trim();

  return {
    id: String(item?._id || item?.id || `${kind || 'media'}-${index + 1}`),
    kind: kind === 'video' ? 'video' : 'image',
    src: resolveApiAssetUrl(rawUrl),
    thumbUrl: resolveApiAssetUrl(rawThumbUrl),
    alt: String(item?.title || `Adjunto ${index + 1}`).trim() || `Adjunto ${index + 1}`,
  };
}

const teacherDisciplineStatusLabels = {
  submitted: 'Enviada',
  reviewed: 'Revisada',
  archived: 'Archivada',
};

const teacherCourseWorkspaceTabs = [
  { key: 'grading', label: 'Estructura de notas' },
  { key: 'posts', label: 'Asignación' },
  { key: 'gradebook', label: 'Libro de notas' },
];

const classworkAttachOptions = [
  {
    key: 'drive',
    label: 'Archivo',
    accept: '.pdf,image/*,video/*,audio/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip',
  },
  { key: 'youtube', label: 'YouTube', action: 'youtube' },
  {
    key: 'document',
    label: 'Documento',
    accept: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt',
  },
  {
    key: 'upload',
    label: 'Subir',
    accept: '.pdf,image/*,video/*,audio/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip',
    append: false,
  },
  { key: 'link', label: 'Enlace', action: 'link' },
  { key: 'image', label: 'Imagen', accept: 'image/*' },
  { key: 'video', label: 'Video', accept: 'video/*' },
  { key: 'audio', label: 'Audio', accept: 'audio/*' },
];

const teacherAttendanceStatusOptions = [
  { value: 'present', label: 'Presente' },
  { value: 'late', label: 'Tarde' },
  { value: 'absent', label: 'Ausente' },
  { value: 'excused', label: 'Excusado' },
];

function createPostDraft(courseId = '') {
  return {
    courseId,
    type: '',
    title: '',
    body: '',
    status: 'published',
    deliveryMode: 'date',
    dueAt: '',
    scheduledClassDate: '',
    scheduledClassSessionKey: '',
    targetType: 'course',
    targetStudentIds: [],
    addToGradebook: false,
    gradebookPeriodKey: '',
    gradebookComponentKey: '',
    gradebookWeight: '',
    gradebookTopic: '',
    gradebookSubcomponentTitle: '',
    gradebookSubcomponentDescription: '',
  };
}

function createClassSessionDraft() {
  return {
    weekday: '1',
    startTime: '07:00',
    endTime: '08:00',
    label: '',
  };
}

function createMaterialLinkDraft() {
  return {
    title: '',
    url: '',
  };
}

function createGradingComponentDraft(order = 10) {
  return {
    key: '',
    name: '',
    weight: '',
    order,
    subcomponents: [],
  };
}

function createSubcomponentDraft(index = 1) {
  return {
    name: '',
    date: '',
    topic: '',
    description: '',
    order: index,
  };
}

function buildSubcomponentDraftKey(periodIdx, compIdx) {
  return `period-${periodIdx}-component-${compIdx}`;
}

function buildGradebookPeriodRowKey(studentId, periodKey) {
  return `${studentId}:${periodKey}`;
}

function buildGradebookComponentRowKey(studentId, periodKey, componentKey) {
  return `${studentId}:${periodKey}:${componentKey}`;
}

function createAcademicPeriodDraft(index = 0) {
  return {
    key: `period_${index + 1}`,
    name: `Periodo ${index + 1}`,
    weight: index === 0 ? '100' : '',
    order: (index + 1) * 10,
    startDate: '',
    endDate: '',
    gradingComponents: [createGradingComponentDraft(10)],
  };
}

function createAcademicContentTopicDraft(index = 0) {
  return {
    key: `topic_${index + 1}`,
    title: '',
    description: '',
    order: (index + 1) * 10,
  };
}

function buildAssignmentComponentOptions(periods = []) {
  const normalizedPeriods = Array.isArray(periods) ? periods : [];
  const seenNames = new Set();
  const options = [];

  normalizedPeriods.forEach((period, periodIndex) => {
    (period.gradingComponents || [])
      .filter((component) => String(component.name || '').trim())
      .forEach((component, componentIndex) => {
        const name = String(component.name || '').trim();
        const dedupeKey = normalizePostType(name).toLowerCase();
        if (seenNames.has(dedupeKey)) {
          return;
        }

        seenNames.add(dedupeKey);
        const key = slugifyComponentKey(component.key || name || `component_${componentIndex + 1}`);
        const periodKey = slugifyComponentKey(period.key || period.name || `period_${periodIndex + 1}`);
        const periodName = String(period.name || '').trim() || `Periodo ${periodIndex + 1}`;

        options.push({
          key,
          name,
          periodKey,
          periodName,
          label: name,
        });
      });
  });

  return options;
}

function normalizePostType(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
}

function isEvaluativePostType(value) {
  const normalizedType = normalizePostType(value).toLowerCase();
  return Boolean(normalizedType) && !['aviso', 'announcement', 'material'].includes(normalizedType);
}

function formatPostedDate(post) {
  const rawDate = post?.publishedAt || post?.createdAt || post?.updatedAt;
  if (!rawDate) {
    return 'Sin fecha';
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin fecha';
  }

  return parsed.toLocaleDateString('es', { month: 'short', day: 'numeric' });
}

function getClassworkTypeTone(type) {
  const normalized = normalizePostType(type).toLowerCase();
  if (normalized.includes('quiz')) {
    return 'quiz';
  }
  if (normalized.includes('material') || normalized.includes('cuaderno')) {
    return 'material';
  }
  if (normalized.includes('aviso') || normalized.includes('announcement') || normalized.includes('pregunta')) {
    return 'question';
  }
  if (normalized.includes('examen') || normalized.includes('expos')) {
    return 'quiz';
  }
  return 'assignment';
}

function ClassworkTypeIcon({ type }) {
  const tone = getClassworkTypeTone(type);
  const common = {
    fill: 'none',
    viewBox: '0 0 24 24',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  };

  if (tone === 'quiz') {
    return (
      <svg {...common}>
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (tone === 'material') {
    return (
      <svg {...common}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (tone === 'question') {
    return (
      <svg {...common}>
        <path d="M8 10a4 4 0 1 1 8 0c0 2-2 2.5-3 3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        <circle cx="12" cy="18" r="1" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function ClassworkAttachIcon({ kind }) {
  const common = {
    fill: 'none',
    viewBox: '0 0 24 24',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  };

  switch (kind) {
    case 'youtube':
      return (
        <svg {...common}>
          <rect fill="#FF0000" height="14" rx="3" width="20" x="2" y="5" />
          <path d="M10 9.5v5l5-2.5-5-2.5Z" fill="#ffffff" />
        </svg>
      );
    case 'image':
      return (
        <svg {...common}>
          <rect fill="#34A853" height="16" rx="2" width="16" x="4" y="4" />
          <circle cx="9" cy="9" fill="#ffffff" r="1.5" />
          <path d="m6 16 4-4 3 3 2-2 3 3" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case 'video':
      return (
        <svg {...common}>
          <rect fill="#EA4335" height="14" rx="2" width="18" x="3" y="5" />
          <path d="M11 9.5v5l4.5-2.5L11 9.5Z" fill="#ffffff" />
        </svg>
      );
    case 'document':
      return (
        <svg {...common}>
          <path d="M8 3h6l4 4v14H8V3Z" fill="#4285F4" />
          <path d="M14 3v4h4" fill="#8AB4F8" />
          <path d="M10 13h6M10 16h6" stroke="#ffffff" strokeLinecap="round" strokeWidth="1.5" />
        </svg>
      );
    case 'audio':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" fill="#9334E6" r="9" />
          <path d="M9 9.5v5M12 8v8M15 10v4" stroke="#ffffff" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case 'link':
      return (
        <svg {...common}>
          <path d="M10 13a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" stroke="#1A73E8" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M14 11a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" stroke="#1A73E8" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case 'drive':
      return (
        <svg {...common}>
          <path d="m6.5 16 3.5-6h8l3.5 6H6.5Z" fill="#FBBC04" />
          <path d="m4 16 4-7h6l-2 7H4Z" fill="#34A853" />
          <path d="M12 9 15 16h6l-3-7h-6Z" fill="#4285F4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 16V8m0 0 3.5 3.5M12 8 8.5 11.5" stroke="#5F6368" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M6 19h12" stroke="#5F6368" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
  }
}

function formatPostTypeLabel(value) {
  const normalizedType = normalizePostType(value);
  if (!normalizedType) {
    return 'Aviso';
  }

  const lowerType = normalizedType.toLowerCase();
  if (lowerType === 'announcement') {
    return 'Aviso';
  }
  if (lowerType === 'assignment') {
    return 'Tarea';
  }
  if (lowerType === 'material') {
    return 'Material';
  }

  return normalizedType;
}

function formatDateLabel(value) {
  if (!value) {
    return 'Sin fecha';
  }

  const raw = String(value);
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsedDate = dateOnlyMatch
    ? new Date(Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]), 12, 0, 0))
    : new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Sin fecha';
  }

  // Planner deadlines are calendar dates; use UTC so YYYY-MM-DD midnight does not shift a day in Colombia.
  return parsedDate.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getTodayDateInputValue() {
  const today = new Date();
  const timezoneOffsetMs = today.getTimezoneOffset() * 60 * 1000;
  return new Date(today.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function formatPeriodDateRange(startDate, endDate) {
  if (!startDate && !endDate) {
    return 'Fechas pendientes';
  }

  if (startDate && endDate) {
    return `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
  }

  return startDate ? `Desde ${formatDateLabel(startDate)}` : `Hasta ${formatDateLabel(endDate)}`;
}

function formatTimeRange(startTime, endTime) {
  if (!startTime || !endTime) {
    return 'Horario pendiente';
  }

  return `${startTime} - ${endTime}`;
}

function parseScheduleTimeToMinutes(value) {
  const normalizedValue = String(value || '').trim();
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(normalizedValue)) {
    return null;
  }

  const [hours, minutes] = normalizedValue.split(':').map(Number);
  return (hours * 60) + minutes;
}

function formatScheduleMinutes(totalMinutes) {
  const hours = Math.floor(Number(totalMinutes || 0) / 60);
  const minutes = Number(totalMinutes || 0) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function buildScheduleTimelineSlots(_entries = [], { startTime = '06:00', endTime = '16:00', slotDurationMinutes = 60 } = {}) {
  const startMinutes = parseScheduleTimeToMinutes(startTime) ?? 360;
  const endMinutes = parseScheduleTimeToMinutes(endTime) ?? 960;
  const slotMinutes = Math.max(15, Number(slotDurationMinutes || 60));
  const slots = [];

  for (let slotStartMinutes = startMinutes; slotStartMinutes < endMinutes; slotStartMinutes += slotMinutes) {
    const slotEndMinutes = Math.min(slotStartMinutes + slotMinutes, endMinutes);
    const normalizedStartTime = formatScheduleMinutes(slotStartMinutes);
    const normalizedEndTime = formatScheduleMinutes(slotEndMinutes);
    slots.push({
      key: `${normalizedStartTime}-${normalizedEndTime}`,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      label: `${normalizedStartTime} - ${normalizedEndTime}`,
      cells: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    });
  }

  return slots.filter((slot) => parseScheduleTimeToMinutes(slot.endTime) > parseScheduleTimeToMinutes(slot.startTime));
}

function findScheduleSlotForEntry(slots, entry) {
  const entryStartMinutes = parseScheduleTimeToMinutes(entry?.startTime);
  if (entryStartMinutes === null) {
    return null;
  }

  return (Array.isArray(slots) ? slots : []).find((slot) => {
    const slotStartMinutes = parseScheduleTimeToMinutes(slot.startTime);
    const slotEndMinutes = parseScheduleTimeToMinutes(slot.endTime);
    return slotStartMinutes !== null
      && slotEndMinutes !== null
      && entryStartMinutes >= slotStartMinutes
      && entryStartMinutes < slotEndMinutes;
  }) || null;
}

function sanitizeClassSessions(sessions) {
  return (Array.isArray(sessions) ? sessions : []).filter((session) => (
    Boolean(session)
    && typeof session === 'object'
    && String(session.startTime || '').trim()
    && String(session.endTime || '').trim()
    && Number.isInteger(Number(session.weekday))
  ));
}

function mapClassSessionsToDraft(sessions) {
  return sanitizeClassSessions(sessions).map((session) => ({
    weekday: String(session.weekday),
    startTime: session.startTime,
    endTime: session.endTime,
    label: session.label || '',
  }));
}

function buildTeacherWeeklyScheduleFallback(courses) {
  const weekdays = [
    { key: 1, label: 'Lunes', shortLabel: 'Lun' },
    { key: 2, label: 'Martes', shortLabel: 'Mar' },
    { key: 3, label: 'Miércoles', shortLabel: 'Mie' },
    { key: 4, label: 'Jueves', shortLabel: 'Jue' },
    { key: 5, label: 'Viernes', shortLabel: 'Vie' },
  ];
  const entries = [];

  (courses || []).forEach((course) => {
    sanitizeClassSessions(course.classSessions).forEach((session) => {
      const weekday = Number(session.weekday);
      if (weekday < 1 || weekday > 5) {
        return;
      }

      entries.push({
        key: `${course.id}:${weekday}:${session.startTime}:${session.endTime}`,
          startDate: '',
          endDate: '',
        courseId: course.id,
        courseTitle: getCourseOptionLabel(course),
        subject: course.subject,
        studentGradeKey: course.studentGradeKey,
        colorToken: course.colorToken,
        weekday,
        startTime: session.startTime,
        endTime: session.endTime,
        label: session.label || 'Bloque de clase',
      });
    });
  });

  const timelineSlots = buildScheduleTimelineSlots(entries);
  entries.forEach((entry) => {
    const matchingSlot = findScheduleSlotForEntry(timelineSlots, entry);
    if (matchingSlot) {
      matchingSlot.cells[entry.weekday].push(entry);
    }
  });

  return {
    weekdays,
    slots: timelineSlots
      .map((slot) => ({
        key: slot.key,
        startTime: slot.startTime,
        endTime: slot.endTime,
        label: `${slot.startTime} - ${slot.endTime}`,
        days: weekdays.map((day) => ({
          weekday: day.key,
          items: (slot.cells[day.key] || []).sort((left, right) => String(left.courseTitle || '').localeCompare(String(right.courseTitle || ''))),
        })),
      })),
    totalBlocks: entries.length,
    timeRange: {
      startTime: '06:00',
      endTime: '16:00',
      slotDurationMinutes: 60,
    },
  };
}

function formatMonthLabel(monthDate) {
  return monthDate.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

function buildSessionKey(session) {
  return `${Number(session.weekday)}-${String(session.startTime || '')}-${String(session.endTime || '')}`;
}

function buildGradeDraftKey(periodKey, componentKey, subcomponentKey = '') {
  return `${String(periodKey || '')}::${String(componentKey || '')}::${String(subcomponentKey || '')}`;
}

function calculateWeightedAverage(items, getWeight) {
  let total = 0;
  let totalWeight = 0;
  let hasAnyValue = false;

  items.forEach((item) => {
    const currentValue = item?.score;
    if (currentValue === null || currentValue === undefined || currentValue === '') {
      return;
    }

    hasAnyValue = true;
    const weight = Number(getWeight(item) || 0);
    totalWeight += weight;
    total += Number(currentValue) * weight;
  });

  return hasAnyValue && totalWeight > 0 ? Number((total / totalWeight).toFixed(2)) : null;
}

function parseFiniteScore(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasFiniteScore(value) {
  return parseFiniteScore(value) !== null;
}

function buildClassDateIso(dateValue, startTime = '00:00') {
  if (!dateValue) {
    return null;
  }

  const [year, month, day] = String(dateValue).split('-').map(Number);
  const [hours, minutes] = String(startTime || '00:00').split(':').map(Number);
  const parsedDate = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
}

function toDateTimeLocalValue(isoValue) {
  if (!isoValue) {
    return '';
  }

  const parsedDate = new Date(isoValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  const timezoneOffsetMs = parsedDate.getTimezoneOffset() * 60 * 1000;
  return new Date(parsedDate.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function toDateInputValue(isoValue) {
  if (!isoValue) {
    return '';
  }

  const parsedDate = new Date(isoValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  const timezoneOffsetMs = parsedDate.getTimezoneOffset() * 60 * 1000;
  return new Date(parsedDate.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function buildPostDraftFromPost(post, fallbackCourseId = '') {
  const scheduledSession = post?.scheduledClassSession || null;

  return {
    ...createPostDraft(post?.courseId || fallbackCourseId),
    courseId: post?.courseId || fallbackCourseId,
    type: post?.type || 'Tarea',
    title: post?.title || '',
    body: post?.body || '',
    status: post?.status || 'published',
    deliveryMode: post?.deliveryMode || 'date',
    dueAt: toDateTimeLocalValue(post?.dueAt),
    scheduledClassDate: toDateInputValue(post?.scheduledClassDate),
    scheduledClassSessionKey: scheduledSession ? buildSessionKey(scheduledSession) : '',
    targetType: post?.targetType || 'course',
    targetStudentIds: Array.isArray(post?.targetStudentIds) ? post.targetStudentIds : [],
    addToGradebook: false,
    gradebookPeriodKey: '',
    gradebookComponentKey: '',
    gradebookWeight: '',
    gradebookTopic: '',
    gradebookSubcomponentTitle: '',
    gradebookSubcomponentDescription: '',
  };
}

function buildMaterialLinksFromPost(post) {
  const linkAttachments = (post?.attachments || [])
    .filter((attachment) => {
      const sourceType = String(attachment?.sourceType || '').toLowerCase();
      const url = String(attachment?.url || '').trim();
      return sourceType === 'link' || /^https?:\/\//i.test(url);
    })
    .map((attachment) => ({
      title: String(attachment?.title || attachment?.fileName || 'Enlace').trim(),
      url: String(attachment?.url || '').trim(),
    }))
    .filter((attachment) => attachment.url);

  return linkAttachments.length > 0 ? linkAttachments : [createMaterialLinkDraft()];
}

function buildClassCalendar(monthDate, classSessions, selectedDateValue) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const leadingEmptySlots = firstOfMonth.getDay();
  const cells = [];

  for (let index = 0; index < leadingEmptySlots; index += 1) {
    cells.push({ key: `empty-${index}`, empty: true });
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayNumber);
    const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    const weekday = date.getDay();
    const matchingSessions = classSessions.filter((session) => Number(session.weekday) === weekday);
    const today = new Date();

    cells.push({
      key: dateValue,
      empty: false,
      dayNumber,
      weekday,
      dateValue,
      hasClass: matchingSessions.length > 0,
      sessionCount: matchingSessions.length,
      isSelected: selectedDateValue === dateValue,
      isToday:
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate(),
    });
  }

  return cells;
}

function truncateActivityLabel(value, maxLength = 14) {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
    return 'Actividad';
  }

  return normalizedValue.length > maxLength ? `${normalizedValue.slice(0, maxLength - 1)}…` : normalizedValue;
}

function getTimelineDateValue(post) {
  const sourceValue = post?.deliveryMode === 'class' ? post?.scheduledClassDate : post?.dueAt;
  if (!sourceValue) {
    return '';
  }

  const parsedDate = new Date(sourceValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
}

function formatTimelineDateLabel(dateValue) {
  if (!dateValue) {
    return 'Fecha sin definir';
  }

  const [year, month, day] = String(dateValue).split('-').map(Number);
  const parsedDate = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Fecha sin definir';
  }

  return parsedDate.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildLocalDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildCourseTimelineCalendar(monthDate, classSessions, posts) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const leadingEmptySlots = firstOfMonth.getDay();
  const cells = [];
  const normalizedPosts = (Array.isArray(posts) ? posts : []).filter((post) => String(post?.status || '').toLowerCase() !== 'archived');

  for (let index = 0; index < leadingEmptySlots; index += 1) {
    cells.push({ key: `empty-${index}`, empty: true });
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayNumber);
    const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    const weekday = date.getDay();
    const matchingSessions = (Array.isArray(classSessions) ? classSessions : []).filter((session) => Number(session.weekday) === weekday);
    const matchingPosts = normalizedPosts.filter((post) => getTimelineDateValue(post) === dateValue);
    const today = new Date();
    const primaryPost = matchingPosts[0] || null;
    const titleParts = [];
    const timelineItems = [
      ...matchingPosts.map((post) => ({
        key: `post-${post.id}`,
        kind: 'activity',
        label: post.title || formatPostTypeLabel(post.type),
        meta: [
          String(post.subject || post.courseTitle || '').trim(),
          formatPostTypeLabel(post.type),
          formatDeliveryLabel(post),
        ].filter(Boolean).join(' · '),
        description: post.body || 'Actividad programada para este día.',
      })),
      ...matchingSessions.map((session, index) => ({
        key: `session-${dateValue}-${index + 1}`,
        kind: 'class',
        label: session.label || 'Clase programada',
        meta: formatTimeRange(session.startTime, session.endTime),
        description: `${weekdayLongLabels[weekday]} · ${session.label || 'Bloque de clase'}`,
      })),
    ];

    if (matchingPosts.length > 0) {
      titleParts.push(`Actividades: ${matchingPosts.map((post) => post.title || formatPostTypeLabel(post.type)).join(' · ')}`);
    }

    if (matchingSessions.length > 0) {
      titleParts.push(`Clases: ${matchingSessions.map((session) => session.label || `${weekdayLongLabels[weekday]} ${formatTimeRange(session.startTime, session.endTime)}`).join(' · ')}`);
    }

    cells.push({
      key: dateValue,
      empty: false,
      dayNumber,
      dateValue,
      hasActivity: matchingPosts.length > 0 || matchingSessions.length > 0,
      itemCount: timelineItems.length,
      items: timelineItems,
      formattedDate: formatTimelineDateLabel(dateValue),
      isToday:
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate(),
      primaryChip: primaryPost
        ? {
          label: truncateActivityLabel(primaryPost.title || formatPostTypeLabel(primaryPost.type)),
          title: matchingPosts.map((post) => post.title || formatPostTypeLabel(post.type)).join(' · '),
        }
        : null,
      secondaryChip: matchingSessions.length > 0
        ? {
          label: `${matchingSessions.length} clase${matchingSessions.length === 1 ? '' : 's'}`,
          title: matchingSessions.map((session) => session.label || `${weekdayLongLabels[weekday]} ${formatTimeRange(session.startTime, session.endTime)}`).join(' · '),
        }
        : null,
      title: titleParts.join(' | '),
    });
  }

  return cells;
}

function buildSummary(courses, posts, workspace) {
  const studentIds = new Set();
  const administrativeCourseKeys = new Set();
  let fallbackTotalStudents = 0;

  courses.forEach((course) => {
    const stats = buildCourseCardStats(course, workspace);
    const currentStudentIds = Array.isArray(stats.studentIds) ? stats.studentIds.map(String).filter(Boolean) : [];
    currentStudentIds.forEach((studentId) => studentIds.add(studentId));
    administrativeCourseKeys.add(getAdministrativeCourseGroupKey(course));
    fallbackTotalStudents += Number(stats.studentCount || 0);
  });

  return {
    totalCourses: administrativeCourseKeys.size,
    activeCourses: new Set(courses.filter((course) => course.status === 'active').map((course) => getAdministrativeCourseGroupKey(course))).size,
    publishedPosts: posts.filter((post) => post.status === 'published').length,
    activeAssignments: posts.filter((post) => isEvaluativePostType(post.type) && post.status !== 'archived').length,
    totalStudents: studentIds.size > 0 ? studentIds.size : fallbackTotalStudents,
  };
}

function buildStudentEntryKey(student) {
  return String(student?.studentId || student?.schoolCode || `${student?.name || ''}-${student?.grade || ''}`).trim();
}

function aggregateUniqueStudentScores(studentEntries, gradingScale) {
  const buckets = new Map();

  studentEntries.forEach((student) => {
    const key = buildStudentEntryKey(student);
    if (!key) {
      return;
    }

    const current = buckets.get(key) || {
      studentId: student.studentId,
      name: student.name,
      schoolCode: student.schoolCode,
      grade: student.grade,
      courseTitle: student.courseTitle,
      subject: student.subject,
      scores: [],
      trendDeltas: [],
      updatedAtLabel: formatDateLabel(student.updatedAt),
    };

    if (hasFiniteScore(student.finalScore)) {
      current.scores.push(parseFiniteScore(student.finalScore));
    }

    const gradedPeriods = (student.periods || []).filter((period) => Number.isFinite(Number(period.periodScore)));
    if (gradedPeriods.length >= 2) {
      const sortedPeriods = [...gradedPeriods].sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
      const firstScore = Number(sortedPeriods[0].periodScore);
      const lastScore = Number(sortedPeriods[sortedPeriods.length - 1].periodScore);
      if (Number.isFinite(firstScore) && Number.isFinite(lastScore)) {
        current.trendDeltas.push(Number((lastScore - firstScore).toFixed(2)));
      }
    }

    buckets.set(key, current);
  });

  const studentsWithScore = Array.from(buckets.values())
    .map((student) => ({
      ...student,
      finalScore: student.scores.length > 0
        ? Number((student.scores.reduce((total, score) => total + score, 0) / student.scores.length).toFixed(2))
        : null,
      trendDelta: student.trendDeltas.length > 0
        ? Number((student.trendDeltas.reduce((total, value) => total + value, 0) / student.trendDeltas.length).toFixed(2))
        : null,
    }))
    .filter((student) => hasFiniteScore(student.finalScore));

  return {
    studentsWithScore,
    approvedCount: studentsWithScore.filter((student) => Number(student.finalScore) >= gradingScale.passingScore).length,
    atRiskStudents: studentsWithScore
      .filter((student) => Number(student.finalScore) < gradingScale.passingScore)
      .sort((left, right) => Number(left.finalScore || 0) - Number(right.finalScore || 0) || String(left.name || '').localeCompare(String(right.name || ''), 'es')),
  };
}

function buildTeacherManagementOverview(courses, posts, workspace) {
  const normalizedCourses = Array.isArray(courses) ? courses : [];
  const normalizedPosts = Array.isArray(posts) ? posts : [];
  const gradingScale = normalizeCampusGradingScale(workspace?.gradingScale || {});
  const courseSummaries = normalizedCourses.map((course) => ({
    course,
    stats: buildCourseCardStats(course, workspace),
    detail: workspace?.courseDetails?.[course.id] || null,
  }));

  const studentEntries = courseSummaries.flatMap(({ course, detail }) => {
    const detailCourse = detail?.course || course;
    const courseAcademicPeriods = getCourseAcademicPeriods(detailCourse);

    const detailStudents = (detail?.students || []).map((student) => ({
      ...student,
      courseId: course.id,
      courseTitle: getCourseOptionLabel(course),
      subject: course.subject,
      periods: buildStudentPeriods(student, courseAcademicPeriods),
      updatedAt: detailCourse?.updatedAt || course?.updatedAt || null,
    }));

    if (detailStudents.length > 0) {
      return detailStudents;
    }

    return (Array.isArray(course?.stats?.evaluatedStudents) ? course.stats.evaluatedStudents : []).map((student) => ({
      ...student,
      courseId: course.id,
      courseTitle: getCourseOptionLabel(course),
      subject: course.subject,
      finalScore: parseFiniteScore(student.finalScore),
      periods: [],
      updatedAt: course?.updatedAt || null,
    })).filter((student) => hasFiniteScore(student.finalScore));
  });

  const uniqueStudentIds = new Set();
  let fallbackTotalStudents = 0;
  courseSummaries.forEach((item) => {
    const currentStudentIds = Array.isArray(item.stats.studentIds) ? item.stats.studentIds.map(String).filter(Boolean) : [];
    currentStudentIds.forEach((studentId) => uniqueStudentIds.add(studentId));
    fallbackTotalStudents += Number(item.stats.studentCount || 0);
  });
  const totalStudents = uniqueStudentIds.size > 0 ? uniqueStudentIds.size : fallbackTotalStudents;
  const { studentsWithScore, approvedCount } = aggregateUniqueStudentScores(studentEntries, gradingScale);
  const atRiskStudents = courseSummaries.flatMap(({ course, stats }) =>
    (Array.isArray(stats.atRiskStudents) ? stats.atRiskStudents : []).map((student) => ({
      ...student,
      finalScore: parseFiniteScore(student.finalScore),
      courseTitle: getCourseOptionLabel(course),
      subject: course.subject,
      trendDelta: null,
      updatedAtLabel: formatDateLabel(course?.updatedAt),
    })).filter((student) => hasFiniteScore(student.finalScore))
  );
  const averageScore = studentsWithScore.length > 0
    ? Number((studentsWithScore.reduce((total, student) => total + Number(student.finalScore || 0), 0) / studentsWithScore.length).toFixed(2))
    : null;
  const atRiskCount = atRiskStudents.length;
  const pendingPostIds = new Set(
    courseSummaries.flatMap(({ stats }) => (Array.isArray(stats?.pendingGradingPostIds) ? stats.pendingGradingPostIds : []))
  );
  const pendingGradingCount = courseSummaries.reduce((total, item) => total + Number(item.stats.pendingGradingCount || 0), 0);
  const approvedRate = studentsWithScore.length > 0 ? Number(((approvedCount / studentsWithScore.length) * 100).toFixed(1)) : null;
  const lowPerformanceRate = studentsWithScore.length > 0 ? Number(((atRiskCount / studentsWithScore.length) * 100).toFixed(1)) : null;

  const periodDeltas = studentEntries
    .map((student) => {
      const gradedPeriods = (student.periods || []).filter((period) => Number.isFinite(Number(period.periodScore)));
      if (gradedPeriods.length < 2) {
        return null;
      }

      const sortedPeriods = [...gradedPeriods].sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
      const firstScore = Number(sortedPeriods[0].periodScore);
      const lastScore = Number(sortedPeriods[sortedPeriods.length - 1].periodScore);
      return Number.isFinite(firstScore) && Number.isFinite(lastScore) ? Number((lastScore - firstScore).toFixed(2)) : null;
    })
    .filter((value) => value !== null);

  const averageTrendDelta = periodDeltas.length > 0
    ? Number((periodDeltas.reduce((total, currentValue) => total + currentValue, 0) / periodDeltas.length).toFixed(2))
    : null;
  const droppingStudentsCount = periodDeltas.filter((value) => value < 0).length;

  const scoreCoverageEntries = studentEntries.flatMap((student) =>
    (student.periods || []).flatMap((period) => period.scores || [])
  );
  const gradedEntriesCount = scoreCoverageEntries.filter((score) => score.score !== null && score.score !== undefined && score.score !== '').length;
  const gradingCoverageRate = scoreCoverageEntries.length > 0 ? Number(((gradedEntriesCount / scoreCoverageEntries.length) * 100).toFixed(1)) : null;
  const inactiveStudents = studentEntries.filter((student) => {
    const gradedPeriods = (student.periods || []).filter((period) => Number.isFinite(Number(period.periodScore)));
    return gradedPeriods.length === 0;
  }).length;

  const componentBuckets = new Map();
  studentEntries.forEach((student) => {
    (student.periods || []).forEach((period) => {
      (period.scores || []).forEach((score) => {
        if (!Number.isFinite(Number(score.score))) {
          return;
        }

        const topicKey = `${student.subject || 'Curso'}::${score.componentName || score.componentKey}`;
        const currentBucket = componentBuckets.get(topicKey) || {
          key: topicKey,
          label: `${student.subject || 'Curso'} · ${score.componentName || 'Componente'}`,
          totalScore: 0,
          count: 0,
          failedCount: 0,
        };

        currentBucket.totalScore += Number(score.score);
        currentBucket.count += 1;
        if (Number(score.score) < gradingScale.passingScore) {
          currentBucket.failedCount += 1;
        }

        componentBuckets.set(topicKey, currentBucket);
      });
    });
  });

  const weakestTopics = Array.from(componentBuckets.values())
    .map((topic) => ({
      ...topic,
      averageScore: topic.count > 0 ? Number((topic.totalScore / topic.count).toFixed(2)) : null,
      masteryRate: topic.count > 0 ? Number(((topic.totalScore / (topic.count * gradingScale.maxScore)) * 100).toFixed(1)) : null,
      failedRate: topic.count > 0 ? Number(((topic.failedCount / topic.count) * 100).toFixed(1)) : null,
    }))
    .sort((left, right) => {
      const leftScore = Number.isFinite(Number(left.averageScore)) ? Number(left.averageScore) : 10;
      const rightScore = Number.isFinite(Number(right.averageScore)) ? Number(right.averageScore) : 10;
      return leftScore - rightScore;
    })
    .slice(0, 3);

  const recentActivity = [...normalizedPosts]
    .filter((post) => post.status !== 'archived')
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime())
    .slice(0, 4)
    .map((post) => ({
      id: post.id,
      title: post.title || formatPostTypeLabel(post.type),
      typeLabel: formatPostTypeLabel(post.type),
      courseTitle: getCourseOptionLabel(normalizedCourses.find((course) => course.id === post.courseId) || { title: post.courseTitle }) || 'Curso',
      dateLabel: formatDateLabel(post.updatedAt || post.createdAt || post.publishedAt),
    }));

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowDateValue = buildLocalDateValue(tomorrowDate);
  const tomorrowLabel = formatTimelineDateLabel(tomorrowDateValue);
  const tomorrowActivities = normalizedPosts
    .filter((post) => isEvaluativePostType(post.type) && String(post.status || '').toLowerCase() !== 'archived')
    .filter((post) => getTimelineDateValue(post) === tomorrowDateValue)
    .map((post) => ({
      id: post.id,
      title: post.title || formatPostTypeLabel(post.type),
      typeLabel: formatPostTypeLabel(post.type),
      courseTitle: getCourseOptionLabel(normalizedCourses.find((course) => course.id === post.courseId) || { title: post.courseTitle }) || 'Curso',
      deliveryLabel: formatDeliveryLabel(post),
      description: post.body || 'Actividad programada.',
    }));

  const pendingGradingItems = normalizedPosts
    .filter((post) => {
      if (!isEvaluativePostType(post.type) || String(post.status || '').toLowerCase() === 'archived') {
        return false;
      }

      if (pendingPostIds.size > 0) {
        return pendingPostIds.has(post.id);
      }

      const course = normalizedCourses.find((entry) => entry.id === post.courseId);
      return course ? isPostPendingGrading(post, course, workspace) : false;
    })
    .sort((left, right) => {
      const leftTime = new Date(left.dueAt || left.scheduledClassDate || left.updatedAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.dueAt || right.scheduledClassDate || right.updatedAt || right.createdAt || 0).getTime();
      return leftTime - rightTime;
    })
    .map((post) => ({
      id: post.id,
      courseId: post.courseId,
      title: post.title || formatPostTypeLabel(post.type),
      typeLabel: formatPostTypeLabel(post.type),
      courseTitle: getCourseOptionLabel(normalizedCourses.find((course) => course.id === post.courseId) || { title: post.courseTitle }) || 'Curso',
      deliveryLabel: formatDeliveryLabel(post),
      dateLabel: formatDateLabel(post.dueAt || post.scheduledClassDate || post.updatedAt || post.createdAt),
      description: post.body || 'Actividad pendiente de revisión o calificación.',
    }));

  const totalActivities = normalizedPosts.filter((post) => post.status !== 'archived').length;
  const hasGradeInsights = studentsWithScore.length > 0;
  const scoreHealth = averageScore === null ? null : (averageScore / gradingScale.maxScore) * 100;
  const approvalHealth = approvedRate === null ? null : approvedRate;
  const riskHealth = hasGradeInsights ? Math.max(0, 100 - ((atRiskCount / studentsWithScore.length) * 100)) : null;
  const coverageHealth = gradingCoverageRate === null ? null : gradingCoverageRate;
  const healthScore = hasGradeInsights
    ? Number((((scoreHealth * 0.42) + (approvalHealth * 0.26) + (riskHealth * 0.18) + (coverageHealth * 0.14))).toFixed(1))
    : null;
  const healthStatus = !hasGradeInsights
    ? 'Sin calificaciones'
    : healthScore >= 75 ? 'Saludable' : healthScore >= 55 ? 'Atención' : 'Crítico';
  const healthTone = !hasGradeInsights
    ? 'neutral'
    : healthScore >= 75 ? 'good' : healthScore >= 55 ? 'warn' : 'danger';

  const riskAlerts = [
    droppingStudentsCount > 0 ? `${droppingStudentsCount} estudiante${droppingStudentsCount === 1 ? '' : 's'} han bajado su rendimiento recientemente.` : null,
    atRiskCount > 0 ? `${atRiskCount} estudiante${atRiskCount === 1 ? '' : 's'} están actualmente en riesgo académico.` : null,
    weakestTopics[0]?.failedRate >= 50 ? `${weakestTopics[0].failedRate}% presenta dificultad en ${weakestTopics[0].label.toLowerCase()}.` : null,
  ].filter(Boolean).slice(0, 3);

  return {
    totalStudents,
    averageScore,
    averageTrendDelta,
    approvedRate,
    lowPerformanceRate,
    atRiskCount,
    atRiskStudents,
    droppingStudentsCount,
    pendingGradingCount,
    pendingGradingItems,
    totalActivities,
    gradingCoverageRate,
    attendanceRate: null,
    inactiveStudents,
    weakestTopics,
    recentActivity,
    healthScore,
    healthStatus,
    healthTone,
    riskAlerts,
    tomorrowLabel,
    tomorrowActivities,
    tomorrowActivitiesCount: tomorrowActivities.length,
  };
}

function normalizeSubjectLabel(value) {
  return String(value || '').trim() || 'Asignatura sin nombre';
}

function normalizeCourseDisplayText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeCourseDisplayKey(value) {
  return normalizeCourseDisplayText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isSpecificCourseGroupLabel(value) {
  const normalizedValue = normalizeCourseDisplayText(value);
  return /^[0-9]+\s*[a-z]([\s-].*)?$/i.test(normalizedValue) || /^[a-z]+[\s-]*[0-9]+$/i.test(normalizedValue);
}

function extractCourseGroupFromKey(value) {
  const normalizedValue = normalizeCourseDisplayText(value);
  if (!normalizedValue) {
    return '';
  }

  const courseKeyParts = normalizedValue.split(':').map((part) => part.trim()).filter(Boolean);
  const lastPart = courseKeyParts[courseKeyParts.length - 1] || normalizedValue;
  const compactValue = lastPart.replace(/[\s_-]+/g, '').toUpperCase();

  if (/^[0-9]+[A-Z]$/.test(compactValue)) {
    return compactValue;
  }

  const compactMatches = normalizedValue.replace(/[_-]+/g, ' ').match(/(\d{1,2})\s*([A-Z])(?:\b|$)/gi) || [];
  const lastCompactMatch = compactMatches[compactMatches.length - 1];
  if (lastCompactMatch) {
    return lastCompactMatch.replace(/\s+/g, '').toUpperCase();
  }

  return isSpecificCourseGroupLabel(lastPart) ? lastPart : '';
}

function extractGradeNumberLabel(value) {
  const normalizedValue = normalizeCourseDisplayText(value);
  if (!normalizedValue) {
    return '';
  }

  const numericMatch = normalizedValue.match(/(?:^|[^0-9])(\d{1,2})(?:[^0-9]|$)/);
  if (numericMatch) {
    return numericMatch[1];
  }

  const normalizedKey = normalizeCourseDisplayKey(normalizedValue);
  const ordinalGrades = new Map([
    ['primero', '1'],
    ['segundo', '2'],
    ['tercero', '3'],
    ['cuarto', '4'],
    ['quinto', '5'],
    ['sexto', '6'],
    ['septimo', '7'],
    ['octavo', '8'],
    ['noveno', '9'],
    ['decimo', '10'],
    ['undecimo', '11'],
  ]);

  return ordinalGrades.get(normalizedKey) || '';
}

function getCourseGradeLabel(course) {
  const educationalLabel = resolveEducationalGradeLabel(course);
  if (educationalLabel) {
    return educationalLabel;
  }

  const gradeNumber = [course?.gradeLevel, course?.studentGradeKey, course?.title]
    .map(extractGradeNumberLabel)
    .find(Boolean);
  const gradeKeySources = [course?.studentGradeKey, course?.gradeLevel].filter(Boolean);

  if (gradeNumber && gradeKeySources.some((key) => isEducationalLevelKey(key) || /^kinder/i.test(String(key)))) {
    return `Kinder ${gradeNumber}`;
  }

  return gradeNumber || normalizeCourseDisplayText(course?.gradeLevel || course?.studentGradeKey || getCourseGroupLabel(course));
}

function getCourseGradeGroupLabel(course) {
  const subjectLabel = normalizeCourseDisplayText(course?.subject);
  const gradeLabel = getCourseGradeLabel(course);

  if (subjectLabel && gradeLabel) {
    return `${subjectLabel} · ${gradeLabel}`;
  }

  return gradeLabel || subjectLabel || getCourseDisplayTitle(course);
}

function buildGradeAliasSet(course, groupLabel) {
  const aliases = [course?.gradeLevel, course?.studentGradeKey, course?.section, groupLabel]
    .map(normalizeCourseDisplayKey)
    .filter(Boolean);
  const ordinalGradeAliases = new Map([
    ['primero', ['1', '1a', '1b', '1c', '1d']],
    ['segundo', ['2', '2a', '2b', '2c', '2d']],
    ['tercero', ['3', '3a', '3b', '3c', '3d']],
    ['cuarto', ['4', '4a', '4b', '4c', '4d']],
    ['quinto', ['5', '5a', '5b', '5c', '5d']],
    ['sexto', ['6', '6a', '6b', '6c', '6d']],
    ['septimo', ['7', '7a', '7b', '7c', '7d']],
    ['octavo', ['8', '8a', '8b', '8c', '8d']],
    ['noveno', ['9', '9a', '9b', '9c', '9d']],
    ['decimo', ['10', '10a', '10b', '10c', '10d']],
    ['undecimo', ['11', '11a', '11b', '11c', '11d']],
  ]);

  aliases.forEach((alias) => {
    ordinalGradeAliases.forEach((mappedAliases, ordinalAlias) => {
      if (alias === ordinalAlias || mappedAliases.includes(alias)) {
        aliases.push(ordinalAlias, ...mappedAliases);
      }
    });
  });

  return new Set(aliases);
}

function getCourseGroupLabel(course) {
  const educationalLabel = resolveEducationalGradeLabel(course);
  if (educationalLabel) {
    return educationalLabel;
  }

  const sourceCourseKeyGroup = extractCourseGroupFromKey(course?.sourceCourseKey);
  const studentGradeKeyGroup = extractCourseGroupFromKey(course?.studentGradeKey);
  const sectionGroup = extractCourseGroupFromKey(course?.section);
  const titleGroup = extractCourseGroupFromKey(course?.title);
  const gradeLabel = normalizeCourseDisplayText(course?.gradeLevel);
  const sectionLabel = normalizeCourseDisplayText(course?.section);

  if (sourceCourseKeyGroup) {
    return sourceCourseKeyGroup;
  }

  if (sectionGroup) {
    return sectionGroup;
  }

  if (studentGradeKeyGroup) {
    return studentGradeKeyGroup;
  }

  if (titleGroup) {
    return titleGroup;
  }

  if (!gradeLabel) {
    return sectionLabel || normalizeCourseDisplayText(course?.studentGradeKey);
  }

  if (!sectionLabel || sectionLabel.toLowerCase() === gradeLabel.toLowerCase()) {
    return gradeLabel;
  }

  return `${gradeLabel} ${sectionLabel}`;
}

function getCourseDisplayTitle(course) {
  const rawTitle = normalizeCourseDisplayText(course?.title);
  const subjectLabel = normalizeCourseDisplayText(course?.subject);
  const groupLabel = getCourseGroupLabel(course);
  const gradeAliases = buildGradeAliasSet(course, groupLabel);
  const hasTechnicalScope = /\b(primaria|secundaria|media|prejardin|jardin|transicion)\s*[:\d]/i.test(rawTitle)
    || (/\b(primaria|secundaria|media|prejardin|jardin|transicion)\b/i.test(rawTitle) && /\d{1,2}\s*[a-z]?/i.test(rawTitle));

  if (rawTitle && !hasTechnicalScope && !gradeAliases.has(normalizeCourseDisplayKey(rawTitle))) {
    return rawTitle;
  }

  return [subjectLabel, groupLabel].filter(Boolean).join(' · ') || rawTitle || 'Curso sin nombre';
}

function getCourseOptionLabel(course) {
  return getCourseDisplayTitle(course);
}

function getCourseDisplaySubtitle(course) {
  const subjectLabel = normalizeCourseDisplayText(course?.subject);
  const groupLabel = getCourseGroupLabel(course);
  const title = normalizeCourseDisplayKey(getCourseDisplayTitle(course));
  const parts = [subjectLabel, groupLabel].filter((part) => part && !title.includes(normalizeCourseDisplayKey(part)));

  return parts.join(' · ');
}

function getCourseGradeGroupKey(course) {
  const subjectKey = normalizeCourseDisplayKey(course?.subject || 'asignatura');
  const gradeKey = normalizeCourseDisplayKey(getCourseGradeLabel(course) || course?.title || 'grado');
  return `${subjectKey}::${gradeKey}`;
}

function getAdministrativeCourseGroupKey(course) {
  return normalizeCourseDisplayKey(getCourseGroupLabel(course) || course?.gradeLevel || course?.studentGradeKey || course?.title || course?.id || 'curso');
}

function buildCourseGradeGroups(courses) {
  const groupMap = new Map();

  (Array.isArray(courses) ? courses : []).forEach((course) => {
    const key = getCourseGradeGroupKey(course);
    const currentGroup = groupMap.get(key) || {
      key,
      title: getCourseGradeGroupLabel(course),
      subject: normalizeCourseDisplayText(course?.subject),
      grade: getCourseGradeLabel(course),
      courses: [],
    };

    currentGroup.courses.push(course);
    groupMap.set(key, currentGroup);
  });

  return Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      courses: group.courses.sort((left, right) => getCourseGroupLabel(left).localeCompare(getCourseGroupLabel(right), 'es')),
    }))
    .sort((left, right) => left.title.localeCompare(right.title, 'es'));
}

function buildCourseGradeGroupStats(group, workspace) {
  const stats = (group?.courses || []).map((course) => buildCourseCardStats(course, workspace));
  const studentIds = new Set();
  stats.forEach((currentStats) => {
    (Array.isArray(currentStats.studentIds) ? currentStats.studentIds : []).map(String).filter(Boolean).forEach((studentId) => studentIds.add(studentId));
  });
  const fallbackTotalStudents = stats.reduce((total, currentStats) => total + Number(currentStats.studentCount || 0), 0);
  const gradingScale = normalizeCampusGradingScale(workspace?.gradingScale || {});
  const evaluatedStudentEntries = stats.flatMap((currentStats) => Array.isArray(currentStats.evaluatedStudents) ? currentStats.evaluatedStudents : []);
  const { studentsWithScore, atRiskStudents } = aggregateUniqueStudentScores(evaluatedStudentEntries, gradingScale);
  const totalPending = stats.reduce((total, currentStats) => total + Number(currentStats.pendingGradingCount || 0), 0);
  const averageScore = studentsWithScore.length > 0
    ? Number((studentsWithScore.reduce((total, student) => total + Number(student.finalScore || 0), 0) / studentsWithScore.length).toFixed(1))
    : null;

  return {
    studentCount: studentIds.size > 0 ? studentIds.size : fallbackTotalStudents,
    averageScore,
    atRiskCount: atRiskStudents.length,
    pendingGradingCount: totalPending,
    courseCount: group?.courses?.length || 0,
  };
}

function groupCoursesBySubject(courses) {
  const subjectMap = new Map();

  (Array.isArray(courses) ? courses : []).forEach((course) => {
    const subjectLabel = normalizeSubjectLabel(course.subject);
    const subjectKey = slugifyComponentKey(subjectLabel) || 'subject';
    const currentGroup = subjectMap.get(subjectKey) || {
      key: subjectKey,
      label: subjectLabel,
      courses: [],
    };

    currentGroup.courses.push(course);
    subjectMap.set(subjectKey, currentGroup);
  });

  return Array.from(subjectMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'es'));
}

function buildCourseCardStats(course, workspace) {
  if (course?.stats) {
    const evaluatedStudents = (Array.isArray(course.stats.evaluatedStudents) ? course.stats.evaluatedStudents : [])
      .map((student) => ({
        ...student,
        studentId: String(student?.studentId || '').trim(),
        finalScore: parseFiniteScore(student?.finalScore),
      }))
      .filter((student) => student.studentId && hasFiniteScore(student.finalScore));

    return {
      studentCount: Number(course.stats.studentCount || 0),
      studentIds: (Array.isArray(course.stats.studentIds) ? course.stats.studentIds : []).map(String).filter(Boolean),
      evaluatedStudents,
      evaluatedStudentCount: evaluatedStudents.length,
      averageScore: evaluatedStudents.length > 0
        ? Number((evaluatedStudents.reduce((total, student) => total + Number(student.finalScore || 0), 0) / evaluatedStudents.length).toFixed(2))
        : null,
      atRiskCount: Number(course.stats.atRiskCount || 0),
      atRiskStudents: Array.isArray(course.stats.atRiskStudents) ? course.stats.atRiskStudents : [],
      pendingGradingCount: Number(course.stats.pendingGradingCount || 0),
    };
  }

  const detail = workspace?.courseDetails?.[course?.id] || null;
  const gradingScale = normalizeCampusGradingScale(detail?.course?.gradingScale || course?.gradingScale || workspace?.gradingScale || {});
  const students = Array.isArray(detail?.students) ? detail.students : [];
  const courseAcademicPeriods = getCourseAcademicPeriods(detail?.course || course);
  const studentsWithPeriods = students.map((student) => ({
    ...student,
    periods: buildStudentPeriods(student, courseAcademicPeriods),
  }));
  const evaluatedStudents = studentsWithPeriods.filter((student) => hasFiniteScore(student.finalScore));
  const coursePosts = (workspace?.recentPosts || []).filter((post) => post.courseId === course?.id && isEvaluativePostType(post.type) && post.status !== 'archived');
  const pendingGradingPosts = coursePosts.filter((post) => isPostPendingGrading(post, course, workspace));

  return {
    studentCount: students.length,
    studentIds: students.map((student) => String(student?.studentId || '').trim()).filter(Boolean),
    evaluatedStudents: evaluatedStudents.map((student) => ({
      studentId: String(student?.studentId || '').trim(),
      name: student?.name,
      schoolCode: student?.schoolCode,
      grade: student?.grade,
      course: student?.course,
      finalScore: parseFiniteScore(student.finalScore),
    })).filter((student) => student.studentId),
    evaluatedStudentCount: evaluatedStudents.length,
    averageScore: evaluatedStudents.length > 0
      ? Number((evaluatedStudents.reduce((total, student) => total + Number(student.finalScore || 0), 0) / evaluatedStudents.length).toFixed(1))
      : null,
    atRiskCount: students.filter((student) => {
      const finalScore = parseFiniteScore(student.finalScore);
      return finalScore !== null && finalScore < gradingScale.passingScore;
    }).length,
    pendingGradingCount: pendingGradingPosts.length,
    pendingGradingPostIds: pendingGradingPosts.map((post) => post.id).filter(Boolean),
  };
}

function getCourseAcademicPeriods(course) {
  if (!course) {
    return [];
  }

  const storedPeriods = Array.isArray(course.academicPeriods) ? course.academicPeriods : [];
  if (storedPeriods.length > 0) {
    return storedPeriods.map((period, periodIndex) => ({
      ...period,
      weight: Number(period.weight || 0),
      order: period.order ?? (periodIndex + 1) * 10,
      startDate: period.startDate || '',
      endDate: period.endDate || '',
      gradingComponents: (period.gradingComponents || []).map((component, componentIndex) => ({
        ...component,
        weight: Number(component.weight || 0),
        order: component.order ?? (componentIndex + 1) * 10,
        subcomponents: (component.subcomponents || []).map((subcomponent, subcomponentIndex) => ({
          ...subcomponent,
          key: subcomponent.key || slugifyComponentKey(subcomponent.name || `subcomponent_${subcomponentIndex + 1}`),
          weight: Number(subcomponent.weight || 0),
          order: subcomponent.order ?? (subcomponentIndex + 1),
        })),
      })),
    }));
  }

  const fallbackComponents = Array.isArray(course.gradingComponents) ? course.gradingComponents : [];
  if (fallbackComponents.length === 0) {
    return [];
  }

  return [{
    key: 'period_1',
    name: 'Periodo 1',
    weight: 100,
    order: 10,
    gradingComponents: fallbackComponents.map((component, componentIndex) => ({
      ...component,
      weight: Number(component.weight || 0),
      order: component.order ?? (componentIndex + 1) * 10,
      subcomponents: (component.subcomponents || []).map((subcomponent, subcomponentIndex) => ({
        ...subcomponent,
        key: subcomponent.key || slugifyComponentKey(subcomponent.name || `subcomponent_${subcomponentIndex + 1}`),
        weight: Number(subcomponent.weight || 0),
        order: subcomponent.order ?? (subcomponentIndex + 1),
      })),
    })),
  }];
}

function buildAcademicContentDrafts(course) {
  const periods = getCourseAcademicPeriods(course);
  const storedContent = Array.isArray(course?.academicContent) ? course.academicContent : [];
  const contentByPeriodKey = new Map(storedContent.map((period) => [String(period?.periodKey || '').trim(), period]));

  return periods.map((period, periodIndex) => {
    const contentPeriod = contentByPeriodKey.get(period.key) || storedContent[periodIndex] || {};
    return {
      periodKey: period.key,
      periodName: period.name,
      startDate: period.startDate || contentPeriod.startDate || '',
      endDate: period.endDate || contentPeriod.endDate || '',
      order: period.order ?? contentPeriod.order ?? (periodIndex + 1) * 10,
      topics: (Array.isArray(contentPeriod.topics) ? contentPeriod.topics : []).map((topic, topicIndex) => ({
        key: topic.key || slugifyComponentKey(topic.title || `topic_${topicIndex + 1}`),
        title: topic.title || '',
        description: topic.description || '',
        order: topic.order ?? (topicIndex + 1) * 10,
      })),
    };
  });
}

function countCourseGradingComponents(course) {
  return getCourseAcademicPeriods(course).reduce((total, period) => total + (period.gradingComponents || []).length, 0);
}

function calculatePeriodScore(scores, components) {
  const componentScores = components.map((component) => {
    const currentValue = scores.find((score) => score.componentKey === component.key)?.score;
    if (currentValue === null || currentValue === undefined || currentValue === '') {
      return null;
    }

    return { score: currentValue, weight: component.weight };
  }).filter(Boolean);

  return calculateWeightedAverage(componentScores, (component) => component.weight);
}

function calculateFinalScore(periods) {
  const periodScores = periods.map((period) => {
    const periodScore = period.periodScore ?? calculatePeriodScore(period.scores || [], period.gradingComponents || []);
    if (periodScore === null || periodScore === undefined) {
      return null;
    }

    return { score: periodScore, weight: period.weight };
  }).filter(Boolean);

  return calculateWeightedAverage(periodScores, (period) => period.weight);
}

function buildStudentPeriods(student, courseAcademicPeriods) {
  const existingPeriods = Array.isArray(student?.periods) ? student.periods : [];

  if (existingPeriods.length > 0) {
    return existingPeriods.map((period, periodIndex) => {
      const coursePeriod = courseAcademicPeriods.find((item) => item.key === period.key) || null;
      const gradingComponents = (coursePeriod?.gradingComponents || []).map((component) => ({ ...component }));
      const scores = (period.scores || []).map((score) => {
        const matchingComponent = gradingComponents.find((component) => component.key === score.componentKey) || null;
        const subcomponents = (score.subcomponents || []).map((subcomponent) => ({ ...subcomponent }));
        const normalizedScore = subcomponents.length > 0
          ? calculateWeightedAverage(subcomponents, (subcomponent) => subcomponent.weight)
          : (score.score ?? null);

        return {
          ...score,
          weight: Number(score.weight ?? matchingComponent?.weight ?? 0),
          score: normalizedScore,
          subcomponents,
        };
      });

      const periodScore = calculatePeriodScore(scores, gradingComponents);

      return {
        key: period.key,
        name: period.name,
        weight: Number(period.weight || 0),
        periodScore,
        weightedContribution: periodScore === null ? null : Number(((periodScore * Number(period.weight || 0)) / 100).toFixed(2)),
        gradingComponents,
        scores,
        order: period.order ?? (periodIndex + 1) * 10,
      };
    });
  }

  return courseAcademicPeriods.map((period, periodIndex) => {
    const scores = (period.gradingComponents || []).map((component) => {
      const existingScore = (student?.scores || []).find((score) => {
        const currentPeriodKey = score.academicPeriodKey || 'period_1';
        return currentPeriodKey === period.key && score.componentKey === component.key;
      });

      const subcomponents = (component.subcomponents || []).map((subcomponent) => {
        const existingSubcomponentScore = (existingScore?.subcomponents || []).find((item) => item.subcomponentKey === subcomponent.key) || null;
        return {
          subcomponentKey: subcomponent.key,
          subcomponentName: subcomponent.name,
          weight: Number(subcomponent.weight || 0),
          date: subcomponent.date || '',
          topic: subcomponent.topic || '',
          description: subcomponent.description || '',
          score: existingSubcomponentScore?.score ?? null,
          feedback: existingSubcomponentScore?.feedback || '',
          gradedAt: existingSubcomponentScore?.gradedAt || null,
        };
      });

      const scoreValue = subcomponents.length > 0
        ? calculateWeightedAverage(subcomponents, (subcomponent) => subcomponent.weight)
        : (existingScore?.score ?? null);

      return {
        academicPeriodKey: period.key,
        academicPeriodName: period.name,
        componentKey: component.key,
        componentName: component.name,
        weight: Number(component.weight || 0),
        score: scoreValue,
        feedback: existingScore?.feedback || '',
        gradedAt: existingScore?.gradedAt || null,
        subcomponents,
      };
    });

    const periodScore = calculatePeriodScore(scores, period.gradingComponents || []);
    return {
      key: period.key,
      name: period.name,
      weight: Number(period.weight || 0),
      periodScore,
      weightedContribution: periodScore === null ? null : Number(((periodScore * Number(period.weight || 0)) / 100).toFixed(2)),
      gradingComponents: (period.gradingComponents || []).map((component) => ({ ...component })),
      scores,
      order: period.order ?? (periodIndex + 1) * 10,
    };
  });
}

function resolveDraftScore(draftValue, fallbackScore) {
  const rawScore = String(draftValue?.score ?? '').trim();
  if (!rawScore) {
    return fallbackScore ?? null;
  }

  const parsedScore = Number(rawScore);
  return Number.isFinite(parsedScore) ? parsedScore : (fallbackScore ?? null);
}

function applyGradeDraftsToStudentPeriods(periods, draftEntries = {}) {
  return (periods || []).map((period) => {
    const scores = (period.scores || []).map((score) => {
      const componentDraft = draftEntries[buildGradeDraftKey(period.key, score.componentKey)];
      const subcomponents = (score.subcomponents || []).map((subcomponent) => {
        const subcomponentKey = subcomponent.subcomponentKey || subcomponent.key;
        const subcomponentDraft = draftEntries[buildGradeDraftKey(period.key, score.componentKey, subcomponentKey)];

        return {
          ...subcomponent,
          score: resolveDraftScore(subcomponentDraft, subcomponent.score),
          feedback: subcomponentDraft?.feedback ?? subcomponent.feedback,
        };
      });

      return {
        ...score,
        score: subcomponents.length > 0
          ? calculateWeightedAverage(subcomponents, (subcomponent) => subcomponent.weight)
          : resolveDraftScore(componentDraft, score.score),
        feedback: componentDraft?.feedback ?? score.feedback,
        subcomponents,
      };
    });
    const periodScore = calculatePeriodScore(scores, period.gradingComponents || []);

    return {
      ...period,
      periodScore,
      weightedContribution: periodScore === null ? null : Number(((periodScore * Number(period.weight || 0)) / 100).toFixed(2)),
      scores,
    };
  });
}

function buildGradebookAssignmentKey(periodKey, componentKey, subcomponentKey) {
  return [periodKey, componentKey, subcomponentKey].map((part) => String(part || '')).join('::');
}

function normalizeAssignmentTitleForMatch(value) {
  return normalizeCourseDisplayKey(
    String(value || '')
      .replace(/^(tarea|quiz|quices|examen|proyecto|exposicion|laboratorio|material|aviso)\s*[-–:]\s*/i, '')
  );
}

function resolveGradebookAssignmentKeyForPostTitle(title, assignmentOptions) {
  const options = Array.isArray(assignmentOptions) ? assignmentOptions : [];
  if (!options.length) {
    return '';
  }

  const normalizedTitle = normalizeCourseDisplayKey(title);
  const strippedTitle = normalizeAssignmentTitleForMatch(title);

  const exactMatch = options.find((option) => {
    const subcomponentName = normalizeCourseDisplayKey(option.subcomponentName);
    const strippedSubcomponent = normalizeAssignmentTitleForMatch(option.subcomponentName);
    return subcomponentName === normalizedTitle
      || strippedSubcomponent === strippedTitle
      || normalizeCourseDisplayKey(option.label) === normalizedTitle;
  });
  if (exactMatch) {
    return exactMatch.key;
  }

  const partialMatch = options.find((option) => {
    const subcomponentName = normalizeCourseDisplayKey(option.subcomponentName);
    return subcomponentName && (normalizedTitle.includes(subcomponentName) || subcomponentName.includes(strippedTitle));
  });

  return partialMatch?.key || '';
}

function countStudentsGradedForAssignment(students, assignmentKey, assignmentOptions) {
  const roster = Array.isArray(students) ? students : [];
  const assignment = (Array.isArray(assignmentOptions) ? assignmentOptions : []).find((option) => option.key === assignmentKey);
  if (!assignment || roster.length === 0) {
    return { gradedCount: 0, totalCount: roster.length };
  }

  const periodKey = String(assignment.periodKey || '');
  const componentKey = String(assignment.componentKey || '');
  const subcomponentKey = String(assignment.subcomponentKey || '');

  let gradedCount = 0;
  roster.forEach((student) => {
    const period = (student.periods || []).find((entry) => String(entry.key || entry.periodKey || '') === periodKey);
    const component = (period?.scores || []).find((entry) => String(entry.componentKey || '') === componentKey);
    const subcomponent = (component?.subcomponents || []).find((entry) => String(entry.subcomponentKey || '') === subcomponentKey);
    if (hasFiniteScore(subcomponent?.score)) {
      gradedCount += 1;
    }
  });

  return { gradedCount, totalCount: roster.length };
}

function isPostPendingGrading(post, course, workspace) {
  if (!isEvaluativePostType(post?.type) || String(post?.status || '').toLowerCase() === 'archived') {
    return false;
  }

  const detail = workspace?.courseDetails?.[course?.id] || null;
  const courseAcademicPeriods = getCourseAcademicPeriods(detail?.course || course);
  const assignmentOptions = buildGradebookAssignmentOptions(courseAcademicPeriods);
  const students = (detail?.students || []).map((student) => ({
    ...student,
    periods: buildStudentPeriods(student, courseAcademicPeriods),
  }));

  if (students.length === 0) {
    return false;
  }

  const assignmentKey = resolveGradebookAssignmentKeyForPostTitle(post?.title || '', assignmentOptions);
  if (!assignmentKey) {
    return true;
  }

  const { gradedCount, totalCount } = countStudentsGradedForAssignment(students, assignmentKey, assignmentOptions);
  return gradedCount < totalCount;
}

function TeacherDashboardKpiIcon({ kind }) {
  switch (kind) {
    case 'students':
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M16 20v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M20 20v-1a3.5 3.5 0 00-2.5-3.36M15 4.14a3.5 3.5 0 010 6.72" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case 'average':
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case 'risk':
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case 'pending':
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M9 11l3 3L22 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case 'tomorrow':
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <rect height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="5" />
          <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case 'health':
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M12 21s-6.5-4.35-8.8-8.1C1.4 9.8 3.4 6 6.9 6c1.9 0 3.1 1.1 3.9 2.1C11.6 7.1 12.8 6 14.7 6c3.5 0 5.5 3.8 3.7 6.9C18.5 16.65 12 21 12 21z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    default:
      return null;
  }
}

function buildGradebookAssignmentOptions(periods) {
  return (periods || []).flatMap((period) => (period.gradingComponents || []).flatMap((component) => (
    (component.subcomponents || []).map((subcomponent) => ({
      key: buildGradebookAssignmentKey(period.key, component.key, subcomponent.key),
      periodKey: period.key,
      periodName: period.name,
      componentKey: component.key,
      componentName: component.name,
      subcomponentKey: subcomponent.key,
      subcomponentName: subcomponent.name || 'Asignacion sin nombre',
      weight: Number(subcomponent.weight || 0),
      date: subcomponent.date || '',
      topic: subcomponent.topic || '',
      label: `${subcomponent.name || 'Asignacion sin nombre'} · ${component.name || 'Componente'}`,
    }))
  )));
}

function buildAcademicPeriodDrafts(course) {
  return getCourseAcademicPeriods(course).map((period, periodIndex) => ({
    key: period.key,
    name: period.name,
    weight: String(period.weight ?? ''),
    order: period.order ?? (periodIndex + 1) * 10,
    startDate: period.startDate || '',
    endDate: period.endDate || '',
    gradingComponents: (period.gradingComponents || []).map((component, componentIndex) => ({
      key: component.key,
      name: component.name,
      weight: String(component.weight ?? ''),
      order: component.order ?? (componentIndex + 1) * 10,
      subcomponents: (component.subcomponents || []).map((subcomponent, subcomponentIndex) => ({
        key: subcomponent.key || slugifyComponentKey(subcomponent.name || `subcomponent_${subcomponentIndex + 1}`),
        weight: String(subcomponent.weight ?? ''),
        name: subcomponent.name || '',
        date: subcomponent.date || '',
        topic: subcomponent.topic || '',
        order: subcomponent.order ?? (subcomponentIndex + 1),
      })),
    })),
  }));
}

function clonePreviewWorkspace() {
  return {
    teacher: { ...mockTeacherWorkspace.teacher },
    courses: mockTeacherWorkspace.courses.map((course) => ({
      ...course,
      classSessions: (course.classSessions || []).map((session) => ({ ...session })),
      academicPeriods: getCourseAcademicPeriods(course).map((period) => ({
        ...period,
        gradingComponents: (period.gradingComponents || []).map((component) => ({
          ...component,
          subcomponents: (component.subcomponents || []).map((subcomponent) => ({ ...subcomponent })),
        })),
      })),
      gradingComponents: (course.gradingComponents || []).map((component) => ({
        ...component,
        subcomponents: (component.subcomponents || []).map((subcomponent) => ({ ...subcomponent })),
      })),
    })),
    recentPosts: mockTeacherWorkspace.recentPosts.map((post) => ({
      ...post,
      scheduledClassSession: post.scheduledClassSession ? { ...post.scheduledClassSession } : null,
      attachments: (post.attachments || []).map((attachment) => ({ ...attachment })),
    })),
    courseDetails: Object.fromEntries(
      Object.entries(mockTeacherWorkspace.courseDetails || {}).map(([courseId, detail]) => [
        courseId,
        {
          course: {
            ...detail.course,
            classSessions: (detail.course.classSessions || []).map((session) => ({ ...session })),
            academicPeriods: getCourseAcademicPeriods(detail.course).map((period) => ({
              ...period,
              gradingComponents: (period.gradingComponents || []).map((component) => ({
                ...component,
                subcomponents: (component.subcomponents || []).map((subcomponent) => ({ ...subcomponent })),
              })),
            })),
            gradingComponents: (detail.course.gradingComponents || []).map((component) => ({
              ...component,
              subcomponents: (component.subcomponents || []).map((subcomponent) => ({ ...subcomponent })),
            })),
          },
          students: (detail.students || []).map((student) => ({
            ...student,
            periods: (student.periods || []).map((period) => ({
              ...period,
              scores: (period.scores || []).map((score) => ({ ...score })),
            })),
            scores: (student.scores || []).map((score) => ({ ...score })),
          })),
        },
      ])
    ),
  };
}

function slugifyComponentKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function buildStudentDrafts(detail) {
  const courseAcademicPeriods = getCourseAcademicPeriods(detail?.course);

  return Object.fromEntries(
    (detail?.students || []).map((student) => [
      student.studentId,
      Object.fromEntries(
        buildStudentPeriods(student, courseAcademicPeriods)
          .flatMap((period) => period.scores)
          .flatMap((score) => {
            const componentDraftEntry = [
              buildGradeDraftKey(score.academicPeriodKey || 'period_1', score.componentKey),
              {
                score: score.score === null || score.score === undefined ? '' : String(score.score),
                feedback: score.feedback || '',
              },
            ];

            const subcomponentDraftEntries = (score.subcomponents || []).map((subcomponent) => [
              buildGradeDraftKey(score.academicPeriodKey || 'period_1', score.componentKey, subcomponent.subcomponentKey),
              {
                score: subcomponent.score === null || subcomponent.score === undefined ? '' : String(subcomponent.score),
                feedback: subcomponent.feedback || '',
              },
            ]);

            return [componentDraftEntry, ...subcomponentDraftEntries];
          })
      ),
    ])
  );
}

function buildPreviewAttachments(materialLinks, materialFiles) {
  const linkAttachments = materialLinks
    .filter((item) => String(item.url || '').trim())
    .map((item, index) => ({
      sourceType: 'link',
      kind: 'link',
      title: String(item.title || '').trim() || `Link ${index + 1}`,
      url: String(item.url || '').trim(),
      fileName: '',
      mimeType: 'text/uri-list',
      sizeBytes: 0,
      extension: '',
      storage: 'external',
    }));

  const fileAttachments = materialFiles.map((file) => ({
    sourceType: 'file',
    kind: String(file.type || '').startsWith('image/')
      ? 'image'
      : String(file.type || '').startsWith('video/')
        ? 'video'
        : String(file.type || '').startsWith('audio/')
          ? 'audio'
          : String(file.type || '') === 'application/pdf'
            ? 'pdf'
            : 'file',
    title: file.name,
    url: '',
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: Number(file.size || 0),
    extension: String(file.name || '').split('.').pop() || '',
    storage: 'pending-upload',
  }));

  return [...linkAttachments, ...fileAttachments];
}

function buildPreviewPost(payload, courses, indexSeed) {
  const now = new Date().toISOString();
  const selectedCourse = courses.find((course) => course.id === payload.courseId);

  return {
    id: `preview-post-${indexSeed}`,
    courseId: payload.courseId,
    courseTitle: selectedCourse ? getCourseOptionLabel(selectedCourse) : 'Curso',
    type: payload.type,
    title: payload.title,
    body: payload.body,
    deliveryMode: payload.deliveryMode,
    dueAt: payload.deliveryMode === 'date' && payload.dueAt ? new Date(payload.dueAt).toISOString() : null,
    scheduledClassDate: payload.deliveryMode === 'class' ? payload.scheduledClassDate : null,
    scheduledClassSession: payload.deliveryMode === 'class' ? payload.scheduledClassSession : null,
    attachments: payload.attachments || [],
    status: payload.status,
    publishedAt: payload.status === 'published' ? now : null,
    createdAt: now,
    updatedAt: now,
  };
}

function formatDeliveryLabel(post) {
  if (post.deliveryMode === 'class' && post.scheduledClassDate && post.scheduledClassSession) {
    return `Clase ${formatDateLabel(post.scheduledClassDate)} · ${formatTimeRange(post.scheduledClassSession.startTime, post.scheduledClassSession.endTime)}`;
  }

  if (post.dueAt) {
    return `Entrega ${formatDateLabel(post.dueAt)}`;
  }

  return 'Sin límite de entrega';
}

function mergeTeacherOverviewShellAndMetrics(shell, metrics) {
  if (!shell) {
    return null;
  }

  const statsByCourseId = new Map(
    (Array.isArray(metrics?.courses) ? metrics.courses : []).map((course) => [course.id, course.stats])
  );

  if (statsByCourseId.size === 0) {
    return shell;
  }

  return {
    ...shell,
    courses: (shell.courses || []).map((course) => ({
      ...course,
      stats: statsByCourseId.get(course.id) || course.stats,
    })),
  };
}

function TeacherCampusHome({ forcePreview = false }) {
  const previewEnabled = campusPreviewEnabled || forcePreview;
      // --- Handlers para subcomponentes de cada componente de evaluación ---
      const onSaveSubcomponent = async (periodIdx, compIdx) => {
        const draftKey = buildSubcomponentDraftKey(periodIdx, compIdx);
        const componentDraft = subcomponentDrafts[draftKey] || createSubcomponentDraft(1);
        const nextName = String(componentDraft.name || '').trim();
        const nextWeight = Number(componentDraft.weight);

        if (!nextName) {
          setNotice({ type: 'error', text: 'El subcomponente necesita al menos un nombre.' });
          return;
        }

        if (!Number.isFinite(nextWeight) || nextWeight <= 0) {
          setNotice({ type: 'error', text: 'El subcomponente necesita un porcentaje mayor que cero.' });
          return;
        }

        const nextAcademicPeriodDrafts = academicPeriodDrafts.map((period, pIdx) =>
          pIdx !== periodIdx ? period : {
            ...period,
            gradingComponents: period.gradingComponents.map((comp, cIdx) =>
              cIdx !== compIdx ? comp : {
                ...comp,
                subcomponents: [
                  ...(comp.subcomponents || []),
                  {
                    ...componentDraft,
                    key: componentDraft.key || slugifyComponentKey(nextName || `subcomponent_${(comp.subcomponents?.length || 0) + 1}`),
                    name: nextName,
                    weight: String(componentDraft.weight || ''),
                    topic: String(componentDraft.topic || '').trim(),
                    order: (comp.subcomponents?.length || 0) + 1,
                  },
                ]
              }
            )
          }
        );

        setAcademicPeriodDrafts(nextAcademicPeriodDrafts);
        const saveResult = await onSaveGradingScheme(
          nextAcademicPeriodDrafts,
          'Subcomponente guardado en la estructura academica.',
          { strictTotals: false },
        );

        if (!saveResult.ok) {
          setAcademicPeriodDrafts(academicPeriodDrafts);
          setGradebookSaveModal({
            type: 'error',
            title: 'No se guardó el subcomponente',
            message: saveResult.error || 'Revisa los datos del subcomponente.',
          });
          return;
        }

        setGradebookSaveModal({
          type: 'success',
          title: 'Subcomponente guardado',
          message: 'El subcomponente quedó registrado en la estructura académica.',
        });

        setSubcomponentDrafts((currentDrafts) => ({
          ...currentDrafts,
          [draftKey]: createSubcomponentDraft(((nextAcademicPeriodDrafts[periodIdx]?.gradingComponents?.[compIdx]?.subcomponents?.length || 0) + 1)),
        }));
      };

      const onRemoveSubcomponent = (periodIdx, compIdx, subIdx) => {
        setAcademicPeriodDrafts((drafts) => drafts.map((period, pIdx) =>
          pIdx !== periodIdx ? period : {
            ...period,
            gradingComponents: period.gradingComponents.map((comp, cIdx) =>
              cIdx !== compIdx ? comp : {
                ...comp,
                subcomponents: (comp.subcomponents || []).filter((_, sIdx) => sIdx !== subIdx)
              }
            )
          }
        ));
      };

      const onChangeSubcomponent = (periodIdx, compIdx, subIdx, field, value) => {
        setAcademicPeriodDrafts((drafts) => drafts.map((period, pIdx) =>
          pIdx !== periodIdx ? period : {
            ...period,
            gradingComponents: period.gradingComponents.map((comp, cIdx) =>
              cIdx !== compIdx ? comp : {
                ...comp,
                subcomponents: comp.subcomponents.map((sub, sIdx) =>
                  sIdx !== subIdx ? sub : { ...sub, [field]: value }
                )
              }
            )
          }
        ));
      };

      const onChangeSubcomponentDraft = (periodIdx, compIdx, field, value) => {
        const draftKey = buildSubcomponentDraftKey(periodIdx, compIdx);
        setSubcomponentDrafts((currentDrafts) => ({
          ...currentDrafts,
          [draftKey]: {
            ...(currentDrafts[draftKey] || createSubcomponentDraft(1)),
            [field]: value,
          },
        }));
      };

      const onSaveComponent = async (periodIdx, compIdx) => {
        const component = academicPeriodDrafts[periodIdx]?.gradingComponents?.[compIdx];
        if (!component) {
          return;
        }

        const nextName = String(component.name || '').trim();
        const nextWeight = Number(component.weight);

        if (!nextName) {
          setNotice({ type: 'error', text: 'El componente necesita al menos un nombre.' });
          return;
        }

        if (!Number.isFinite(nextWeight) || nextWeight <= 0) {
          setNotice({ type: 'error', text: 'El componente necesita un porcentaje mayor que cero.' });
          return;
        }

        const previousDrafts = academicPeriodDrafts;
        const nextAcademicPeriodDrafts = academicPeriodDrafts.map((period, pIdx) => (
          pIdx !== periodIdx
            ? period
            : {
              ...period,
              gradingComponents: (period.gradingComponents || []).map((comp, cIdx) => (
                cIdx !== compIdx
                  ? comp
                  : {
                    ...comp,
                    name: nextName,
                    key: comp.key || slugifyComponentKey(nextName),
                  }
              )),
            }
        ));

        setAcademicPeriodDrafts(nextAcademicPeriodDrafts);
        const saveResult = await onSaveGradingScheme(
          nextAcademicPeriodDrafts,
          'Componente guardado en la estructura academica.',
          { strictTotals: false },
        );

        if (!saveResult.ok) {
          setAcademicPeriodDrafts(previousDrafts);
          setGradebookSaveModal({
            type: 'error',
            title: 'No se guardó el componente',
            message: saveResult.error || 'Revisa los datos del componente.',
          });
          return;
        }

        setGradebookSaveModal({
          type: 'success',
          title: 'Componente guardado',
          message: 'El componente quedó registrado en la estructura académica.',
        });
      };
    // Estados para filtro y acordeón del libro de notas
    const [gradebookSearch, setGradebookSearch] = useState('');
    const [gradebookMode, setGradebookMode] = useState('student');
    const [selectedGradebookAssignmentKey, setSelectedGradebookAssignmentKey] = useState('');
    const [openGradebookRows, setOpenGradebookRows] = useState({});
    const [openGradebookPeriods, setOpenGradebookPeriods] = useState({});
    const [openGradebookComponents, setOpenGradebookComponents] = useState({});
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const authUser = useAuthStore((state) => state.user);
  const teacherQueryScope = authUser?.id || 'anonymous';
  const [notice, setNotice] = useState({ type: 'info', text: '' });
  const [previewWorkspace, setPreviewWorkspace] = useState(() => clonePreviewWorkspace());
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [teacherAttendanceCourseId, setTeacherAttendanceCourseId] = useState('');
  const [teacherAttendanceSubjectKey, setTeacherAttendanceSubjectKey] = useState('');
  const [teacherAttendanceType, setTeacherAttendanceType] = useState('subject_class');
  const [teacherAttendanceDate, setTeacherAttendanceDate] = useState(getTodayDateInputValue);
  const [teacherAttendanceClassSessionKey, setTeacherAttendanceClassSessionKey] = useState('');
  const [teacherAttendanceRecords, setTeacherAttendanceRecords] = useState([]);
  const [activeTeacherSection, setActiveTeacherSection] = useState('dashboard');
  const [selectedSubjectKey, setSelectedSubjectKey] = useState('');
  const [selectedPortalGradeKey, setSelectedPortalGradeKey] = useState('');
  const [activeCourseWorkspaceTab, setActiveCourseWorkspaceTab] = useState('grading');
  const [showSelectedCourseWorkspace, setShowSelectedCourseWorkspace] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [timelineMonth, setTimelineMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [timelineCourseId, setTimelineCourseId] = useState('');
  const [dashboardCalendarMonth, setDashboardCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedTimelineDate, setSelectedTimelineDate] = useState('');
  const [selectedDashboardCalendarDate, setSelectedDashboardCalendarDate] = useState('');
  const [activeIntegralModal, setActiveIntegralModal] = useState('');
  const [showPostSuccessModal, setShowPostSuccessModal] = useState(false);
  const [gradebookSaveModal, setGradebookSaveModal] = useState(null);
  const [editingPostId, setEditingPostId] = useState('');
  const [showAssignmentComposer, setShowAssignmentComposer] = useState(false);
  const [showClassworkCreateMenu, setShowClassworkCreateMenu] = useState(false);
  const [openPostMenuId, setOpenPostMenuId] = useState('');
  const [postDraft, setPostDraft] = useState(createPostDraft(''));
  const [materialLinks, setMaterialLinks] = useState([createMaterialLinkDraft()]);
  const [materialFiles, setMaterialFiles] = useState([]);
  const [showAttachLinkPanel, setShowAttachLinkPanel] = useState(false);
  const [classScheduleDraft, setClassScheduleDraft] = useState([]);
  const [academicPeriodDrafts, setAcademicPeriodDrafts] = useState([]);
  const [academicContentDrafts, setAcademicContentDrafts] = useState([]);
  const [academicContentTopicInputs, setAcademicContentTopicInputs] = useState({});
  const [teacherResourceRequestDraft, setTeacherResourceRequestDraft] = useState(createTeacherResourceRequestDraft);
  const [teacherResourceRequestItems, setTeacherResourceRequestItems] = useState([]);
  const [teacherResourcePlannerActivities, setTeacherResourcePlannerActivities] = useState([]);
  const [teacherSocialPublicationDraft, setTeacherSocialPublicationDraft] = useState(createTeacherSocialPublicationDraft);
  const [teacherSocialMediaUploading, setTeacherSocialMediaUploading] = useState(false);
  const [teacherDisciplineDraft, setTeacherDisciplineDraft] = useState(createTeacherDisciplineObservationDraft);
  const [subcomponentDrafts, setSubcomponentDrafts] = useState({});
  const [studentDrafts, setStudentDrafts] = useState({});
  const [showTeacherMenu, setShowTeacherMenu] = useState(false);
  const [teacherPhotoPreview, setTeacherPhotoPreview] = useState('');
  const [teacherAttendanceLocked, setTeacherAttendanceLocked] = useState(false);
  const [teacherAttendanceSaveModal, setTeacherAttendanceSaveModal] = useState(null);
  const teacherPhotoInputRef = useRef(null);
  const teacherMenuRef = useRef(null);
  const classworkCreateMenuRef = useRef(null);
  const classworkUploadInputRef = useRef(null);
  const classworkUploadAppendRef = useRef(true);
  const isAttendanceLikeSection = activeTeacherSection === 'attendance' || activeTeacherSection === 'guidance_routine';

  const overviewShellQuery = useQuery({
    queryKey: ['campus', 'teacher', 'overview', 'shell', teacherQueryScope],
    queryFn: getCampusTeacherOverviewShell,
    retry: false,
    staleTime: 30_000,
    enabled: !previewEnabled && Boolean(authUser?.id),
  });

  const overviewMetricsQuery = useQuery({
    queryKey: ['campus', 'teacher', 'overview', 'metrics', teacherQueryScope],
    queryFn: getCampusTeacherOverviewMetrics,
    retry: false,
    staleTime: 30_000,
    enabled: !previewEnabled && Boolean(authUser?.id),
  });

  const isOverviewMetricsLoading = !previewEnabled && overviewShellQuery.isSuccess && overviewMetricsQuery.isLoading;

  const dashboardCalendarMonthKey = useMemo(
    () => `${dashboardCalendarMonth.getFullYear()}-${String(dashboardCalendarMonth.getMonth() + 1).padStart(2, '0')}`,
    [dashboardCalendarMonth]
  );

  const teacherDashboardCalendarQuery = useQuery({
    queryKey: ['campus', 'teacher', 'calendar', teacherQueryScope, dashboardCalendarMonthKey],
    queryFn: () => getCampusTeacherCalendar({ month: dashboardCalendarMonthKey }),
    enabled: !previewEnabled && Boolean(authUser?.id) && activeTeacherSection === 'dashboard',
    retry: false,
    staleTime: 30_000,
  });

  const courseDetailQuery = useQuery({
    queryKey: ['campus', 'teacher', 'course', teacherQueryScope, selectedCourseId],
    queryFn: () => getCampusTeacherCourseDetail(selectedCourseId),
    enabled: !previewEnabled && Boolean(selectedCourseId),
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!previewEnabled && activeCourseWorkspaceTab === 'posts' && selectedCourseId) {
      courseDetailQuery.refetch();
    }
  }, [activeCourseWorkspaceTab, courseDetailQuery.refetch, previewEnabled, selectedCourseId]);

  useEffect(() => {
    if (!previewEnabled && activeCourseWorkspaceTab === 'gradebook' && selectedCourseId) {
      courseDetailQuery.refetch();
    }
  }, [activeCourseWorkspaceTab, courseDetailQuery.refetch, previewEnabled, selectedCourseId]);

  const timelineCourseDetailQuery = useQuery({
    queryKey: ['campus', 'teacher', 'course', teacherQueryScope, timelineCourseId],
    queryFn: () => getCampusTeacherCourseDetail(timelineCourseId),
    enabled: !previewEnabled && Boolean(timelineCourseId) && timelineCourseId !== selectedCourseId,
    retry: false,
    staleTime: 30_000,
  });

  const teacherAttendanceQuery = useQuery({
    queryKey: ['campus', 'teacher', 'attendance', teacherQueryScope, teacherAttendanceCourseId, teacherAttendanceType, teacherAttendanceDate, teacherAttendanceClassSessionKey],
    queryFn: () => getCampusTeacherAttendance({
      courseId: teacherAttendanceCourseId,
      attendanceType: teacherAttendanceType,
      date: teacherAttendanceDate,
      classSessionKey: teacherAttendanceType === 'subject_class' ? teacherAttendanceClassSessionKey : '',
    }),
    enabled: !previewEnabled && isAttendanceLikeSection && Boolean(teacherAttendanceCourseId) && Boolean(teacherAttendanceDate),
    retry: false,
    staleTime: 10_000,
  });

  const teacherResourceItemsQuery = useQuery({
    queryKey: ['hr', 'teacher', 'supply-items'],
    queryFn: () => getHrSupplyItems({ status: 'active' }),
    enabled: !previewEnabled && activeTeacherSection === 'resource_requests',
    retry: false,
    staleTime: 30_000,
  });

  const teacherPlannerCyclesQuery = useQuery({
    queryKey: ['hr', 'teacher', 'planner-cycles'],
    queryFn: () => getHrPlannerCycles({ status: 'active' }),
    enabled: !previewEnabled && activeTeacherSection === 'resource_requests',
    retry: false,
    staleTime: 30_000,
  });

  const teacherResourceRequestsQuery = useQuery({
    queryKey: ['hr', 'teacher', 'supply-requests'],
    queryFn: () => getHrSupplyRequests({ requestType: 'material' }),
    enabled: !previewEnabled && activeTeacherSection === 'resource_requests',
    retry: false,
    staleTime: 20_000,
  });

  const teacherSocialPublicationRequestsQuery = useQuery({
    queryKey: ['campus', 'teacher', 'parent-feed-requests', teacherQueryScope],
    queryFn: getCampusTeacherParentFeedRequests,
    enabled: !previewEnabled && activeTeacherSection === 'social_publications',
    retry: false,
    staleTime: 20_000,
  });

  const teacherDisciplineCourseDetailQuery = useQuery({
    queryKey: ['campus', 'teacher', 'discipline-course', teacherQueryScope, teacherDisciplineDraft.courseId],
    queryFn: () => getCampusTeacherCourseDetail(teacherDisciplineDraft.courseId),
    enabled: !previewEnabled && activeTeacherSection === 'school_coexistence' && Boolean(teacherDisciplineDraft.courseId),
    retry: false,
    staleTime: 30_000,
  });

  const teacherDisciplineObservationsQuery = useQuery({
    queryKey: ['campus', 'teacher', 'discipline-observations', teacherQueryScope],
    queryFn: getCampusTeacherDisciplineObservations,
    enabled: !previewEnabled && activeTeacherSection === 'school_coexistence',
    retry: false,
    staleTime: 20_000,
  });

  const updateGradingSchemeMutation = useMutation({
    mutationFn: ({ courseId, payload }) => updateCampusTeacherGradingScheme(courseId, payload),
    onSuccess: (detail) => {
      if (selectedCourseId && detail?.course) {
        queryClient.setQueryData(['campus', 'teacher', 'course', teacherQueryScope, selectedCourseId], detail);
      }
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'course', selectedCourseId] });
    },
  });

  const updateAcademicContentMutation = useMutation({
    mutationFn: ({ courseId, payload }) => updateCampusTeacherAcademicContent(courseId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'course', selectedCourseId] });
    },
  });

  const createPostMutation = useMutation({
    mutationFn: createCampusTeacherPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'calendar'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'course', selectedCourseId] });
    },
  });

  const updatePostMutation = useMutation({
    mutationFn: ({ postId, payload }) => updateCampusTeacherPost(postId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'calendar'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'course', selectedCourseId] });
    },
  });

  const saveGradesMutation = useMutation({
    mutationFn: ({ courseId, studentId, payload }) => saveCampusTeacherStudentGrades(courseId, studentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'course', selectedCourseId] });
    },
  });

  const saveTeacherAttendanceMutation = useMutation({
    mutationFn: saveCampusTeacherAttendance,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'attendance'] });
      setTeacherAttendanceRecords(response?.attendance?.records || []);
      setTeacherAttendanceLocked(true);
      setTeacherAttendanceSaveModal({
        type: 'success',
        title: 'Asistencia guardada',
        message: 'La planilla quedó guardada y ya está disponible para el acudiente en Académico > Asistencia.',
      });
      setNotice({ type: 'success', text: 'Asistencia guardada.' });
    },
    onError: (error) => {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo guardar la asistencia.' });
    },
  });

  const uploadTeacherPhotoMutation = useMutation({
    mutationFn: ({ file, preferredName }) => uploadCampusTeacherProfilePhoto(file, preferredName),
    onSuccess: (response) => {
      setTeacherPhotoPreview(String(response?.teacher?.photoThumbUrl || response?.teacher?.photoUrl || ''));
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'overview'] });
      setNotice({ type: 'success', text: 'Foto del docente guardada en Cloudinary.' });
    },
    onError: (error) => {
      setTeacherPhotoPreview(String(workspace.teacher?.photoThumbUrl || workspace.teacher?.photoUrl || ''));
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo guardar la foto del docente.' });
    },
  });

  const createTeacherResourceRequestMutation = useMutation({
    mutationFn: createHrSupplyRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'teacher', 'supply-requests'] });
      queryClient.invalidateQueries({ queryKey: ['hr', 'teacher', 'planner-cycles'] });
    },
  });

  const createTeacherSocialPublicationMutation = useMutation({
    mutationFn: createCampusTeacherParentFeedRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'parent-feed-requests'] });
    },
  });

  const createTeacherDisciplineObservationMutation = useMutation({
    mutationFn: createCampusTeacherDisciplineObservation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'discipline-observations'] });
    },
  });

  const emptyTeacherWorkspace = useMemo(
    () => ({ teacher: null, courses: [], gradingScale: { minScore: 0, maxScore: 100, passingScore: 70 }, weeklySchedule: null, recentPosts: [] }),
    []
  );

  const workspace = useMemo(() => {
    if (previewEnabled) {
      return {
        teacher: previewWorkspace.teacher,
        courses: previewWorkspace.courses,
        gradingScale: previewWorkspace.gradingScale || { minScore: 0, maxScore: 100, passingScore: 70 },
        weeklySchedule: previewWorkspace.weeklySchedule,
        recentPosts: previewWorkspace.recentPosts,
      };
    }

    const overviewData = mergeTeacherOverviewShellAndMetrics(
      overviewShellQuery.data,
      overviewMetricsQuery.data
    );
    const overviewTeacherId = String(overviewData?.teacher?.userId || '');
    const authUserId = String(authUser?.id || '');
    if (overviewData && overviewTeacherId && authUserId && overviewTeacherId !== authUserId) {
      return emptyTeacherWorkspace;
    }

    return overviewData || emptyTeacherWorkspace;
  }, [authUser?.id, emptyTeacherWorkspace, overviewMetricsQuery.data, overviewShellQuery.data, previewEnabled, previewWorkspace]);

  const courses = workspace.courses || [];
  const guidanceRoutineCourses = useMemo(
    () => courses.filter((course) => course.courseType === 'guidance_routine'),
    [courses]
  );
  const academicCourses = useMemo(
    () => courses.filter((course) => course.courseType !== 'guidance_routine'),
    [courses]
  );
  const attendanceCourses = activeTeacherSection === 'guidance_routine' ? guidanceRoutineCourses : academicCourses;
  const attendanceSubjectGroups = useMemo(
    () => groupCoursesBySubject(attendanceCourses),
    [attendanceCourses]
  );
  const selectedAttendanceSubject = useMemo(
    () => attendanceSubjectGroups.find((subject) => subject.key === teacherAttendanceSubjectKey) || null,
    [attendanceSubjectGroups, teacherAttendanceSubjectKey]
  );
  const teacherAttendanceCoursesForSubject = useMemo(
    () => (selectedAttendanceSubject ? selectedAttendanceSubject.courses : []),
    [selectedAttendanceSubject]
  );
  const availableTeacherSectionOptions = useMemo(
    () => teacherSectionOptions.filter((option) => option.key !== 'guidance_routine' || guidanceRoutineCourses.length > 0),
    [guidanceRoutineCourses.length]
  );
    const gradingScale = useMemo(() => normalizeCampusGradingScale(workspace.gradingScale || {}), [workspace.gradingScale]);
  const subjectGroups = useMemo(() => groupCoursesBySubject(academicCourses), [academicCourses]);
  const selectedSubject = useMemo(
    () => subjectGroups.find((subject) => subject.key === selectedSubjectKey) || null,
    [selectedSubjectKey, subjectGroups]
  );
  const visibleCourses = useMemo(
    () => (selectedSubject ? selectedSubject.courses : []),
    [selectedSubject]
  );
  const isCourseManagementSection = activeTeacherSection === 'academic_management' || activeTeacherSection === 'academic_content';
  const portalSectionCourses = useMemo(
    () => (isCourseManagementSection && selectedSubject ? visibleCourses : academicCourses),
    [academicCourses, isCourseManagementSection, selectedSubject, visibleCourses]
  );
  const portalSectionGradeGroups = useMemo(
    () => buildCourseGradeGroups(portalSectionCourses),
    [portalSectionCourses]
  );
  const selectedPortalGradeGroup = useMemo(
    () => portalSectionGradeGroups.find((group) => group.key === selectedPortalGradeKey) || null,
    [portalSectionGradeGroups, selectedPortalGradeKey]
  );
  const selectedPortalGradeCourses = selectedPortalGradeGroup?.courses || [];
  const recentPosts = workspace.recentPosts || [];
  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId]
  );
  const selectedTeacherAttendanceCourse = useMemo(
    () => attendanceCourses.find((course) => course.id === teacherAttendanceCourseId) || null,
    [attendanceCourses, teacherAttendanceCourseId]
  );
  const teacherAttendanceClassSessions = useMemo(
    () => sanitizeClassSessions(selectedTeacherAttendanceCourse?.classSessions || []),
    [selectedTeacherAttendanceCourse]
  );
  const teacherAttendanceSummary = useMemo(() => teacherAttendanceRecords.reduce((summaryRecord, record) => {
    const status = teacherAttendanceStatusOptions.some((option) => option.value === record.status) ? record.status : 'present';
    return { ...summaryRecord, [status]: Number(summaryRecord[status] || 0) + 1, total: Number(summaryRecord.total || 0) + 1 };
  }, { total: 0, present: 0, late: 0, absent: 0, excused: 0 }), [teacherAttendanceRecords]);
  const timelineCourse = useMemo(
    () => courses.find((course) => course.id === timelineCourseId) || null,
    [courses, timelineCourseId]
  );
  const selectedCourseDetail = previewEnabled
    ? (selectedCourse ? previewWorkspace.courseDetails?.[selectedCourse.id] || null : null)
    : (courseDetailQuery.data || null);
  const selectedCourseGradingScale = useMemo(
    () => normalizeCampusGradingScale(selectedCourseDetail?.course?.gradingScale || selectedCourse?.gradingScale || workspace.gradingScale || {}),
    [selectedCourseDetail, selectedCourse, workspace.gradingScale]
  );
  const timelineCourseDetail = previewEnabled
    ? (timelineCourse ? previewWorkspace.courseDetails?.[timelineCourse.id] || null : null)
    : (timelineCourseId === selectedCourseId ? selectedCourseDetail : (timelineCourseDetailQuery.data || null));
  const summary = buildSummary(academicCourses, recentPosts, previewEnabled ? previewWorkspace : null);
  const teacherName = useMemo(() => {
    const authName = authUser?.name || authUser?.username;
    const overviewTeacher = workspace.teacher;
    if (
      overviewTeacher?.userId
      && authUser?.id
      && String(overviewTeacher.userId) !== String(authUser.id)
    ) {
      return authName || 'Docente';
    }
    return overviewTeacher?.name || authName || 'Docente';
  }, [authUser?.id, authUser?.name, authUser?.username, workspace.teacher]);
  const teacherWeeklySchedule = useMemo(
    () => workspace.weeklySchedule || buildTeacherWeeklyScheduleFallback(courses),
    [courses, workspace.weeklySchedule]
  );
  const postFormCourse = useMemo(
    () => courses.find((course) => course.id === postDraft.courseId) || selectedCourse || null,
    [courses, postDraft.courseId, selectedCourse]
  );
  const postFormClassSchedule = useMemo(() => {
    const activeCourseId = String(postDraft.courseId || '').trim();
    if (!activeCourseId) {
      return [];
    }

    const overviewSessions = String(postFormCourse?.id || '') === activeCourseId
      ? sanitizeClassSessions(postFormCourse?.classSessions || [])
      : [];

    const detailMatchesCourse = activeCourseId === selectedCourseId
      && String(selectedCourseDetail?.course?.id || '') === activeCourseId;
    const detailSessions = detailMatchesCourse
      ? sanitizeClassSessions(selectedCourseDetail?.course?.classSessions || [])
      : [];

    const resolvedSessions = overviewSessions.length > 0 ? overviewSessions : detailSessions;
    return mapClassSessionsToDraft(resolvedSessions);
  }, [
    postDraft.courseId,
    postFormCourse,
    selectedCourseDetail,
    selectedCourseId,
  ]);
  const isPostFormScheduleLoading = Boolean(
    postDraft.courseId
    && postDraft.courseId === selectedCourseId
    && courseDetailQuery.isLoading
    && postFormClassSchedule.length === 0
  );
  const integralOverview = useMemo(
    () => buildTeacherManagementOverview(academicCourses, recentPosts, previewEnabled ? previewWorkspace : null),
    [previewEnabled, academicCourses, previewWorkspace, recentPosts]
  );
  const activeSectionOption = teacherSectionOptions.find((option) => option.key === activeTeacherSection) || null;
  const activeSectionLabel = isCourseManagementSection && selectedSubject
    ? selectedSubject.label
    : (activeSectionOption?.label || 'Panel docente');
  const activeSectionDescription = isCourseManagementSection && selectedSubject
    ? (activeTeacherSection === 'academic_content'
      ? `Planea los temas de estudio de ${selectedSubject.label} por periodo.`
      : `Gestiona evaluación y contenidos de ${selectedSubject.label}.`)
    : (activeSectionOption?.description || 'Gestión del docente');
  const selectedCourseAcademicPeriods = useMemo(
    () => getCourseAcademicPeriods(selectedCourseDetail?.course || selectedCourse),
    [selectedCourseDetail, selectedCourse]
  );
  const selectedCourseDraftAcademicPeriods = useMemo(
    () => academicPeriodDrafts.map((period, periodIndex) => ({
      key: slugifyComponentKey(period.key || period.name || `period_${periodIndex + 1}`),
      name: String(period.name || '').trim(),
      weight: Number(period.weight || 0),
      order: Number(period.order ?? (periodIndex + 1) * 10),
      startDate: String(period.startDate || '').trim(),
      endDate: String(period.endDate || '').trim(),
      gradingComponents: (period.gradingComponents || []).map((component, componentIndex) => ({
        key: slugifyComponentKey(component.key || component.name || `component_${componentIndex + 1}`),
        name: String(component.name || '').trim(),
        weight: Number(component.weight || 0),
        order: Number(component.order ?? (componentIndex + 1) * 10),
        subcomponents: (component.subcomponents || []).map((subcomponent, subcomponentIndex) => ({
          key: slugifyComponentKey(subcomponent.key || subcomponent.name || `subcomponent_${subcomponentIndex + 1}`),
          name: String(subcomponent.name || '').trim(),
          weight: Number(subcomponent.weight || 0),
          date: String(subcomponent.date || '').trim(),
          topic: String(subcomponent.topic || '').trim(),
          description: String(subcomponent.description || '').trim(),
          order: Number(subcomponent.order ?? (subcomponentIndex + 1)),
        })),
      })),
    })),
    [academicPeriodDrafts]
  );
  const assignmentComponentOptions = useMemo(() => {
    const sourcePeriods = selectedCourseAcademicPeriods.length > 0
      ? selectedCourseAcademicPeriods
      : selectedCourseDraftAcademicPeriods;

    return buildAssignmentComponentOptions(sourcePeriods);
  }, [selectedCourseAcademicPeriods, selectedCourseDraftAcademicPeriods]);
  const gradebookAssignmentOptions = useMemo(
    () => buildGradebookAssignmentOptions(selectedCourseDraftAcademicPeriods),
    [selectedCourseDraftAcademicPeriods]
  );
  const selectedGradebookAssignment = useMemo(
    () => gradebookAssignmentOptions.find((assignment) => assignment.key === selectedGradebookAssignmentKey) || gradebookAssignmentOptions[0] || null,
    [gradebookAssignmentOptions, selectedGradebookAssignmentKey]
  );
  const gradingCourseTitle = selectedCourse ? getCourseOptionLabel(selectedCourse) : 'Curso';
  const gradingPeriods = Array.isArray(academicPeriodDrafts) ? academicPeriodDrafts : [];
  const selectedCourseSchedule = useMemo(
    () => sanitizeClassSessions(selectedCourseDetail?.course?.classSessions || selectedCourse?.classSessions || []),
    [selectedCourseDetail, selectedCourse]
  );
  const selectedCourseCardStats = useMemo(
    () => (selectedCourse ? buildCourseCardStats(selectedCourse, previewEnabled ? previewWorkspace : null) : null),
    [previewEnabled, previewWorkspace, selectedCourse]
  );
  const selectedCoursePosts = useMemo(() => {
    if (!selectedCourse) {
      return [];
    }

    const detailedPosts = selectedCourseDetail?.posts || selectedCourse.posts;
    if (Array.isArray(detailedPosts) && detailedPosts.length > 0) {
      return detailedPosts;
    }

    return recentPosts.filter((post) => post.courseId === selectedCourse.id);
  }, [recentPosts, selectedCourse, selectedCourseDetail]);
  const selectedCourseAssignmentPosts = useMemo(
    () => selectedCoursePosts.filter((post) => String(post?.status || '').toLowerCase() !== 'archived'),
    [selectedCoursePosts]
  );
  const selectedCourseTimelineCalendar = useMemo(
    () => buildCourseTimelineCalendar(timelineMonth, selectedCourseSchedule, selectedCoursePosts),
    [timelineMonth, selectedCoursePosts, selectedCourseSchedule]
  );
  const timelineCourseSchedule = useMemo(
    () => sanitizeClassSessions(timelineCourseDetail?.course?.classSessions || timelineCourse?.classSessions || []),
    [timelineCourseDetail, timelineCourse]
  );
  const timelineCoursePosts = useMemo(() => {
    if (!timelineCourse) {
      return [];
    }

    const detailedPosts = timelineCourseDetail?.posts || timelineCourse.posts;
    if (Array.isArray(detailedPosts) && detailedPosts.length > 0) {
      return detailedPosts;
    }

    return recentPosts.filter((post) => post.courseId === timelineCourse.id);
  }, [recentPosts, timelineCourse, timelineCourseDetail]);
  const timelineCourseCalendar = useMemo(
    () => buildCourseTimelineCalendar(timelineMonth, timelineCourseSchedule, timelineCoursePosts),
    [timelineCoursePosts, timelineCourseSchedule, timelineMonth]
  );
  const selectedTimelineDay = useMemo(
    () => timelineCourseCalendar.find((cell) => !cell.empty && cell.dateValue === selectedTimelineDate) || null,
    [selectedTimelineDate, timelineCourseCalendar]
  );
  const dashboardCalendarPosts = useMemo(() => {
    const mapCalendarItemToPost = (item) => ({
      id: item.id,
      courseId: item.courseId,
      courseTitle: item.courseTitle,
      subject: item.subject,
      type: item.type,
      title: item.title,
      body: item.detail || item.body,
      deliveryMode: item.deliveryMode,
      dueAt: item.dueAt,
      scheduledClassDate: item.scheduledClassDate,
      status: item.status || 'published',
    });

    if (previewEnabled) {
      return (Array.isArray(recentPosts) ? recentPosts : [])
        .filter((post) => isEvaluativePostType(post.type) && String(post.status || '').toLowerCase() !== 'archived')
        .filter((post) => {
          const dateValue = getTimelineDateValue(post);
          return dateValue && dateValue.startsWith(`${dashboardCalendarMonthKey}-`);
        });
    }

    return (teacherDashboardCalendarQuery.data?.items || []).map(mapCalendarItemToPost);
  }, [dashboardCalendarMonthKey, previewEnabled, recentPosts, teacherDashboardCalendarQuery.data?.items]);
  const dashboardCalendarGrid = useMemo(
    () => buildCourseTimelineCalendar(dashboardCalendarMonth, [], dashboardCalendarPosts),
    [dashboardCalendarMonth, dashboardCalendarPosts]
  );
  const selectedDashboardCalendarDay = useMemo(
    () => dashboardCalendarGrid.find((cell) => !cell.empty && cell.dateValue === selectedDashboardCalendarDate) || null,
    [dashboardCalendarGrid, selectedDashboardCalendarDate]
  );
  const upcomingDashboardActivities = useMemo(() => {
    const todayValue = buildLocalDateValue(new Date());

    return [...dashboardCalendarPosts]
      .filter((post) => getTimelineDateValue(post) >= todayValue)
      .sort((left, right) => getTimelineDateValue(left).localeCompare(getTimelineDateValue(right)))
      .slice(0, 6)
      .map((post) => ({
        id: post.id,
        title: post.title || formatPostTypeLabel(post.type),
        typeLabel: formatPostTypeLabel(post.type),
        courseTitle: String(post.subject || post.courseTitle || 'Curso').trim(),
        dateLabel: formatTimelineDateLabel(getTimelineDateValue(post)),
        deliveryLabel: formatDeliveryLabel(post),
        description: post.body || 'Actividad programada.',
      }));
  }, [dashboardCalendarPosts]);
  const teacherResourceItems = teacherResourceItemsQuery.data?.data?.items || teacherResourceItemsQuery.data?.items || [];
  const teacherResourceRequests = teacherResourceRequestsQuery.data?.data?.requests || teacherResourceRequestsQuery.data?.requests || [];
  const teacherPlannerCycles = teacherPlannerCyclesQuery.data?.data?.cycles || teacherPlannerCyclesQuery.data?.cycles || [];
  const teacherSocialPublicationRequests = teacherSocialPublicationRequestsQuery.data || [];
  const selectedSocialPublicationCourse = courses.find((course) => course.id === teacherSocialPublicationDraft.courseId) || null;
  const teacherDisciplineObservations = teacherDisciplineObservationsQuery.data?.observations || [];
  const selectedDisciplineCourse = courses.find((course) => course.id === teacherDisciplineDraft.courseId) || null;
  const selectedDisciplineCourseDetail = previewEnabled
    ? (selectedDisciplineCourse ? previewWorkspace.courseDetails?.[selectedDisciplineCourse.id] || null : null)
    : (teacherDisciplineDraft.courseId === selectedCourseId ? selectedCourseDetail : (teacherDisciplineCourseDetailQuery.data || null));
  const disciplineStudentOptions = selectedDisciplineCourseDetail?.students || [];
  const selectedDisciplineStudent = disciplineStudentOptions.find((student) => student.studentId === teacherDisciplineDraft.studentId) || null;
  const selectedTeacherResourceItem = teacherResourceItems.find((item) => item.id === teacherResourceRequestDraft.itemId) || null;
  const isTeacherResourceCustomItem = teacherResourceRequestDraft.itemId === '__other__';
  const selectedTeacherPlannerCycle = teacherPlannerCycles.find((cycle) => cycle.id === teacherResourceRequestDraft.plannerCycleId) || null;
  const isBusy = updateGradingSchemeMutation.isPending
    || updateAcademicContentMutation.isPending
    || createPostMutation.isPending
    || updatePostMutation.isPending
    || saveGradesMutation.isPending
    || saveTeacherAttendanceMutation.isPending
    || uploadTeacherPhotoMutation.isPending
    || createTeacherResourceRequestMutation.isPending
    || createTeacherSocialPublicationMutation.isPending
    || createTeacherDisciplineObservationMutation.isPending
    || teacherSocialMediaUploading;

  const onTeacherAttendanceRecordChange = (studentId, field, value) => {
    if (teacherAttendanceLocked) {
      return;
    }

    setTeacherAttendanceRecords((currentRecords) => currentRecords.map((record) => (
      record.studentId === studentId ? { ...record, [field]: value } : record
    )));
  };

  const onMarkAllTeacherAttendance = (status) => {
    if (teacherAttendanceLocked) {
      return;
    }

    setTeacherAttendanceRecords((currentRecords) => currentRecords.map((record) => ({
      ...record,
      status,
      notes: status === 'present' ? '' : record.notes,
    })));
  };

  const onTeacherAttendanceSubjectChange = (subjectKey) => {
    setTeacherAttendanceSubjectKey(subjectKey);
    const nextSubject = attendanceSubjectGroups.find((subject) => subject.key === subjectKey);
    const nextCourse = nextSubject?.courses?.[0];
    setTeacherAttendanceCourseId(nextCourse?.id || '');
  };

  const onSubmitTeacherAttendance = async (event) => {
    event.preventDefault();

    if (!teacherAttendanceCourseId) {
      setNotice({ type: 'error', text: teacherAttendanceType === 'subject_class' ? 'Selecciona asignatura y curso para tomar asistencia.' : 'Selecciona un curso para tomar asistencia.' });
      return;
    }

    if (!teacherAttendanceDate) {
      setNotice({ type: 'error', text: 'Selecciona la fecha de asistencia.' });
      return;
    }

    saveTeacherAttendanceMutation.mutate({
      courseId: teacherAttendanceCourseId,
      attendanceType: teacherAttendanceType,
      date: teacherAttendanceDate,
      classSessionKey: teacherAttendanceType === 'subject_class' ? teacherAttendanceClassSessionKey : '',
      records: teacherAttendanceRecords.map((record) => ({
        studentId: record.studentId,
        status: record.status,
        notes: record.notes || '',
      })),
    });
  };

  useEffect(() => {
    setTeacherPhotoPreview(String(workspace.teacher?.photoThumbUrl || workspace.teacher?.photoUrl || ''));
  }, [workspace.teacher?.photoThumbUrl, workspace.teacher?.photoUrl]);

  const onTeacherPhotoChange = (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile) {
      return;
    }

    if (!String(selectedFile.type || '').startsWith('image/')) {
      setNotice({ type: 'error', text: 'Selecciona un archivo de imagen válido.' });
      return;
    }

    const temporaryPreview = URL.createObjectURL(selectedFile);
    setTeacherPhotoPreview(temporaryPreview);

    uploadTeacherPhotoMutation.mutate(
      { file: selectedFile, preferredName: teacherName },
      {
        onSettled: () => {
          URL.revokeObjectURL(temporaryPreview);
        },
      }
    );
  };

  const onLogout = () => {
    setShowTeacherMenu(false);
    logout();
    navigate(LOGIN_PATH, { replace: true });
  };

  useEffect(() => {
    if (!showTeacherMenu || typeof document === 'undefined') {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (teacherMenuRef.current && !teacherMenuRef.current.contains(event.target)) {
        setShowTeacherMenu(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowTeacherMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showTeacherMenu]);

  useEffect(() => {
    if (!showClassworkCreateMenu || typeof document === 'undefined') {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (classworkCreateMenuRef.current && !classworkCreateMenuRef.current.contains(event.target)) {
        setShowClassworkCreateMenu(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowClassworkCreateMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showClassworkCreateMenu]);

  useEffect(() => {
    setSelectedTimelineDate('');
  }, [timelineCourseId, timelineMonth]);

  useEffect(() => {
    setSelectedDashboardCalendarDate('');
  }, [dashboardCalendarMonthKey]);

  useEffect(() => {
    if (!academicCourses.length) {
      if (timelineCourseId) {
        setTimelineCourseId('');
      }
    } else if (!timelineCourseId || !academicCourses.some((course) => course.id === timelineCourseId)) {
      setTimelineCourseId(academicCourses[0].id);
    }

    if (activeTeacherSection === 'guidance_routine') {
      if (!teacherAttendanceCourseId || !attendanceCourses.some((course) => course.id === teacherAttendanceCourseId)) {
        setTeacherAttendanceCourseId(attendanceCourses[0]?.id || '');
      }
    }
  }, [academicCourses, activeTeacherSection, attendanceCourses, teacherAttendanceCourseId, timelineCourseId]);

  useEffect(() => {
    if (activeTeacherSection !== 'attendance') {
      return;
    }

    if (!attendanceSubjectGroups.length) {
      if (teacherAttendanceSubjectKey) {
        setTeacherAttendanceSubjectKey('');
      }
      return;
    }

    if (!teacherAttendanceSubjectKey || !attendanceSubjectGroups.some((subject) => subject.key === teacherAttendanceSubjectKey)) {
      setTeacherAttendanceSubjectKey(attendanceSubjectGroups[0].key);
    }
  }, [activeTeacherSection, attendanceSubjectGroups, teacherAttendanceSubjectKey]);

  useEffect(() => {
    if (activeTeacherSection !== 'attendance') {
      return;
    }

    const subjectCourses = selectedAttendanceSubject?.courses || [];
    if (!subjectCourses.length) {
      if (teacherAttendanceCourseId) {
        setTeacherAttendanceCourseId('');
      }
      return;
    }

    if (!teacherAttendanceCourseId || !subjectCourses.some((course) => course.id === teacherAttendanceCourseId)) {
      setTeacherAttendanceCourseId(subjectCourses[0].id);
    }
  }, [activeTeacherSection, selectedAttendanceSubject, teacherAttendanceCourseId]);

  useEffect(() => {
    if (activeTeacherSection === 'guidance_routine' && teacherAttendanceType !== 'guidance_routine') {
      setTeacherAttendanceType('guidance_routine');
      return;
    }

    if (activeTeacherSection === 'attendance' && teacherAttendanceType !== 'subject_class') {
      setTeacherAttendanceType('subject_class');
    }
  }, [activeTeacherSection, teacherAttendanceType]);

  useEffect(() => {
    if (teacherAttendanceType !== 'subject_class') {
      if (teacherAttendanceClassSessionKey) {
        setTeacherAttendanceClassSessionKey('');
      }
      return;
    }

    if (!teacherAttendanceClassSessions.length) {
      if (teacherAttendanceClassSessionKey) {
        setTeacherAttendanceClassSessionKey('');
      }
      return;
    }

    if (!teacherAttendanceClassSessionKey || !teacherAttendanceClassSessions.some((session) => buildSessionKey(session) === teacherAttendanceClassSessionKey)) {
      setTeacherAttendanceClassSessionKey(buildSessionKey(teacherAttendanceClassSessions[0]));
    }
  }, [teacherAttendanceClassSessionKey, teacherAttendanceClassSessions, teacherAttendanceType]);

  useEffect(() => {
    setTeacherAttendanceRecords(teacherAttendanceQuery.data?.attendance?.records || []);
    setTeacherAttendanceLocked(Boolean(teacherAttendanceQuery.data?.attendance?.id));
  }, [teacherAttendanceQuery.data]);

  useEffect(() => {
    if (!courses.length) {
      setTeacherDisciplineDraft((currentDraft) => (currentDraft.courseId ? { ...currentDraft, courseId: '', studentId: '' } : currentDraft));
      return;
    }

    setTeacherDisciplineDraft((currentDraft) => {
      if (currentDraft.courseId && courses.some((course) => course.id === currentDraft.courseId)) {
        return currentDraft;
      }
      return { ...currentDraft, courseId: courses[0].id, studentId: '' };
    });
  }, [courses]);

  useEffect(() => {
    setTeacherDisciplineDraft((currentDraft) => {
      if (!currentDraft.courseId) {
        return currentDraft;
      }
      if (currentDraft.studentId && disciplineStudentOptions.some((student) => student.studentId === currentDraft.studentId)) {
        return currentDraft;
      }
      return { ...currentDraft, studentId: disciplineStudentOptions[0]?.studentId || '' };
    });
  }, [disciplineStudentOptions, teacherDisciplineDraft.courseId]);

  useEffect(() => {
    if (!portalSectionGradeGroups.length) {
      if (selectedPortalGradeKey) {
        setSelectedPortalGradeKey('');
      }
      return;
    }

    if (!selectedPortalGradeKey || !portalSectionGradeGroups.some((group) => group.key === selectedPortalGradeKey)) {
      const firstGroup = portalSectionGradeGroups[0];
      const firstCourse = firstGroup.courses[0] || null;
      setSelectedPortalGradeKey(firstGroup.key);
      if (firstCourse) {
        setTimelineCourseId(firstCourse.id);
        if (!selectedCourseId || !firstGroup.courses.some((course) => course.id === selectedCourseId)) {
          setSelectedCourseId(firstCourse.id);
        }
      }
    }
  }, [portalSectionGradeGroups, selectedCourseId, selectedPortalGradeKey]);

  useEffect(() => {
    setSubcomponentDrafts({});
    setOpenGradebookRows({});
    setOpenGradebookPeriods({});
    setOpenGradebookComponents({});
  }, [selectedCourseId]);

  useEffect(() => {
    if (!selectedTimelineDay || typeof document === 'undefined') {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setSelectedTimelineDate('');
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [selectedTimelineDay]);

  useEffect(() => {
    if (!activeIntegralModal || typeof document === 'undefined') {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setActiveIntegralModal('');
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [activeIntegralModal]);

  useEffect(() => {
    if (!showPostSuccessModal) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setShowPostSuccessModal(false);
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showPostSuccessModal]);

  const classCalendar = useMemo(
    () => buildClassCalendar(calendarMonth, postFormClassSchedule, postDraft.scheduledClassDate),
    [calendarMonth, postDraft.scheduledClassDate, postFormClassSchedule]
  );

  const selectedClassSessions = useMemo(() => {
    if (!postDraft.scheduledClassDate) {
      return [];
    }

    const selectedDate = new Date(`${postDraft.scheduledClassDate}T12:00:00`);
    if (Number.isNaN(selectedDate.getTime())) {
      return [];
    }

    return postFormClassSchedule.filter((session) => Number(session.weekday) === selectedDate.getDay());
  }, [postDraft.scheduledClassDate, postFormClassSchedule]);

  const selectedClassSession = useMemo(
    () => selectedClassSessions.find((session) => buildSessionKey(session) === postDraft.scheduledClassSessionKey) || null,
    [selectedClassSessions, postDraft.scheduledClassSessionKey]
  );
  const postGradebookPeriodOptions = selectedCourseAcademicPeriods.length > 0
    ? selectedCourseAcademicPeriods
    : selectedCourseDraftAcademicPeriods;
  const selectedPostGradebookPeriod = useMemo(
    () => postGradebookPeriodOptions.find((period) => period.key === postDraft.gradebookPeriodKey) || postGradebookPeriodOptions[0] || null,
    [postGradebookPeriodOptions, postDraft.gradebookPeriodKey]
  );
  const postGradebookComponentOptions = selectedPostGradebookPeriod?.gradingComponents || [];
  const selectedPostGradebookComponent = useMemo(
    () => postGradebookComponentOptions.find((component) => component.key === postDraft.gradebookComponentKey) || postGradebookComponentOptions[0] || null,
    [postGradebookComponentOptions, postDraft.gradebookComponentKey]
  );
  const selectedPostGradebookComponentWeightUsed = useMemo(
    () => (selectedPostGradebookComponent?.subcomponents || []).reduce((total, subcomponent) => total + Number(subcomponent.weight || 0), 0),
    [selectedPostGradebookComponent]
  );
  const selectedPostGradebookComponentWeightAvailable = Math.max(0, Number((100 - selectedPostGradebookComponentWeightUsed).toFixed(2)));

  useEffect(() => {
    if (!subjectGroups.length) {
      if (selectedSubjectKey) {
        setSelectedSubjectKey('');
      }
      if (selectedCourseId) {
        setSelectedCourseId('');
      }
      setShowSelectedCourseWorkspace(false);
      return;
    }

    if (!selectedSubject || !selectedSubjectKey) {
      setSelectedSubjectKey(subjectGroups[0].key);
    }
  }, [selectedCourseId, selectedSubject, selectedSubjectKey, subjectGroups]);

  useEffect(() => {
    if (!selectedSubject) {
      return;
    }

    if (!isCourseManagementSection) {
      return;
    }

    if (selectedCourseId && !selectedSubject.courses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId('');
      setShowSelectedCourseWorkspace(false);
    }
  }, [isCourseManagementSection, selectedCourseId, selectedSubject]);

  useEffect(() => {
    setPostDraft((currentDraft) => {
      const nextCourseId = selectedCourse?.id || '';
      return currentDraft.courseId === nextCourseId ? currentDraft : createPostDraft(nextCourseId);
    });
  }, [selectedCourse]);

  useEffect(() => {
    if (editingPostId || assignmentComponentOptions.length === 0) {
      return;
    }

    setPostDraft((currentDraft) => {
      const matchingOption = assignmentComponentOptions.find((option) => option.name === currentDraft.type);
      if (matchingOption) {
        if (
          currentDraft.gradebookPeriodKey === matchingOption.periodKey
          && currentDraft.gradebookComponentKey === matchingOption.key
        ) {
          return currentDraft;
        }

        return {
          ...currentDraft,
          gradebookPeriodKey: matchingOption.periodKey,
          gradebookComponentKey: matchingOption.key,
        };
      }

      const defaultOption = assignmentComponentOptions[0];
      return {
        ...currentDraft,
        type: defaultOption.name,
        gradebookPeriodKey: defaultOption.periodKey,
        gradebookComponentKey: defaultOption.key,
      };
    });
  }, [assignmentComponentOptions, editingPostId, selectedCourseId]);

  useEffect(() => {
    if (!selectedCourse && !selectedCourseDetail?.course) {
      setClassScheduleDraft([]);
      setAcademicPeriodDrafts([]);
      setAcademicContentDrafts([]);
      setStudentDrafts({});
      return;
    }

    setClassScheduleDraft(
      mapClassSessionsToDraft(
        sanitizeClassSessions(selectedCourse?.classSessions || []).length > 0
          ? selectedCourse.classSessions
          : (selectedCourseDetail?.course?.classSessions || [])
      )
    );
    if (selectedCourseDetail?.course) {
      setAcademicPeriodDrafts(buildAcademicPeriodDrafts(selectedCourseDetail.course));
      setAcademicContentDrafts(buildAcademicContentDrafts(selectedCourseDetail.course));
      setAcademicContentTopicInputs({});
      setStudentDrafts(buildStudentDrafts(selectedCourseDetail));
    }
  }, [selectedCourse, selectedCourseDetail]);

  useEffect(() => {
    if (postDraft.deliveryMode !== 'class') {
      return;
    }

    if (!selectedClassSessions.length) {
      setPostDraft((currentDraft) => ({ ...currentDraft, scheduledClassSessionKey: '' }));
      return;
    }

    if (!selectedClassSession) {
      setPostDraft((currentDraft) => ({
        ...currentDraft,
        scheduledClassSessionKey: buildSessionKey(selectedClassSessions[0]),
      }));
    }
  }, [postDraft.deliveryMode, selectedClassSession, selectedClassSessions]);

  const onChangeMaterialLink = (linkIndex, field, value) => {
    setMaterialLinks((currentLinks) => currentLinks.map((link, index) => (
      index === linkIndex ? { ...link, [field]: value } : link
    )));
  };

  const onAddMaterialLink = () => {
    setMaterialLinks((currentLinks) => [...currentLinks, createMaterialLinkDraft()]);
  };

  const onRemoveMaterialLink = (linkIndex) => {
    setMaterialLinks((currentLinks) => {
      const nextLinks = currentLinks.filter((_, index) => index !== linkIndex);
      return nextLinks.length > 0 ? nextLinks : [createMaterialLinkDraft()];
    });
  };

  const onMaterialFilesChange = (event, { append = false } = {}) => {
    const incomingFiles = Array.from(event.target.files || []);
    const acceptedFiles = [];
    const rejectedFiles = [];

    incomingFiles.forEach((file) => {
      if (Number(file.size || 0) > maxMaterialFileBytes) {
        rejectedFiles.push(file.name);
        return;
      }

      acceptedFiles.push(file);
    });

    setMaterialFiles((currentFiles) => {
      const mergedFiles = append ? [...currentFiles, ...acceptedFiles] : acceptedFiles;
      return mergedFiles.slice(0, maxMaterialFileCount);
    });

    if (event.target) {
      event.target.value = '';
    }

    if (rejectedFiles.length > 0) {
      setNotice({
        type: 'error',
        text: `Estos archivos exceden ${Math.round(maxMaterialFileBytes / (1024 * 1024))} MB por archivo: ${rejectedFiles.join(', ')}`,
      });
    }
  };

  const onPickMaterialFiles = (accept, { append = true } = {}) => {
    if (!classworkUploadInputRef.current) {
      return;
    }

    classworkUploadAppendRef.current = append;
    classworkUploadInputRef.current.accept = accept;
    classworkUploadInputRef.current.click();
  };

  const onRemoveMaterialFile = (fileIndex) => {
    setMaterialFiles((currentFiles) => currentFiles.filter((_, index) => index !== fileIndex));
  };

  const onAddWebLink = () => {
    setShowAttachLinkPanel(true);
    onAddMaterialLink();
  };

  const onAddYoutubeLink = () => {
    setShowAttachLinkPanel(true);
    setMaterialLinks((currentLinks) => {
      const nextLinks = [...currentLinks];
      const emptyIndex = nextLinks.findIndex((link) => !String(link.url || '').trim() && !String(link.title || '').trim());
      const youtubeDraft = { title: 'Video de YouTube', url: 'https://www.youtube.com/watch?v=' };

      if (emptyIndex >= 0) {
        nextLinks[emptyIndex] = youtubeDraft;
        return nextLinks;
      }

      return [...nextLinks, youtubeDraft];
    });
  };

  const onAttachOptionClick = (option) => {
    if (option.action === 'link') {
      onAddWebLink();
      return;
    }

    if (option.action === 'youtube') {
      onAddYoutubeLink();
      return;
    }

    if (option.accept) {
      onPickMaterialFiles(option.accept, { append: option.append !== false });
    }
  };

  const openAssignmentComposer = (componentOption = null) => {
    const courseId = selectedCourse?.id || postDraft.courseId || '';
    const nextDraft = createPostDraft(courseId);
    const matchingOption = componentOption && typeof componentOption === 'object'
      ? componentOption
      : assignmentComponentOptions.find((option) => {
        const optionName = normalizePostType(option.name).toLowerCase();
        const preferred = normalizePostType(componentOption).toLowerCase();
        return optionName === preferred || optionName.includes(preferred) || preferred.includes(optionName);
      });

    if (matchingOption) {
      nextDraft.type = matchingOption.name;
      nextDraft.gradebookPeriodKey = matchingOption.periodKey;
      nextDraft.gradebookComponentKey = matchingOption.key;
      nextDraft.addToGradebook = true;
    } else if (assignmentComponentOptions[0]) {
      nextDraft.type = assignmentComponentOptions[0].name;
      nextDraft.gradebookPeriodKey = assignmentComponentOptions[0].periodKey;
      nextDraft.gradebookComponentKey = assignmentComponentOptions[0].key;
      nextDraft.addToGradebook = true;
    }

    setEditingPostId('');
    setPostDraft(nextDraft);
    setMaterialLinks([createMaterialLinkDraft()]);
    setMaterialFiles([]);
    setShowAttachLinkPanel(false);
    setOpenPostMenuId('');
    setShowClassworkCreateMenu(false);
    setShowAssignmentComposer(true);
  };

  const openGradebookForPendingItem = (item) => {
    const post = recentPosts.find((entry) => entry.id === item.id);
    const course = academicCourses.find((entry) => entry.id === (item.courseId || post?.courseId));
    if (!course) {
      return;
    }

    const subjectLabel = normalizeSubjectLabel(course.subject);
    const subjectKey = slugifyComponentKey(subjectLabel) || 'subject';
    const assignmentOptions = buildGradebookAssignmentOptions(getCourseAcademicPeriods(course));
    const assignmentKey = resolveGradebookAssignmentKeyForPostTitle(item.title || post?.title || '', assignmentOptions);

    setActiveIntegralModal('');
    setActiveTeacherSection('academic_management');
    setSelectedSubjectKey(subjectKey);
    setSelectedCourseId(course.id);
    setTimelineCourseId(course.id);
    setSelectedPortalGradeKey(getCourseGradeGroupKey(course));
    setShowSelectedCourseWorkspace(true);
    setActiveCourseWorkspaceTab('gradebook');
    setGradebookMode('assignment');
    setSelectedGradebookAssignmentKey(assignmentKey || assignmentOptions[0]?.key || '');
  };

  const closeAssignmentComposer = () => {
    setEditingPostId('');
    setPostDraft(createPostDraft(selectedCourse?.id || ''));
    setMaterialLinks([createMaterialLinkDraft()]);
    setMaterialFiles([]);
    setShowAttachLinkPanel(false);
    setShowAssignmentComposer(false);
    setOpenPostMenuId('');
  };

  const onCreatePost = async (event) => {
    event.preventDefault();
    const normalizedLinks = materialLinks
      .map((item) => ({ title: String(item.title || '').trim(), url: String(item.url || '').trim() }))
      .filter((item) => item.url);

    const payload = {
      courseId: String(postDraft.courseId || '').trim(),
      type: normalizePostType(postDraft.type || ''),
      title: String(postDraft.title || '').trim(),
      body: String(postDraft.body || '').trim(),
      status: String(postDraft.status || 'published').trim(),
      deliveryMode: String(postDraft.deliveryMode || 'date').trim(),
      dueAt: String(postDraft.dueAt || '').trim(),
      scheduledClassDate: buildClassDateIso(postDraft.scheduledClassDate, selectedClassSession?.startTime || '00:00'),
      scheduledClassSession: selectedClassSession
        ? {
          weekday: Number(selectedClassSession.weekday),
          startTime: selectedClassSession.startTime,
          endTime: selectedClassSession.endTime,
          label: selectedClassSession.label,
        }
        : null,
      attachments: buildPreviewAttachments(normalizedLinks, materialFiles),
      targetType: postDraft.targetType || 'course',
      targetStudentIds: Array.isArray(postDraft.targetStudentIds) ? postDraft.targetStudentIds : [],
    };

    if (!payload.courseId) {
      setNotice({ type: 'error', text: 'Selecciona un curso para la publicación.' });
      return;
    }

    if (!payload.type) {
      setNotice({ type: 'error', text: 'Selecciona el tipo de asignacion desde la estructura de notas.' });
      return;
    }

    if (!payload.title) {
      setNotice({ type: 'error', text: 'La publicación necesita un título.' });
      return;
    }

    if (payload.deliveryMode === 'date' && payload.dueAt && Number.isNaN(new Date(payload.dueAt).getTime())) {
      setNotice({ type: 'error', text: 'La fecha límite no es válida.' });
      return;
    }

    if (payload.deliveryMode === 'class') {
      if (!postDraft.scheduledClassDate) {
        setNotice({ type: 'error', text: 'Selecciona una fecha de clase en el calendario.' });
        return;
      }

      if (!selectedClassSession) {
        setNotice({ type: 'error', text: 'Selecciona la hora de la clase para esta actividad.' });
        return;
      }
    }

    const shouldAddToGradebook = Boolean(postDraft.addToGradebook);
    const gradebookWeight = Number(postDraft.gradebookWeight);

    if (shouldAddToGradebook) {
      if (payload.courseId !== selectedCourseId) {
        setNotice({ type: 'error', text: 'Para agregar al libro de notas, usa el curso abierto en este espacio de trabajo.' });
        return;
      }

      if (!selectedPostGradebookPeriod || !selectedPostGradebookComponent) {
        setNotice({ type: 'error', text: 'Selecciona el periodo y componente del libro de notas.' });
        return;
      }

      if (!Number.isFinite(gradebookWeight) || gradebookWeight <= 0) {
        setNotice({ type: 'error', text: 'Define el porcentaje de esta asignacion dentro del componente.' });
        return;
      }

      if (!String(postDraft.gradebookSubcomponentTitle || postDraft.title || '').trim()) {
        setNotice({ type: 'error', text: 'Escribe el titulo del subcomponente para el libro de notas.' });
        return;
      }

      if (gradebookWeight > selectedPostGradebookComponentWeightAvailable + 0.001) {
        setNotice({ type: 'error', text: `Ese componente solo tiene ${selectedPostGradebookComponentWeightAvailable}% disponible.` });
        return;
      }
    }

    if (normalizedLinks.some((item) => !/^https?:\/\//i.test(item.url))) {
      setNotice({ type: 'error', text: 'Todos los links deben iniciar con http:// o https://.' });
      return;
    }

    if (editingPostId && shouldAddToGradebook) {
      setNotice({ type: 'error', text: 'La vinculacion al libro de notas solo esta disponible al crear una asignacion nueva.' });
      return;
    }

    try {
      if (previewEnabled) {
        if (editingPostId) {
          setPreviewWorkspace((currentWorkspace) => ({
            ...currentWorkspace,
            recentPosts: currentWorkspace.recentPosts.map((item) => (
              item.id === editingPostId
                ? {
                  ...item,
                  ...payload,
                  dueAt: payload.deliveryMode === 'date' && payload.dueAt ? new Date(payload.dueAt).toISOString() : null,
                  scheduledClassDate: payload.deliveryMode === 'class' ? payload.scheduledClassDate : null,
                  scheduledClassSession: payload.deliveryMode === 'class' ? payload.scheduledClassSession : null,
                  updatedAt: new Date().toISOString(),
                }
                : item
            )),
          }));
        } else {
          const nextPost = buildPreviewPost(payload, previewWorkspace.courses, previewWorkspace.recentPosts.length + 1);
          setPreviewWorkspace((currentWorkspace) => ({
            ...currentWorkspace,
            recentPosts: [nextPost, ...currentWorkspace.recentPosts].slice(0, 12),
          }));
        }
      } else if (editingPostId) {
        const updatePayload = {
          title: payload.title,
          body: payload.body,
          type: payload.type,
          status: payload.status,
          deliveryMode: payload.deliveryMode,
        };

        if (payload.deliveryMode === 'date') {
          updatePayload.dueAt = payload.dueAt ? new Date(payload.dueAt).toISOString() : null;
        } else {
          updatePayload.scheduledClassDate = payload.scheduledClassDate || null;
          updatePayload.scheduledClassSession = payload.scheduledClassSession || null;
        }

        await updatePostMutation.mutateAsync({ postId: editingPostId, payload: updatePayload });
      } else {
        const selectedCourseForPost = courses.find((course) => course.id === payload.courseId) || selectedCourse || null;
        const hasFiles = Array.isArray(materialFiles) && materialFiles.length > 0;

        if (hasFiles) {
          const formData = new FormData();
          formData.append('courseId', payload.courseId);
          formData.append('type', payload.type);
          formData.append('title', payload.title);
          formData.append('body', payload.body);
          formData.append('status', payload.status);
          formData.append('deliveryMode', payload.deliveryMode);
          formData.append('materialLinks', JSON.stringify(normalizedLinks));
          formData.append('targetType', payload.targetType);
          formData.append('targetStudentIds', JSON.stringify(payload.targetStudentIds));
          formData.append('sourceCourseKey', selectedCourseForPost?.sourceCourseKey || '');
          formData.append('section', selectedCourseForPost?.section || '');
          formData.append('subject', selectedCourseForPost?.subject || '');
          formData.append('studentGradeKey', selectedCourseForPost?.studentGradeKey || '');
          formData.append('courseTitle', selectedCourseForPost?.title || '');

          if (shouldAddToGradebook) {
            formData.append('gradebookAssignment', JSON.stringify({
              enabled: true,
              academicPeriodKey: selectedPostGradebookPeriod.key,
              componentKey: selectedPostGradebookComponent.key,
              weight: gradebookWeight,
              topic: String(postDraft.gradebookTopic || payload.type || '').trim(),
              subcomponentName: String(postDraft.gradebookSubcomponentTitle || payload.title || '').trim(),
              subcomponentDescription: String(postDraft.gradebookSubcomponentDescription || payload.body || '').trim(),
            }));
          }

          if (payload.deliveryMode === 'date') {
            formData.append('dueAt', payload.dueAt ? new Date(payload.dueAt).toISOString() : '');
          } else {
            formData.append('scheduledClassDate', payload.scheduledClassDate || '');
            formData.append('scheduledClassSession', JSON.stringify(payload.scheduledClassSession || {}));
          }

          materialFiles.forEach((file) => {
            formData.append('files', file);
          });

          await createPostMutation.mutateAsync(formData);
        } else {
          const jsonPayload = {
            courseId: payload.courseId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            status: payload.status,
            deliveryMode: payload.deliveryMode,
            materialLinks: normalizedLinks,
            targetType: payload.targetType,
            targetStudentIds: payload.targetStudentIds,
            sourceCourseKey: selectedCourseForPost?.sourceCourseKey || '',
            section: selectedCourseForPost?.section || '',
            subject: selectedCourseForPost?.subject || '',
            studentGradeKey: selectedCourseForPost?.studentGradeKey || '',
            courseTitle: selectedCourseForPost?.title || '',
          };

          if (shouldAddToGradebook) {
            jsonPayload.gradebookAssignment = {
              enabled: true,
              academicPeriodKey: selectedPostGradebookPeriod.key,
              componentKey: selectedPostGradebookComponent.key,
              weight: gradebookWeight,
              topic: String(postDraft.gradebookTopic || payload.type || '').trim(),
              subcomponentName: String(postDraft.gradebookSubcomponentTitle || payload.title || '').trim(),
              subcomponentDescription: String(postDraft.gradebookSubcomponentDescription || payload.body || '').trim(),
            };
          }

          if (payload.deliveryMode === 'date') {
            jsonPayload.dueAt = payload.dueAt ? new Date(payload.dueAt).toISOString() : null;
          } else {
            jsonPayload.scheduledClassDate = payload.scheduledClassDate || null;
            jsonPayload.scheduledClassSession = payload.scheduledClassSession || null;
          }

          await createPostMutation.mutateAsync(jsonPayload);
        }
      }

      const wasEditing = Boolean(editingPostId);
      setEditingPostId('');
      setPostDraft(createPostDraft(payload.courseId));
      setMaterialLinks([createMaterialLinkDraft()]);
      setMaterialFiles([]);
      setShowAttachLinkPanel(false);
      setShowAssignmentComposer(false);

      if (wasEditing) {
        setNotice({ type: 'success', text: 'Asignacion actualizada.' });
      } else {
        setShowPostSuccessModal(true);
      }
    } catch (error) {
      const errorText = error?.response?.data?.message || error?.message || (editingPostId ? 'No se pudo actualizar la asignacion.' : 'No se pudo crear la publicación.');
      setNotice({ type: 'error', text: errorText });
      setGradebookSaveModal({
        type: 'error',
        title: editingPostId ? 'No se guardó la asignación' : 'No se publicó la asignación',
        message: errorText,
      });
    }
  };

  const onCancelEditPost = () => {
    closeAssignmentComposer();
  };

  const onEditPost = (post) => {
    setEditingPostId(post.id);
    setPostDraft(buildPostDraftFromPost(post, selectedCourse?.id || ''));
    setMaterialLinks(buildMaterialLinksFromPost(post));
    setMaterialFiles([]);
    setShowAssignmentComposer(true);
    setOpenPostMenuId('');

    if (post.scheduledClassDate) {
      const parsedDate = new Date(post.scheduledClassDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        setCalendarMonth(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
      }
    }
  };

  const onArchivePost = async (post) => {
    const confirmed = window.confirm(`¿Eliminar la asignacion "${post.title || 'sin titulo'}"? Ya no aparecera para los estudiantes.`);
    if (!confirmed) {
      return;
    }

    try {
      if (previewEnabled) {
        setPreviewWorkspace((currentWorkspace) => ({
          ...currentWorkspace,
          recentPosts: currentWorkspace.recentPosts.map((item) => (
            item.id === post.id
              ? { ...item, status: 'archived', updatedAt: new Date().toISOString() }
              : item
          )),
        }));
      } else {
        await updatePostMutation.mutateAsync({ postId: post.id, payload: { status: 'archived' } });
      }

      if (editingPostId === post.id) {
        onCancelEditPost();
      }

      setNotice({ type: 'success', text: 'Asignacion eliminada.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo eliminar la asignacion.' });
    }
  };

  const onTogglePostStatus = async (post) => {
    const nextStatus = post.status === 'published' ? 'draft' : 'published';

    try {
      if (previewEnabled) {
        setPreviewWorkspace((currentWorkspace) => ({
          ...currentWorkspace,
          recentPosts: currentWorkspace.recentPosts.map((item) => (
            item.id === post.id
              ? {
                ...item,
                status: nextStatus,
                publishedAt: nextStatus === 'published' ? new Date().toISOString() : null,
                updatedAt: new Date().toISOString(),
              }
              : item
          )),
        }));
      } else {
        await updatePostMutation.mutateAsync({ postId: post.id, payload: { status: nextStatus } });
      }

      setNotice({ type: 'success', text: nextStatus === 'published' ? 'Publicación publicada.' : 'Publicación movida a borrador.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo actualizar la publicación.' });
    }
  };

  const onAddAcademicPeriod = () => {
    setAcademicPeriodDrafts((currentDrafts) => [...currentDrafts, createAcademicPeriodDraft(currentDrafts.length)]);
  };

  const onRemoveAcademicPeriod = (periodIndex) => {
    setAcademicPeriodDrafts((currentDrafts) => currentDrafts.filter((_, index) => index !== periodIndex));
  };

  const onChangeAcademicPeriod = (periodIndex, field, value) => {
    setAcademicPeriodDrafts((currentDrafts) => currentDrafts.map((period, index) => (
      index === periodIndex ? { ...period, [field]: value } : period
    )));
  };

  const onAddPeriodComponent = (periodIndex) => {
    setAcademicPeriodDrafts((currentDrafts) => currentDrafts.map((period, index) => (
      index === periodIndex
        ? {
          ...period,
          gradingComponents: [...(period.gradingComponents || []), createGradingComponentDraft(((period.gradingComponents || []).length + 1) * 10)],
        }
        : period
    )));
  };

  const onRemovePeriodComponent = (periodIndex, componentIndex) => {
    setAcademicPeriodDrafts((currentDrafts) => currentDrafts.map((period, index) => (
      index === periodIndex
        ? { ...period, gradingComponents: (period.gradingComponents || []).filter((_, nestedIndex) => nestedIndex !== componentIndex) }
        : period
    )));
  };

  const onChangePeriodComponent = (periodIndex, componentIndex, field, value) => {
    setAcademicPeriodDrafts((currentDrafts) => currentDrafts.map((period, index) => (
      index === periodIndex
        ? {
          ...period,
          gradingComponents: (period.gradingComponents || []).map((component, nestedIndex) => (
            nestedIndex === componentIndex ? { ...component, [field]: value } : component
          )),
        }
        : period
    )));
  };

  const onAddAcademicContentTopic = (periodIndex) => {
    const period = academicContentDrafts[periodIndex] || {};
    const inputKey = period.periodKey || `period_${periodIndex + 1}`;
    const topicInput = academicContentTopicInputs[inputKey] || {};
    const title = String(topicInput.title || '').trim();
    const description = String(topicInput.description || '').trim();

    if (!title) {
      setNotice({ type: 'error', text: 'Escribe el tema de estudio antes de agregarlo.' });
      return;
    }

    setAcademicContentDrafts((currentDrafts) => currentDrafts.map((currentPeriod, index) => {
      if (index !== periodIndex) {
        return currentPeriod;
      }

      const topics = currentPeriod.topics || [];
      return {
        ...currentPeriod,
        topics: [
          ...topics,
          {
            ...createAcademicContentTopicDraft(topics.length),
            title,
            description,
          },
        ],
      };
    }));
    setAcademicContentTopicInputs((currentInputs) => ({
      ...currentInputs,
      [inputKey]: { title: '', description: '' },
    }));
  };

  const onRemoveAcademicContentTopic = (periodIndex, topicIndex) => {
    setAcademicContentDrafts((currentDrafts) => currentDrafts.map((period, index) => (
      index === periodIndex
        ? { ...period, topics: (period.topics || []).filter((_, currentTopicIndex) => currentTopicIndex !== topicIndex) }
        : period
    )));
  };

  const onChangeAcademicContentTopicInput = (period, periodIndex, field, value) => {
    const inputKey = period.periodKey || `period_${periodIndex + 1}`;
    setAcademicContentTopicInputs((currentInputs) => ({
      ...currentInputs,
      [inputKey]: {
        ...(currentInputs[inputKey] || { title: '', description: '' }),
        [field]: value,
      },
    }));
  };

  const onSaveAcademicContent = async () => {
    if (!selectedCourse) {
      setNotice({ type: 'error', text: 'Selecciona un grado asignado.' });
      return;
    }

    const academicContent = academicContentDrafts.map((period, periodIndex) => ({
      periodKey: period.periodKey,
      periodName: period.periodName,
      startDate: period.startDate || '',
      endDate: period.endDate || '',
      order: Number(period.order ?? (periodIndex + 1) * 10),
      topics: (period.topics || [])
        .map((topic, topicIndex) => ({
          key: slugifyComponentKey(topic.key || topic.title || `topic_${topicIndex + 1}`),
          title: String(topic.title || '').trim(),
          description: String(topic.description || '').trim(),
          order: Number(topic.order ?? (topicIndex + 1) * 10),
        }))
        .filter((topic) => Boolean(topic.title)),
    }));

    try {
      if (previewEnabled) {
        const selectedGradeCourseIds = new Set(selectedPortalGradeCourses.map((course) => course.id));
        setPreviewWorkspace((currentWorkspace) => ({
          ...currentWorkspace,
          courses: currentWorkspace.courses.map((course) => (
            selectedGradeCourseIds.has(course.id) ? { ...course, academicContent, updatedAt: new Date().toISOString() } : course
          )),
          courseDetails: {
            ...currentWorkspace.courseDetails,
            ...Object.fromEntries(Array.from(selectedGradeCourseIds).map((courseId) => {
              const storedDetail = currentWorkspace.courseDetails?.[courseId] || {};
              const storedCourse = storedDetail.course || currentWorkspace.courses.find((course) => course.id === courseId) || selectedCourse;
              return [
                courseId,
                {
                  ...storedDetail,
                  course: {
                    ...storedCourse,
                    academicContent,
                    updatedAt: new Date().toISOString(),
                  },
                },
              ];
            })),
          },
        }));
      } else {
        await updateAcademicContentMutation.mutateAsync({ courseId: selectedCourse.id, payload: { academicContent } });
      }

      setNotice({ type: 'success', text: 'Contenido académico del grado sincronizado correctamente.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo guardar el contenido académico.' });
    }
  };

  const onTeacherResourceDraftChange = (field, value) => {
    setTeacherResourceRequestDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  };

  const onAddTeacherResourceItem = () => {
    const customName = String(teacherResourceRequestDraft.customName || '').trim();

    if (!selectedTeacherResourceItem && !isTeacherResourceCustomItem) {
      setNotice({ type: 'error', text: 'Selecciona un material del inventario.' });
      return;
    }

    if (isTeacherResourceCustomItem && !customName) {
      setNotice({ type: 'error', text: 'Escribe el nombre del material que necesitas.' });
      return;
    }

    const quantity = Math.max(1, Number(teacherResourceRequestDraft.quantity || 0));
    const itemKey = isTeacherResourceCustomItem ? `custom:${customName.toLowerCase()}` : selectedTeacherResourceItem.id;
    setTeacherResourceRequestItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.key === itemKey);
      if (existingItem) {
        return currentItems.map((item) => (
          item.key === itemKey
            ? { ...item, quantity: item.quantity + quantity }
            : item
        ));
      }

      return [
        ...currentItems,
        {
          key: itemKey,
          itemId: isTeacherResourceCustomItem ? '' : selectedTeacherResourceItem.id,
          customName: isTeacherResourceCustomItem ? customName : '',
          name: isTeacherResourceCustomItem ? customName : selectedTeacherResourceItem.name,
          unit: isTeacherResourceCustomItem ? 'unidad' : selectedTeacherResourceItem.unit || 'unidad',
          quantity,
          stock: isTeacherResourceCustomItem ? null : Number(selectedTeacherResourceItem.stock || 0),
        },
      ];
    });
    setTeacherResourceRequestDraft((currentDraft) => ({ ...currentDraft, itemId: '', customName: '', quantity: '1' }));
  };

  const onAddTeacherResourceActivity = () => {
    const title = String(teacherResourceRequestDraft.activityTitle || '').trim();
    const date = String(teacherResourceRequestDraft.activityDate || '').trim();
    const description = String(teacherResourceRequestDraft.activityDescription || '').trim();

    if (!date || !title) {
      setNotice({ type: 'error', text: 'Escribe fecha y actividad del planner.' });
      return;
    }

    setTeacherResourcePlannerActivities((currentActivities) => [
      ...currentActivities,
      { key: `${date}:${title}:${currentActivities.length}`, date, title, description },
    ]);
    setTeacherResourceRequestDraft((currentDraft) => ({
      ...currentDraft,
      activityDate: '',
      activityTitle: '',
      activityDescription: '',
    }));
  };

  const onSubmitTeacherResourceRequest = async (event) => {
    event.preventDefault();

    if (teacherResourceRequestItems.length === 0) {
      setNotice({ type: 'error', text: 'Agrega al menos un material antes de enviar la solicitud.' });
      return;
    }

    if (!teacherResourceRequestDraft.plannerCycleId) {
      setNotice({ type: 'error', text: 'Selecciona el planner definido por coordinacion.' });
      return;
    }

    if (teacherResourcePlannerActivities.length === 0) {
      setNotice({ type: 'error', text: 'Agrega al menos una actividad del planner.' });
      return;
    }

    try {
      await createTeacherResourceRequestMutation.mutateAsync({
        requestType: 'material',
        plannerCycleId: teacherResourceRequestDraft.plannerCycleId,
        plannerActivities: teacherResourcePlannerActivities.map((activity) => ({
          date: activity.date,
          title: activity.title,
          description: activity.description,
        })),
        requestedForArea: teacherResourceRequestDraft.requestedForArea,
        purpose: teacherResourceRequestDraft.purpose,
        neededByDate: teacherResourceRequestDraft.neededByDate,
        priority: teacherResourceRequestDraft.priority,
        items: teacherResourceRequestItems.map((item) => ({ itemId: item.itemId, customName: item.customName, quantity: item.quantity })),
      });
      setTeacherResourceRequestDraft(createTeacherResourceRequestDraft());
      setTeacherResourceRequestItems([]);
      setTeacherResourcePlannerActivities([]);
      setNotice({ type: 'success', text: 'Planner enviado a coordinacion para consolidacion.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo enviar la solicitud de materiales.' });
    }
  };

  const onTeacherSocialPublicationDraftChange = (field, value) => {
    setTeacherSocialPublicationDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  };

  const onTeacherSocialMediaSelected = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';

    if (selectedFiles.length === 0) {
      return;
    }

    if ((teacherSocialPublicationDraft.media || []).length + selectedFiles.length > 8) {
      setNotice({ type: 'error', text: 'Puedes adjuntar hasta 8 fotos o videos por publicación.' });
      return;
    }

    setTeacherSocialMediaUploading(true);
    try {
      const response = await uploadCampusTeacherParentFeedMedia(selectedFiles);
      setTeacherSocialPublicationDraft((currentDraft) => ({
        ...currentDraft,
        media: [...(currentDraft.media || []), ...(response.media || [])].slice(0, 8),
      }));
      setNotice({ type: 'success', text: 'Archivo adjuntado a la publicación.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo subir el archivo.' });
    } finally {
      setTeacherSocialMediaUploading(false);
    }
  };

  const onRemoveTeacherSocialMedia = (mediaIndex) => {
    setTeacherSocialPublicationDraft((currentDraft) => ({
      ...currentDraft,
      media: (currentDraft.media || []).filter((_, index) => index !== mediaIndex),
    }));
  };

  const onSubmitTeacherSocialPublication = async (event) => {
    event.preventDefault();

    const title = String(teacherSocialPublicationDraft.title || '').trim();
    const body = String(teacherSocialPublicationDraft.body || '').trim();

    if (!teacherSocialPublicationDraft.courseId) {
      setNotice({ type: 'error', text: 'Selecciona el curso o grupo destinatario.' });
      return;
    }

    if (!title || !body) {
      setNotice({ type: 'error', text: 'Escribe un título y una descripción para enviar la publicación.' });
      return;
    }

    try {
      await createTeacherSocialPublicationMutation.mutateAsync({
        courseId: teacherSocialPublicationDraft.courseId,
        title,
        body,
        emailSubject: title,
        audienceType: 'course',
        courseTargets: selectedSocialPublicationCourse
          ? [selectedSocialPublicationCourse.title, selectedSocialPublicationCourse.studentGradeKey, selectedSocialPublicationCourse.gradeLevel].filter(Boolean)
          : [],
        media: teacherSocialPublicationDraft.media || [],
        channels: { push: true, email: false },
      });
      setTeacherSocialPublicationDraft(createTeacherSocialPublicationDraft());
      setNotice({ type: 'success', text: 'Publicación enviada a Secretaría Académica para revisión.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo enviar la publicación.' });
    }
  };

  const onTeacherDisciplineDraftChange = (field, value) => {
    setTeacherDisciplineDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
      ...(field === 'courseId' ? { studentId: '' } : {}),
    }));
  };

  const onSubmitTeacherDisciplineObservation = async (event) => {
    event.preventDefault();

    const observationText = String(teacherDisciplineDraft.observation || '').trim();
    if (!teacherDisciplineDraft.courseId) {
      setNotice({ type: 'error', text: 'Selecciona el curso donde observaste la situación.' });
      return;
    }
    if (!teacherDisciplineDraft.studentId) {
      setNotice({ type: 'error', text: 'Selecciona el alumno correspondiente.' });
      return;
    }
    if (observationText.length < 8) {
      setNotice({ type: 'error', text: 'Escribe una observación de comportamiento más detallada.' });
      return;
    }

    try {
      if (previewEnabled) {
        setNotice({ type: 'success', text: 'Observación registrada en vista previa.' });
        setTeacherDisciplineDraft((currentDraft) => ({ ...currentDraft, observation: '' }));
        return;
      }

      await createTeacherDisciplineObservationMutation.mutateAsync({
        courseId: teacherDisciplineDraft.courseId,
        studentId: teacherDisciplineDraft.studentId,
        observation: observationText,
      });
      setTeacherDisciplineDraft((currentDraft) => ({ ...currentDraft, observation: '' }));
      setNotice({ type: 'success', text: 'Observación enviada a Coordinación, Dirección, Psicología y Rectoría.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo enviar la observación de convivencia.' });
    }
  };

  const onSaveGradingScheme = async (
    draftsOverride = null,
    successMessage = 'Períodos y esquema de calificación actualizados.',
    options = {},
  ) => {
    const { strictTotals = true } = options;
    if (!selectedCourse) {
      const error = 'Selecciona un curso asignado.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    const sourceDrafts = Array.isArray(draftsOverride) ? draftsOverride : academicPeriodDrafts;
    const normalizedPeriods = sourceDrafts.map((period, periodIndex) => ({
      key: slugifyComponentKey(period.key || period.name || `period_${periodIndex + 1}`),
      name: String(period.name || '').trim(),
      weight: Number(period.weight),
      order: Number(period.order ?? (periodIndex + 1) * 10),
      startDate: String(period.startDate || '').trim(),
      endDate: String(period.endDate || '').trim(),
      gradingComponents: (period.gradingComponents || []).map((component, componentIndex) => ({
        key: slugifyComponentKey(component.key || component.name || `component_${componentIndex + 1}`),
        name: String(component.name || '').trim(),
        weight: Number(component.weight),
        order: Number(component.order ?? (componentIndex + 1) * 10),
        subcomponents: (component.subcomponents || []).map((subcomponent, subcomponentIndex) => ({
          key: slugifyComponentKey(subcomponent.key || subcomponent.name || `subcomponent_${subcomponentIndex + 1}`),
          name: String(subcomponent.name || '').trim(),
          weight: Number(subcomponent.weight),
          date: String(subcomponent.date || '').trim(),
          topic: String(subcomponent.topic || '').trim(),
          description: String(subcomponent.description || '').trim(),
          order: Number(subcomponent.order ?? (subcomponentIndex + 1)),
        })).filter((subcomponent) => Boolean(subcomponent.name)),
      })),
    }));

    if (normalizedPeriods.length === 0) {
      const error = 'Agrega al menos un período académico.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    if (normalizedPeriods.some((period) => !period.name || !period.key)) {
      const error = 'Cada periodo necesita nombre y clave valida.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    if (new Set(normalizedPeriods.map((period) => period.key)).size !== normalizedPeriods.length) {
      const error = 'Las claves de los periodos no pueden repetirse.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    if (normalizedPeriods.some((period) => !Number.isFinite(period.weight) || period.weight <= 0)) {
      const error = 'Cada periodo debe tener un porcentaje mayor que cero.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    const weightTotal = normalizedPeriods.reduce((total, period) => total + period.weight, 0);
    if (strictTotals && Math.abs(weightTotal - 100) > 0.001) {
      const error = 'La ponderacion de los periodos debe sumar 100%.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).length === 0)) {
      const error = 'Cada periodo debe tener al menos un componente de evaluacion.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).some((component) => !component.name || !component.key))) {
      const error = 'Cada componente necesita nombre y clave valida.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    if (normalizedPeriods.some((period) => new Set((period.gradingComponents || []).map((component) => component.key)).size !== (period.gradingComponents || []).length)) {
      const error = 'Dentro de cada periodo las claves de los componentes no pueden repetirse.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).some((component) => !Number.isFinite(component.weight) || component.weight <= 0))) {
      const error = 'Cada componente debe tener un porcentaje mayor que cero.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).some((component) => (component.subcomponents || []).some((subcomponent) => !subcomponent.name || !subcomponent.key)))) {
      const error = 'Cada subcomponente necesita nombre y clave valida.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).some((component) => new Set((component.subcomponents || []).map((subcomponent) => subcomponent.key)).size !== (component.subcomponents || []).length))) {
      const error = 'Dentro de cada componente las claves de los subcomponentes no pueden repetirse.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).some((component) => (component.subcomponents || []).some((subcomponent) => !Number.isFinite(subcomponent.weight) || subcomponent.weight <= 0)))) {
      const error = 'Cada subcomponente debe tener un porcentaje mayor que cero.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).some((component) => (component.subcomponents || []).reduce((total, subcomponent) => total + subcomponent.weight, 0) > 100.001))) {
      const error = 'Dentro de cada componente los subcomponentes no pueden superar 100%.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    if (strictTotals && normalizedPeriods.some((period) => Math.abs((period.gradingComponents || []).reduce((total, component) => total + component.weight, 0) - 100) > 0.001)) {
      const error = 'Dentro de cada periodo los componentes deben sumar 100%.';
      setNotice({ type: 'error', text: error });
      return { ok: false, error };
    }

    try {
      if (previewEnabled) {
        setPreviewWorkspace((currentWorkspace) => {
          const nextCourses = currentWorkspace.courses.map((course) => (
            course.id === selectedCourse.id
              ? {
                ...course,
                academicPeriods: normalizedPeriods,
                gradingComponents: normalizedPeriods[0]?.gradingComponents || [],
                updatedAt: new Date().toISOString(),
              }
              : course
          ));
          const currentDetail = currentWorkspace.courseDetails?.[selectedCourse.id];
          const currentCoursePeriods = getCourseAcademicPeriods(currentDetail.course);
          const nextStudents = (currentDetail.students || []).map((student) => {
            const nextPeriods = normalizedPeriods.map((period) => {
              const previousPeriod = buildStudentPeriods(student, currentCoursePeriods).find((item) => item.key === period.key);
              const scores = (period.gradingComponents || []).map((component) => {
                const existingScore = previousPeriod?.scores?.find((score) => score.componentKey === component.key);
                const subcomponents = (component.subcomponents || []).map((subcomponent) => {
                  const existingSubcomponent = (existingScore?.subcomponents || []).find((item) => item.subcomponentKey === subcomponent.key);
                  return {
                    subcomponentKey: subcomponent.key,
                    subcomponentName: subcomponent.name,
                    weight: subcomponent.weight,
                    date: subcomponent.date,
                    topic: subcomponent.topic,
                    score: existingSubcomponent?.score ?? null,
                    feedback: existingSubcomponent?.feedback || '',
                    gradedAt: existingSubcomponent?.gradedAt || null,
                  };
                });

                return {
                  academicPeriodKey: period.key,
                  academicPeriodName: period.name,
                  componentKey: component.key,
                  componentName: component.name,
                  weight: component.weight,
                  score: subcomponents.length > 0
                    ? calculateWeightedAverage(subcomponents, (subcomponent) => subcomponent.weight)
                    : (existingScore?.score ?? null),
                  feedback: existingScore?.feedback || '',
                  gradedAt: existingScore?.gradedAt || null,
                  subcomponents,
                };
              });
              const periodScore = calculatePeriodScore(scores, period.gradingComponents || []);
              return {
                key: period.key,
                name: period.name,
                weight: period.weight,
                periodScore,
                weightedContribution: periodScore === null ? null : Number(((periodScore * period.weight) / 100).toFixed(2)),
                scores,
              };
            });

            return {
              ...student,
              periods: nextPeriods,
              scores: nextPeriods.flatMap((period) => period.scores),
              finalScore: calculateFinalScore(nextPeriods),
            };
          });
          return {
            ...currentWorkspace,
            courses: nextCourses,
            courseDetails: {
              ...currentWorkspace.courseDetails,
              [selectedCourse.id]: {
                ...currentDetail,
                course: {
                  ...currentDetail.course,
                  academicPeriods: normalizedPeriods,
                  gradingComponents: normalizedPeriods[0]?.gradingComponents || [],
                  updatedAt: new Date().toISOString(),
                },
                students: nextStudents,
              },
            },
          };
        });
      } else {
        await updateGradingSchemeMutation.mutateAsync({
          courseId: selectedCourse.id,
          payload: {
            academicPeriods: normalizedPeriods,
            allowIncompleteWeights: !strictTotals,
          },
        });
      }

      setNotice({ type: 'success', text: successMessage });
      return { ok: true };
    } catch (error) {
      const errorText = error?.response?.data?.message || error?.message || 'No se pudo guardar la estructura academica.';
      setNotice({ type: 'error', text: errorText });
      return { ok: false, error: errorText };
    }
  };

  const onStudentDraftChange = (studentId, academicPeriodKey, componentKey, field, value, subcomponentKey = '') => {
    setStudentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [studentId]: {
        ...(currentDrafts[studentId] || {}),
        [buildGradeDraftKey(academicPeriodKey, componentKey, subcomponentKey)]: {
          ...((currentDrafts[studentId] || {})[buildGradeDraftKey(academicPeriodKey, componentKey, subcomponentKey)] || { score: '', feedback: '' }),
          [field]: value,
        },
      },
    }));
  };

  const onSaveStudentGrades = async (student) => {
    if (!selectedCourseDetail?.course) {
      setNotice({ type: 'error', text: 'Selecciona un curso asignado.' });
      return;
    }

    const payloadGrades = selectedCourseAcademicPeriods
      .flatMap((period) => (period.gradingComponents || []).flatMap((component) => {
        if ((component.subcomponents || []).length > 0) {
          return (component.subcomponents || []).map((subcomponent) => {
            const draftValue = studentDrafts?.[student.studentId]?.[buildGradeDraftKey(period.key, component.key, subcomponent.key)];
            const trimmedScore = String(draftValue?.score ?? '').trim();
            if (!trimmedScore) {
              return null;
            }

            return {
              academicPeriodKey: period.key,
              componentKey: component.key,
              subcomponentKey: subcomponent.key,
              score: Number(trimmedScore),
              feedback: String(draftValue?.feedback || '').trim(),
            };
          });
        }

        const draftValue = studentDrafts?.[student.studentId]?.[buildGradeDraftKey(period.key, component.key)];
        const trimmedScore = String(draftValue?.score ?? '').trim();
        if (!trimmedScore) {
          return null;
        }

        return {
          academicPeriodKey: period.key,
          componentKey: component.key,
          score: Number(trimmedScore),
          feedback: String(draftValue?.feedback || '').trim(),
        };
      }))
      .filter(Boolean);

    if (payloadGrades.length === 0) {
      setNotice({ type: 'error', text: `Ingresa al menos una nota para ${student.name}.` });
      return;
    }

    if (payloadGrades.some((grade) => !Number.isFinite(grade.score) || grade.score < selectedCourseGradingScale.minScore || grade.score > selectedCourseGradingScale.maxScore)) {
      setNotice({ type: 'error', text: `Cada nota debe estar entre ${selectedCourseGradingScale.minScore} y ${selectedCourseGradingScale.maxScore}.` });
      return;
    }

    try {
      if (previewEnabled) {
        setPreviewWorkspace((currentWorkspace) => {
          const currentDetail = currentWorkspace.courseDetails?.[selectedCourseDetail.course.id];
          const nextStudents = (currentDetail.students || []).map((currentStudent) => {
            if (currentStudent.studentId !== student.studentId) {
              return currentStudent;
            }

            const nextPeriods = selectedCourseAcademicPeriods.map((period) => {
              const currentPeriod = buildStudentPeriods(currentStudent, selectedCourseAcademicPeriods).find((item) => item.key === period.key);
              const nextScores = (period.gradingComponents || []).map((component) => {
                const submittedGrades = payloadGrades.filter((grade) => grade.academicPeriodKey === period.key && grade.componentKey === component.key);
                const existingScore = currentPeriod?.scores?.find((score) => score.componentKey === component.key);
                const nextSubcomponents = (component.subcomponents || []).map((subcomponent) => {
                  const submittedSubcomponent = submittedGrades.find((grade) => grade.subcomponentKey === subcomponent.key);
                  const existingSubcomponent = (existingScore?.subcomponents || []).find((item) => item.subcomponentKey === subcomponent.key);
                  return {
                    subcomponentKey: subcomponent.key,
                    subcomponentName: subcomponent.name,
                    weight: subcomponent.weight,
                    date: subcomponent.date,
                    topic: subcomponent.topic,
                    score: submittedSubcomponent ? submittedSubcomponent.score : (existingSubcomponent?.score ?? null),
                    feedback: submittedSubcomponent ? submittedSubcomponent.feedback : (existingSubcomponent?.feedback || ''),
                    gradedAt: submittedSubcomponent ? new Date().toISOString() : (existingSubcomponent?.gradedAt || null),
                  };
                });

                return {
                  academicPeriodKey: period.key,
                  academicPeriodName: period.name,
                  componentKey: component.key,
                  componentName: component.name,
                  weight: component.weight,
                  score: nextSubcomponents.length > 0
                    ? calculateWeightedAverage(nextSubcomponents, (subcomponent) => subcomponent.weight)
                    : (submittedGrades[0] ? submittedGrades[0].score : (existingScore?.score ?? null)),
                  feedback: nextSubcomponents.length > 0
                    ? ''
                    : (submittedGrades[0] ? submittedGrades[0].feedback : (existingScore?.feedback || '')),
                  gradedAt: nextSubcomponents.length > 0
                    ? (nextSubcomponents.some((subcomponent) => Boolean(subcomponent.gradedAt)) ? new Date().toISOString() : null)
                    : (submittedGrades[0] ? new Date().toISOString() : (existingScore?.gradedAt || null)),
                  subcomponents: nextSubcomponents,
                };
              });

              const periodScore = calculatePeriodScore(nextScores, period.gradingComponents || []);
              return {
                key: period.key,
                name: period.name,
                weight: period.weight,
                periodScore,
                weightedContribution: periodScore === null ? null : Number(((periodScore * period.weight) / 100).toFixed(2)),
                scores: nextScores,
              };
            });

            return {
              ...currentStudent,
              periods: nextPeriods,
              scores: nextPeriods.flatMap((period) => period.scores),
              finalScore: calculateFinalScore(nextPeriods),
            };
          });

          return {
            ...currentWorkspace,
            courseDetails: {
              ...currentWorkspace.courseDetails,
              [selectedCourseDetail.course.id]: {
                ...currentDetail,
                students: nextStudents,
              },
            },
          };
        });
      } else {
        await saveGradesMutation.mutateAsync({
          courseId: selectedCourseDetail.course.id,
          studentId: student.studentId,
          payload: { grades: payloadGrades },
        });
      }

      const successText = `Notas guardadas para ${student.name}.`;
      setNotice({ type: 'success', text: successText });
      setGradebookSaveModal({ type: 'success', title: 'Notas guardadas', message: successText });
    } catch (error) {
      const errorText = error?.response?.data?.message || error?.message || 'No se pudieron guardar las notas.';
      setNotice({ type: 'error', text: errorText });
      setGradebookSaveModal({ type: 'error', title: 'No se guardaron las notas', message: errorText });
    }
  };

  const onSaveAssignmentGrades = async () => {
    if (!selectedCourseDetail?.course || !selectedGradebookAssignment) {
      setNotice({ type: 'error', text: 'Selecciona una asignacion para calificar.' });
      return;
    }

    const submittedStudentGrades = (selectedCourseDetail.students || []).map((student) => {
      const draftValue = studentDrafts?.[student.studentId]?.[buildGradeDraftKey(
        selectedGradebookAssignment.periodKey,
        selectedGradebookAssignment.componentKey,
        selectedGradebookAssignment.subcomponentKey
      )];
      const trimmedScore = String(draftValue?.score ?? '').trim();
      if (!trimmedScore) {
        return null;
      }

      return {
        student,
        grade: {
          academicPeriodKey: selectedGradebookAssignment.periodKey,
          componentKey: selectedGradebookAssignment.componentKey,
          subcomponentKey: selectedGradebookAssignment.subcomponentKey,
          score: Number(trimmedScore),
          feedback: String(draftValue?.feedback || '').trim(),
        },
      };
    }).filter(Boolean);

    if (submittedStudentGrades.length === 0) {
      setNotice({ type: 'error', text: `Ingresa al menos una nota para ${selectedGradebookAssignment.subcomponentName}.` });
      return;
    }

    if (submittedStudentGrades.some((item) => !Number.isFinite(item.grade.score) || item.grade.score < selectedCourseGradingScale.minScore || item.grade.score > selectedCourseGradingScale.maxScore)) {
      setNotice({ type: 'error', text: `Cada nota debe estar entre ${selectedCourseGradingScale.minScore} y ${selectedCourseGradingScale.maxScore}.` });
      return;
    }

    try {
      if (previewEnabled) {
        const gradesByStudentId = new Map(submittedStudentGrades.map((item) => [item.student.studentId, item.grade]));
        setPreviewWorkspace((currentWorkspace) => {
          const currentDetail = currentWorkspace.courseDetails?.[selectedCourseDetail.course.id];
          const nextStudents = (currentDetail.students || []).map((currentStudent) => {
            const submittedGrade = gradesByStudentId.get(currentStudent.studentId);
            if (!submittedGrade) {
              return currentStudent;
            }

            const nextPeriods = selectedCourseAcademicPeriods.map((period) => {
              const currentPeriod = buildStudentPeriods(currentStudent, selectedCourseAcademicPeriods).find((item) => item.key === period.key);
              const nextScores = (period.gradingComponents || []).map((component) => {
                const existingScore = currentPeriod?.scores?.find((score) => score.componentKey === component.key);
                const nextSubcomponents = (component.subcomponents || []).map((subcomponent) => {
                  const existingSubcomponent = (existingScore?.subcomponents || []).find((item) => item.subcomponentKey === subcomponent.key);
                  const isTargetSubcomponent = period.key === submittedGrade.academicPeriodKey
                    && component.key === submittedGrade.componentKey
                    && subcomponent.key === submittedGrade.subcomponentKey;

                  return {
                    subcomponentKey: subcomponent.key,
                    subcomponentName: subcomponent.name,
                    weight: subcomponent.weight,
                    date: subcomponent.date,
                    topic: subcomponent.topic,
                    score: isTargetSubcomponent ? submittedGrade.score : (existingSubcomponent?.score ?? null),
                    feedback: isTargetSubcomponent ? submittedGrade.feedback : (existingSubcomponent?.feedback || ''),
                    gradedAt: isTargetSubcomponent ? new Date().toISOString() : (existingSubcomponent?.gradedAt || null),
                  };
                });

                return {
                  academicPeriodKey: period.key,
                  academicPeriodName: period.name,
                  componentKey: component.key,
                  componentName: component.name,
                  weight: component.weight,
                  score: nextSubcomponents.length > 0
                    ? calculateWeightedAverage(nextSubcomponents, (subcomponent) => subcomponent.weight)
                    : (existingScore?.score ?? null),
                  feedback: nextSubcomponents.length > 0 ? '' : (existingScore?.feedback || ''),
                  gradedAt: nextSubcomponents.some((subcomponent) => Boolean(subcomponent.gradedAt)) ? new Date().toISOString() : (existingScore?.gradedAt || null),
                  subcomponents: nextSubcomponents,
                };
              });
              const periodScore = calculatePeriodScore(nextScores, period.gradingComponents || []);

              return {
                key: period.key,
                name: period.name,
                weight: period.weight,
                periodScore,
                weightedContribution: periodScore === null ? null : Number(((periodScore * period.weight) / 100).toFixed(2)),
                scores: nextScores,
              };
            });

            return {
              ...currentStudent,
              periods: nextPeriods,
              scores: nextPeriods.flatMap((period) => period.scores),
              finalScore: calculateFinalScore(nextPeriods),
            };
          });

          return {
            ...currentWorkspace,
            courseDetails: {
              ...currentWorkspace.courseDetails,
              [selectedCourseDetail.course.id]: {
                ...currentDetail,
                students: nextStudents,
              },
            },
          };
        });
      } else {
        await Promise.all(submittedStudentGrades.map(({ student, grade }) => saveGradesMutation.mutateAsync({
          courseId: selectedCourseDetail.course.id,
          studentId: student.studentId,
          payload: { grades: [grade] },
        })));
      }

      const successText = `Asignacion guardada para ${submittedStudentGrades.length} alumno${submittedStudentGrades.length === 1 ? '' : 's'}.`;
      setNotice({ type: 'success', text: successText });
      setGradebookSaveModal({ type: 'success', title: 'Notas guardadas', message: successText });
    } catch (error) {
      const errorText = error?.response?.data?.message || error?.message || 'No se pudieron guardar las notas de la asignacion.';
      setNotice({ type: 'error', text: errorText });
      setGradebookSaveModal({ type: 'error', title: 'No se guardaron las notas', message: errorText });
    }
  };

  const onSaveStudentGradeEntry = async (student, period, component, subcomponent = null) => {
    if (!selectedCourseDetail?.course || !student || !period || !component) {
      setNotice({ type: 'error', text: 'No se pudo identificar la nota a guardar.' });
      return;
    }

    const componentKey = component.componentKey || component.key;
    const draftValue = studentDrafts?.[student.studentId]?.[buildGradeDraftKey(period.key, componentKey, subcomponent?.key || '')];
    const trimmedScore = String(draftValue?.score ?? '').trim();
    const gradeLabel = subcomponent?.name || component.componentName || component.name || 'esta nota';
    if (!trimmedScore) {
      setNotice({ type: 'error', text: `Ingresa una nota para ${gradeLabel}.` });
      return;
    }

    const score = Number(trimmedScore);
    if (!Number.isFinite(score) || score < selectedCourseGradingScale.minScore || score > selectedCourseGradingScale.maxScore) {
      setNotice({ type: 'error', text: `La nota debe estar entre ${selectedCourseGradingScale.minScore} y ${selectedCourseGradingScale.maxScore}.` });
      return;
    }

    const payloadGrade = {
      academicPeriodKey: period.key,
      componentKey,
      ...(subcomponent?.key ? { subcomponentKey: subcomponent.key } : {}),
      score,
      feedback: String(draftValue?.feedback || '').trim(),
    };

    try {
      if (previewEnabled) {
        await onSaveStudentGrades(student);
      } else {
        await saveGradesMutation.mutateAsync({
          courseId: selectedCourseDetail.course.id,
          studentId: student.studentId,
          payload: { grades: [payloadGrade] },
        });
      }

      const successText = `Nota guardada para ${student.name}.`;
      setNotice({ type: 'success', text: successText });
      setGradebookSaveModal({ type: 'success', title: 'Nota guardada', message: successText });
    } catch (error) {
      const errorText = error?.response?.data?.message || error?.message || 'No se pudo guardar la nota.';
      setNotice({ type: 'error', text: errorText });
      setGradebookSaveModal({ type: 'error', title: 'No se guardó la nota', message: errorText });
    }
  };

  if (!previewEnabled && overviewShellQuery.isLoading) {
    return (
      <ColibriBootSplash
        ariaLabel="Cargando portal docente"
        className="is-teacher-portal"
        eyebrow="Campus Docente"
        indeterminate
        message="Abrimos tu tablero con tus materias y cursos. Los indicadores académicos terminan de calcularse en segundo plano."
        title="Entrando al portal docente"
      />
    );
  }

  if (!previewEnabled && overviewShellQuery.isError) {
    return (
      <section className="campus-page">
        <div className="campus-panel campus-panel--intro">
          <span className="campus-panel__kicker">Campus Docente</span>
          <h2>No se pudo cargar el módulo docente</h2>
          <p>{overviewShellQuery.error?.message || 'Intenta de nuevo en unos segundos.'}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="campus-page campus-teacher-portal">
      <DismissibleNotice onClose={() => setNotice({ type: 'info', text: '' })} text={notice.text} type={notice.type} />

      {showPostSuccessModal ? (
        <div className="campus-teacher__success-modal-backdrop" role="presentation">
          <div aria-label="Publicación guardada con éxito" aria-live="polite" className="campus-teacher__success-modal" role="status">
            <span className="campus-panel__kicker">Publicación registrada</span>
            <h3>Tu publicación se ha registrado y guardado con éxito.</h3>
          </div>
        </div>
      ) : null}

      {gradebookSaveModal ? (
        <div className="campus-teacher__success-modal-backdrop campus-teacher__success-modal-backdrop--interactive" role="presentation">
          <div
            aria-label={gradebookSaveModal.title}
            aria-live="polite"
            className={`campus-teacher__success-modal campus-teacher__success-modal--${gradebookSaveModal.type}`}
            role="status"
          >
            <span className="campus-panel__kicker">Libro de notas</span>
            <h3>{gradebookSaveModal.title}</h3>
            <p>{gradebookSaveModal.message}</p>
            <button className="campus-teacher__ghost-btn" onClick={() => setGradebookSaveModal(null)} type="button">
              Entendido
            </button>
          </div>
        </div>
      ) : null}

      {teacherAttendanceSaveModal ? (
        <div className="campus-teacher__success-modal-backdrop campus-teacher__success-modal-backdrop--interactive" role="presentation">
          <div
            aria-label={teacherAttendanceSaveModal.title}
            aria-live="polite"
            className={`campus-teacher__success-modal campus-teacher__success-modal--${teacherAttendanceSaveModal.type}`}
            role="status"
          >
            <span className="campus-panel__kicker">Asistencia</span>
            <h3>{teacherAttendanceSaveModal.title}</h3>
            <p>{teacherAttendanceSaveModal.message}</p>
            <button className="campus-teacher__ghost-btn" onClick={() => setTeacherAttendanceSaveModal(null)} type="button">
              Entendido
            </button>
          </div>
        </div>
      ) : null}

      <header className="campus-teacher__hero">
        <div className="campus-teacher__hero-side campus-teacher__hero-side--left">
          <button
            className="campus-teacher__hero-avatar"
            disabled={uploadTeacherPhotoMutation.isPending}
            onClick={() => teacherPhotoInputRef.current?.click()}
            type="button"
          >
            {teacherPhotoPreview ? (
              <img alt={teacherName} src={teacherPhotoPreview} />
            ) : (
              <span style={{fontSize: '2.2rem', color: '#64748b', fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>+</span>
            )}
          </button>
          <input
            accept="image/*"
            className="campus-teacher__hero-file-input"
            disabled={uploadTeacherPhotoMutation.isPending}
            onChange={onTeacherPhotoChange}
            ref={teacherPhotoInputRef}
            type="file"
          />
          <div className="campus-teacher__hero-identity">
            <span className="campus-teacher__portal-kicker">Docente</span>
            <strong>{teacherName}</strong>
            <span className="campus-teacher__hero-helper-text">
              {uploadTeacherPhotoMutation.isPending ? 'Subiendo foto...' : 'Toca el avatar para actualizar la foto.'}
            </span>
          </div>
        </div>

        <div className="campus-teacher__hero-brand">
          <img alt="Comergio Campus Docentes" className="campus-teacher__hero-brand-image" src="/campus/comergio-docentes-colibri.png" />
        </div>

        <div className="campus-teacher__hero-side campus-teacher__hero-side--right">
          <div className="campus-teacher__hero-user-menu" ref={teacherMenuRef}>
            <button
              aria-expanded={showTeacherMenu}
              aria-haspopup="menu"
              aria-label="Abrir menu de usuario"
              className="campus-teacher__hero-user-action"
              onClick={() => setShowTeacherMenu((currentValue) => !currentValue)}
              type="button"
            >
              <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                <path d="M4 20.5a8 8 0 0 1 16 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
            </button>

            {showTeacherMenu ? (
              <div className="campus-teacher__hero-user-dropdown" role="menu">
                <button className="campus-teacher__hero-user-dropdown-item" onClick={onLogout} role="menuitem" type="button">
                  <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 7V5.75A1.75 1.75 0 0 0 12.25 4h-5.5A1.75 1.75 0 0 0 5 5.75v12.5A1.75 1.75 0 0 0 6.75 20h5.5A1.75 1.75 0 0 0 14 18.25V17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                    <path d="M10 12h9m0 0-2.75-2.75M19 12l-2.75 2.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  </svg>
                  <span>Cerrar sesión</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="campus-teacher__frame">
        <aside className="campus-teacher__sidebar campus-teacher__rail">
          <nav aria-label="Portal docente" className="campus-teacher__rail-nav">
            {teacherNavGroups.map((group) => {
              const groupOptions = group.keys
                .map((key) => availableTeacherSectionOptions.find((option) => option.key === key))
                .filter(Boolean);

              if (!groupOptions.length) {
                return null;
              }

              return (
                <div className="campus-teacher__rail-group" key={group.id}>
                  {group.label ? <p className="campus-teacher__rail-group-label">{group.label}</p> : null}
                  <div className="campus-teacher__nav-list">
                    {groupOptions.map((option) => {
                      const isActive = activeTeacherSection === option.key;
                      const isExpandable = option.key === 'academic_management' || option.key === 'academic_content';

                      if (isExpandable) {
                        return (
                          <div className={`campus-teacher__nav-item campus-teacher__nav-item--expandable${isActive ? ' is-active' : ''}`} key={option.key}>
                            <button
                              aria-expanded={isActive}
                              className="campus-teacher__nav-item-toggle"
                              onClick={() => {
                                setActiveTeacherSection((currentSection) => (currentSection === option.key ? 'dashboard' : option.key));
                              }}
                              type="button"
                            >
                              <span className="campus-teacher__nav-item-icon">
                                <TeacherSectionIcon icon={option.icon} />
                              </span>
                              <span className="campus-teacher__nav-item-label">{option.label}</span>
                              <svg aria-hidden="true" className="campus-teacher__nav-item-chevron" fill="none" viewBox="0 0 24 24">
                                <path d={isActive ? 'M6 15l6-6 6 6' : 'M9 6l6 6-6 6'} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                              </svg>
                            </button>

                            {isActive ? (
                              <div className="campus-teacher__subject-list campus-teacher__subject-list--embedded">
                                {subjectGroups.map((subject) => {
                                  const isSelected = selectedSubjectKey === subject.key;
                                  return (
                                    <button
                                      className={`campus-teacher__subject-item${isSelected ? ' is-active' : ''}`}
                                      key={subject.key}
                                      onClick={() => {
                                        setSelectedSubjectKey(subject.key);
                                        setShowSelectedCourseWorkspace(false);
                                      }}
                                      type="button"
                                    >
                                      <span className="campus-teacher__subject-item-label">{subject.label}</span>
                                      <span className="campus-teacher__subject-item-meta">
                                        {subject.courses.length} curso{subject.courses.length === 1 ? '' : 's'}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      }

                      return (
                        <button
                          className={`campus-teacher__nav-item${isActive ? ' is-active' : ''}`}
                          key={option.key}
                          onClick={() => {
                            setShowSelectedCourseWorkspace(false);
                            setActiveTeacherSection(option.key);
                          }}
                          type="button"
                        >
                          <span className="campus-teacher__nav-item-icon">
                            <TeacherSectionIcon icon={option.icon} />
                          </span>
                          <span className="campus-teacher__nav-item-label">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="campus-teacher__rail-footer">
            <span>{summary.totalCourses} cursos</span>
            <span aria-hidden="true">·</span>
            <span>{summary.totalStudents} alumnos</span>
          </div>
        </aside>

        <div className="campus-teacher__workspace">
          <section className="campus-teacher__course-deck campus-teacher__panel-surface">
            <div className="campus-teacher__section-head">
              <div>
                <span className="campus-panel__kicker">{activeSectionLabel}</span>
                <h2>{activeSectionDescription}</h2>
              </div>
            </div>

            {activeTeacherSection === 'courses' || isCourseManagementSection ? (
              <div className="campus-teacher__courses-stage">
                {!showSelectedCourseWorkspace ? (
                  <div className="campus-teacher__course-strip">
                    {portalSectionGradeGroups.length === 0 ? <p className="campus-panel__meta">Rectoría todavía no te ha asignado cursos para esta sección.</p> : null}
                    {portalSectionGradeGroups.map((gradeGroup) => {
                      const firstCourse = gradeGroup.courses[0] || null;
                      const isSelected = selectedPortalGradeKey === gradeGroup.key;
                      const cardStats = buildCourseGradeGroupStats(gradeGroup, previewEnabled ? previewWorkspace : null);
                      return (
                        <button
                          className={`campus-teacher__course-selector campus-teacher__course-selector--portal${isSelected ? ' is-selected' : ''}`}
                          key={gradeGroup.key}
                          onClick={() => {
                            setSelectedPortalGradeKey(gradeGroup.key);
                            if (firstCourse) {
                              setSelectedCourseId(firstCourse.id);
                              setTimelineCourseId(firstCourse.id);
                            }
                            setActiveCourseWorkspaceTab('grading');
                            setTimelineMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                            setShowSelectedCourseWorkspace(activeTeacherSection === 'academic_content' && Boolean(firstCourse));
                          }}
                          style={{ '--campus-course-accent': firstCourse?.colorToken || '#2a6f97' }}
                          type="button"
                        >
                          <div className="campus-teacher__course-selector-band" />
                          <div className="campus-teacher__course-top">
                            <div>
                              <h4>{gradeGroup.title}</h4>
                              <span className="campus-teacher__course-subtitle">{cardStats.courseCount} curso{cardStats.courseCount === 1 ? '' : 's'} asignado{cardStats.courseCount === 1 ? '' : 's'}</span>
                            </div>
                            <span className="campus-teacher__status-pill is-active">Activo</span>
                          </div>
                          <div className="campus-teacher__course-facts">
                            <span>👥 {cardStats.studentCount} alumnos</span>
                            <span>📊 Promedio: {cardStats.averageScore === null ? 'Sin notas' : cardStats.averageScore}</span>
                            <span>⚠️ {cardStats.atRiskCount} en riesgo</span>
                            <span>📝 {cardStats.pendingGradingCount} tareas por calificar</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {activeTeacherSection === 'academic_content' && selectedPortalGradeGroup && !showSelectedCourseWorkspace ? (
                  <article className="campus-teacher__activity-timeline campus-teacher__activity-timeline--course-filter campus-teacher__embedded-panel">
                    <div className="campus-teacher__activity-timeline-top">
                      <div>
                        <span className="campus-panel__kicker">Planeación del grado</span>
                        <h3>{selectedPortalGradeGroup.title}</h3>
                      </div>
                      <button
                        className="campus-teacher__action-btn"
                        disabled={!selectedPortalGradeCourses.length}
                        onClick={() => {
                          const firstCourse = selectedPortalGradeCourses[0] || null;
                          if (firstCourse) {
                            setSelectedCourseId(firstCourse.id);
                            setTimelineCourseId(firstCourse.id);
                            setShowSelectedCourseWorkspace(true);
                          }
                        }}
                        type="button"
                      >
                        Abrir contenido
                      </button>
                    </div>
                    <p className="campus-panel__meta">Los temas guardados aquí se aplican a todos los grupos de este grado.</p>
                  </article>
                ) : null}

                {activeTeacherSection === 'academic_management' && selectedPortalGradeGroup && !showSelectedCourseWorkspace ? (
                  <article className="campus-teacher__activity-timeline campus-teacher__activity-timeline--course-filter campus-teacher__embedded-panel">
                    <div className="campus-teacher__activity-timeline-top">
                      <div>
                        <span className="campus-panel__kicker">Cursos del grado</span>
                        <h3>{selectedPortalGradeGroup.title}</h3>
                      </div>
                      <label className="campus-teacher__timeline-filter">
                        <span>Curso</span>
                        <select
                          onChange={(event) => {
                            setSelectedCourseId(event.target.value);
                            setTimelineCourseId(event.target.value);
                            setActiveCourseWorkspaceTab('grading');
                            setShowSelectedCourseWorkspace(Boolean(event.target.value));
                          }}
                          value=""
                        >
                          <option value="">Selecciona un curso</option>
                          {selectedPortalGradeCourses.map((course) => (
                            <option key={course.id} value={course.id}>{getCourseGroupLabel(course) || getCourseDisplayTitle(course)}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="campus-panel__meta">Elige el grupo asignado dentro de este grado para definir evaluación, crear contenido y gestionar notas.</p>
                  </article>
                ) : null}

                {activeTeacherSection === 'courses' && timelineCourse ? (
                  <article className="campus-teacher__activity-timeline campus-teacher__activity-timeline--course-filter campus-teacher__embedded-panel">
                    <div className="campus-teacher__activity-timeline-top">
                      <div>
                        <span className="campus-panel__kicker">Cronograma de actividades</span>
                        <h3>{getCourseDisplayTitle(timelineCourse)}</h3>
                      </div>
                      <div className="campus-teacher__activity-timeline-nav">
                        <label className="campus-teacher__timeline-filter">
                          <span>Curso</span>
                          <select
                            onChange={(event) => setTimelineCourseId(event.target.value)}
                            value={timelineCourseId}
                          >
                            {selectedPortalGradeCourses.map((course) => (
                              <option key={course.id} value={course.id}>{getCourseGroupLabel(course) || getCourseDisplayTitle(course)}</option>
                            ))}
                          </select>
                        </label>
                        <button className="campus-teacher__ghost-btn" onClick={() => setTimelineMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} type="button">
                          Mes anterior
                        </button>
                        <button className="campus-teacher__ghost-btn" onClick={() => setTimelineMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} type="button">
                          Mes siguiente
                        </button>
                      </div>
                    </div>
                    <p className="campus-panel__meta">Filtra por curso y revisa el cronograma mensual de clases, tareas, quices, proyectos, examenes y materiales publicados.</p>
                    {!previewEnabled && timelineCourseDetailQuery.isLoading ? <p className="campus-panel__meta">Cargando cronograma del curso...</p> : null}
                    {!previewEnabled && timelineCourseDetailQuery.isError ? <p className="campus-panel__meta">No se pudo cargar el cronograma completo del curso.</p> : null}
                    <div className="campus-teacher__activity-calendar-shell">
                      <div className="campus-teacher__activity-calendar-header">
                        <p>Calendario mensual</p>
                        <strong>{formatMonthLabel(timelineMonth)}</strong>
                      </div>
                      <div className="campus-teacher__activity-calendar-grid" role="list" aria-label={`Cronograma del curso ${getCourseDisplayTitle(timelineCourse)} para ${formatMonthLabel(timelineMonth)}`}>
                        {weekdayShortLabels.map((label) => (
                          <div className="campus-teacher__activity-calendar-weekday" key={`course-timeline-weekday-${label}`} role="listitem" aria-hidden="true">
                            {label}
                          </div>
                        ))}
                        {timelineCourseCalendar.map((cell) => (
                          cell.empty ? (
                            <div className="campus-teacher__activity-calendar-empty" key={cell.key} aria-hidden="true" />
                          ) : (
                            <button
                              className={`campus-teacher__activity-calendar-day${cell.isToday ? ' is-today' : ''}${cell.hasActivity ? ' has-activity' : ''}`}
                              key={cell.key}
                              onClick={() => setSelectedTimelineDate(cell.dateValue)}
                              role="listitem"
                              title={cell.title || undefined}
                              type="button"
                            >
                              <div className="day-number-row">
                                <span className="day-number">{cell.dayNumber}</span>
                                {cell.itemCount > 0 ? <span className="day-count">({cell.itemCount})</span> : null}
                              </div>
                              {cell.primaryChip ? <span className="day-chip primary" title={cell.primaryChip.title}>{cell.primaryChip.label}</span> : null}
                              {cell.secondaryChip ? <span className="day-chip secondary" title={cell.secondaryChip.title}>{cell.secondaryChip.label}</span> : null}
                              {!cell.primaryChip && !cell.secondaryChip ? <span className="day-chip empty">Sin act.</span> : null}
                            </button>
                          )
                        ))}
                      </div>
                    </div>
                  </article>
                ) : null}

                {activeTeacherSection === 'courses' && selectedTimelineDay ? (
                  <div className="campus-teacher__timeline-modal-backdrop" onClick={() => setSelectedTimelineDate('')} role="presentation">
                    <div
                      aria-label={`Programación del ${selectedTimelineDay.formattedDate}`}
                      aria-modal="true"
                      className="campus-teacher__timeline-modal"
                      onClick={(event) => event.stopPropagation()}
                      role="dialog"
                    >
                      <div className="campus-teacher__timeline-modal-head">
                        <div>
                          <span className="campus-panel__kicker">Programación del día</span>
                          <h3>{selectedTimelineDay.formattedDate}</h3>
                        </div>
                        <button className="campus-teacher__ghost-btn" onClick={() => setSelectedTimelineDate('')} type="button">
                          Cerrar
                        </button>
                      </div>

                      <div className="campus-teacher__timeline-modal-body">
                        {selectedTimelineDay.items.length > 0 ? selectedTimelineDay.items.map((item) => (
                          <article className={`campus-teacher__timeline-modal-item is-${item.kind}`} key={item.key}>
                            <span className="campus-teacher__timeline-modal-item-kind">{item.kind === 'class' ? 'Clase' : 'Actividad'}</span>
                            <strong>{item.label}</strong>
                            <span>{item.meta}</span>
                            <p>{item.description}</p>
                          </article>
                        )) : <p className="campus-panel__meta">No hay actividades ni clases programadas para este día.</p>}
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeTeacherSection === 'academic_management' && selectedCourse && showSelectedCourseWorkspace ? (
                  <div className="campus-teacher__course-workspace campus-teacher__panel-surface">
                    <div className="campus-teacher__course-open-head">
                      <button
                        className="campus-teacher__ghost-btn campus-teacher__back-btn"
                        onClick={() => {
                          setShowSelectedCourseWorkspace(false);
                          setSelectedCourseId('');
                        }}
                        type="button"
                      >
                        Volver
                      </button>
                      <div className="campus-teacher__course-open-copy">
                        <span className="campus-panel__kicker">{selectedCourse.subject || 'Asignatura'}</span>
                        <h2>{getCourseDisplayTitle(selectedCourse)}</h2>
                        <p>{[selectedCourse.subject, `${selectedCourseCardStats?.studentCount || 0} estudiantes`, `${selectedCoursePosts.length} publicaciones`].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>

                    <article className="campus-teacher__activity-timeline campus-teacher__embedded-panel">
                      <div className="campus-teacher__activity-timeline-top">
                        <div>
                          <span className="campus-panel__kicker">Cronograma de actividades</span>
                          <h3>{getCourseDisplayTitle(selectedCourse)}</h3>
                        </div>
                        <div className="campus-teacher__activity-timeline-nav">
                          <button className="campus-teacher__ghost-btn" onClick={() => setTimelineMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} type="button">
                            Mes anterior
                          </button>
                          <button className="campus-teacher__ghost-btn" onClick={() => setTimelineMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} type="button">
                            Mes siguiente
                          </button>
                        </div>
                      </div>
                      <p className="campus-panel__meta">Visualiza por mes las actividades programadas y los días en que dictas clase en este curso.</p>
                      <div className="campus-teacher__activity-calendar-shell">
                        <div className="campus-teacher__activity-calendar-header">
                          <p>Calendario mensual</p>
                          <strong>{formatMonthLabel(timelineMonth)}</strong>
                        </div>
                        <div className="campus-teacher__activity-calendar-grid" role="list" aria-label={`Cronograma del curso ${getCourseDisplayTitle(selectedCourse)} para ${formatMonthLabel(timelineMonth)}`}>
                          {weekdayShortLabels.map((label) => (
                            <div className="campus-teacher__activity-calendar-weekday" key={`timeline-weekday-${label}`} role="listitem" aria-hidden="true">
                              {label}
                            </div>
                          ))}
                          {selectedCourseTimelineCalendar.map((cell) => (
                            cell.empty ? (
                              <div className="campus-teacher__activity-calendar-empty" key={cell.key} aria-hidden="true" />
                            ) : (
                              <button
                                className={`campus-teacher__activity-calendar-day${cell.isToday ? ' is-today' : ''}${cell.hasActivity ? ' has-activity' : ''}`}
                                key={cell.key}
                                onClick={() => setSelectedTimelineDate(cell.dateValue)}
                                role="listitem"
                                title={cell.title || undefined}
                                type="button"
                              >
                                <div className="day-number-row">
                                  <span className="day-number">{cell.dayNumber}</span>
                                  {cell.itemCount > 0 ? <span className="day-count">({cell.itemCount})</span> : null}
                                </div>
                                {cell.primaryChip ? <span className="day-chip primary" title={cell.primaryChip.title}>{cell.primaryChip.label}</span> : null}
                                {cell.secondaryChip ? <span className="day-chip secondary" title={cell.secondaryChip.title}>{cell.secondaryChip.label}</span> : null}
                                {!cell.primaryChip && !cell.secondaryChip ? <span className="day-chip empty">Sin act.</span> : null}
                              </button>
                            )
                          ))}
                        </div>
                      </div>
                    </article>

                    {selectedTimelineDay ? (
                      <div className="campus-teacher__timeline-modal-backdrop" onClick={() => setSelectedTimelineDate('')} role="presentation">
                        <div
                          aria-label={`Programación del ${selectedTimelineDay.formattedDate}`}
                          aria-modal="true"
                          className="campus-teacher__timeline-modal"
                          onClick={(event) => event.stopPropagation()}
                          role="dialog"
                        >
                          <div className="campus-teacher__timeline-modal-head">
                            <div>
                              <span className="campus-panel__kicker">Programación del día</span>
                              <h3>{selectedTimelineDay.formattedDate}</h3>
                            </div>
                            <button className="campus-teacher__ghost-btn" onClick={() => setSelectedTimelineDate('')} type="button">
                              Cerrar
                            </button>
                          </div>

                          <div className="campus-teacher__timeline-modal-body">
                            {selectedTimelineDay.items.length > 0 ? selectedTimelineDay.items.map((item) => (
                              <article className={`campus-teacher__timeline-modal-item is-${item.kind}`} key={item.key}>
                                <span className="campus-teacher__timeline-modal-item-kind">{item.kind === 'class' ? 'Clase' : 'Actividad'}</span>
                                <strong>{item.label}</strong>
                                <span>{item.meta}</span>
                                <p>{item.description}</p>
                              </article>
                            )) : <p className="campus-panel__meta">No hay actividades ni clases programadas para este día.</p>}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="campus-teacher__subnav campus-teacher__subnav--classroom">
                      {teacherCourseWorkspaceTabs.map((tab) => {
                        const isActive = activeCourseWorkspaceTab === tab.key;
                        return (
                          <button
                            className={`campus-teacher__subnav-item${isActive ? ' is-active' : ''}`}
                            key={tab.key}
                            onClick={() => setActiveCourseWorkspaceTab(tab.key)}
                            type="button"
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>

                    {activeCourseWorkspaceTab === 'posts' ? (
                      <div className="campus-teacher__classwork">
                        {showAssignmentComposer ? (
                          <form className="campus-teacher__classwork-composer" onSubmit={onCreatePost}>
                            <header className="campus-teacher__classwork-composer-header">
                              <button aria-label="Cerrar" className="campus-teacher__classwork-close" onClick={onCancelEditPost} type="button">
                                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                                </svg>
                              </button>
                              <div className="campus-teacher__classwork-composer-title">
                                <span className={`campus-teacher__classwork-type-icon is-${getClassworkTypeTone(postDraft.type)}`}>
                                  <ClassworkTypeIcon type={postDraft.type} />
                                </span>
                                <strong>{editingPostId ? 'Editar' : 'Nueva'} {formatPostTypeLabel(postDraft.type) || 'asignación'}</strong>
                              </div>
                              <button className="campus-teacher__classwork-assign-btn" disabled={isBusy || courses.length === 0} type="submit">
                                {editingPostId
                                  ? (updatePostMutation.isPending ? 'Guardando...' : 'Guardar')
                                  : (createPostMutation.isPending ? 'Publicando...' : 'Asignar')}
                              </button>
                            </header>

                            <div className="campus-teacher__classwork-composer-body">
                              <div className="campus-teacher__classwork-composer-main">
                                <input
                                  className="campus-teacher__classwork-title-input"
                                  placeholder="Título*"
                                  required
                                  value={postDraft.title}
                                  onChange={(event) => {
                                    const nextTitle = event.target.value;
                                    setPostDraft((currentDraft) => ({
                                      ...currentDraft,
                                      title: nextTitle,
                                      ...(currentDraft.addToGradebook ? { gradebookSubcomponentTitle: nextTitle } : {}),
                                    }));
                                  }}
                                />
                                <textarea
                                  className="campus-teacher__classwork-instructions"
                                  placeholder="Instrucciones (opcional)"
                                  rows={8}
                                  value={postDraft.body}
                                  onChange={(event) => {
                                    const nextBody = event.target.value;
                                    setPostDraft((currentDraft) => ({
                                      ...currentDraft,
                                      body: nextBody,
                                      ...(currentDraft.addToGradebook ? { gradebookSubcomponentDescription: nextBody } : {}),
                                    }));
                                  }}
                                />
                                {editingPostId ? (
                                  <p className="campus-teacher__classwork-edit-note">Los archivos adjuntos originales se conservan. Para cambiarlos, elimina esta asignación y crea una nueva.</p>
                                ) : null}

                                <section className="campus-teacher__classwork-attach">
                                  <div className="campus-teacher__classwork-attach-panel">
                                    <h3>Adjuntar</h3>
                                    <div className="campus-teacher__classwork-attach-actions">
                                      {classworkAttachOptions.map((option) => (
                                        <button
                                          className={`campus-teacher__classwork-attach-btn is-${option.key}`}
                                          key={option.key}
                                          onClick={() => onAttachOptionClick(option)}
                                          type="button"
                                        >
                                          <span className="campus-teacher__classwork-attach-icon">
                                            <ClassworkAttachIcon kind={option.key} />
                                          </span>
                                          <small>{option.label}</small>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <input
                                    accept=".pdf,image/*,video/*,audio/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                                    className="campus-teacher__hero-file-input"
                                    multiple
                                    onChange={(event) => onMaterialFilesChange(event, { append: classworkUploadAppendRef.current })}
                                    ref={classworkUploadInputRef}
                                    type="file"
                                  />
                                  <p className="campus-teacher__classwork-attach-hint">PDF, video, audio, foto o documentos. Máximo {maxMaterialFileCount} archivos de {Math.round(maxMaterialFileBytes / (1024 * 1024))} MB.</p>
                                  {materialFiles.length > 0 ? (
                                    <div className="campus-teacher__classwork-attach-files">
                                      {materialFiles.map((file, fileIndex) => (
                                        <div className="campus-teacher__classwork-attach-file" key={`${file.name}-${file.size}-${fileIndex}`}>
                                          <span className="campus-teacher__classwork-attach-file-icon">
                                            <ClassworkAttachIcon kind={file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'document'} />
                                          </span>
                                          <div className="campus-teacher__classwork-attach-file-copy">
                                            <strong>{file.name}</strong>
                                            <span>{(Number(file.size || 0) / (1024 * 1024)).toFixed(1)} MB</span>
                                          </div>
                                          <button className="campus-teacher__classwork-attach-file-remove" onClick={() => onRemoveMaterialFile(fileIndex)} type="button">
                                            ×
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                  {showAttachLinkPanel || materialLinks.some((link) => String(link.url || '').trim()) || materialLinks.length > 1 ? (
                                    <div className="campus-teacher__classwork-attach-links">
                                      <div className="campus-teacher__classwork-attach-links-head">
                                        <strong>Enlaces web</strong>
                                        <button className="campus-teacher__ghost-btn" onClick={onAddWebLink} type="button">
                                          + Agregar enlace
                                        </button>
                                      </div>
                                      <div className="campus-teacher__link-stack">
                                        {materialLinks.map((link, index) => (
                                          <div className="campus-teacher__link-row" key={`material-link-${index + 1}`}>
                                            <label>
                                              Título
                                              <input value={link.title} onChange={(event) => onChangeMaterialLink(index, 'title', event.target.value)} />
                                            </label>
                                            <label>
                                              URL
                                              <input placeholder="https://..." value={link.url} onChange={(event) => onChangeMaterialLink(index, 'url', event.target.value)} />
                                            </label>
                                            <button className="campus-teacher__ghost-btn" onClick={() => onRemoveMaterialLink(index)} type="button">
                                              Quitar
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </section>
                              </div>

                              <aside className="campus-teacher__classwork-composer-rail">
                                <label className="campus-teacher__classwork-rail-field">
                                  <span>Para</span>
                                  <select value={postDraft.courseId} onChange={(event) => setPostDraft((currentDraft) => ({ ...currentDraft, courseId: event.target.value }))}>
                                    <option value="">Selecciona un curso</option>
                                    {courses.map((course) => (
                                      <option key={course.id} value={course.id}>
                                        {getCourseDisplayTitle(course)}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="campus-teacher__classwork-rail-field">
                                  <span>Asignar a</span>
                                  <select
                                    value={postDraft.targetType || 'course'}
                                    onChange={(event) => setPostDraft((currentDraft) => ({ ...currentDraft, targetType: event.target.value, targetStudentIds: [] }))}
                                  >
                                    <option value="course">Todos los alumnos</option>
                                    <option value="students">Alumnos seleccionados</option>
                                  </select>
                                </label>

                                {postDraft.targetType === 'students' && selectedCourseDetail?.students?.length > 0 ? (
                                  <div className="campus-teacher__classwork-rail-field">
                                    <span>Alumnos</span>
                                    <Select
                                      isMulti
                                      options={selectedCourseDetail.students.map((student) => ({
                                        value: student.studentId,
                                        label: student.name,
                                      }))}
                                      value={(postDraft.targetStudentIds || []).map((id) => {
                                        const student = selectedCourseDetail.students.find((entry) => entry.studentId === id);
                                        return student ? { value: student.studentId, label: student.name } : null;
                                      }).filter(Boolean)}
                                      onChange={(selectedOptions) => {
                                        setPostDraft((currentDraft) => ({
                                          ...currentDraft,
                                          targetStudentIds: selectedOptions.map((opt) => opt.value),
                                        }));
                                      }}
                                      placeholder="Selecciona alumnos..."
                                      classNamePrefix="react-select"
                                    />
                                  </div>
                                ) : null}

                                <label className="campus-teacher__classwork-rail-field">
                                  <span>Tipo</span>
                                  <select
                                    disabled={assignmentComponentOptions.length === 0}
                                    value={postDraft.type}
                                    onChange={(event) => {
                                      const nextType = event.target.value;
                                      const matchingOption = assignmentComponentOptions.find((option) => option.name === nextType);
                                      setPostDraft((currentDraft) => ({
                                        ...currentDraft,
                                        type: nextType,
                                        ...(matchingOption
                                          ? {
                                            gradebookPeriodKey: matchingOption.periodKey,
                                            gradebookComponentKey: matchingOption.key,
                                          }
                                          : {}),
                                      }));
                                    }}
                                  >
                                    {assignmentComponentOptions.length === 0 ? (
                                      <option value="">Configura Estructura de notas</option>
                                    ) : (
                                      <>
                                        {!assignmentComponentOptions.some((option) => option.name === postDraft.type) && postDraft.type ? (
                                          <option value={postDraft.type}>{postDraft.type}</option>
                                        ) : null}
                                        {assignmentComponentOptions.map((option) => (
                                          <option key={`${option.periodKey}-${option.key}`} value={option.name}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </>
                                    )}
                                  </select>
                                </label>

                                <label className="campus-teacher__classwork-rail-field">
                                  <span>Entrega</span>
                                  <select
                                    value={postDraft.deliveryMode}
                                    onChange={(event) => setPostDraft((currentDraft) => ({
                                      ...currentDraft,
                                      deliveryMode: event.target.value,
                                      dueAt: '',
                                      scheduledClassDate: '',
                                      scheduledClassSessionKey: '',
                                    }))}
                                  >
                                    <option value="date">Por fecha</option>
                                    <option value="class">Por clase</option>
                                  </select>
                                </label>

                                {postDraft.deliveryMode === 'date' ? (
                                  <label className="campus-teacher__classwork-rail-field">
                                    <span>Fecha límite</span>
                                    <input type="datetime-local" value={postDraft.dueAt} onChange={(event) => setPostDraft((currentDraft) => ({ ...currentDraft, dueAt: event.target.value }))} />
                                  </label>
                                ) : (
                                  <div className="campus-teacher__classwork-rail-field campus-teacher__classwork-rail-field--wide">
                                    <span>Clase programada</span>
                                    {isPostFormScheduleLoading ? <p className="campus-panel__meta">Cargando horario...</p> : null}
                                    {!isPostFormScheduleLoading && postFormClassSchedule.length === 0 ? <p className="campus-panel__meta">Coordinación debe asignar el horario del curso.</p> : null}
                                    {!isPostFormScheduleLoading && postFormClassSchedule.length > 0 ? (
                                      <>
                                        <div className="campus-teacher__calendar-head">
                                          <button className="campus-teacher__ghost-btn" onClick={() => setCalendarMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} type="button">
                                            ‹
                                          </button>
                                          <strong>{formatMonthLabel(calendarMonth)}</strong>
                                          <button className="campus-teacher__ghost-btn" onClick={() => setCalendarMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} type="button">
                                            ›
                                          </button>
                                        </div>
                                        <div className="campus-teacher__calendar-grid campus-teacher__calendar-grid--compact">
                                          {weekdayShortLabels.map((label) => (
                                            <div className="campus-teacher__calendar-weekday" key={label}>{label}</div>
                                          ))}
                                          {classCalendar.map((cell) => (
                                            cell.empty ? (
                                              <div className="campus-teacher__calendar-day is-empty" key={cell.key} />
                                            ) : (
                                              <button
                                                className={`campus-teacher__calendar-day${cell.hasClass ? ' has-class' : ''}${cell.isSelected ? ' is-selected' : ''}${cell.isToday ? ' is-today' : ''}`}
                                                disabled={!cell.hasClass}
                                                key={cell.key}
                                                onClick={() => setPostDraft((currentDraft) => ({ ...currentDraft, scheduledClassDate: cell.dateValue, scheduledClassSessionKey: '' }))}
                                                type="button"
                                              >
                                                <span>{cell.dayNumber}</span>
                                              </button>
                                            )
                                          ))}
                                        </div>
                                        {postDraft.scheduledClassDate ? (
                                          <div className="campus-teacher__session-picker">
                                            <div className="campus-shell__badges">
                                              {selectedClassSessions.map((session) => {
                                                const sessionKey = buildSessionKey(session);
                                                const isActive = postDraft.scheduledClassSessionKey === sessionKey;
                                                return (
                                                  <button
                                                    className={`campus-teacher__session-chip${isActive ? ' is-selected' : ''}`}
                                                    key={sessionKey}
                                                    onClick={() => setPostDraft((currentDraft) => ({ ...currentDraft, scheduledClassSessionKey: sessionKey }))}
                                                    type="button"
                                                  >
                                                    {session.label || weekdayLongLabels[Number(session.weekday)]} · {formatTimeRange(session.startTime, session.endTime)}
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ) : null}
                                      </>
                                    ) : null}
                                  </div>
                                )}

                                <label className="campus-teacher__classwork-rail-field">
                                  <span>Tema</span>
                                  <input
                                    placeholder="Sin tema"
                                    value={postDraft.gradebookTopic}
                                    onChange={(event) => setPostDraft((currentDraft) => ({ ...currentDraft, gradebookTopic: event.target.value }))}
                                  />
                                </label>

                                {!editingPostId ? (
                                  <label className="campus-teacher__classwork-rail-checkbox">
                                    <input
                                      checked={Boolean(postDraft.addToGradebook)}
                                      onChange={(event) => setPostDraft((currentDraft) => ({
                                        ...currentDraft,
                                        addToGradebook: event.target.checked,
                                        gradebookPeriodKey: event.target.checked ? (currentDraft.gradebookPeriodKey || selectedPostGradebookPeriod?.key || '') : currentDraft.gradebookPeriodKey,
                                        gradebookComponentKey: event.target.checked ? (currentDraft.gradebookComponentKey || selectedPostGradebookComponent?.key || '') : currentDraft.gradebookComponentKey,
                                        gradebookSubcomponentTitle: event.target.checked ? (currentDraft.gradebookSubcomponentTitle || currentDraft.title || '') : currentDraft.gradebookSubcomponentTitle,
                                        gradebookSubcomponentDescription: event.target.checked ? (currentDraft.gradebookSubcomponentDescription || currentDraft.body || '') : currentDraft.gradebookSubcomponentDescription,
                                      }))}
                                      type="checkbox"
                                    />
                                    <span>Agregar al libro de notas</span>
                                  </label>
                                ) : null}

                                {postDraft.addToGradebook && !editingPostId ? (
                                  <div className="campus-teacher__classwork-gradebook-panel">
                                    <label className="campus-teacher__classwork-rail-field">
                                      <span>Periodo</span>
                                      <select
                                        value={postDraft.gradebookPeriodKey || selectedPostGradebookPeriod?.key || ''}
                                        onChange={(event) => setPostDraft((currentDraft) => ({ ...currentDraft, gradebookPeriodKey: event.target.value, gradebookComponentKey: '' }))}
                                      >
                                        {postGradebookPeriodOptions.map((period) => (
                                          <option key={period.key} value={period.key}>{period.name || period.key}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="campus-teacher__classwork-rail-field">
                                      <span>Componente</span>
                                      <select
                                        value={postDraft.gradebookComponentKey || selectedPostGradebookComponent?.key || ''}
                                        onChange={(event) => setPostDraft((currentDraft) => ({ ...currentDraft, gradebookComponentKey: event.target.value }))}
                                      >
                                        {postGradebookComponentOptions.map((component) => (
                                          <option key={component.key} value={component.key}>{component.name || component.key}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="campus-teacher__classwork-rail-field">
                                      <span>Puntos (%)</span>
                                      <input
                                        max={selectedPostGradebookComponentWeightAvailable || 100}
                                        min="0"
                                        step="0.1"
                                        type="number"
                                        value={postDraft.gradebookWeight}
                                        onChange={(event) => setPostDraft((currentDraft) => ({ ...currentDraft, gradebookWeight: event.target.value }))}
                                      />
                                    </label>
                                    <p className="campus-panel__meta">Disponible: {selectedPostGradebookComponentWeightAvailable}%</p>
                                  </div>
                                ) : null}
                              </aside>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="campus-teacher__classwork-toolbar">
                              <div className="campus-teacher__classwork-create" ref={classworkCreateMenuRef}>
                                <button
                                  aria-expanded={showClassworkCreateMenu}
                                  className="campus-teacher__classwork-create-btn"
                                  disabled={courses.length === 0 || assignmentComponentOptions.length === 0}
                                  onClick={() => setShowClassworkCreateMenu((currentValue) => !currentValue)}
                                  title={assignmentComponentOptions.length === 0 ? 'Configura componentes en Estructura de notas' : 'Crear asignación'}
                                  type="button"
                                >
                                  <span aria-hidden="true">+</span>
                                  Crear
                                </button>
                                {showClassworkCreateMenu && assignmentComponentOptions.length > 0 ? (
                                  <div className="campus-teacher__classwork-create-menu" role="menu">
                                    {assignmentComponentOptions.map((option) => (
                                      <button
                                        className="campus-teacher__classwork-create-option"
                                        key={`${option.periodKey}-${option.key}`}
                                        onClick={() => openAssignmentComposer(option)}
                                        role="menuitem"
                                        type="button"
                                      >
                                        <span className={`campus-teacher__classwork-type-icon is-${getClassworkTypeTone(option.name)}`}>
                                          <ClassworkTypeIcon type={option.name} />
                                        </span>
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                                {assignmentComponentOptions.length === 0 ? (
                                  <p className="campus-teacher__classwork-create-hint">Define los componentes en <strong>Estructura de notas</strong> para habilitar Crear.</p>
                                ) : null}
                              </div>
                            </div>

                            <div className="campus-teacher__classwork-list">
                              {selectedCourseAssignmentPosts.length === 0 ? (
                                <p className="campus-teacher__classwork-empty">Aún no hay asignaciones publicadas en este curso.</p>
                              ) : (
                                selectedCourseAssignmentPosts.map((post) => {
                                  const tone = getClassworkTypeTone(post.type);
                                  const isMenuOpen = openPostMenuId === post.id;
                                  return (
                                    <article className="campus-teacher__classwork-item" key={post.id}>
                                      <span className={`campus-teacher__classwork-type-icon is-${tone}`}>
                                        <ClassworkTypeIcon type={post.type} />
                                      </span>
                                      <div className="campus-teacher__classwork-item-copy">
                                        <strong>{post.title || 'Sin título'}</strong>
                                        <span>{formatPostTypeLabel(post.type)} · {formatDeliveryLabel(post)}</span>
                                      </div>
                                      <span className="campus-teacher__classwork-item-date">Publicado {formatPostedDate(post)}</span>
                                      <div className="campus-teacher__classwork-item-menu">
                                        <button
                                          aria-expanded={isMenuOpen}
                                          aria-label="Opciones"
                                          className="campus-teacher__classwork-item-menu-btn"
                                          onClick={() => setOpenPostMenuId((currentValue) => (currentValue === post.id ? '' : post.id))}
                                          type="button"
                                        >
                                          ⋮
                                        </button>
                                        {isMenuOpen ? (
                                          <div className="campus-teacher__classwork-item-dropdown" role="menu">
                                            <button onClick={() => onEditPost(post)} role="menuitem" type="button">Editar</button>
                                            <button onClick={() => { setOpenPostMenuId(''); onArchivePost(post); }} role="menuitem" type="button">Eliminar</button>
                                          </div>
                                        ) : null}
                                      </div>
                                    </article>
                                  );
                                })
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                    {activeCourseWorkspaceTab === 'grading' ? (
                      <article className="campus-teacher__grading-editor campus-teacher__grading-editor--classroom campus-teacher__embedded-panel">
                        <div className="campus-teacher__classroom-head">
                          <div>
                            <h2 className="campus-teacher__classroom-title">{gradingCourseTitle}</h2>
                            <p className="campus-teacher__classroom-subtitle">Configura periodos, componentes y subcomponentes de evaluación.</p>
                          </div>
                        </div>
                        <div className="campus-teacher__grading-stack">
                          {!selectedCourse ? <p className="campus-panel__meta">Selecciona un curso para editar la estructura de notas.</p> : null}
                          {selectedCourse && gradingPeriods.length === 0 ? <p className="campus-panel__meta">Este curso aun no tiene periodos configurados.</p> : null}
                          {gradingPeriods.map((period, periodIndex) => (
                            <div className="campus-teacher__grading-period-card" key={`${period.key || 'period'}-${periodIndex}`}>
                              <div className="campus-teacher__grading-period-head">
                                <div>
                                  <span className="campus-teacher__classroom-kicker">Período académico</span>
                                  <h3>{period.name || `Periodo ${periodIndex + 1}`}</h3>
                                  <p className="campus-panel__meta">{formatPeriodDateRange(period.startDate, period.endDate)}</p>
                                </div>
                                <span className="campus-teacher__grading-period-weight">{period.weight}%</span>
                              </div>
                              <div className="campus-teacher__grading-row campus-teacher__grading-row--portal">
                                <label>
                                  Nombre del periodo
                                  <input className="campus-teacher__readonly-input" readOnly value={period.name} />
                                </label>
                                <label>
                                  % de la asignatura
                                  <div className="campus-teacher__percent-field">
                                    <input
                                      className="campus-teacher__readonly-input"
                                      min="0"
                                      readOnly
                                      step="0.1"
                                      type="number"
                                      value={period.weight}
                                    />
                                    <span>%</span>
                                  </div>
                                </label>
                              </div>
                              <div className="campus-teacher__grading-period-title">
                                <strong className="campus-teacher__grading-period-title-text">Componentes</strong>
                              </div>
                              <div className="campus-teacher__grading-stack">
                                {(period.gradingComponents || []).map((component, componentIndex) => (
                                  <div className="campus-teacher__grading-component-card" key={`${component.key || 'component'}-${componentIndex}`}>
                                    {(() => {
                                      const draftKey = buildSubcomponentDraftKey(periodIndex, componentIndex);
                                      const newSubcomponentDraft = subcomponentDrafts[draftKey]
                                        || createSubcomponentDraft((component.subcomponents?.length || 0) + 1);

                                      return (
                                        <>
                                    <div className="campus-teacher__grading-component-main">
                                      <label>
                                        Nombre
                                        <input value={component.name} onChange={(event) => onChangePeriodComponent(periodIndex, componentIndex, 'name', event.target.value)} />
                                      </label>
                                      <label>
                                        % de periodo
                                        <div className="campus-teacher__percent-field">
                                          <input
                                            min="0"
                                            step="0.1"
                                            type="number"
                                            value={component.weight}
                                            onChange={(event) => onChangePeriodComponent(periodIndex, componentIndex, 'weight', event.target.value)}
                                          />
                                          <span>%</span>
                                        </div>
                                      </label>
                                    </div>
                                    <div className="campus-teacher__grading-component-actions">
                                      <button
                                        className="campus-teacher__action-btn campus-teacher__action-btn--compact"
                                        disabled={isBusy}
                                        onClick={() => onSaveComponent(periodIndex, componentIndex)}
                                        type="button"
                                      >
                                        {updateGradingSchemeMutation.isPending ? 'Guardando...' : 'Guardar'}
                                      </button>
                                      <button className="campus-teacher__ghost-btn campus-teacher__ghost-btn--compact" onClick={() => onRemovePeriodComponent(periodIndex, componentIndex)} type="button">
                                        Quitar
                                      </button>
                                    </div>
                                    <div className="campus-teacher__grading-subcomponents">
                                      <div className="campus-teacher__grading-subcomponents-head">
                                        <div>
                                          <strong className="campus-teacher__grading-subcomponents-title">Subcomponentes</strong>
                                          <p className="campus-teacher__grading-subcomponents-copy">Organiza quizzes, talleres o entregas debajo de este componente.</p>
                                        </div>
                                      </div>
                                      <div className="campus-teacher__grading-subcomponent-composer">
                                        <label>
                                          Nombre
                                          <input
                                            placeholder="Ej: Quiz 1"
                                            value={newSubcomponentDraft.name}
                                            onChange={(event) => onChangeSubcomponentDraft(periodIndex, componentIndex, 'name', event.target.value)}
                                          />
                                        </label>
                                        <label>
                                          Fecha
                                          <input
                                            type="date"
                                            value={newSubcomponentDraft.date}
                                            onChange={(event) => onChangeSubcomponentDraft(periodIndex, componentIndex, 'date', event.target.value)}
                                          />
                                        </label>
                                        <label>
                                          % del componente
                                          <input
                                            min="0"
                                            step="0.1"
                                            type="number"
                                            value={newSubcomponentDraft.weight}
                                            onChange={(event) => onChangeSubcomponentDraft(periodIndex, componentIndex, 'weight', event.target.value)}
                                          />
                                        </label>
                                        <label>
                                          Tematica
                                          <input
                                            placeholder="Tema o unidad"
                                            value={newSubcomponentDraft.topic}
                                            onChange={(event) => onChangeSubcomponentDraft(periodIndex, componentIndex, 'topic', event.target.value)}
                                          />
                                        </label>
                                        <button className="campus-teacher__action-btn campus-teacher__action-btn--compact" onClick={() => onSaveSubcomponent(periodIndex, componentIndex)} type="button">
                                          Agregar subcomponente
                                        </button>
                                      </div>
                                      {(component.subcomponents || []).length ? (
                                        <div className="campus-teacher__grading-subcomponents-list">
                                          {(component.subcomponents || []).map((sub, subIdx) => (
                                            <div className="campus-teacher__grading-subcomponent-row" key={subIdx}>
                                              <label>
                                                Nombre
                                                <input
                                                  placeholder="Ej: Quiz 1"
                                                  value={sub.name}
                                                  onChange={(event) => onChangeSubcomponent(periodIndex, componentIndex, subIdx, 'name', event.target.value)}
                                                />
                                              </label>
                                              <label>
                                                Fecha
                                                <input
                                                  type="date"
                                                  value={sub.date}
                                                  onChange={(event) => onChangeSubcomponent(periodIndex, componentIndex, subIdx, 'date', event.target.value)}
                                                />
                                              </label>
                                              <label>
                                                % del componente
                                                <input
                                                  min="0"
                                                  step="0.1"
                                                  type="number"
                                                  value={sub.weight}
                                                  onChange={(event) => onChangeSubcomponent(periodIndex, componentIndex, subIdx, 'weight', event.target.value)}
                                                />
                                              </label>
                                              <label>
                                                Tematica
                                                <input
                                                  placeholder="Tema o unidad"
                                                  value={sub.topic}
                                                  onChange={(event) => onChangeSubcomponent(periodIndex, componentIndex, subIdx, 'topic', event.target.value)}
                                                />
                                              </label>
                                              <button className="campus-teacher__ghost-btn" onClick={() => onRemoveSubcomponent(periodIndex, componentIndex, subIdx)} type="button">Quitar</button>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="campus-teacher__grading-subcomponents-empty">Aun no hay subcomponentes para este componente.</p>
                                      )}
                                    </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                ))}
                                <button className="campus-teacher__ghost-btn campus-teacher__ghost-btn--compact campus-teacher__grading-add-btn" onClick={() => onAddPeriodComponent(periodIndex)} type="button">
                                  + Agregar componente
                                </button>
                              </div>
                              <div className="campus-teacher__grading-period-footer">
                                <span className="campus-panel__meta">Total componentes: {(period.gradingComponents || []).reduce((total, component) => total + (Number(component.weight) || 0), 0).toFixed(1)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="campus-teacher__classroom-footer">
                          <span className="campus-panel__meta">Total periodos {gradingPeriods.reduce((total, period) => total + (Number(period.weight) || 0), 0).toFixed(1)}%</span>
                          <button className="campus-teacher__action-btn campus-teacher__action-btn--compact" disabled={isBusy} onClick={onSaveGradingScheme} type="button">
                            {updateGradingSchemeMutation.isPending ? 'Guardando...' : 'Guardar ponderación'}
                          </button>
                        </div>
                      </article>
                    ) : null}

                    {activeCourseWorkspaceTab === 'gradebook' ? (
                      <article className="campus-teacher__gradebook-panel campus-teacher__gradebook-panel--classroom campus-teacher__embedded-panel">
                        <div className="campus-teacher__classroom-head">
                          <div>
                            <h2 className="campus-teacher__classroom-title">{gradingCourseTitle}</h2>
                            <p className="campus-teacher__classroom-subtitle">Consulta y registra calificaciones por alumno o por asignación.</p>
                          </div>
                        </div>
                        {!previewEnabled && selectedCourse && courseDetailQuery.isLoading ? <p className="campus-panel__meta">Cargando estudiantes y notas del curso...</p> : null}
                        {!previewEnabled && selectedCourse && courseDetailQuery.isError ? <p className="campus-panel__meta">No se pudo cargar el detalle del curso.</p> : null}
                        {selectedCourseDetail?.students?.length ? (
                          <div className="campus-teacher__gradebook-shell">
                            <input
                              className="campus-teacher__gradebook-search"
                              onChange={(event) => setGradebookSearch(event.target.value)}
                              placeholder="Buscar alumno por nombre..."
                              type="text"
                              value={gradebookSearch || ''}
                            />
                            <div className="campus-teacher__subnav campus-teacher__subnav--classroom campus-teacher__gradebook-mode-switch" role="group" aria-label="Modo de calificacion">
                              <button
                                className={`campus-teacher__subnav-item${gradebookMode === 'student' ? ' is-active' : ''}`}
                                onClick={() => setGradebookMode('student')}
                                type="button"
                              >
                                Por alumno
                              </button>
                              <button
                                className={`campus-teacher__subnav-item${gradebookMode === 'assignment' ? ' is-active' : ''}`}
                                onClick={() => setGradebookMode('assignment')}
                                type="button"
                              >
                                Por asignación
                              </button>
                            </div>
                            {gradebookMode === 'student' ? (
                            <div className="campus-teacher__gradebook-stack campus-teacher__gradebook-stack--classroom">
                              {selectedCourseDetail.students
                                .filter(student => !gradebookSearch || student.name.toLowerCase().includes(gradebookSearch.toLowerCase()))
                                .map((student) => {
                                  const studentPeriods = applyGradeDraftsToStudentPeriods(
                                    buildStudentPeriods(student, selectedCourseAcademicPeriods),
                                    studentDrafts?.[student.studentId] || {}
                                  );
                                  const studentFinalScore = calculateFinalScore(studentPeriods);

                                  return (
                                  <div className="campus-teacher__gradebook-student-item" key={student.studentId}>
                                    <button
                                      className="campus-teacher__gradebook-student-row"
                                      onClick={() => setOpenGradebookRows((open) => ({ ...open, [student.studentId]: !open[student.studentId] }))}
                                      type="button"
                                    >
                                      <div className="campus-teacher__gradebook-student-name">{student.name}</div>
                                      <div className="campus-teacher__gradebook-student-grade">{student.grade}</div>
                                      <div className="campus-teacher__gradebook-student-score">
                                        {studentFinalScore === null || studentFinalScore === undefined ? 'Sin definitiva' : `Definitiva ${studentFinalScore}`}
                                      </div>
                                      <span aria-hidden="true" className="campus-teacher__gradebook-student-chevron">
                                        {openGradebookRows?.[student.studentId] ? '▲' : '▼'}
                                      </span>
                                    </button>
                                    {openGradebookRows?.[student.studentId] ? (
                                      <div className="campus-teacher__gradebook-student-detail">
                                        <div className="campus-teacher__gradebook-period-stack">
                                          {studentPeriods.map((period) => {
                                            const periodRowKey = buildGradebookPeriodRowKey(student.studentId, period.key);
                                            const isPeriodOpen = Boolean(openGradebookPeriods?.[periodRowKey]);

                                            return (
                                              <section className="campus-teacher__gradebook-period-card" key={`${student.studentId}-${period.key}`}>
                                                <button
                                                  className="campus-teacher__gradebook-toggle"
                                                  onClick={() => setOpenGradebookPeriods((currentValue) => ({ ...currentValue, [periodRowKey]: !currentValue[periodRowKey] }))}
                                                  type="button"
                                                >
                                                  <div className="campus-teacher__gradebook-toggle-copy">
                                                    <span className="campus-panel__kicker">{period.name}</span>
                                                    <strong>{period.weight}% de la materia</strong>
                                                  </div>
                                                  <div className="campus-teacher__gradebook-toggle-meta">
                                                    <span className="campus-teacher__mode-pill">
                                                      {period.periodScore === null || period.periodScore === undefined ? 'Sin promedio' : `Promedio ${period.periodScore}`}
                                                    </span>
                                                    <span className="campus-teacher__gradebook-toggle-icon" aria-hidden="true">{isPeriodOpen ? '−' : '+'}</span>
                                                  </div>
                                                </button>
                                                {isPeriodOpen ? (
                                                  <div className="campus-teacher__gradebook-period-body">
                                                    <div className="campus-teacher__gradebook-component-stack">
                                                      {(period.scores || []).map((score) => {
                                                        const componentRowKey = buildGradebookComponentRowKey(student.studentId, period.key, score.componentKey);
                                                        const isComponentOpen = Boolean(openGradebookComponents?.[componentRowKey]);
                                                        const matchingDraftPeriod = selectedCourseDraftAcademicPeriods.find((draftPeriod) => draftPeriod.key === period.key);
                                                        const matchingDraftComponent = matchingDraftPeriod?.gradingComponents?.find((draftComponent) => draftComponent.key === score.componentKey);
                                                        const visibleSubcomponents = matchingDraftComponent?.subcomponents || [];

                                                        return (
                                                          <section className="campus-teacher__gradebook-component-card" key={`${student.studentId}-${period.key}-${score.componentKey}`}>
                                                            <button
                                                              className="campus-teacher__gradebook-toggle campus-teacher__gradebook-toggle--component"
                                                              onClick={() => setOpenGradebookComponents((currentValue) => ({ ...currentValue, [componentRowKey]: !currentValue[componentRowKey] }))}
                                                              type="button"
                                                            >
                                                              <div className="campus-teacher__gradebook-toggle-copy">
                                                                <strong>{score.componentName}</strong>
                                                                <span>{score.weight}% del período</span>
                                                              </div>
                                                              <div className="campus-teacher__gradebook-toggle-meta">
                                                                <span className="campus-teacher__mode-pill">
                                                                  {score.score === null || score.score === undefined ? 'Sin nota' : `Nota ${score.score}`}
                                                                </span>
                                                                <span className="campus-teacher__gradebook-toggle-icon" aria-hidden="true">{isComponentOpen ? '−' : '+'}</span>
                                                              </div>
                                                            </button>
                                                            {isComponentOpen ? (
                                                              <div className="campus-teacher__gradebook-component-body">
                                                                <div className="campus-teacher__student-score">
                                                                  {!visibleSubcomponents.length ? (
                                                                    <label>
                                                                      Nota del componente
                                                                      <input
                                                                        max={selectedCourseGradingScale.maxScore}
                                                                        min={selectedCourseGradingScale.minScore}
                                                                        step="0.1"
                                                                        type="number"
                                                                        value={studentDrafts?.[student.studentId]?.[buildGradeDraftKey(period.key, score.componentKey)]?.score ?? ''}
                                                                        onChange={(event) => onStudentDraftChange(student.studentId, period.key, score.componentKey, 'score', event.target.value)}
                                                                      />
                                                                    </label>
                                                                  ) : null}
                                                                  {!visibleSubcomponents.length ? (
                                                                    <label>
                                                                      Observación
                                                                      <textarea
                                                                        rows={2}
                                                                        value={studentDrafts?.[student.studentId]?.[buildGradeDraftKey(period.key, score.componentKey)]?.feedback ?? ''}
                                                                        onChange={(event) => onStudentDraftChange(student.studentId, period.key, score.componentKey, 'feedback', event.target.value)}
                                                                      />
                                                                    </label>
                                                                  ) : null}
                                                                  {!visibleSubcomponents.length ? (
                                                                    <button className="campus-teacher__action-btn" disabled={isBusy} onClick={() => onSaveStudentGradeEntry(student, period, score)} type="button">
                                                                      {saveGradesMutation.isPending ? 'Guardando...' : 'Guardar nota'}
                                                                    </button>
                                                                  ) : null}
                                                                  {visibleSubcomponents.length ? (
                                                                    <div className="campus-teacher__student-subcomponents">
                                                                      <div className="campus-teacher__student-score-summary">
                                                                        <span className="campus-teacher__student-subcomponents-title">Nota del componente</span>
                                                                        <strong>{score.score === null || score.score === undefined ? 'Sin nota calculada' : score.score}</strong>
                                                                        <p>Se calcula automaticamente con el promedio ponderado de los subcomponentes.</p>
                                                                      </div>
                                                                      <span className="campus-teacher__student-subcomponents-title">Subcomponentes</span>
                                                                      <div className="campus-teacher__student-subcomponents-list">
                                                                        {visibleSubcomponents.map((subcomponent, subcomponentIndex) => (
                                                                          <div className="campus-teacher__student-subcomponent-item" key={`${score.componentKey}-subcomponent-${subcomponent.order || subcomponentIndex + 1}`}>
                                                                            <div className="campus-teacher__student-subcomponent-head">
                                                                              <div>
                                                                                <strong>{subcomponent.name || `Subcomponente ${subcomponentIndex + 1}`}</strong>
                                                                                <span>
                                                                                  {[`${subcomponent.weight || 0}% del componente`, subcomponent.date ? formatDateLabel(subcomponent.date) : '', subcomponent.topic || 'Sin temática']
                                                                                    .filter(Boolean)
                                                                                    .join(' · ')}
                                                                                </span>
                                                                              </div>
                                                                            </div>
                                                                            <div className="campus-teacher__student-subcomponent-fields">
                                                                              <label>
                                                                                Nota
                                                                                <input
                                                                                  max={selectedCourseGradingScale.maxScore}
                                                                                  min={selectedCourseGradingScale.minScore}
                                                                                  step="0.1"
                                                                                  type="number"
                                                                                  value={studentDrafts?.[student.studentId]?.[buildGradeDraftKey(period.key, score.componentKey, subcomponent.key)]?.score ?? ''}
                                                                                  onChange={(event) => onStudentDraftChange(student.studentId, period.key, score.componentKey, 'score', event.target.value, subcomponent.key)}
                                                                                />
                                                                              </label>
                                                                              <label>
                                                                                Observación
                                                                                <textarea
                                                                                  rows={2}
                                                                                  value={studentDrafts?.[student.studentId]?.[buildGradeDraftKey(period.key, score.componentKey, subcomponent.key)]?.feedback ?? ''}
                                                                                  onChange={(event) => onStudentDraftChange(student.studentId, period.key, score.componentKey, 'feedback', event.target.value, subcomponent.key)}
                                                                                />
                                                                              </label>
                                                                              <button className="campus-teacher__action-btn" disabled={isBusy} onClick={() => onSaveStudentGradeEntry(student, period, score, subcomponent)} type="button">
                                                                                {saveGradesMutation.isPending ? 'Guardando...' : 'Guardar nota'}
                                                                              </button>
                                                                            </div>
                                                                          </div>
                                                                        ))}
                                                                      </div>
                                                                    </div>
                                                                  ) : null}
                                                                </div>
                                                              </div>
                                                            ) : null}
                                                          </section>
                                                        );
                                                      })}
                                                    </div>
                                                  </div>
                                                ) : null}
                                              </section>
                                            );
                                          })}
                                        </div>
                                        <div className="campus-teacher__classroom-footer">
                                          <span className="campus-panel__meta">Última actualización {formatDateLabel(selectedCourseDetail.course.updatedAt)}</span>
                                          <button className="campus-teacher__action-btn campus-teacher__action-btn--compact" disabled={isBusy} onClick={() => onSaveStudentGrades(student)} type="button">
                                            {saveGradesMutation.isPending ? 'Guardando...' : 'Guardar notas'}
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                )})}
                            </div>
                            ) : (
                              <div className="campus-teacher__assignment-gradebook">
                                <div className="campus-teacher__assignment-toolbar">
                                  <label>
                                    Asignacion
                                    <select
                                      value={selectedGradebookAssignment?.key || ''}
                                      onChange={(event) => setSelectedGradebookAssignmentKey(event.target.value)}
                                    >
                                      {gradebookAssignmentOptions.map((assignment) => (
                                        <option key={assignment.key} value={assignment.key}>{assignment.label}</option>
                                      ))}
                                    </select>
                                  </label>
                                  {selectedGradebookAssignment ? (
                                    <div className="campus-teacher__assignment-meta">
                                      <strong>{selectedGradebookAssignment.subcomponentName}</strong>
                                      <span>
                                        {[selectedGradebookAssignment.periodName, selectedGradebookAssignment.componentName, `${selectedGradebookAssignment.weight}% del componente`, selectedGradebookAssignment.date ? formatDateLabel(selectedGradebookAssignment.date) : '', selectedGradebookAssignment.topic || '']
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </span>
                                    </div>
                                  ) : null}
                                </div>
                                {!gradebookAssignmentOptions.length ? (
                                  <p className="campus-panel__meta">Este curso aun no tiene asignaciones creadas en los subcomponentes.</p>
                                ) : null}
                                {selectedGradebookAssignment ? (
                                  <>
                                    <div className="campus-teacher__assignment-table-wrap">
                                      <table className="campus-teacher__assignment-table">
                                        <thead>
                                          <tr>
                                            <th>Alumno</th>
                                            <th>Definitiva</th>
                                            <th>Nota</th>
                                            <th>Observacion</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {selectedCourseDetail.students
                                            .filter(student => !gradebookSearch || student.name.toLowerCase().includes(gradebookSearch.toLowerCase()))
                                            .map((student) => {
                                              const draftKey = buildGradeDraftKey(
                                                selectedGradebookAssignment.periodKey,
                                                selectedGradebookAssignment.componentKey,
                                                selectedGradebookAssignment.subcomponentKey
                                              );
                                              const studentPeriods = applyGradeDraftsToStudentPeriods(
                                                buildStudentPeriods(student, selectedCourseAcademicPeriods),
                                                studentDrafts?.[student.studentId] || {}
                                              );
                                              const studentFinalScore = calculateFinalScore(studentPeriods);

                                              return (
                                                <tr key={`${selectedGradebookAssignment.key}-${student.studentId}`}>
                                                  <td>
                                                    <strong>{student.name}</strong>
                                                    <span>{student.grade}</span>
                                                  </td>
                                                  <td>{studentFinalScore === null || studentFinalScore === undefined ? 'Sin definitiva' : studentFinalScore}</td>
                                                  <td>
                                                    <input
                                                      max={selectedCourseGradingScale.maxScore}
                                                      min={selectedCourseGradingScale.minScore}
                                                      step="0.1"
                                                      type="number"
                                                      value={studentDrafts?.[student.studentId]?.[draftKey]?.score ?? ''}
                                                      onChange={(event) => onStudentDraftChange(
                                                        student.studentId,
                                                        selectedGradebookAssignment.periodKey,
                                                        selectedGradebookAssignment.componentKey,
                                                        'score',
                                                        event.target.value,
                                                        selectedGradebookAssignment.subcomponentKey
                                                      )}
                                                    />
                                                  </td>
                                                  <td>
                                                    <textarea
                                                      rows={2}
                                                      value={studentDrafts?.[student.studentId]?.[draftKey]?.feedback ?? ''}
                                                      onChange={(event) => onStudentDraftChange(
                                                        student.studentId,
                                                        selectedGradebookAssignment.periodKey,
                                                        selectedGradebookAssignment.componentKey,
                                                        'feedback',
                                                        event.target.value,
                                                        selectedGradebookAssignment.subcomponentKey
                                                      )}
                                                    />
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                        </tbody>
                                      </table>
                                    </div>
                                    <div className="campus-teacher__classroom-footer">
                                      <span className="campus-panel__meta">Se guardarán las filas que tengan nota digitada.</span>
                                      <button className="campus-teacher__action-btn campus-teacher__action-btn--compact" disabled={isBusy || !selectedGradebookAssignment} onClick={onSaveAssignmentGrades} type="button">
                                        {saveGradesMutation.isPending ? 'Guardando...' : 'Guardar asignación'}
                                      </button>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            )}
                          </div>
                        ) : null}
                        {selectedCourseDetail && !selectedCourseDetail.students?.length ? <p className="campus-panel__meta">Este curso todavía no tiene estudiantes activos asociados al grupo {getCourseGroupLabel(selectedCourseDetail.course) || getCourseGradeLabel(selectedCourseDetail.course)}.</p> : null}
                      </article>
                    ) : null}
                  </div>
                ) : null}

                {activeTeacherSection === 'academic_content' && selectedCourse && showSelectedCourseWorkspace ? (
                  <div className="campus-teacher__course-workspace campus-teacher__panel-surface">
                    <div className="campus-teacher__course-open-head">
                      <button
                        className="campus-teacher__ghost-btn campus-teacher__back-btn"
                        onClick={() => {
                          setShowSelectedCourseWorkspace(false);
                          setSelectedCourseId('');
                        }}
                        type="button"
                      >
                        Volver
                      </button>
                      <div className="campus-teacher__course-open-copy">
                        <span className="campus-panel__kicker">Contenido académico</span>
                        <h2>{selectedPortalGradeGroup?.title || getCourseGradeGroupLabel(selectedCourse)}</h2>
                        <p>{[selectedCourse.subject, selectedPortalGradeGroup?.grade || selectedCourse.gradeLevel, `${academicContentDrafts.reduce((total, period) => total + (period.topics || []).filter((topic) => String(topic.title || '').trim()).length, 0)} temas`].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>

                    <article className="campus-teacher__grading-editor campus-teacher__embedded-panel">
                      <div className="campus-teacher__section-head">
                        <div>
                          <span className="campus-panel__kicker">Planeación anual</span>
                          <h2>Temas por periodo académico</h2>
                        </div>
                        <button className="campus-teacher__action-btn" disabled={isBusy || !selectedCourse} onClick={onSaveAcademicContent} type="button">
                          {updateAcademicContentMutation.isPending ? 'Guardando...' : 'Guardar contenido'}
                        </button>
                      </div>

                      <div className="campus-teacher__grading-stack">
                        {academicContentDrafts.length === 0 ? <p className="campus-panel__meta">Este grado aún no tiene periodos académicos sincronizados desde Rectoría.</p> : null}
                        {academicContentDrafts.map((period, periodIndex) => {
                          const inputKey = period.periodKey || `period_${periodIndex + 1}`;
                          const topicInput = academicContentTopicInputs[inputKey] || { title: '', description: '' };
                          return (
                          <section className="campus-teacher__delivery-panel campus-teacher__delivery-panel--portal" key={`${period.periodKey || 'period'}-${periodIndex}`}>
                            <div className="campus-teacher__section-head">
                              <div>
                                <span className="campus-panel__kicker">{formatPeriodDateRange(period.startDate, period.endDate)}</span>
                                <h3>{period.periodName || `Periodo ${periodIndex + 1}`}</h3>
                              </div>
                            </div>

                            <div className="campus-teacher__academic-topic-composer">
                              <label>
                                Tema de estudio
                                <input
                                  placeholder="Ej. Fracciones y resolución de problemas"
                                  value={topicInput.title}
                                  onChange={(event) => onChangeAcademicContentTopicInput(period, periodIndex, 'title', event.target.value)}
                                />
                              </label>
                              <label>
                                Detalle o alcance
                                <input
                                  placeholder="Conceptos, competencias o actividades principales"
                                  value={topicInput.description}
                                  onChange={(event) => onChangeAcademicContentTopicInput(period, periodIndex, 'description', event.target.value)}
                                />
                              </label>
                              <button className="campus-teacher__action-btn" disabled={!String(topicInput.title || '').trim()} onClick={() => onAddAcademicContentTopic(periodIndex)} type="button">
                                Agregar
                              </button>
                            </div>

                            <div className="campus-teacher__grading-stack">
                              {(period.topics || []).length === 0 ? <p className="campus-panel__meta">Aún no hay temas para este periodo.</p> : null}
                              {(period.topics || []).map((topic, topicIndex) => (
                                <div className="campus-teacher__saved-topic-card" key={`${topic.key || 'topic'}-${topicIndex}`}>
                                  <div>
                                    <span className="campus-panel__kicker">Tema guardado</span>
                                    <strong>{topic.title}</strong>
                                    {topic.description ? <p>{topic.description}</p> : null}
                                  </div>
                                    <button className="campus-teacher__ghost-btn" onClick={() => onRemoveAcademicContentTopic(periodIndex, topicIndex)} type="button">Quitar</button>
                                </div>
                              ))}
                            </div>
                          </section>
                          );
                        })}
                      </div>
                    </article>
                  </div>
                ) : null}

                {isCourseManagementSection && showSelectedCourseWorkspace && !selectedCourse ? (
                  <p className="campus-panel__meta">Selecciona un curso para continuar.</p>
                ) : null}
              </div>
            ) : null}

            {isAttendanceLikeSection ? (
              <article className="campus-teacher__attendance-panel campus-teacher__embedded-panel">
                <div className="campus-teacher__section-head">
                  <div>
                    <span className="campus-panel__kicker">{activeTeacherSection === 'guidance_routine' ? 'Guidance Routine' : 'Asistencia a clase'}</span>
                    <h3>{activeTeacherSection === 'guidance_routine' ? 'Planilla de llegada a la jornada' : 'Registro de asistencia por materia'}</h3>
                    <p className="campus-panel__meta">
                      {activeTeacherSection === 'guidance_routine'
                        ? 'Marca si el alumno llegó a tiempo al colegio, llegó tarde, faltó o presentó excusa en la jornada.'
                        : 'Marca si el alumno entró a tiempo, llegó tarde o no ingresó a tu clase en esta asignatura.'}
                    </p>
                  </div>
                  <button
                    className="campus-teacher__ghost-btn"
                    disabled={teacherAttendanceQuery.isFetching || !teacherAttendanceCourseId}
                    onClick={() => teacherAttendanceQuery.refetch()}
                    type="button"
                  >
                    Actualizar
                  </button>
                </div>

                <form className="campus-teacher__attendance-form" onSubmit={onSubmitTeacherAttendance}>
                  <div className="campus-teacher__attendance-controls">
                    {teacherAttendanceType === 'subject_class' ? (
                      <>
                        <label>
                          Asignatura
                          <select value={teacherAttendanceSubjectKey} onChange={(event) => onTeacherAttendanceSubjectChange(event.target.value)}>
                            <option value="">Seleccionar asignatura</option>
                            {attendanceSubjectGroups.map((subject) => (
                              <option key={subject.key} value={subject.key}>{subject.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Curso
                          <select value={teacherAttendanceCourseId} onChange={(event) => setTeacherAttendanceCourseId(event.target.value)} disabled={!teacherAttendanceCoursesForSubject.length}>
                            <option value="">{teacherAttendanceCoursesForSubject.length ? 'Seleccionar curso' : 'Sin cursos'}</option>
                            {teacherAttendanceCoursesForSubject.map((course) => (
                              <option key={course.id} value={course.id}>{getCourseGroupLabel(course)}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : (
                      <label>
                        Curso
                        <select value={teacherAttendanceCourseId} onChange={(event) => setTeacherAttendanceCourseId(event.target.value)}>
                          <option value="">Seleccionar curso</option>
                          {attendanceCourses.map((course) => <option key={course.id} value={course.id}>{getCourseOptionLabel(course)}</option>)}
                        </select>
                      </label>
                    )}
                    <label>
                      Fecha
                      <input type="date" value={teacherAttendanceDate} onChange={(event) => setTeacherAttendanceDate(event.target.value)} />
                    </label>
                    {teacherAttendanceType === 'subject_class' ? (
                      <label>
                        Hora
                        <select value={teacherAttendanceClassSessionKey} onChange={(event) => setTeacherAttendanceClassSessionKey(event.target.value)}>
                          <option value="">Sin hora específica</option>
                          {teacherAttendanceClassSessions.map((session) => (
                            <option key={buildSessionKey(session)} value={buildSessionKey(session)}>
                              {weekdayShortLabels[Number(session.weekday)] || 'Dia'} · {session.startTime}-{session.endTime}{session.label ? ` · ${session.label}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>

                  <div className="campus-teacher__attendance-summary">
                    <div><strong>{teacherAttendanceSummary.total}</strong><span>Alumnos</span></div>
                    <div><strong>{teacherAttendanceSummary.present}</strong><span>Presentes</span></div>
                    <div><strong>{teacherAttendanceSummary.late}</strong><span>Tarde</span></div>
                    <div><strong>{teacherAttendanceSummary.absent}</strong><span>Ausentes</span></div>
                    <div><strong>{teacherAttendanceSummary.excused}</strong><span>Excusados</span></div>
                  </div>

                  <div className="campus-teacher__attendance-actions">
                    {teacherAttendanceStatusOptions.map((option) => (
                      <button className="campus-teacher__ghost-btn" disabled={teacherAttendanceLocked} key={option.value} onClick={() => onMarkAllTeacherAttendance(option.value)} type="button">
                        Marcar {option.label.toLowerCase()}
                      </button>
                    ))}
                  </div>

                  {teacherAttendanceQuery.isLoading ? <p className="campus-panel__meta">Cargando planilla...</p> : null}
                  {!teacherAttendanceQuery.isLoading && teacherAttendanceRecords.length === 0 ? (
                    <p className="campus-panel__meta">
                      {attendanceCourses.length
                        ? (teacherAttendanceType === 'subject_class'
                          ? 'Selecciona asignatura y curso para cargar sus alumnos.'
                          : 'Selecciona un curso para cargar sus alumnos.')
                        : 'No tienes cursos asignados para esta planilla.'}
                    </p>
                  ) : null}

                  {teacherAttendanceRecords.length > 0 ? (
                    <div className="campus-teacher__attendance-roster">
                      {teacherAttendanceRecords.map((record) => (
                        <article className={`campus-teacher__attendance-row status-${record.status || 'present'}`} key={record.studentId}>
                          <div className="campus-teacher__attendance-student">
                            <strong>{record.studentName || record.name}</strong>
                            <span>{[record.schoolCode, selectedTeacherAttendanceCourse?.title].filter(Boolean).join(' · ')}</span>
                          </div>
                          <div className="campus-teacher__attendance-statuses">
                            {teacherAttendanceStatusOptions.map((option) => (
                              <label className={`campus-teacher__attendance-status${record.status === option.value ? ' is-selected' : ''}`} key={`${record.studentId}-${option.value}`}>
                                <input
                                  checked={(record.status || 'present') === option.value}
                                  disabled={teacherAttendanceLocked}
                                  name={`attendance-${record.studentId}`}
                                  onChange={() => onTeacherAttendanceRecordChange(record.studentId, 'status', option.value)}
                                  type="radio"
                                  value={option.value}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                          <input
                            className="campus-teacher__attendance-note"
                            disabled={teacherAttendanceLocked}
                            placeholder="Nota opcional"
                            value={record.notes || ''}
                            onChange={(event) => onTeacherAttendanceRecordChange(record.studentId, 'notes', event.target.value)}
                          />
                        </article>
                      ))}
                    </div>
                  ) : null}

                  <div className="campus-teacher__card-actions">
                    <span className="campus-panel__meta">
                      {selectedTeacherAttendanceCourse
                        ? [
                          teacherAttendanceType === 'subject_class'
                            ? [selectedAttendanceSubject?.label, getCourseGroupLabel(selectedTeacherAttendanceCourse)].filter(Boolean).join(' · ')
                            : getCourseOptionLabel(selectedTeacherAttendanceCourse),
                          teacherAttendanceDate || 'Sin fecha',
                        ].filter(Boolean).join(' · ')
                        : (teacherAttendanceType === 'subject_class' ? 'Selecciona asignatura, curso y fecha.' : 'Selecciona curso y fecha.')}
                    </span>
                    {teacherAttendanceLocked ? (
                      <button className="campus-teacher__ghost-btn" onClick={() => setTeacherAttendanceLocked(false)} type="button">
                        Editar asistencia
                      </button>
                    ) : (
                      <button className="campus-teacher__action-btn" disabled={isBusy || teacherAttendanceRecords.length === 0} type="submit">
                        {saveTeacherAttendanceMutation.isPending ? 'Guardando...' : 'Guardar asistencia'}
                      </button>
                    )}
                  </div>
                </form>
              </article>
            ) : null}

            {activeTeacherSection === 'school_coexistence' ? (
              <article className="campus-teacher__resource-panel campus-teacher__embedded-panel">
                <div className="campus-teacher__section-head">
                  <div>
                    <span className="campus-panel__kicker">Convivencia escolar</span>
                    <h3>Observación de comportamiento</h3>
                    <p className="campus-panel__meta">El reporte queda disponible para Coordinación, Dirección, Psicología y Rectoría.</p>
                  </div>
                  <button
                    className="campus-teacher__ghost-btn"
                    disabled={teacherDisciplineObservationsQuery.isFetching}
                    onClick={() => teacherDisciplineObservationsQuery.refetch()}
                    type="button"
                  >
                    Actualizar
                  </button>
                </div>

                <form className="campus-teacher__resource-form" onSubmit={onSubmitTeacherDisciplineObservation}>
                  <label>
                    Curso o asignatura
                    <select
                      value={teacherDisciplineDraft.courseId}
                      onChange={(event) => onTeacherDisciplineDraftChange('courseId', event.target.value)}
                    >
                      <option value="">Seleccionar curso</option>
                      {courses.map((course) => <option key={course.id} value={course.id}>{getCourseOptionLabel(course)}</option>)}
                    </select>
                  </label>
                  <label>
                    Alumno
                    <select
                      disabled={!teacherDisciplineDraft.courseId || teacherDisciplineCourseDetailQuery.isFetching}
                      value={teacherDisciplineDraft.studentId}
                      onChange={(event) => onTeacherDisciplineDraftChange('studentId', event.target.value)}
                    >
                      <option value="">Seleccionar alumno</option>
                      {disciplineStudentOptions.map((student) => (
                        <option key={student.studentId} value={student.studentId}>{student.name}{student.schoolCode ? ` · ${student.schoolCode}` : ''}</option>
                      ))}
                    </select>
                  </label>
                  <label className="campus-teacher__resource-field-wide">
                    Observación
                    <textarea
                      placeholder="Describe de forma objetiva la situación, el contexto de clase y cualquier acción inmediata realizada."
                      rows={5}
                      value={teacherDisciplineDraft.observation}
                      onChange={(event) => onTeacherDisciplineDraftChange('observation', event.target.value)}
                    />
                  </label>

                  <div className="campus-teacher__card-actions">
                    <span className="campus-panel__meta">
                      {[selectedDisciplineStudent?.name, selectedDisciplineCourse?.subject || selectedDisciplineCourse?.title].filter(Boolean).join(' · ') || 'Selecciona alumno y curso para continuar.'}
                    </span>
                    <button className="campus-teacher__action-btn" disabled={isBusy || !teacherDisciplineDraft.courseId || !teacherDisciplineDraft.studentId} type="submit">
                      {createTeacherDisciplineObservationMutation.isPending ? 'Enviando...' : 'Enviar observación'}
                    </button>
                  </div>
                </form>

                <div className="campus-teacher__resource-history">
                  <div className="campus-teacher__section-head">
                    <div>
                      <span className="campus-panel__kicker">Trazabilidad</span>
                      <h3>Observaciones enviadas</h3>
                    </div>
                  </div>
                  {teacherDisciplineCourseDetailQuery.isFetching ? <p className="campus-panel__meta">Cargando alumnos del curso...</p> : null}
                  {teacherDisciplineObservationsQuery.isLoading ? <p className="campus-panel__meta">Cargando historial...</p> : null}
                  {teacherDisciplineObservations.length === 0 && !teacherDisciplineObservationsQuery.isLoading ? <p className="campus-panel__meta">Todavía no tienes observaciones registradas.</p> : null}
                  {teacherDisciplineObservations.map((item) => (
                    <article className={`campus-teacher__resource-request status-${item.status}`} key={item.id}>
                      <div>
                        <span className="campus-teacher__status-pill is-active">{teacherDisciplineStatusLabels[item.status] || item.status}</span>
                        <h4>{item.studentName}</h4>
                        <p>{item.observation}</p>
                      </div>
                      <div className="campus-teacher__resource-request-meta">
                        <span>{formatDateLabel(item.submittedAt)}</span>
                        {item.courseTitle ? <span>{item.courseTitle}</span> : null}
                        {item.studentGrade ? <span>{item.studentGrade}</span> : null}
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            ) : null}

            {activeTeacherSection === 'social_publications' ? (
              <article className="campus-teacher__resource-panel campus-teacher__social-panel campus-teacher__embedded-panel">
                <div className="campus-teacher__section-head">
                  <div>
                    <span className="campus-panel__kicker">Publicaciones</span>
                    <h3>Enviar al feed de padres</h3>
                    <p className="campus-panel__meta">Secretaría Académica revisa y autoriza antes de publicar en la app de acudientes.</p>
                  </div>
                  <button
                    className="campus-teacher__ghost-btn"
                    disabled={teacherSocialPublicationRequestsQuery.isFetching}
                    onClick={() => teacherSocialPublicationRequestsQuery.refetch()}
                    type="button"
                  >
                    Actualizar
                  </button>
                </div>

                <form className="campus-teacher__resource-form campus-teacher__social-form" onSubmit={onSubmitTeacherSocialPublication}>
                  <label>
                    Curso o grupo
                    <select
                      value={teacherSocialPublicationDraft.courseId}
                      onChange={(event) => onTeacherSocialPublicationDraftChange('courseId', event.target.value)}
                    >
                      <option value="">Seleccionar grupo</option>
                      {courses.map((course) => <option key={course.id} value={course.id}>{getCourseOptionLabel(course)}</option>)}
                    </select>
                  </label>
                  <label>
                    Título
                    <input
                      placeholder="Ej. Proyecto de ciencias terminado"
                      value={teacherSocialPublicationDraft.title}
                      onChange={(event) => onTeacherSocialPublicationDraftChange('title', event.target.value)}
                    />
                  </label>
                  <label className="campus-teacher__resource-field-wide">
                    Descripción
                    <textarea
                      placeholder="Cuenta qué hicieron los estudiantes y por qué es importante compartirlo con las familias."
                      rows={4}
                      value={teacherSocialPublicationDraft.body}
                      onChange={(event) => onTeacherSocialPublicationDraftChange('body', event.target.value)}
                    />
                  </label>

                  <div className="campus-teacher__social-upload campus-teacher__resource-field-wide">
                    <label>
                      Fotos o videos
                      <input
                        accept="image/*,video/*"
                        disabled={teacherSocialMediaUploading || (teacherSocialPublicationDraft.media || []).length >= 8}
                        multiple
                        onChange={onTeacherSocialMediaSelected}
                        type="file"
                      />
                    </label>
                    <span className="campus-panel__meta">Hasta 8 archivos por publicación.</span>
                  </div>

                  <div className="campus-teacher__social-media-grid campus-teacher__resource-field-wide">
                    {(teacherSocialPublicationDraft.media || []).length === 0 ? <p className="campus-panel__meta">Puedes enviar solo texto o adjuntar evidencia visual del trabajo en clase.</p> : null}
                    {(teacherSocialPublicationDraft.media || []).map((item, index) => (
                      <article className="campus-teacher__social-media-card" key={`${item.kind}-${item.src}-${index}`}>
                        <div className="campus-teacher__social-media-preview">
                          {item.kind === 'video'
                            ? <video controls src={item.src} />
                            : <img alt={item.alt || `Adjunto ${index + 1}`} src={item.thumbUrl || item.src} />}
                        </div>
                        <button className="campus-teacher__ghost-btn" onClick={() => onRemoveTeacherSocialMedia(index)} type="button">Quitar</button>
                      </article>
                    ))}
                  </div>

                  <div className="campus-teacher__card-actions">
                    <span className="campus-panel__meta">Al aprobarse, aparecerá automáticamente en la red social de los padres.</span>
                    <button className="campus-teacher__action-btn" disabled={isBusy || !teacherSocialPublicationDraft.courseId} type="submit">
                      {createTeacherSocialPublicationMutation.isPending ? 'Enviando...' : 'Enviar a revisión'}
                    </button>
                  </div>
                </form>

                <div className="campus-teacher__resource-history">
                  <div className="campus-teacher__section-head">
                    <div>
                      <span className="campus-panel__kicker">Historial</span>
                      <h3>Mis publicaciones</h3>
                    </div>
                  </div>
                  {teacherSocialPublicationRequestsQuery.isLoading ? <p className="campus-panel__meta">Cargando publicaciones...</p> : null}
                  {teacherSocialPublicationRequests.length === 0 && !teacherSocialPublicationRequestsQuery.isLoading ? <p className="campus-panel__meta">Todavía no tienes publicaciones enviadas a revisión.</p> : null}
                  {teacherSocialPublicationRequests.map((request) => (
                    <article className={`campus-teacher__resource-request status-${request.status}`} key={request._id}>
                      <div>
                        <span className="campus-teacher__status-pill is-active">{teacherSocialPublicationStatusLabels[request.status] || request.status}</span>
                        <h4>{request.title}</h4>
                        <p>{request.body}</p>
                      </div>
                      {(request.media || []).length ? (
                        <div className="campus-teacher__history-media-grid">
                          {(request.media || []).map((item, index) => {
                            const mediaItem = normalizeTeacherPublicationHistoryMedia(item, index);
                            if (!mediaItem.src) {
                              return null;
                            }

                            return (
                              <div className="campus-teacher__history-media-card" key={`${request._id}-${mediaItem.id}-${index}`}>
                                <div className="campus-teacher__history-media-preview">
                                  {mediaItem.kind === 'video'
                                    ? <video controls preload="metadata" src={mediaItem.src} />
                                    : <img alt={mediaItem.alt} loading="lazy" src={mediaItem.thumbUrl || mediaItem.src} />}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      <div className="campus-teacher__resource-request-meta">
                        <span>{formatDateLabel(request.submittedAt)}</span>
                        {request.courseTitle ? <span>{request.courseTitle}</span> : null}
                        {(request.media || []).length ? <span>{request.media.length} adjunto(s)</span> : <span>Solo texto</span>}
                      </div>
                      {request.reviewNotes ? <p className="campus-teacher__resource-request-purpose">Secretaría: {request.reviewNotes}</p> : null}
                    </article>
                  ))}
                </div>
              </article>
            ) : null}

            {activeTeacherSection === 'resource_requests' ? (
              <article className="campus-teacher__resource-panel campus-teacher__embedded-panel">
                <div className="campus-teacher__section-head">
                  <div>
                    <span className="campus-panel__kicker">Solicitud de recursos</span>
                    <h3>Planner docente y requerimientos</h3>
                  </div>
                  <button
                    className="campus-teacher__ghost-btn"
                    disabled={teacherResourceRequestsQuery.isFetching}
                    onClick={() => teacherResourceRequestsQuery.refetch()}
                    type="button"
                  >
                    Actualizar
                  </button>
                </div>

                <form className="campus-teacher__resource-form" onSubmit={onSubmitTeacherResourceRequest}>
                  <label className="campus-teacher__resource-field-wide">
                    Planner definido por coordinacion
                    <select
                      value={teacherResourceRequestDraft.plannerCycleId}
                      onChange={(event) => onTeacherResourceDraftChange('plannerCycleId', event.target.value)}
                    >
                      <option value="">Seleccionar planner activo</option>
                      {teacherPlannerCycles.map((cycle) => (
                        <option key={cycle.id} value={cycle.id}>{cycle.title} · limite {formatDateLabel(cycle.submissionDeadline)}</option>
                      ))}
                    </select>
                  </label>
                  {selectedTeacherPlannerCycle ? (
                    <p className="campus-panel__meta campus-teacher__resource-field-wide">
                      Periodo: {formatDateLabel(selectedTeacherPlannerCycle.startDate)} - {formatDateLabel(selectedTeacherPlannerCycle.endDate)}. {selectedTeacherPlannerCycle.instructions || ''}
                    </p>
                  ) : null}
                  <label>
                    Área o curso
                    <input
                      placeholder="Ej. 4A, laboratorio, artística primaria"
                      value={teacherResourceRequestDraft.requestedForArea}
                      onChange={(event) => onTeacherResourceDraftChange('requestedForArea', event.target.value)}
                    />
                  </label>
                  <label>
                    Prioridad
                    <select
                      value={teacherResourceRequestDraft.priority}
                      onChange={(event) => onTeacherResourceDraftChange('priority', event.target.value)}
                    >
                      {teacherResourcePriorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Fecha de entrega requerida
                    <input
                      type="date"
                      value={teacherResourceRequestDraft.neededByDate}
                      onChange={(event) => onTeacherResourceDraftChange('neededByDate', event.target.value)}
                    />
                  </label>
                  <label className="campus-teacher__resource-field-wide">
                    Motivo pedagógico
                    <textarea
                      placeholder="Actividad, proyecto o necesidad del aula"
                      rows={3}
                      value={teacherResourceRequestDraft.purpose}
                      onChange={(event) => onTeacherResourceDraftChange('purpose', event.target.value)}
                    />
                  </label>

                  <div className="campus-teacher__resource-picker campus-teacher__resource-field-wide">
                    <label>
                      Dia de actividad
                      <input
                        type="date"
                        value={teacherResourceRequestDraft.activityDate}
                        onChange={(event) => onTeacherResourceDraftChange('activityDate', event.target.value)}
                      />
                    </label>
                    <label>
                      Actividad
                      <input
                        placeholder="Ej. Collage de ecosistemas"
                        value={teacherResourceRequestDraft.activityTitle}
                        onChange={(event) => onTeacherResourceDraftChange('activityTitle', event.target.value)}
                      />
                    </label>
                    <label>
                      Detalle
                      <input
                        placeholder="Grupo, producto esperado o indicaciones"
                        value={teacherResourceRequestDraft.activityDescription}
                        onChange={(event) => onTeacherResourceDraftChange('activityDescription', event.target.value)}
                      />
                    </label>
                    <button className="campus-teacher__action-btn" onClick={onAddTeacherResourceActivity} type="button">
                      Agregar actividad
                    </button>
                  </div>

                  <div className="campus-teacher__resource-selected-list campus-teacher__resource-field-wide">
                    {teacherResourcePlannerActivities.length === 0 ? <p className="campus-panel__meta">Agrega las actividades por dia antes de enviar el planner.</p> : null}
                    {teacherResourcePlannerActivities.map((activity) => (
                      <button
                        className="campus-teacher__resource-chip"
                        key={activity.key}
                        onClick={() => setTeacherResourcePlannerActivities((currentActivities) => currentActivities.filter((currentActivity) => currentActivity.key !== activity.key))}
                        type="button"
                      >
                        <strong>{activity.title}</strong>
                        <span>{formatDateLabel(activity.date)}</span>
                      </button>
                    ))}
                  </div>

                  <div className="campus-teacher__resource-picker">
                    <label>
                      Material
                      <select
                        value={teacherResourceRequestDraft.itemId}
                        onChange={(event) => onTeacherResourceDraftChange('itemId', event.target.value)}
                      >
                        <option value="">Seleccionar material</option>
                        {teacherResourceItems.map((item) => (
                          <option key={item.id} value={item.id}>{item.name} · {item.stock} {item.unit}</option>
                        ))}
                        <option value="__other__">Otro</option>
                      </select>
                    </label>
                    {isTeacherResourceCustomItem ? (
                      <label>
                        Nombre del material
                        <input
                          placeholder="Ej. Foamy azul escarchado"
                          value={teacherResourceRequestDraft.customName}
                          onChange={(event) => onTeacherResourceDraftChange('customName', event.target.value)}
                        />
                      </label>
                    ) : null}
                    <label>
                      Cantidad
                      <input
                        min="1"
                        type="number"
                        value={teacherResourceRequestDraft.quantity}
                        onChange={(event) => onTeacherResourceDraftChange('quantity', event.target.value)}
                      />
                    </label>
                    <button className="campus-teacher__action-btn" disabled={!teacherResourceRequestDraft.itemId || (isTeacherResourceCustomItem && !String(teacherResourceRequestDraft.customName || '').trim())} onClick={onAddTeacherResourceItem} type="button">
                      Agregar
                    </button>
                  </div>

                  <div className="campus-teacher__resource-selected-list">
                    {teacherResourceRequestItems.length === 0 ? <p className="campus-panel__meta">Agrega los materiales que necesitas para enviar la solicitud.</p> : null}
                    {teacherResourceRequestItems.map((item) => (
                      <button
                        className="campus-teacher__resource-chip"
                        key={item.key}
                        onClick={() => setTeacherResourceRequestItems((currentItems) => currentItems.filter((currentItem) => currentItem.key !== item.key))}
                        type="button"
                      >
                        <strong>{item.name}</strong>
                        <span>x{item.quantity} {item.unit}</span>
                      </button>
                    ))}
                  </div>

                  <div className="campus-teacher__card-actions">
                    <span className="campus-panel__meta">El inventario se descuenta cuando compras acepta el consolidado.</span>
                    <button className="campus-teacher__action-btn" disabled={isBusy || teacherResourceRequestItems.length === 0 || teacherResourcePlannerActivities.length === 0 || !teacherResourceRequestDraft.plannerCycleId} type="submit">
                      {createTeacherResourceRequestMutation.isPending ? 'Enviando...' : 'Enviar a coordinacion'}
                    </button>
                  </div>
                </form>

                <div className="campus-teacher__resource-history">
                  <div className="campus-teacher__section-head">
                    <div>
                      <span className="campus-panel__kicker">Trazabilidad</span>
                      <h3>Mis solicitudes</h3>
                    </div>
                  </div>
                  {teacherResourceItemsQuery.isLoading || teacherResourceRequestsQuery.isLoading ? <p className="campus-panel__meta">Cargando materiales...</p> : null}
                  {teacherResourceRequests.length === 0 && !teacherResourceRequestsQuery.isLoading ? <p className="campus-panel__meta">Todavía no tienes solicitudes registradas.</p> : null}
                  {teacherResourceRequests.map((request) => (
                    <article className={`campus-teacher__resource-request status-${request.status}`} key={request.id}>
                      <div>
                        <span className="campus-teacher__status-pill is-active">{teacherResourceStatusLabels[request.status] || request.status}</span>
                        <h4>{request.requestedForArea || 'Solicitud de materiales'}</h4>
                        {request.plannerCycle ? <small>{request.plannerCycle.title}</small> : null}
                        <p>{(request.items || []).map((entry) => `${entry.item?.name || entry.customName || 'Material'} x${entry.quantity}`).join(' · ')}</p>
                      </div>
                      <div className="campus-teacher__resource-request-meta">
                        <span>{formatDateLabel(request.createdAt)}</span>
                        {request.neededByDate ? <span>Necesario: {formatDateLabel(request.neededByDate)}</span> : null}
                        {request.approvedBy ? <span>Aprobó: {request.approvedBy.name}</span> : null}
                        {request.deliveredBy ? <span>Entregó: {request.deliveredBy.name}</span> : null}
                      </div>
                      {request.purpose ? <p className="campus-teacher__resource-request-purpose">{request.purpose}</p> : null}
                    </article>
                  ))}
                </div>
              </article>
            ) : null}

            {activeTeacherSection === 'dashboard' ? (
              <article className="campus-teacher__integral-panel campus-teacher__embedded-panel">
                <div className={`campus-teacher__integral-kpi-grid${isOverviewMetricsLoading ? ' is-loading' : ''}`}>
                  {isOverviewMetricsLoading ? Array.from({ length: 6 }, (_, index) => (
                    <article className="campus-teacher__integral-kpi-card campus-teacher__integral-kpi-card--skeleton" key={`teacher-kpi-skeleton-${index}`} aria-hidden="true">
                      <div className="campus-teacher__integral-kpi-skeleton-icon" />
                      <div className="campus-teacher__integral-kpi-skeleton-copy">
                        <span />
                        <strong />
                        <p />
                      </div>
                    </article>
                  )) : (
                    <>
                  <article className="campus-teacher__integral-kpi-card tone-neutral">
                    <div aria-hidden="true" className="campus-teacher__integral-kpi-icon tone-neutral">
                      <TeacherDashboardKpiIcon kind="students" />
                    </div>
                    <div className="campus-teacher__integral-kpi-copy">
                      <span className="campus-teacher__integral-kpi-label">Alumnos</span>
                      <strong>{integralOverview.totalStudents}</strong>
                      <p>Total en tus cursos activos.</p>
                    </div>
                  </article>

                  <article className={`campus-teacher__integral-kpi-card${integralOverview.averageTrendDelta !== null && integralOverview.averageTrendDelta < 0 ? ' tone-danger' : ' tone-good'}`}>
                    <div aria-hidden="true" className={`campus-teacher__integral-kpi-icon${integralOverview.averageTrendDelta !== null && integralOverview.averageTrendDelta < 0 ? ' tone-danger' : ' tone-good'}`}>
                      <TeacherDashboardKpiIcon kind="average" />
                    </div>
                    <div className="campus-teacher__integral-kpi-copy">
                      <span className="campus-teacher__integral-kpi-label">Promedio general</span>
                      <strong>{integralOverview.averageScore === null ? 'Sin notas' : integralOverview.averageScore}</strong>
                      <p>
                        {integralOverview.averageTrendDelta === null
                          ? 'Aún no hay tendencia entre periodos.'
                          : `${integralOverview.averageTrendDelta >= 0 ? 'Subió' : 'Bajó'} ${Math.abs(integralOverview.averageTrendDelta)} pts vs. el primer periodo.`}
                      </p>
                    </div>
                  </article>

                  <button
                    className={`campus-teacher__integral-kpi-card campus-teacher__integral-kpi-card--button${integralOverview.atRiskCount > 0 ? ' tone-danger' : ' tone-good'}`}
                    onClick={() => setActiveIntegralModal('risk')}
                    type="button"
                  >
                    <div aria-hidden="true" className={`campus-teacher__integral-kpi-icon${integralOverview.atRiskCount > 0 ? ' tone-danger' : ' tone-good'}`}>
                      <TeacherDashboardKpiIcon kind="risk" />
                    </div>
                    <div className="campus-teacher__integral-kpi-copy">
                      <span className="campus-teacher__integral-kpi-label">En riesgo</span>
                      <strong>{integralOverview.atRiskCount}</strong>
                      <p>{integralOverview.lowPerformanceRate === null ? 'Sin calificaciones registradas aún.' : `${integralOverview.lowPerformanceRate}% con bajo rendimiento.`}</p>
                    </div>
                  </button>

                  <button
                    className={`campus-teacher__integral-kpi-card campus-teacher__integral-kpi-card--button${integralOverview.pendingGradingCount > 0 ? ' tone-warn' : ' tone-good'}`}
                    onClick={() => setActiveIntegralModal('pending')}
                    type="button"
                  >
                    <div aria-hidden="true" className={`campus-teacher__integral-kpi-icon${integralOverview.pendingGradingCount > 0 ? ' tone-warn' : ' tone-good'}`}>
                      <TeacherDashboardKpiIcon kind="pending" />
                    </div>
                    <div className="campus-teacher__integral-kpi-copy">
                      <span className="campus-teacher__integral-kpi-label">Por calificar</span>
                      <strong>{integralOverview.pendingGradingCount}</strong>
                      <p>{integralOverview.pendingGradingCount > 0 ? 'Actividades esperando tu revisión.' : 'Todo al día en tus cursos.'}</p>
                    </div>
                  </button>

                  <button
                    className={`campus-teacher__integral-kpi-card campus-teacher__integral-kpi-card--button${integralOverview.tomorrowActivitiesCount > 0 ? ' tone-warn' : ' tone-neutral'}`}
                    onClick={() => setActiveIntegralModal('tomorrow')}
                    type="button"
                  >
                    <div aria-hidden="true" className={`campus-teacher__integral-kpi-icon${integralOverview.tomorrowActivitiesCount > 0 ? ' tone-warn' : ' tone-neutral'}`}>
                      <TeacherDashboardKpiIcon kind="tomorrow" />
                    </div>
                    <div className="campus-teacher__integral-kpi-copy">
                      <span className="campus-teacher__integral-kpi-label">Para mañana</span>
                      <strong>{integralOverview.tomorrowActivitiesCount}</strong>
                      <p>{integralOverview.tomorrowActivitiesCount > 0 ? integralOverview.tomorrowLabel : 'Nada programado por ahora.'}</p>
                    </div>
                  </button>

                  <article className={`campus-teacher__integral-kpi-card tone-${integralOverview.healthTone}`}>
                    <div aria-hidden="true" className={`campus-teacher__integral-kpi-icon tone-${integralOverview.healthTone}`}>
                      <TeacherDashboardKpiIcon kind="health" />
                    </div>
                    <div className="campus-teacher__integral-kpi-copy">
                      <span className="campus-teacher__integral-kpi-label">Estado general</span>
                      <strong>{integralOverview.healthStatus}</strong>
                      <p>{integralOverview.healthScore === null ? 'Aparecerá cuando registres las primeras notas.' : `Índice ${integralOverview.healthScore} según notas, riesgo y cobertura.`}</p>
                    </div>
                  </article>
                    </>
                  )}
                </div>

                {isOverviewMetricsLoading ? (
                  <p className="campus-teacher__metrics-loading-note">Calculando indicadores académicos en segundo plano...</p>
                ) : null}

                <article className="campus-teacher__integral-card campus-teacher__panel-surface campus-teacher__dashboard-calendar">
                  <div className="campus-teacher__section-head">
                    <div>
                      <span className="campus-panel__kicker">Calendario de actividades</span>
                      <h3>Tus asignaciones en todos los cursos</h3>
                    </div>
                    <div className="campus-teacher__activity-timeline-nav">
                      <button className="campus-teacher__ghost-btn" onClick={() => setDashboardCalendarMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} type="button">
                        Mes anterior
                      </button>
                      <button className="campus-teacher__ghost-btn" onClick={() => setDashboardCalendarMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} type="button">
                        Mes siguiente
                      </button>
                    </div>
                  </div>
                  <p className="campus-panel__meta">Revisa en un solo lugar las tareas, quices, proyectos y demás actividades evaluativas que publicaste en todos tus cursos.</p>
                  {!previewEnabled && teacherDashboardCalendarQuery.isLoading ? <p className="campus-panel__meta">Cargando calendario...</p> : null}
                  {!previewEnabled && teacherDashboardCalendarQuery.isError ? <p className="campus-panel__meta">No se pudo cargar el calendario de actividades.</p> : null}
                  <div className="campus-teacher__activity-calendar-shell">
                    <div className="campus-teacher__activity-calendar-header">
                      <p>Calendario mensual</p>
                      <strong>{formatMonthLabel(dashboardCalendarMonth)}</strong>
                    </div>
                    <div className="campus-teacher__activity-calendar-grid" role="list" aria-label={`Calendario de actividades del docente para ${formatMonthLabel(dashboardCalendarMonth)}`}>
                      {weekdayShortLabels.map((label) => (
                        <div className="campus-teacher__activity-calendar-weekday" key={`dashboard-calendar-weekday-${label}`} role="listitem" aria-hidden="true">
                          {label}
                        </div>
                      ))}
                      {dashboardCalendarGrid.map((cell) => (
                        cell.empty ? (
                          <div className="campus-teacher__activity-calendar-empty" key={cell.key} aria-hidden="true" />
                        ) : (
                          <button
                            className={`campus-teacher__activity-calendar-day${cell.isToday ? ' is-today' : ''}${cell.hasActivity ? ' has-activity' : ''}`}
                            key={cell.key}
                            onClick={() => setSelectedDashboardCalendarDate(cell.dateValue)}
                            role="listitem"
                            title={cell.title || undefined}
                            type="button"
                          >
                            <div className="day-number-row">
                              <span className="day-number">{cell.dayNumber}</span>
                              {cell.itemCount > 0 ? <span className="day-count">({cell.itemCount})</span> : null}
                            </div>
                            {cell.primaryChip ? <span className="day-chip primary" title={cell.primaryChip.title}>{cell.primaryChip.label}</span> : null}
                            {cell.secondaryChip ? <span className="day-chip secondary" title={cell.secondaryChip.title}>{cell.secondaryChip.label}</span> : null}
                            {!cell.primaryChip && !cell.secondaryChip ? <span className="day-chip empty">Sin act.</span> : null}
                          </button>
                        )
                      ))}
                    </div>
                  </div>
                  <div className="campus-teacher__dashboard-calendar-upcoming">
                    <header className="campus-teacher__integral-card-head">
                      <span className="campus-teacher__integral-card-label">Próximas actividades</span>
                      <h3>Lo que viene este mes</h3>
                      <p className="campus-teacher__integral-card-lead">Tareas, quices y evaluaciones programadas en tus cursos.</p>
                    </header>
                    <div className="campus-teacher__integral-activity-list">
                      {upcomingDashboardActivities.length > 0 ? upcomingDashboardActivities.map((item) => (
                        <article className="campus-teacher__integral-activity" key={item.id}>
                          <div className="campus-teacher__integral-activity-copy">
                            <span className="campus-teacher__integral-activity-type">{item.typeLabel}</span>
                            <strong>{item.title}</strong>
                            <p>{item.courseTitle}</p>
                          </div>
                          <div className="campus-teacher__integral-activity-meta">
                            <span>{item.dateLabel}</span>
                          </div>
                        </article>
                      )) : <p className="campus-teacher__integral-empty">No hay actividades evaluativas próximas en este mes.</p>}
                    </div>
                  </div>
                </article>

                {activeIntegralModal === 'risk' ? (
                  <div className="campus-teacher__timeline-modal-backdrop" onClick={() => setActiveIntegralModal('')} role="presentation">
                    <div
                      aria-label="Estudiantes en riesgo académico"
                      aria-modal="true"
                      className="campus-teacher__timeline-modal"
                      onClick={(event) => event.stopPropagation()}
                      role="dialog"
                    >
                      <div className="campus-teacher__timeline-modal-head">
                        <div>
                          <span className="campus-panel__kicker">En riesgo</span>
                          <h3>{integralOverview.atRiskCount} estudiantes requieren atención</h3>
                        </div>
                        <button className="campus-teacher__ghost-btn" onClick={() => setActiveIntegralModal('')} type="button">
                          Cerrar
                        </button>
                      </div>

                      <div className="campus-teacher__timeline-modal-body">
                        {integralOverview.atRiskStudents.length > 0 ? integralOverview.atRiskStudents.map((student) => (
                          <article className="campus-teacher__timeline-modal-item is-activity" key={`${student.studentId}-${student.courseTitle}`}>
                            <span className="campus-teacher__timeline-modal-item-kind">{student.grade} · {student.courseTitle}</span>
                            <strong>{student.name}</strong>
                            <span>
                              Definitiva {parseFiniteScore(student.finalScore)?.toFixed(2)}
                              {student.trendDelta === null ? ' · Sin tendencia suficiente' : ` · ${student.trendDelta >= 0 ? '↑' : '↓'} ${Math.abs(student.trendDelta)} vs. primer periodo`}
                            </span>
                            <p>Última actualización {student.updatedAtLabel}.</p>
                          </article>
                        )) : <p className="campus-panel__meta">No hay estudiantes marcados en riesgo académico en este momento.</p>}
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeIntegralModal === 'pending' ? (
                  <div className="campus-teacher__timeline-modal-backdrop" onClick={() => setActiveIntegralModal('')} role="presentation">
                    <div
                      aria-label="Actividades por calificar"
                      aria-modal="true"
                      className="campus-teacher__timeline-modal"
                      onClick={(event) => event.stopPropagation()}
                      role="dialog"
                    >
                      <div className="campus-teacher__timeline-modal-head">
                        <div>
                          <span className="campus-panel__kicker">Por calificar</span>
                          <h3>{integralOverview.pendingGradingCount} actividades activas</h3>
                        </div>
                        <button className="campus-teacher__ghost-btn" onClick={() => setActiveIntegralModal('')} type="button">
                          Cerrar
                        </button>
                      </div>

                      <div className="campus-teacher__timeline-modal-body">
                        {integralOverview.pendingGradingItems.length > 0 ? integralOverview.pendingGradingItems.map((item) => (
                          <button
                            className="campus-teacher__timeline-modal-item is-activity is-clickable"
                            key={item.id}
                            onClick={() => openGradebookForPendingItem(item)}
                            type="button"
                          >
                            <span className="campus-teacher__timeline-modal-item-kind">{item.typeLabel}</span>
                            <strong>{item.title}</strong>
                            <span>{item.courseTitle} · {item.deliveryLabel} · {item.dateLabel}</span>
                            <p>{item.description}</p>
                            <span className="campus-teacher__timeline-modal-item-action">Ir al libro de notas</span>
                          </button>
                        )) : <p className="campus-panel__meta">No tienes actividades evaluativas pendientes por calificar.</p>}
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeIntegralModal === 'tomorrow' ? (
                  <div className="campus-teacher__timeline-modal-backdrop" onClick={() => setActiveIntegralModal('')} role="presentation">
                    <div
                      aria-label={`Actividades de mañana ${integralOverview.tomorrowLabel}`}
                      aria-modal="true"
                      className="campus-teacher__timeline-modal"
                      onClick={(event) => event.stopPropagation()}
                      role="dialog"
                    >
                      <div className="campus-teacher__timeline-modal-head">
                        <div>
                          <span className="campus-panel__kicker">Actividades de mañana</span>
                          <h3>{integralOverview.tomorrowLabel}</h3>
                        </div>
                        <button className="campus-teacher__ghost-btn" onClick={() => setActiveIntegralModal('')} type="button">
                          Cerrar
                        </button>
                      </div>

                      <div className="campus-teacher__timeline-modal-body">
                        {integralOverview.tomorrowActivities.length > 0 ? integralOverview.tomorrowActivities.map((item) => (
                          <article className="campus-teacher__timeline-modal-item is-activity" key={item.id}>
                            <span className="campus-teacher__timeline-modal-item-kind">{item.typeLabel}</span>
                            <strong>{item.title}</strong>
                            <span>{item.courseTitle} · {item.deliveryLabel}</span>
                            <p>{item.description}</p>
                          </article>
                        )) : <p className="campus-panel__meta">No hay tareas, quiz, exposiciones u otras actividades evaluativas programadas para mañana.</p>}
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeTeacherSection === 'dashboard' && selectedDashboardCalendarDay ? (
                  <div className="campus-teacher__timeline-modal-backdrop" onClick={() => setSelectedDashboardCalendarDate('')} role="presentation">
                    <div
                      aria-label={`Actividades del ${selectedDashboardCalendarDay.formattedDate}`}
                      aria-modal="true"
                      className="campus-teacher__timeline-modal"
                      onClick={(event) => event.stopPropagation()}
                      role="dialog"
                    >
                      <div className="campus-teacher__timeline-modal-head">
                        <div>
                          <span className="campus-panel__kicker">Actividades del día</span>
                          <h3>{selectedDashboardCalendarDay.formattedDate}</h3>
                        </div>
                        <button className="campus-teacher__ghost-btn" onClick={() => setSelectedDashboardCalendarDate('')} type="button">
                          Cerrar
                        </button>
                      </div>

                      <div className="campus-teacher__timeline-modal-body">
                        {selectedDashboardCalendarDay.items.length > 0 ? selectedDashboardCalendarDay.items.map((item) => (
                          <article className={`campus-teacher__timeline-modal-item is-${item.kind}`} key={item.key}>
                            <span className="campus-teacher__timeline-modal-item-kind">{item.kind === 'class' ? 'Clase' : 'Actividad'}</span>
                            <strong>{item.label}</strong>
                            <span>{item.meta}</span>
                            <p>{item.description}</p>
                          </article>
                        )) : <p className="campus-panel__meta">No hay actividades programadas para este día.</p>}
                      </div>
                    </div>
                  </div>
                ) : null}

                {isOverviewMetricsLoading ? (
                  <div className="campus-teacher__integral-grid campus-teacher__integral-grid--loading">
                    {Array.from({ length: 4 }, (_, index) => (
                      <article className="campus-teacher__integral-card campus-teacher__integral-card--skeleton" key={`teacher-integral-skeleton-${index}`} aria-hidden="true">
                        <div className="campus-teacher__integral-skeleton-line is-wide" />
                        <div className="campus-teacher__integral-skeleton-line" />
                        <div className="campus-teacher__integral-skeleton-block" />
                      </article>
                    ))}
                  </div>
                ) : (
                <div className="campus-teacher__integral-grid">
                  <article className="campus-teacher__integral-card campus-teacher__integral-card--performance">
                    <header className="campus-teacher__integral-card-head">
                      <span className="campus-teacher__integral-card-label">Rendimiento académico</span>
                      <h3>Cómo van tus estudiantes</h3>
                      <p className="campus-teacher__integral-card-lead">Promedios y tendencias con base en las notas que ya registraste.</p>
                    </header>
                    <div className="campus-teacher__integral-stat-grid">
                      <div className="campus-teacher__integral-stat-tile">
                        <span className="campus-teacher__integral-stat-label">Promedio general</span>
                        <strong>{integralOverview.averageScore === null ? 'Sin notas' : integralOverview.averageScore}</strong>
                      </div>
                      <div className="campus-teacher__integral-stat-tile">
                        <span className="campus-teacher__integral-stat-label">Evolución del promedio</span>
                        <strong>{integralOverview.averageTrendDelta === null ? 'Sin tendencia' : `${integralOverview.averageTrendDelta >= 0 ? 'Subió' : 'Bajó'} ${Math.abs(integralOverview.averageTrendDelta)}`}</strong>
                      </div>
                      <div className="campus-teacher__integral-stat-tile">
                        <span className="campus-teacher__integral-stat-label">Estudiantes aprobando</span>
                        <strong>{integralOverview.approvedRate === null ? 'Sin datos' : `${integralOverview.approvedRate}%`}</strong>
                      </div>
                      <div className="campus-teacher__integral-stat-tile">
                        <span className="campus-teacher__integral-stat-label">Bajo rendimiento</span>
                        <strong>{integralOverview.lowPerformanceRate === null ? 'Sin datos' : `${integralOverview.lowPerformanceRate}%`}</strong>
                      </div>
                    </div>
                  </article>

                  <article className="campus-teacher__integral-card campus-teacher__integral-card--risk">
                    <header className="campus-teacher__integral-card-head">
                      <span className="campus-teacher__integral-card-label">Riesgo académico</span>
                      <h3>Estudiantes que necesitan apoyo</h3>
                      <p className="campus-teacher__integral-card-lead">Alertas que se actualizan automáticamente con cada calificación.</p>
                    </header>
                    <div className="campus-teacher__integral-alerts">
                      <article className="campus-teacher__integral-alert-chip tone-danger">
                        <strong>{integralOverview.atRiskCount}</strong>
                        <span>en riesgo académico</span>
                      </article>
                      <article className="campus-teacher__integral-alert-chip tone-warn">
                        <strong>{integralOverview.droppingStudentsCount}</strong>
                        <span>con tendencia a la baja</span>
                      </article>
                    </div>
                    <div className="campus-teacher__integral-insights">
                      {integralOverview.riskAlerts.length > 0 ? integralOverview.riskAlerts.map((alertText) => (
                        <div className="campus-teacher__integral-insight" key={alertText}>{alertText}</div>
                      )) : <p className="campus-teacher__integral-empty">Todo tranquilo por ahora. No hay alertas críticas activas.</p>}
                    </div>
                  </article>

                  <article className="campus-teacher__integral-card campus-teacher__integral-card--topics">
                    <header className="campus-teacher__integral-card-head">
                      <span className="campus-teacher__integral-card-label">Comprensión del curso</span>
                      <h3>Temas donde conviene reforzar</h3>
                      <p className="campus-teacher__integral-card-lead">Componentes con mayor dificultad según las calificaciones registradas.</p>
                    </header>
                    <div className="campus-teacher__integral-topics">
                      {integralOverview.weakestTopics.length > 0 ? integralOverview.weakestTopics.map((topic) => (
                        <article className="campus-teacher__integral-topic" key={topic.key}>
                          <div className="campus-teacher__integral-topic-copy">
                            <strong>{topic.label}</strong>
                            <p>{topic.failedRate}% de estudiantes con dificultad</p>
                          </div>
                          <div className="campus-teacher__integral-topic-metrics">
                            <span>Promedio {topic.averageScore}</span>
                            <span>Dominio {topic.masteryRate}%</span>
                          </div>
                        </article>
                      )) : <p className="campus-teacher__integral-empty">Todavía no hay suficientes calificaciones para detectar temas críticos.</p>}
                    </div>
                  </article>

                  <article className="campus-teacher__integral-card campus-teacher__integral-card--activity">
                    <header className="campus-teacher__integral-card-head">
                      <span className="campus-teacher__integral-card-label">Actividad reciente</span>
                      <h3>Lo último en tus cursos</h3>
                      <p className="campus-teacher__integral-card-lead">Publicaciones y evaluaciones más recientes en el aula.</p>
                    </header>
                    <div className="campus-teacher__integral-activity-list">
                      {integralOverview.recentActivity.length > 0 ? integralOverview.recentActivity.map((item) => (
                        <article className="campus-teacher__integral-activity" key={item.id}>
                          <div className="campus-teacher__integral-activity-copy">
                            <span className="campus-teacher__integral-activity-type">{item.typeLabel}</span>
                            <strong>{item.title}</strong>
                            <p>{item.courseTitle}</p>
                          </div>
                          <div className="campus-teacher__integral-activity-meta">
                            <span>{item.dateLabel}</span>
                          </div>
                        </article>
                      )) : <p className="campus-teacher__integral-empty">Todavía no hay eventos recientes para mostrar.</p>}
                    </div>
                  </article>
                </div>
                )}
              </article>
            ) : null}

            {activeTeacherSection === 'schedule' ? (
              <article className="campus-teacher__schedule-panel campus-teacher__panel-surface campus-teacher__embedded-panel">
                <div className="campus-teacher__course-detail-card campus-teacher__course-detail-card--portal">
                  <div className="campus-teacher__course-top">
                    <div>
                      <h4>Horario semanal designado</h4>
                      <p>Rectoría define estos bloques según tus asignaturas y cursos asignados.</p>
                    </div>
                    <span className="campus-teacher__mode-pill">{teacherWeeklySchedule?.totalBlocks || 0} bloques</span>
                  </div>
                </div>
                {(teacherWeeklySchedule?.slots || []).length > 0 ? (
                  <>
                    <div className="campus-teacher__schedule-meta-strip">
                      <span>Jornada base: {teacherWeeklySchedule?.timeRange?.startTime || '06:00'} - {teacherWeeklySchedule?.timeRange?.endTime || '16:00'}</span>
                      <span>Los espacios sin clase se muestran dentro de la jornada.</span>
                    </div>
                    <div className="campus-teacher__schedule-table-wrap">
                      <table className="campus-teacher__schedule-table">
                        <thead>
                          <tr>
                            <th scope="col">Hora</th>
                            {(teacherWeeklySchedule.weekdays || []).map((day) => (
                              <th key={day.key} scope="col">{day.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(teacherWeeklySchedule.slots || []).map((slot) => (
                            <tr key={slot.key}>
                              <th scope="row">{slot.label}</th>
                              {(slot.days || []).map((day) => (
                                <td key={`${slot.key}-${day.weekday}`}>
                                  {(day.items || []).length > 0 ? (
                                    <div className="campus-teacher__schedule-cell-stack">
                                      {day.items.map((item) => (
                                        <article
                                          className="campus-teacher__schedule-class-card"
                                          key={item.key}
                                          style={{ '--campus-schedule-accent': item.colorToken || '#2a6f97' }}
                                        >
                                          <strong>{getCourseDisplayTitle({ ...item, title: item.courseTitle })}</strong>
                                          <span>{[item.subject, getCourseGroupLabel(item) || getCourseGradeLabel(item)].filter(Boolean).join(' · ')}</span>
                                          <small>{[formatTimeRange(item.startTime, item.endTime), item.label || 'Bloque de clase'].filter(Boolean).join(' · ')}</small>
                                        </article>
                                      ))}
                                    </div>
                                  ) : <span className="campus-teacher__schedule-empty">-</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="campus-teacher__card-actions">
                      <span className="campus-panel__meta">Este horario sale de lo que coordinación guarda por curso en backend. Si falta un bloque o un curso, debe ajustarse desde coordinación académica.</span>
                    </div>
                  </>
                ) : <p className="campus-panel__meta">Coordinación aún no ha asignado jornadas de clase para este docente.</p>}
              </article>
            ) : null}

            {!activeTeacherSection ? (
              <div className="campus-teacher__embedded-panel">
                <p className="campus-panel__meta">Selecciona una opcion del portal para continuar.</p>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}

export default TeacherCampusHome;
