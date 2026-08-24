import { useEffect, useMemo, useRef, useState } from 'react';
import Select from 'react-select';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LOGIN_PATH } from '../../lib/authNavigation';
import { getSchoolDisplayName } from '../../lib/schools';
import { isTeacherSectionEnabled } from '../../lib/staffFeatures';
import { formatCoexistenceInfractionOption, groupCoexistenceInfractions } from '../../lib/coexistenceInfractions';
import colibriLogo from '../../assets/colibrisinfondo.png';
import { ColibriBootSplash } from '../../components/ColibriBootSplash';
import DismissibleNotice from '../../components/DismissibleNotice';
import useAuthStore from '../../store/auth.store';
import { createHrSupplyRequest, getHrPlannerCycles, getHrSupplyItems, getHrSupplyRequests, updateHrSupplyRequest } from '../../services/hr.service';
import StaffAnnouncementsPanel, { StaffAnnouncementsUnreadBadge, useStaffAnnouncementUnreadCount } from '../../components/staff-announcements/StaffAnnouncementsPanel';
import ComergioAcademyPanel from '../../components/comergio-academy/ComergioAcademyPanel';
import {
  COMERGIO_ACADEMY_CHILDREN,
  COMERGIO_ACADEMY_PARENT,
  isComergioAcademySection,
} from '../../components/comergio-academy/academyNav';
import { AcademyNotificationBadge } from '../../components/comergio-academy/AcademyNotificationBadge';
import { useComergioAcademyNotificationCounts } from '../../components/comergio-academy/useComergioAcademyNotificationCounts';
import '../../components/comergio-academy/ComergioAcademyPanel.css';
import {
  getNotifications,
  getNotificationsUnreadCount,
  markAllNotificationsRead,
} from '../../services/notifications.service';
import TeacherCameraCapture from '../components/TeacherCameraCapture';
import {
  createCampusTeacherPost,
  createCampusTeacherDisciplineObservation,
  createCampusTeacherParentFeedRequest,
  getCampusTeacherAttendance,
  getCampusTeacherCourseDetail,
  getCampusTeacherAssignmentSubmissions,
  getCampusTeacherDisciplineObservations,
  getCampusCoexistencePolicy,
  getCampusTeacherFamilyFeed,
  toggleCampusTeacherFamilyFeedLike,
  createCampusTeacherFamilyFeedComment,
  deleteCampusTeacherFamilyFeedComment,
  toggleCampusTeacherFamilyFeedCommentLike,
  getCampusTeacherParentFeedRequests,
  getCampusTeacherCalendar,
  getCampusTeacherOverviewShell,
  getCampusTeacherOverviewMetrics,
  saveCampusTeacherAttendance,
  saveCampusTeacherStudentGrades,
  getCampusTeacherCourseReportCards,
  saveCampusTeacherCourseReportCard,
  getCampusTeacherHeadroomReportCards,
  saveCampusTeacherHeadroomReportCard,
  getCampusTeacherCourseFlyLock,
  updateCampusTeacherCourseFlyLock,
  uploadCampusTeacherParentFeedMedia,
  uploadCampusTeacherProfilePhoto,
  updateCampusTeacherAcademicContent,
  uploadCampusTeacherAcademicContentMedia,
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
  { id: 'main', label: 'Inicio', keys: ['dashboard', 'schedule', 'courses'] },
  {
    id: 'teaching',
    label: 'Enseñanza',
    keys: [
      'academic_management',
      'academic_content',
      'attendance',
      'guidance_routine',
      'school_coexistence',
      'family_feed',
      'social_publications',
      'resource_requests',
      'staff_announcements',
    ],
  },
  {
    id: 'comergio',
    label: 'Comergio Academy',
    keys: [COMERGIO_ACADEMY_PARENT.key, 'conecta', 'informa'],
  },
];

function resolveTeacherNavLabel(option) {
  if (option?.key === COMERGIO_ACADEMY_PARENT.key) return 'Video tutoriales';
  return option?.label || '';
}

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
    case 'report':
      return (
        <svg {...common}>
          <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M15 3v5h5" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
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
    case 'family':
      return (
        <svg {...common}>
          <path d="M4 19.5V11l8-6 8 6v8.5M8 19.5v-5h8v5M7.5 8.3V5.5h3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M4 19.5h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case 'resources':
      return (
        <svg {...common}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'announcements':
      return (
        <svg {...common}>
          <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M15.5 8.5a4.5 4.5 0 0 1 0 7M18 6a8 8 0 0 1 0 12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case 'academy':
      return (
        <svg {...common}>
          <path d="M4 10.5 12 6l8 4.5-8 4.5-8-4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M7 13.2V17c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-3.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M20 10.5V16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case 'video':
      return (
        <svg {...common}>
          <path d="M5 6.5h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M17 10.2 21 8v8l-4-2.2" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'connect':
      return (
        <svg {...common}>
          <path d="M9.5 14.5 14.5 9.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <path d="M11 7.5 12.2 6.3a3.5 3.5 0 1 1 5 5L16 12.5M13 16.5 11.8 17.7a3.5 3.5 0 1 1-5-5L8 11.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case 'informa':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 11v5M12 8h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
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
  { key: 'general_report_card', label: 'Boletín general', icon: 'report', description: 'Genera el boletín consolidado del curso cuando todas las materias hayan enviado su boletín.' },
  { key: 'attendance', label: 'Asistencia a clase', icon: 'attendance', description: 'Registrar si el alumno entró a tiempo, llegó tarde o no asistió a tu clase.' },
  { key: 'academic_management', label: 'Gestión académica', icon: 'academic', description: 'Definir evaluación y crear contenido académico por materia.' },
  { key: 'academic_content', label: 'Contenido académico', icon: 'content', description: 'Planear los temas de estudio por grado y asignatura.' },
  { key: 'school_coexistence', label: 'Convivencia escolar', icon: 'coexistence', description: 'Registrar observaciones de comportamiento para seguimiento institucional.' },
  { key: 'family_feed', label: 'Feed de familias', icon: 'family', description: 'Consulta las publicaciones y comunicados visibles para las familias.' },
  { key: 'social_publications', label: 'Publicaciones', icon: 'publications', description: 'Enviar fotos, videos y relatos a revisión de Secretaría Académica.' },
  { key: 'resource_requests', label: 'Solicitud de recursos', icon: 'resources', description: 'Solicitar materiales institucionales a Recursos y gestion de compras.' },
  { key: 'staff_announcements', label: 'Comunicados internos', icon: 'announcements', description: 'Envía y recibe mensajes internos entre el equipo del colegio.' },
  {
    key: COMERGIO_ACADEMY_PARENT.key,
    label: COMERGIO_ACADEMY_PARENT.label,
    icon: 'academy',
    description: COMERGIO_ACADEMY_PARENT.description,
  },
  ...COMERGIO_ACADEMY_CHILDREN.map((child) => ({
    ...child,
    icon: child.key === 'video_tutoriales' ? 'video' : child.key === 'conecta' ? 'connect' : 'informa',
  })),
];

const teacherResourceStatusLabels = {
  pending_coordination_review: 'En revisión de coordinación',
  returned_for_correction: 'Devuelto para corrección',
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

const TEACHER_COMMON_MATERIALS = [
  'Foamy',
  'Cartón paja',
  'Papel cometa',
  'Celofán',
  'Cartulina',
  'Papel bond',
  'Silicona',
  'Pegante',
  'Tijeras',
  'Témperas',
  'Crayones',
  'Marcadores',
  'Globos',
  'Pitillos',
  'Cinta masking',
  'Papel crepé',
];

function createTeacherResourceRequestDraft() {
  return {
    subjectKey: '',
    gradeKey: '',
    courseId: '',
    materialKey: '',
    customMaterialName: '',
    quantity: '1',
    pendingMaterials: [],
    activityTitle: '',
    purpose: '',
    activityDate: '',
    noMaterialsNeeded: false,
  };
}

function resolveTeacherDraftMaterialName(draft = {}) {
  if (draft.materialKey === '__other__') {
    return String(draft.customMaterialName || '').trim();
  }
  return String(draft.materialKey || '').trim();
}

function formatTeacherPlannerMaterialsLabel(activity = {}) {
  const materials = Array.isArray(activity.materials) && activity.materials.length
    ? activity.materials
    : (activity.materialName
      ? [{ materialName: activity.materialName, quantity: activity.quantity || 1 }]
      : []);
  if (!materials.length) return '—';
  return materials
    .map((item) => `${item.materialName || 'Material'} ×${Math.max(1, Number(item.quantity || 1))}`)
    .join(' · ');
}

function isPlannerSubmissionOpen(cycle) {
  const deadline = toDateInputValue(cycle?.submissionDeadline);
  if (!deadline) return true;
  const today = getTodayDateInputValue();
  return today <= deadline;
}

function getTeacherRequestForCycle(requests, cycleId) {
  return (Array.isArray(requests) ? requests : []).find((request) => (
    String(request.plannerCycleId || request.plannerCycle?.id || '') === String(cycleId)
    && request.status !== 'cancelled'
  )) || null;
}

function createTeacherSocialPublicationDraft() {
  return {
    subjectKey: '',
    courseId: '',
    title: '',
    body: '',
    media: [],
  };
}

function getNowTimeInputValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function createTeacherDisciplineObservationDraft() {
  return {
    destination: 'coexistence',
    courseId: '',
    studentId: '',
    observation: '',
    infractionKey: '',
    incidentDate: getTodayDateInputValue(),
    incidentTime: getNowTimeInputValue(),
  };
}

function formatDateTimeLabel(value) {
  if (!value) {
    return 'Sin fecha';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Sin fecha';
  }

  return parsedDate.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeCampusGradingScale(rawScale = {}) {
  const minScore = Number(rawScale?.minScore ?? 0);
  const maxScore = Number(rawScale?.maxScore ?? 100);
  const passingScore = Number(rawScale?.passingScore ?? 70);
  const normalizedMin = Number.isFinite(minScore) ? minScore : 0;
  const normalizedMax = Number.isFinite(maxScore) && maxScore > normalizedMin ? maxScore : 100;
  const normalizedPassing = Number.isFinite(passingScore) ? Math.min(Math.max(passingScore, normalizedMin), normalizedMax) : 70;
  const defaultPerformanceLevels = [
    { key: 'deficiente', label: 'Deficiente', minScore: 0, maxScore: 59, color: '#ef4444', order: 10 },
    { key: 'insuficiente', label: 'Insuficiente', minScore: 60, maxScore: 69, color: '#f97316', order: 20 },
    { key: 'aceptable', label: 'Aceptable', minScore: 70, maxScore: 79, color: '#eab308', order: 30 },
    { key: 'bueno', label: 'Bueno', minScore: 80, maxScore: 89, color: '#65a30d', order: 40 },
    { key: 'sobresaliente', label: 'Sobresaliente', minScore: 90, maxScore: 95, color: '#15803d', order: 50 },
    { key: 'excelente', label: 'Excelente', minScore: 96, maxScore: 100, color: '#166534', order: 60 },
  ];
  const sourceLevels = (Array.isArray(rawScale?.performanceLevels) && rawScale.performanceLevels.length > 0)
    ? rawScale.performanceLevels
    : defaultPerformanceLevels;
  const performanceLevels = sourceLevels
    .map((level, index) => ({
      key: String(level?.key || `performance_level_${index + 1}`).trim(),
      label: String(level?.label || '').trim(),
      minScore: Number.isFinite(Number(level?.minScore)) ? Number(level.minScore) : normalizedMin,
      maxScore: Number.isFinite(Number(level?.maxScore)) ? Number(level.maxScore) : normalizedMax,
      color: String(level?.color || defaultPerformanceLevels[index]?.color || '#174a68').trim(),
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
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

function getTeacherSocialPublicationStatusTone(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  return 'review';
}

function getTeacherSocialPublicationThumb(request) {
  const media = Array.isArray(request?.media) ? request.media : [];
  for (let index = 0; index < media.length; index += 1) {
    const mediaItem = normalizeTeacherPublicationHistoryMedia(media[index], index);
    if (mediaItem.kind === 'image' && (mediaItem.thumbUrl || mediaItem.src)) {
      return mediaItem.thumbUrl || mediaItem.src;
    }
  }
  return '';
}

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

const teacherDisciplineDestinationOptions = [
  {
    value: 'wellbeing',
    label: 'Bienestar',
    description: 'Caso psicológico: llega a Psicología para acompañamiento.',
  },
  {
    value: 'coexistence',
    label: 'Convivencia',
    description: 'Disciplina: seguimiento cuantitativo de convivencia escolar.',
  },
];

const teacherDisciplineDestinationLabels = {
  wellbeing: 'Bienestar',
  coexistence: 'Convivencia',
};

const teacherCourseWorkspaceTabs = [
  { key: 'grading', label: 'Estructura de notas' },
  { key: 'posts', label: 'Asignación' },
  { key: 'submissions', label: 'Entrega de asignaciones' },
  { key: 'gradebook', label: 'Libro de notas' },
  { key: 'report_card', label: 'Generar boletín' },
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

const EMPTY_TEACHER_LIST = [];
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
    allowStudentSubmission: false,
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
    completed: false,
    completedAt: null,
    materials: [],
  };
}

function createAcademicContentMaterialLinkDraft() {
  return { title: '', url: '' };
}

function formatAcademicContentMaterialLabel(material = {}) {
  return String(material.title || material.fileName || material.url || 'Material').trim() || 'Material';
}

function pickActiveAcademicPeriod(periods = []) {
  const list = (Array.isArray(periods) ? periods : []).filter(Boolean);
  if (list.length <= 1) {
    return list[0] || null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const withDates = list.filter((period) => period.startDate && period.endDate);

  const current = withDates.find((period) => period.startDate <= today && today <= period.endDate);
  if (current) {
    return current;
  }

  const upcoming = withDates
    .filter((period) => period.startDate > today)
    .sort((left, right) => String(left.startDate).localeCompare(String(right.startDate)))[0];
  if (upcoming) {
    return upcoming;
  }

  const mostRecentPast = withDates
    .filter((period) => period.endDate < today)
    .sort((left, right) => String(right.endDate).localeCompare(String(left.endDate)))[0];
  if (mostRecentPast) {
    return mostRecentPast;
  }

  return list[0];
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

function formatSubmissionDateTime(value) {
  if (!value) {
    return 'Sin fecha';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin fecha';
  }
  return parsed.toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSubmissionAttachmentLabel(attachment = {}) {
  return String(attachment.fileName || attachment.title || attachment.url || 'Archivo').trim() || 'Archivo';
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
  const seenSharedBlocks = new Set();

  (courses || []).forEach((course) => {
    sanitizeClassSessions(course.classSessions).forEach((session) => {
      const weekday = Number(session.weekday);
      if (weekday < 1 || weekday > 5) {
        return;
      }

      const sharedBlockKey = course.classroomGroupKey
        ? `${course.classroomGroupKey}::${course.subject}::${weekday}:${session.startTime}:${session.endTime}`
        : `${course.id}:${weekday}:${session.startTime}:${session.endTime}`;
      if (seenSharedBlocks.has(sharedBlockKey)) {
        return;
      }
      seenSharedBlocks.add(sharedBlockKey);

      entries.push({
        key: sharedBlockKey,
          startDate: '',
          endDate: '',
        courseId: course.id,
        courseTitle: getCourseOptionLabel(course),
        subject: course.subject,
        studentGradeKey: course.studentGradeKey,
        classroomGroupKey: course.classroomGroupKey || '',
        classroomGroupLabel: course.classroomGroupLabel || '',
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

function formatLongWeekdayDate(date = new Date()) {
  const label = date.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getMondayOfWeek(date = new Date()) {
  const nextDate = new Date(date);
  nextDate.setHours(12, 0, 0, 0);
  const day = nextDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  nextDate.setDate(nextDate.getDate() + diff);
  return nextDate;
}

function addDaysToDate(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + Number(amount || 0));
  return nextDate;
}

function formatScheduleDayChip(date) {
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function formatScheduleWeekRange(mondayDate) {
  const fridayDate = addDaysToDate(mondayDate, 4);
  const startLabel = mondayDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  const endLabel = fridayDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  return `${startLabel} - ${endLabel}, ${fridayDate.getFullYear()}`;
}

function exportTeacherWeeklyScheduleCsv(schedule, weekdays = []) {
  const rows = [['Dia', 'Hora', 'Curso', 'Asignatura', 'Grupo', 'Bloque']];
  (schedule?.slots || []).forEach((slot) => {
    (slot.days || []).forEach((day) => {
      const weekdayLabel = weekdays.find((entry) => entry.key === day.weekday)?.label || `Dia ${day.weekday}`;
      if (!(day.items || []).length) {
        rows.push([weekdayLabel, slot.label, '', '', '', '']);
        return;
      }
      day.items.forEach((item) => {
        rows.push([
          weekdayLabel,
          `${item.startTime || ''} - ${item.endTime || ''}`.trim(),
          item.courseTitle || '',
          item.subject || '',
          item.classroomGroupLabel || item.studentGradeKey || '',
          item.label || '',
        ]);
      });
    });
  });

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `horario-docente-${buildLocalDateValue(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getTeacherFirstName(fullName) {
  const first = String(fullName || '')
    .replace(/^(profe|profesor|profesora)\s+/i, '')
    .trim()
    .split(/\s+/)[0];
  return first || 'Docente';
}

function getCoursePerformanceTone(score, maxScore = 100) {
  if (!Number.isFinite(Number(score))) {
    return 'empty';
  }
  const ratio = Number(score) / Math.max(Number(maxScore) || 100, 1);
  if (ratio >= 0.75) return 'good';
  if (ratio >= 0.65) return 'warn';
  return 'danger';
}

function resolveTeacherPerformanceLevel(score, gradingScale = {}) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return null;
  }

  const levels = Array.isArray(gradingScale?.performanceLevels) ? gradingScale.performanceLevels : [];
  return levels.find((level) => (
    numericScore >= Number(level.minScore)
    && numericScore <= Number(level.maxScore)
  )) || null;
}

function getTeacherPerformanceLevelMidpoint(level = {}) {
  const minScore = Number(level?.minScore);
  const maxScore = Number(level?.maxScore);
  if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) {
    return '';
  }
  return Number(((minScore + maxScore) / 2).toFixed(2));
}

function formatTeacherGradeDisplay(score, gradingScale = {}) {
  if (score === null || score === undefined || score === '') {
    return 'Sin nota';
  }
  if (gradingScale?.qualitativeOnly) {
    return resolveTeacherPerformanceLevel(score, gradingScale)?.label || 'Sin categoría';
  }
  return `Nota ${score}`;
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

  const raw = String(isoValue);
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`;
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
    allowStudentSubmission: Boolean(post?.allowStudentSubmission),
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

function buildExistingFileAttachmentsFromPost(post) {
  return (post?.attachments || [])
    .filter((attachment) => String(attachment?.sourceType || '').toLowerCase() !== 'link')
    .map((attachment) => ({
      sourceType: attachment.sourceType || 'file',
      kind: attachment.kind || 'file',
      title: String(attachment.title || attachment.fileName || 'Adjunto').trim(),
      url: String(attachment.url || '').trim(),
      fileName: String(attachment.fileName || '').trim(),
      mimeType: String(attachment.mimeType || '').trim(),
      sizeBytes: Number(attachment.sizeBytes || 0),
      extension: String(attachment.extension || '').trim(),
      storage: String(attachment.storage || '').trim(),
    }));
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
      ...matchingPosts.map((post) => {
        const subject = String(post.subject || '').trim();
        const courseTitle = String(post.courseTitle || '').trim();
        const courseGroup = String(post.courseGroup || '').trim();
        const typeLabel = formatPostTypeLabel(post.type);
        return {
          key: `post-${post.id}`,
          kind: 'activity',
          postId: post.id,
          courseId: post.courseId,
          subject,
          courseTitle,
          courseGroup,
          typeLabel,
          label: post.title || typeLabel,
          meta: [subject, courseGroup || courseTitle, typeLabel, formatDeliveryLabel(post)].filter(Boolean).join(' · '),
          description: post.body || 'Actividad programada para este día.',
        };
      }),
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

function buildTeacherManagementOverview(courses, posts, workspace, options = {}) {
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

  const pendingGradingItemsFromMetrics = Array.isArray(options.pendingGradingItems)
    ? options.pendingGradingItems
      .map((item) => ({
        id: String(item?.id || '').trim(),
        courseId: String(item?.courseId || '').trim(),
        title: String(item?.title || '').trim() || formatPostTypeLabel(item?.type),
        typeLabel: formatPostTypeLabel(item?.type) || String(item?.typeLabel || 'Actividad').trim(),
        courseTitle: String(item?.courseTitle || '').trim() || 'Curso',
        deliveryLabel: String(item?.deliveryLabel || '').trim() || 'Sin fecha definida',
        dateLabel: String(item?.dateLabel || '').trim() || formatDateLabel(item?.dueAt || item?.scheduledClassDate || item?.updatedAt),
        description: String(item?.description || item?.body || 'Actividad pendiente de revisión o calificación.').trim(),
      }))
      .filter((item) => item.id)
    : [];

  const pendingGradingItemsFromPosts = normalizedPosts
    .filter((post) => {
      if (!isEvaluativePostType(post.type) || String(post.status || '').toLowerCase() === 'archived') {
        return false;
      }

      if (pendingPostIds.size > 0) {
        return pendingPostIds.has(String(post.id));
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

  const pendingGradingItems = pendingGradingItemsFromMetrics.length > 0
    ? pendingGradingItemsFromMetrics
    : pendingGradingItemsFromPosts;
  const resolvedPendingGradingCount = pendingGradingItems.length > 0
    ? pendingGradingItems.length
    : pendingGradingCount;

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
    pendingGradingCount: resolvedPendingGradingCount,
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
    assignmentSubmissionCount: Number.isFinite(Number(options.assignmentSubmissionCount))
      ? Number(options.assignmentSubmissionCount)
      : (Array.isArray(options.assignmentSubmissions) ? options.assignmentSubmissions.length : 0),
    assignmentSubmissions: Array.isArray(options.assignmentSubmissions)
      ? options.assignmentSubmissions
        .map((item) => ({
          id: String(item?.id || '').trim(),
          courseId: String(item?.courseId || '').trim(),
          postId: String(item?.postId || '').trim(),
          studentId: String(item?.studentId || '').trim(),
          studentName: String(item?.studentName || '').trim() || 'Estudiante',
          studentGrade: String(item?.studentGrade || '').trim(),
          studentSchoolCode: String(item?.studentSchoolCode || '').trim(),
          assignmentTitle: String(item?.assignmentTitle || '').trim() || formatPostTypeLabel(item?.assignmentType) || 'Actividad',
          assignmentType: formatPostTypeLabel(item?.assignmentType) || String(item?.assignmentType || 'Actividad').trim(),
          courseTitle: String(item?.courseTitle || '').trim() || 'Curso',
          submittedAt: item?.submittedAt || null,
          submittedAtLabel: String(item?.submittedAtLabel || '').trim() || formatDateTimeLabel(item?.submittedAt),
        }))
        .filter((item) => item.id && item.courseId)
      : [],
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

function getNativeCourseGradeLabel(course) {
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

  return gradeNumber || normalizeCourseDisplayText(course?.gradeLevel || course?.studentGradeKey || '');
}

function getCourseGradeLabel(course) {
  const classroomGroupLabel = normalizeCourseDisplayText(course?.classroomGroupLabel);
  if (classroomGroupLabel) {
    return classroomGroupLabel;
  }

  return getNativeCourseGradeLabel(course) || normalizeCourseDisplayText(getCourseGroupLabel(course));
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
  const classroomGroupLabel = normalizeCourseDisplayText(course?.classroomGroupLabel);
  if (classroomGroupLabel) {
    return classroomGroupLabel;
  }

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

function getAttendanceCourseLabel(course) {
  const classroomGroupLabel = normalizeCourseDisplayText(course?.classroomGroupLabel);
  if (classroomGroupLabel) {
    const nativeGradeLabel = getNativeCourseGradeLabel(course);
    if (nativeGradeLabel && normalizeCourseDisplayKey(nativeGradeLabel) !== normalizeCourseDisplayKey(classroomGroupLabel)) {
      return `${classroomGroupLabel} · ${nativeGradeLabel}`;
    }
    return classroomGroupLabel;
  }

  return getCourseGroupLabel(course) || getCourseOptionLabel(course);
}

function getCourseDisplaySubtitle(course) {
  const subjectLabel = normalizeCourseDisplayText(course?.subject);
  const groupLabel = getCourseGroupLabel(course);
  const title = normalizeCourseDisplayKey(getCourseDisplayTitle(course));
  const parts = [subjectLabel, groupLabel].filter((part) => part && !title.includes(normalizeCourseDisplayKey(part)));

  return parts.join(' · ');
}

function getTimelineActivityCourseContext(item, courses = []) {
  const course = (Array.isArray(courses) ? courses : []).find((entry) => String(entry?.id || '') === String(item?.courseId || '')) || null;
  const subjectLabel = normalizeCourseDisplayText(item?.subject || course?.subject);
  const courseLabel = normalizeCourseDisplayText(
    (course && (getCourseGroupLabel(course) || getCourseGradeLabel(course)))
    || item?.courseGroup
    || item?.courseTitle
    || course?.title
  );
  const uniqueParts = [];
  [subjectLabel, courseLabel].forEach((part) => {
    if (!part) {
      return;
    }
    const normalizedPart = normalizeCourseDisplayKey(part);
    if (uniqueParts.some((existing) => normalizeCourseDisplayKey(existing) === normalizedPart)) {
      return;
    }
    uniqueParts.push(part);
  });

  return uniqueParts.join(' · ') || getCourseDisplayTitle(course) || 'Curso';
}

function getCourseViewAccent(course, index = 0) {
  const palette = [
    { accent: '#2563eb', soft: '#eff6ff', ink: '#1d4ed8' },
    { accent: '#7c3aed', soft: '#f5f3ff', ink: '#6d28d9' },
    { accent: '#059669', soft: '#ecfdf5', ink: '#047857' },
    { accent: '#ea580c', soft: '#fff7ed', ink: '#c2410c' },
    { accent: '#db2777', soft: '#fdf2f8', ink: '#be185d' },
    { accent: '#0891b2', soft: '#ecfeff', ink: '#0e7490' },
    { accent: '#ca8a04', soft: '#fefce8', ink: '#a16207' },
    { accent: '#4f46e5', soft: '#eef2ff', ink: '#4338ca' },
  ];
  const fallback = palette[Math.abs(Number(index) || 0) % palette.length];
  const accent = String(course?.colorToken || '').trim() || fallback.accent;
  return {
    accent,
    soft: fallback.soft,
    ink: accent,
  };
}

function getCourseGradeGroupKey(course) {
  const subjectKey = normalizeCourseDisplayKey(course?.subject || 'asignatura');
  if (course?.classroomGroupKey) {
    return `${subjectKey}::classroom:${normalizeCourseDisplayKey(course.classroomGroupKey)}`;
  }
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
        completed: Boolean(topic.completed),
        completedAt: topic.completedAt || null,
        materials: Array.isArray(topic.materials)
          ? topic.materials.map((material) => ({ ...material }))
          : [],
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

function campusAudienceAppliesToStudent(audience, studentId) {
  const targetType = String(audience?.targetType || 'course').trim();
  const ids = Array.isArray(audience?.targetStudentIds)
    ? audience.targetStudentIds.map((id) => String(id?._id || id || '').trim()).filter(Boolean)
    : [];
  if (targetType !== 'students' || ids.length === 0) {
    return true;
  }
  return ids.includes(String(studentId || '').trim());
}

function resolveAssignmentAudience(assignment, posts = []) {
  if (String(assignment?.targetType || '') === 'students' && Array.isArray(assignment?.targetStudentIds) && assignment.targetStudentIds.length) {
    return {
      targetType: 'students',
      targetStudentIds: assignment.targetStudentIds.map((id) => String(id)),
    };
  }

  const matchingPost = (Array.isArray(posts) ? posts : []).find((post) => {
    if (String(post?.targetType || '') !== 'students' || !Array.isArray(post.targetStudentIds) || post.targetStudentIds.length === 0) {
      return false;
    }
    const postName = normalizeCourseDisplayKey(post.title);
    const assignmentName = normalizeCourseDisplayKey(assignment?.subcomponentName);
    return postName === assignmentName
      || normalizeAssignmentTitleForMatch(post.title) === normalizeAssignmentTitleForMatch(assignment?.subcomponentName);
  });

  if (matchingPost) {
    return {
      targetType: 'students',
      targetStudentIds: matchingPost.targetStudentIds.map((id) => String(id)),
    };
  }

  return { targetType: 'course', targetStudentIds: [] };
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
  const students = (detail?.students || [])
    .filter((student) => campusAudienceAppliesToStudent(post, student.studentId))
    .map((student) => ({
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
    case 'submissions':
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M14 3v5h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M9 13h6M9 17h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
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
      targetType: subcomponent.targetType || 'course',
      targetStudentIds: Array.isArray(subcomponent.targetStudentIds) ? subcomponent.targetStudentIds : [],
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

function normalizeTeacherQuickSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPreviewTeacherStudentDirectory(previewWorkspace) {
  const directoryMap = new Map();
  const courses = Array.isArray(previewWorkspace?.courses) ? previewWorkspace.courses : [];
  const courseDetails = previewWorkspace?.courseDetails || {};

  courses.forEach((course) => {
    const courseId = String(course?.id || '');
    if (!courseId) {
      return;
    }

    const students = Array.isArray(courseDetails?.[courseId]?.students) ? courseDetails[courseId].students : [];
    students.forEach((student) => {
      const studentId = String(student?.studentId || '');
      if (!studentId) {
        return;
      }

      const existing = directoryMap.get(studentId) || {
        studentId,
        name: String(student?.name || '').trim(),
        schoolCode: String(student?.schoolCode || '').trim(),
        grade: String(student?.grade || '').trim(),
        courses: [],
      };

      if (!existing.courses.some((entry) => entry.id === courseId)) {
        existing.courses.push({
          id: courseId,
          subject: String(course?.subject || '').trim(),
          title: String(course?.title || '').trim(),
          gradeLabel: String(course?.gradeLevel || course?.studentGradeKey || course?.section || '').trim(),
        });
      }

      directoryMap.set(studentId, existing);
    });
  });

  return Array.from(directoryMap.values()).sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }));
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
          { strictTotals: false, silentNotices: true },
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
          { strictTotals: false, silentNotices: true },
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
  const staffAnnouncementsUnreadQuery = useStaffAnnouncementUnreadCount(!previewEnabled);
  const staffAnnouncementsUnreadCount = Number(
    staffAnnouncementsUnreadQuery.data?.data?.unreadCount
    ?? staffAnnouncementsUnreadQuery.data?.unreadCount
    ?? 0
  );
  const generalNotificationsUnreadQuery = useQuery({
    queryKey: ['teacher-notifications-unread', teacherQueryScope],
    queryFn: getNotificationsUnreadCount,
    enabled: !previewEnabled && Boolean(authUser?.id),
    refetchInterval: 60_000,
  });
  const generalNotificationsUnreadCount = Number(
    generalNotificationsUnreadQuery.data?.unreadCount
    ?? generalNotificationsUnreadQuery.data?.count
    ?? generalNotificationsUnreadQuery.data
    ?? 0
  );
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
  const academyCounts = useComergioAcademyNotificationCounts();
  const academyUnreadTotal = Number(academyCounts?.total || 0);
  const topbarNotificationsBadgeCount = generalNotificationsUnreadCount + academyUnreadTotal;
  const [selectedSubjectKey, setSelectedSubjectKey] = useState('');
  const [selectedPortalGradeKey, setSelectedPortalGradeKey] = useState('');
  const [activeCourseWorkspaceTab, setActiveCourseWorkspaceTab] = useState('grading');
  const [selectedSubmissionAssignmentId, setSelectedSubmissionAssignmentId] = useState('');
  const [showSelectedCourseWorkspace, setShowSelectedCourseWorkspace] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [timelineMonth, setTimelineMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [timelineCourseId, setTimelineCourseId] = useState('');
  const [dashboardCalendarMonth, setDashboardCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedTimelineDate, setSelectedTimelineDate] = useState('');
  const [selectedDashboardCalendarDate, setSelectedDashboardCalendarDate] = useState('');
  const [isDashboardCalendarExpanded, setIsDashboardCalendarExpanded] = useState(false);
  const [scheduleWeekAnchor, setScheduleWeekAnchor] = useState(() => getMondayOfWeek(new Date()));
  const [scheduleViewMode, setScheduleViewMode] = useState('week');
  const [scheduleSelectedWeekday, setScheduleSelectedWeekday] = useState(() => {
    const today = new Date().getDay();
    return today >= 1 && today <= 5 ? today : 1;
  });
  const [coursesCatalogView, setCoursesCatalogView] = useState('grid');
  const [coursesDetailOpen, setCoursesDetailOpen] = useState(false);
  const [coursesPage, setCoursesPage] = useState(1);
  const [coursesPageSize, setCoursesPageSize] = useState(12);
  const [coursesSubjectFilter, setCoursesSubjectFilter] = useState('all');
  const [showCoursesFilter, setShowCoursesFilter] = useState(false);
  const [selectedAssignmentDetail, setSelectedAssignmentDetail] = useState(null);
  const [activeIntegralModal, setActiveIntegralModal] = useState('');
  const [showPostSuccessModal, setShowPostSuccessModal] = useState(false);
  const [gradebookSaveModal, setGradebookSaveModal] = useState(null);
  const [reportCardPeriodKey, setReportCardPeriodKey] = useState('');
  const [reportCardObservations, setReportCardObservations] = useState({});
  const [headroomReportSectionKey, setHeadroomReportSectionKey] = useState('');
  const [headroomReportPeriodKey, setHeadroomReportPeriodKey] = useState('');
  const [headroomObservations, setHeadroomObservations] = useState({});
  const [editingPostId, setEditingPostId] = useState('');
  const [showAssignmentComposer, setShowAssignmentComposer] = useState(false);
  const [showClassworkCreateMenu, setShowClassworkCreateMenu] = useState(false);
  const [openPostMenuId, setOpenPostMenuId] = useState('');
  const [postDraft, setPostDraft] = useState(createPostDraft(''));
  const [materialLinks, setMaterialLinks] = useState([createMaterialLinkDraft()]);
  const [materialFiles, setMaterialFiles] = useState([]);
  const [existingMaterialFiles, setExistingMaterialFiles] = useState([]);
  const [showAttachLinkPanel, setShowAttachLinkPanel] = useState(false);
  const [classScheduleDraft, setClassScheduleDraft] = useState([]);
  const [academicPeriodDrafts, setAcademicPeriodDrafts] = useState([]);
  const [academicContentDrafts, setAcademicContentDrafts] = useState([]);
  const [academicContentTopicInputs, setAcademicContentTopicInputs] = useState({});
  const [topicLinkDrafts, setTopicLinkDrafts] = useState({});
  const [expandedAcademicContentTopicKey, setExpandedAcademicContentTopicKey] = useState('');
  const [academicContentUploadingKey, setAcademicContentUploadingKey] = useState('');
  const [teacherResourceRequestDraft, setTeacherResourceRequestDraft] = useState(createTeacherResourceRequestDraft);
  const [teacherResourcePlannerActivities, setTeacherResourcePlannerActivities] = useState([]);
  const [selectedTeacherPlannerCycleId, setSelectedTeacherPlannerCycleId] = useState('');
  const [teacherPlannerConfirmOpen, setTeacherPlannerConfirmOpen] = useState(false);
  const [editingTeacherPlannerRequestId, setEditingTeacherPlannerRequestId] = useState('');
  const [teacherSocialPublicationDraft, setTeacherSocialPublicationDraft] = useState(createTeacherSocialPublicationDraft);
  const [teacherSocialMediaUploading, setTeacherSocialMediaUploading] = useState(false);
  const [teacherSocialMediaDragActive, setTeacherSocialMediaDragActive] = useState(false);
  const [teacherDisciplineDraft, setTeacherDisciplineDraft] = useState(createTeacherDisciplineObservationDraft);
  const [disciplineStudentSearch, setDisciplineStudentSearch] = useState('');
  const [showDisciplineStudentMenu, setShowDisciplineStudentMenu] = useState(false);
  const [subcomponentDrafts, setSubcomponentDrafts] = useState({});
  const [expandedGradingComponentKey, setExpandedGradingComponentKey] = useState('');
  const [studentDrafts, setStudentDrafts] = useState({});
  const [showTeacherMenu, setShowTeacherMenu] = useState(false);
  const [showTeacherSidebar, setShowTeacherSidebar] = useState(false);
  const [isTeacherRailCollapsed, setIsTeacherRailCollapsed] = useState(false);
  const [showTeacherNotifications, setShowTeacherNotifications] = useState(false);
  const [teacherQuickSearch, setTeacherQuickSearch] = useState('');
  const [showTeacherQuickSearch, setShowTeacherQuickSearch] = useState(false);
  const [pendingGradebookFocus, setPendingGradebookFocus] = useState(null);
  const [teacherNotifications, setTeacherNotifications] = useState([]);
  const [loadingTeacherNotifications, setLoadingTeacherNotifications] = useState(false);
  const [showTeacherCamera, setShowTeacherCamera] = useState(false);
  const [teacherPhotoPreview, setTeacherPhotoPreview] = useState('');
  const [teacherAttendanceLocked, setTeacherAttendanceLocked] = useState(false);
  const [teacherAttendanceSaveModal, setTeacherAttendanceSaveModal] = useState(null);
  const [familyFeedCommentDrafts, setFamilyFeedCommentDrafts] = useState({});
  const [familyFeedExpandedComments, setFamilyFeedExpandedComments] = useState({});
  const [familyFeedPendingLikeIds, setFamilyFeedPendingLikeIds] = useState([]);
  const [familyFeedPendingCommentKeys, setFamilyFeedPendingCommentKeys] = useState([]);
  const teacherPhotoInputRef = useRef(null);
  const teacherSwipeStartRef = useRef(null);
  const teacherMenuRef = useRef(null);
  const teacherNotificationsRef = useRef(null);
  const teacherQuickSearchRef = useRef(null);
  const classworkCreateMenuRef = useRef(null);
  const disciplineStudentComboboxRef = useRef(null);
  const teacherSocialMediaInputRef = useRef(null);
  const classworkUploadInputRef = useRef(null);
  const classworkUploadAppendRef = useRef(true);
  const materialFilesRef = useRef([]);
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

  const assignmentSubmissionsQuery = useQuery({
    queryKey: ['campus', 'teacher', 'assignment-submissions', teacherQueryScope, selectedCourseId],
    queryFn: () => getCampusTeacherAssignmentSubmissions(selectedCourseId),
    enabled: !previewEnabled
      && Boolean(selectedCourseId)
      && activeTeacherSection === 'academic_management'
      && activeCourseWorkspaceTab === 'submissions',
    retry: false,
    staleTime: 20_000,
  });

  const subjectReportCardsQuery = useQuery({
    queryKey: ['campus', 'teacher', 'report-cards', teacherQueryScope, selectedCourseId],
    queryFn: () => getCampusTeacherCourseReportCards(selectedCourseId),
    enabled: !previewEnabled
      && Boolean(selectedCourseId)
      && activeTeacherSection === 'academic_management'
      && activeCourseWorkspaceTab === 'report_card',
    retry: false,
    staleTime: 20_000,
  });

  const headroomReportCardsQuery = useQuery({
    queryKey: ['campus', 'teacher', 'headroom-report-cards', teacherQueryScope, headroomReportSectionKey, headroomReportPeriodKey],
    queryFn: () => getCampusTeacherHeadroomReportCards({
      sourceCourseKey: headroomReportSectionKey || undefined,
      academicPeriodKey: headroomReportPeriodKey || undefined,
    }),
    enabled: !previewEnabled && activeTeacherSection === 'general_report_card',
    retry: false,
    staleTime: 20_000,
  });

  const courseFlyLockQuery = useQuery({
    queryKey: ['campus', 'teacher', 'fly-lock', teacherQueryScope, selectedCourseId],
    queryFn: () => getCampusTeacherCourseFlyLock(selectedCourseId),
    enabled: !previewEnabled
      && Boolean(selectedCourseId)
      && activeTeacherSection === 'academic_management'
      && showSelectedCourseWorkspace,
    retry: false,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

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
    enabled: !previewEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const teacherResourceRequestsQuery = useQuery({
    queryKey: ['hr', 'teacher', 'supply-requests'],
    queryFn: () => getHrSupplyRequests({ requestType: 'material' }),
    enabled: !previewEnabled,
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

  const teacherFamilyFeedQuery = useQuery({
    queryKey: ['campus', 'teacher', 'family-feed', teacherQueryScope],
    queryFn: getCampusTeacherFamilyFeed,
    enabled: !previewEnabled && activeTeacherSection === 'family_feed',
    retry: false,
    staleTime: 30_000,
  });

  const familyFeedQueryKey = ['campus', 'teacher', 'family-feed', teacherQueryScope];

  const patchFamilyFeedPublication = (updatedPublication) => {
    if (!updatedPublication?.id) {
      return;
    }

    queryClient.setQueryData(familyFeedQueryKey, (current) => {
      const list = Array.isArray(current) ? current : [];
      return list.map((item) => (String(item.id) === String(updatedPublication.id) ? updatedPublication : item));
    });
  };

  const onToggleFamilyFeedLike = async (publicationId) => {
    const id = String(publicationId || '');
    if (!id || familyFeedPendingLikeIds.includes(id)) {
      return;
    }

    setFamilyFeedPendingLikeIds((current) => [...current, id]);
    try {
      const updated = await toggleCampusTeacherFamilyFeedLike(id);
      patchFamilyFeedPublication(updated);
    } catch (error) {
      setNotice({
        type: 'error',
        text: error?.response?.data?.message || error?.message || 'No se pudo actualizar el like.',
      });
    } finally {
      setFamilyFeedPendingLikeIds((current) => current.filter((item) => item !== id));
    }
  };

  const onSubmitFamilyFeedComment = async (publicationId) => {
    const id = String(publicationId || '');
    const body = String(familyFeedCommentDrafts[id] || '').trim();
    if (!id || !body) {
      setNotice({ type: 'error', text: 'Escribe un comentario.' });
      return;
    }

    const pendingKey = `${id}:new`;
    if (familyFeedPendingCommentKeys.includes(pendingKey)) {
      return;
    }

    setFamilyFeedPendingCommentKeys((current) => [...current, pendingKey]);
    try {
      const updated = await createCampusTeacherFamilyFeedComment(id, { body });
      patchFamilyFeedPublication(updated);
      setFamilyFeedCommentDrafts((current) => ({ ...current, [id]: '' }));
      setFamilyFeedExpandedComments((current) => ({ ...current, [id]: true }));
    } catch (error) {
      setNotice({
        type: 'error',
        text: error?.response?.data?.message || error?.message || 'No se pudo publicar el comentario.',
      });
    } finally {
      setFamilyFeedPendingCommentKeys((current) => current.filter((item) => item !== pendingKey));
    }
  };

  const onDeleteFamilyFeedComment = async (publicationId, commentId) => {
    const id = String(publicationId || '');
    const comment = String(commentId || '');
    const pendingKey = `${id}:${comment}`;
    if (!id || !comment || familyFeedPendingCommentKeys.includes(pendingKey)) {
      return;
    }

    setFamilyFeedPendingCommentKeys((current) => [...current, pendingKey]);
    try {
      const updated = await deleteCampusTeacherFamilyFeedComment(id, comment);
      patchFamilyFeedPublication(updated);
    } catch (error) {
      setNotice({
        type: 'error',
        text: error?.response?.data?.message || error?.message || 'No se pudo borrar el comentario.',
      });
    } finally {
      setFamilyFeedPendingCommentKeys((current) => current.filter((item) => item !== pendingKey));
    }
  };

  const onToggleFamilyFeedCommentLike = async (publicationId, commentId) => {
    const id = String(publicationId || '');
    const comment = String(commentId || '');
    const pendingKey = `${id}:${comment}:like`;
    if (!id || !comment || familyFeedPendingCommentKeys.includes(pendingKey)) {
      return;
    }

    setFamilyFeedPendingCommentKeys((current) => [...current, pendingKey]);
    try {
      const updated = await toggleCampusTeacherFamilyFeedCommentLike(id, comment);
      patchFamilyFeedPublication(updated);
    } catch (error) {
      setNotice({
        type: 'error',
        text: error?.response?.data?.message || error?.message || 'No se pudo actualizar el like del comentario.',
      });
    } finally {
      setFamilyFeedPendingCommentKeys((current) => current.filter((item) => item !== pendingKey));
    }
  };

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

  const teacherCoexistencePolicyQuery = useQuery({
    queryKey: ['campus', 'teacher', 'coexistence-policy', teacherQueryScope],
    queryFn: getCampusCoexistencePolicy,
    enabled: !previewEnabled && activeTeacherSection === 'school_coexistence',
    retry: false,
    staleTime: 30_000,
  });

  const teacherCoexistenceInfractions = useMemo(
    () => (Array.isArray(teacherCoexistencePolicyQuery.data?.policy?.infractions)
      ? teacherCoexistencePolicyQuery.data.policy.infractions.filter((item) => item.active !== false && item.label)
      : []),
    [teacherCoexistencePolicyQuery.data?.policy?.infractions]
  );

  const teacherCoexistenceInfractionGroups = useMemo(
    () => groupCoexistenceInfractions(teacherCoexistenceInfractions),
    [teacherCoexistenceInfractions]
  );

  const updateGradingSchemeMutation = useMutation({
    mutationFn: ({ courseId, payload }) => updateCampusTeacherGradingScheme(courseId, payload),
    onSuccess: (detail) => {
      if (selectedCourseId && detail?.course) {
        queryClient.setQueryData(['campus', 'teacher', 'course', teacherQueryScope, selectedCourseId], detail);
      }
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'course', teacherQueryScope] });
    },
  });

  const updateAcademicContentMutation = useMutation({
    mutationFn: ({ courseId, payload }) => updateCampusTeacherAcademicContent(courseId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'course', teacherQueryScope] });
    },
  });

  const createPostMutation = useMutation({
    mutationFn: createCampusTeacherPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'calendar'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'course', teacherQueryScope] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'assignment-submissions', teacherQueryScope] });
    },
  });

  const updatePostMutation = useMutation({
    mutationFn: ({ postId, payload }) => updateCampusTeacherPost(postId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'calendar'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'course', teacherQueryScope] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'assignment-submissions', teacherQueryScope] });
    },
  });

  const saveGradesMutation = useMutation({
    mutationFn: ({ courseId, studentId, payload }) => saveCampusTeacherStudentGrades(courseId, studentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'course', teacherQueryScope] });
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
      setNotice({ type: 'success', text: 'Foto del docente actualizada.' });
    },
    onError: (error) => {
      setTeacherPhotoPreview((currentPreview) => {
        if (currentPreview && !String(currentPreview).startsWith('blob:')) {
          return currentPreview;
        }
        return '';
      });
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo guardar la foto del docente.' });
    },
  });

  const createTeacherResourceRequestMutation = useMutation({
    mutationFn: ({ requestId, payload }) => (
      requestId ? updateHrSupplyRequest(requestId, payload) : createHrSupplyRequest(payload)
    ),
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

  const saveSubjectReportCardMutation = useMutation({
    mutationFn: ({ courseId, payload }) => saveCampusTeacherCourseReportCard(courseId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'report-cards'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'headroom-report-cards'] });
    },
  });

  const saveHeadroomReportCardMutation = useMutation({
    mutationFn: saveCampusTeacherHeadroomReportCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'headroom-report-cards'] });
    },
  });

  const updateCourseFlyLockMutation = useMutation({
    mutationFn: ({ courseId, payload }) => updateCampusTeacherCourseFlyLock(courseId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['campus', 'teacher', 'fly-lock', teacherQueryScope, selectedCourseId],
        (current) => ({
          ...(current || {}),
          lock: data?.lock || current?.lock,
          message: data?.message,
        })
      );
      queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'fly-lock'] });
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

  const courses = Array.isArray(workspace.courses) ? workspace.courses : EMPTY_TEACHER_LIST;
  const guidanceRoutineCourses = useMemo(
    () => courses.filter((course) => course.courseType === 'guidance_routine'),
    [courses]
  );
  const academicCourses = useMemo(
    () => courses.filter((course) => course.courseType !== 'guidance_routine'),
    [courses]
  );
  const classAttendanceCourses = useMemo(
    () => academicCourses.filter((course) => course.includeClassAttendance !== false),
    [academicCourses]
  );
  const attendanceCourses = activeTeacherSection === 'guidance_routine' ? guidanceRoutineCourses : classAttendanceCourses;
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
    () => teacherSectionOptions.filter((option) => {
      if (!isTeacherSectionEnabled(option.key, authUser)) {
        return false;
      }
      if (option.key === 'guidance_routine' || option.key === 'general_report_card') {
        return guidanceRoutineCourses.length > 0;
      }
      if (option.key === 'attendance') {
        return classAttendanceCourses.length > 0;
      }
      return true;
    }),
    [authUser, classAttendanceCourses.length, guidanceRoutineCourses.length]
  );
  useEffect(() => {
    if (!isTeacherSectionEnabled(activeTeacherSection, authUser)) {
      setActiveTeacherSection('dashboard');
    }
  }, [activeTeacherSection, authUser]);
  const teacherStudentDirectory = useMemo(() => {
    if (previewEnabled) {
      return buildPreviewTeacherStudentDirectory(previewWorkspace);
    }
    return Array.isArray(overviewMetricsQuery.data?.studentDirectory)
      ? overviewMetricsQuery.data.studentDirectory
      : EMPTY_TEACHER_LIST;
  }, [overviewMetricsQuery.data?.studentDirectory, previewEnabled, previewWorkspace]);
  const teacherQuickSearchQuery = normalizeTeacherQuickSearch(teacherQuickSearch);
  const teacherQuickSearchResults = useMemo(() => {
    if (!teacherQuickSearchQuery) {
      return { students: [], sections: [], courses: [] };
    }

    const studentMatches = [];
    teacherStudentDirectory.forEach((student) => {
      const haystack = normalizeTeacherQuickSearch([
        student.name,
        student.schoolCode,
        student.grade,
      ].join(' '));
      if (!haystack.includes(teacherQuickSearchQuery)) {
        return;
      }

      const coursesForStudent = Array.isArray(student.courses) ? student.courses : [];
      if (coursesForStudent.length === 0) {
        studentMatches.push({
          key: `student-${student.studentId}`,
          studentId: student.studentId,
          name: student.name,
          schoolCode: student.schoolCode,
          grade: student.grade,
          courseId: '',
          courseLabel: 'Sin curso asignado',
        });
        return;
      }

      coursesForStudent.forEach((course) => {
        studentMatches.push({
          key: `student-${student.studentId}-${course.id}`,
          studentId: student.studentId,
          name: student.name,
          schoolCode: student.schoolCode,
          grade: student.grade,
          courseId: course.id,
          courseLabel: [course.subject || course.title, course.gradeLabel].filter(Boolean).join(' · '),
        });
      });
    });

    const sectionMatches = availableTeacherSectionOptions
      .filter((option) => normalizeTeacherQuickSearch(`${option.label} ${option.description || ''}`).includes(teacherQuickSearchQuery))
      .slice(0, 5)
      .map((option) => ({
        key: `section-${option.key}`,
        sectionKey: option.key,
        label: option.label,
        description: option.description,
      }));

    const courseMatches = academicCourses
      .filter((course) => normalizeTeacherQuickSearch([
        course.subject,
        course.title,
        course.gradeLevel,
        course.section,
        getCourseDisplayTitle(course),
      ].join(' ')).includes(teacherQuickSearchQuery))
      .slice(0, 6)
      .map((course) => ({
        key: `course-${course.id}`,
        courseId: course.id,
        label: getCourseDisplayTitle(course),
        description: [normalizeSubjectLabel(course.subject), getCourseGradeLabel(course)].filter(Boolean).join(' · '),
      }));

    return {
      students: studentMatches.slice(0, 8),
      sections: sectionMatches,
      courses: courseMatches,
    };
  }, [academicCourses, availableTeacherSectionOptions, teacherQuickSearchQuery, teacherStudentDirectory]);
  const hasTeacherQuickSearchResults = teacherQuickSearchResults.students.length > 0
    || teacherQuickSearchResults.sections.length > 0
    || teacherQuickSearchResults.courses.length > 0;
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
  const assignmentSubmissionRows = useMemo(
    () => (Array.isArray(assignmentSubmissionsQuery.data?.assignments) ? assignmentSubmissionsQuery.data.assignments : []),
    [assignmentSubmissionsQuery.data?.assignments]
  );
  const selectedSubmissionAssignment = useMemo(
    () => assignmentSubmissionRows.find((item) => String(item.id) === String(selectedSubmissionAssignmentId)) || assignmentSubmissionRows[0] || null,
    [assignmentSubmissionRows, selectedSubmissionAssignmentId]
  );
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
  const schoolDisplayName = useMemo(
    () => getSchoolDisplayName(authUser || workspace.teacher || {}, 'Colegio'),
    [authUser, workspace.teacher],
  );
  const academicYearLabel = useMemo(() => {
    const year = Number(workspace?.academicYear || workspace?.schoolYear || new Date().getFullYear());
    return `Año lectivo ${Number.isFinite(year) ? year : new Date().getFullYear()}`;
  }, [workspace?.academicYear, workspace?.schoolYear]);
  const teacherWeeklySchedule = useMemo(
    () => workspace.weeklySchedule || buildTeacherWeeklyScheduleFallback(courses),
    [courses, workspace.weeklySchedule]
  );
  const scheduleWeekdays = useMemo(() => {
    const sourceDays = Array.isArray(teacherWeeklySchedule?.weekdays) ? teacherWeeklySchedule.weekdays : [];
    return sourceDays.map((day, index) => {
      const date = addDaysToDate(scheduleWeekAnchor, index);
      return {
        ...day,
        date,
        dateLabel: formatScheduleDayChip(date),
        headerLabel: `${day.label} ${formatScheduleDayChip(date)}`,
      };
    });
  }, [scheduleWeekAnchor, teacherWeeklySchedule?.weekdays]);
  const visibleScheduleWeekdays = useMemo(() => {
    if (scheduleViewMode !== 'day') {
      return scheduleWeekdays;
    }
    return scheduleWeekdays.filter((day) => Number(day.key) === Number(scheduleSelectedWeekday));
  }, [scheduleSelectedWeekday, scheduleViewMode, scheduleWeekdays]);
  const scheduleWeekRangeLabel = useMemo(
    () => formatScheduleWeekRange(scheduleWeekAnchor),
    [scheduleWeekAnchor]
  );
  const scheduleBaseRangeLabel = `${teacherWeeklySchedule?.timeRange?.startTime || '06:00'} - ${teacherWeeklySchedule?.timeRange?.endTime || '16:00'}`;
  const coursesCatalogRows = useMemo(() => {
    const sourceCourses = activeTeacherSection === 'academic_management'
      ? visibleCourses
      : academicCourses.filter((course) => {
        if (coursesSubjectFilter === 'all') {
          return true;
        }
        return normalizeSubjectLabel(course.subject) === coursesSubjectFilter;
      });

    return sourceCourses.map((course, index) => {
      const stats = buildCourseCardStats(course, previewEnabled ? previewWorkspace : null);
      const accent = getCourseViewAccent(course, index);
      const performanceLevel = resolveTeacherPerformanceLevel(stats.averageScore, gradingScale);
      return {
        course,
        stats,
        accent,
        performanceColor: performanceLevel?.color || '',
        title: getCourseDisplayTitle(course),
        subtitle: getCourseDisplaySubtitle(course) || 'Curso asignado',
      };
    });
  }, [
    academicCourses,
    activeTeacherSection,
    coursesSubjectFilter,
    gradingScale,
    previewEnabled,
    previewWorkspace,
    visibleCourses,
  ]);
  const coursesSubjectFilterOptions = useMemo(() => {
    const subjects = Array.from(new Set(academicCourses.map((course) => normalizeSubjectLabel(course.subject)).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, 'es'));
    return subjects;
  }, [academicCourses]);
  const coursesTotalPages = Math.max(1, Math.ceil(coursesCatalogRows.length / coursesPageSize));
  const coursesPagedRows = useMemo(() => {
    const start = (coursesPage - 1) * coursesPageSize;
    return coursesCatalogRows.slice(start, start + coursesPageSize);
  }, [coursesCatalogRows, coursesPage, coursesPageSize]);
  const coursesPageStart = coursesCatalogRows.length === 0 ? 0 : ((coursesPage - 1) * coursesPageSize) + 1;
  const coursesPageEnd = Math.min(coursesPage * coursesPageSize, coursesCatalogRows.length);
  const coursesDetailStudents = useMemo(() => {
    const students = Array.isArray(timelineCourseDetail?.students) ? timelineCourseDetail.students : [];
    return [...students]
      .map((student) => ({
        ...student,
        finalScore: parseFiniteScore(student.finalScore),
      }))
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'es', { sensitivity: 'base' }));
  }, [timelineCourseDetail]);
  const openCoursesDetail = (course) => {
    if (!course?.id) {
      return;
    }
    setSelectedCourseId(course.id);
    setTimelineCourseId(course.id);
    setSelectedPortalGradeKey(getCourseGradeGroupKey(course));
    setTimelineMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setSelectedTimelineDate('');
    setCoursesDetailOpen(true);
    setShowSelectedCourseWorkspace(false);
  };
  const openAcademicManagementWorkspace = (course, tab = 'grading') => {
    if (!course?.id) {
      return;
    }
    const subjectLabel = normalizeSubjectLabel(course.subject);
    const subjectKey = slugifyComponentKey(subjectLabel) || 'subject';
    setSelectedSubjectKey(subjectKey);
    setSelectedCourseId(course.id);
    setTimelineCourseId(course.id);
    setSelectedPortalGradeKey(getCourseGradeGroupKey(course));
    setActiveCourseWorkspaceTab(tab);
    setShowSelectedCourseWorkspace(true);
    setCoursesDetailOpen(false);
    setSelectedTimelineDate('');
  };
  const openCatalogCourse = (course) => {
    if (activeTeacherSection === 'academic_management') {
      openAcademicManagementWorkspace(course, 'grading');
      return;
    }
    openCoursesDetail(course);
  };
  const closeCoursesDetail = () => {
    setCoursesDetailOpen(false);
    setSelectedTimelineDate('');
  };
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
    () => buildTeacherManagementOverview(
      academicCourses,
      recentPosts,
      previewEnabled ? previewWorkspace : null,
      {
        pendingGradingItems: overviewMetricsQuery.data?.pendingGradingItems,
        assignmentSubmissions: overviewMetricsQuery.data?.assignmentSubmissions,
        assignmentSubmissionCount: overviewMetricsQuery.data?.assignmentSubmissionCount,
      }
    ),
    [
      previewEnabled,
      academicCourses,
      overviewMetricsQuery.data?.assignmentSubmissionCount,
      overviewMetricsQuery.data?.assignmentSubmissions,
      overviewMetricsQuery.data?.pendingGradingItems,
      previewWorkspace,
      recentPosts,
    ]
  );
  const dashboardCoursePerformance = useMemo(() => {
    const maxScore = Number(gradingScale?.maxScore || 100);
    return academicCourses
      .map((course) => {
        const stats = buildCourseCardStats(course, previewEnabled ? previewWorkspace : null);
        const performanceLevel = resolveTeacherPerformanceLevel(stats.averageScore, gradingScale);
        return {
          id: course.id,
          label: getCourseOptionLabel(course) || getCourseDisplayTitle(course),
          averageScore: stats.averageScore,
          maxScore,
          tone: getCoursePerformanceTone(stats.averageScore, maxScore),
          color: performanceLevel?.color || '',
          levelLabel: performanceLevel?.label || '',
          percent: stats.averageScore === null
            ? 0
            : Math.max(0, Math.min(100, (Number(stats.averageScore) / maxScore) * 100)),
        };
      })
      .sort((left, right) => {
        const leftScore = left.averageScore === null ? -1 : Number(left.averageScore);
        const rightScore = right.averageScore === null ? -1 : Number(right.averageScore);
        return rightScore - leftScore;
      });
  }, [academicCourses, gradingScale, previewEnabled, previewWorkspace]);
  const visibleDashboardCoursePerformance = useMemo(
    () => dashboardCoursePerformance.slice(0, 8),
    [dashboardCoursePerformance]
  );
  const visibleDashboardAssignmentSubmissions = useMemo(
    () => (Array.isArray(integralOverview.assignmentSubmissions) ? integralOverview.assignmentSubmissions.slice(0, 8) : []),
    [integralOverview.assignmentSubmissions]
  );
  const teacherWelcomeName = getTeacherFirstName(teacherName);
  const todayWelcomeLabel = formatLongWeekdayDate(new Date());
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

  const subjectReportPeriods = useMemo(() => {
    const fromApi = Array.isArray(subjectReportCardsQuery.data?.periods) ? subjectReportCardsQuery.data.periods : [];
    return fromApi.length ? fromApi : selectedCourseAcademicPeriods.map((period) => ({
      key: period.key,
      name: period.name,
    }));
  }, [selectedCourseAcademicPeriods, subjectReportCardsQuery.data?.periods]);

  const effectiveReportCardPeriodKey = reportCardPeriodKey || subjectReportPeriods[0]?.key || '';

  const selectedSubjectReport = useMemo(() => {
    const reports = Array.isArray(subjectReportCardsQuery.data?.reports) ? subjectReportCardsQuery.data.reports : [];
    return reports.find((report) => String(report.academicPeriodKey) === String(effectiveReportCardPeriodKey)) || null;
  }, [effectiveReportCardPeriodKey, subjectReportCardsQuery.data?.reports]);

  const reportCardStudentRows = useMemo(() => {
    const students = Array.isArray(selectedCourseDetail?.students) ? selectedCourseDetail.students : [];
    return students.map((student) => {
      const periods = buildStudentPeriods(student, selectedCourseAcademicPeriods);
      const period = periods.find((item) => String(item.key) === String(effectiveReportCardPeriodKey)) || periods[0];
      const savedObservation = selectedSubjectReport?.students?.find((entry) => String(entry.studentId) === String(student.studentId))?.observation || '';
      return {
        studentId: String(student.studentId),
        name: student.name,
        grade: student.grade,
        periodAverage: period?.periodScore ?? null,
        observation: Object.prototype.hasOwnProperty.call(reportCardObservations, student.studentId)
          ? reportCardObservations[student.studentId]
          : savedObservation,
      };
    });
  }, [
    effectiveReportCardPeriodKey,
    reportCardObservations,
    selectedCourseAcademicPeriods,
    selectedCourseDetail?.students,
    selectedSubjectReport,
  ]);

  const headroomReportSections = Array.isArray(headroomReportCardsQuery.data?.sections)
    ? headroomReportCardsQuery.data.sections
    : [];
  const selectedHeadroomSection = useMemo(() => {
    if (!headroomReportSections.length) return null;
    return headroomReportSections.find((section) => String(section.sourceCourseKey) === String(headroomReportSectionKey))
      || headroomReportSections[0];
  }, [headroomReportSectionKey, headroomReportSections]);

  const selectedHeadroomPeriodKey = headroomReportPeriodKey
    || selectedHeadroomSection?.academicPeriodKey
    || selectedHeadroomSection?.periods?.[0]?.key
    || '';

  useEffect(() => {
    if (!subjectReportPeriods.length) return;
    if (!reportCardPeriodKey || !subjectReportPeriods.some((period) => period.key === reportCardPeriodKey)) {
      setReportCardPeriodKey(subjectReportPeriods[0].key);
    }
  }, [reportCardPeriodKey, subjectReportPeriods]);

  useEffect(() => {
    if (!selectedSubjectReport) {
      setReportCardObservations({});
      return;
    }
    const nextObservations = {};
    (selectedSubjectReport.students || []).forEach((student) => {
      nextObservations[String(student.studentId)] = String(student.observation || '');
    });
    setReportCardObservations(nextObservations);
  }, [
    effectiveReportCardPeriodKey,
    selectedCourseId,
    selectedSubjectReport?.id,
    selectedSubjectReport?.updatedAt,
    selectedSubjectReport?.status,
  ]);

  useEffect(() => {
    if (!headroomReportSections.length) return;
    if (!headroomReportSectionKey || !headroomReportSections.some((section) => section.sourceCourseKey === headroomReportSectionKey)) {
      setHeadroomReportSectionKey(headroomReportSections[0].sourceCourseKey);
    }
  }, [headroomReportSectionKey, headroomReportSections]);

  useEffect(() => {
    const periods = selectedHeadroomSection?.periods || [];
    if (!periods.length) return;
    if (!headroomReportPeriodKey || !periods.some((period) => period.key === headroomReportPeriodKey)) {
      setHeadroomReportPeriodKey(selectedHeadroomSection.academicPeriodKey || periods[0].key);
    }
  }, [headroomReportPeriodKey, selectedHeadroomSection]);

  useEffect(() => {
    const generalStudents = selectedHeadroomSection?.generalReport?.students || [];
    if (!generalStudents.length) {
      setHeadroomObservations({});
      return;
    }
    const nextObservations = {};
    generalStudents.forEach((student) => {
      nextObservations[String(student.studentId)] = String(student.headroomObservation || '');
    });
    setHeadroomObservations(nextObservations);
  }, [selectedHeadroomSection?.generalReport?.id, selectedHeadroomSection?.generalReport?.updatedAt, selectedHeadroomSection?.sourceCourseKey, selectedHeadroomPeriodKey]);

  const onSubmitSubjectReportCard = async (nextStatus) => {
    if (!selectedCourse?.id || !effectiveReportCardPeriodKey) {
      setNotice({ type: 'error', text: 'Selecciona un curso y un periodo para el boletín.' });
      return;
    }

    try {
      await saveSubjectReportCardMutation.mutateAsync({
        courseId: selectedCourse.id,
        payload: {
          academicPeriodKey: effectiveReportCardPeriodKey,
          status: nextStatus,
          students: reportCardStudentRows.map((student) => ({
            studentId: student.studentId,
            observation: String(student.observation || '').trim(),
          })),
        },
      });
      setNotice({
        type: 'success',
        text: nextStatus === 'submitted'
          ? 'Boletín enviado al director de grupo.'
          : 'Borrador del boletín guardado.',
      });
      await subjectReportCardsQuery.refetch();
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo guardar el boletín.' });
    }
  };

  const onSubmitHeadroomReportCard = async (nextStatus) => {
    if (!selectedHeadroomSection?.sourceCourseKey || !selectedHeadroomPeriodKey) {
      setNotice({ type: 'error', text: 'Selecciona el curso y el periodo del boletín general.' });
      return;
    }
    if (!selectedHeadroomSection.allSubjectsSubmitted) {
      setNotice({ type: 'error', text: 'Aún faltan materias por enviar su boletín.' });
      return;
    }

    const baseStudents = selectedHeadroomSection.generalReport?.students?.length
      ? selectedHeadroomSection.generalReport.students
      : (() => {
        const byStudent = new Map();
        (selectedHeadroomSection.subjects || []).forEach((subjectItem) => {
          (subjectItem.report?.students || []).forEach((student) => {
            const studentId = String(student.studentId);
            const current = byStudent.get(studentId) || {
              studentId,
              studentName: student.studentName,
              subjectLines: [],
            };
            current.subjectLines.push({
              subject: subjectItem.subject,
              periodAverage: student.periodAverage,
              teacherObservation: student.observation,
              teacherName: subjectItem.report?.teacherName || '',
            });
            byStudent.set(studentId, current);
          });
        });
        return Array.from(byStudent.values()).map((student) => {
          const averages = student.subjectLines.map((line) => Number(line.periodAverage)).filter((value) => Number.isFinite(value));
          return {
            ...student,
            overallAverage: averages.length
              ? Number((averages.reduce((sum, value) => sum + value, 0) / averages.length).toFixed(2))
              : null,
            headroomObservation: headroomObservations[student.studentId] || '',
          };
        });
      })();

    try {
      await saveHeadroomReportCardMutation.mutateAsync({
        sourceCourseKey: selectedHeadroomSection.sourceCourseKey,
        academicPeriodKey: selectedHeadroomPeriodKey,
        status: nextStatus,
        students: baseStudents.map((student) => ({
          studentId: student.studentId,
          headroomObservation: String(
            Object.prototype.hasOwnProperty.call(headroomObservations, student.studentId)
              ? headroomObservations[student.studentId]
              : (student.headroomObservation || '')
          ).trim(),
        })),
      });
      setNotice({
        type: 'success',
        text: nextStatus === 'published'
          ? 'Boletín general publicado.'
          : 'Borrador del boletín general guardado.',
      });
      await headroomReportCardsQuery.refetch();
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo guardar el boletín general.' });
    }
  };

  const courseFlyLock = courseFlyLockQuery.data?.lock || null;
  const courseFlyLockSessionPreview = courseFlyLockQuery.data?.sessionPreview || null;
  const canLockCourseFly = Boolean(courseFlyLockSessionPreview?.canLock || courseFlyLockSessionPreview?.inProgress);

  const onToggleCourseFlyLock = async (nextActive) => {
    if (!selectedCourse?.id) {
      setNotice({ type: 'error', text: 'Selecciona un curso para bloquear FLY.' });
      return;
    }

    if (nextActive && !canLockCourseFly) {
      setNotice({
        type: 'error',
        text: courseFlyLockSessionPreview?.warning
          || 'Solo puedes bloquear FLY mientras la clase de este curso esté en curso.',
      });
      return;
    }

    if (nextActive) {
      const confirmed = window.confirm(
        '¿Bloquear FLY para los alumnos de este curso mientras dictas la clase? Se liberará al terminar la sesión programada o cuando lo desbloquees manualmente.'
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      const result = await updateCourseFlyLockMutation.mutateAsync({
        courseId: selectedCourse.id,
        payload: { active: nextActive },
      });
      setNotice({
        type: 'success',
        text: result?.message
          || (nextActive ? 'FLY bloqueado para este curso.' : 'FLY desbloqueado para este curso.'),
      });
      await courseFlyLockQuery.refetch();
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo actualizar el bloqueo de FLY.' });
    }
  };

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

    // Solo mostramos los componentes del periodo vigente: si el docente renombró
    // componentes en un periodo, no queremos mezclar nombres viejos de otros periodos.
    const activePeriod = pickActiveAcademicPeriod(sourcePeriods);
    return buildAssignmentComponentOptions(activePeriod ? [activePeriod] : sourcePeriods);
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
  const selectedGradebookAssignmentAudience = useMemo(
    () => resolveAssignmentAudience(selectedGradebookAssignment, selectedCourseAssignmentPosts),
    [selectedGradebookAssignment, selectedCourseAssignmentPosts]
  );
  const selectedGradebookAssignmentStudents = useMemo(() => {
    const students = Array.isArray(selectedCourseDetail?.students) ? selectedCourseDetail.students : [];
    return students.filter((student) => campusAudienceAppliesToStudent(selectedGradebookAssignmentAudience, student.studentId));
  }, [selectedCourseDetail?.students, selectedGradebookAssignmentAudience]);
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
  const coursesDetailUpcoming = useMemo(() => {
    const today = new Date();
    const todayValue = buildLocalDateValue(today);
    const groupLabel = getCourseGroupLabel(timelineCourse) || getCourseGradeLabel(timelineCourse) || '';
    const mapDateMeta = (dateValue) => {
      const dayDate = dateValue ? new Date(`${dateValue}T12:00:00`) : null;
      return {
        dateValue,
        weekdayShort: dayDate
          ? dayDate.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '').toUpperCase()
          : '',
        dayNumber: dayDate ? dayDate.getDate() : '',
        monthShort: dayDate
          ? dayDate.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')
          : '',
      };
    };
    const postItems = [...(timelineCoursePosts || [])]
      .filter((post) => String(post?.status || '').toLowerCase() !== 'archived')
      .filter((post) => getTimelineDateValue(post) >= todayValue)
      .map((post) => {
        const dateMeta = mapDateMeta(getTimelineDateValue(post));
        const typeLabel = formatPostTypeLabel(post.type);
        return {
          id: `post-${post.id}`,
          kind: 'activity',
          typeTone: String(post.type || '').toLowerCase().includes('class') ? 'class' : 'activity',
          title: post.title || typeLabel,
          typeLabel,
          description: post.body || formatDeliveryLabel(post),
          deliveryLabel: formatDeliveryLabel(post),
          groupLabel,
          ...dateMeta,
        };
      });
    const classItems = [];
    for (let offset = 0; offset < 45; offset += 1) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      const dateValue = buildLocalDateValue(date);
      const weekday = date.getDay();
      (timelineCourseSchedule || [])
        .filter((session) => Number(session.weekday) === weekday)
        .forEach((session, sessionIndex) => {
          const dateMeta = mapDateMeta(dateValue);
          classItems.push({
            id: `class-${dateValue}-${sessionIndex}`,
            kind: 'class',
            typeTone: 'class',
            title: session.label || 'Clase programada',
            typeLabel: 'Clase',
            description: `${weekdayLongLabels[weekday] || 'Clase'} · ${formatTimeRange(session.startTime, session.endTime)}`,
            deliveryLabel: [formatTimeRange(session.startTime, session.endTime), session.room || session.classroom || '']
              .filter(Boolean)
              .join(' · '),
            groupLabel,
            ...dateMeta,
          });
        });
    }
    return [...postItems, ...classItems]
      .sort((left, right) => String(left.dateValue || '').localeCompare(String(right.dateValue || '')))
      .slice(0, 8);
  }, [timelineCourse, timelineCoursePosts, timelineCourseSchedule]);
  const timelineCourseCalendar = useMemo(
    () => buildCourseTimelineCalendar(timelineMonth, timelineCourseSchedule, timelineCoursePosts),
    [timelineCoursePosts, timelineCourseSchedule, timelineMonth]
  );
  const selectedCourseTimelineDay = useMemo(
    () => selectedCourseTimelineCalendar.find((cell) => !cell.empty && cell.dateValue === selectedTimelineDate) || null,
    [selectedCourseTimelineCalendar, selectedTimelineDate]
  );
  const selectedTimelineDay = useMemo(
    () => timelineCourseCalendar.find((cell) => !cell.empty && cell.dateValue === selectedTimelineDate) || null,
    [selectedTimelineDate, timelineCourseCalendar]
  );
  const activeTimelineDayModal = useMemo(() => {
    if (!selectedTimelineDate) {
      return null;
    }
    if (activeTeacherSection === 'academic_management' && showSelectedCourseWorkspace) {
      return selectedCourseTimelineDay;
    }
    if (activeTeacherSection === 'courses' && coursesDetailOpen) {
      return selectedTimelineDay;
    }
    return null;
  }, [
    activeTeacherSection,
    coursesDetailOpen,
    selectedCourseTimelineDay,
    selectedTimelineDate,
    selectedTimelineDay,
    showSelectedCourseWorkspace,
  ]);
  const dashboardCalendarPosts = useMemo(() => {
    const mapCalendarItemToPost = (item) => ({
      id: item.id,
      courseId: item.courseId,
      courseTitle: item.courseTitle,
      courseGroup: item.courseGroup,
      subject: item.subject,
      type: item.type,
      title: item.title,
      body: item.body || item.detail,
      deliveryMode: item.deliveryMode,
      dueAt: item.dueAt,
      scheduledClassDate: item.scheduledClassDate,
      scheduledClassSession: item.scheduledClassSession || null,
      publishedAt: item.publishedAt || null,
      status: item.status || 'published',
      attachments: Array.isArray(item.attachments) ? item.attachments : [],
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
  const assignmentDetailPost = useMemo(() => {
    if (!selectedAssignmentDetail?.id) {
      return null;
    }

    const detailId = String(selectedAssignmentDetail.id);
    const candidates = [
      selectedCourseAssignmentPosts.find((post) => String(post.id) === detailId),
      recentPosts.find((post) => String(post.id) === detailId),
      dashboardCalendarPosts.find((post) => String(post.id) === detailId),
      selectedAssignmentDetail,
    ].filter(Boolean);

    return candidates.reduce((best, candidate) => {
      const bestAttachments = Array.isArray(best?.attachments) ? best.attachments.length : 0;
      const candidateAttachments = Array.isArray(candidate?.attachments) ? candidate.attachments.length : 0;
      if (candidateAttachments > bestAttachments) {
        return { ...best, ...candidate, attachments: candidate.attachments };
      }
      return {
        ...candidate,
        ...best,
        attachments: best?.attachments?.length ? best.attachments : (candidate.attachments || []),
      };
    }, candidates[0]);
  }, [dashboardCalendarPosts, recentPosts, selectedAssignmentDetail, selectedCourseAssignmentPosts]);
  const dashboardCalendarGrid = useMemo(
    () => buildCourseTimelineCalendar(dashboardCalendarMonth, [], dashboardCalendarPosts),
    [dashboardCalendarMonth, dashboardCalendarPosts]
  );
  const selectedDashboardCalendarDay = useMemo(
    () => dashboardCalendarGrid.find((cell) => !cell.empty && cell.dateValue === selectedDashboardCalendarDate) || null,
    [dashboardCalendarGrid, selectedDashboardCalendarDate]
  );
  const teacherResourceItems = teacherResourceItemsQuery.data?.data?.items || teacherResourceItemsQuery.data?.items || [];
  const teacherResourceRequests = teacherResourceRequestsQuery.data?.data?.requests || teacherResourceRequestsQuery.data?.requests || [];
  const teacherPlannerCycles = teacherPlannerCyclesQuery.data?.data?.cycles || teacherPlannerCyclesQuery.data?.cycles || [];
  const teacherSocialPublicationRequests = teacherSocialPublicationRequestsQuery.data || [];
  const socialPublicationSubjectGroups = useMemo(() => groupCoursesBySubject(courses), [courses]);
  const selectedSocialPublicationSubject = useMemo(
    () => socialPublicationSubjectGroups.find((subject) => subject.key === teacherSocialPublicationDraft.subjectKey) || null,
    [socialPublicationSubjectGroups, teacherSocialPublicationDraft.subjectKey]
  );
  const socialPublicationCoursesForSubject = selectedSocialPublicationSubject?.courses || [];
  const selectedSocialPublicationCourse = socialPublicationCoursesForSubject.find((course) => course.id === teacherSocialPublicationDraft.courseId)
    || courses.find((course) => course.id === teacherSocialPublicationDraft.courseId)
    || null;
  const teacherDisciplineObservations = teacherDisciplineObservationsQuery.data?.observations || [];
  const selectedDisciplineCourse = courses.find((course) => course.id === teacherDisciplineDraft.courseId) || null;
  const selectedDisciplineCourseDetail = previewEnabled
    ? (selectedDisciplineCourse ? previewWorkspace.courseDetails?.[selectedDisciplineCourse.id] || null : null)
    : (teacherDisciplineDraft.courseId === selectedCourseId ? selectedCourseDetail : (teacherDisciplineCourseDetailQuery.data || null));
  const disciplineStudentOptions = useMemo(
    () => (Array.isArray(selectedDisciplineCourseDetail?.students) ? selectedDisciplineCourseDetail.students : EMPTY_TEACHER_LIST),
    [selectedDisciplineCourseDetail?.students]
  );
  const filteredDisciplineStudentOptions = useMemo(() => {
    const query = String(disciplineStudentSearch || '').trim().toLowerCase();
    if (!query) {
      return disciplineStudentOptions;
    }
    return disciplineStudentOptions.filter((student) => {
      const haystack = `${student?.name || ''} ${student?.schoolCode || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [disciplineStudentOptions, disciplineStudentSearch]);
  const selectedDisciplineStudent = disciplineStudentOptions.find((student) => student.studentId === teacherDisciplineDraft.studentId) || null;
  const selectedDisciplineStudentLabel = selectedDisciplineStudent
    ? `${selectedDisciplineStudent.name || 'Alumno'}${selectedDisciplineStudent.schoolCode ? ` · ${selectedDisciplineStudent.schoolCode}` : ''}`
    : '';
  const disciplineObservationLength = String(teacherDisciplineDraft.observation || '').length;
  const socialPublicationBodyLength = String(teacherSocialPublicationDraft.body || '').length;
  const recentTeacherSocialPublications = teacherSocialPublicationRequests.slice(0, 4);
  const selectedTeacherPlannerCycle = teacherPlannerCycles.find((cycle) => cycle.id === selectedTeacherPlannerCycleId) || null;
  const selectedTeacherPlannerRequest = selectedTeacherPlannerCycle
    ? getTeacherRequestForCycle(teacherResourceRequests, selectedTeacherPlannerCycle.id)
    : null;
  const teacherPlannerPendingCount = useMemo(
    () => teacherPlannerCycles.filter((cycle) => (
      isPlannerSubmissionOpen(cycle) && !getTeacherRequestForCycle(teacherResourceRequests, cycle.id)
    )).length,
    [teacherPlannerCycles, teacherResourceRequests]
  );
  const teacherPlannerSubjectOptions = useMemo(() => groupCoursesBySubject(academicCourses), [academicCourses]);
  const selectedTeacherPlannerSubject = useMemo(
    () => teacherPlannerSubjectOptions.find((subject) => subject.key === teacherResourceRequestDraft.subjectKey) || null,
    [teacherPlannerSubjectOptions, teacherResourceRequestDraft.subjectKey]
  );
  const teacherPlannerGradeOptions = useMemo(() => {
    const gradeMap = new Map();
    (selectedTeacherPlannerSubject?.courses || []).forEach((course) => {
      const gradeLabel = getCourseGradeLabel(course) || getCourseGroupLabel(course) || 'Sin grado';
      const gradeKey = slugifyComponentKey(gradeLabel) || gradeLabel;
      if (!gradeMap.has(gradeKey)) {
        gradeMap.set(gradeKey, { key: gradeKey, label: gradeLabel, courses: [] });
      }
      gradeMap.get(gradeKey).courses.push(course);
    });
    return Array.from(gradeMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'es'));
  }, [selectedTeacherPlannerSubject]);
  const selectedTeacherPlannerGrade = useMemo(
    () => teacherPlannerGradeOptions.find((grade) => grade.key === teacherResourceRequestDraft.gradeKey) || null,
    [teacherPlannerGradeOptions, teacherResourceRequestDraft.gradeKey]
  );
  const teacherPlannerCourseOptions = useMemo(
    () => (selectedTeacherPlannerGrade?.courses || []).slice().sort((left, right) => (
      getCourseDisplayTitle(left).localeCompare(getCourseDisplayTitle(right), 'es')
    )),
    [selectedTeacherPlannerGrade]
  );
  const selectedTeacherPlannerCourse = useMemo(
    () => teacherPlannerCourseOptions.find((course) => course.id === teacherResourceRequestDraft.courseId) || null,
    [teacherPlannerCourseOptions, teacherResourceRequestDraft.courseId]
  );
  const teacherPlannerMaterialOptions = useMemo(() => {
    const catalogNames = teacherResourceItems.map((item) => String(item.name || '').trim()).filter(Boolean);
    const merged = Array.from(new Set([...TEACHER_COMMON_MATERIALS, ...catalogNames]));
    return merged.sort((left, right) => left.localeCompare(right, 'es'));
  }, [teacherResourceItems]);
  const isTeacherPlannerEditable = Boolean(
    selectedTeacherPlannerCycle
    && isPlannerSubmissionOpen(selectedTeacherPlannerCycle)
    && (
      !selectedTeacherPlannerRequest
      || ['pending_coordination_review', 'returned_for_correction'].includes(selectedTeacherPlannerRequest.status)
    )
  );
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
    || saveSubjectReportCardMutation.isPending
    || saveHeadroomReportCardMutation.isPending
    || updateCourseFlyLockMutation.isPending
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

  useEffect(() => {
    if (!showTeacherSidebar) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowTeacherSidebar(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('campus-teacher-sidebar-open');

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('campus-teacher-sidebar-open');
    };
  }, [showTeacherSidebar]);

  useEffect(() => {
    const isTouchDevice = window.matchMedia?.('(max-width: 960px)')?.matches
      && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (!isTouchDevice || showTeacherCamera) {
      return undefined;
    }

    const isInteractiveTarget = (target) => Boolean(target?.closest?.(
      'input, textarea, select, button, a, video, [contenteditable=\"true\"], [role=\"dialog\"]'
    ));

    const onTouchStart = (event) => {
      if (
        showTeacherSidebar
        || showTeacherMenu
        || teacherSocialMediaUploading
        || event.touches?.length !== 1
        || isInteractiveTarget(event.target)
      ) {
        teacherSwipeStartRef.current = null;
        return;
      }

      const touch = event.touches[0];
      teacherSwipeStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    };

    const onTouchEnd = (event) => {
      const start = teacherSwipeStartRef.current;
      teacherSwipeStartRef.current = null;
      const touch = event.changedTouches?.[0];
      if (!start || !touch) {
        return;
      }

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const elapsed = Math.max(Date.now() - start.time, 1);
      const velocityX = deltaX / elapsed;
      // Instagram-like: abre con poco recorrido o con un flick rápido.
      const isSwipeRight = deltaX > 0
        && Math.abs(deltaX) >= Math.abs(deltaY) * 1.05
        && elapsed <= 700
        && (deltaX >= 28 || (deltaX >= 16 && velocityX >= 0.4));

      if (isSwipeRight) {
        setShowTeacherMenu(false);
        setShowTeacherSidebar(false);
        setShowTeacherCamera(true);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [showTeacherCamera, showTeacherMenu, showTeacherSidebar, teacherSocialMediaUploading]);

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

  const openTeacherAcademySection = (sectionKey) => {
    setShowTeacherNotifications(false);
    setShowTeacherMenu(false);
    setShowSelectedCourseWorkspace(false);
    setActiveTeacherSection(sectionKey);
    setShowTeacherSidebar(false);
  };

  const openTeacherNotifications = async () => {
    setShowTeacherMenu(false);
    setShowTeacherNotifications((current) => !current);
    if (showTeacherNotifications) return;
    setLoadingTeacherNotifications(true);
    try {
      const payload = await getNotifications();
      const inboxItems = (Array.isArray(payload?.items) ? payload.items : []).filter((item) => {
        const type = String(item?.payload?.type || item?.type || '');
        return type !== 'informa.post' && type !== 'conecta.case';
      });

      const academyItems = [];
      if (Number(academyCounts.informa || 0) > 0) {
        academyItems.push({
          id: 'academy-informa',
          title: Number(academyCounts.informa) === 1
            ? 'Nueva publicación en Comergio Informa'
            : `${academyCounts.informa} publicaciones nuevas en Comergio Informa`,
          body: 'Gerencia Comergio compartió novedades para el equipo.',
          sectionKey: 'informa',
          isAcademy: true,
        });
      }
      if (Number(academyCounts.conecta || 0) > 0) {
        academyItems.push({
          id: 'academy-conecta',
          title: Number(academyCounts.conecta) === 1
            ? 'Nuevo caso en Conecta'
            : `${academyCounts.conecta} casos nuevos en Conecta`,
          body: 'Hay actividad nueva en la comunidad Comergio.',
          sectionKey: 'conecta',
          isAcademy: true,
        });
      }

      setTeacherNotifications([...academyItems, ...inboxItems]);
      await markAllNotificationsRead().catch(() => null);
      queryClient.invalidateQueries({ queryKey: ['teacher-notifications-unread'] });
    } catch (_error) {
      setTeacherNotifications([]);
    } finally {
      setLoadingTeacherNotifications(false);
    }
  };

  useEffect(() => {
    if ((!showTeacherMenu && !showTeacherNotifications && !showTeacherQuickSearch) || typeof document === 'undefined') {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (teacherMenuRef.current && !teacherMenuRef.current.contains(event.target)) {
        setShowTeacherMenu(false);
      }
      if (teacherNotificationsRef.current && !teacherNotificationsRef.current.contains(event.target)) {
        setShowTeacherNotifications(false);
      }
      if (teacherQuickSearchRef.current && !teacherQuickSearchRef.current.contains(event.target)) {
        setShowTeacherQuickSearch(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowTeacherMenu(false);
        setShowTeacherNotifications(false);
        setShowTeacherQuickSearch(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showTeacherMenu, showTeacherNotifications, showTeacherQuickSearch]);

  useEffect(() => {
    const studentId = String(pendingGradebookFocus?.studentId || '').trim();
    if (!studentId || !selectedCourseDetail?.students) {
      return;
    }

    const matchedStudent = selectedCourseDetail.students.find(
      (student) => String(student.studentId) === studentId
    );
    if (!matchedStudent) {
      return;
    }

    setGradebookMode('student');
    setGradebookSearch(pendingGradebookFocus.studentName || matchedStudent.name || '');
    setOpenGradebookRows((currentValue) => ({
      ...currentValue,
      [studentId]: true,
    }));
    setPendingGradebookFocus(null);

    if (typeof document !== 'undefined') {
      window.requestAnimationFrame(() => {
        const row = document.querySelector(`[data-gradebook-student-id="${studentId}"]`);
        row?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [pendingGradebookFocus, selectedCourseDetail]);

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
    setCoursesDetailOpen(false);
    setShowCoursesFilter(false);
    setCoursesPage(1);
    setSelectedTimelineDate('');
  }, [activeTeacherSection]);

  useEffect(() => {
    setExpandedGradingComponentKey('');
    setSelectedSubmissionAssignmentId('');
  }, [selectedCourseId]);

  useEffect(() => {
    setExpandedGradingComponentKey('');
  }, [activeCourseWorkspaceTab]);

  useEffect(() => {
    if (activeTeacherSection !== 'academic_management') {
      return;
    }
    setCoursesDetailOpen(false);
    setCoursesPage(1);
    setShowCoursesFilter(false);
  }, [selectedSubjectKey, activeTeacherSection]);

  useEffect(() => {
    setCoursesPage(1);
  }, [coursesSubjectFilter, coursesPageSize, academicCourses.length, visibleCourses.length]);

  useEffect(() => {
    if (coursesPage > coursesTotalPages) {
      setCoursesPage(coursesTotalPages);
    }
  }, [coursesPage, coursesTotalPages]);

  useEffect(() => {
    setSelectedTimelineDate('');
  }, [timelineCourseId, timelineMonth]);

  useEffect(() => {
    setSelectedDashboardCalendarDate('');
  }, [dashboardCalendarMonthKey]);

  useEffect(() => {
    if (activeTeacherSection !== 'dashboard') {
      return;
    }
    if (selectedDashboardCalendarDate) {
      return;
    }
    const todayValue = buildLocalDateValue(new Date());
    const todayInMonth = dashboardCalendarGrid.some((cell) => !cell.empty && cell.dateValue === todayValue);
    if (todayInMonth) {
      setSelectedDashboardCalendarDate(todayValue);
    }
  }, [activeTeacherSection, dashboardCalendarGrid, selectedDashboardCalendarDate]);

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
    const nextRecords = teacherAttendanceQuery.data?.attendance?.records;
    setTeacherAttendanceRecords(Array.isArray(nextRecords) ? nextRecords : []);
    setTeacherAttendanceLocked(Boolean(teacherAttendanceQuery.data?.attendance?.id));
  }, [teacherAttendanceQuery.data]);

  useEffect(() => {
    if (!showDisciplineStudentMenu || typeof document === 'undefined') {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (disciplineStudentComboboxRef.current && !disciplineStudentComboboxRef.current.contains(event.target)) {
        setShowDisciplineStudentMenu(false);
        setDisciplineStudentSearch('');
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowDisciplineStudentMenu(false);
        setDisciplineStudentSearch('');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showDisciplineStudentMenu]);

  useEffect(() => {
    if (activeTeacherSection !== 'school_coexistence') {
      setShowDisciplineStudentMenu(false);
      setDisciplineStudentSearch('');
    }
  }, [activeTeacherSection]);

  useEffect(() => {
    setDisciplineStudentSearch('');
    setShowDisciplineStudentMenu(false);
  }, [teacherDisciplineDraft.courseId]);

  useEffect(() => {
    if (activeTeacherSection !== 'school_coexistence') {
      return;
    }

    if (!courses.length) {
      setTeacherDisciplineDraft((currentDraft) => (
        currentDraft.courseId ? { ...currentDraft, courseId: '', studentId: '' } : currentDraft
      ));
      return;
    }

    setTeacherDisciplineDraft((currentDraft) => {
      if (currentDraft.courseId && courses.some((course) => course.id === currentDraft.courseId)) {
        return currentDraft;
      }
      const nextCourseId = courses[0]?.id || '';
      if (currentDraft.courseId === nextCourseId && !currentDraft.studentId) {
        return currentDraft;
      }
      return { ...currentDraft, courseId: nextCourseId, studentId: '' };
    });
  }, [activeTeacherSection, courses]);

  useEffect(() => {
    if (activeTeacherSection !== 'school_coexistence') {
      return;
    }

    setTeacherDisciplineDraft((currentDraft) => {
      if (!currentDraft.courseId) {
        return currentDraft;
      }

      const nextStudentId = disciplineStudentOptions.some((student) => student.studentId === currentDraft.studentId)
        ? currentDraft.studentId
        : (disciplineStudentOptions[0]?.studentId || '');

      if (currentDraft.studentId === nextStudentId) {
        return currentDraft;
      }

      return { ...currentDraft, studentId: nextStudentId };
    });
  }, [activeTeacherSection, disciplineStudentOptions, teacherDisciplineDraft.courseId]);

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
    if (!activeTimelineDayModal || typeof document === 'undefined') {
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
  }, [activeTimelineDayModal]);

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
      setExpandedAcademicContentTopicKey('');
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
      setExpandedAcademicContentTopicKey('');
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
      const nextFiles = mergedFiles.slice(0, maxMaterialFileCount);
      materialFilesRef.current = nextFiles;
      return nextFiles;
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
    setMaterialFiles((currentFiles) => {
      const nextFiles = currentFiles.filter((_, index) => index !== fileIndex);
      materialFilesRef.current = nextFiles;
      return nextFiles;
    });
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
    materialFilesRef.current = [];
    setExistingMaterialFiles([]);
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

  const openAssignmentSubmissionsFromDashboard = (item) => {
    const course = academicCourses.find((entry) => String(entry.id) === String(item?.courseId));
    if (!course) {
      setNotice({ type: 'error', text: 'No se encontró el curso de esa entrega.' });
      return;
    }

    setActiveIntegralModal('');
    setSelectedAssignmentDetail(null);
    setShowAssignmentComposer(false);
    setActiveTeacherSection('academic_management');
    openAcademicManagementWorkspace(course, 'submissions');
    setSelectedSubmissionAssignmentId(String(item?.postId || ''));
  };

  const closeTeacherQuickSearch = () => {
    setShowTeacherQuickSearch(false);
    setTeacherQuickSearch('');
  };

  const openStudentGradebookFromSearch = (result) => {
    const course = academicCourses.find((entry) => String(entry.id) === String(result.courseId));
    if (!course) {
      setNotice({ type: 'error', text: 'No se encontró el curso de ese alumno.' });
      return;
    }

    const subjectLabel = normalizeSubjectLabel(course.subject);
    const subjectKey = slugifyComponentKey(subjectLabel) || 'subject';

    setShowTeacherMenu(false);
    setShowTeacherNotifications(false);
    setShowTeacherSidebar(false);
    setActiveIntegralModal('');
    setActiveTeacherSection('academic_management');
    setSelectedSubjectKey(subjectKey);
    setSelectedCourseId(course.id);
    setTimelineCourseId(course.id);
    setSelectedPortalGradeKey(getCourseGradeGroupKey(course));
    setShowSelectedCourseWorkspace(true);
    setActiveCourseWorkspaceTab('gradebook');
    setGradebookMode('student');
    setGradebookSearch(result.name || '');
    setPendingGradebookFocus({
      studentId: String(result.studentId || ''),
      studentName: String(result.name || ''),
    });
    closeTeacherQuickSearch();
  };

  const openSectionFromSearch = (sectionKey) => {
    setShowTeacherMenu(false);
    setShowTeacherNotifications(false);
    setShowTeacherSidebar(false);
    setActiveIntegralModal('');
    setActiveTeacherSection(sectionKey === COMERGIO_ACADEMY_PARENT.key ? 'video_tutoriales' : sectionKey);
    closeTeacherQuickSearch();
  };

  const openCourseFromSearch = (courseId) => {
    const course = academicCourses.find((entry) => String(entry.id) === String(courseId));
    if (!course) {
      return;
    }

    setShowTeacherMenu(false);
    setShowTeacherNotifications(false);
    setShowTeacherSidebar(false);
    setActiveIntegralModal('');
    setActiveTeacherSection('courses');
    openCoursesDetail(course);
    closeTeacherQuickSearch();
  };

  const openAssignmentDetail = (item) => {
    const postId = String(item?.postId || item?.id || '');
    const courseCandidates = [
      recentPosts.find((entry) => String(entry.id) === postId),
      selectedCourseAssignmentPosts.find((entry) => String(entry.id) === postId),
      dashboardCalendarPosts.find((entry) => String(entry.id) === postId),
    ].filter(Boolean);
    const post = courseCandidates.reduce((best, candidate) => {
      const bestCount = Array.isArray(best?.attachments) ? best.attachments.length : 0;
      const nextCount = Array.isArray(candidate?.attachments) ? candidate.attachments.length : 0;
      return nextCount > bestCount ? candidate : (best || candidate);
    }, null);
    const courseId = item?.courseId || post?.courseId;
    const course = academicCourses.find((entry) => String(entry.id) === String(courseId));

    if (!post || !course) {
      setNotice({ type: 'error', text: 'No se pudo abrir la asignación. Actualiza el calendario e intenta de nuevo.' });
      return;
    }

    const subjectLabel = normalizeSubjectLabel(course.subject);
    const subjectKey = slugifyComponentKey(subjectLabel) || 'subject';

    setSelectedDashboardCalendarDate('');
    setSelectedTimelineDate('');
    setActiveIntegralModal('');
    setActiveTeacherSection('academic_management');
    setSelectedSubjectKey(subjectKey);
    setSelectedCourseId(course.id);
    setTimelineCourseId(course.id);
    setSelectedPortalGradeKey(getCourseGradeGroupKey(course));
    setShowSelectedCourseWorkspace(true);
    setActiveCourseWorkspaceTab('posts');
    setShowAssignmentComposer(false);
    setSelectedAssignmentDetail({
      ...post,
      id: String(post.id),
      attachments: Array.isArray(post.attachments) ? post.attachments : [],
    });
    queryClient.invalidateQueries({ queryKey: ['campus', 'teacher', 'course', teacherQueryScope, course.id] });
  };

  const closeAssignmentComposer = () => {
    setEditingPostId('');
    setPostDraft(createPostDraft(selectedCourse?.id || ''));
    setMaterialLinks([createMaterialLinkDraft()]);
    setMaterialFiles([]);
    materialFilesRef.current = [];
    setExistingMaterialFiles([]);
    setShowAttachLinkPanel(false);
    setShowAssignmentComposer(false);
    setOpenPostMenuId('');
  };

  const onCreatePost = async (event) => {
    event.preventDefault();
    const filesToUpload = Array.isArray(materialFilesRef.current) && materialFilesRef.current.length > 0
      ? materialFilesRef.current
      : (Array.isArray(materialFiles) ? materialFiles : []);
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
      attachments: buildPreviewAttachments(normalizedLinks, filesToUpload),
      allowStudentSubmission: Boolean(postDraft.allowStudentSubmission),
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
        const hasNewFiles = filesToUpload.length > 0;
        const updatePayloadBase = {
          title: payload.title,
          body: payload.body,
          type: payload.type,
          status: payload.status,
          deliveryMode: payload.deliveryMode,
          materialLinks: normalizedLinks,
          allowStudentSubmission: Boolean(payload.allowStudentSubmission),
        };

        if (payload.deliveryMode === 'date') {
          updatePayloadBase.dueAt = payload.dueAt ? new Date(payload.dueAt).toISOString() : null;
        } else {
          updatePayloadBase.scheduledClassDate = payload.scheduledClassDate || null;
          updatePayloadBase.scheduledClassSession = payload.scheduledClassSession || null;
        }

        if (hasNewFiles) {
          const formData = new FormData();
          Object.entries(updatePayloadBase).forEach(([key, value]) => {
            if (value === null || value === undefined) {
              formData.append(key, '');
              return;
            }
            if (typeof value === 'object') {
              formData.append(key, JSON.stringify(value));
              return;
            }
            formData.append(key, String(value));
          });
          filesToUpload.forEach((file) => {
            formData.append('files', file);
          });
          await updatePostMutation.mutateAsync({ postId: editingPostId, payload: formData });
        } else {
          await updatePostMutation.mutateAsync({ postId: editingPostId, payload: updatePayloadBase });
        }
      } else {
        const selectedCourseForPost = courses.find((course) => course.id === payload.courseId) || selectedCourse || null;
        const hasFiles = filesToUpload.length > 0;

        if (hasFiles) {
          const formData = new FormData();
          formData.append('courseId', payload.courseId);
          formData.append('type', payload.type);
          formData.append('title', payload.title);
          formData.append('body', payload.body);
          formData.append('status', payload.status);
          formData.append('deliveryMode', payload.deliveryMode);
          formData.append('materialLinks', JSON.stringify(normalizedLinks));
          formData.append('allowStudentSubmission', payload.allowStudentSubmission ? 'true' : 'false');
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

          filesToUpload.forEach((file) => {
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
            allowStudentSubmission: Boolean(payload.allowStudentSubmission),
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
      materialFilesRef.current = [];
      setExistingMaterialFiles([]);
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

  const openAssignmentSubmissions = (post) => {
    setOpenPostMenuId('');
    setSelectedAssignmentDetail(null);
    setShowAssignmentComposer(false);
    setSelectedSubmissionAssignmentId(String(post?.id || ''));
    setActiveCourseWorkspaceTab('submissions');
  };

  const onEditPost = (post) => {
    setEditingPostId(post.id);
    setPostDraft(buildPostDraftFromPost(post, selectedCourse?.id || ''));
    setMaterialLinks(buildMaterialLinksFromPost(post));
    setMaterialFiles([]);
    materialFilesRef.current = [];
    setExistingMaterialFiles(buildExistingFileAttachmentsFromPost(post));
    setShowAssignmentComposer(true);
    setOpenPostMenuId('');
    setSelectedAssignmentDetail(null);

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

  const onRefreshGradingStructure = async () => {
    if (!selectedCourse) {
      setNotice({ type: 'error', text: 'Selecciona un curso para actualizar la estructura de notas.' });
      return;
    }

    if (previewEnabled) {
      const previewDetail = previewWorkspace.courseDetails?.[selectedCourse.id] || null;
      setAcademicPeriodDrafts(buildAcademicPeriodDrafts(previewDetail?.course || selectedCourse));
      setSubcomponentDrafts({});
      setNotice({ type: 'success', text: 'Estructura de notas actualizada.' });
      return;
    }

    try {
      const result = await courseDetailQuery.refetch();
      if (result.error) {
        throw result.error;
      }

      const refreshedDetail = result.data;
      if (refreshedDetail?.course) {
        setAcademicPeriodDrafts(buildAcademicPeriodDrafts(refreshedDetail.course));
        setSubcomponentDrafts({});
      }
      setNotice({ type: 'success', text: 'Estructura de notas actualizada con las asignaciones más recientes.' });
    } catch (error) {
      setNotice({
        type: 'error',
        text: error?.response?.data?.message || error?.message || 'No se pudo actualizar la estructura de notas.',
      });
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

  const getAcademicContentTopicExpandKey = (period, periodIndex, topic, topicIndex) => (
    `${period?.periodKey || periodIndex}:${topic?.key || topicIndex}`
  );

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

    const topics = period.topics || [];
    const nextTopic = {
      ...createAcademicContentTopicDraft(topics.length),
      title,
      description,
    };
    const addedTopicKey = getAcademicContentTopicExpandKey(period, periodIndex, nextTopic, topics.length);

    setAcademicContentDrafts((currentDrafts) => currentDrafts.map((currentPeriod, index) => {
      if (index !== periodIndex) {
        return currentPeriod;
      }

      return {
        ...currentPeriod,
        topics: [
          ...(currentPeriod.topics || []),
          nextTopic,
        ],
      };
    }));
    setAcademicContentTopicInputs((currentInputs) => ({
      ...currentInputs,
      [inputKey]: { title: '', description: '', linkTitle: '', linkUrl: '' },
    }));
    setExpandedAcademicContentTopicKey(addedTopicKey);
  };

  const onRemoveAcademicContentTopic = (periodIndex, topicIndex) => {
    const period = academicContentDrafts[periodIndex] || {};
    const topic = (period.topics || [])[topicIndex] || {};
    const expandKey = getAcademicContentTopicExpandKey(period, periodIndex, topic, topicIndex);
    setAcademicContentDrafts((currentDrafts) => currentDrafts.map((currentPeriod, index) => (
      index === periodIndex
        ? { ...currentPeriod, topics: (currentPeriod.topics || []).filter((_, currentTopicIndex) => currentTopicIndex !== topicIndex) }
        : currentPeriod
    )));
    setExpandedAcademicContentTopicKey((currentKey) => (currentKey === expandKey ? '' : currentKey));
  };

  const onChangeAcademicContentTopicField = (periodIndex, topicIndex, field, value) => {
    setAcademicContentDrafts((currentDrafts) => currentDrafts.map((period, index) => {
      if (index !== periodIndex) return period;
      return {
        ...period,
        topics: (period.topics || []).map((topic, currentTopicIndex) => (
          currentTopicIndex === topicIndex ? { ...topic, [field]: value } : topic
        )),
      };
    }));
  };

  const onToggleAcademicContentTopicExpanded = (period, periodIndex, topic, topicIndex) => {
    const expandKey = getAcademicContentTopicExpandKey(period, periodIndex, topic, topicIndex);
    setExpandedAcademicContentTopicKey((currentKey) => (currentKey === expandKey ? '' : expandKey));
  };

  const onToggleAcademicContentTopicCompleted = (periodIndex, topicIndex) => {
    setAcademicContentDrafts((currentDrafts) => currentDrafts.map((period, index) => {
      if (index !== periodIndex) return period;
      return {
        ...period,
        topics: (period.topics || []).map((topic, currentTopicIndex) => {
          if (currentTopicIndex !== topicIndex) return topic;
          const completed = !topic.completed;
          return {
            ...topic,
            completed,
            completedAt: completed ? new Date().toISOString() : null,
          };
        }),
      };
    }));
  };

  const onChangeAcademicContentTopicInput = (period, periodIndex, field, value) => {
    const inputKey = period.periodKey || `period_${periodIndex + 1}`;
    setAcademicContentTopicInputs((currentInputs) => ({
      ...currentInputs,
      [inputKey]: {
        ...(currentInputs[inputKey] || { title: '', description: '', linkTitle: '', linkUrl: '' }),
        [field]: value,
      },
    }));
  };

  const onAddAcademicContentTopicMaterialLink = (periodIndex, topicIndex) => {
    const period = academicContentDrafts[periodIndex] || {};
    const topic = (period.topics || [])[topicIndex] || {};
    const linkDraft = topicLinkDrafts[`${period.periodKey || periodIndex}:${topic.key || topicIndex}`] || createAcademicContentMaterialLinkDraft();
    const url = String(linkDraft.url || '').trim();
    const title = String(linkDraft.title || '').trim() || url;

    if (!url) {
      setNotice({ type: 'error', text: 'Escribe el enlace del material de apoyo.' });
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setNotice({ type: 'error', text: 'El enlace debe empezar por http:// o https://.' });
      return;
    }

    setAcademicContentDrafts((currentDrafts) => currentDrafts.map((currentPeriod, index) => {
      if (index !== periodIndex) return currentPeriod;
      return {
        ...currentPeriod,
        topics: (currentPeriod.topics || []).map((currentTopic, currentTopicIndex) => {
          if (currentTopicIndex !== topicIndex) return currentTopic;
          return {
            ...currentTopic,
            materials: [
              ...(currentTopic.materials || []),
              {
                sourceType: 'link',
                kind: 'link',
                title: title.slice(0, 120),
                url,
                fileName: '',
                mimeType: 'text/uri-list',
                sizeBytes: 0,
                extension: '',
                storage: 'external',
              },
            ],
          };
        }),
      };
    }));
    setTopicLinkDrafts((current) => ({
      ...current,
      [`${period.periodKey || periodIndex}:${topic.key || topicIndex}`]: createAcademicContentMaterialLinkDraft(),
    }));
  };

  const onRemoveAcademicContentTopicMaterial = (periodIndex, topicIndex, materialIndex) => {
    setAcademicContentDrafts((currentDrafts) => currentDrafts.map((period, index) => {
      if (index !== periodIndex) return period;
      return {
        ...period,
        topics: (period.topics || []).map((topic, currentTopicIndex) => {
          if (currentTopicIndex !== topicIndex) return topic;
          return {
            ...topic,
            materials: (topic.materials || []).filter((_, currentMaterialIndex) => currentMaterialIndex !== materialIndex),
          };
        }),
      };
    }));
  };

  const onUploadAcademicContentTopicFiles = async (periodIndex, topicIndex, fileList) => {
    if (!selectedCourse?.id) {
      setNotice({ type: 'error', text: 'Selecciona un grado asignado.' });
      return;
    }
    const selectedFiles = Array.from(fileList || []);
    if (!selectedFiles.length) return;

    const uploadKey = `${periodIndex}:${topicIndex}`;
    setAcademicContentUploadingKey(uploadKey);
    setNotice({ type: '', text: '' });
    try {
      const response = await uploadCampusTeacherAcademicContentMedia(selectedCourse.id, selectedFiles);
      const materials = Array.isArray(response?.materials) ? response.materials : [];
      if (!materials.length) {
        throw new Error('No se pudo subir el material.');
      }
      setAcademicContentDrafts((currentDrafts) => currentDrafts.map((period, index) => {
        if (index !== periodIndex) return period;
        return {
          ...period,
          topics: (period.topics || []).map((topic, currentTopicIndex) => {
            if (currentTopicIndex !== topicIndex) return topic;
            return {
              ...topic,
              materials: [...(topic.materials || []), ...materials],
            };
          }),
        };
      }));
      setNotice({ type: 'success', text: 'Material de apoyo agregado al tema.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo subir el material.' });
    } finally {
      setAcademicContentUploadingKey('');
    }
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
          completed: Boolean(topic.completed),
          completedAt: topic.completed ? (topic.completedAt || new Date().toISOString()) : null,
          materials: Array.isArray(topic.materials) ? topic.materials : [],
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
    setTeacherResourceRequestDraft((currentDraft) => {
      const nextDraft = { ...currentDraft, [field]: value };
      if (field === 'subjectKey') {
        nextDraft.gradeKey = '';
        nextDraft.courseId = '';
      }
      if (field === 'gradeKey') {
        nextDraft.courseId = '';
      }
      if (field === 'materialKey' && value !== '__other__') {
        nextDraft.customMaterialName = '';
      }
      return nextDraft;
    });
  };

  const resetTeacherPlannerDraftForSameCourse = () => {
    setTeacherResourceRequestDraft((currentDraft) => ({
      ...currentDraft,
      materialKey: '',
      customMaterialName: '',
      quantity: '1',
      pendingMaterials: [],
      activityTitle: '',
      purpose: '',
      activityDate: '',
      noMaterialsNeeded: false,
    }));
  };

  const loadTeacherPlannerRequestIntoDraft = (request) => {
    if (!request) {
      setTeacherResourcePlannerActivities([]);
      setEditingTeacherPlannerRequestId('');
      setTeacherResourceRequestDraft(createTeacherResourceRequestDraft());
      return;
    }

    setEditingTeacherPlannerRequestId(request.id || '');
    setTeacherResourceRequestDraft((currentDraft) => ({
      ...currentDraft,
      noMaterialsNeeded: Boolean(request.noMaterialsNeeded),
      subjectKey: '',
      gradeKey: '',
      courseId: '',
      materialKey: '',
      customMaterialName: '',
      quantity: '1',
      pendingMaterials: [],
      activityTitle: '',
      purpose: '',
      activityDate: '',
    }));

    const activities = (Array.isArray(request.plannerActivities) ? request.plannerActivities : []).map((activity, index) => {
      const materials = Array.isArray(activity.materials) && activity.materials.length
        ? activity.materials.map((item) => ({
          materialName: item.materialName || '',
          quantity: Math.max(1, Number(item.quantity || 1)),
        }))
        : (activity.materialName
          ? [{ materialName: activity.materialName, quantity: Math.max(1, Number(activity.quantity || 1)) }]
          : []);
      return {
        key: `${activity.id || index}:${activity.title}`,
        date: toDateInputValue(activity.date),
        title: activity.title || '',
        purpose: activity.purpose || activity.description || '',
        subject: activity.subject || '',
        grade: activity.grade || '',
        courseLabel: activity.courseLabel || '',
        materials,
        materialName: materials[0]?.materialName || '',
        quantity: materials[0]?.quantity || 1,
      };
    });

    if (!activities.length && request.noMaterialsNeeded) {
      setTeacherResourcePlannerActivities([]);
      return;
    }

    if (!activities.length && Array.isArray(request.items) && request.items.length) {
      setTeacherResourcePlannerActivities([{
        key: `legacy-items-${request.id || 'request'}`,
        date: toDateInputValue(request.neededByDate) || getTodayDateInputValue(),
        title: 'Materiales solicitados',
        purpose: request.purpose || '',
        subject: '',
        grade: '',
        courseLabel: request.requestedForArea || '',
        materials: request.items.map((item) => ({
          materialName: item.item?.name || item.customName || 'Material',
          quantity: Math.max(1, Number(item.quantity || 1)),
        })),
        materialName: request.items[0]?.item?.name || request.items[0]?.customName || '',
        quantity: Math.max(1, Number(request.items[0]?.quantity || 1)),
      }]);
      return;
    }

    setTeacherResourcePlannerActivities(activities);
  };

  const onSelectTeacherPlannerCycle = (cycleId) => {
    const nextId = String(cycleId || '');
    if (selectedTeacherPlannerCycleId === nextId) {
      setSelectedTeacherPlannerCycleId('');
      setTeacherPlannerConfirmOpen(false);
      setEditingTeacherPlannerRequestId('');
      setTeacherResourcePlannerActivities([]);
      setTeacherResourceRequestDraft(createTeacherResourceRequestDraft());
      return;
    }

    setSelectedTeacherPlannerCycleId(nextId);
    setTeacherPlannerConfirmOpen(false);
    const existingRequest = getTeacherRequestForCycle(teacherResourceRequests, nextId);
    loadTeacherPlannerRequestIntoDraft(existingRequest);
  };

  const onAddTeacherResourceMaterial = () => {
    if (!isTeacherPlannerEditable) {
      setNotice({ type: 'error', text: 'Este planner ya no se puede editar.' });
      return;
    }
    if (teacherResourceRequestDraft.noMaterialsNeeded) {
      setNotice({ type: 'error', text: 'Desmarca “No necesito material” para agregar materiales.' });
      return;
    }

    const materialName = resolveTeacherDraftMaterialName(teacherResourceRequestDraft);
    const quantity = Math.max(1, Number(teacherResourceRequestDraft.quantity || 0));
    if (!materialName) {
      setNotice({ type: 'error', text: 'Selecciona o escribe el material.' });
      return;
    }

    setTeacherResourceRequestDraft((currentDraft) => ({
      ...currentDraft,
      pendingMaterials: [
        ...(Array.isArray(currentDraft.pendingMaterials) ? currentDraft.pendingMaterials : []),
        {
          key: `${materialName}:${quantity}:${Date.now()}`,
          materialName,
          quantity,
        },
      ],
      materialKey: '',
      customMaterialName: '',
      quantity: '1',
    }));
    setNotice({ type: '', text: '' });
  };

  const onRemoveTeacherResourcePendingMaterial = (materialKey) => {
    if (!isTeacherPlannerEditable) return;
    setTeacherResourceRequestDraft((currentDraft) => ({
      ...currentDraft,
      pendingMaterials: (currentDraft.pendingMaterials || []).filter((item) => item.key !== materialKey),
    }));
  };

  const onAddTeacherResourceActivity = () => {
    if (!isTeacherPlannerEditable) {
      setNotice({ type: 'error', text: 'Este planner ya no se puede editar.' });
      return;
    }

    if (teacherResourceRequestDraft.noMaterialsNeeded) {
      setNotice({ type: 'error', text: 'Desmarca “No necesito material” para agregar actividades.' });
      return;
    }

    const subjectLabel = selectedTeacherPlannerSubject?.label || '';
    const gradeLabel = selectedTeacherPlannerGrade?.label || '';
    const courseLabel = selectedTeacherPlannerCourse
      ? (getCourseGroupLabel(selectedTeacherPlannerCourse) || getCourseDisplayTitle(selectedTeacherPlannerCourse))
      : '';
    const title = String(teacherResourceRequestDraft.activityTitle || '').trim();
    const purpose = String(teacherResourceRequestDraft.purpose || '').trim();
    const date = String(teacherResourceRequestDraft.activityDate || '').trim();
    const minDate = toDateInputValue(selectedTeacherPlannerCycle?.startDate);
    const maxDate = toDateInputValue(selectedTeacherPlannerCycle?.endDate);

    const materials = [...(Array.isArray(teacherResourceRequestDraft.pendingMaterials) ? teacherResourceRequestDraft.pendingMaterials : [])];
    const draftMaterialName = resolveTeacherDraftMaterialName(teacherResourceRequestDraft);
    const draftQuantity = Math.max(1, Number(teacherResourceRequestDraft.quantity || 0));
    if (draftMaterialName) {
      materials.push({
        key: `${draftMaterialName}:${draftQuantity}:${Date.now()}`,
        materialName: draftMaterialName,
        quantity: draftQuantity,
      });
    }

    const normalizedMaterials = materials.map((item) => ({
      materialName: String(item.materialName || '').trim(),
      quantity: Math.max(1, Number(item.quantity || 1)),
    })).filter((item) => item.materialName);

    if (!subjectLabel || !gradeLabel || !courseLabel) {
      setNotice({ type: 'error', text: 'Selecciona asignatura, grado y curso.' });
      return;
    }
    if (!normalizedMaterials.length) {
      setNotice({ type: 'error', text: 'Agrega al menos un material a la actividad.' });
      return;
    }
    if (!title || !purpose || !date) {
      setNotice({ type: 'error', text: 'Completa título, motivo pedagógico y fecha de la actividad.' });
      return;
    }
    if ((minDate && maxDate && minDate > maxDate)) {
      setNotice({ type: 'error', text: 'Este planner tiene fechas invertidas. Pide a Rectoría o Coordinación corregir Desde/Hasta.' });
      return;
    }
    if ((minDate && date < minDate) || (maxDate && date > maxDate)) {
      setNotice({ type: 'error', text: `La fecha debe estar entre ${formatDateLabel(minDate)} y ${formatDateLabel(maxDate)}.` });
      return;
    }

    setTeacherResourcePlannerActivities((currentActivities) => [
      ...currentActivities,
      {
        key: `${date}:${title}:${normalizedMaterials[0].materialName}:${currentActivities.length}`,
        date,
        title,
        purpose,
        subject: subjectLabel,
        grade: gradeLabel,
        courseLabel,
        materials: normalizedMaterials,
        materialName: normalizedMaterials[0].materialName,
        quantity: normalizedMaterials[0].quantity,
      },
    ]);
    resetTeacherPlannerDraftForSameCourse();
  };

  const onRemoveTeacherResourceActivity = (activityKey) => {
    if (!isTeacherPlannerEditable) return;
    setTeacherResourcePlannerActivities((currentActivities) => (
      currentActivities.filter((activity) => activity.key !== activityKey)
    ));
  };

  const buildTeacherPlannerPayload = () => {
    const noMaterialsNeeded = Boolean(teacherResourceRequestDraft.noMaterialsNeeded);
    const plannerActivities = noMaterialsNeeded
      ? []
      : teacherResourcePlannerActivities.map((activity) => {
        const materials = Array.isArray(activity.materials) && activity.materials.length
          ? activity.materials.map((item) => ({
            materialName: item.materialName,
            quantity: Math.max(1, Number(item.quantity || 1)),
          }))
          : [{
            materialName: activity.materialName,
            quantity: Math.max(1, Number(activity.quantity || 1)),
          }];
        return {
          date: activity.date,
          title: activity.title,
          description: activity.purpose,
          purpose: activity.purpose,
          subject: activity.subject,
          grade: activity.grade,
          courseLabel: activity.courseLabel,
          materials,
          materialName: materials[0]?.materialName || '',
          quantity: materials[0]?.quantity || 1,
        };
      });

    const areaParts = Array.from(new Set(
      teacherResourcePlannerActivities
        .map((activity) => [activity.subject, activity.grade, activity.courseLabel].filter(Boolean).join(' · '))
        .filter(Boolean)
    ));

    const flattenedItems = plannerActivities.flatMap((activity) => (
      (activity.materials || []).map((material) => ({
        customName: material.materialName,
        quantity: material.quantity,
      }))
    ));

    return {
      requestType: 'material',
      plannerCycleId: selectedTeacherPlannerCycleId,
      noMaterialsNeeded,
      requestedForArea: areaParts.join(' | ') || selectedTeacherPlannerCycle?.title || '',
      purpose: noMaterialsNeeded
        ? 'No necesito material para este periodo.'
        : (teacherResourcePlannerActivities[0]?.purpose || 'Planner docente'),
      plannerActivities,
      items: noMaterialsNeeded ? [] : flattenedItems,
    };
  };

  const onSubmitTeacherResourceRequest = async () => {
    if (!selectedTeacherPlannerCycleId) {
      setNotice({ type: 'error', text: 'Selecciona un planner activo.' });
      return;
    }
    if (!isTeacherPlannerEditable) {
      setNotice({ type: 'error', text: 'La fecha límite ya venció o el planner ya no es editable.' });
      return;
    }

    const noMaterialsNeeded = Boolean(teacherResourceRequestDraft.noMaterialsNeeded);
    if (!noMaterialsNeeded && teacherResourcePlannerActivities.length === 0) {
      setNotice({ type: 'error', text: 'Agrega al menos una actividad o marca que no necesitas material.' });
      return;
    }

    try {
      const wasReturnedForCorrection = selectedTeacherPlannerRequest?.status === 'returned_for_correction';
      await createTeacherResourceRequestMutation.mutateAsync({
        requestId: editingTeacherPlannerRequestId || selectedTeacherPlannerRequest?.id || '',
        payload: buildTeacherPlannerPayload(),
      });
      setTeacherPlannerConfirmOpen(false);
      setNotice({
        type: 'success',
        text: editingTeacherPlannerRequestId || selectedTeacherPlannerRequest?.id
          ? (wasReturnedForCorrection
            ? 'Planner corregido y reenviado a coordinación.'
            : 'Planner actualizado correctamente.')
          : 'Planner enviado a coordinación.',
      });
      const refreshed = await teacherResourceRequestsQuery.refetch();
      const nextRequests = refreshed?.data?.data?.requests || refreshed?.data?.requests || [];
      const nextRequest = getTeacherRequestForCycle(nextRequests, selectedTeacherPlannerCycleId);
      loadTeacherPlannerRequestIntoDraft(nextRequest);
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo enviar el planner.' });
    }
  };

  const onTeacherSocialPublicationDraftChange = (field, value) => {
    setTeacherSocialPublicationDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
      ...(field === 'subjectKey' ? { courseId: '' } : {}),
    }));
  };

  const uploadTeacherSocialMediaFiles = async (files, { fromCamera = false } = {}) => {
    const selectedFiles = Array.from(files || []).filter((file) => {
      const mimeType = String(file?.type || '').split(';')[0].trim().toLowerCase();
      const fileName = String(file?.name || '').toLowerCase();
      return (
        mimeType.startsWith('image/')
        || mimeType.startsWith('video/')
        || /\.(jpe?g|png|gif|webp|heic|heif|mp4|m4v|mov|webm)$/i.test(fileName)
      );
    }).map((file) => {
      const mimeType = String(file?.type || '').split(';')[0].trim().toLowerCase();
      if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
        return mimeType === file.type ? file : new File([file], file.name, { type: mimeType, lastModified: file.lastModified || Date.now() });
      }
      const fileName = String(file?.name || '').toLowerCase();
      const inferredType = /\.(png)$/i.test(fileName)
        ? 'image/png'
        : /\.(webp)$/i.test(fileName)
          ? 'image/webp'
          : /\.(gif)$/i.test(fileName)
            ? 'image/gif'
            : /\.(webm)$/i.test(fileName)
              ? 'video/webm'
              : /\.(mov)$/i.test(fileName)
                ? 'video/quicktime'
                : /\.(mp4|m4v)$/i.test(fileName)
                  ? 'video/mp4'
                  : /\.(jpe?g|heic|heif)$/i.test(fileName)
                    ? 'image/jpeg'
                    : '';
      return inferredType
        ? new File([file], file.name || `media-${Date.now()}.bin`, { type: inferredType, lastModified: file.lastModified || Date.now() })
        : file;
    });
    if (selectedFiles.length === 0) {
      const message = 'Solo se pueden subir fotos o videos para publicaciones.';
      setNotice({ type: 'error', text: message });
      throw new Error(message);
    }

    if ((teacherSocialPublicationDraft.media || []).length + selectedFiles.length > 8) {
      const message = 'Puedes adjuntar hasta 8 fotos o videos por publicación.';
      setNotice({ type: 'error', text: message });
      throw new Error(message);
    }

    setTeacherSocialMediaUploading(true);
    try {
      const uploadedMedia = [];
      for (let startIndex = 0; startIndex < selectedFiles.length; startIndex += 6) {
        const response = await uploadCampusTeacherParentFeedMedia(selectedFiles.slice(startIndex, startIndex + 6));
        uploadedMedia.push(...(response.media || []));
      }
      setTeacherSocialPublicationDraft((currentDraft) => ({
        ...currentDraft,
        media: [...(currentDraft.media || []), ...uploadedMedia].slice(0, 8),
      }));
      if (fromCamera) {
        setActiveTeacherSection('social_publications');
        setShowSelectedCourseWorkspace(false);
        setShowTeacherSidebar(false);
        setShowTeacherCamera(false);
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      }
      setNotice({
        type: 'success',
        text: selectedFiles.length === 1
          ? 'Contenido precargado en la publicación.'
          : `${selectedFiles.length} archivos precargados en la publicación.`,
      });
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'No se pudo subir el archivo.';
      if (!fromCamera) {
        setNotice({ type: 'error', text: message });
      }
      throw new Error(message);
    } finally {
      setTeacherSocialMediaUploading(false);
    }
  };

  const onTeacherSocialMediaSelected = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';

    try {
      await uploadTeacherSocialMediaFiles(selectedFiles);
    } catch (_error) {
      // The notice above keeps the upload error visible in the portal.
    }
  };

  const onTeacherSocialMediaDrop = async (event) => {
    event.preventDefault();
    setTeacherSocialMediaDragActive(false);
    if (teacherSocialMediaUploading || (teacherSocialPublicationDraft.media || []).length >= 8) {
      return;
    }

    try {
      await uploadTeacherSocialMediaFiles(Array.from(event.dataTransfer?.files || []));
    } catch (_error) {
      // The notice above keeps the upload error visible in the portal.
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

    if (!teacherSocialPublicationDraft.subjectKey) {
      setNotice({ type: 'error', text: 'Selecciona la asignatura.' });
      return;
    }

    if (!teacherSocialPublicationDraft.courseId || !selectedSocialPublicationCourse) {
      setNotice({ type: 'error', text: 'Selecciona el curso destinatario.' });
      return;
    }

    if (!title || !body) {
      setNotice({ type: 'error', text: 'Escribe un título y una descripción para enviar la publicación.' });
      return;
    }

    const courseGroupLabel = getCourseGroupLabel(selectedSocialPublicationCourse);
    const subjectLabel = normalizeSubjectLabel(selectedSocialPublicationCourse.subject)
      || selectedSocialPublicationSubject?.label
      || '';

    try {
      await createTeacherSocialPublicationMutation.mutateAsync({
        courseId: teacherSocialPublicationDraft.courseId,
        title,
        body,
        emailSubject: title,
        audienceType: 'course',
        subject: subjectLabel,
        courseTargets: [
          courseGroupLabel,
          selectedSocialPublicationCourse.title,
          selectedSocialPublicationCourse.studentGradeKey,
          selectedSocialPublicationCourse.gradeLevel,
          selectedSocialPublicationCourse.section,
          `${selectedSocialPublicationCourse.gradeLevel || ''}${selectedSocialPublicationCourse.section || ''}`,
          `${selectedSocialPublicationCourse.studentGradeKey || ''}${selectedSocialPublicationCourse.section || ''}`,
        ].filter(Boolean),
        gradeTargets: [selectedSocialPublicationCourse.studentGradeKey, selectedSocialPublicationCourse.gradeLevel].filter(Boolean),
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
    if (field === 'courseId') {
      setDisciplineStudentSearch('');
      setShowDisciplineStudentMenu(false);
    }
  };

  const onSelectDisciplineStudent = (student) => {
    onTeacherDisciplineDraftChange('studentId', student?.studentId || '');
    setDisciplineStudentSearch('');
    setShowDisciplineStudentMenu(false);
  };

  const onSubmitTeacherDisciplineObservation = async (event) => {
    event.preventDefault();

    const observationText = String(teacherDisciplineDraft.observation || '').trim();
    const incidentDate = String(teacherDisciplineDraft.incidentDate || '').trim();
    const incidentTime = String(teacherDisciplineDraft.incidentTime || '').trim();
    const destination = teacherDisciplineDraft.destination === 'wellbeing' ? 'wellbeing' : 'coexistence';
    if (!teacherDisciplineDraft.courseId) {
      setNotice({ type: 'error', text: 'Selecciona el curso donde observaste la situación.' });
      return;
    }
    if (!teacherDisciplineDraft.studentId) {
      setNotice({ type: 'error', text: 'Selecciona el alumno correspondiente.' });
      return;
    }
    if (destination === 'coexistence' && teacherCoexistenceInfractions.length > 0 && !String(teacherDisciplineDraft.infractionKey || '').trim()) {
      setNotice({ type: 'error', text: 'Selecciona el tipo de falta definido por Rectoría.' });
      return;
    }
    if (!incidentDate || !incidentTime) {
      setNotice({ type: 'error', text: 'Indica la fecha y hora del caso.' });
      return;
    }
    const incidentAtDate = new Date(`${incidentDate}T${incidentTime}:00`);
    if (Number.isNaN(incidentAtDate.getTime())) {
      setNotice({ type: 'error', text: 'La fecha y hora del caso no son válidas.' });
      return;
    }
    if (observationText.length < 8) {
      setNotice({ type: 'error', text: 'Escribe una observación de comportamiento más detallada.' });
      return;
    }

    try {
      if (previewEnabled) {
        setNotice({ type: 'success', text: 'Observación registrada en vista previa.' });
        setTeacherDisciplineDraft((currentDraft) => ({
          ...currentDraft,
          observation: '',
          incidentDate: getTodayDateInputValue(),
          incidentTime: getNowTimeInputValue(),
        }));
        return;
      }

      await createTeacherDisciplineObservationMutation.mutateAsync({
        destination,
        courseId: teacherDisciplineDraft.courseId,
        studentId: teacherDisciplineDraft.studentId,
        observation: observationText,
        infractionKey: destination === 'coexistence' ? teacherDisciplineDraft.infractionKey : '',
        incidentDate,
        incidentTime,
        incidentAt: incidentAtDate.toISOString(),
      });
      setTeacherDisciplineDraft((currentDraft) => ({
        ...currentDraft,
        observation: '',
        infractionKey: '',
        incidentDate: getTodayDateInputValue(),
        incidentTime: getNowTimeInputValue(),
      }));
      setNotice({
        type: 'success',
        text: destination === 'wellbeing'
          ? 'Observación enviada a Bienestar / Psicología.'
          : 'Observación enviada a Convivencia (Coordinación, Dirección y Rectoría).',
      });
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'No se pudo enviar la observación de convivencia.' });
    }
  };

  const onSaveGradingScheme = async (
    draftsOverride = null,
    successMessage = 'Períodos y esquema de calificación actualizados.',
    options = {},
  ) => {
    const { strictTotals = true, silentNotices = false } = options;
    // Cuando el caller muestra su propio modal (gradebookSaveModal), evitamos
    // duplicar el aviso con DismissibleNotice.
    const failValidation = (error) => {
      if (!silentNotices) {
        setNotice({ type: 'error', text: error });
      }
      return { ok: false, error };
    };
    if (!selectedCourse) {
      return failValidation('Selecciona un curso asignado.');
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
          targetType: subcomponent.targetType === 'students' ? 'students' : 'course',
          targetStudentIds: Array.isArray(subcomponent.targetStudentIds) ? subcomponent.targetStudentIds.map(String) : [],
        })).filter((subcomponent) => Boolean(subcomponent.name)),
      })),
    }));

    if (normalizedPeriods.length === 0) {
      const error = 'Agrega al menos un período académico.';
      return failValidation(error);
    }

    if (normalizedPeriods.some((period) => !period.name || !period.key)) {
      const error = 'Cada periodo necesita nombre y clave valida.';
      return failValidation(error);
    }

    if (new Set(normalizedPeriods.map((period) => period.key)).size !== normalizedPeriods.length) {
      const error = 'Las claves de los periodos no pueden repetirse.';
      return failValidation(error);
    }

    if (normalizedPeriods.some((period) => !Number.isFinite(period.weight) || period.weight <= 0)) {
      const error = 'Cada periodo debe tener un porcentaje mayor que cero.';
      return failValidation(error);
    }

    const weightTotal = normalizedPeriods.reduce((total, period) => total + period.weight, 0);
    if (strictTotals && Math.abs(weightTotal - 100) > 0.001) {
      const error = 'La ponderacion de los periodos debe sumar 100%.';
      return failValidation(error);
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).length === 0)) {
      const error = 'Cada periodo debe tener al menos un componente de evaluacion.';
      return failValidation(error);
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).some((component) => !component.name || !component.key))) {
      const error = 'Cada componente necesita nombre y clave valida.';
      return failValidation(error);
    }

    if (normalizedPeriods.some((period) => new Set((period.gradingComponents || []).map((component) => component.key)).size !== (period.gradingComponents || []).length)) {
      const error = 'Dentro de cada periodo las claves de los componentes no pueden repetirse.';
      return failValidation(error);
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).some((component) => !Number.isFinite(component.weight) || component.weight <= 0))) {
      const error = 'Cada componente debe tener un porcentaje mayor que cero.';
      return failValidation(error);
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).some((component) => (component.subcomponents || []).some((subcomponent) => !subcomponent.name || !subcomponent.key)))) {
      const error = 'Cada subcomponente necesita nombre y clave valida.';
      return failValidation(error);
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).some((component) => new Set((component.subcomponents || []).map((subcomponent) => subcomponent.key)).size !== (component.subcomponents || []).length))) {
      const error = 'Dentro de cada componente las claves de los subcomponentes no pueden repetirse.';
      return failValidation(error);
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).some((component) => (component.subcomponents || []).some((subcomponent) => !Number.isFinite(subcomponent.weight) || subcomponent.weight <= 0)))) {
      const error = 'Cada subcomponente debe tener un porcentaje mayor que cero.';
      return failValidation(error);
    }

    if (normalizedPeriods.some((period) => (period.gradingComponents || []).some((component) => (component.subcomponents || []).reduce((total, subcomponent) => total + subcomponent.weight, 0) > 100.001))) {
      const error = 'Dentro de cada componente los subcomponentes no pueden superar 100%.';
      return failValidation(error);
    }

    if (strictTotals && normalizedPeriods.some((period) => Math.abs((period.gradingComponents || []).reduce((total, component) => total + component.weight, 0) - 100) > 0.001)) {
      const error = 'Dentro de cada periodo los componentes deben sumar 100%.';
      return failValidation(error);
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

      if (!silentNotices) {
        setNotice({ type: 'success', text: successMessage });
      }
      return { ok: true };
    } catch (error) {
      const errorText = error?.response?.data?.message || error?.message || 'No se pudo guardar la estructura academica.';
      if (!silentNotices) {
        setNotice({ type: 'error', text: errorText });
      }
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
            const audience = resolveAssignmentAudience({
              ...subcomponent,
              subcomponentName: subcomponent.name,
            }, selectedCourseAssignmentPosts);
            if (!campusAudienceAppliesToStudent(audience, student.studentId)) {
              return null;
            }
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

    const submittedStudentGrades = selectedGradebookAssignmentStudents.map((student) => {
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
      <DismissibleNotice
        onClose={() => setNotice({ type: 'info', text: '' })}
        text={notice.text}
        type={notice.type}
        variant="modal"
      />
      <TeacherCameraCapture
        isOpen={showTeacherCamera}
        onClose={() => setShowTeacherCamera(false)}
        onFilesReady={(files) => uploadTeacherSocialMediaFiles(files, { fromCamera: true })}
      />

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

      {activeTimelineDayModal ? (
        <div className="campus-teacher__timeline-modal-backdrop" onClick={() => setSelectedTimelineDate('')} role="presentation">
          <div
            aria-label={`Programación del ${activeTimelineDayModal.formattedDate}`}
            aria-modal="true"
            className="campus-teacher__timeline-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="campus-teacher__timeline-modal-head">
              <div>
                <span className="campus-panel__kicker">Programación del día</span>
                <h3>{activeTimelineDayModal.formattedDate}</h3>
              </div>
              <button className="campus-teacher__ghost-btn" onClick={() => setSelectedTimelineDate('')} type="button">
                Cerrar
              </button>
            </div>
            <div className="campus-teacher__timeline-modal-body">
              {activeTimelineDayModal.items.length > 0 ? activeTimelineDayModal.items.map((item) => (
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

      <button
        aria-label="Cerrar menú del portal docente"
        className={`campus-teacher__sidebar-backdrop${showTeacherSidebar ? ' is-visible' : ''}`}
        onClick={() => setShowTeacherSidebar(false)}
        type="button"
      />

      <div className={`campus-teacher__frame${isTeacherRailCollapsed ? ' is-rail-collapsed' : ''}`}>
        <aside className={`campus-teacher__sidebar campus-teacher__rail${showTeacherSidebar ? ' is-open' : ''}`}>
          <div className="campus-teacher__rail-brand">
            <div className="campus-teacher__rail-brand-copy">
              <img alt="Comergio" className="campus-teacher__rail-brand-logo" src={colibriLogo} />
              <div>
                <strong>Comergio</strong>
                <span>Conectamos tu colegio</span>
              </div>
            </div>
            <button
              aria-label="Replegar menú"
              className="campus-teacher__rail-brand-toggle campus-teacher__rail-brand-toggle--collapse"
              onClick={() => setIsTeacherRailCollapsed(true)}
              type="button"
            >
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="M15 6 9 12l6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
              </svg>
            </button>
            <button
              aria-label="Cerrar menú"
              className="campus-teacher__rail-brand-toggle campus-teacher__rail-brand-toggle--close"
              onClick={() => setShowTeacherSidebar(false)}
              type="button"
            >
              <span />
              <span />
              <span />
            </button>
          </div>

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
                      const isSubjectExpandable = option.key === 'academic_management' || option.key === 'academic_content';
                      const isActive = activeTeacherSection === option.key
                        || (option.key === COMERGIO_ACADEMY_PARENT.key && activeTeacherSection === 'video_tutoriales');
                      const navLabel = resolveTeacherNavLabel(option);
                      const academyChildCount = option.key === 'conecta'
                        ? academyCounts.conecta
                        : option.key === 'informa'
                          ? academyCounts.informa
                          : 0;

                      if (isSubjectExpandable) {
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
                              <span className="campus-teacher__nav-item-label">{navLabel}</span>
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
                                        setActiveTeacherSection(option.key);
                                        setShowTeacherSidebar(false);
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
                          className={`campus-teacher__nav-item${isActive ? ' is-active' : ''}${option.key === 'conecta' ? ' tone-conecta' : ''}${option.key === 'informa' ? ' tone-informa' : ''}${option.key === COMERGIO_ACADEMY_PARENT.key ? ' tone-academy' : ''}`}
                          key={option.key}
                          onClick={() => {
                            setShowSelectedCourseWorkspace(false);
                            setActiveTeacherSection(option.key === COMERGIO_ACADEMY_PARENT.key ? 'video_tutoriales' : option.key);
                            setShowTeacherSidebar(false);
                          }}
                          type="button"
                        >
                          <span className="campus-teacher__nav-item-icon">
                            <TeacherSectionIcon icon={option.icon} />
                          </span>
                          <span className="campus-teacher__nav-item-label">
                            {navLabel}
                            {option.key === 'resource_requests' && teacherPlannerPendingCount > 0 ? (
                              <span className="campus-teacher__nav-badge" aria-label={`${teacherPlannerPendingCount} planner(s) pendientes`}>
                                {teacherPlannerPendingCount}
                              </span>
                            ) : null}
                            {option.key === 'staff_announcements' ? (
                              <StaffAnnouncementsUnreadBadge count={staffAnnouncementsUnreadCount} />
                            ) : null}
                            {academyChildCount > 0 ? (
                              <AcademyNotificationBadge count={academyChildCount} />
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="campus-teacher__rail-school">
            <div className="campus-teacher__rail-school-main">
              <span className="campus-teacher__rail-school-icon" aria-hidden="true">
                <svg fill="none" viewBox="0 0 24 24">
                  <path d="M12 3 4.5 6.5v4.2c0 4.6 3.1 8.8 7.5 10.3 4.4-1.5 7.5-5.7 7.5-10.3V6.5L12 3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
                  <path d="M9.5 12.2 11 13.7l3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                </svg>
              </span>
              <div>
                <strong>{schoolDisplayName}</strong>
                <span>{academicYearLabel}</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="campus-teacher__main-column">
          <header className="campus-teacher__topbar">
            <button
              aria-expanded={!isTeacherRailCollapsed || showTeacherSidebar}
              aria-label={isTeacherRailCollapsed ? 'Expandir menú del portal docente' : 'Abrir menú del portal docente'}
              className={`campus-teacher__mobile-menu-button${isTeacherRailCollapsed ? ' is-rail-expand' : ''}`}
              onClick={() => {
                if (isTeacherRailCollapsed) {
                  setIsTeacherRailCollapsed(false);
                  return;
                }
                setShowTeacherSidebar(true);
              }}
              type="button"
            >
              <span />
              <span />
              <span />
            </button>

            <div className="campus-teacher__topbar-search" ref={teacherQuickSearchRef}>
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="m20 20-3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              </svg>
              <input
                aria-autocomplete="list"
                aria-expanded={showTeacherQuickSearch && Boolean(teacherQuickSearchQuery)}
                aria-label="Buscar alumno, curso o sección"
                onChange={(event) => {
                  setTeacherQuickSearch(event.target.value);
                  setShowTeacherQuickSearch(true);
                  setShowTeacherMenu(false);
                  setShowTeacherNotifications(false);
                }}
                onFocus={() => {
                  setShowTeacherQuickSearch(true);
                  setShowTeacherMenu(false);
                  setShowTeacherNotifications(false);
                }}
                placeholder="Buscar alumno, curso o sección..."
                type="search"
                value={teacherQuickSearch}
              />
              {showTeacherQuickSearch && teacherQuickSearchQuery ? (
                <div className="campus-teacher__topbar-search-results" role="listbox">
                  {!hasTeacherQuickSearchResults ? (
                    <p className="campus-teacher__topbar-search-empty">Sin resultados para “{teacherQuickSearch.trim()}”.</p>
                  ) : null}

                  {teacherQuickSearchResults.students.length > 0 ? (
                    <div className="campus-teacher__topbar-search-group">
                      <span>Alumnos · calificaciones</span>
                      {teacherQuickSearchResults.students.map((result) => (
                        <button
                          className="campus-teacher__topbar-search-item"
                          key={result.key}
                          onClick={() => openStudentGradebookFromSearch(result)}
                          type="button"
                        >
                          <strong>{result.name}</strong>
                          <span>
                            {[result.courseLabel, result.grade || result.schoolCode].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {teacherQuickSearchResults.sections.length > 0 ? (
                    <div className="campus-teacher__topbar-search-group">
                      <span>Secciones</span>
                      {teacherQuickSearchResults.sections.map((result) => (
                        <button
                          className="campus-teacher__topbar-search-item"
                          key={result.key}
                          onClick={() => openSectionFromSearch(result.sectionKey)}
                          type="button"
                        >
                          <strong>{result.label}</strong>
                          <span>{result.description}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {teacherQuickSearchResults.courses.length > 0 ? (
                    <div className="campus-teacher__topbar-search-group">
                      <span>Cursos</span>
                      {teacherQuickSearchResults.courses.map((result) => (
                        <button
                          className="campus-teacher__topbar-search-item"
                          key={result.key}
                          onClick={() => openCourseFromSearch(result.courseId)}
                          type="button"
                        >
                          <strong>{result.label}</strong>
                          <span>{result.description}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="campus-teacher__topbar-actions">
              <div className="campus-teacher__topbar-icon-wrap" ref={teacherNotificationsRef}>
                <button
                  aria-label="Notificaciones"
                  className="campus-teacher__topbar-icon-btn"
                  onClick={openTeacherNotifications}
                  type="button"
                >
                  <svg fill="none" viewBox="0 0 24 24">
                    <path d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22Z" fill="currentColor" />
                    <path d="M18.4 16.2V11a6.4 6.4 0 1 0-12.8 0v5.2L4 18.8V20h16v-1.2l-1.6-2.6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
                  </svg>
                  {topbarNotificationsBadgeCount > 0 ? (
                    <span className="campus-teacher__topbar-badge">
                      {topbarNotificationsBadgeCount > 99 ? '99+' : topbarNotificationsBadgeCount}
                    </span>
                  ) : null}
                </button>

                {showTeacherNotifications ? (
                  <div className="campus-teacher__topbar-dropdown campus-teacher__topbar-dropdown--notifications" role="dialog">
                    <header>
                      <strong>Notificaciones</strong>
                      <span>Alertas generales y Comergio Academy</span>
                    </header>
                    <div className="campus-teacher__topbar-dropdown-list">
                      {loadingTeacherNotifications ? <p>Cargando...</p> : null}
                      {!loadingTeacherNotifications && teacherNotifications.length === 0 ? (
                        <p>No tienes notificaciones nuevas.</p>
                      ) : null}
                      {teacherNotifications.slice(0, 8).map((item) => (
                        item.isAcademy ? (
                          <button
                            className="campus-teacher__topbar-dropdown-item campus-teacher__topbar-dropdown-item--academy"
                            key={item.id}
                            onClick={() => openTeacherAcademySection(item.sectionKey)}
                            type="button"
                          >
                            <strong>{item.title || 'Notificación'}</strong>
                            <span>{item.body || item.message || ''}</span>
                          </button>
                        ) : (
                          <article key={item.id || item._id || `${item.title}-${item.createdAt}`}>
                            <strong>{item.title || 'Notificación'}</strong>
                            <span>{item.body || item.message || ''}</span>
                          </article>
                        )
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                aria-label="Comunicados internos"
                className="campus-teacher__topbar-icon-btn"
                onClick={() => {
                  setShowTeacherNotifications(false);
                  setActiveTeacherSection('staff_announcements');
                }}
                type="button"
              >
                <svg fill="none" viewBox="0 0 24 24">
                  <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" stroke="currentColor" strokeWidth="1.7" />
                  <path d="m5 7 7 5 7-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                </svg>
                {staffAnnouncementsUnreadCount > 0 ? (
                  <span className="campus-teacher__topbar-badge">
                    {staffAnnouncementsUnreadCount > 99 ? '99+' : staffAnnouncementsUnreadCount}
                  </span>
                ) : null}
              </button>

              <div className="campus-teacher__topbar-profile" ref={teacherMenuRef}>
                <button
                  aria-expanded={showTeacherMenu}
                  aria-haspopup="menu"
                  className="campus-teacher__topbar-profile-btn"
                  onClick={() => {
                    setShowTeacherNotifications(false);
                    setShowTeacherMenu((currentValue) => !currentValue);
                  }}
                  type="button"
                >
                  <span
                    className="campus-teacher__topbar-avatar"
                    onClick={(event) => {
                      event.stopPropagation();
                      teacherPhotoInputRef.current?.click();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        teacherPhotoInputRef.current?.click();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {teacherPhotoPreview ? (
                      <img
                        alt={teacherName}
                        onError={() => setTeacherPhotoPreview('')}
                        src={resolveApiAssetUrl(teacherPhotoPreview)}
                      />
                    ) : (
                      <span>{String(teacherName || 'D').slice(0, 1).toUpperCase()}</span>
                    )}
                  </span>
                  <span className="campus-teacher__topbar-profile-copy">
                    <strong>{teacherName}</strong>
                    <span>Docente</span>
                  </span>
                  <svg aria-hidden="true" className="campus-teacher__topbar-chevron" fill="none" viewBox="0 0 24 24">
                    <path d="m7 10 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  </svg>
                </button>
                <input
                  accept="image/*"
                  className="campus-teacher__hero-file-input"
                  disabled={uploadTeacherPhotoMutation.isPending}
                  onChange={onTeacherPhotoChange}
                  ref={teacherPhotoInputRef}
                  type="file"
                />

                {showTeacherMenu ? (
                  <div className="campus-teacher__topbar-dropdown" role="menu">
                    <button className="campus-teacher__topbar-dropdown-item" onClick={() => teacherPhotoInputRef.current?.click()} role="menuitem" type="button">
                      Actualizar foto
                    </button>
                    <button className="campus-teacher__topbar-dropdown-item" onClick={onLogout} role="menuitem" type="button">
                      Cerrar sesión
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <div className="campus-teacher__workspace">
            <section className="campus-teacher__course-deck campus-teacher__panel-surface">
              <div className="campus-teacher__section-head" hidden={activeTeacherSection === 'conecta' || activeTeacherSection === 'dashboard' || activeTeacherSection === 'schedule' || activeTeacherSection === 'courses' || activeTeacherSection === 'academic_management' || isAttendanceLikeSection || activeTeacherSection === 'school_coexistence'}>
                <div>
                  <span className="campus-panel__kicker">{activeSectionLabel}</span>
                  <h2>{activeSectionDescription}</h2>
                </div>
              </div>

            {activeTeacherSection === 'courses' || (activeTeacherSection === 'academic_management' && !showSelectedCourseWorkspace) ? (
              <div className="campus-teacher__courses-stage">
                {activeTeacherSection === 'courses' && coursesDetailOpen && timelineCourse ? (
                  <div className="campus-teacher__cursos-detail">
                    <div className="campus-teacher__cursos-detail-actions">
                      <button className="campus-teacher__ghost-btn campus-teacher__back-btn" onClick={closeCoursesDetail} type="button">
                        Volver a cursos
                      </button>
                    </div>

                    <article className="campus-teacher__cursos-cronograma campus-teacher__embedded-panel">
                      <div className="campus-teacher__cursos-cronograma-top">
                        <div>
                          <h3>Cronograma de actividades</h3>
                          <p className="campus-teacher__cursos-cronograma-course">{getCourseDisplayTitle(timelineCourse)}</p>
                          <p className="campus-panel__meta">Revisa tu calendario mensual de clases, tareas, proyectos, exámenes y materiales publicados.</p>
                        </div>
                        <div className="campus-teacher__cursos-cronograma-nav">
                          <button className="campus-teacher__ghost-btn" onClick={() => setTimelineMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} type="button">
                            ← Mes anterior
                          </button>
                          <button
                            className="campus-teacher__ghost-btn campus-teacher__cursos-today-btn"
                            onClick={() => {
                              const now = new Date();
                              setTimelineMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                              setSelectedTimelineDate(buildLocalDateValue(now));
                            }}
                            type="button"
                          >
                            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                              <rect height="16" rx="2" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="5" />
                              <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                            </svg>
                            Hoy
                          </button>
                          <button className="campus-teacher__ghost-btn" onClick={() => setTimelineMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} type="button">
                            Mes siguiente →
                          </button>
                        </div>
                      </div>

                      {!previewEnabled && timelineCourseDetailQuery.isLoading ? <p className="campus-panel__meta">Cargando cronograma del curso...</p> : null}
                      {!previewEnabled && timelineCourseDetailQuery.isError ? <p className="campus-panel__meta">No se pudo cargar el cronograma completo del curso.</p> : null}

                      <div className="campus-teacher__activity-calendar-shell campus-teacher__cursos-calendar-shell">
                        <div className="campus-teacher__activity-calendar-header">
                          <strong>{formatMonthLabel(timelineMonth)}</strong>
                        </div>
                        <div className="campus-teacher__activity-calendar-grid" role="list" aria-label={`Cronograma del curso ${getCourseDisplayTitle(timelineCourse)} para ${formatMonthLabel(timelineMonth)}`}>
                          {weekdayShortLabels.map((label) => (
                            <div className="campus-teacher__activity-calendar-weekday" key={`course-detail-weekday-${label}`} role="listitem" aria-hidden="true">
                              {label}
                            </div>
                          ))}
                          {timelineCourseCalendar.map((cell) => {
                            if (cell.empty) {
                              return <div className="campus-teacher__activity-calendar-empty" key={cell.key} aria-hidden="true" />;
                            }
                            const activityCount = (cell.items || []).filter((item) => item.kind === 'activity').length;
                            const classCount = (cell.items || []).filter((item) => item.kind === 'class').length;
                            return (
                              <button
                                className={`campus-teacher__activity-calendar-day campus-teacher__cursos-calendar-day${cell.isToday ? ' is-today' : ''}${selectedTimelineDate === cell.dateValue ? ' is-selected' : ''}${cell.hasActivity ? ' has-activity' : ''}`}
                                key={cell.key}
                                onClick={() => setSelectedTimelineDate(cell.dateValue)}
                                role="listitem"
                                title={cell.title || undefined}
                                type="button"
                              >
                                <span className="day-number">{cell.dayNumber}</span>
                                {classCount > 0 ? (
                                  <span className="day-chip class">{classCount} clase{classCount === 1 ? '' : 's'}</span>
                                ) : null}
                                {activityCount > 0 ? (
                                  <span className="day-chip activity">{activityCount} actividad{activityCount === 1 ? '' : 'es'}</span>
                                ) : null}
                                {classCount === 0 && activityCount === 0 ? <span className="day-chip empty">Sin actividades</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </article>

                    <section className="campus-teacher__cursos-upcoming campus-teacher__embedded-panel">
                      <div className="campus-teacher__cursos-upcoming-head">
                        <h3>Próximas actividades</h3>
                        <button
                          className="campus-teacher__cursos-link-btn"
                          onClick={() => {
                            openAcademicManagementWorkspace(timelineCourse, 'posts');
                            if (activeTeacherSection !== 'academic_management') {
                              setActiveTeacherSection('academic_management');
                            }
                          }}
                          type="button"
                        >
                          Ver todas las actividades →
                        </button>
                      </div>
                      {coursesDetailUpcoming.length === 0 ? (
                        <p className="campus-panel__meta">No hay actividades próximas para este curso.</p>
                      ) : (
                        <div className="campus-teacher__cursos-upcoming-list">
                          {coursesDetailUpcoming.map((item) => (
                            <article className={`campus-teacher__cursos-upcoming-item is-${item.typeTone}`} key={item.id}>
                              <div className="campus-teacher__cursos-upcoming-date">
                                <span>{item.weekdayShort}</span>
                                <strong>{item.dayNumber}</strong>
                              </div>
                              <div className={`campus-teacher__cursos-upcoming-icon is-${item.typeTone}`} aria-hidden="true">
                                {item.typeTone === 'class' ? (
                                  <svg fill="none" viewBox="0 0 24 24"><path d="M4 19V5h16v14H4Z" stroke="currentColor" strokeWidth="1.7" /><path d="M8 9h8M8 13h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></svg>
                                ) : (
                                  <svg fill="none" viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7V3Z" stroke="currentColor" strokeWidth="1.7" /><path d="M14 3v5h5M9 13h6M9 17h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></svg>
                                )}
                              </div>
                              <div className="campus-teacher__cursos-upcoming-copy">
                                <div className="campus-teacher__cursos-upcoming-title-row">
                                  <strong>{item.title}</strong>
                                  <span className={`campus-teacher__cursos-type-pill is-${item.typeTone}`}>{item.typeLabel}</span>
                                </div>
                                <p>{item.description}</p>
                              </div>
                              <div className="campus-teacher__cursos-upcoming-meta">
                                {item.groupLabel ? <span className="campus-teacher__cursos-group-pill">{item.groupLabel}</span> : null}
                                <span>{item.deliveryLabel}</span>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="campus-teacher__cursos-students campus-teacher__embedded-panel">
                      <div className="campus-teacher__cursos-students-head">
                        <div>
                          <h3>Alumnos del curso</h3>
                          <p className="campus-panel__meta">Consulta el promedio de calificaciones de cada estudiante.</p>
                        </div>
                        <span className="campus-teacher__cursos-students-count">{coursesDetailStudents.length} alumno{coursesDetailStudents.length === 1 ? '' : 's'}</span>
                      </div>
                      {!previewEnabled && timelineCourseDetailQuery.isLoading ? (
                        <p className="campus-panel__meta">Cargando alumnos...</p>
                      ) : coursesDetailStudents.length === 0 ? (
                        <p className="campus-panel__meta">Este curso todavía no tiene alumnos asignados.</p>
                      ) : (
                        <div className="campus-teacher__cursos-students-table-wrap">
                          <table className="campus-teacher__cursos-students-table">
                            <thead>
                              <tr>
                                <th>Alumno</th>
                                <th>Código</th>
                                <th>Promedio</th>
                                <th>Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {coursesDetailStudents.map((student) => {
                                const score = parseFiniteScore(student.finalScore);
                                const performanceLevel = resolveTeacherPerformanceLevel(score, gradingScale);
                                const isPassing = score === null ? null : score >= Number(gradingScale?.passingScore || 70);
                                return (
                                  <tr key={student.studentId || student.id || student.name}>
                                    <td>
                                      <strong>{student.name || 'Sin nombre'}</strong>
                                    </td>
                                    <td>{student.schoolCode || '—'}</td>
                                    <td>
                                      {score === null ? (
                                        <span className="campus-teacher__cursos-score is-empty">Sin notas</span>
                                      ) : (
                                        <span className="campus-teacher__cursos-score" style={performanceLevel?.color ? { color: performanceLevel.color } : undefined}>
                                          {Number(score).toFixed(1)}
                                        </span>
                                      )}
                                    </td>
                                    <td>
                                      {score === null ? (
                                        <span className="campus-teacher__cursos-status-pill is-muted">Pendiente</span>
                                      ) : (
                                        <span className={`campus-teacher__cursos-status-pill ${isPassing ? 'is-active' : 'is-risk'}`}>
                                          {performanceLevel?.label || (isPassing ? 'En nivel' : 'En riesgo')}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>

                  </div>
                ) : (
                  <article className="campus-teacher__cursos-panel">
                    <header className="campus-teacher__cursos-hero">
                      <div>
                        <span className="campus-teacher__cursos-kicker">
                          {activeTeacherSection === 'academic_management'
                            ? (selectedSubject?.label || 'Gestión académica')
                            : 'Cursos'}
                        </span>
                        <h2>
                          {activeTeacherSection === 'academic_management'
                            ? (selectedSubject
                              ? `Gestiona evaluación y contenidos de ${selectedSubject.label}.`
                              : 'Gestiona evaluación y contenidos por materia.')
                            : 'Ver todos los cursos donde dictas clase.'}
                        </h2>
                        <p>
                          {activeTeacherSection === 'academic_management'
                            ? 'Abre un curso para definir evaluación, crear asignaciones y gestionar el libro de notas.'
                            : 'Consulta el rendimiento, alumnos, tareas y más detalles de cada curso.'}
                        </p>
                      </div>
                      <div className="campus-teacher__cursos-toolbar">
                        <div className="campus-teacher__cursos-view-toggle" role="group" aria-label="Tipo de vista">
                          <button
                            aria-label="Vista de cuadrícula"
                            aria-pressed={coursesCatalogView === 'grid'}
                            className={coursesCatalogView === 'grid' ? 'is-active' : ''}
                            onClick={() => setCoursesCatalogView('grid')}
                            type="button"
                          >
                            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                              <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="7" x="4" y="4" />
                              <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="7" x="13" y="4" />
                              <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="7" x="4" y="13" />
                              <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="7" x="13" y="13" />
                            </svg>
                          </button>
                          <button
                            aria-label="Vista de lista"
                            aria-pressed={coursesCatalogView === 'list'}
                            className={coursesCatalogView === 'list' ? 'is-active' : ''}
                            onClick={() => setCoursesCatalogView('list')}
                            type="button"
                          >
                            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                              <path d="M8 7h12M8 12h12M8 17h12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                              <circle cx="5" cy="7" fill="currentColor" r="1.2" />
                              <circle cx="5" cy="12" fill="currentColor" r="1.2" />
                              <circle cx="5" cy="17" fill="currentColor" r="1.2" />
                            </svg>
                          </button>
                        </div>
                        {activeTeacherSection === 'courses' ? (
                          <button
                            className={`campus-teacher__cursos-filter-btn${showCoursesFilter ? ' is-active' : ''}`}
                            onClick={() => setShowCoursesFilter((current) => !current)}
                            type="button"
                          >
                            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                              <path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
                            </svg>
                            Filtrar
                          </button>
                        ) : null}
                      </div>
                    </header>

                    {activeTeacherSection === 'courses' && showCoursesFilter ? (
                      <div className="campus-teacher__cursos-filter-bar">
                        <label>
                          <span>Asignatura</span>
                          <select
                            onChange={(event) => setCoursesSubjectFilter(event.target.value)}
                            value={coursesSubjectFilter}
                          >
                            <option value="all">Todas</option>
                            {coursesSubjectFilterOptions.map((subject) => (
                              <option key={subject} value={subject}>{subject}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : null}

                    {coursesCatalogRows.length === 0 ? (
                      <p className="campus-panel__meta">
                        {activeTeacherSection === 'academic_management'
                          ? (selectedSubject
                            ? `Rectoría todavía no te ha asignado cursos de ${selectedSubject.label}.`
                            : 'Selecciona una asignatura en el menú para ver sus cursos.')
                          : 'Rectoría todavía no te ha asignado cursos.'}
                      </p>
                    ) : coursesCatalogView === 'grid' ? (
                      <div className="campus-teacher__cursos-grid">
                        {coursesPagedRows.map((row) => (
                          <article
                            className="campus-teacher__cursos-card"
                            key={row.course.id}
                            style={{ '--campus-course-accent': row.accent.accent, '--campus-course-soft': row.accent.soft, '--campus-course-ink': row.accent.ink }}
                          >
                            <div className="campus-teacher__cursos-card-top">
                              <span className="campus-teacher__cursos-card-icon" aria-hidden="true">
                                <svg fill="none" viewBox="0 0 24 24">
                                  <path d="M4 16c2-1 4 1 6 0s3-3 5-2 4 2 5 1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                                  <circle cx="8" cy="8" fill="currentColor" r="2" />
                                  <circle cx="14" cy="7" fill="currentColor" opacity="0.55" r="1.6" />
                                  <circle cx="18" cy="10" fill="currentColor" opacity="0.35" r="1.4" />
                                </svg>
                              </span>
                              <button
                                aria-label={`Ver detalles de ${row.title}`}
                                className="campus-teacher__cursos-card-menu"
                                onClick={() => openCatalogCourse(row.course)}
                                type="button"
                              >
                                ⋮
                              </button>
                            </div>
                            <h3>{row.title}</h3>
                            <span className="campus-teacher__cursos-status-pill is-active">Activo</span>
                            <p className="campus-teacher__cursos-card-subtitle">1 curso asignado</p>
                            <ul className="campus-teacher__cursos-card-facts">
                              <li>
                                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" stroke="currentColor" strokeWidth="1.7" /><circle cx="10" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" /><path d="M19 19v-1a3.5 3.5 0 0 0-2.5-3.3M16.5 5.2a3 3 0 0 1 0 5.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></svg>
                                <span><strong>{row.stats.studentCount}</strong> alumnos</span>
                              </li>
                              <li>
                                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M5 19V9M10 19V5M15 19v-7M20 19V8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></svg>
                                <span>Promedio: <strong style={row.performanceColor ? { color: row.performanceColor } : undefined}>{row.stats.averageScore === null ? 'Sin notas' : row.stats.averageScore}</strong></span>
                              </li>
                              <li>
                                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.3 4.3 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></svg>
                                <span><strong>{row.stats.atRiskCount}</strong> en riesgo</span>
                              </li>
                              <li>
                                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></svg>
                                <span><strong>{row.stats.pendingGradingCount}</strong> tareas por calificar</span>
                              </li>
                            </ul>
                            <button className="campus-teacher__cursos-card-cta" onClick={() => openCatalogCourse(row.course)} type="button">
                              {activeTeacherSection === 'academic_management' ? 'Abrir curso' : 'Ver detalles'}
                              <span aria-hidden="true">→</span>
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="campus-teacher__cursos-table-wrap">
                        <table className="campus-teacher__cursos-table">
                          <thead>
                            <tr>
                              <th>Curso</th>
                              <th>Alumnos</th>
                              <th>Promedio</th>
                              <th>Estado</th>
                              <th>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {coursesPagedRows.map((row) => (
                              <tr key={row.course.id} onClick={() => openCatalogCourse(row.course)}>
                                <td>
                                  <div className="campus-teacher__cursos-table-course">
                                    <span className="campus-teacher__cursos-card-icon is-compact" style={{ '--campus-course-accent': row.accent.accent, '--campus-course-soft': row.accent.soft }} aria-hidden="true">
                                      <svg fill="none" viewBox="0 0 24 24">
                                        <path d="M4 16c2-1 4 1 6 0s3-3 5-2 4 2 5 1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                                        <circle cx="8" cy="8" fill="currentColor" r="2" />
                                      </svg>
                                    </span>
                                    <div>
                                      <strong>{row.title}</strong>
                                      <span>1 curso asignado</span>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span className="campus-teacher__cursos-table-metric">
                                    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" stroke="currentColor" strokeWidth="1.7" /><circle cx="10" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" /></svg>
                                    {row.stats.studentCount} alumnos
                                  </span>
                                </td>
                                <td>
                                  <span className="campus-teacher__cursos-table-metric">
                                    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M5 19V9M10 19V5M15 19v-7M20 19V8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></svg>
                                    <strong style={row.performanceColor ? { color: row.performanceColor } : undefined}>
                                      {row.stats.averageScore === null ? 'Sin notas' : row.stats.averageScore}
                                    </strong>
                                  </span>
                                </td>
                                <td>
                                  <span className="campus-teacher__cursos-status-pill is-active">Activo</span>
                                </td>
                                <td>
                                  <button
                                    aria-label={`Abrir ${row.title}`}
                                    className="campus-teacher__cursos-card-menu"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openCatalogCourse(row.course);
                                    }}
                                    type="button"
                                  >
                                    ···
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {coursesCatalogRows.length > 0 ? (
                      <footer className="campus-teacher__cursos-pagination">
                        <p>Mostrando {coursesPageStart} a {coursesPageEnd} de {coursesCatalogRows.length} cursos</p>
                        <div className="campus-teacher__cursos-page-controls">
                          <button
                            aria-label="Página anterior"
                            disabled={coursesPage <= 1}
                            onClick={() => setCoursesPage((current) => Math.max(1, current - 1))}
                            type="button"
                          >
                            ‹
                          </button>
                          {Array.from({ length: coursesTotalPages }, (_, index) => index + 1)
                            .filter((page) => page === 1 || page === coursesTotalPages || Math.abs(page - coursesPage) <= 1)
                            .reduce((acc, page, index, pages) => {
                              if (index > 0 && page - pages[index - 1] > 1) {
                                acc.push('ellipsis');
                              }
                              acc.push(page);
                              return acc;
                            }, [])
                            .map((page, index) => (
                              page === 'ellipsis' ? (
                                <span key={`ellipsis-${index}`}>…</span>
                              ) : (
                                <button
                                  aria-current={page === coursesPage ? 'page' : undefined}
                                  className={page === coursesPage ? 'is-active' : ''}
                                  key={page}
                                  onClick={() => setCoursesPage(page)}
                                  type="button"
                                >
                                  {page}
                                </button>
                              )
                            ))}
                          <button
                            aria-label="Página siguiente"
                            disabled={coursesPage >= coursesTotalPages}
                            onClick={() => setCoursesPage((current) => Math.min(coursesTotalPages, current + 1))}
                            type="button"
                          >
                            ›
                          </button>
                        </div>
                        <label className="campus-teacher__cursos-page-size">
                          <select
                            onChange={(event) => setCoursesPageSize(Number(event.target.value) || 12)}
                            value={coursesPageSize}
                          >
                            <option value={12}>12 por página</option>
                            <option value={20}>20 por página</option>
                            <option value={40}>40 por página</option>
                          </select>
                        </label>
                      </footer>
                    ) : null}
                  </article>
                )}
              </div>
            ) : null}

            {isCourseManagementSection ? (
              <div className="campus-teacher__courses-stage">
                {activeTeacherSection === 'academic_content' && !showSelectedCourseWorkspace ? (
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
                            setShowSelectedCourseWorkspace(Boolean(firstCourse));
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
                      <div className={`campus-teacher__fly-lock-control${courseFlyLock?.active ? ' is-locked' : ''}${!courseFlyLock?.active && !canLockCourseFly ? ' is-disabled' : ''}`}>
                        <div className="campus-teacher__fly-lock-copy">
                          <strong>FLY en clase</strong>
                          <span>
                            {courseFlyLock?.active
                              ? `Bloqueado ${courseFlyLock.unlocksAtLabel || ''}`.trim()
                              : (canLockCourseFly && courseFlyLockSessionPreview?.endTime
                                ? `Clase en curso · se liberará a las ${courseFlyLockSessionPreview.endTime}`
                                : 'Disponible para los alumnos')}
                          </span>
                          {courseFlyLock?.active && courseFlyLock.warning ? (
                            <small>{courseFlyLock.warning}</small>
                          ) : null}
                          {!courseFlyLock?.active && courseFlyLockSessionPreview?.warning ? (
                            <small>{courseFlyLockSessionPreview.warning}</small>
                          ) : null}
                        </div>
                        <button
                          className={courseFlyLock?.active ? 'campus-teacher__ghost-btn' : 'campus-teacher__action-btn'}
                          disabled={
                            isBusy
                            || courseFlyLockQuery.isLoading
                            || updateCourseFlyLockMutation.isPending
                            || (!courseFlyLock?.active && !canLockCourseFly)
                          }
                          onClick={() => onToggleCourseFlyLock(!courseFlyLock?.active)}
                          type="button"
                        >
                          {updateCourseFlyLockMutation.isPending
                            ? 'Actualizando...'
                            : (courseFlyLock?.active ? 'Desbloquear FLY' : 'Bloquear FLY')}
                        </button>
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
                        {assignmentDetailPost && !showAssignmentComposer ? (
                          <article className="campus-teacher__assignment-detail">
                            <header className="campus-teacher__assignment-detail-head">
                              <button
                                className="campus-teacher__ghost-btn"
                                onClick={() => setSelectedAssignmentDetail(null)}
                                type="button"
                              >
                                ← Volver a asignaciones
                              </button>
                              <div className="campus-teacher__assignment-detail-head-actions">
                                <button
                                  className="campus-teacher__ghost-btn"
                                  onClick={() => openAssignmentSubmissions(assignmentDetailPost)}
                                  type="button"
                                >
                                  Ver entregas
                                </button>
                                <button
                                  className="campus-teacher__classwork-create-btn"
                                  onClick={() => onEditPost(assignmentDetailPost)}
                                  type="button"
                                >
                                  Editar
                                </button>
                              </div>
                            </header>
                            <div className="campus-teacher__assignment-detail-title">
                              <span className={`campus-teacher__classwork-type-icon is-${getClassworkTypeTone(assignmentDetailPost.type)}`}>
                                <ClassworkTypeIcon type={assignmentDetailPost.type} />
                              </span>
                              <div>
                                <span>{formatPostTypeLabel(assignmentDetailPost.type)}</span>
                                <h2>{assignmentDetailPost.title || 'Sin título'}</h2>
                                <p>{getCourseDisplayTitle(selectedCourse)} · {formatDeliveryLabel(assignmentDetailPost)}</p>
                              </div>
                            </div>
                            <div className="campus-teacher__assignment-detail-body">
                              <section>
                                <h3>Instrucciones</h3>
                                <p>{assignmentDetailPost.body || 'Esta asignación no tiene instrucciones adicionales.'}</p>
                              </section>
                              <aside>
                                <div>
                                  <span>Publicada</span>
                                  <strong>{formatPostedDate(assignmentDetailPost)}</strong>
                                </div>
                                <div>
                                  <span>Entrega</span>
                                  <strong>{formatDeliveryLabel(assignmentDetailPost)}</strong>
                                </div>
                              </aside>
                            </div>
                            {(assignmentDetailPost.attachments || []).length > 0 ? (
                              <section className="campus-teacher__assignment-detail-attachments">
                                <h3>Material adjunto</h3>
                                <div>
                                  {(assignmentDetailPost.attachments || []).map((attachment, index) => {
                                    const href = resolveApiAssetUrl(attachment.url);
                                    const label = attachment.title || attachment.fileName || `Adjunto ${index + 1}`;
                                    const kind = String(attachment.kind || attachment.sourceType || '').toLowerCase();
                                    const iconKind = kind.includes('image')
                                      ? 'image'
                                      : kind.includes('video')
                                        ? 'video'
                                        : kind.includes('audio')
                                          ? 'audio'
                                          : kind.includes('link')
                                            ? 'link'
                                            : 'document';

                                    if (!href) {
                                      return (
                                        <div className="campus-teacher__assignment-detail-attachment is-disabled" key={`${label}-${index}`}>
                                          <ClassworkAttachIcon kind={iconKind} />
                                          <span>{label}</span>
                                        </div>
                                      );
                                    }

                                    return (
                                      <a
                                        href={href}
                                        key={`${href}-${index}`}
                                        rel="noreferrer"
                                        target="_blank"
                                      >
                                        <ClassworkAttachIcon kind={iconKind} />
                                        <span>{label}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              </section>
                            ) : courseDetailQuery.isFetching ? (
                              <section className="campus-teacher__assignment-detail-attachments">
                                <h3>Material adjunto</h3>
                                <p className="campus-panel__meta">Cargando archivos de la asignación...</p>
                              </section>
                            ) : (
                              <section className="campus-teacher__assignment-detail-attachments">
                                <h3>Material adjunto</h3>
                                <p className="campus-panel__meta">Esta asignación no tiene archivos guardados. Usa Editar para adjuntar el PDF.</p>
                              </section>
                            )}
                          </article>
                        ) : showAssignmentComposer ? (
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
                                  <p className="campus-teacher__classwork-edit-note">
                                    {existingMaterialFiles.length > 0
                                      ? 'Los archivos ya guardados se conservan. Puedes agregar más archivos o enlaces y guardar.'
                                      : 'Esta asignación aún no tiene archivos guardados. Puedes adjuntar el PDF u otros archivos aquí y guardar.'}
                                  </p>
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
                                  {existingMaterialFiles.length > 0 ? (
                                    <div className="campus-teacher__classwork-attach-files">
                                      {existingMaterialFiles.map((file, fileIndex) => (
                                        <div className="campus-teacher__classwork-attach-file is-saved" key={`${file.url || file.fileName}-${fileIndex}`}>
                                          <span className="campus-teacher__classwork-attach-file-icon">
                                            <ClassworkAttachIcon kind={String(file.kind || '').includes('image') ? 'image' : String(file.kind || '').includes('video') ? 'video' : String(file.kind || '').includes('audio') ? 'audio' : 'document'} />
                                          </span>
                                          <div className="campus-teacher__classwork-attach-file-copy">
                                            <strong>{file.title || file.fileName || `Adjunto ${fileIndex + 1}`}</strong>
                                            <span>Ya guardado</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
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

                                <label className="campus-teacher__classwork-rail-checkbox">
                                  <input
                                    checked={Boolean(postDraft.allowStudentSubmission)}
                                    onChange={(event) => setPostDraft((currentDraft) => ({
                                      ...currentDraft,
                                      allowStudentSubmission: event.target.checked,
                                    }))}
                                    type="checkbox"
                                  />
                                  <span>Permitir entrega del alumno</span>
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
                                      <button
                                        className="campus-teacher__classwork-item-copy campus-teacher__classwork-item-copy--button"
                                        onClick={() => setSelectedAssignmentDetail({ ...post, id: String(post.id) })}
                                        type="button"
                                      >
                                        <strong>{post.title || 'Sin título'}</strong>
                                        <span>{formatPostTypeLabel(post.type)} · {formatDeliveryLabel(post)}</span>
                                      </button>
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
                                            <button onClick={() => openAssignmentSubmissions(post)} role="menuitem" type="button">Ver entregas</button>
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
                    {activeCourseWorkspaceTab === 'submissions' ? (
                      <article className="campus-teacher__submissions-panel campus-teacher__embedded-panel">
                        <div className="campus-teacher__classroom-head">
                          <div>
                            <h2 className="campus-teacher__classroom-title">Entrega de asignaciones</h2>
                            <p className="campus-teacher__classroom-subtitle">
                              Revisa lo que cada alumno subió en las tareas con entrega habilitada.
                            </p>
                          </div>
                        </div>

                        {assignmentSubmissionsQuery.isLoading ? (
                          <p className="campus-panel__meta">Cargando entregas de los alumnos...</p>
                        ) : null}

                        {assignmentSubmissionsQuery.isError ? (
                          <p className="campus-panel__meta">
                            {assignmentSubmissionsQuery.error?.response?.data?.message
                              || assignmentSubmissionsQuery.error?.message
                              || 'No se pudieron cargar las entregas.'}
                          </p>
                        ) : null}

                        {!assignmentSubmissionsQuery.isLoading && !assignmentSubmissionsQuery.isError && assignmentSubmissionRows.length === 0 ? (
                          <div className="campus-teacher__classwork-empty">
                            <p>Aún no hay asignaciones con entrega de alumnos en este curso.</p>
                            <span>Activa “Permitir entrega del alumno” al crear una tarea para ver las evidencias aquí.</span>
                          </div>
                        ) : null}

                        {assignmentSubmissionRows.length > 0 ? (
                          <div className="campus-teacher__submissions-layout">
                            <div className="campus-teacher__submissions-list">
                              {assignmentSubmissionRows.map((assignment) => {
                                const isSelected = String(selectedSubmissionAssignment?.id) === String(assignment.id);
                                return (
                                  <button
                                    className={`campus-teacher__submissions-item${isSelected ? ' is-selected' : ''}`}
                                    key={assignment.id}
                                    onClick={() => setSelectedSubmissionAssignmentId(assignment.id)}
                                    type="button"
                                  >
                                    <strong>{assignment.title || 'Sin título'}</strong>
                                    <span>{formatPostTypeLabel(assignment.type)} · {formatDeliveryLabel(assignment)}</span>
                                    <small>
                                      {assignment.submittedCount || 0} entrega{(assignment.submittedCount || 0) === 1 ? '' : 's'}
                                      {' · '}
                                      {assignment.pendingCount || 0} pendiente{(assignment.pendingCount || 0) === 1 ? '' : 's'}
                                    </small>
                                  </button>
                                );
                              })}
                            </div>

                            {selectedSubmissionAssignment ? (
                              <div className="campus-teacher__submissions-detail">
                                <header>
                                  <span>{formatPostTypeLabel(selectedSubmissionAssignment.type)}</span>
                                  <h3>{selectedSubmissionAssignment.title || 'Sin título'}</h3>
                                  <p>{formatDeliveryLabel(selectedSubmissionAssignment)}</p>
                                </header>

                                <div className="campus-teacher__submissions-students">
                                  {(selectedSubmissionAssignment.students || []).map((student) => {
                                    const attachments = Array.isArray(student.submission?.attachments) ? student.submission.attachments : [];
                                    return (
                                      <article
                                        className={`campus-teacher__submissions-student${student.submitted ? ' is-submitted' : ' is-pending'}`}
                                        key={student.studentId}
                                      >
                                        <div className="campus-teacher__submissions-student-head">
                                          <div>
                                            <strong>{student.studentName || 'Alumno'}</strong>
                                            <span>{student.studentGrade || student.studentSchoolCode || 'Sin código'}</span>
                                          </div>
                                          <em>{student.submitted ? `Entregó ${formatSubmissionDateTime(student.submission?.submittedAt)}` : 'Sin entrega'}</em>
                                        </div>

                                        {student.submitted ? (
                                          <div className="campus-teacher__submissions-student-body">
                                            {student.submission?.note ? <p>{student.submission.note}</p> : null}
                                            {attachments.length ? (
                                              <div className="campus-teacher__submissions-files">
                                                {attachments.map((attachment, index) => {
                                                  const href = resolveApiAssetUrl(attachment.url);
                                                  const label = formatSubmissionAttachmentLabel(attachment);
                                                  return href ? (
                                                    <a
                                                      href={href}
                                                      key={`${student.studentId}-${index}`}
                                                      rel="noreferrer"
                                                      target="_blank"
                                                    >
                                                      {label}
                                                    </a>
                                                  ) : (
                                                    <span key={`${student.studentId}-${index}`}>{label}</span>
                                                  );
                                                })}
                                              </div>
                                            ) : (
                                              <span className="campus-panel__meta">Entregó una nota, sin archivos adjuntos.</span>
                                            )}
                                          </div>
                                        ) : null}
                                      </article>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    ) : null}
                    {activeCourseWorkspaceTab === 'grading' ? (
                      <article className="campus-teacher__grading-editor campus-teacher__grading-editor--classroom campus-teacher__embedded-panel">
                        <div className="campus-teacher__classroom-head">
                          <div>
                            <h2 className="campus-teacher__classroom-title">{gradingCourseTitle}</h2>
                            <p className="campus-teacher__classroom-subtitle">Configura periodos, componentes y subcomponentes de evaluación.</p>
                          </div>
                          <button
                            className="campus-teacher__action-btn campus-teacher__action-btn--compact campus-teacher__grading-refresh-btn"
                            disabled={!selectedCourse || courseDetailQuery.isFetching || isBusy}
                            onClick={onRefreshGradingStructure}
                            type="button"
                          >
                            <span aria-hidden="true" className={courseDetailQuery.isFetching ? 'is-spinning' : ''}>↻</span>
                            {courseDetailQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
                          </button>
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
                                  <div
                                    className={`campus-teacher__grading-component-card${expandedGradingComponentKey === buildSubcomponentDraftKey(periodIndex, componentIndex) ? ' is-expanded' : ''}`}
                                    key={`${component.key || 'component'}-${componentIndex}`}
                                  >
                                    {(() => {
                                      const draftKey = buildSubcomponentDraftKey(periodIndex, componentIndex);
                                      const isExpanded = expandedGradingComponentKey === draftKey;
                                      const newSubcomponentDraft = subcomponentDrafts[draftKey]
                                        || createSubcomponentDraft((component.subcomponents?.length || 0) + 1);
                                      const subcomponentCount = (component.subcomponents || []).length;

                                      return (
                                        <>
                                    <button
                                      aria-expanded={isExpanded}
                                      className="campus-teacher__grading-component-toggle"
                                      onClick={() => setExpandedGradingComponentKey((current) => (current === draftKey ? '' : draftKey))}
                                      type="button"
                                    >
                                      <span className="campus-teacher__grading-component-chevron" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
                                      <span className="campus-teacher__grading-component-summary-copy">
                                        <strong>{component.name || `Componente ${componentIndex + 1}`}</strong>
                                        <span>{subcomponentCount} subcomponente{subcomponentCount === 1 ? '' : 's'}</span>
                                      </span>
                                      <span className="campus-teacher__grading-component-weight">{Number(component.weight || 0)}%</span>
                                    </button>
                                    {isExpanded ? (
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
                                    ) : null}
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
                                  <div className="campus-teacher__gradebook-student-item" data-gradebook-student-id={student.studentId} key={student.studentId}>
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
                                                        const visibleSubcomponents = (matchingDraftComponent?.subcomponents || []).filter((subcomponent) => (
                                                          campusAudienceAppliesToStudent(
                                                            resolveAssignmentAudience({
                                                              ...subcomponent,
                                                              subcomponentName: subcomponent.name,
                                                            }, selectedCourseAssignmentPosts),
                                                            student.studentId
                                                          )
                                                        ));

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
                                                                  {formatTeacherGradeDisplay(score.score, selectedCourseGradingScale)}
                                                                </span>
                                                                <span className="campus-teacher__gradebook-toggle-icon" aria-hidden="true">{isComponentOpen ? '−' : '+'}</span>
                                                              </div>
                                                            </button>
                                                            {isComponentOpen ? (
                                                              <div className="campus-teacher__gradebook-component-body">
                                                                <div className="campus-teacher__student-score">
                                                                  {!visibleSubcomponents.length ? (
                                                                    <label>
                                                                      {selectedCourseGradingScale.qualitativeOnly ? 'Desempeño del componente' : 'Nota del componente'}
                                                                      {selectedCourseGradingScale.qualitativeOnly ? (
                                                                        <select
                                                                          value={resolveTeacherPerformanceLevel(
                                                                            studentDrafts?.[student.studentId]?.[buildGradeDraftKey(period.key, score.componentKey)]?.score,
                                                                            selectedCourseGradingScale
                                                                          )?.key || ''}
                                                                          onChange={(event) => {
                                                                            const selectedLevel = (selectedCourseGradingScale.performanceLevels || [])
                                                                              .find((level) => String(level.key) === String(event.target.value));
                                                                            onStudentDraftChange(
                                                                              student.studentId,
                                                                              period.key,
                                                                              score.componentKey,
                                                                              'score',
                                                                              selectedLevel ? getTeacherPerformanceLevelMidpoint(selectedLevel) : ''
                                                                            );
                                                                          }}
                                                                        >
                                                                          <option value="">Selecciona categoría</option>
                                                                          {(selectedCourseGradingScale.performanceLevels || []).map((level) => (
                                                                            <option key={level.key} value={level.key}>{level.label}</option>
                                                                          ))}
                                                                        </select>
                                                                      ) : (
                                                                        <input
                                                                          max={selectedCourseGradingScale.maxScore}
                                                                          min={selectedCourseGradingScale.minScore}
                                                                          step="0.1"
                                                                          type="number"
                                                                          value={studentDrafts?.[student.studentId]?.[buildGradeDraftKey(period.key, score.componentKey)]?.score ?? ''}
                                                                          onChange={(event) => onStudentDraftChange(student.studentId, period.key, score.componentKey, 'score', event.target.value)}
                                                                        />
                                                                      )}
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
                                                                        <span className="campus-teacher__student-subcomponents-title">
                                                                          {selectedCourseGradingScale.qualitativeOnly ? 'Desempeño del componente' : 'Nota del componente'}
                                                                        </span>
                                                                        <strong>
                                                                          {score.score === null || score.score === undefined
                                                                            ? (selectedCourseGradingScale.qualitativeOnly ? 'Sin categoría calculada' : 'Sin nota calculada')
                                                                            : formatTeacherGradeDisplay(score.score, selectedCourseGradingScale)}
                                                                        </strong>
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
                                                                                {selectedCourseGradingScale.qualitativeOnly ? 'Desempeño' : 'Nota'}
                                                                                {selectedCourseGradingScale.qualitativeOnly ? (
                                                                                  <select
                                                                                    value={resolveTeacherPerformanceLevel(
                                                                                      studentDrafts?.[student.studentId]?.[buildGradeDraftKey(period.key, score.componentKey, subcomponent.key)]?.score,
                                                                                      selectedCourseGradingScale
                                                                                    )?.key || ''}
                                                                                    onChange={(event) => {
                                                                                      const selectedLevel = (selectedCourseGradingScale.performanceLevels || [])
                                                                                        .find((level) => String(level.key) === String(event.target.value));
                                                                                      onStudentDraftChange(
                                                                                        student.studentId,
                                                                                        period.key,
                                                                                        score.componentKey,
                                                                                        'score',
                                                                                        selectedLevel ? getTeacherPerformanceLevelMidpoint(selectedLevel) : '',
                                                                                        subcomponent.key
                                                                                      );
                                                                                    }}
                                                                                  >
                                                                                    <option value="">Selecciona categoría</option>
                                                                                    {(selectedCourseGradingScale.performanceLevels || []).map((level) => (
                                                                                      <option key={level.key} value={level.key}>{level.label}</option>
                                                                                    ))}
                                                                                  </select>
                                                                                ) : (
                                                                                  <input
                                                                                    max={selectedCourseGradingScale.maxScore}
                                                                                    min={selectedCourseGradingScale.minScore}
                                                                                    step="0.1"
                                                                                    type="number"
                                                                                    value={studentDrafts?.[student.studentId]?.[buildGradeDraftKey(period.key, score.componentKey, subcomponent.key)]?.score ?? ''}
                                                                                    onChange={(event) => onStudentDraftChange(student.studentId, period.key, score.componentKey, 'score', event.target.value, subcomponent.key)}
                                                                                  />
                                                                                )}
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
                                      {selectedGradebookAssignmentAudience.targetType === 'students' ? (
                                        <span>
                                          Solo {selectedGradebookAssignmentStudents.map((student) => student.name).filter(Boolean).join(', ') || 'alumnos seleccionados'}
                                          {' · '}
                                          {selectedGradebookAssignmentStudents.length} alumno{selectedGradebookAssignmentStudents.length === 1 ? '' : 's'}
                                        </span>
                                      ) : null}
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
                                            <th>{selectedCourseGradingScale.qualitativeOnly ? 'Desempeño' : 'Nota'}</th>
                                            <th>Observacion</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {selectedGradebookAssignmentStudents
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
                                                  <td>
                                                    {studentFinalScore === null || studentFinalScore === undefined
                                                      ? (selectedCourseGradingScale.qualitativeOnly ? 'Sin definitiva' : 'Sin definitiva')
                                                      : formatTeacherGradeDisplay(studentFinalScore, selectedCourseGradingScale)}
                                                  </td>
                                                  <td>
                                                    {selectedCourseGradingScale.qualitativeOnly ? (
                                                      <select
                                                        value={resolveTeacherPerformanceLevel(
                                                          studentDrafts?.[student.studentId]?.[draftKey]?.score,
                                                          selectedCourseGradingScale
                                                        )?.key || ''}
                                                        onChange={(event) => {
                                                          const selectedLevel = (selectedCourseGradingScale.performanceLevels || [])
                                                            .find((level) => String(level.key) === String(event.target.value));
                                                          onStudentDraftChange(
                                                            student.studentId,
                                                            selectedGradebookAssignment.periodKey,
                                                            selectedGradebookAssignment.componentKey,
                                                            'score',
                                                            selectedLevel ? getTeacherPerformanceLevelMidpoint(selectedLevel) : '',
                                                            selectedGradebookAssignment.subcomponentKey
                                                          );
                                                        }}
                                                      >
                                                        <option value="">Categoría</option>
                                                        {(selectedCourseGradingScale.performanceLevels || []).map((level) => (
                                                          <option key={level.key} value={level.key}>{level.label}</option>
                                                        ))}
                                                      </select>
                                                    ) : (
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
                                                    )}
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
                                      <span className="campus-panel__meta">
                                        {selectedCourseGradingScale.qualitativeOnly
                                          ? 'Se guardarán las filas que tengan categoría seleccionada.'
                                          : 'Se guardarán las filas que tengan nota digitada.'}
                                      </span>
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

                    {activeCourseWorkspaceTab === 'report_card' ? (
                      <article className="campus-teacher__gradebook-panel campus-teacher__embedded-panel campus-teacher__report-card-panel">
                        <div className="campus-teacher__classroom-head">
                          <div>
                            <h2 className="campus-teacher__classroom-title">Generar boletín</h2>
                            <p className="campus-teacher__classroom-subtitle">
                              Cierra el periodo con el promedio de cada alumno, agrega observaciones y envía el boletín al director de grupo.
                            </p>
                          </div>
                        </div>

                        <div className="campus-teacher__report-card-toolbar">
                          <label>
                            Periodo
                            <select
                              onChange={(event) => setReportCardPeriodKey(event.target.value)}
                              value={effectiveReportCardPeriodKey}
                            >
                              {subjectReportPeriods.map((period) => (
                                <option key={period.key} value={period.key}>{period.name || period.key}</option>
                              ))}
                            </select>
                          </label>
                          <span className={`campus-teacher__mode-pill${selectedSubjectReport?.status === 'submitted' ? ' is-success' : ''}`}>
                            {selectedSubjectReport?.status === 'submitted' ? 'Enviado al director de grupo' : 'Borrador / pendiente'}
                          </span>
                        </div>

                        {!subjectReportCardsQuery.data?.headroomTeacherUserId ? (
                          <p className="campus-panel__meta">
                            Este curso aún no tiene director de grupo asignado. Puedes armar el boletín, pero para enviarlo Rectoría debe asignar el headroom teacher.
                          </p>
                        ) : null}

                        {subjectReportCardsQuery.isLoading || courseDetailQuery.isLoading ? (
                          <p className="campus-panel__meta">Cargando promedios del periodo...</p>
                        ) : null}

                        <div className="campus-teacher__report-card-table-wrap">
                          <table className="campus-teacher__report-card-table">
                            <thead>
                              <tr>
                                <th>Alumno</th>
                                <th>Promedio del periodo</th>
                                <th>Observación</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reportCardStudentRows.length ? reportCardStudentRows.map((student) => (
                                <tr key={student.studentId}>
                                  <td>
                                    <strong>{student.name}</strong>
                                    {student.grade ? <small>{student.grade}</small> : null}
                                  </td>
                                  <td>
                                    {student.periodAverage === null || student.periodAverage === undefined
                                      ? 'Sin promedio'
                                      : student.periodAverage}
                                  </td>
                                  <td>
                                    <textarea
                                      disabled={selectedSubjectReport?.status === 'submitted' || saveSubjectReportCardMutation.isPending}
                                      onChange={(event) => setReportCardObservations((current) => ({
                                        ...current,
                                        [student.studentId]: event.target.value,
                                      }))}
                                      placeholder="Observación del periodo para este alumno"
                                      rows={2}
                                      value={student.observation || ''}
                                    />
                                  </td>
                                </tr>
                              )) : (
                                <tr>
                                  <td colSpan={3}>No hay alumnos para este curso.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div className="campus-teacher__classroom-footer">
                          <span className="campus-panel__meta">
                            El promedio se toma del libro de notas del periodo seleccionado.
                          </span>
                          <div className="campus-teacher__report-card-actions">
                            <button
                              className="campus-teacher__ghost-btn"
                              disabled={isBusy || selectedSubjectReport?.status === 'submitted'}
                              onClick={() => onSubmitSubjectReportCard('draft')}
                              type="button"
                            >
                              {saveSubjectReportCardMutation.isPending ? 'Guardando...' : 'Guardar borrador'}
                            </button>
                            <button
                              className="campus-teacher__action-btn"
                              disabled={isBusy || selectedSubjectReport?.status === 'submitted' || !subjectReportCardsQuery.data?.headroomTeacherUserId}
                              onClick={() => onSubmitSubjectReportCard('submitted')}
                              type="button"
                            >
                              {saveSubjectReportCardMutation.isPending ? 'Enviando...' : 'Enviar a director de grupo'}
                            </button>
                          </div>
                        </div>
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
                          <p className="campus-panel__meta">Agrega temas, despliega cada uno para editarlo o subir material, y marca los que ya impartiste.</p>
                        </div>
                        <button className="campus-teacher__action-btn" disabled={isBusy || !selectedCourse || Boolean(academicContentUploadingKey)} onClick={onSaveAcademicContent} type="button">
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
                              {(period.topics || []).map((topic, topicIndex) => {
                                const linkDraftKey = `${period.periodKey || periodIndex}:${topic.key || topicIndex}`;
                                const expandKey = getAcademicContentTopicExpandKey(period, periodIndex, topic, topicIndex);
                                const isExpanded = expandedAcademicContentTopicKey === expandKey;
                                const linkDraft = topicLinkDrafts[linkDraftKey] || createAcademicContentMaterialLinkDraft();
                                const uploadKey = `${periodIndex}:${topicIndex}`;
                                const isUploading = academicContentUploadingKey === uploadKey;
                                return (
                                <div
                                  className={`campus-teacher__saved-topic-card${topic.completed ? ' is-completed' : ''}${isExpanded ? ' is-expanded' : ' is-collapsed'}`}
                                  key={`${topic.key || 'topic'}-${topicIndex}`}
                                >
                                  <button
                                    aria-expanded={isExpanded}
                                    className="campus-teacher__saved-topic-toggle"
                                    onClick={() => onToggleAcademicContentTopicExpanded(period, periodIndex, topic, topicIndex)}
                                    type="button"
                                  >
                                    <div className="campus-teacher__saved-topic-toggle-copy">
                                      <span className="campus-panel__kicker">{topic.completed ? 'Tema impartido' : 'Tema guardado'}</span>
                                      <strong>{topic.title || 'Sin título'}</strong>
                                    </div>
                                    <span aria-hidden="true" className={`campus-teacher__saved-topic-chevron${isExpanded ? ' is-open' : ''}`}>⌄</span>
                                  </button>

                                  {isExpanded ? (
                                    <div className="campus-teacher__saved-topic-card__body">
                                      <div className="campus-teacher__saved-topic-card__main">
                                        <label className="campus-teacher__saved-topic-check">
                                          <input
                                            checked={Boolean(topic.completed)}
                                            onChange={() => onToggleAcademicContentTopicCompleted(periodIndex, topicIndex)}
                                            type="checkbox"
                                          />
                                          <span>{topic.completed ? 'Tema impartido' : 'Marcar como impartido'}</span>
                                        </label>

                                        <label>
                                          Tema de estudio
                                          <input
                                            onChange={(event) => onChangeAcademicContentTopicField(periodIndex, topicIndex, 'title', event.target.value)}
                                            placeholder="Ej. Fracciones y resolución de problemas"
                                            value={topic.title || ''}
                                          />
                                        </label>
                                        <label>
                                          Detalle o alcance
                                          <input
                                            onChange={(event) => onChangeAcademicContentTopicField(periodIndex, topicIndex, 'description', event.target.value)}
                                            placeholder="Conceptos, competencias o actividades principales"
                                            value={topic.description || ''}
                                          />
                                        </label>

                                        {(topic.materials || []).length > 0 ? (
                                          <ul className="campus-teacher__saved-topic-materials">
                                            {(topic.materials || []).map((material, materialIndex) => (
                                              <li key={`${material.url}-${materialIndex}`}>
                                                <a href={resolveApiAssetUrl(material.url)} rel="noreferrer" target="_blank">
                                                  {formatAcademicContentMaterialLabel(material)}
                                                </a>
                                                <button
                                                  className="campus-teacher__ghost-btn"
                                                  onClick={() => onRemoveAcademicContentTopicMaterial(periodIndex, topicIndex, materialIndex)}
                                                  type="button"
                                                >
                                                  Quitar
                                                </button>
                                              </li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <p className="campus-panel__meta">Sin material de apoyo todavía.</p>
                                        )}

                                        <div className="campus-teacher__saved-topic-attach">
                                          <label className="campus-teacher__ghost-btn campus-teacher__saved-topic-upload">
                                            {isUploading ? 'Subiendo...' : 'Subir archivo / diapositiva / video'}
                                            <input
                                              accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.zip,.txt,image/*,video/*,audio/*"
                                              disabled={isUploading || isBusy}
                                              multiple
                                              onChange={(event) => {
                                                onUploadAcademicContentTopicFiles(periodIndex, topicIndex, event.target.files);
                                                event.target.value = '';
                                              }}
                                              type="file"
                                            />
                                          </label>
                                          <div className="campus-teacher__saved-topic-link-row">
                                            <input
                                              onChange={(event) => setTopicLinkDrafts((current) => ({
                                                ...current,
                                                [linkDraftKey]: { ...linkDraft, title: event.target.value },
                                              }))}
                                              placeholder="Título del enlace (opcional)"
                                              value={linkDraft.title}
                                            />
                                            <input
                                              onChange={(event) => setTopicLinkDrafts((current) => ({
                                                ...current,
                                                [linkDraftKey]: { ...linkDraft, url: event.target.value },
                                              }))}
                                              placeholder="https://... video, Drive, Canva..."
                                              value={linkDraft.url}
                                            />
                                            <button
                                              className="campus-teacher__ghost-btn"
                                              disabled={!String(linkDraft.url || '').trim()}
                                              onClick={() => onAddAcademicContentTopicMaterialLink(periodIndex, topicIndex)}
                                              type="button"
                                            >
                                              Agregar enlace
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                      <button className="campus-teacher__ghost-btn" onClick={() => onRemoveAcademicContentTopic(periodIndex, topicIndex)} type="button">Quitar tema</button>
                                    </div>
                                  ) : null}
                                </div>
                                );
                              })}
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

            {activeTeacherSection === 'general_report_card' ? (
              <article className="campus-teacher__gradebook-panel campus-teacher__embedded-panel campus-teacher__report-card-panel">
                <header className="campus-teacher__classroom-head">
                  <div>
                    <span className="campus-panel__kicker">Director de grupo</span>
                    <h2 className="campus-teacher__classroom-title">Boletín general</h2>
                    <p className="campus-teacher__classroom-subtitle">
                      Cuando todas las materias hayan enviado su boletín, consolida promedios, comentarios docentes y tu observación general.
                    </p>
                  </div>
                </header>

                {headroomReportCardsQuery.isLoading ? <p className="campus-panel__meta">Cargando boletines del curso...</p> : null}
                {!headroomReportCardsQuery.isLoading && !headroomReportSections.length ? (
                  <p className="campus-panel__meta">No tienes cursos asignados como director de grupo.</p>
                ) : null}

                {selectedHeadroomSection ? (
                  <>
                    <div className="campus-teacher__report-card-toolbar">
                      <label>
                        Curso
                        <select
                          onChange={(event) => {
                            setHeadroomReportSectionKey(event.target.value);
                            setHeadroomReportPeriodKey('');
                          }}
                          value={selectedHeadroomSection.sourceCourseKey}
                        >
                          {headroomReportSections.map((section) => (
                            <option key={section.sourceCourseKey} value={section.sourceCourseKey}>
                              {section.sectionLabel || section.sourceCourseKey}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Periodo
                        <select
                          onChange={(event) => setHeadroomReportPeriodKey(event.target.value)}
                          value={selectedHeadroomPeriodKey}
                        >
                          {(selectedHeadroomSection.periods || []).map((period) => (
                            <option key={period.key} value={period.key}>{period.name || period.key}</option>
                          ))}
                        </select>
                      </label>
                      <span className={`campus-teacher__mode-pill${selectedHeadroomSection.allSubjectsSubmitted ? ' is-success' : ''}`}>
                        {selectedHeadroomSection.allSubjectsSubmitted
                          ? 'Todas las materias listas'
                          : 'Esperando boletines de materias'}
                      </span>
                    </div>

                    <div className="campus-teacher__report-card-checklist">
                      <h3>Materias</h3>
                      <ul>
                        {(selectedHeadroomSection.subjects || []).map((subjectItem) => (
                          <li key={subjectItem.campusCourseId} className={subjectItem.submitted ? 'is-ready' : 'is-pending'}>
                            <strong>{subjectItem.subject}</strong>
                            <span>{subjectItem.submitted ? 'Boletín enviado' : 'Pendiente'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {selectedHeadroomSection.allSubjectsSubmitted ? (
                      <>
                        <div className="campus-teacher__report-card-table-wrap">
                          <table className="campus-teacher__report-card-table campus-teacher__report-card-table--general">
                            <thead>
                              <tr>
                                <th>Alumno</th>
                                <th>Materias / comentarios</th>
                                <th>Promedio</th>
                                <th>Observación general</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(selectedHeadroomSection.generalReport?.students?.length
                                ? selectedHeadroomSection.generalReport.students
                                : (() => {
                                  const byStudent = new Map();
                                  (selectedHeadroomSection.subjects || []).forEach((subjectItem) => {
                                    (subjectItem.report?.students || []).forEach((student) => {
                                      const studentId = String(student.studentId);
                                      const current = byStudent.get(studentId) || {
                                        studentId,
                                        studentName: student.studentName,
                                        subjectLines: [],
                                      };
                                      current.subjectLines.push({
                                        subject: subjectItem.subject,
                                        periodAverage: student.periodAverage,
                                        teacherObservation: student.observation,
                                        teacherName: subjectItem.report?.teacherName || '',
                                      });
                                      byStudent.set(studentId, current);
                                    });
                                  });
                                  return Array.from(byStudent.values()).map((student) => {
                                    const averages = student.subjectLines
                                      .map((line) => Number(line.periodAverage))
                                      .filter((value) => Number.isFinite(value));
                                    return {
                                      ...student,
                                      overallAverage: averages.length
                                        ? Number((averages.reduce((sum, value) => sum + value, 0) / averages.length).toFixed(2))
                                        : null,
                                      headroomObservation: headroomObservations[student.studentId] || '',
                                    };
                                  });
                                })()
                              ).map((student) => (
                                <tr key={student.studentId}>
                                  <td><strong>{student.studentName}</strong></td>
                                  <td>
                                    <ul className="campus-teacher__report-card-subject-lines">
                                      {(student.subjectLines || []).map((line, index) => (
                                        <li key={`${student.studentId}-${line.subject}-${index}`}>
                                          <strong>{line.subject}: {line.periodAverage ?? '—'}</strong>
                                          <span>{line.teacherName ? `${line.teacherName}: ` : ''}{line.teacherObservation || 'Sin observación'}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </td>
                                  <td>{student.overallAverage ?? '—'}</td>
                                  <td>
                                    <textarea
                                      disabled={selectedHeadroomSection.generalReport?.status === 'published' || saveHeadroomReportCardMutation.isPending}
                                      onChange={(event) => setHeadroomObservations((current) => ({
                                        ...current,
                                        [student.studentId]: event.target.value,
                                      }))}
                                      placeholder="Observación general del director de grupo"
                                      rows={3}
                                      value={
                                        Object.prototype.hasOwnProperty.call(headroomObservations, student.studentId)
                                          ? headroomObservations[student.studentId]
                                          : (student.headroomObservation || '')
                                      }
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="campus-teacher__classroom-footer">
                          <span className="campus-panel__meta">
                            {selectedHeadroomSection.generalReport?.status === 'published'
                              ? 'Boletín general publicado.'
                              : 'Puedes guardar borrador o publicar el boletín general.'}
                          </span>
                          <div className="campus-teacher__report-card-actions">
                            <button
                              className="campus-teacher__ghost-btn"
                              disabled={isBusy || selectedHeadroomSection.generalReport?.status === 'published'}
                              onClick={() => onSubmitHeadroomReportCard('draft')}
                              type="button"
                            >
                              {saveHeadroomReportCardMutation.isPending ? 'Guardando...' : 'Guardar borrador'}
                            </button>
                            <button
                              className="campus-teacher__action-btn"
                              disabled={isBusy || selectedHeadroomSection.generalReport?.status === 'published'}
                              onClick={() => onSubmitHeadroomReportCard('published')}
                              type="button"
                            >
                              {saveHeadroomReportCardMutation.isPending ? 'Publicando...' : 'Publicar boletín general'}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="campus-panel__meta">
                        Cuando todas las materias envíen su boletín de este periodo, podrás generar el boletín general aquí.
                      </p>
                    )}
                  </>
                ) : null}
              </article>
            ) : null}

            {isAttendanceLikeSection ? (
              <article className="campus-teacher__asistencia-panel campus-teacher__embedded-panel">
                <header className="campus-teacher__asistencia-hero">
                  <div>
                    <span className="campus-teacher__asistencia-kicker">
                      {activeTeacherSection === 'guidance_routine' ? 'Guidance Routine' : 'Asistencia a clase'}
                    </span>
                    <h2>
                      {activeTeacherSection === 'guidance_routine'
                        ? 'Planilla de llegada a la jornada.'
                        : 'Registro de asistencia por materia.'}
                    </h2>
                    <p>
                      {activeTeacherSection === 'guidance_routine'
                        ? 'Marca si el alumno llegó a tiempo al colegio, llegó tarde, faltó o presentó excusa en la jornada.'
                        : 'Selecciona asignatura, curso y bloque. Luego marca si cada alumno entró a tiempo, llegó tarde o no asistió.'}
                    </p>
                  </div>
                  <button
                    className="campus-teacher__asistencia-refresh"
                    disabled={teacherAttendanceQuery.isFetching || !teacherAttendanceCourseId}
                    onClick={() => teacherAttendanceQuery.refetch()}
                    type="button"
                  >
                    <span aria-hidden="true" className={teacherAttendanceQuery.isFetching ? 'is-spinning' : ''}>↻</span>
                    Actualizar
                  </button>
                </header>

                <form className="campus-teacher__asistencia-form" onSubmit={onSubmitTeacherAttendance}>
                  <section className="campus-teacher__asistencia-filters">
                    {teacherAttendanceType === 'subject_class' ? (
                      <>
                        <label>
                          <span>Asignatura</span>
                          <div className="campus-teacher__asistencia-control">
                            <svg aria-hidden="true" className="campus-teacher__asistencia-control-icon" fill="none" viewBox="0 0 24 24">
                              <path d="M4 16c2-1 4 1 6 0s3-3 5-2 4 2 5 1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                              <circle cx="8" cy="8" fill="currentColor" r="2" />
                              <circle cx="14" cy="7" fill="currentColor" opacity="0.55" r="1.6" />
                              <circle cx="18" cy="10" fill="currentColor" opacity="0.35" r="1.4" />
                            </svg>
                            <select value={teacherAttendanceSubjectKey} onChange={(event) => onTeacherAttendanceSubjectChange(event.target.value)}>
                              <option value="">Seleccionar asignatura</option>
                              {attendanceSubjectGroups.map((subject) => (
                                <option key={subject.key} value={subject.key}>{subject.label}</option>
                              ))}
                            </select>
                          </div>
                        </label>
                        <label>
                          <span>Curso</span>
                          <div className="campus-teacher__asistencia-control">
                            <svg aria-hidden="true" className="campus-teacher__asistencia-control-icon" fill="none" viewBox="0 0 24 24">
                              <path d="M3 10.5 12 6l9 4.5-9 4.5-9-4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
                              <path d="M7 13.2v3.3c0 .8 2.2 2 5 2s5-1.2 5-2v-3.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                            </svg>
                            <select value={teacherAttendanceCourseId} onChange={(event) => setTeacherAttendanceCourseId(event.target.value)} disabled={!teacherAttendanceCoursesForSubject.length}>
                              <option value="">{teacherAttendanceCoursesForSubject.length ? 'Seleccionar curso' : 'Sin cursos'}</option>
                              {teacherAttendanceCoursesForSubject.map((course) => (
                                <option key={course.id} value={course.id}>{getAttendanceCourseLabel(course)}</option>
                              ))}
                            </select>
                          </div>
                        </label>
                      </>
                    ) : (
                      <label>
                        <span>Curso</span>
                        <div className="campus-teacher__asistencia-control">
                          <svg aria-hidden="true" className="campus-teacher__asistencia-control-icon" fill="none" viewBox="0 0 24 24">
                            <path d="M3 10.5 12 6l9 4.5-9 4.5-9-4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
                            <path d="M7 13.2v3.3c0 .8 2.2 2 5 2s5-1.2 5-2v-3.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                          </svg>
                          <select value={teacherAttendanceCourseId} onChange={(event) => setTeacherAttendanceCourseId(event.target.value)}>
                            <option value="">Seleccionar curso</option>
                            {attendanceCourses.map((course) => <option key={course.id} value={course.id}>{getAttendanceCourseLabel(course)}</option>)}
                          </select>
                        </div>
                      </label>
                    )}
                    <label>
                      <span>Fecha</span>
                      <div className="campus-teacher__asistencia-control">
                        <svg aria-hidden="true" className="campus-teacher__asistencia-control-icon" fill="none" viewBox="0 0 24 24">
                          <rect height="16" rx="2" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="5" />
                          <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                        </svg>
                        <input type="date" value={teacherAttendanceDate} onChange={(event) => setTeacherAttendanceDate(event.target.value)} />
                      </div>
                    </label>
                    {teacherAttendanceType === 'subject_class' ? (
                      <label>
                        <span>Hora / Bloque</span>
                        <div className="campus-teacher__asistencia-control">
                          <svg aria-hidden="true" className="campus-teacher__asistencia-control-icon" fill="none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
                            <path d="M12 8v4l2.5 1.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                          </svg>
                          <select value={teacherAttendanceClassSessionKey} onChange={(event) => setTeacherAttendanceClassSessionKey(event.target.value)}>
                            <option value="">Sin hora específica</option>
                            {teacherAttendanceClassSessions.map((session) => (
                              <option key={buildSessionKey(session)} value={buildSessionKey(session)}>
                                {weekdayShortLabels[Number(session.weekday)] || 'Dia'} · {session.startTime}-{session.endTime}{session.label ? ` · ${session.label}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </label>
                    ) : null}
                  </section>

                  <section className="campus-teacher__asistencia-stats" aria-label="Resumen de asistencia">
                    {[
                      {
                        key: 'total',
                        label: 'Alumnos',
                        value: teacherAttendanceSummary.total,
                        tone: 'total',
                        icon: (
                          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                            <path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" stroke="currentColor" strokeWidth="1.7" />
                            <circle cx="10" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
                            <path d="M19 19v-1a3.5 3.5 0 0 0-2.5-3.3M16.5 5.2a3 3 0 0 1 0 5.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                          </svg>
                        ),
                      },
                      {
                        key: 'present',
                        label: 'Presentes',
                        value: teacherAttendanceSummary.present,
                        tone: 'present',
                        icon: (
                          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
                            <path d="m8.5 12.2 2.3 2.3 4.7-4.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                          </svg>
                        ),
                      },
                      {
                        key: 'late',
                        label: 'Tarde',
                        value: teacherAttendanceSummary.late,
                        tone: 'late',
                        icon: (
                          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
                            <path d="M12 8v4l2.5 1.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                          </svg>
                        ),
                      },
                      {
                        key: 'absent',
                        label: 'Ausentes',
                        value: teacherAttendanceSummary.absent,
                        tone: 'absent',
                        icon: (
                          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                            <path d="M15.5 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" stroke="currentColor" strokeWidth="1.7" />
                            <circle cx="9.5" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
                            <path d="m16.5 9.5 4 4M20.5 9.5l-4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                          </svg>
                        ),
                      },
                      {
                        key: 'excused',
                        label: 'Excusados',
                        value: teacherAttendanceSummary.excused,
                        tone: 'excused',
                        icon: (
                          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
                            <path d="m9 9 6 6M15 9l-6 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                          </svg>
                        ),
                      },
                    ].map((stat) => (
                      <div className={`campus-teacher__asistencia-stat tone-${stat.tone}`} key={stat.key}>
                        <span className="campus-teacher__asistencia-stat-icon" aria-hidden="true">{stat.icon}</span>
                        <div>
                          <strong>{stat.value}</strong>
                          <span>{stat.label}</span>
                        </div>
                      </div>
                    ))}
                  </section>

                  <section className="campus-teacher__asistencia-bulk">
                    <div>
                      <strong>Acciones rápidas</strong>
                      <p>Aplica el mismo estado a toda la planilla.</p>
                    </div>
                    <div className="campus-teacher__asistencia-bulk-actions">
                      {teacherAttendanceStatusOptions.map((option) => (
                        <button
                          className={`campus-teacher__asistencia-bulk-btn tone-${option.value}`}
                          disabled={teacherAttendanceLocked || teacherAttendanceRecords.length === 0}
                          key={option.value}
                          onClick={() => onMarkAllTeacherAttendance(option.value)}
                          type="button"
                        >
                          Marcar {option.label.toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="campus-teacher__asistencia-board">
                    <div className="campus-teacher__asistencia-board-head">
                      <div>
                        <strong>Planilla de alumnos</strong>
                        <p>
                          {teacherAttendanceRecords.length > 0
                            ? `${teacherAttendanceRecords.length} estudiante${teacherAttendanceRecords.length === 1 ? '' : 's'} en esta clase`
                            : 'La lista aparece cuando el curso está listo'}
                        </p>
                      </div>
                      {teacherAttendanceLocked ? (
                        <span className="campus-teacher__asistencia-locked-pill">Guardada</span>
                      ) : null}
                    </div>

                    {teacherAttendanceQuery.isLoading ? (
                      <div className="campus-teacher__asistencia-empty">
                        <p>Cargando planilla...</p>
                      </div>
                    ) : null}

                    {!teacherAttendanceQuery.isLoading && teacherAttendanceRecords.length === 0 ? (
                      <div className="campus-teacher__asistencia-empty">
                        <div className="campus-teacher__asistencia-empty-icon" aria-hidden="true">✓</div>
                        <strong>Listo para registrar asistencia</strong>
                        <p>
                          {attendanceCourses.length
                            ? (teacherAttendanceType === 'subject_class'
                              ? 'Selecciona asignatura, curso, fecha y bloque para cargar a tus alumnos.'
                              : 'Selecciona un curso y la fecha para cargar a tus alumnos.')
                            : 'No tienes cursos asignados para esta planilla.'}
                        </p>
                      </div>
                    ) : null}

                    {teacherAttendanceRecords.length > 0 ? (
                      <div className="campus-teacher__asistencia-roster">
                        {teacherAttendanceRecords.map((record) => {
                          const studentName = record.studentName || record.name || 'Alumno';
                          const initial = String(studentName).trim().charAt(0).toUpperCase() || 'A';
                          return (
                            <article className={`campus-teacher__asistencia-row status-${record.status || 'present'}`} key={record.studentId}>
                              <div className="campus-teacher__asistencia-student">
                                <span className="campus-teacher__asistencia-avatar" aria-hidden="true">{initial}</span>
                                <div>
                                  <strong>{studentName}</strong>
                                  <span>{[record.schoolCode, getCourseGroupLabel(selectedTeacherAttendanceCourse) || selectedTeacherAttendanceCourse?.title].filter(Boolean).join(' · ') || 'Sin código'}</span>
                                </div>
                              </div>
                              <div className="campus-teacher__asistencia-statuses">
                                {teacherAttendanceStatusOptions.map((option) => (
                                  <label
                                    className={`campus-teacher__asistencia-status tone-${option.value}${(record.status || 'present') === option.value ? ' is-selected' : ''}`}
                                    key={`${record.studentId}-${option.value}`}
                                  >
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
                                className="campus-teacher__asistencia-note"
                                disabled={teacherAttendanceLocked}
                                placeholder="Nota opcional"
                                value={record.notes || ''}
                                onChange={(event) => onTeacherAttendanceRecordChange(record.studentId, 'notes', event.target.value)}
                              />
                            </article>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>

                  <footer className="campus-teacher__asistencia-footer">
                    <div>
                      <strong>
                        {selectedTeacherAttendanceCourse
                          ? (teacherAttendanceType === 'subject_class'
                            ? [selectedAttendanceSubject?.label, getAttendanceCourseLabel(selectedTeacherAttendanceCourse)].filter(Boolean).join(' · ')
                            : getCourseOptionLabel(selectedTeacherAttendanceCourse))
                          : 'Sin curso seleccionado'}
                      </strong>
                      <span>
                        {selectedTeacherAttendanceCourse
                          ? (teacherAttendanceDate || 'Sin fecha')
                          : (teacherAttendanceType === 'subject_class' ? 'Selecciona asignatura, curso y fecha.' : 'Selecciona curso y fecha.')}
                      </span>
                    </div>
                    {teacherAttendanceLocked ? (
                      <button className="campus-teacher__ghost-btn" onClick={() => setTeacherAttendanceLocked(false)} type="button">
                        Editar asistencia
                      </button>
                    ) : (
                      <button className="campus-teacher__action-btn" disabled={isBusy || teacherAttendanceRecords.length === 0} type="submit">
                        {saveTeacherAttendanceMutation.isPending ? 'Guardando...' : 'Guardar asistencia'}
                      </button>
                    )}
                  </footer>
                </form>
              </article>
            ) : null}

            {activeTeacherSection === 'school_coexistence' ? (
              <article className="campus-teacher__convivencia-panel campus-teacher__embedded-panel">
                <header className="campus-teacher__convivencia-hero">
                  <div>
                    <span className="campus-teacher__convivencia-kicker">Convivencia escolar</span>
                    <h2>Registrar observación de comportamiento</h2>
                    <p>Registra y documenta situaciones para el seguimiento institucional.</p>
                  </div>
                  <button
                    className="campus-teacher__convivencia-history-btn"
                    onClick={() => document.getElementById('teacher-coexistence-history')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
                    type="button"
                  >
                    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M12 8v4l2.5 1.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                    </svg>
                    Ver historial
                  </button>
                </header>

                <form className="campus-teacher__convivencia-card" onSubmit={onSubmitTeacherDisciplineObservation}>
                  <div className="campus-teacher__convivencia-card-head">
                    <div>
                      <h3>Nueva observación</h3>
                      <p>
                        {teacherDisciplineDraft.destination === 'wellbeing'
                          ? 'Bienestar: el reporte llega a Psicología para acompañamiento.'
                          : 'Convivencia: el reporte llega a Coordinación, Dirección y Rectoría para seguimiento disciplinario.'}
                      </p>
                    </div>
                    <button
                      className="campus-teacher__convivencia-refresh"
                      disabled={teacherDisciplineObservationsQuery.isFetching}
                      onClick={() => teacherDisciplineObservationsQuery.refetch()}
                      type="button"
                    >
                      <span aria-hidden="true" className={teacherDisciplineObservationsQuery.isFetching ? 'is-spinning' : ''}>↻</span>
                      Actualizar
                    </button>
                  </div>

                  <fieldset className="campus-teacher__convivencia-destination">
                    <legend>¿A quién va dirigida?</legend>
                    <div className="campus-teacher__convivencia-destination-options" role="radiogroup" aria-label="Destino de la observación">
                      {teacherDisciplineDestinationOptions.map((option) => {
                        const isSelected = teacherDisciplineDraft.destination === option.value;
                        return (
                          <label
                            className={`campus-teacher__convivencia-destination-option${isSelected ? ' is-selected' : ''} is-${option.value}`}
                            key={option.value}
                          >
                            <input
                              checked={isSelected}
                              name="discipline-destination"
                              onChange={() => onTeacherDisciplineDraftChange('destination', option.value)}
                              type="radio"
                              value={option.value}
                            />
                            <strong>{option.label}</strong>
                            <span>{option.description}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {teacherDisciplineDraft.destination === 'coexistence' ? (
                    <label className="campus-teacher__convivencia-field">
                      <span>Tipo de falta (escala institucional)</span>
                      <div className="campus-teacher__convivencia-select-shell">
                        <select
                          disabled={teacherCoexistencePolicyQuery.isLoading}
                          onChange={(event) => onTeacherDisciplineDraftChange('infractionKey', event.target.value)}
                          value={teacherDisciplineDraft.infractionKey || ''}
                        >
                          <option value="">
                            {teacherCoexistencePolicyQuery.isLoading
                              ? 'Cargando faltas...'
                              : (teacherCoexistenceInfractions.length ? 'Seleccionar falta' : 'Sin faltas configuradas aún')}
                          </option>
                          {teacherCoexistenceInfractionGroups.map((group) => (
                            group.key === '_other' && teacherCoexistenceInfractionGroups.length === 1 ? (
                              group.items.map(({ item }) => (
                                <option key={item.key} value={item.key}>
                                  {formatCoexistenceInfractionOption(item)}
                                </option>
                              ))
                            ) : (
                              <optgroup key={group.key} label={group.label}>
                                {group.items.map(({ item }) => (
                                  <option key={item.key} value={item.key}>
                                    {formatCoexistenceInfractionOption(item)}
                                  </option>
                                ))}
                              </optgroup>
                            )
                          ))}
                        </select>
                      </div>
                      <small className="campus-panel__meta">
                        El descuento se aplica sobre el puntaje inicial de disciplina (100).
                      </small>
                    </label>
                  ) : null}

                  <div className="campus-teacher__convivencia-fields">
                    <label className="campus-teacher__convivencia-field">
                      <span>Curso o asignatura</span>
                      <div className="campus-teacher__convivencia-select-shell">
                        <svg aria-hidden="true" className="campus-teacher__convivencia-field-icon" fill="none" viewBox="0 0 24 24">
                          <path d="M4 7.5 12 4l8 3.5v2.2c0 4.6-3.3 8.8-8 9.8-4.7-1-8-5.2-8-9.8V7.5Z" stroke="currentColor" strokeWidth="1.7" />
                          <path d="M9 12.2 11 14l4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                        </svg>
                        <select
                          value={teacherDisciplineDraft.courseId}
                          onChange={(event) => onTeacherDisciplineDraftChange('courseId', event.target.value)}
                        >
                          <option value="">Seleccionar curso</option>
                          {courses.map((course) => (
                            <option key={course.id} value={course.id}>{getCourseOptionLabel(course)}</option>
                          ))}
                        </select>
                      </div>
                    </label>

                    <div className="campus-teacher__convivencia-field" ref={disciplineStudentComboboxRef}>
                      <span>Alumno</span>
                      <div className={`campus-teacher__convivencia-combobox${showDisciplineStudentMenu ? ' is-open' : ''}`}>
                        <svg aria-hidden="true" className="campus-teacher__convivencia-field-icon" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
                          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                        </svg>
                        <input
                          aria-autocomplete="list"
                          aria-expanded={showDisciplineStudentMenu}
                          aria-haspopup="listbox"
                          disabled={!teacherDisciplineDraft.courseId || teacherDisciplineCourseDetailQuery.isFetching}
                          onChange={(event) => {
                            setDisciplineStudentSearch(event.target.value);
                            setShowDisciplineStudentMenu(true);
                            if (teacherDisciplineDraft.studentId) {
                              onTeacherDisciplineDraftChange('studentId', '');
                            }
                          }}
                          onFocus={() => {
                            setShowDisciplineStudentMenu(true);
                            setDisciplineStudentSearch('');
                          }}
                          placeholder={
                            !teacherDisciplineDraft.courseId
                              ? 'Selecciona un curso primero'
                              : (teacherDisciplineCourseDetailQuery.isFetching ? 'Cargando alumnos...' : 'Buscar alumno por nombre o código')
                          }
                          role="combobox"
                          type="text"
                          value={showDisciplineStudentMenu ? disciplineStudentSearch : selectedDisciplineStudentLabel}
                        />
                        <button
                          aria-label="Abrir lista de alumnos"
                          className="campus-teacher__convivencia-combobox-caret"
                          disabled={!teacherDisciplineDraft.courseId || teacherDisciplineCourseDetailQuery.isFetching}
                          onClick={() => {
                            setShowDisciplineStudentMenu((current) => !current);
                            setDisciplineStudentSearch('');
                          }}
                          type="button"
                        >
                          ▾
                        </button>
                        {showDisciplineStudentMenu ? (
                          <div className="campus-teacher__convivencia-combobox-menu" role="listbox">
                            {filteredDisciplineStudentOptions.length === 0 ? (
                              <p className="campus-teacher__convivencia-combobox-empty">
                                {disciplineStudentOptions.length === 0
                                  ? 'Este curso no tiene alumnos cargados.'
                                  : 'No hay alumnos que coincidan con la búsqueda.'}
                              </p>
                            ) : filteredDisciplineStudentOptions.map((student) => {
                              const isSelected = student.studentId === teacherDisciplineDraft.studentId;
                              return (
                                <button
                                  aria-selected={isSelected}
                                  className={`campus-teacher__convivencia-combobox-option${isSelected ? ' is-selected' : ''}`}
                                  key={student.studentId}
                                  onClick={() => onSelectDisciplineStudent(student)}
                                  role="option"
                                  type="button"
                                >
                                  <strong>{student.name || 'Alumno'}</strong>
                                  <span>{student.schoolCode || 'Sin código'}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <label className="campus-teacher__convivencia-field">
                      <span>Fecha del caso</span>
                      <div className="campus-teacher__convivencia-select-shell">
                        <svg aria-hidden="true" className="campus-teacher__convivencia-field-icon" fill="none" viewBox="0 0 24 24">
                          <rect height="16" rx="2" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="5" />
                          <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                        </svg>
                        <input
                          type="date"
                          value={teacherDisciplineDraft.incidentDate}
                          onChange={(event) => onTeacherDisciplineDraftChange('incidentDate', event.target.value)}
                        />
                      </div>
                    </label>

                    <label className="campus-teacher__convivencia-field">
                      <span>Hora del caso</span>
                      <div className="campus-teacher__convivencia-select-shell">
                        <svg aria-hidden="true" className="campus-teacher__convivencia-field-icon" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
                          <path d="M12 8v4.5l3 1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                        </svg>
                        <input
                          type="time"
                          value={teacherDisciplineDraft.incidentTime}
                          onChange={(event) => onTeacherDisciplineDraftChange('incidentTime', event.target.value)}
                        />
                      </div>
                    </label>
                  </div>

                  <label className="campus-teacher__convivencia-field is-wide">
                    <span>Observación</span>
                    <small>Describe de forma objetiva la situación, el contexto y cualquier acción inmediata.</small>
                    <div className="campus-teacher__convivencia-textarea-shell">
                      <textarea
                        maxLength={1000}
                        placeholder="Escribe aquí la observación de comportamiento..."
                        rows={5}
                        value={teacherDisciplineDraft.observation}
                        onChange={(event) => onTeacherDisciplineDraftChange('observation', event.target.value.slice(0, 1000))}
                      />
                      <em>{disciplineObservationLength} / 1000</em>
                    </div>
                  </label>

                  <div className="campus-teacher__convivencia-tip">
                    <span aria-hidden="true">i</span>
                    <p>
                      {teacherDisciplineDraft.destination === 'wellbeing'
                        ? 'Bienestar es para señales emocionales, relacionales o de acompañamiento psicológico. Sé objetivo y describe hechos concretos.'
                        : 'Convivencia es para disciplina escolar y se calificará cuantitativamente. Sé objetivo: describe hechos concretos y evita juicios.'}
                    </p>
                  </div>

                  <div className="campus-teacher__convivencia-footer">
                    <div className="campus-teacher__convivencia-summary">
                      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
                        <path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                      </svg>
                      <span>
                        {[selectedDisciplineStudent?.name, selectedDisciplineCourse?.subject || selectedDisciplineCourse?.title].filter(Boolean).join(' · ')
                          || 'Selecciona alumno y curso para continuar.'}
                      </span>
                    </div>
                    <button
                      className="campus-teacher__action-btn campus-teacher__convivencia-submit"
                      disabled={
                        isBusy
                        || !teacherDisciplineDraft.courseId
                        || !teacherDisciplineDraft.studentId
                        || !teacherDisciplineDraft.incidentDate
                        || !teacherDisciplineDraft.incidentTime
                        || (
                          teacherDisciplineDraft.destination === 'coexistence'
                          && teacherCoexistenceInfractions.length > 0
                          && !teacherDisciplineDraft.infractionKey
                        )
                      }
                      type="submit"
                    >
                      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                        <path d="M4 11.5 20 4l-3.5 16L11 13 4 11.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
                        <path d="M11 13 20 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                      </svg>
                      {createTeacherDisciplineObservationMutation.isPending ? 'Enviando...' : 'Enviar observación'}
                    </button>
                  </div>
                </form>

                <section className="campus-teacher__convivencia-history" id="teacher-coexistence-history">
                  <div className="campus-teacher__convivencia-history-head">
                    <span className="campus-teacher__convivencia-kicker">Trazabilidad</span>
                    <h3>Observaciones enviadas</h3>
                  </div>

                  {teacherDisciplineCourseDetailQuery.isFetching ? (
                    <p className="campus-panel__meta">Cargando alumnos del curso...</p>
                  ) : null}
                  {teacherDisciplineObservationsQuery.isLoading ? (
                    <p className="campus-panel__meta">Cargando historial...</p>
                  ) : null}

                  {teacherDisciplineObservations.length === 0 && !teacherDisciplineObservationsQuery.isLoading ? (
                    <div className="campus-teacher__convivencia-history-empty">
                      <div className="campus-teacher__convivencia-history-empty-icon" aria-hidden="true">📋</div>
                      <div>
                        <strong>Aún no hay observaciones registradas</strong>
                        <p>Cuando envíes una observación, quedará aquí para seguimiento institucional.</p>
                      </div>
                    </div>
                  ) : null}

                  {teacherDisciplineObservations.length > 0 ? (
                    <div className="campus-teacher__convivencia-history-list">
                      {teacherDisciplineObservations.map((item) => (
                        <article className={`campus-teacher__convivencia-history-item status-${item.status}`} key={item.id}>
                          <div>
                            <div className="campus-teacher__convivencia-history-pills">
                              <span className={`campus-teacher__status-pill is-destination-${item.destination === 'wellbeing' ? 'wellbeing' : 'coexistence'}`}>
                                {teacherDisciplineDestinationLabels[item.destination] || 'Convivencia'}
                              </span>
                              <span className="campus-teacher__status-pill is-active">{teacherDisciplineStatusLabels[item.status] || item.status}</span>
                            </div>
                            <h4>{item.studentName}</h4>
                            {item.infractionLabel ? (
                              <p className="campus-panel__meta">
                                {item.infractionLabel}
                                {item.deductionPercent ? ` · −${item.deductionPercent}%` : ''}
                              </p>
                            ) : null}
                            <p>{item.observation}</p>
                          </div>
                          <div className="campus-teacher__convivencia-history-meta">
                            <span>{formatDateTimeLabel(item.incidentAt || item.submittedAt)}</span>
                            {item.courseTitle ? <span>{item.courseTitle}</span> : null}
                            {item.studentGrade ? <span>{item.studentGrade}</span> : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
              </article>
            ) : null}

            {activeTeacherSection === 'social_publications' ? (
              <article className="campus-teacher__publications-panel campus-teacher__embedded-panel">
                <header className="campus-teacher__publications-hero">
                  <div>
                    <span className="campus-teacher__publications-kicker">Publicaciones</span>
                    <h2>Enviar publicación</h2>
                    <p>Comparte fotos, videos y relatos con la comunidad de padres.</p>
                  </div>
                  <button
                    className="campus-teacher__publications-history-btn"
                    onClick={() => document.getElementById('teacher-publications-history')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
                    type="button"
                  >
                    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M12 8v4l2.5 1.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                    </svg>
                    Ver historial
                  </button>
                </header>

                <div className="campus-teacher__publications-layout">
                  <form className="campus-teacher__publications-card" onSubmit={onSubmitTeacherSocialPublication}>
                    <div className="campus-teacher__publications-card-head">
                      <div>
                        <h3>Detalles de la publicación</h3>
                        <p>Secretaría Académica revisa y autoriza antes de publicar en la app de acudientes.</p>
                      </div>
                      <button
                        className="campus-teacher__publications-refresh"
                        disabled={teacherSocialPublicationRequestsQuery.isFetching}
                        onClick={() => teacherSocialPublicationRequestsQuery.refetch()}
                        type="button"
                      >
                        <span aria-hidden="true" className={teacherSocialPublicationRequestsQuery.isFetching ? 'is-spinning' : ''}>↻</span>
                        Actualizar
                      </button>
                    </div>

                    <div className="campus-teacher__publications-fields">
                      <label className="campus-teacher__publications-field">
                        <span>Asignatura</span>
                        <div className="campus-teacher__publications-input-shell">
                          <svg aria-hidden="true" className="campus-teacher__publications-field-icon" fill="none" viewBox="0 0 24 24">
                            <path d="M4 16c2-1 4 1 6 0s3-3 5-2 4 2 5 1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                            <circle cx="8" cy="8" fill="currentColor" r="2" />
                            <circle cx="14" cy="7" fill="currentColor" opacity="0.55" r="1.6" />
                            <circle cx="18" cy="10" fill="currentColor" opacity="0.35" r="1.4" />
                          </svg>
                          <select
                            value={teacherSocialPublicationDraft.subjectKey}
                            onChange={(event) => onTeacherSocialPublicationDraftChange('subjectKey', event.target.value)}
                          >
                            <option value="">Seleccionar asignatura</option>
                            {socialPublicationSubjectGroups.map((subject) => (
                              <option key={subject.key} value={subject.key}>{subject.label}</option>
                            ))}
                          </select>
                        </div>
                      </label>

                      <label className="campus-teacher__publications-field">
                        <span>Curso</span>
                        <div className="campus-teacher__publications-input-shell">
                          <svg aria-hidden="true" className="campus-teacher__publications-field-icon" fill="none" viewBox="0 0 24 24">
                            <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
                            <circle cx="16.5" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.7" />
                            <path d="M3.8 18.5a5.2 5.2 0 0 1 10.4 0M13.2 18.5a4.2 4.2 0 0 1 7 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                          </svg>
                          <select
                            disabled={!teacherSocialPublicationDraft.subjectKey || socialPublicationCoursesForSubject.length === 0}
                            value={teacherSocialPublicationDraft.courseId}
                            onChange={(event) => onTeacherSocialPublicationDraftChange('courseId', event.target.value)}
                          >
                            <option value="">
                              {!teacherSocialPublicationDraft.subjectKey
                                ? 'Selecciona una asignatura primero'
                                : (socialPublicationCoursesForSubject.length ? 'Seleccionar curso' : 'Sin cursos')}
                            </option>
                            {socialPublicationCoursesForSubject.map((course) => (
                              <option key={course.id} value={course.id}>{getCourseGroupLabel(course)}</option>
                            ))}
                          </select>
                        </div>
                      </label>
                    </div>

                    <label className="campus-teacher__publications-field is-wide">
                      <span>Título</span>
                      <div className="campus-teacher__publications-input-shell">
                        <svg aria-hidden="true" className="campus-teacher__publications-field-icon" fill="none" viewBox="0 0 24 24">
                          <path d="M5 7h14M8 12h8M10 17h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                        </svg>
                        <input
                          placeholder="Ej. Proyecto de ciencias terminado"
                          value={teacherSocialPublicationDraft.title}
                          onChange={(event) => onTeacherSocialPublicationDraftChange('title', event.target.value)}
                        />
                      </div>
                    </label>

                    <label className="campus-teacher__publications-field is-wide">
                      <span>Descripción</span>
                      <div className="campus-teacher__publications-editor">
                        <textarea
                          maxLength={1000}
                          placeholder="Cuenta qué hicieron los estudiantes y por qué es importante compartirlo con las familias."
                          rows={6}
                          value={teacherSocialPublicationDraft.body}
                          onChange={(event) => onTeacherSocialPublicationDraftChange('body', event.target.value.slice(0, 1000))}
                        />
                        <em>{socialPublicationBodyLength} / 1000</em>
                      </div>
                    </label>

                    <div className="campus-teacher__publications-field is-wide">
                      <span>Fotos o videos</span>
                      <button
                        className={`campus-teacher__publications-dropzone${teacherSocialMediaDragActive ? ' is-dragging' : ''}${teacherSocialMediaUploading ? ' is-uploading' : ''}`}
                        disabled={teacherSocialMediaUploading || (teacherSocialPublicationDraft.media || []).length >= 8}
                        onClick={() => teacherSocialMediaInputRef.current?.click()}
                        onDragEnter={(event) => {
                          event.preventDefault();
                          setTeacherSocialMediaDragActive(true);
                        }}
                        onDragLeave={(event) => {
                          event.preventDefault();
                          if (!event.currentTarget.contains(event.relatedTarget)) {
                            setTeacherSocialMediaDragActive(false);
                          }
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={onTeacherSocialMediaDrop}
                        type="button"
                      >
                        <span className="campus-teacher__publications-dropzone-icon" aria-hidden="true">
                          <svg fill="none" viewBox="0 0 24 24">
                            <path d="M12 16V6M12 6l-3.5 3.5M12 6l3.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                            <path d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                          </svg>
                        </span>
                        <strong>{teacherSocialMediaUploading ? 'Subiendo archivos...' : 'Arrastra archivos aquí o selecciona'}</strong>
                        <span>JPG, PNG, MP4 hasta 100 MB c/u · Máximo 8 archivos</span>
                      </button>
                      <input
                        accept="image/*,video/*"
                        disabled={teacherSocialMediaUploading || (teacherSocialPublicationDraft.media || []).length >= 8}
                        hidden
                        multiple
                        onChange={onTeacherSocialMediaSelected}
                        ref={teacherSocialMediaInputRef}
                        type="file"
                      />

                      {(teacherSocialPublicationDraft.media || []).length > 0 ? (
                        <div className="campus-teacher__publications-media-grid">
                          {(teacherSocialPublicationDraft.media || []).map((item, index) => (
                            <article className="campus-teacher__publications-media-card" key={`${item.kind}-${item.src}-${index}`}>
                              <div className="campus-teacher__publications-media-preview">
                                {item.kind === 'video'
                                  ? <video controls src={item.src} />
                                  : <img alt={item.alt || `Adjunto ${index + 1}`} src={item.thumbUrl || item.src} />}
                              </div>
                              <button onClick={() => onRemoveTeacherSocialMedia(index)} type="button">Quitar</button>
                            </article>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="campus-teacher__publications-tip">
                      <span aria-hidden="true">i</span>
                      <p>Puedes enviar solo texto o adjuntar evidencia visual. Al aprobarse, aparecerá en la red social de los padres.</p>
                    </div>

                    <div className="campus-teacher__publications-footer">
                      <div className="campus-teacher__publications-summary">
                        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                          <path d="M4 7.5 12 4l8 3.5v2.2c0 4.6-3.3 8.8-8 9.8-4.7-1-8-5.2-8-9.8V7.5Z" stroke="currentColor" strokeWidth="1.7" />
                        </svg>
                        <span>
                          {[
                            selectedSocialPublicationSubject?.label || normalizeSubjectLabel(selectedSocialPublicationCourse?.subject),
                            selectedSocialPublicationCourse ? getCourseGroupLabel(selectedSocialPublicationCourse) : '',
                          ].filter(Boolean).join(' · ') || 'Selecciona asignatura y curso para continuar.'}
                        </span>
                      </div>
                      <button
                        className="campus-teacher__action-btn campus-teacher__publications-submit"
                        disabled={isBusy || !teacherSocialPublicationDraft.subjectKey || !teacherSocialPublicationDraft.courseId}
                        type="submit"
                      >
                        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                          <path d="M4 11.5 20 4l-3.5 16L11 13 4 11.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
                          <path d="M11 13 20 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                        </svg>
                        {createTeacherSocialPublicationMutation.isPending ? 'Enviando...' : 'Enviar a revisión'}
                      </button>
                    </div>
                  </form>

                  <aside className="campus-teacher__publications-sidebar">
                    <section className="campus-teacher__publications-side-card">
                      <div className="campus-teacher__publications-side-head">
                        <span className="campus-teacher__publications-side-icon is-tips" aria-hidden="true">💡</span>
                        <h3>Consejos para publicar</h3>
                      </div>
                      <ul className="campus-teacher__publications-tips-list">
                        <li>
                          <span aria-hidden="true">◎</span>
                          <p>Sé claro y objetivo en el título.</p>
                        </li>
                        <li>
                          <span aria-hidden="true">📄</span>
                          <p>Incluye el contexto del trabajo y lo que aprendieron los estudiantes.</p>
                        </li>
                        <li>
                          <span aria-hidden="true">🎓</span>
                          <p>Comparte fotos o videos que muestren el proceso o resultado.</p>
                        </li>
                        <li>
                          <span aria-hidden="true">✓</span>
                          <p>Revisa la información antes de enviar a revisión.</p>
                        </li>
                      </ul>
                    </section>

                    <section className="campus-teacher__publications-side-card">
                      <div className="campus-teacher__publications-side-head is-split">
                        <div>
                          <span className="campus-teacher__publications-side-icon is-recent" aria-hidden="true">📰</span>
                          <h3>Publicaciones recientes</h3>
                        </div>
                        <button
                          className="campus-teacher__publications-side-link"
                          onClick={() => document.getElementById('teacher-publications-history')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
                          type="button"
                        >
                          Ver todas
                        </button>
                      </div>

                      {teacherSocialPublicationRequestsQuery.isLoading ? (
                        <p className="campus-panel__meta">Cargando publicaciones...</p>
                      ) : null}

                      {!teacherSocialPublicationRequestsQuery.isLoading && recentTeacherSocialPublications.length === 0 ? (
                        <p className="campus-panel__meta">Todavía no tienes publicaciones enviadas.</p>
                      ) : null}

                      <div className="campus-teacher__publications-recent-list">
                        {recentTeacherSocialPublications.map((request) => {
                          const thumb = getTeacherSocialPublicationThumb(request);
                          const tone = getTeacherSocialPublicationStatusTone(request.status);
                          return (
                            <article className="campus-teacher__publications-recent-item" key={request._id}>
                              <div className={`campus-teacher__publications-recent-thumb${thumb ? '' : ' is-empty'}`}>
                                {thumb ? <img alt="" src={thumb} /> : <span aria-hidden="true">📷</span>}
                              </div>
                              <div>
                                <strong>{request.title || 'Sin título'}</strong>
                                <div className="campus-teacher__publications-recent-meta">
                                  <span className={`campus-teacher__publications-status is-${tone}`}>
                                    {teacherSocialPublicationStatusLabels[request.status] || request.status}
                                  </span>
                                  <span>{formatDateLabel(request.submittedAt)}</span>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      {teacherSocialPublicationRequests.length > 0 ? (
                        <button
                          className="campus-teacher__publications-side-footer"
                          onClick={() => document.getElementById('teacher-publications-history')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
                          type="button"
                        >
                          Ver todas mis publicaciones
                          <span aria-hidden="true">→</span>
                        </button>
                      ) : null}
                    </section>
                  </aside>
                </div>

                <section className="campus-teacher__publications-history" id="teacher-publications-history">
                  <div className="campus-teacher__publications-history-head">
                    <span className="campus-teacher__publications-kicker">Historial</span>
                    <h3>Mis publicaciones</h3>
                  </div>

                  {teacherSocialPublicationRequestsQuery.isLoading ? (
                    <p className="campus-panel__meta">Cargando publicaciones...</p>
                  ) : null}

                  {teacherSocialPublicationRequests.length === 0 && !teacherSocialPublicationRequestsQuery.isLoading ? (
                    <div className="campus-teacher__publications-history-empty">
                      <div className="campus-teacher__publications-history-empty-icon" aria-hidden="true">📰</div>
                      <div>
                        <strong>Aún no hay publicaciones enviadas</strong>
                        <p>Cuando envíes una publicación a revisión, quedará aquí para seguimiento.</p>
                      </div>
                    </div>
                  ) : null}

                  {teacherSocialPublicationRequests.length > 0 ? (
                    <div className="campus-teacher__publications-history-list">
                      {teacherSocialPublicationRequests.map((request) => {
                        const tone = getTeacherSocialPublicationStatusTone(request.status);
                        return (
                          <article className={`campus-teacher__publications-history-item status-${request.status}`} key={request._id}>
                            <div>
                              <span className={`campus-teacher__publications-status is-${tone}`}>
                                {teacherSocialPublicationStatusLabels[request.status] || request.status}
                              </span>
                              <h4>{request.title}</h4>
                              <p>{request.body}</p>
                            </div>
                            {(request.media || []).length ? (
                              <div className="campus-teacher__publications-history-media">
                                {(request.media || []).map((item, index) => {
                                  const mediaItem = normalizeTeacherPublicationHistoryMedia(item, index);
                                  if (!mediaItem.src) return null;
                                  return (
                                    <div className="campus-teacher__publications-history-media-card" key={`${request._id}-${mediaItem.id}-${index}`}>
                                      {mediaItem.kind === 'video'
                                        ? <video controls preload="metadata" src={mediaItem.src} />
                                        : <img alt={mediaItem.alt} loading="lazy" src={mediaItem.thumbUrl || mediaItem.src} />}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                            <div className="campus-teacher__publications-history-meta">
                              <span>{formatDateLabel(request.submittedAt)}</span>
                              {request.subject ? <span>{request.subject}</span> : null}
                              {request.courseTitle ? <span>{request.courseTitle}</span> : null}
                              {(request.media || []).length ? <span>{request.media.length} adjunto(s)</span> : <span>Solo texto</span>}
                            </div>
                            {request.reviewNotes ? (
                              <p className="campus-teacher__publications-history-notes">Secretaría: {request.reviewNotes}</p>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              </article>
            ) : null}

            {activeTeacherSection === 'resource_requests' ? (
              <article className="campus-teacher__recursos-panel campus-teacher__embedded-panel">
                <header className="campus-teacher__recursos-hero">
                  <div>
                    <span className="campus-teacher__recursos-kicker">Solicitud de recursos</span>
                    <h2>Planner de recursos</h2>
                    <p>Selecciona un periodo activo y solicita los materiales que necesitas para tus actividades.</p>
                  </div>
                  <button
                    className="campus-teacher__recursos-refresh"
                    disabled={teacherResourceRequestsQuery.isFetching || teacherPlannerCyclesQuery.isFetching}
                    onClick={() => {
                      teacherPlannerCyclesQuery.refetch();
                      teacherResourceRequestsQuery.refetch();
                    }}
                    type="button"
                  >
                    <span aria-hidden="true" className={(teacherResourceRequestsQuery.isFetching || teacherPlannerCyclesQuery.isFetching) ? 'is-spinning' : ''}>↻</span>
                    Actualizar
                  </button>
                </header>

                {teacherPlannerCyclesQuery.isLoading || teacherResourceRequestsQuery.isLoading ? (
                  <p className="campus-panel__meta">Cargando planners...</p>
                ) : null}

                {!teacherPlannerCyclesQuery.isLoading && teacherPlannerCycles.length === 0 ? (
                  <div className="campus-teacher__recursos-empty">
                    <div className="campus-teacher__recursos-empty-icon" aria-hidden="true">📦</div>
                    <div>
                      <strong>No hay planners activos</strong>
                      <p>Cuando coordinación o rectoría publiquen un periodo, aparecerá aquí.</p>
                    </div>
                  </div>
                ) : null}

                {teacherPlannerCycles.length > 0 ? (
                  <div className="campus-teacher__recursos-cycles">
                    {teacherPlannerCycles.map((cycle) => {
                      const existingRequest = getTeacherRequestForCycle(teacherResourceRequests, cycle.id);
                      const isSubmitted = Boolean(existingRequest);
                      const isSelected = selectedTeacherPlannerCycleId === cycle.id;
                      const isOpen = isPlannerSubmissionOpen(cycle);
                      return (
                        <button
                          className={`campus-teacher__recursos-cycle${isSubmitted ? ' is-submitted' : ' is-pending'}${isSelected ? ' is-selected' : ''}${!isOpen ? ' is-closed' : ''}`}
                          key={cycle.id}
                          onClick={() => onSelectTeacherPlannerCycle(cycle.id)}
                          type="button"
                        >
                          <span className="campus-teacher__recursos-cycle-status">
                            {isSubmitted ? 'Enviado' : (isOpen ? 'Pendiente' : 'Cerrado')}
                          </span>
                          <strong>{cycle.title}</strong>
                          <span>{formatDateLabel(cycle.startDate)} – {formatDateLabel(cycle.endDate)}</span>
                          <span>Límite {formatDateLabel(cycle.submissionDeadline)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {selectedTeacherPlannerCycle ? (
                  <div className="campus-teacher__recursos-workspace">
                    <div className="campus-teacher__recursos-period">
                      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                        <rect height="16" rx="2" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="5" />
                        <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                      </svg>
                      <div>
                        <strong>Periodo: {formatDateLabel(selectedTeacherPlannerCycle.startDate)} – {formatDateLabel(selectedTeacherPlannerCycle.endDate)}</strong>
                        <span>{selectedTeacherPlannerCycle.title}</span>
                      </div>
                    </div>

                    <div className="campus-teacher__recursos-banner">
                      <span aria-hidden="true">i</span>
                      <p>
                        Límite de entrega: {formatDateLabel(selectedTeacherPlannerCycle.submissionDeadline)}.
                        {selectedTeacherPlannerCycle.instructions
                          ? ` ${selectedTeacherPlannerCycle.instructions}`
                          : ' Solicita aquí los materiales que necesitas para este periodo.'}
                      </p>
                    </div>

                    {!isTeacherPlannerEditable ? (
                      <p className="campus-teacher__recursos-locked">
                        {selectedTeacherPlannerRequest
                          && !['pending_coordination_review', 'returned_for_correction'].includes(selectedTeacherPlannerRequest.status)
                          ? 'Este planner ya avanzó en el flujo y no se puede editar aquí.'
                          : 'La fecha límite ya venció. Solo puedes consultar el historial.'}
                      </p>
                    ) : null}

                    {selectedTeacherPlannerRequest?.status === 'returned_for_correction' && selectedTeacherPlannerRequest.coordinationObservation ? (
                      <div className="campus-teacher__recursos-return-banner">
                        <strong>Devuelto para corrección</strong>
                        <p>{selectedTeacherPlannerRequest.coordinationObservation}</p>
                        <span>Corrige el planner y vuelve a enviarlo a coordinación.</span>
                      </div>
                    ) : null}

                    {selectedTeacherPlannerRequest && !isTeacherPlannerEditable ? (
                      <section className="campus-teacher__recursos-card">
                        <div className="campus-teacher__recursos-card-head">
                          <h3>Historial enviado</h3>
                        </div>
                        {selectedTeacherPlannerRequest.noMaterialsNeeded ? (
                          <p className="campus-panel__meta">Marcaste que no necesitas material para este periodo.</p>
                        ) : null}
                        <div className="campus-teacher__recursos-table-wrap">
                          <table className="campus-teacher__recursos-table">
                            <thead>
                              <tr>
                                <th>Asignatura</th>
                                <th>Grado</th>
                                <th>Curso</th>
                                <th>Materiales</th>
                                <th>Actividad</th>
                                <th>Fecha</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(selectedTeacherPlannerRequest.plannerActivities || []).length ? (
                                selectedTeacherPlannerRequest.plannerActivities.map((activity) => (
                                  <tr key={activity.id || `${activity.title}-${activity.date}`}>
                                    <td>{activity.subject || '—'}</td>
                                    <td>{activity.grade || '—'}</td>
                                    <td>{activity.courseLabel || '—'}</td>
                                    <td>{formatTeacherPlannerMaterialsLabel(activity)}</td>
                                    <td>
                                      <strong>{activity.title || '—'}</strong>
                                      {activity.purpose ? <small>{activity.purpose}</small> : null}
                                    </td>
                                    <td>{formatDateLabel(activity.date)}</td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={6}>
                                    {(selectedTeacherPlannerRequest.items || []).map((entry) => `${entry.item?.name || entry.customName || 'Material'} x${entry.quantity}`).join(' · ') || 'Sin detalle de actividades.'}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ) : null}

                    {isTeacherPlannerEditable ? (
                      <>
                        <section className="campus-teacher__recursos-card">
                          <div className="campus-teacher__recursos-card-head">
                            <div>
                              <h3>Solicitar recursos para el periodo</h3>
                              <p>Completa los datos de cada actividad y agrégala a la lista antes de enviar.</p>
                            </div>
                            <label className="campus-teacher__recursos-check">
                              <input
                                checked={Boolean(teacherResourceRequestDraft.noMaterialsNeeded)}
                                onChange={(event) => {
                                  const checked = event.target.checked;
                                  onTeacherResourceDraftChange('noMaterialsNeeded', checked);
                                  if (checked) {
                                    setTeacherResourcePlannerActivities([]);
                                    setTeacherResourceRequestDraft((currentDraft) => ({
                                      ...currentDraft,
                                      noMaterialsNeeded: true,
                                      pendingMaterials: [],
                                      materialKey: '',
                                      customMaterialName: '',
                                      quantity: '1',
                                    }));
                                  }
                                }}
                                type="checkbox"
                              />
                              <span>No necesito material para este periodo</span>
                            </label>
                          </div>

                          {!teacherResourceRequestDraft.noMaterialsNeeded ? (
                            <>
                              <div className="campus-teacher__recursos-fields">
                                <label className="campus-teacher__recursos-field">
                                  <span>Asignatura</span>
                                  <div className="campus-teacher__recursos-input-shell">
                                    <svg aria-hidden="true" className="campus-teacher__recursos-field-icon" fill="none" viewBox="0 0 24 24">
                                      <path d="M5 5.5h6.5A2.5 2.5 0 0 1 14 8v11.5H7A2 2 0 0 1 5 17.5V5.5Z" stroke="currentColor" strokeWidth="1.7" />
                                      <path d="M14 8h5a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-5V8Z" stroke="currentColor" strokeWidth="1.7" />
                                    </svg>
                                    <select
                                      value={teacherResourceRequestDraft.subjectKey}
                                      onChange={(event) => onTeacherResourceDraftChange('subjectKey', event.target.value)}
                                    >
                                      <option value="">Seleccionar asignatura</option>
                                      {teacherPlannerSubjectOptions.map((subject) => (
                                        <option key={subject.key} value={subject.key}>{subject.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                </label>

                                <label className="campus-teacher__recursos-field">
                                  <span>Grado</span>
                                  <div className="campus-teacher__recursos-input-shell">
                                    <svg aria-hidden="true" className="campus-teacher__recursos-field-icon" fill="none" viewBox="0 0 24 24">
                                      <path d="M3 10.5 12 6l9 4.5-9 4.5-9-4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
                                      <path d="M7 13.2v3.3c0 .8 2.2 2 5 2s5-1.2 5-2v-3.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                                    </svg>
                                    <select
                                      disabled={!teacherResourceRequestDraft.subjectKey}
                                      value={teacherResourceRequestDraft.gradeKey}
                                      onChange={(event) => onTeacherResourceDraftChange('gradeKey', event.target.value)}
                                    >
                                      <option value="">Seleccionar grado</option>
                                      {teacherPlannerGradeOptions.map((grade) => (
                                        <option key={grade.key} value={grade.key}>{grade.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                </label>

                                <label className="campus-teacher__recursos-field">
                                  <span>Curso</span>
                                  <div className="campus-teacher__recursos-input-shell">
                                    <svg aria-hidden="true" className="campus-teacher__recursos-field-icon" fill="none" viewBox="0 0 24 24">
                                      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
                                      <circle cx="16.5" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.7" />
                                      <path d="M3.8 18.5a5.2 5.2 0 0 1 10.4 0M13.2 18.5a4.2 4.2 0 0 1 7 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                                    </svg>
                                    <select
                                      disabled={!teacherResourceRequestDraft.gradeKey}
                                      value={teacherResourceRequestDraft.courseId}
                                      onChange={(event) => onTeacherResourceDraftChange('courseId', event.target.value)}
                                    >
                                      <option value="">Seleccionar curso</option>
                                      {teacherPlannerCourseOptions.map((course) => (
                                        <option key={course.id} value={course.id}>
                                          {getCourseGroupLabel(course) || getCourseDisplayTitle(course)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </label>

                                <label className="campus-teacher__recursos-field">
                                  <span>Material</span>
                                  <div className="campus-teacher__recursos-input-shell">
                                    <svg aria-hidden="true" className="campus-teacher__recursos-field-icon" fill="none" viewBox="0 0 24 24">
                                      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
                                      <path d="M12 12v8M4 8.5 12 12l8-3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                                    </svg>
                                    <select
                                      value={teacherResourceRequestDraft.materialKey}
                                      onChange={(event) => onTeacherResourceDraftChange('materialKey', event.target.value)}
                                    >
                                      <option value="">Seleccionar material</option>
                                      {teacherPlannerMaterialOptions.map((material) => (
                                        <option key={material} value={material}>{material}</option>
                                      ))}
                                      <option value="__other__">Otro</option>
                                    </select>
                                  </div>
                                </label>

                                <label className="campus-teacher__recursos-field is-qty">
                                  <span>Cantidad</span>
                                  <div className="campus-teacher__recursos-input-shell is-plain">
                                    <input
                                      min="1"
                                      type="number"
                                      value={teacherResourceRequestDraft.quantity}
                                      onChange={(event) => onTeacherResourceDraftChange('quantity', event.target.value)}
                                    />
                                  </div>
                                </label>
                              </div>

                              {teacherResourceRequestDraft.materialKey === '__other__' ? (
                                <label className="campus-teacher__recursos-field is-wide">
                                  <span>Nombre del material</span>
                                  <div className="campus-teacher__recursos-input-shell is-plain">
                                    <input
                                      placeholder="Escribe el material"
                                      value={teacherResourceRequestDraft.customMaterialName}
                                      onChange={(event) => onTeacherResourceDraftChange('customMaterialName', event.target.value)}
                                    />
                                  </div>
                                </label>
                              ) : null}

                              <div className="campus-teacher__recursos-add-row">
                                <button className="campus-teacher__recursos-secondary" onClick={onAddTeacherResourceMaterial} type="button">
                                  + Agregar material a esta actividad
                                </button>
                              </div>

                              {(teacherResourceRequestDraft.pendingMaterials || []).length > 0 ? (
                                <div className="campus-teacher__recursos-pending-materials">
                                  <div className="campus-teacher__recursos-pending-materials__head">
                                    <strong>Materiales de la actividad</strong>
                                    <span>{teacherResourceRequestDraft.pendingMaterials.length}</span>
                                  </div>
                                  <ul>
                                    {teacherResourceRequestDraft.pendingMaterials.map((item) => (
                                      <li key={item.key}>
                                        <span>{item.materialName} ×{item.quantity}</span>
                                        <button
                                          aria-label={`Quitar ${item.materialName}`}
                                          className="campus-teacher__recursos-delete"
                                          onClick={() => onRemoveTeacherResourcePendingMaterial(item.key)}
                                          type="button"
                                        >
                                          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                                            <path d="M5 7h14M10 11v6M14 11v6M9 7l1-2h4l1 2M8 7l1 12h6l1-12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                                          </svg>
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                <p className="campus-panel__meta">
                                  Puedes agregar varios materiales a la misma actividad antes de guardarla.
                                </p>
                              )}

                              <label className="campus-teacher__recursos-field is-wide">
                                <span>Título de actividad</span>
                                <div className="campus-teacher__recursos-input-shell is-plain">
                                  <input
                                    placeholder="Ej. Collage de ecosistemas"
                                    value={teacherResourceRequestDraft.activityTitle}
                                    onChange={(event) => onTeacherResourceDraftChange('activityTitle', event.target.value)}
                                  />
                                </div>
                              </label>

                              <label className="campus-teacher__recursos-field is-wide">
                                <span>Motivo pedagógico</span>
                                <div className="campus-teacher__recursos-textarea-shell">
                                  <textarea
                                    placeholder="Actividad, proyecto o necesidad del aula"
                                    rows={3}
                                    value={teacherResourceRequestDraft.purpose}
                                    onChange={(event) => onTeacherResourceDraftChange('purpose', event.target.value)}
                                  />
                                </div>
                              </label>

                              <div className="campus-teacher__recursos-date-row">
                                <label className="campus-teacher__recursos-field">
                                  <span>Fecha de la actividad</span>
                                  <div className="campus-teacher__recursos-input-shell">
                                    <svg aria-hidden="true" className="campus-teacher__recursos-field-icon" fill="none" viewBox="0 0 24 24">
                                      <rect height="16" rx="2" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="5" />
                                      <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                                    </svg>
                                    {(() => {
                                      const minDate = toDateInputValue(selectedTeacherPlannerCycle.startDate);
                                      const maxDate = toDateInputValue(selectedTeacherPlannerCycle.endDate);
                                      const hasInvalidRange = Boolean(minDate && maxDate && minDate > maxDate);
                                      return (
                                        <input
                                          disabled={hasInvalidRange}
                                          max={hasInvalidRange ? undefined : (maxDate || undefined)}
                                          min={hasInvalidRange ? undefined : (minDate || undefined)}
                                          type="date"
                                          value={teacherResourceRequestDraft.activityDate}
                                          onChange={(event) => onTeacherResourceDraftChange('activityDate', event.target.value)}
                                        />
                                      );
                                    })()}
                                  </div>
                                </label>
                                <div className="campus-teacher__recursos-range">
                                  <span>Rango permitido</span>
                                  <strong>{formatDateLabel(selectedTeacherPlannerCycle.startDate)} – {formatDateLabel(selectedTeacherPlannerCycle.endDate)}</strong>
                                  {toDateInputValue(selectedTeacherPlannerCycle.startDate)
                                    && toDateInputValue(selectedTeacherPlannerCycle.endDate)
                                    && toDateInputValue(selectedTeacherPlannerCycle.startDate) > toDateInputValue(selectedTeacherPlannerCycle.endDate) ? (
                                      <small className="campus-teacher__recursos-range-warning">
                                        Este planner tiene fechas invertidas. Pide a Rectoría o Coordinación corregir Desde/Hasta.
                                      </small>
                                    ) : null}
                                </div>
                              </div>

                              <div className="campus-teacher__recursos-add-row">
                                <button className="campus-teacher__action-btn campus-teacher__recursos-add" onClick={onAddTeacherResourceActivity} type="button">
                                  + Agregar actividad
                                </button>
                              </div>
                            </>
                          ) : (
                            <p className="campus-panel__meta">
                              Confirmaste que no necesitas material. Envía el planner para notificar a coordinación.
                            </p>
                          )}
                        </section>

                        {!teacherResourceRequestDraft.noMaterialsNeeded ? (
                          <section className="campus-teacher__recursos-card">
                            <div className="campus-teacher__recursos-card-head">
                              <h3>Actividades solicitadas</h3>
                              <span className="campus-teacher__recursos-count">{teacherResourcePlannerActivities.length}</span>
                            </div>
                            <div className="campus-teacher__recursos-table-wrap">
                              <table className="campus-teacher__recursos-table">
                                <thead>
                                  <tr>
                                    <th>Asignatura</th>
                                    <th>Grado</th>
                                    <th>Curso</th>
                                    <th>Materiales</th>
                                    <th>Actividad</th>
                                    <th>Fecha</th>
                                    <th>Acciones</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {teacherResourcePlannerActivities.length === 0 ? (
                                    <tr>
                                      <td colSpan={7}>Aún no has agregado actividades para este planner.</td>
                                    </tr>
                                  ) : teacherResourcePlannerActivities.map((activity) => (
                                    <tr key={activity.key}>
                                      <td>{activity.subject}</td>
                                      <td>{activity.grade}</td>
                                      <td>{activity.courseLabel}</td>
                                      <td>{formatTeacherPlannerMaterialsLabel(activity)}</td>
                                      <td>
                                        <strong>{activity.title}</strong>
                                        {activity.purpose ? <small>{activity.purpose}</small> : null}
                                      </td>
                                      <td>{formatDateLabel(activity.date)}</td>
                                      <td>
                                        <button
                                          aria-label="Quitar actividad"
                                          className="campus-teacher__recursos-delete"
                                          onClick={() => onRemoveTeacherResourceActivity(activity.key)}
                                          type="button"
                                        >
                                          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                                            <path d="M5 7h14M10 11v6M14 11v6M9 7l1-2h4l1 2M8 7l1 12h6l1-12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                                          </svg>
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </section>
                        ) : null}

                        <div className="campus-teacher__recursos-footer">
                          <button
                            className="campus-teacher__recursos-secondary"
                            disabled={teacherResourceRequestsQuery.isFetching || teacherPlannerCyclesQuery.isFetching}
                            onClick={() => {
                              teacherPlannerCyclesQuery.refetch();
                              teacherResourceRequestsQuery.refetch();
                            }}
                            type="button"
                          >
                            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                              <path d="M4.5 12a7.5 7.5 0 0 1 13.2-4.8M19.5 12a7.5 7.5 0 0 1-13.2 4.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                              <path d="M17 4.8V7.5h-2.7M7 19.2V16.5h2.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                            </svg>
                            Actualizar planner
                          </button>
                          <button
                            className="campus-teacher__action-btn campus-teacher__recursos-submit"
                            disabled={isBusy || (!teacherResourceRequestDraft.noMaterialsNeeded && teacherResourcePlannerActivities.length === 0)}
                            onClick={() => setTeacherPlannerConfirmOpen(true)}
                            type="button"
                          >
                            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                              <path d="M4 11.5 20 4l-3.5 16L11 13 4 11.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
                              <path d="M11 13 20 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                            </svg>
                            {createTeacherResourceRequestMutation.isPending
                              ? 'Enviando...'
                              : (selectedTeacherPlannerRequest?.status === 'returned_for_correction'
                                ? 'Corregir y reenviar'
                                : (selectedTeacherPlannerRequest ? 'Actualizar y enviar' : 'Enviar planner'))}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : teacherPlannerCycles.length > 0 ? (
                  <p className="campus-panel__meta">Selecciona un periodo para solicitar materiales.</p>
                ) : null}

                {teacherPlannerConfirmOpen ? (
                  <div className="campus-teacher__recursos-modal" role="dialog" aria-modal="true">
                    <div className="campus-teacher__recursos-modal-card">
                      <h4>¿Confirmas el envío?</h4>
                      <p>
                        {teacherResourceRequestDraft.noMaterialsNeeded
                          ? '¿Confirmas que no necesitas material para este rango de fechas?'
                          : '¿Esta es toda la solicitud de materiales que necesitas para este rango de fechas?'}
                      </p>
                      <div className="campus-teacher__recursos-modal-actions">
                        <button className="campus-teacher__recursos-secondary" onClick={() => setTeacherPlannerConfirmOpen(false)} type="button">
                          Revisar otra vez
                        </button>
                        <button className="campus-teacher__action-btn" disabled={isBusy} onClick={onSubmitTeacherResourceRequest} type="button">
                          Sí, enviar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            ) : null}

            {activeTeacherSection === 'family_feed' ? (
              <article className="campus-teacher__family-feed campus-teacher__embedded-panel">
                <header className="campus-teacher__family-feed-head">
                  <div>
                    <span className="campus-panel__kicker">Comunidad educativa</span>
                    <h3>Feed de familias</h3>
                    <p>Publicaciones generales del colegio y las tuyas ya publicadas. Puedes dar like y comentar.</p>
                  </div>
                </header>

                {teacherFamilyFeedQuery.isLoading ? (
                  <p className="campus-panel__meta">Cargando publicaciones...</p>
                ) : null}
                {teacherFamilyFeedQuery.isError ? (
                  <p className="campus-teacher__family-feed-error">
                    {teacherFamilyFeedQuery.error?.response?.data?.message || teacherFamilyFeedQuery.error?.message || 'No se pudo cargar el feed.'}
                  </p>
                ) : null}

                <div className="campus-teacher__family-feed-list">
                  {(Array.isArray(teacherFamilyFeedQuery.data) ? teacherFamilyFeedQuery.data : []).map((publication) => {
                    const publicationId = String(publication.id || '');
                    const isLikePending = familyFeedPendingLikeIds.includes(publicationId);
                    const commentsOpen = Boolean(familyFeedExpandedComments[publicationId]);
                    const commentDraft = familyFeedCommentDrafts[publicationId] || '';
                    const isCommentPending = familyFeedPendingCommentKeys.includes(`${publicationId}:new`);

                    return (
                      <article className="campus-teacher__family-feed-card" key={publicationId}>
                        <div className="campus-teacher__family-feed-author">
                          <span className="campus-teacher__family-feed-avatar">
                            {publication.authorPhotoUrl ? (
                              <img
                                alt=""
                                onError={(event) => { event.currentTarget.style.display = 'none'; }}
                                src={resolveApiAssetUrl(publication.authorPhotoUrl)}
                              />
                            ) : String(publication.authorName || 'SA').slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <strong>{publication.authorName || 'Secretaría académica'}</strong>
                            <span>{formatDateLabel(publication.sentAt)}</span>
                          </div>
                        </div>

                        {(publication.media || []).length ? (
                          <div className={`campus-teacher__family-feed-media${publication.media.length > 1 ? ' is-grid' : ''}`}>
                            {publication.media.map((mediaItem, mediaIndex) => (
                              mediaItem.kind === 'video' ? (
                                <video controls key={mediaItem.id || `${publicationId}-video-${mediaIndex}`} preload="metadata" src={resolveApiAssetUrl(mediaItem.src)} />
                              ) : (
                                <img
                                  alt={mediaItem.alt || publication.title || 'Publicación para familias'}
                                  key={mediaItem.id || `${publicationId}-image-${mediaIndex}`}
                                  loading="lazy"
                                  src={resolveApiAssetUrl(mediaItem.src)}
                                />
                              )
                            ))}
                          </div>
                        ) : null}

                        <div className="campus-teacher__family-feed-copy">
                          <h4>{publication.title}</h4>
                          <p>{publication.body}</p>
                        </div>

                        <div className="campus-teacher__family-feed-actions">
                          <button
                            aria-label={publication.likedByMe ? 'Quitar like' : 'Dar like'}
                            className={`campus-teacher__family-feed-action${publication.likedByMe ? ' is-liked' : ''}`}
                            disabled={isLikePending}
                            onClick={() => onToggleFamilyFeedLike(publicationId)}
                            type="button"
                          >
                            <span aria-hidden="true">{publication.likedByMe ? '♥' : '♡'}</span>
                            <strong>{Number(publication.likesCount || 0)}</strong>
                          </button>
                          <button
                            className="campus-teacher__family-feed-action"
                            onClick={() => setFamilyFeedExpandedComments((current) => ({
                              ...current,
                              [publicationId]: !commentsOpen,
                            }))}
                            type="button"
                          >
                            Comentarios {Number(publication.commentsCount || 0)}
                          </button>
                        </div>

                        {commentsOpen ? (
                          <div className="campus-teacher__family-feed-comments">
                            {(publication.comments || []).length ? publication.comments.map((comment) => {
                              const commentPendingKey = `${publicationId}:${comment.id}`;
                              const commentLikePendingKey = `${publicationId}:${comment.id}:like`;
                              return (
                                <div className="campus-teacher__family-feed-comment" key={comment.id}>
                                  <div className="campus-teacher__family-feed-comment-head">
                                    <strong>{comment.name}</strong>
                                    <span>{formatDateLabel(comment.createdAt)}</span>
                                  </div>
                                  <p>{comment.body}</p>
                                  <div className="campus-teacher__family-feed-comment-actions">
                                    <button
                                      className={`campus-teacher__family-feed-action is-compact${comment.likedByMe ? ' is-liked' : ''}`}
                                      disabled={familyFeedPendingCommentKeys.includes(commentLikePendingKey)}
                                      onClick={() => onToggleFamilyFeedCommentLike(publicationId, comment.id)}
                                      type="button"
                                    >
                                      {comment.likedByMe ? '♥' : '♡'} {Number(comment.likesCount || 0)}
                                    </button>
                                    {comment.canDelete ? (
                                      <button
                                        className="campus-teacher__family-feed-action is-compact is-danger"
                                        disabled={familyFeedPendingCommentKeys.includes(commentPendingKey)}
                                        onClick={() => onDeleteFamilyFeedComment(publicationId, comment.id)}
                                        type="button"
                                      >
                                        Borrar
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            }) : (
                              <p className="campus-panel__meta">Sé el primero en comentar.</p>
                            )}

                            <form
                              className="campus-teacher__family-feed-comment-form"
                              onSubmit={(event) => {
                                event.preventDefault();
                                onSubmitFamilyFeedComment(publicationId);
                              }}
                            >
                              <textarea
                                onChange={(event) => setFamilyFeedCommentDrafts((current) => ({
                                  ...current,
                                  [publicationId]: event.target.value,
                                }))}
                                placeholder="Escribe un comentario..."
                                rows={3}
                                value={commentDraft}
                              />
                              <button disabled={isCommentPending || !commentDraft.trim()} type="submit">
                                {isCommentPending ? 'Publicando...' : 'Comentar'}
                              </button>
                            </form>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>

                {!teacherFamilyFeedQuery.isLoading
                  && !teacherFamilyFeedQuery.isError
                  && (!Array.isArray(teacherFamilyFeedQuery.data) || teacherFamilyFeedQuery.data.length === 0) ? (
                    <p className="campus-panel__meta">Todavía no hay publicaciones generales ni publicaciones propias enviadas a las familias.</p>
                  ) : null}
              </article>
            ) : null}

            {activeTeacherSection === 'staff_announcements' ? (
              <article className="campus-teacher__embedded-panel">
                <StaffAnnouncementsPanel
                  description="Envía y recibe mensajes internos del colegio. Elige a quién va dirigido cada comunicado."
                  mode="manage"
                  title="Comunicados internos"
                />
              </article>
            ) : null}

            {activeTeacherSection === 'dashboard' ? (
              <article className="campus-teacher__home-panel campus-teacher__embedded-panel">
                <header className="campus-teacher__home-hero">
                  <div>
                    <h2>Bienvenido, {teacherWelcomeName} 👋</h2>
                    <p>Un resumen claro de tus cursos, alumnos y pendientes de hoy.</p>
                  </div>
                  <div className="campus-teacher__home-hero-date">
                    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                      <rect height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="5" />
                      <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                    </svg>
                    <span>{todayWelcomeLabel}</span>
                  </div>
                </header>

                <div className={`campus-teacher__home-kpi-grid${isOverviewMetricsLoading ? ' is-loading' : ''}`}>
                  {isOverviewMetricsLoading ? Array.from({ length: 6 }, (_, index) => (
                    <article className="campus-teacher__home-kpi-card is-skeleton" key={`teacher-home-kpi-skeleton-${index}`} aria-hidden="true">
                      <span />
                      <strong />
                      <p />
                      <em />
                    </article>
                  )) : (
                    <>
                      <article className="campus-teacher__home-kpi-card tone-students">
                        <span className="campus-teacher__home-kpi-icon" aria-hidden="true">
                          <TeacherDashboardKpiIcon kind="students" />
                        </span>
                        <span className="campus-teacher__home-kpi-label">Alumnos</span>
                        <strong>{integralOverview.totalStudents}</strong>
                        <p>En tus cursos activos</p>
                        <button
                          className="campus-teacher__home-kpi-link"
                          onClick={() => setActiveTeacherSection('courses')}
                          type="button"
                        >
                          Ver todos →
                        </button>
                      </article>

                      <article className="campus-teacher__home-kpi-card tone-average">
                        <span className="campus-teacher__home-kpi-icon" aria-hidden="true">
                          <TeacherDashboardKpiIcon kind="average" />
                        </span>
                        <span className="campus-teacher__home-kpi-label">Promedio general</span>
                        <strong>{integralOverview.averageScore === null ? '—' : integralOverview.averageScore}</strong>
                        <p>
                          {integralOverview.averageTrendDelta === null
                            ? 'Aún no hay tendencia'
                            : `${integralOverview.averageTrendDelta >= 0 ? 'Subió' : 'Bajó'} ${Math.abs(integralOverview.averageTrendDelta)} pts`}
                        </p>
                        <button
                          className="campus-teacher__home-kpi-link"
                          onClick={() => {
                            document.getElementById('teacher-home-performance')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                          type="button"
                        >
                          Ver detalle →
                        </button>
                      </article>

                      <button
                        className={`campus-teacher__home-kpi-card tone-risk${integralOverview.atRiskCount > 0 ? ' has-alert' : ''}`}
                        onClick={() => setActiveIntegralModal('risk')}
                        type="button"
                      >
                        <span className="campus-teacher__home-kpi-icon" aria-hidden="true">
                          <TeacherDashboardKpiIcon kind="risk" />
                        </span>
                        <span className="campus-teacher__home-kpi-label">En riesgo</span>
                        <strong>{integralOverview.atRiskCount}</strong>
                        <p>
                          {integralOverview.lowPerformanceRate === null
                            ? 'Sin calificaciones aún'
                            : `${integralOverview.lowPerformanceRate}% bajo rendimiento`}
                        </p>
                        <span className="campus-teacher__home-kpi-link">Ver alumnos →</span>
                      </button>

                      <button
                        className={`campus-teacher__home-kpi-card tone-pending${integralOverview.pendingGradingCount > 0 ? ' has-alert' : ''}`}
                        onClick={() => setActiveIntegralModal('pending')}
                        type="button"
                      >
                        <span className="campus-teacher__home-kpi-icon" aria-hidden="true">
                          <TeacherDashboardKpiIcon kind="pending" />
                        </span>
                        <span className="campus-teacher__home-kpi-label">Por calificar</span>
                        <strong>{integralOverview.pendingGradingCount}</strong>
                        <p>{integralOverview.pendingGradingCount > 0 ? 'Actividades pendientes' : 'Todo al día'}</p>
                        <span className="campus-teacher__home-kpi-link">Calificar ahora →</span>
                      </button>

                      <button
                        className="campus-teacher__home-kpi-card tone-tomorrow"
                        onClick={() => {
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          const tomorrowValue = buildLocalDateValue(tomorrow);
                          setDashboardCalendarMonth(new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1));
                          setSelectedDashboardCalendarDate(tomorrowValue);
                          setActiveIntegralModal('tomorrow');
                        }}
                        type="button"
                      >
                        <span className="campus-teacher__home-kpi-icon" aria-hidden="true">
                          <TeacherDashboardKpiIcon kind="tomorrow" />
                        </span>
                        <span className="campus-teacher__home-kpi-label">Para mañana</span>
                        <strong>{integralOverview.tomorrowActivitiesCount}</strong>
                        <p>{integralOverview.tomorrowActivitiesCount > 0 ? integralOverview.tomorrowLabel : 'Nada programado'}</p>
                        <span className="campus-teacher__home-kpi-link">Ver agenda →</span>
                      </button>

                      <button
                        className={`campus-teacher__home-kpi-card tone-submissions${integralOverview.assignmentSubmissionCount > 0 ? ' has-alert' : ''}`}
                        onClick={() => setActiveIntegralModal('submissions')}
                        type="button"
                      >
                        <span className="campus-teacher__home-kpi-icon" aria-hidden="true">
                          <TeacherDashboardKpiIcon kind="submissions" />
                        </span>
                        <span className="campus-teacher__home-kpi-label">Entregas</span>
                        <strong>{integralOverview.assignmentSubmissionCount}</strong>
                        <p>
                          {integralOverview.assignmentSubmissionCount > 0
                            ? (integralOverview.assignmentSubmissions[0]?.studentName
                              ? `Última: ${integralOverview.assignmentSubmissions[0].studentName}`
                              : 'Alumnos que ya entregaron')
                            : 'Aún no hay entregas'}
                        </p>
                        <span className="campus-teacher__home-kpi-link">Ver quién entregó →</span>
                      </button>
                    </>
                  )}
                </div>

                <div className={`campus-teacher__home-main${isDashboardCalendarExpanded ? ' is-calendar-expanded' : ''}`}>
                  <article className="campus-teacher__home-calendar">
                    <header className="campus-teacher__home-card-head">
                      <div className="campus-teacher__home-card-title">
                        <span className="campus-teacher__home-card-icon" aria-hidden="true">
                          <TeacherDashboardKpiIcon kind="tomorrow" />
                        </span>
                        <div>
                          <strong>Calendario de actividades</strong>
                          <p>Tus próximas actividades y entregas</p>
                        </div>
                      </div>
                      <div className="campus-teacher__home-calendar-tools">
                        <button
                          className="campus-teacher__home-icon-btn"
                          onClick={() => setDashboardCalendarMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                          type="button"
                          aria-label="Mes anterior"
                        >
                          ‹
                        </button>
                        <span className="campus-teacher__home-calendar-month">{formatMonthLabel(dashboardCalendarMonth)}</span>
                        <button
                          className="campus-teacher__home-icon-btn"
                          onClick={() => setDashboardCalendarMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                          type="button"
                          aria-label="Mes siguiente"
                        >
                          ›
                        </button>
                        <button
                          aria-expanded={isDashboardCalendarExpanded}
                          aria-label={isDashboardCalendarExpanded ? 'Contraer calendario' : 'Expandir calendario'}
                          className={`campus-teacher__home-icon-btn campus-teacher__home-expand-btn${isDashboardCalendarExpanded ? ' is-expanded' : ''}`}
                          onClick={() => setIsDashboardCalendarExpanded((current) => !current)}
                          type="button"
                        >
                          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                            {isDashboardCalendarExpanded ? (
                              <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M21 15v6h-6M14 10l7-7M10 14l-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                            ) : (
                              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                            )}
                          </svg>
                        </button>
                      </div>
                    </header>

                    {!previewEnabled && teacherDashboardCalendarQuery.isLoading ? <p className="campus-panel__meta">Cargando calendario...</p> : null}
                    {!previewEnabled && teacherDashboardCalendarQuery.isError ? <p className="campus-panel__meta">No se pudo cargar el calendario de actividades.</p> : null}

                    <div className="campus-teacher__home-month-grid" role="list" aria-label={`Calendario de actividades del docente para ${formatMonthLabel(dashboardCalendarMonth)}`}>
                      {weekdayShortLabels.map((label) => (
                        <div className="campus-teacher__home-month-weekday" key={`home-calendar-weekday-${label}`} role="listitem" aria-hidden="true">
                          {label}
                        </div>
                      ))}
                      {dashboardCalendarGrid.map((cell) => (
                        cell.empty ? (
                          <div className="campus-teacher__home-month-empty" key={cell.key} aria-hidden="true" />
                        ) : (
                          <button
                            className={[
                              'campus-teacher__home-month-day',
                              cell.isToday ? 'is-today' : '',
                              cell.hasActivity ? 'has-activity' : '',
                              selectedDashboardCalendarDate === cell.dateValue ? 'is-selected' : '',
                            ].filter(Boolean).join(' ')}
                            key={cell.key}
                            onClick={() => setSelectedDashboardCalendarDate(cell.dateValue)}
                            role="listitem"
                            title={cell.title || undefined}
                            type="button"
                          >
                            <span>{cell.dayNumber}</span>
                            {cell.hasActivity ? <i aria-hidden="true" /> : null}
                          </button>
                        )
                      ))}
                    </div>

                    <div className="campus-teacher__home-day-panel">
                      <header>
                        <strong>
                          {selectedDashboardCalendarDay
                            ? selectedDashboardCalendarDay.formattedDate
                            : 'Selecciona un día'}
                        </strong>
                        <span>
                          {selectedDashboardCalendarDay
                            ? `${selectedDashboardCalendarDay.itemCount} actividad${selectedDashboardCalendarDay.itemCount === 1 ? '' : 'es'}`
                            : 'Del mes'}
                        </span>
                      </header>
                      <div className="campus-teacher__home-day-list">
                        {selectedDashboardCalendarDay?.items?.length ? selectedDashboardCalendarDay.items.map((item) => (
                          item.kind === 'activity' ? (
                            <button
                              className="campus-teacher__home-day-item"
                              key={item.key}
                              onClick={() => openAssignmentDetail(item)}
                              type="button"
                            >
                              <div className="campus-teacher__home-day-item-copy">
                                <strong>{getTimelineActivityCourseContext(item, academicCourses)}</strong>
                                <p>{item.label}</p>
                              </div>
                              <span className="campus-teacher__home-day-tag">{item.typeLabel || 'Actividad'}</span>
                            </button>
                          ) : (
                            <article className="campus-teacher__home-day-item is-static" key={item.key}>
                              <div className="campus-teacher__home-day-item-copy">
                                <strong>{item.label}</strong>
                                <p>{item.description}</p>
                              </div>
                              <span className="campus-teacher__home-day-tag tone-class">{item.meta || 'Clase'}</span>
                            </article>
                          )
                        )) : (
                          <p className="campus-teacher__home-day-empty">
                            {selectedDashboardCalendarDay
                              ? 'No hay actividades programadas para este día.'
                              : 'Elige un día del calendario para ver sus actividades.'}
                          </p>
                        )}
                      </div>
                    </div>
                  </article>

                  <article className="campus-teacher__home-performance" id="teacher-home-performance">
                    <header className="campus-teacher__home-card-head">
                      <div className="campus-teacher__home-card-title">
                        <span className="campus-teacher__home-card-icon tone-performance" aria-hidden="true">
                          <TeacherDashboardKpiIcon kind="average" />
                        </span>
                        <div>
                          <strong>Rendimiento por curso</strong>
                          <p>Promedio general por curso</p>
                        </div>
                      </div>
                      <button
                        className="campus-teacher__home-text-link"
                        onClick={() => setActiveTeacherSection('academic_management')}
                        type="button"
                      >
                        Ver reporte completo →
                      </button>
                    </header>

                    <div className="campus-teacher__home-performance-list">
                      {visibleDashboardCoursePerformance.length > 0 ? visibleDashboardCoursePerformance.map((course) => (
                        <button
                          className={`campus-teacher__home-performance-row tone-${course.tone}`}
                          key={course.id}
                          onClick={() => openCourseFromSearch(course.id)}
                          type="button"
                        >
                          <div className="campus-teacher__home-performance-meta">
                            <strong>{course.label}</strong>
                            <span
                              style={course.color ? { color: course.color } : undefined}
                              title={course.levelLabel || undefined}
                            >
                              {course.averageScore === null ? 'Sin notas' : course.averageScore}
                            </span>
                          </div>
                          <div className="campus-teacher__home-performance-track" aria-hidden="true">
                            <span
                              style={{
                                width: `${course.percent}%`,
                                ...(course.color ? { background: course.color } : {}),
                              }}
                            />
                          </div>
                        </button>
                      )) : (
                        <p className="campus-teacher__home-day-empty">Todavía no tienes cursos con promedio para mostrar.</p>
                      )}
                      {dashboardCoursePerformance.length > 8 ? (
                        <p className="campus-teacher__home-performance-more">
                          Mostrando 8 de {dashboardCoursePerformance.length}. Usa “Ver reporte completo” para el resto.
                        </p>
                      ) : null}
                    </div>
                  </article>
                </div>

                <article className="campus-teacher__home-submissions" id="teacher-home-submissions">
                    <header className="campus-teacher__home-card-head">
                      <div className="campus-teacher__home-card-title">
                        <span className="campus-teacher__home-card-icon tone-submissions" aria-hidden="true">
                          <TeacherDashboardKpiIcon kind="submissions" />
                        </span>
                        <div>
                          <strong>Entregas de asignaciones</strong>
                          <p>Quién ha entregado actividades</p>
                        </div>
                      </div>
                      <button
                        className="campus-teacher__home-text-link"
                        onClick={() => setActiveIntegralModal('submissions')}
                        type="button"
                      >
                        Ver todas →
                      </button>
                    </header>

                    <div className="campus-teacher__home-submissions-list">
                      {isOverviewMetricsLoading ? (
                        <p className="campus-teacher__home-day-empty">Cargando entregas de los alumnos...</p>
                      ) : visibleDashboardAssignmentSubmissions.length > 0 ? visibleDashboardAssignmentSubmissions.map((item) => (
                        <button
                          className="campus-teacher__home-submission-row"
                          key={item.id}
                          onClick={() => openAssignmentSubmissionsFromDashboard(item)}
                          type="button"
                        >
                          <div className="campus-teacher__home-submission-copy">
                            <strong>{item.studentName}</strong>
                            <span>
                              {item.assignmentTitle}
                              {item.courseTitle ? ` · ${item.courseTitle}` : ''}
                            </span>
                          </div>
                          <em>{item.submittedAtLabel}</em>
                        </button>
                      )) : (
                        <p className="campus-teacher__home-day-empty">
                          Todavía no hay entregas de alumnos en tus asignaciones.
                        </p>
                      )}
                    </div>
                    {!isOverviewMetricsLoading && integralOverview.assignmentSubmissionCount > visibleDashboardAssignmentSubmissions.length ? (
                      <p className="campus-teacher__home-performance-more">
                        Mostrando {visibleDashboardAssignmentSubmissions.length} de {integralOverview.assignmentSubmissionCount}. Usa “Ver todas” para el resto.
                      </p>
                    ) : null}
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

                {activeIntegralModal === 'submissions' ? (
                  <div className="campus-teacher__timeline-modal-backdrop" onClick={() => setActiveIntegralModal('')} role="presentation">
                    <div
                      aria-label="Entregas de asignaciones"
                      aria-modal="true"
                      className="campus-teacher__timeline-modal"
                      onClick={(event) => event.stopPropagation()}
                      role="dialog"
                    >
                      <div className="campus-teacher__timeline-modal-head">
                        <div>
                          <span className="campus-panel__kicker">Entregas</span>
                          <h3>
                            {integralOverview.assignmentSubmissionCount === 1
                              ? '1 alumno ya entregó una actividad'
                              : `${integralOverview.assignmentSubmissionCount} entregas de alumnos`}
                          </h3>
                        </div>
                        <button className="campus-teacher__ghost-btn" onClick={() => setActiveIntegralModal('')} type="button">
                          Cerrar
                        </button>
                      </div>

                      <div className="campus-teacher__timeline-modal-body">
                        {integralOverview.assignmentSubmissions.length > 0 ? integralOverview.assignmentSubmissions.map((item) => (
                          <button
                            className="campus-teacher__timeline-modal-item is-activity is-clickable"
                            key={item.id}
                            onClick={() => openAssignmentSubmissionsFromDashboard(item)}
                            type="button"
                          >
                            <span className="campus-teacher__timeline-modal-item-kind">{item.assignmentType}</span>
                            <strong>{item.studentName}</strong>
                            <span>
                              {item.assignmentTitle}
                              {item.courseTitle ? ` · ${item.courseTitle}` : ''}
                              {item.studentGrade ? ` · ${item.studentGrade}` : ''}
                            </span>
                            <p>Entregó {item.submittedAtLabel}.</p>
                            <span className="campus-teacher__timeline-modal-item-action">Ver evidencia</span>
                          </button>
                        )) : <p className="campus-panel__meta">Todavía no hay entregas de alumnos en tus asignaciones.</p>}
                        {integralOverview.assignmentSubmissionCount > integralOverview.assignmentSubmissions.length ? (
                          <p className="campus-panel__meta">
                            Mostrando las {integralOverview.assignmentSubmissions.length} entregas más recientes.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            ) : null}

            {activeTeacherSection === 'schedule' ? (
              <article className="campus-teacher__horario-panel campus-teacher__embedded-panel">
                <header className="campus-teacher__horario-hero">
                  <div>
                    <span className="campus-teacher__horario-kicker">Horario</span>
                    <h2>Consultar el horario asignado desde Rectoría.</h2>
                    <p>Aquí puedes ver tus clases, espacios y bloques asignados para la semana.</p>
                  </div>
                  <button
                    className="campus-teacher__horario-export"
                    disabled={(teacherWeeklySchedule?.slots || []).length === 0}
                    onClick={() => {
                      exportTeacherWeeklyScheduleCsv(teacherWeeklySchedule, teacherWeeklySchedule?.weekdays || []);
                      setNotice({ type: 'success', text: 'Horario exportado en CSV.' });
                    }}
                    type="button"
                  >
                    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                      <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                      <path d="M5 19h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                    </svg>
                    Exportar horario
                  </button>
                </header>

                <div className="campus-teacher__horario-tiles">
                  <article className="campus-teacher__horario-tile tone-blue">
                    <span aria-hidden="true">
                      <svg fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
                        <path d="M12 8v4.5l3 1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                      </svg>
                    </span>
                    <div>
                      <strong>Jornada base</strong>
                      <p>{scheduleBaseRangeLabel}</p>
                    </div>
                  </article>
                  <article className="campus-teacher__horario-tile tone-purple">
                    <span aria-hidden="true">
                      <svg fill="none" viewBox="0 0 24 24">
                        <rect height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" width="14" x="5" y="5" />
                        <path d="M9 3v4M15 3v4M5 10h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                      </svg>
                    </span>
                    <div>
                      <strong>Los espacios sin clase</strong>
                      <p>se muestran dentro de la jornada.</p>
                    </div>
                  </article>
                  <article className="campus-teacher__horario-tile tone-green">
                    <span aria-hidden="true">
                      <svg fill="none" viewBox="0 0 24 24">
                        <path d="M9 11l3 3L20 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                        <path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                      </svg>
                    </span>
                    <div>
                      <strong>Horario semanal designado</strong>
                      <p>Rectoría define estos bloques según tus asignaturas y cursos.</p>
                    </div>
                  </article>
                </div>

                {(teacherWeeklySchedule?.slots || []).length > 0 ? (
                  <>
                    <div className="campus-teacher__horario-toolbar">
                      <div className="campus-teacher__horario-week-nav">
                        <button
                          aria-label="Semana anterior"
                          className="campus-teacher__horario-icon-btn"
                          onClick={() => setScheduleWeekAnchor((current) => addDaysToDate(current, -7))}
                          type="button"
                        >
                          ‹
                        </button>
                        <button
                          aria-label="Semana siguiente"
                          className="campus-teacher__horario-icon-btn"
                          onClick={() => setScheduleWeekAnchor((current) => addDaysToDate(current, 7))}
                          type="button"
                        >
                          ›
                        </button>
                        <div className="campus-teacher__horario-week-label">
                          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                            <rect height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="5" />
                            <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                          </svg>
                          <strong>{scheduleWeekRangeLabel}</strong>
                        </div>
                      </div>

                      <div className="campus-teacher__horario-toolbar-actions">
                        <div className="campus-teacher__horario-mode" role="group" aria-label="Vista del horario">
                          <button
                            className={scheduleViewMode === 'week' ? 'is-active' : ''}
                            onClick={() => setScheduleViewMode('week')}
                            type="button"
                          >
                            Semana
                          </button>
                          <button
                            className={scheduleViewMode === 'day' ? 'is-active' : ''}
                            onClick={() => {
                              setScheduleViewMode('day');
                              const today = new Date().getDay();
                              setScheduleSelectedWeekday(today >= 1 && today <= 5 ? today : 1);
                            }}
                            type="button"
                          >
                            Día
                          </button>
                        </div>
                      </div>
                    </div>

                    {scheduleViewMode === 'day' ? (
                      <div className="campus-teacher__horario-day-picker" role="tablist" aria-label="Día de la semana">
                        {scheduleWeekdays.map((day) => (
                          <button
                            className={Number(scheduleSelectedWeekday) === Number(day.key) ? 'is-active' : ''}
                            key={`schedule-day-pick-${day.key}`}
                            onClick={() => setScheduleSelectedWeekday(day.key)}
                            type="button"
                          >
                            <strong>{day.shortLabel || day.label}</strong>
                            <span>{day.dateLabel}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="campus-teacher__horario-table-wrap">
                      <table className={`campus-teacher__horario-table${scheduleViewMode === 'day' ? ' is-day' : ''}`}>
                        <thead>
                          <tr>
                            <th scope="col">Hora</th>
                            {visibleScheduleWeekdays.map((day) => (
                              <th key={day.key} scope="col">
                                <span>{day.label}</span>
                                <strong>{day.dateLabel}</strong>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(teacherWeeklySchedule.slots || []).map((slot) => {
                            const visibleDays = (slot.days || []).filter((day) => (
                              visibleScheduleWeekdays.some((weekday) => Number(weekday.key) === Number(day.weekday))
                            ));

                            return (
                              <tr key={slot.key}>
                                <th scope="row">{slot.label}</th>
                                {visibleDays.map((day) => (
                                  <td key={`${slot.key}-${day.weekday}`}>
                                    {(day.items || []).length > 0 ? (
                                      <div className="campus-teacher__horario-cell-stack">
                                        {day.items.map((item) => {
                                          const groupLabel = getCourseGroupLabel(item) || getCourseGradeLabel(item) || item.studentGradeKey || 'Grupo';
                                          const subjectLine = [item.subject, getCourseGradeLabel(item) || item.studentGradeKey]
                                            .filter(Boolean)
                                            .join(' · ');
                                          return (
                                            <article
                                              className="campus-teacher__horario-class-card"
                                              key={item.key}
                                              style={{ '--campus-schedule-accent': item.colorToken || '#2a6f97' }}
                                            >
                                              <span>{subjectLine || item.courseTitle || 'Curso'}</span>
                                              <strong>{String(groupLabel).toUpperCase()}</strong>
                                              <small>{formatTimeRange(item.startTime, item.endTime)}</small>
                                              <em>{item.label || 'Bloque de clase'}</em>
                                            </article>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <span className="campus-teacher__horario-empty">—</span>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="campus-panel__meta">Coordinación aún no ha asignado jornadas de clase para este docente.</p>
                )}
              </article>
            ) : null}

            {isComergioAcademySection(activeTeacherSection) ? (
              <article className="campus-teacher__academy-panel campus-teacher__embedded-panel">
                <ComergioAcademyPanel
                  activeKey={activeTeacherSection}
                  onNavigate={setActiveTeacherSection}
                />
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
      </div>
    </section>
  );
}

export default TeacherCampusHome;
