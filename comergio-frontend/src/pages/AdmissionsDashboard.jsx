import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { resolveApiAssetUrl } from '../lib/api';
import { redirectToLoginPage } from '../lib/authNavigation';
import { getSchoolDisplayName } from '../lib/schools';
import useAuthStore from '../store/auth.store';
import AcademicSecretaryDashboard from './AcademicSecretaryDashboard';
import {
  createAdmissionApplicant,
  createAdmissionEvent,
  deleteAdmissionApplicant,
  deleteAdmissionDocument,
  deleteAdmissionEvent,
  finalizeAdmissionEnrollment,
  getAdmissionApplicant,
  getAdmissions,
  setAdmissionStage,
  transitionAdmissionStage,
  updateAdmissionApplicant,
  updateAdmissionDocument,
  updateAdmissionEvent,
  uploadAdmissionDocuments,
} from '../services/admissions.service';
import './AdmissionsDashboard.css';

const emptyApplicantForm = {
  fullName: '',
  birthDate: '',
  previousSchool: '',
  guardianName: '',
  guardianEmail: '',
  guardianPhone: '',
  grade: '',
  academicYear: String(new Date().getFullYear()),
  referenceOrigin: '',
};

const emptyEventForm = {
  title: '',
  notes: '',
  stageKey: '',
  responsible: '',
  appointmentType: '',
  appointmentDate: '',
  appointmentTime: '',
  guardianEmail: '',
  clientVisible: false,
};

const emptyDocumentForm = {
  type: 'otro',
  note: '',
  clientVisible: false,
  files: null,
};

const ADMISSIONS_VIEW_OPTIONS = [
  { key: 'dashboard', label: 'Dashboard', status: '', empty: '' },
  { key: 'agenda', label: 'Agenda', status: '', empty: '' },
  { key: 'aspirantes', label: 'Aspirantes', status: 'active', empty: 'No hay aspirantes con esos filtros.' },
  { key: 'desistidos', label: 'Desistidos', status: 'withdrawn', empty: 'No hay desistidos con esos filtros.' },
  { key: 'costos', label: 'Costos', status: '', empty: '' },
  { key: 'marketing', label: 'Marketing', status: '', empty: '' },
  { key: 'matricula', label: 'Matrícula', status: '', empty: '' },
];

const APPOINTMENT_TYPE_OPTIONS = [
  { value: 'virtual', label: 'Cita virtual' },
  { value: 'phone', label: 'Llamada telefónica' },
  { value: 'in_person', label: 'Cita presencial' },
];

const CALENDAR_WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function toAdmissionUpper(value) {
  return String(value || '').toLocaleUpperCase('es-CO');
}

function keepTechnicalValue(key, value) {
  return ['stage', 'status', 'grade', 'from', 'to', 'birthDate', 'guardianEmail', 'clientVisible', 'files', 'type', 'appointmentType', 'appointmentDate', 'appointmentTime'].includes(key) ? value : toAdmissionUpper(value);
}

function normalizeAdmissionGradeOptions(gradeOptions = []) {
  const seenValues = new Set();
  return (Array.isArray(gradeOptions) ? gradeOptions : [])
    .map((grade) => {
      const value = String(grade?.value || grade?.label || grade?.key || '').trim();
      const label = String(grade?.label || grade?.value || grade?.key || '').trim();
      return { value, label: label || value };
    })
    .filter((grade) => {
      if (!grade.value || seenValues.has(grade.value)) return false;
      seenValues.add(grade.value);
      return true;
    });
}

function calculateAgeFromBirthDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;

  const birthDate = new Date(year, month - 1, day);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed = today.getMonth() > birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasBirthdayPassed) age -= 1;

  return age >= 0 ? age : null;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateForExcel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function downloadExcelWorkbook(sheetName, headers, rows, fileBaseName) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${fileBaseName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function DownloadExcelIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3v11" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M5 19h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function PencilActionIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 20h4.5L19 9.5a2.1 2.1 0 0 0 0-3L17.5 5a2.1 2.1 0 0 0-3 0L4 15.5V20Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      <path d="m13.5 6 4.5 4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}

function DeleteActionIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 7 17 17M17 7 7 17" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

function getStageCode(stageTemplates, stageKey) {
  const index = stageTemplates.findIndex((stage) => stage.key === stageKey);
  return index >= 0 ? `E${index + 1}` : '-';
}

function getStageLabel(stageTemplates, stageKey) {
  return stageTemplates.find((stage) => stage.key === stageKey)?.label || stageKey || '-';
}

function getApplicantStatusLabel(applicant) {
  if (applicant?.status === 'withdrawn') return 'Desistido';
  if (applicant?.status === 'enrolled') return 'Matriculado';
  return 'En proceso';
}

const ADMISSION_WORKLIST_EXPORT_HEADERS = [
  'Aspirante',
  'Documento',
  'Grado/programa',
  'Año académico',
  'Fecha de nacimiento',
  'Edad',
  'Colegio de procedencia',
  'Acudiente',
  'Teléfono acudiente',
  'Correo acudiente',
  'Referencia/origen',
  'Código etapa',
  'Etapa',
  'Estado',
  'Fecha de registro',
  'Última actualización',
];

function buildApplicantFormFromRecord(applicant = {}) {
  return {
    fullName: applicant.studentName || [applicant.student?.firstName, applicant.student?.lastName].filter(Boolean).join(' '),
    birthDate: formatDateForExcel(applicant.student?.birthDate),
    previousSchool: applicant.student?.previousSchool || '',
    guardianName: applicant.guardian?.name || '',
    guardianEmail: applicant.guardian?.email || '',
    guardianPhone: applicant.guardian?.phone || '',
    grade: applicant.grade || '',
    academicYear: applicant.academicYear || String(new Date().getFullYear()),
    referenceOrigin: applicant.source?.referenceOrigin || '',
  };
}

function buildApplicantPayloadFromForm(applicantForm = {}) {
  return {
    student: {
      firstName: applicantForm.fullName,
      lastName: '',
      birthDate: applicantForm.birthDate,
      previousSchool: applicantForm.previousSchool,
    },
    guardian: {
      name: applicantForm.guardianName,
      email: applicantForm.guardianEmail,
      phone: applicantForm.guardianPhone,
    },
    grade: applicantForm.grade,
    academicYear: applicantForm.academicYear,
    source: {
      referenceOrigin: applicantForm.referenceOrigin,
    },
  };
}

function getAppointmentTypeLabel(type) {
  return APPOINTMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label || '-';
}

function formatAppointmentDateTime(appointment = {}) {
  if (appointment?.scheduledAt) return formatDateTime(appointment.scheduledAt);
  if (appointment?.date && appointment?.time) return `${formatDate(appointment.date)} ${appointment.time}`;
  return '-';
}

function buildAppointmentEventDefaults(payload = {}) {
  const appointmentLabel = getAppointmentTypeLabel(payload.appointmentType);
  const appointmentDateTime = formatAppointmentDateTime({ date: payload.appointmentDate, time: payload.appointmentTime });
  return {
    title: payload.title || 'CITA AGENDADA',
    notes: payload.notes || `CITA AGENDADA: ${appointmentLabel} · ${appointmentDateTime}`,
  };
}

function normalizeAdmissionEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getLocalDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getAppointmentDateKey(eventItem = {}) {
  return getLocalDateKey(eventItem.appointment?.date || eventItem.appointment?.scheduledAt);
}

function formatCalendarDayLabel(dateKey) {
  if (!dateKey) return '-';
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function buildCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstGridDate = new Date(year, month, 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDate);
    date.setDate(firstGridDate.getDate() + index);
    return {
      date,
      key: getLocalDateKey(date),
      dayNumber: date.getDate(),
      inCurrentMonth: date.getMonth() === month,
    };
  });
}

function normalizeDocumentTypes(documentTypes = {}) {
  return Object.entries(documentTypes).map(([value, label]) => ({ value, label }));
}

function AdmissionsDashboard({ activeView = '', embedded = false } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { stageKey: routeStageKey = '' } = useParams();
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [internalView, setInternalView] = useState(queryParams.get('view') || 'dashboard');
  const currentView = ADMISSIONS_VIEW_OPTIONS.some((option) => option.key === (activeView || internalView)) ? (activeView || internalView) : 'dashboard';
  const currentViewConfig = ADMISSIONS_VIEW_OPTIONS.find((option) => option.key === currentView) || ADMISSIONS_VIEW_OPTIONS[0];
  const isWorklistView = ['aspirantes', 'desistidos'].includes(currentView);
  const schoolDisplayName = getSchoolDisplayName(user, 'Colegio');
  const userDisplayName = user?.name || user?.username || 'Usuario';
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [applicants, setApplicants] = useState([]);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [stageTemplates, setStageTemplates] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [admissionGradeOptions, setAdmissionGradeOptions] = useState([]);
  const [metrics, setMetrics] = useState({ total: 0, inProcess: 0, enrolled: 0, withdrawn: 0 });
  const [stageCounts, setStageCounts] = useState({});
  const [globalEvents, setGlobalEvents] = useState([]);
  const [scheduledEvents, setScheduledEvents] = useState([]);
  const [agendaMonthDate, setAgendaMonthDate] = useState(() => new Date());
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(() => getLocalDateKey(new Date()));
  const [selectedStageApplicantIds, setSelectedStageApplicantIds] = useState([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    document: '',
    guardian: '',
    stage: routeStageKey || queryParams.get('stage') || '',
    grade: '',
    from: '',
    to: '',
    status: currentViewConfig.status,
  });
  const [applicantForm, setApplicantForm] = useState(emptyApplicantForm);
  const [showApplicantForm, setShowApplicantForm] = useState(false);
  const [editingApplicantId, setEditingApplicantId] = useState('');
  const [deleteApplicantCandidate, setDeleteApplicantCandidate] = useState(null);
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [editingEventId, setEditingEventId] = useState('');
  const [documentForm, setDocumentForm] = useState(emptyDocumentForm);

  const selectedApplicantId = selectedApplicant?.id || selectedApplicant?._id || '';
  const selectedApplicantGuardianEmail = normalizeAdmissionEmail(selectedApplicant?.guardian?.email);
  const activeStageKey = selectedApplicant?.currentStageKey || stageTemplates[0]?.key || '';
  const visibleStageApplicantIds = useMemo(() => applicants.map((applicant) => String(applicant.id || applicant._id || '')).filter(Boolean), [applicants]);
  const selectedStageApplicantCount = selectedStageApplicantIds.length;
  const allVisibleStageApplicantsSelected = Boolean(visibleStageApplicantIds.length) && visibleStageApplicantIds.every((applicantId) => selectedStageApplicantIds.includes(applicantId));
  const applicantAge = useMemo(() => calculateAgeFromBirthDate(applicantForm.birthDate), [applicantForm.birthDate]);
  const applicantAgeLabel = applicantAge === null ? '' : `${applicantAge} ${applicantAge === 1 ? 'año' : 'años'}`;
  const calendarDays = useMemo(() => buildCalendarDays(agendaMonthDate), [agendaMonthDate]);
  const agendaMonthLabel = agendaMonthDate.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const todayDateKey = getLocalDateKey(new Date());
  const eventsByDate = useMemo(() => scheduledEvents.reduce((accumulator, eventItem) => {
    const dateKey = getAppointmentDateKey(eventItem);
    if (!dateKey) return accumulator;
    if (!accumulator[dateKey]) accumulator[dateKey] = [];
    accumulator[dateKey].push(eventItem);
    accumulator[dateKey].sort((left, right) => String(left.appointment?.time || '').localeCompare(String(right.appointment?.time || '')));
    return accumulator;
  }, {}), [scheduledEvents]);
  const selectedAgendaEvents = eventsByDate[selectedAgendaDate] || [];

  const loadAdmissions = useCallback(async (nextFilters = filters, { keepSelection = true } = {}) => {
    setLoading(true);
    setError('');
    try {
      const response = await getAdmissions(nextFilters);
      const data = response.data || {};
      setApplicants(data.applicants || []);
      setStageTemplates(data.stageTemplates || []);
      setDocumentTypes(normalizeDocumentTypes(data.documentTypes || {}));
      setAdmissionGradeOptions(normalizeAdmissionGradeOptions(data.gradeOptions || []));
      setMetrics(data.metrics || { total: 0, inProcess: 0, enrolled: 0, withdrawn: 0 });
      setStageCounts(data.stageCounts || {});
      setGlobalEvents(data.globalEvents || []);
      setScheduledEvents(data.scheduledEvents || []);

      const requestedApplicantId = keepSelection ? queryParams.get('applicantId') : '';
      const currentSelectionId = keepSelection ? selectedApplicantId : '';
      const nextSelectionId = requestedApplicantId || currentSelectionId;
      const nextSelected = nextSelectionId
        ? (data.applicants || []).find((applicant) => String(applicant.id) === String(nextSelectionId))
        : null;
      if (nextSelected) {
        setSelectedApplicant(nextSelected);
      } else if (keepSelection && nextSelectionId) {
        const applicantResponse = await getAdmissionApplicant(nextSelectionId);
        setSelectedApplicant(applicantResponse.data?.applicant || null);
      } else {
        setSelectedApplicant(null);
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError.message || 'No se pudo cargar admisiones.');
    } finally {
      setLoading(false);
    }
  }, [filters, queryParams, selectedApplicantId]);

  const refreshSelectedApplicant = useCallback(async (applicantId = selectedApplicantId) => {
    if (!applicantId) return;
    const response = await getAdmissionApplicant(applicantId);
    setSelectedApplicant(response.data?.applicant || null);
  }, [selectedApplicantId]);

  useEffect(() => {
    const stageFromUrl = routeStageKey || queryParams.get('stage') || '';
    const viewFromUrl = queryParams.get('view') || currentView;
    const viewConfig = ADMISSIONS_VIEW_OPTIONS.find((option) => option.key === viewFromUrl) || currentViewConfig;
    const nextStatus = stageFromUrl && viewConfig.key === 'dashboard' ? 'active' : viewConfig.status;
    setInternalView(viewConfig.key);
    setFilters((previous) => ({ ...previous, stage: stageFromUrl, status: nextStatus }));
    loadAdmissions({ ...filters, stage: stageFromUrl, status: nextStatus }, { keepSelection: true });
  }, []);

  useEffect(() => {
    const nextStatus = currentView === 'dashboard' && filters.stage ? 'active' : currentViewConfig.status;
    setFilters((previous) => ({ ...previous, status: nextStatus }));
    loadAdmissions({ ...filters, status: nextStatus }, { keepSelection: false });
  }, [currentView]);

  useEffect(() => {
    if (!isWorklistView) {
      return undefined;
    }

    const nextFilters = { ...filters, status: currentViewConfig.status };
    const filterTimer = setTimeout(() => {
      const params = new URLSearchParams();
      params.set('view', currentView);
      if (nextFilters.stage) params.set('stage', nextFilters.stage);
      if (!embedded) {
        navigate({ pathname: '/academic-secretary/admissions', search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
      }
      loadAdmissions(nextFilters, { keepSelection: false });
    }, 320);

    return () => clearTimeout(filterTimer);
  }, [filters.search, filters.guardian, filters.stage, filters.grade, filters.from, filters.to, currentView]);

  useEffect(() => {
    if (!message && !error) return undefined;
    const feedbackTimer = setTimeout(() => {
      setMessage('');
      setError('');
    }, 7000);
    return () => clearTimeout(feedbackTimer);
  }, [message, error]);

  useEffect(() => {
    if (!selectedApplicantId || editingEventId) return;
    setEventForm((previous) => ({ ...previous, guardianEmail: selectedApplicantGuardianEmail }));
  }, [selectedApplicantId, selectedApplicantGuardianEmail, editingEventId]);

  const clearFeedback = () => {
    setMessage('');
    setError('');
  };

  const openPortalView = (viewKey) => {
    const viewConfig = ADMISSIONS_VIEW_OPTIONS.find((option) => option.key === viewKey) || ADMISSIONS_VIEW_OPTIONS[0];
    const nextFilters = { ...filters, stage: '', status: viewConfig.status };
    setInternalView(viewConfig.key);
    setFilters(nextFilters);
    setSelectedApplicant(null);
    setSelectedStageApplicantIds([]);
    if (!embedded) {
      navigate(`/academic-secretary/admissions?view=${viewConfig.key}`, { replace: true });
    }
  };

  const handleLogout = () => {
    logout();
    redirectToLoginPage();
  };

  const updateFilter = (key, value) => {
    setFilters((previous) => ({ ...previous, [key]: keepTechnicalValue(key, value) }));
  };

  const updateApplicantForm = (key, value) => {
    setApplicantForm((previous) => ({ ...previous, [key]: keepTechnicalValue(key, value) }));
  };

  const updateEventForm = (key, value) => {
    setEventForm((previous) => ({ ...previous, [key]: keepTechnicalValue(key, value) }));
  };

  const updateDocumentForm = (key, value) => {
    setDocumentForm((previous) => ({ ...previous, [key]: keepTechnicalValue(key, value) }));
  };

  const openNewApplicantForm = () => {
    setEditingApplicantId('');
    setApplicantForm(emptyApplicantForm);
    setShowApplicantForm(true);
  };

  const closeApplicantForm = () => {
    setShowApplicantForm(false);
    setEditingApplicantId('');
    setApplicantForm(emptyApplicantForm);
  };

  const openEditApplicantForm = (event, applicant) => {
    event.stopPropagation();
    const applicantId = applicant?.id || applicant?._id || '';
    if (!applicantId) return;
    setEditingApplicantId(applicantId);
    setApplicantForm(buildApplicantFormFromRecord(applicant));
    setShowApplicantForm(true);
  };

  const openDeleteApplicantConfirm = (event, applicant) => {
    event.stopPropagation();
    setDeleteApplicantCandidate(applicant);
  };

  const toggleStageApplicantSelection = (applicantId) => {
    const normalizedApplicantId = String(applicantId || '');
    if (!normalizedApplicantId) return;
    setSelectedStageApplicantIds((previous) => previous.includes(normalizedApplicantId)
      ? previous.filter((selectedId) => selectedId !== normalizedApplicantId)
      : [...previous, normalizedApplicantId]);
  };

  const toggleAllStageApplicants = () => {
    setSelectedStageApplicantIds(allVisibleStageApplicantsSelected ? [] : visibleStageApplicantIds);
  };

  const clearFilters = async () => {
    const nextFilters = { search: '', document: '', guardian: '', stage: '', grade: '', from: '', to: '', status: currentViewConfig.status };
    setFilters(nextFilters);
    if (!embedded) {
      navigate(`/academic-secretary/admissions?view=${currentView}`, { replace: true });
    }
    await loadAdmissions(nextFilters, { keepSelection: false });
  };

  const downloadWorklistExcel = () => {
    if (!applicants.length) {
      setError('No hay registros para descargar en esta vista.');
      return;
    }

    const rows = applicants.map((applicant) => {
      const birthDate = applicant.student?.birthDate || '';
      return [
        applicant.studentName || '',
        applicant.student?.documentNumber || '',
        applicant.grade || '',
        applicant.academicYear || '',
        formatDateForExcel(birthDate),
        calculateAgeFromBirthDate(formatDateForExcel(birthDate)) ?? '',
        applicant.student?.previousSchool || '',
        applicant.guardian?.name || '',
        applicant.guardian?.phone || '',
        applicant.guardian?.email || '',
        applicant.source?.referenceOrigin || '',
        getStageCode(stageTemplates, applicant.currentStageKey),
        getStageLabel(stageTemplates, applicant.currentStageKey),
        getApplicantStatusLabel(applicant),
        formatDateForExcel(applicant.createdAt),
        formatDateForExcel(applicant.updatedAt),
      ];
    });

    const fileBaseName = currentView === 'desistidos' ? 'admisiones-desistidos' : 'admisiones-aspirantes';
    downloadExcelWorkbook(currentViewConfig.label, ADMISSION_WORKLIST_EXPORT_HEADERS, rows, fileBaseName);
  };

  const selectApplicant = async (applicant) => {
    const applicantId = applicant?.id || applicant?._id || '';
    if (!applicantId) return;
    setSelectedApplicant(applicant);
    const response = await getAdmissionApplicant(applicantId);
    setSelectedApplicant(response.data?.applicant || applicant);
    const params = new URLSearchParams(location.search);
    params.set('applicantId', applicantId);
    params.set('student', applicant.studentName || '');
    params.set('guardian', applicant.guardian?.name || '');
    if (!embedded) {
      params.set('view', currentView);
      navigate({ pathname: '/academic-secretary/admissions', search: `?${params.toString()}` }, { replace: true });
    }
  };

  const openStage = async (stageKey) => {
    const nextFilters = { ...filters, stage: stageKey, status: 'active' };
    setSelectedStageApplicantIds([]);
    setFilters(nextFilters);
    if (!embedded) {
      navigate(`/academic-secretary/admissions/stage/${stageKey}?view=${currentView}`);
    }
    await loadAdmissions(nextFilters, { keepSelection: false });
  };

  const runApplicantAction = async (action, successMessage = 'Acción completada.') => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await action();
      if (response?.data?.applicant) setSelectedApplicant(response.data.applicant);
      if (response?.data?.summary) {
        setMetrics(response.data.summary.metrics || metrics);
        setStageCounts(response.data.summary.stageCounts || stageCounts);
        setGlobalEvents(response.data.summary.globalEvents || globalEvents);
        setScheduledEvents(response.data.summary.scheduledEvents || scheduledEvents);
      }
      await loadAdmissions(filters, { keepSelection: true });
      setMessage(successMessage);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError.message || 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  const submitApplicantForm = async (event) => {
    event.preventDefault();
    const payload = buildApplicantPayloadFromForm(applicantForm);
    await runApplicantAction(
      () => editingApplicantId ? updateAdmissionApplicant(editingApplicantId, payload) : createAdmissionApplicant(payload),
      editingApplicantId ? 'Aspirante actualizado.' : 'Aspirante creado.'
    );
    closeApplicantForm();
  };

  const confirmDeleteApplicant = async () => {
    const applicantId = deleteApplicantCandidate?.id || deleteApplicantCandidate?._id || '';
    const applicantName = deleteApplicantCandidate?.studentName || 'Aspirante';
    if (!applicantId) return;
    await runApplicantAction(() => deleteAdmissionApplicant(applicantId), `${applicantName} eliminado.`);
    setDeleteApplicantCandidate(null);
  };

  const moveStage = (direction) => {
    if (!selectedApplicantId) return;
    runApplicantAction(() => transitionAdmissionStage(selectedApplicantId, { direction }), 'Etapa actualizada.');
  };

  const jumpToStage = (stageKey) => {
    if (!selectedApplicantId) return;
    runApplicantAction(() => setAdmissionStage(selectedApplicantId, stageKey), 'Etapa actualizada.');
  };

  const finalizeEnrollment = () => {
    if (!selectedApplicantId) return;
    runApplicantAction(() => finalizeAdmissionEnrollment(selectedApplicantId), 'Matrícula finalizada.');
  };

  const markApplicantWithdrawn = () => {
    if (!selectedApplicantId) return;
    runApplicantAction(() => updateAdmissionApplicant(selectedApplicantId, { status: 'withdrawn' }), 'Aspirante marcado como desistido.');
  };

  const markSelectedStageApplicantsWithdrawn = async () => {
    if (!selectedStageApplicantCount) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await Promise.all(selectedStageApplicantIds.map((applicantId) => updateAdmissionApplicant(applicantId, { status: 'withdrawn' })));
      setSelectedStageApplicantIds([]);
      setSelectedApplicant(null);
      const nextFilters = { ...filters, status: 'active' };
      setFilters(nextFilters);
      await loadAdmissions(nextFilters, { keepSelection: false });
      setMessage(`${selectedStageApplicantCount} aspirante(s) enviado(s) a desistidos.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError.message || 'No se pudieron desistir los aspirantes seleccionados.');
    } finally {
      setBusy(false);
    }
  };

  const reactivateApplicant = () => {
    if (!selectedApplicantId) return;
    runApplicantAction(() => updateAdmissionApplicant(selectedApplicantId, { status: 'active' }), 'Aspirante reactivado.');
  };

  const submitEvent = async (event) => {
    event.preventDefault();
    if (!selectedApplicantId) return;
    let payload = { ...eventForm, stageKey: eventForm.stageKey || activeStageKey };
    const hasAppointmentDraft = Boolean(payload.appointmentType || payload.appointmentDate || payload.appointmentTime);
    if (hasAppointmentDraft && (!payload.appointmentType || !payload.appointmentDate || !payload.appointmentTime)) {
      setError('Completa tipo, fecha y hora para agendar la cita.');
      return;
    }
    if (hasAppointmentDraft && !normalizeAdmissionEmail(payload.guardianEmail)) {
      setError('Completa el correo del acudiente para enviar la cita.');
      return;
    }
    if (payload.stageKey === 'agendamiento' && hasAppointmentDraft) {
      payload = { ...payload, ...buildAppointmentEventDefaults(payload) };
    }
    if (payload.stageKey === 'agendamiento' && !payload.title) {
      payload = { ...payload, title: 'EVENTO REGISTRADO' };
    }
    await runApplicantAction(
      () => editingEventId ? updateAdmissionEvent(selectedApplicantId, editingEventId, payload) : createAdmissionEvent(selectedApplicantId, payload),
      editingEventId ? 'Evento actualizado.' : 'Evento registrado.'
    );
    setEventForm({ ...emptyEventForm, guardianEmail: selectedApplicantGuardianEmail });
    setEditingEventId('');
    await refreshSelectedApplicant();
  };

  const editEvent = (eventItem) => {
    setEditingEventId(eventItem._id || eventItem.id || '');
    setEventForm({
      title: toAdmissionUpper(eventItem.title),
      notes: toAdmissionUpper(eventItem.notes),
      stageKey: eventItem.stageKey || activeStageKey,
      responsible: toAdmissionUpper(eventItem.responsible),
      appointmentType: eventItem.appointment?.type || '',
      appointmentDate: eventItem.appointment?.date || '',
      appointmentTime: eventItem.appointment?.time || '',
      guardianEmail: normalizeAdmissionEmail(eventItem.appointment?.guardianEmail || selectedApplicantGuardianEmail),
      clientVisible: Boolean(eventItem.clientVisible),
    });
  };

  const removeEvent = (eventId) => {
    if (!selectedApplicantId || !eventId) return;
    runApplicantAction(() => deleteAdmissionEvent(selectedApplicantId, eventId), 'Evento eliminado.');
  };

  const submitDocuments = async (event) => {
    event.preventDefault();
    if (!selectedApplicantId || !documentForm.files?.length) return;
    await runApplicantAction(() => uploadAdmissionDocuments(selectedApplicantId, documentForm), 'Documento subido.');
    setDocumentForm(emptyDocumentForm);
    event.currentTarget.reset();
    await refreshSelectedApplicant();
  };

  const removeDocument = (documentId) => {
    if (!selectedApplicantId || !documentId) return;
    runApplicantAction(() => deleteAdmissionDocument(selectedApplicantId, documentId), 'Documento eliminado.');
  };

  const toggleDocumentVisibility = (documentItem) => {
    const documentId = documentItem._id || documentItem.id || '';
    if (!selectedApplicantId || !documentId) return;
    runApplicantAction(() => updateAdmissionDocument(selectedApplicantId, documentId, { clientVisible: !documentItem.clientVisible }), 'Visibilidad actualizada.');
  };

  const currentStageIndex = stageTemplates.findIndex((stage) => stage.key === activeStageKey);
  const isFinalStage = activeStageKey === 'matriculados' && selectedApplicant?.status === 'enrolled';
  const isWithdrawn = selectedApplicant?.status === 'withdrawn';
  const showApplicantDetail = Boolean(selectedApplicant);
  const canCreateApplicant = !showApplicantDetail && ['dashboard', 'aspirantes'].includes(currentView);
  const canShowApplicantForm = !showApplicantDetail && (canCreateApplicant || Boolean(editingApplicantId));
  const selectedStageTemplate = stageTemplates.find((stage) => stage.key === filters.stage) || null;
  const showStageDrilldown = currentView === 'dashboard' && Boolean(selectedStageTemplate);

  const closeStageDrilldown = async () => {
    const nextFilters = { ...filters, stage: '', status: currentViewConfig.status };
    setFilters(nextFilters);
    setSelectedApplicant(null);
    setSelectedStageApplicantIds([]);
    if (!embedded) {
      navigate('/academic-secretary/admissions?view=dashboard', { replace: true });
    }
    await loadAdmissions(nextFilters, { keepSelection: false });
  };

  const openApplicantFromStage = (applicant) => {
    selectApplicant(applicant);
  };

  const closeApplicantDetail = () => {
    setSelectedApplicant(null);
    setEditingEventId('');
    setEventForm(emptyEventForm);
    if (!embedded) {
      const params = new URLSearchParams(location.search);
      params.delete('applicantId');
      params.delete('student');
      params.delete('guardian');
      navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
    }
  };

  const detailEvents = (selectedApplicant?.admissionEvents || [])
    .slice()
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));
  const activeStageDisplay = `${getStageCode(stageTemplates, activeStageKey)} - ${getStageLabel(stageTemplates, activeStageKey)}`;
  const showAppointmentScheduler = activeStageKey === 'agendamiento' || eventForm.stageKey === 'agendamiento';

  const clearEventForm = () => {
    setEditingEventId('');
    setEventForm({ ...emptyEventForm, guardianEmail: selectedApplicantGuardianEmail });
  };

  const moveAgendaMonth = (direction) => {
    setAgendaMonthDate((currentDate) => new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  const goToTodayAgenda = () => {
    const today = new Date();
    setAgendaMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedAgendaDate(getLocalDateKey(today));
  };

  const selectAgendaDay = (day) => {
    setSelectedAgendaDate(day.key);
    if (!day.inCurrentMonth) {
      setAgendaMonthDate(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
    }
  };

  return (
    <section className={`admissions-page dashboard-shell${embedded ? '' : ' admissions-portal-page'}`}>
      {!embedded ? (
        <header className="admissions-portal-header">
          <div className="admissions-portal-brand">
            <strong>Comergio</strong>
            <span aria-hidden="true" />
            <p>{schoolDisplayName}</p>
          </div>
          <div className="admissions-user-menu">
            <span className="admissions-portal-context">Admisiones</span>
            <span>{userDisplayName}</span>
            <button className="admissions-user-menu-button" type="button" aria-label="Abrir menú de usuario" onClick={() => setShowUserMenu((value) => !value)}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 12a4.25 4.25 0 1 0-4.25-4.25A4.25 4.25 0 0 0 12 12Zm0 2c-4 0-7 1.9-7 4.4V20h14v-1.6C19 15.9 16 14 12 14Z" fill="currentColor" /></svg>
            </button>
            {showUserMenu ? (
              <div className="admissions-user-dropdown">
                <button type="button" onClick={handleLogout}>Cerrar sesión</button>
              </div>
            ) : null}
          </div>
        </header>
      ) : null}
      <div className={embedded ? 'admissions-embedded-shell' : 'admissions-portal-shell'}>
        {!embedded ? (
          <aside className="admissions-sidebar" aria-label="Navegación de admisiones">
            {ADMISSIONS_VIEW_OPTIONS.map((option) => (
              <button key={option.key} className={`admissions-sidebar-item${currentView === option.key ? ' is-active' : ''}`} type="button" onClick={() => openPortalView(option.key)}>
                <span>{option.label}</span>
              </button>
            ))}
          </aside>
        ) : null}
      <section className="dashboard-stage admin-dashboard-stage admissions-stage">
        <div className="admin-dashboard-main admissions-main">
          {message ? (
            <div className="admissions-feedback is-success" role="status">
              <span>{message}</span>
              <button type="button" aria-label="Cerrar aviso" onClick={clearFeedback}>×</button>
            </div>
          ) : null}
          {error ? (
            <div className="admissions-feedback is-error" role="alert">
              <span>{error}</span>
              <button type="button" aria-label="Cerrar aviso" onClick={clearFeedback}>×</button>
            </div>
          ) : null}

          {canCreateApplicant ? (
            <div className="admissions-action-bar">
              <div className="admissions-action-stack">
                <button className="primary-button admissions-primary" type="button" onClick={openNewApplicantForm}>
                  + Aspirante
                </button>
                {showStageDrilldown ? (
                  <button className="admissions-withdraw-selected-button" type="button" disabled={busy || !selectedStageApplicantCount} onClick={markSelectedStageApplicantsWithdrawn}>
                    Desistir
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {showStageDrilldown && !showApplicantDetail ? (
            <section className="admissions-stage-results">
              <div className="admissions-stage-toolbar">
                <button className="secondary-button admissions-back-button" type="button" onClick={closeStageDrilldown}>← Volver</button>
              </div>
              <div className="admissions-stage-results-header">
                <div>
                  <h1>Aspirantes en estado: {selectedStageTemplate.label}</h1>
                  <p>Listado de aspirantes filtrados por su estado actual en admisiones.</p>
                  <span>Se cargaron {applicants.length} aspirante(s) en este estado.</span>
                </div>
              </div>

              <div className="admissions-stage-summary-grid">
                <article className="dashboard-card admissions-stage-summary-card">
                  <span>Total en estado</span>
                  <strong>{applicants.length}</strong>
                  <p>Aspirantes actualmente ubicados en esta etapa.</p>
                </article>
                <article className="dashboard-card admissions-stage-summary-card">
                  <span>Estado consultado</span>
                  <strong>{selectedStageTemplate.code || getStageCode(stageTemplates, selectedStageTemplate.key)} · {selectedStageTemplate.label}</strong>
                  <p>Valor tomado desde la distribución del dashboard.</p>
                </article>
              </div>

              <section className="dashboard-card tracking-table-card admissions-stage-table-card">
                <div className="admin-panel-heading admissions-stage-table-heading">
                  <div>
                    <h2>Aspirantes en este estado</h2>
                    <p>Se muestra información completa de cada registro filtrado por etapa.</p>
                  </div>
                  <span>{applicants.length} aspirante(s)</span>
                </div>
                <div className="tracking-table-wrap">
                  <table className="tracking-data-table admissions-stage-results-table">
                    <thead>
                      <tr>
                        <th className="admissions-check-column"><input type="checkbox" aria-label="Seleccionar todos los aspirantes" checked={allVisibleStageApplicantsSelected} disabled={!visibleStageApplicantIds.length} onChange={toggleAllStageApplicants} /></th>
                        <th>Aspirante</th><th>Grado que aspira</th><th>Fecha de nacimiento</th><th>Colegio de procedencia</th><th>Acudiente</th><th>Teléfono</th><th>Correo</th><th>Referencia</th><th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? <tr><td colSpan="10"><div className="empty-state">Cargando aspirantes...</div></td></tr> : null}
                      {!loading && applicants.length ? applicants.map((applicant) => (
                        <tr className={selectedApplicantId === applicant.id ? 'is-selected' : ''} key={applicant.id} onClick={() => openApplicantFromStage(applicant)}>
                          <td className="admissions-check-column" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Seleccionar ${applicant.studentName || 'aspirante'}`} checked={selectedStageApplicantIds.includes(String(applicant.id || applicant._id || ''))} onChange={() => toggleStageApplicantSelection(applicant.id || applicant._id)} /></td>
                          <td>{applicant.studentName}</td>
                          <td>{applicant.grade || '-'}</td>
                          <td>{formatDate(applicant.student?.birthDate)}</td>
                          <td>{applicant.student?.previousSchool || '-'}</td>
                          <td>{applicant.guardian?.name || '-'}</td>
                          <td>{applicant.guardian?.phone || '-'}</td>
                          <td>{applicant.guardian?.email || '-'}</td>
                          <td>{applicant.source?.referenceOrigin || '-'}</td>
                          <td><button className="tracking-icon-button" type="button" onClick={(event) => { event.stopPropagation(); openApplicantFromStage(applicant); }}>→</button></td>
                        </tr>
                      )) : null}
                      {!loading && !applicants.length ? <tr><td colSpan="10"><div className="empty-state">No hay aspirantes en este estado.</div></td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          ) : currentView === 'dashboard' && !showApplicantDetail ? (
            <>
              <section className="admin-metrics-grid" aria-label="Métricas de admisiones">
                <article className="metric-card admin-metric-card"><span>Total interesados</span><strong>{metrics.total || 0}</strong><p>Aspirantes registrados.</p></article>
                <article className="metric-card admin-metric-card"><span>En proceso</span><strong>{metrics.inProcess || 0}</strong><p>E2 a E6 activos.</p></article>
                <article className="metric-card admin-metric-card"><span>Matriculados</span><strong>{metrics.enrolled || 0}</strong><p>Proceso finalizado.</p></article>
                <article className="metric-card admin-metric-card"><span>Desistidos</span><strong>{metrics.withdrawn || 0}</strong><p>Procesos cerrados.</p></article>
              </section>

              <section className="dashboard-card admin-distribution-card">
                <div className="admin-panel-heading"><div><h2>Distribución por estado</h2><p>{metrics.total || 0} aspirantes distribuidos entre las etapas del proceso.</p></div></div>
                <div className="stage-distribution-grid">
                  {stageTemplates.map((stage, index) => (
                    <button className="stage-distribution-item stage-distribution-link" key={stage.key} type="button" onClick={() => openStage(stage.key)}>
                      <span>{stage.code || `E${index + 1}`}</span><strong>{stage.label}</strong><b>{stageCounts[stage.key] || 0}</b>
                    </button>
                  ))}
                </div>
              </section>

              <section className="dashboard-card tracking-table-card admin-events-card">
                <div className="admin-panel-heading"><div><h2>Últimos eventos generales</h2><p>Actividad reciente de aspirantes.</p></div></div>
                <div className="tracking-table-wrap">
                  <table className="tracking-data-table">
                    <thead><tr><th>Fecha</th><th>Aspirante</th><th>Grado</th><th>Etapa</th><th>Título</th><th>Acudiente</th></tr></thead>
                    <tbody>
                      {globalEvents.length ? globalEvents.map((eventItem) => (
                        <tr key={`${eventItem.applicantId}-${eventItem._id || eventItem.id || eventItem.createdAt}`} onClick={() => selectApplicant({ id: eventItem.applicantId, studentName: eventItem.studentName, student: {}, guardian: { name: eventItem.guardianName || '' } })}>
                          <td>{formatDateTime(eventItem.updatedAt || eventItem.createdAt)}</td>
                          <td>{eventItem.studentName}</td>
                          <td>{eventItem.grade || '-'}</td>
                          <td>{getStageCode(stageTemplates, eventItem.stageKey)} {eventItem.stageLabel || getStageLabel(stageTemplates, eventItem.stageKey)}</td>
                          <td>{eventItem.title}</td>
                          <td>{eventItem.guardianName || '-'}</td>
                        </tr>
                      )) : <tr><td colSpan="6"><div className="empty-state">Sin eventos recientes.</div></td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}

          {showApplicantForm && canShowApplicantForm ? (
            <div className="admissions-modal-backdrop" role="presentation" onClick={closeApplicantForm}>
              <section className="dashboard-card tracking-selector-panel admissions-create-card admissions-create-modal" role="dialog" aria-modal="true" aria-labelledby="admissions-create-title" onClick={(event) => event.stopPropagation()}>
                <div className="admissions-modal-header">
                  <div className="admissions-modal-title-block">
                    <span>Admisiones</span>
                    <h2 id="admissions-create-title">{editingApplicantId ? 'Editar aspirante' : 'Nuevo aspirante'}</h2>
                    <p>{editingApplicantId ? 'Modifica la información registrada del aspirante.' : 'Registra la información inicial del proceso de admisión.'}</p>
                  </div>
                  <button className="tracking-icon-button" type="button" aria-label="Cerrar" onClick={closeApplicantForm}>×</button>
                </div>
                <form className="admissions-modal-form" onSubmit={submitApplicantForm}>
                  <div className="admissions-modal-sections">
                    <fieldset className="admissions-form-section admissions-form-section-wide">
                      <legend>Datos del aspirante</legend>
                      <div className="tracking-search-grid admissions-create-grid">
                        <label><span>Nombres y apellidos</span><input placeholder="Nombre completo" value={applicantForm.fullName} onChange={(event) => updateApplicantForm('fullName', event.target.value)} /></label>
                        <label><span>Fecha de nacimiento</span><input type="date" value={applicantForm.birthDate} onChange={(event) => updateApplicantForm('birthDate', event.target.value)} /></label>
                        <label><span>Edad</span><input value={applicantAgeLabel} readOnly placeholder="Automática" /></label>
                        <label><span>Colegio de procedencia</span><input placeholder="Colegio de procedencia" value={applicantForm.previousSchool} onChange={(event) => updateApplicantForm('previousSchool', event.target.value)} /></label>
                      </div>
                    </fieldset>
                    <fieldset className="admissions-form-section">
                      <legend>Acudiente</legend>
                      <div className="admissions-create-grid admissions-create-grid-compact">
                        <label><span>Nombre</span><input placeholder="Acudiente" value={applicantForm.guardianName} onChange={(event) => updateApplicantForm('guardianName', event.target.value)} /></label>
                        <label><span>Email</span><input placeholder="Email acudiente" value={applicantForm.guardianEmail} onChange={(event) => updateApplicantForm('guardianEmail', event.target.value)} /></label>
                        <label><span>Teléfono</span><input placeholder="Teléfono" value={applicantForm.guardianPhone} onChange={(event) => updateApplicantForm('guardianPhone', event.target.value)} /></label>
                      </div>
                    </fieldset>
                    <fieldset className="admissions-form-section admissions-form-section-small">
                      <legend>Proceso</legend>
                      <div className="admissions-create-grid admissions-create-grid-compact">
                        <label>
                          <span>Grado/programa</span>
                          <select value={applicantForm.grade} disabled={!admissionGradeOptions.length} onChange={(event) => updateApplicantForm('grade', event.target.value)}>
                            <option value="">{admissionGradeOptions.length ? 'Selecciona grado' : 'Sin grados configurados'}</option>
                            {admissionGradeOptions.map((grade) => (
                              <option key={grade.value} value={grade.value}>{grade.label}</option>
                            ))}
                          </select>
                        </label>
                        <label><span>Año</span><input placeholder="Año" value={applicantForm.academicYear} onChange={(event) => updateApplicantForm('academicYear', event.target.value)} /></label>
                      </div>
                    </fieldset>
                    <fieldset className="admissions-form-section admissions-form-section-source">
                      <legend>Fuente</legend>
                      <div className="admissions-create-grid admissions-create-grid-compact">
                        <label><span>Referencia/Origen</span><input placeholder="Referencia/Origen" value={applicantForm.referenceOrigin} onChange={(event) => updateApplicantForm('referenceOrigin', event.target.value)} /></label>
                      </div>
                    </fieldset>
                  </div>
                  <div className="admissions-modal-actions">
                    <button className="secondary-button" type="button" onClick={closeApplicantForm}>Cancelar</button>
                    <button className="primary-button" disabled={busy} type="submit">{editingApplicantId ? 'Guardar cambios' : 'Crear aspirante'}</button>
                  </div>
                </form>
              </section>
            </div>
          ) : null}

          {deleteApplicantCandidate ? (
            <div className="admissions-modal-backdrop" role="presentation" onClick={() => setDeleteApplicantCandidate(null)}>
              <section className="dashboard-card admissions-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="admissions-delete-title" onClick={(event) => event.stopPropagation()}>
                <div className="admissions-modal-header">
                  <div className="admissions-modal-title-block">
                    <span>Confirmación</span>
                    <h2 id="admissions-delete-title">Eliminar aspirante</h2>
                    <p>¿Deseas borrar a {deleteApplicantCandidate.studentName || 'este aspirante'}?</p>
                  </div>
                  <button className="tracking-icon-button" type="button" aria-label="Cerrar" onClick={() => setDeleteApplicantCandidate(null)}>×</button>
                </div>
                <div className="admissions-modal-actions">
                  <button className="secondary-button" disabled={busy} type="button" onClick={() => setDeleteApplicantCandidate(null)}>Cancelar</button>
                  <button className="secondary-button admissions-danger-button" disabled={busy} type="button" onClick={confirmDeleteApplicant}>Eliminar</button>
                </div>
              </section>
            </div>
          ) : null}

          {isWorklistView && !showApplicantDetail ? <section className="dashboard-card tracking-selector-panel admissions-worklist-card">
            <div className="admin-panel-heading">
              <div><h2>{currentViewConfig.label}</h2><p>Filtra por aspirante, acudiente, etapa, grado y rango de fechas.</p></div>
              <button className="admissions-export-button" disabled={loading || !applicants.length} onClick={downloadWorklistExcel} title={`Descargar ${currentViewConfig.label} en Excel`} type="button">
                <DownloadExcelIcon />
                <span>Excel</span>
              </button>
            </div>
            <div className="tracking-search-grid">
              <input placeholder="Nombre del aspirante" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} />
              <input placeholder="Acudiente/familia" value={filters.guardian} onChange={(event) => updateFilter('guardian', event.target.value)} />
              <select value={filters.stage} onChange={(event) => updateFilter('stage', event.target.value)}><option value="">Todas las etapas</option>{stageTemplates.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select>
              <input placeholder="Grado/programa" value={filters.grade} onChange={(event) => updateFilter('grade', event.target.value)} />
              <input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} />
              <input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} />
              <button className="secondary-button" type="button" onClick={clearFilters}>Limpiar</button>
            </div>
            <div className="tracking-table-wrap">
              <table className="tracking-data-table tracking-search-results-table">
                <thead><tr><th>Aspirante</th><th>Grado que aspira</th><th>Fecha de nacimiento</th><th>Colegio de procedencia</th><th>Acudiente</th><th>Teléfono</th><th>Correo</th><th>Referencia</th><th>Acciones</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan="9"><div className="empty-state">Cargando aspirantes...</div></td></tr> : null}
                  {!loading && applicants.length ? applicants.map((applicant) => (
                    <tr className={selectedApplicantId === applicant.id ? 'is-selected' : ''} key={applicant.id} onClick={() => selectApplicant(applicant)}>
                      <td>{applicant.studentName}</td>
                      <td>{applicant.grade || '-'}</td>
                      <td>{formatDate(applicant.student?.birthDate)}</td>
                      <td>{applicant.student?.previousSchool || '-'}</td>
                      <td>{applicant.guardian?.name || '-'}</td>
                      <td>{applicant.guardian?.phone || '-'}</td>
                      <td>{applicant.guardian?.email || '-'}</td>
                      <td>{applicant.source?.referenceOrigin || '-'}</td>
                      <td>
                        <div className="admissions-row-actions">
                          <button className="tracking-icon-button" type="button" aria-label={`Abrir ${applicant.studentName || 'aspirante'}`} title="Abrir" onClick={(event) => { event.stopPropagation(); selectApplicant(applicant); }}>→</button>
                          <button className="tracking-icon-button" type="button" aria-label={`Editar ${applicant.studentName || 'aspirante'}`} title="Editar" onClick={(event) => openEditApplicantForm(event, applicant)}><PencilActionIcon /></button>
                          <button className="tracking-icon-button admissions-row-delete-button" type="button" aria-label={`Eliminar ${applicant.studentName || 'aspirante'}`} title="Eliminar" onClick={(event) => openDeleteApplicantConfirm(event, applicant)}><DeleteActionIcon /></button>
                        </div>
                      </td>
                    </tr>
                  )) : null}
                  {!loading && !applicants.length ? <tr><td colSpan="9"><div className="empty-state">{currentViewConfig.empty}</div></td></tr> : null}
                </tbody>
              </table>
            </div>
          </section> : null}

          {currentView === 'costos' && !showApplicantDetail ? (
            <AcademicSecretaryDashboard embedded initialSection="costs" />
          ) : null}

          {currentView === 'marketing' && !showApplicantDetail ? (
            <AcademicSecretaryDashboard embedded initialSection="marketing" />
          ) : null}

          {currentView === 'matricula' && !showApplicantDetail ? (
            <AcademicSecretaryDashboard embedded initialSection="enrollments" />
          ) : null}

          {currentView === 'agenda' && !showApplicantDetail ? (
            <section className="dashboard-card admissions-agenda-card">
              <div className="admissions-calendar-toolbar">
                <div>
                  <span>Agenda</span>
                  <h2>{agendaMonthLabel}</h2>
                </div>
                <div className="admissions-calendar-actions">
                  <button className="secondary-button" type="button" onClick={() => moveAgendaMonth(-1)} aria-label="Mes anterior">‹</button>
                  <button className="secondary-button" type="button" onClick={goToTodayAgenda}>Hoy</button>
                  <button className="secondary-button" type="button" onClick={() => moveAgendaMonth(1)} aria-label="Mes siguiente">›</button>
                </div>
              </div>
              <div className="admissions-calendar-layout">
                <div className="admissions-calendar-grid" role="grid" aria-label="Calendario de citas">
                  {CALENDAR_WEEKDAYS.map((weekday) => <div className="admissions-calendar-weekday" key={weekday}>{weekday}</div>)}
                  {calendarDays.map((day) => {
                    const dayEvents = eventsByDate[day.key] || [];
                    const isSelected = selectedAgendaDate === day.key;
                    const isToday = todayDateKey === day.key;
                    return (
                      <button className={`admissions-calendar-day${day.inCurrentMonth ? '' : ' is-muted'}${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`} key={day.key} type="button" onClick={() => selectAgendaDay(day)}>
                        <span>{day.dayNumber}</span>
                        <div className="admissions-calendar-day-events">
                          {dayEvents.slice(0, 3).map((eventItem) => (
                            <small key={`${day.key}-${eventItem.applicantId}-${eventItem._id || eventItem.id || eventItem.createdAt}`}>{eventItem.appointment?.time || '--:--'} {eventItem.studentName}</small>
                          ))}
                          {dayEvents.length > 3 ? <b>+{dayEvents.length - 3}</b> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <aside className="admissions-calendar-day-panel">
                  <div className="admissions-calendar-day-heading">
                    <span>{formatCalendarDayLabel(selectedAgendaDate)}</span>
                    <strong>{selectedAgendaEvents.length} cita(s)</strong>
                  </div>
                  <div className="admissions-calendar-event-list">
                    {selectedAgendaEvents.length ? selectedAgendaEvents.map((eventItem) => (
                      <button className="admissions-calendar-event-card" key={`${eventItem.applicantId}-${eventItem._id || eventItem.id || eventItem.createdAt}`} type="button" onClick={() => selectApplicant({ id: eventItem.applicantId, studentName: eventItem.studentName, student: {}, guardian: { name: eventItem.guardianName || '' } })}>
                        <time>{eventItem.appointment?.time || formatAppointmentDateTime(eventItem.appointment)}</time>
                        <div>
                          <strong>{eventItem.studentName}</strong>
                          <span>{eventItem.appointment?.label || getAppointmentTypeLabel(eventItem.appointment?.type)} · {eventItem.grade || 'SIN GRADO'}</span>
                          <p>{eventItem.guardianName || 'Sin acudiente'} · {eventItem.title}</p>
                        </div>
                      </button>
                    )) : <div className="empty-state">Sin citas agendadas.</div>}
                  </div>
                </aside>
              </div>
            </section>
          ) : null}

          {!['dashboard', 'agenda', 'aspirantes', 'desistidos', 'costos', 'matricula'].includes(currentView) && !showApplicantDetail ? (
            <section className="dashboard-card admissions-placeholder-card">
              <span>{currentViewConfig.label}</span>
              <h2>{currentViewConfig.label}</h2>
              <p>No hay registros para mostrar.</p>
            </section>
          ) : null}

          {showApplicantDetail && selectedApplicant ? (
            <section className="admissions-detail-page">
              <div className="admissions-detail-toolbar">
                <button className="secondary-button admissions-back-button" type="button" onClick={closeApplicantDetail}>← Volver</button>
              </div>

              <div className="admissions-detail-overview-grid">
                <article className="dashboard-card admissions-detail-summary-card">
                  <div className="admissions-detail-title-block">
                    <h1>{selectedApplicant.studentName}</h1>
                    <span>{activeStageDisplay}</span>
                    <b>{getApplicantStatusLabel(selectedApplicant)}</b>
                  </div>
                  <div className="admissions-detail-metadata">
                    <div><span>Grado que aspira</span><strong>{selectedApplicant.grade || '-'}</strong></div>
                    <div><span>Fecha de nacimiento</span><strong>{formatDate(selectedApplicant.student?.birthDate)}</strong></div>
                    <div><span>Colegio de procedencia</span><strong>{selectedApplicant.student?.previousSchool || '-'}</strong></div>
                    <div><span>Referencia</span><strong>{selectedApplicant.source?.referenceOrigin || '-'}</strong></div>
                    <div><span>Acudiente</span><strong>{selectedApplicant.guardian?.name || '-'}</strong></div>
                    <div><span>Teléfono</span><strong>{selectedApplicant.guardian?.phone || '-'}</strong></div>
                    <div><span>Correo</span><strong>{selectedApplicant.guardian?.email || '-'}</strong></div>
                    <div><span>Año</span><strong>{selectedApplicant.academicYear || '-'}</strong></div>
                  </div>
                </article>

                <article className="dashboard-card admissions-detail-transition-card">
                  <h2>Transición de etapa</h2>
                  <div className="admissions-detail-transition-actions">
                    <button className="secondary-button" disabled={busy || currentStageIndex <= 0} onClick={() => moveStage('previous')} type="button">← Anterior</button>
                    <button className="secondary-button" disabled={busy || isFinalStage || isWithdrawn} onClick={() => moveStage('next')} type="button">Siguiente →</button>
                  </div>
                  <p>Puedes avanzar o retroceder libremente. La etapa actual queda en proceso.</p>
                  <div className="admissions-detail-secondary-actions">
                    <button className="primary-button" disabled={busy || isFinalStage || isWithdrawn} onClick={finalizeEnrollment} type="button">Finalizar matrícula</button>
                    {isWithdrawn ? (
                      <button className="secondary-button" disabled={busy} onClick={reactivateApplicant} type="button">Reactivar</button>
                    ) : (
                      <button className="secondary-button admissions-danger-button" disabled={busy || isFinalStage} onClick={markApplicantWithdrawn} type="button">Marcar desistido</button>
                    )}
                  </div>
                </article>
              </div>

              <article className="dashboard-card admissions-detail-timeline-card">
                <h2>Timeline de etapas</h2>
                <div className="admissions-detail-timeline-grid">
                  {stageTemplates.map((stage, index) => {
                    const isCompleted = isFinalStage ? index <= currentStageIndex : index < currentStageIndex;
                    const isCurrent = stage.key === activeStageKey && !isFinalStage;
                    return (
                      <button key={stage.key} className={`admissions-detail-timeline-item ${isCompleted ? 'is-completed' : ''} ${isCurrent ? 'is-current' : ''} ${!isCompleted && !isCurrent ? 'is-pending' : ''}`} type="button" onClick={() => jumpToStage(stage.key)}>
                        <span>{stage.code || `E${index + 1}`}</span>
                        <small>{isCompleted ? 'Completada' : isCurrent ? 'En proceso' : 'Pendiente'}</small>
                        <strong>{stage.label}</strong>
                      </button>
                    );
                  })}
                </div>
              </article>

              <div className="admissions-detail-work-grid">
                <article className="dashboard-card admissions-detail-events-card">
                  <h2>Eventos recientes</h2>
                  <div className="tracking-table-wrap">
                    <table className="tracking-data-table admissions-detail-events-table">
                      <thead><tr><th>Fecha</th><th>Etapa</th><th>Título</th><th>Descripción</th><th>Cita</th><th>Acciones</th></tr></thead>
                      <tbody>
                        {detailEvents.map((eventItem) => {
                          const eventId = eventItem._id || eventItem.id || '';
                          return <tr key={eventId}><td>{formatDateTime(eventItem.updatedAt || eventItem.createdAt)}</td><td>{getStageCode(stageTemplates, eventItem.stageKey)}</td><td>{eventItem.title}</td><td>{eventItem.notes || '-'}</td><td>{eventItem.appointment?.type ? `${eventItem.appointment.label || getAppointmentTypeLabel(eventItem.appointment.type)} · ${formatAppointmentDateTime(eventItem.appointment)}` : '-'}</td><td className="tracking-actions-cell"><button onClick={() => editEvent(eventItem)} type="button">✎</button><button onClick={() => removeEvent(eventId)} type="button">×</button></td></tr>;
                        })}
                        {!detailEvents.length ? <tr><td colSpan="6"><div className="empty-state">Sin eventos.</div></td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </article>

                <form className="dashboard-card admissions-detail-new-event-card" onSubmit={submitEvent}>
                  <h2>Nuevo evento</h2>
                  <label><span>Título</span><input placeholder="Título" required={!showAppointmentScheduler} value={eventForm.title} onChange={(event) => updateEventForm('title', event.target.value)} /></label>
                  <label><span>Descripción</span><textarea placeholder="Descripción" value={eventForm.notes} onChange={(event) => updateEventForm('notes', event.target.value)} /></label>
                  <label><span>Etapa relacionada</span><select value={eventForm.stageKey || activeStageKey} onChange={(event) => updateEventForm('stageKey', event.target.value)}>{stageTemplates.map((stage) => <option key={stage.key} value={stage.key}>{getStageCode(stageTemplates, stage.key)} - {stage.label}</option>)}</select></label>
                  {showAppointmentScheduler ? (
                    <fieldset className="admissions-appointment-fieldset">
                      <legend>Agendar cita</legend>
                      <label><span>Tipo de cita</span><select value={eventForm.appointmentType} onChange={(event) => updateEventForm('appointmentType', event.target.value)}><option value="">Selecciona una opción</option>{APPOINTMENT_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                      <label><span>Fecha</span><input type="date" value={eventForm.appointmentDate} onChange={(event) => updateEventForm('appointmentDate', event.target.value)} /></label>
                      <label><span>Hora</span><input type="time" value={eventForm.appointmentTime} onChange={(event) => updateEventForm('appointmentTime', event.target.value)} /></label>
                      <label><span>Correo electrónico acudiente</span><input type="email" required placeholder="correo@familia.com" value={eventForm.guardianEmail} onChange={(event) => updateEventForm('guardianEmail', event.target.value)} /></label>
                    </fieldset>
                  ) : null}
                  <div className="admissions-detail-event-actions">
                    <button className="secondary-button" type="button" onClick={clearEventForm}>Limpiar</button>
                    <button className="primary-button" disabled={busy} type="submit">{editingEventId ? 'Actualizar' : '+ Registrar'}</button>
                  </div>
                </form>
              </div>
            </section>
          ) : null}
        </div>
      </section>
      </div>
    </section>
  );
}

export default AdmissionsDashboard;
