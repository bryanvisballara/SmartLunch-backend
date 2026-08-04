import { useEffect, useMemo, useRef, useState } from 'react';
import useAuthStore from '../store/auth.store';
import { getCampusDisciplineObservations } from '../campus/services/campus.service';
import {
  addPsychologyCaseNote,
  createPsychologyCase,
  getPsychologyDashboard,
  getPsychologyStudentProfile,
  searchPsychologyStudents,
  updatePsychologyCaseStatus,
} from '../services/psychology.service';
import CommunityReportsPanel from '../components/community/CommunityReportsPanel';
import TeEscuchamosLabel from '../components/community/TeEscuchamosLabel';
import StaffAnnouncementsPanel, { StaffAnnouncementsUnreadBadge, useStaffAnnouncementUnreadCount } from '../components/staff-announcements/StaffAnnouncementsPanel';
import ComergioAcademyPanel from '../components/comergio-academy/ComergioAcademyPanel';
import { isComergioAcademySection } from '../components/comergio-academy/academyNav';
import StaffPortalShell from '../components/staff-chrome/StaffPortalShell';
import { getSchoolDisplayName } from '../lib/schools';

const caseTypeOptions = [
  { value: 'bullying', label: 'Bullying' },
  { value: 'anxiety', label: 'Ansiedad' },
  { value: 'grief', label: 'Duelo' },
  { value: 'low_performance', label: 'Bajo rendimiento' },
  { value: 'aggression', label: 'Agresividad' },
  { value: 'coexistence', label: 'Convivencia' },
  { value: 'abuse_concern', label: 'Sospecha de abuso' },
  { value: 'family', label: 'Problemas familiares' },
  { value: 'substance_use', label: 'Consumo' },
  { value: 'vocational', label: 'Orientación vocacional' },
  { value: 'other', label: 'Otro' },
];

const priorityOptions = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const statusOptions = [
  { value: 'open', label: 'Abierto' },
  { value: 'follow_up', label: 'En seguimiento' },
  { value: 'escalated', label: 'Escalado' },
  { value: 'closed', label: 'Cerrado' },
];

const openCaseStatuses = new Set(['open', 'follow_up', 'escalated']);

const visibilityOptions = [
  { value: 'private', label: 'Nota privada', hint: 'Solo Psicología' },
  { value: 'institutional', label: 'Nota institucional', hint: 'Docentes, coordinación y directivos' },
  { value: 'family', label: 'Nota para padres', hint: 'Acudientes vinculados' },
  { value: 'shared_all', label: 'Compartida completa', hint: 'Institución y acudientes' },
];

const audienceOptions = [
  { value: 'teachers', label: 'Docentes' },
  { value: 'coordination', label: 'Coordinación' },
  { value: 'leadership', label: 'Rectoría/Dirección' },
  { value: 'parents', label: 'Padres' },
];

const emptyCaseForm = {
  title: '',
  caseType: 'other',
  priority: 'medium',
  status: 'open',
  summary: '',
  initialNote: '',
  recommendations: '',
  visibility: 'family',
  notifyAudiences: ['parents'],
  nextAction: '',
  nextActionAt: '',
  citeParents: false,
  appointmentDate: '',
  appointmentTime: '',
  appointmentModality: 'presencial',
  appointmentLocation: '',
};

const emptyNoteForm = {
  caseId: '',
  content: '',
  recommendations: '',
  visibility: 'private',
  notifyAudiences: [],
  status: '',
  priority: '',
  nextAction: '',
  nextActionAt: '',
};

function formatDateTime(value) {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatTodayBadge(date = new Date()) {
  const dayName = new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(date);
  const dayMonth = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);

  return {
    label: 'Hoy',
    dayMonth: dayMonth.replace('.', ''),
    dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1),
  };
}

function getOptionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || value || 'Sin definir';
}

function defaultAudiences(visibility) {
  if (visibility === 'family') return ['parents'];
  if (visibility === 'institutional') return ['teachers', 'coordination', 'leadership'];
  if (visibility === 'shared_all') return ['teachers', 'coordination', 'leadership', 'parents'];
  return [];
}

function getPersonInitials(name) {
  return String(name || 'E')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'E';
}

function toWhatsAppHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const withCountry = digits.length === 10 ? `57${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

function toMailHref(email) {
  const value = String(email || '').trim();
  return value ? `mailto:${value}` : '';
}

function PsychologyIcon({ name }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  if (name === 'alert') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 4.5 21 19H3L12 4.5z" />
        <path {...common} d="M12 10v4M12 16.5h.01" />
      </svg>
    );
  }
  if (name === 'shield') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 3.5 19 6.5v5.2c0 4.3-2.9 7.3-7 8.8-4.1-1.5-7-4.5-7-8.8V6.5L12 3.5z" />
        <path {...common} d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect {...common} x="3.5" y="5" width="17" height="15" rx="2" />
        <path {...common} d="M8 3.5v3M16 3.5v3M3.5 10h17" />
      </svg>
    );
  }
  if (name === 'clock') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="12" cy="12" r="8" />
        <path {...common} d="M12 8v4.5l2.5 1.5" />
      </svg>
    );
  }
  if (name === 'users') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M16 19v-1.2a3.3 3.3 0 0 0-3.3-3.3H7.3A3.3 3.3 0 0 0 4 17.8V19" />
        <circle {...common} cx="9.2" cy="8.2" r="2.7" />
        <path {...common} d="M20 19v-1a2.8 2.8 0 0 0-2.2-2.7M15.7 5.7a2.5 2.5 0 0 1 0 4.8" />
      </svg>
    );
  }
  if (name === 'search') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="11" cy="11" r="6.5" />
        <path {...common} d="M16.5 16.5 21 21" />
      </svg>
    );
  }
  if (name === 'chevron') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M9 6l6 6-6 6" />
      </svg>
    );
  }
  if (name === 'doc') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M7 3.5h7l4 4V20.5H7z" />
        <path {...common} d="M14 3.5V8h4.5M10 12h5M10 15.5h5" />
      </svg>
    );
  }
  if (name === 'plus') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  if (name === 'refresh') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4.5 12a7.5 7.5 0 0 1 12.7-5.4L20 9" />
        <path {...common} d="M20 4v5h-5M19.5 12a7.5 7.5 0 0 1-12.7 5.4L4 15" />
        <path {...common} d="M4 20v-5h5" />
      </svg>
    );
  }
  if (name === 'mood') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M3.5 14c2-3 4.2-4.5 6.5-4.5S14 12 16 14s4 3 4.5 1" />
        <circle cx="6.2" cy="8.2" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="10.2" cy="7.4" r="1.2" fill="#f59e0b" stroke="none" />
        <circle cx="14.2" cy="8.6" r="1.2" fill="#22c55e" stroke="none" />
        <circle cx="18" cy="10.2" r="1.2" fill="#3b82f6" stroke="none" />
      </svg>
    );
  }
  if (name === 'whatsapp') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 3.8a7.7 7.7 0 0 0-6.6 11.6L4.5 20l4.8-.9A7.7 7.7 0 1 0 12 3.8z" />
        <path {...common} d="M9.4 9.6c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.6l-.4.5c-.1.2 0 .4.2.7.4.5 1 .9 1.6 1.2.3.1.5 0 .7-.1l.6-.4c.2-.1.4-.1.6 0l1.5.8c.2.1.3.3.3.5 0 .7-.6 1.6-1.3 1.7-.9.2-2.3 0-4-1.3-1.5-1.2-2.4-2.8-2.6-3.6-.1-.6.2-1.4.6-1.9z" />
      </svg>
    );
  }
  if (name === 'mail') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect {...common} x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path {...common} d="m5 7.5 7 5.5 7-5.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...common} cx="12" cy="12" r="7.5" />
    </svg>
  );
}

function StudentAvatar({ student }) {
  const imageUrl = student?.thumbUrl || student?.imageUrl || '';
  const initials = getPersonInitials(student?.name);

  if (imageUrl) {
    return <img alt={student.name} className="psychology-student-avatar" src={imageUrl} />;
  }

  return <span className="psychology-student-avatar">{initials}</span>;
}

function AudiencePicker({ selected, onChange }) {
  const selectedSet = new Set(selected || []);

  return (
    <div className="psychology-audience-picker">
      {audienceOptions.map((option) => (
        <label key={option.value}>
          <input
            checked={selectedSet.has(option.value)}
            type="checkbox"
            onChange={(event) => {
              const nextSet = new Set(selectedSet);
              if (event.target.checked) {
                nextSet.add(option.value);
              } else {
                nextSet.delete(option.value);
              }
              onChange([...nextSet]);
            }}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

function PsychologyPortal() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const selectPanelRef = useRef(null);
  const [dashboard, setDashboard] = useState({ summary: {}, recentCases: [], typeStats: [], priorityStats: [] });
  const [disciplineObservations, setDisciplineObservations] = useState([]);
  const [query, setQuery] = useState('');
  const [studentLimit, setStudentLimit] = useState(30);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentProfile, setStudentProfile] = useState(null);
  const [caseForm, setCaseForm] = useState(emptyCaseForm);
  const [noteForm, setNoteForm] = useState(emptyNoteForm);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingCase, setSavingCase] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [closingCaseId, setClosingCaseId] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [calendarLink, setCalendarLink] = useState('');
  const [activePortalView, setActivePortalView] = useState('cases');
  const staffAnnouncementsUnreadQuery = useStaffAnnouncementUnreadCount(true);
  const staffAnnouncementsUnreadCount = Number(
    staffAnnouncementsUnreadQuery.data?.data?.unreadCount
    ?? staffAnnouncementsUnreadQuery.data?.unreadCount
    ?? 0
  );

  const cases = studentProfile?.cases || [];
  const guardians = studentProfile?.guardians || [];
  const activeCases = useMemo(
    () => (dashboard.recentCases || []).filter((item) => openCaseStatuses.has(String(item.status || ''))),
    [dashboard.recentCases]
  );
  const selectedCase = cases.find((item) => item.id === noteForm.caseId) || cases[0] || null;
  const todayBadge = useMemo(() => formatTodayBadge(), []);
  const filteredStudentsTitle = query.trim() ? 'Resultados' : 'Alumnos recientes';
  const canCreateCase = Boolean(
    selectedStudent?.id
    && caseForm.title.trim()
    && caseForm.summary.trim()
    && !savingCase
    && (!caseForm.citeParents || (caseForm.appointmentDate && caseForm.appointmentTime))
  );

  const timelineItems = useMemo(() => {
    return cases.flatMap((item) => [
      {
        id: `${item.id}-case`,
        date: item.createdAt,
        title: item.title,
        meta: `${getOptionLabel(caseTypeOptions, item.caseType)} · ${getOptionLabel(priorityOptions, item.priority)}`,
        text: item.summary,
        visibility: 'case',
      },
      ...(item.notes || []).map((note) => ({
        id: note.id,
        date: note.createdAt,
        title: getOptionLabel(visibilityOptions, note.visibility),
        meta: item.title,
        text: note.content,
        recommendations: note.recommendations,
        visibility: note.visibility,
      })),
    ]).sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0));
  }, [cases]);

  const refreshDashboard = () => {
    setLoadingDashboard(true);
    Promise.allSettled([getPsychologyDashboard(), getCampusDisciplineObservations({ limit: 20 })])
      .then(([dashboardResult, observationsResult]) => {
        setDashboard(
          dashboardResult.status === 'fulfilled'
            ? (dashboardResult.value.data || { summary: {}, recentCases: [], typeStats: [], priorityStats: [] })
            : { summary: {}, recentCases: [], typeStats: [], priorityStats: [] }
        );
        setDisciplineObservations(
          observationsResult.status === 'fulfilled'
            ? (observationsResult.value.observations || [])
            : []
        );
      })
      .catch(() => setDashboard({ summary: {}, recentCases: [], typeStats: [], priorityStats: [] }))
      .finally(() => setLoadingDashboard(false));
  };

  const refreshStudentProfile = (studentId) => {
    if (!studentId) {
      setStudentProfile(null);
      return;
    }

    setLoadingProfile(true);
    getPsychologyStudentProfile(studentId)
      .then((response) => {
        setStudentProfile(response.data || null);
        const firstCaseId = response.data?.cases?.[0]?.id || '';
        setNoteForm((currentForm) => ({ ...currentForm, caseId: currentForm.caseId || firstCaseId }));
      })
      .catch((error) => {
        setStudentProfile(null);
        setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo cargar el perfil psicológico.' });
      })
      .finally(() => setLoadingProfile(false));
  };

  useEffect(() => {
    refreshDashboard();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingStudents(true);

    searchPsychologyStudents({ q: query.trim(), limit: studentLimit })
      .then((response) => {
        if (!cancelled) setStudents(response.data?.students || []);
      })
      .catch(() => {
        if (!cancelled) setStudents([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingStudents(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, studentLimit]);

  const onSelectStudent = (student) => {
    setSelectedStudent(student);
    setCaseForm(emptyCaseForm);
    setNoteForm(emptyNoteForm);
    setNotice({ type: '', text: '' });
    setCalendarLink('');
    refreshStudentProfile(student.id);
  };

  const onClearSelection = () => {
    setSelectedStudent(null);
    setStudentProfile(null);
    setCaseForm(emptyCaseForm);
    setNoteForm(emptyNoteForm);
    setNotice({ type: '', text: '' });
    setCalendarLink('');
  };

  const onClearForm = () => {
    setCaseForm(emptyCaseForm);
    setNotice({ type: '', text: '' });
    setCalendarLink('');
  };

  const onCloseCase = async (caseItem) => {
    const caseId = String(caseItem?.id || '').trim();
    if (!caseId || closingCaseId) {
      return;
    }

    const confirmed = window.confirm(
      `¿Cerrar el seguimiento "${caseItem.title || 'sin título'}"${caseItem.student?.name ? ` de ${caseItem.student.name}` : ''}?`
    );
    if (!confirmed) {
      return;
    }

    setClosingCaseId(caseId);
    setNotice({ type: '', text: '' });
    try {
      await updatePsychologyCaseStatus(caseId, { status: 'closed' });
      setNotice({ type: 'success', text: 'Seguimiento cerrado correctamente.' });
      refreshDashboard();
      if (selectedStudent?.id) {
        refreshStudentProfile(selectedStudent.id);
      }
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo cerrar el seguimiento.' });
    } finally {
      setClosingCaseId('');
    }
  };

  const onOpenActiveCaseStudent = (caseItem) => {
    const student = caseItem?.student;
    if (!student?.id) {
      return;
    }
    onSelectStudent(student);
    onFocusStudentSearch();
  };

  const onShowAllStudents = () => {
    setQuery('');
    setStudentLimit(50);
  };

  const onFocusStudentSearch = () => {
    selectPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const updateCaseVisibility = (visibility) => {
    setCaseForm((currentForm) => ({ ...currentForm, visibility, notifyAudiences: defaultAudiences(visibility) }));
  };

  const updateNoteVisibility = (visibility) => {
    setNoteForm((currentForm) => ({ ...currentForm, visibility, notifyAudiences: defaultAudiences(visibility) }));
  };

  const onCreateCase = async (event) => {
    event.preventDefault();
    if (!selectedStudent?.id || !caseForm.title.trim() || !caseForm.summary.trim()) {
      setNotice({ type: 'error', text: 'Selecciona un estudiante y completa título y resumen.' });
      return;
    }
    if (caseForm.citeParents && (!caseForm.appointmentDate || !caseForm.appointmentTime)) {
      setNotice({ type: 'error', text: 'Para citar a los padres indica fecha y hora.' });
      return;
    }

    const citingParents = Boolean(caseForm.citeParents);
    setSavingCase(true);
    setNotice({ type: '', text: '' });
    setCalendarLink('');
    try {
      const response = await createPsychologyCase({ ...caseForm, studentId: selectedStudent.id });
      const appointmentResult = response.data?.appointmentEmailResult;
      const nextCalendarLink = response.data?.calendarLink || appointmentResult?.calendarLink || '';
      setCalendarLink(nextCalendarLink);
      setCaseForm(emptyCaseForm);

      let successText = 'Caso creado y comunicación enviada según visibilidad.';
      if (citingParents) {
        const sent = Number(appointmentResult?.sent || 0);
        const requested = Number(appointmentResult?.requested || 0);
        successText = requested
          ? `Caso creado. Citación enviada a ${sent} de ${requested} acudiente(s) por correo.`
          : 'Caso creado. No hay correos de acudientes para enviar la citación.';
      }
      setNotice({ type: 'success', text: successText });
      refreshStudentProfile(selectedStudent.id);
      refreshDashboard();
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo crear el caso.' });
    } finally {
      setSavingCase(false);
    }
  };

  const onAddNote = async (event) => {
    event.preventDefault();
    const targetCaseId = noteForm.caseId || selectedCase?.id || '';
    if (!targetCaseId || !noteForm.content.trim()) {
      setNotice({ type: 'error', text: 'Selecciona un caso y escribe la nota.' });
      return;
    }

    setSavingNote(true);
    setNotice({ type: '', text: '' });
    try {
      const payload = Object.fromEntries(Object.entries(noteForm).filter(([, value]) => value !== ''));
      await addPsychologyCaseNote(targetCaseId, payload);
      setNoteForm({ ...emptyNoteForm, caseId: targetCaseId });
      setNotice({ type: 'success', text: 'Nota agregada y compartida según visibilidad.' });
      refreshStudentProfile(selectedStudent.id);
      refreshDashboard();
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo agregar la nota.' });
    } finally {
      setSavingNote(false);
    }
  };

  const schoolName = getSchoolDisplayName(user, 'Colegio');
  const summary = dashboard.summary || {};

  return (
    <StaffPortalShell
      activeKey={activePortalView}
      navItems={[
        { key: 'cases', label: 'Casos clínicos' },
        { key: 'community_reports', label: <TeEscuchamosLabel className="te-escuchamos-label--nav" /> },
        {
          key: 'staff_announcements',
          label: (
            <>
              Comunicados internos
              <StaffAnnouncementsUnreadBadge count={staffAnnouncementsUnreadCount} />
            </>
          ),
        },
      ]}
      navLabel="Psicología"
      onLogout={logout}
      onNavigate={setActivePortalView}
      portalLabel="Psicología"
      schoolName={schoolName}
      userName={user?.name || user?.username || 'Psicología'}
    >
      <div className="psychology-portal">
        {notice.text ? <div className={`psychology-notice ${notice.type || 'info'}`}>{notice.text}</div> : null}

        {isComergioAcademySection(activePortalView) ? (
          <ComergioAcademyPanel
            activeKey={activePortalView}
            className="psychology-panel"
            onNavigate={setActivePortalView}
            showLandingCards={false}
          />
        ) : null}

        {activePortalView === 'staff_announcements' ? (
          <StaffAnnouncementsPanel
            className="psychology-panel"
            description="Mensajes internos de rectoría y coordinación. Confirma la lectura para que quede registrado."
            mode="inbox"
            title="Comunicados internos"
          />
        ) : null}

        {activePortalView === 'community_reports' ? (
          <CommunityReportsPanel className="community-reports-panel--embedded" />
        ) : null}

        {activePortalView === 'cases' ? (
          <>
            <section className="psychology-kpi-grid">
              <article className="psychology-kpi-card tone-danger">
                <span className="psychology-kpi-card__icon" aria-hidden="true"><PsychologyIcon name="alert" /></span>
                <div>
                  <span>Casos urgentes</span>
                  <strong>{summary.urgentCount || 0}</strong>
                  <small>Requieren atención inmediata</small>
                </div>
              </article>
              <article className="psychology-kpi-card tone-good">
                <span className="psychology-kpi-card__icon" aria-hidden="true"><PsychologyIcon name="shield" /></span>
                <div>
                  <span>Seguimientos activos</span>
                  <strong>{summary.activeCount || 0}</strong>
                  <small>Casos en seguimiento</small>
                </div>
              </article>
              <article className="psychology-kpi-card tone-warn">
                <span className="psychology-kpi-card__icon" aria-hidden="true"><PsychologyIcon name="calendar" /></span>
                <div>
                  <span>Nuevos esta semana</span>
                  <strong>{summary.newThisWeekCount || 0}</strong>
                  <small>Casos nuevos</small>
                </div>
              </article>
              <article className="psychology-kpi-card tone-info">
                <span className="psychology-kpi-card__icon" aria-hidden="true"><PsychologyIcon name="clock" /></span>
                <div>
                  <span>Citas/acciones pendientes</span>
                  <strong>{summary.followUpDueCount || 0}</strong>
                  <small>Por realizar</small>
                </div>
              </article>
            </section>

            <section className="psychology-panel psychology-active-cases">
              <header className="psychology-panel-head">
                <span className="psychology-kicker">Casos abiertos</span>
                <h2>Seguimientos activos</h2>
                <p>Revisa y cierra los casos que ya no requieren acompañamiento.</p>
              </header>
              {loadingDashboard ? <p className="psychology-empty">Cargando seguimientos...</p> : null}
              {!loadingDashboard && activeCases.length === 0 ? (
                <p className="psychology-empty">No hay seguimientos activos en este momento.</p>
              ) : null}
              {!loadingDashboard && activeCases.length > 0 ? (
                <div className="psychology-active-cases__list">
                  {activeCases.map((item) => (
                    <article className="psychology-active-case-card" key={item.id}>
                      <div>
                        <strong>{item.title || 'Seguimiento sin título'}</strong>
                        <small>
                          {item.student?.name || 'Estudiante'}
                          {' · '}
                          {getOptionLabel(caseTypeOptions, item.caseType)}
                          {' · '}
                          {getOptionLabel(priorityOptions, item.priority)}
                          {' · '}
                          {getOptionLabel(statusOptions, item.status)}
                        </small>
                        {item.summary ? <p>{item.summary}</p> : null}
                      </div>
                      <div className="psychology-active-case-card__actions">
                        {item.student?.id ? (
                          <button
                            className="psychology-secondary-btn"
                            type="button"
                            onClick={() => onOpenActiveCaseStudent(item)}
                          >
                            Ver alumno
                          </button>
                        ) : null}
                        <button
                          className="psychology-close-btn"
                          type="button"
                          disabled={closingCaseId === item.id}
                          onClick={() => onCloseCase(item)}
                        >
                          {closingCaseId === item.id ? 'Cerrando...' : 'Cerrar seguimiento'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="psychology-observations-banner">
              <div className="psychology-observations-banner__copy">
                <span className="psychology-kicker">
                  <PsychologyIcon name="users" />
                  Convivencia escolar
                </span>
                <h2>Observaciones docentes recientes</h2>
                {loadingDashboard ? <p>Cargando observaciones...</p> : null}
                {!loadingDashboard && disciplineObservations.length === 0 ? (
                  <p>No hay observaciones de comportamiento registradas.</p>
                ) : null}
                {!loadingDashboard && disciplineObservations.length > 0 ? (
                  <div className="psychology-observations-list">
                    {disciplineObservations.slice(0, 3).map((item) => (
                      <article key={item.id}>
                        <strong>{item.studentName}</strong>
                        <span>{formatDateTime(item.incidentAt || item.submittedAt)}</span>
                        <p>{item.observation}</p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="psychology-observations-banner__art" aria-hidden="true">
                <PsychologyIcon name="users" />
              </div>
            </section>

            <div className="psychology-triptych">
              <aside className="psychology-panel psychology-select-panel" ref={selectPanelRef}>
                <header className="psychology-panel-head">
                  <span className="psychology-kicker">Estudiantes</span>
                  <h2>Seleccionar alumno</h2>
                  <p>Busca por nombre, código, documento o curso.</p>
                </header>

                <label className="psychology-search">
                  <span className="psychology-search__icon" aria-hidden="true"><PsychologyIcon name="search" /></span>
                  <input
                    placeholder="Buscar por nombre, código, documento o curso..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>

                <div className="psychology-student-list-head">
                  <strong>{filteredStudentsTitle}</strong>
                  <em>{loadingStudents ? '…' : students.length}</em>
                </div>

                <div className="psychology-student-list">
                  {students.map((student) => (
                    <button
                      className={`psychology-student-card${selectedStudent?.id === student.id ? ' is-selected' : ''}`}
                      key={student.id}
                      onClick={() => onSelectStudent(student)}
                      type="button"
                    >
                      <StudentAvatar student={student} />
                      <span className="psychology-student-card__copy">
                        <strong>{student.name}</strong>
                        <small>{student.displayGrade || student.grade || 'Sin curso registrado'}</small>
                      </span>
                      <i className="psychology-student-card__chevron" aria-hidden="true"><PsychologyIcon name="chevron" /></i>
                    </button>
                  ))}
                  {!loadingStudents && students.length === 0 ? (
                    <p className="psychology-empty">No hay estudiantes con ese criterio.</p>
                  ) : null}
                </div>

                <div className="psychology-select-actions">
                  <button className="psychology-secondary-btn" type="button" onClick={onShowAllStudents}>
                    <PsychologyIcon name="users" />
                    Ver todos los alumnos
                  </button>
                  <button
                    className="psychology-secondary-btn is-muted"
                    type="button"
                    onClick={onClearSelection}
                    disabled={!selectedStudent}
                  >
                    <PsychologyIcon name="refresh" />
                    Limpiar selección
                  </button>
                </div>
              </aside>

              <form className="psychology-panel psychology-form-panel" onSubmit={onCreateCase}>
                <header className="psychology-form-panel__head">
                  <div>
                    <span className="psychology-kicker">Nuevo caso</span>
                    <h2>Abrir seguimiento</h2>
                    <p>
                      {selectedStudent
                        ? `Registrando a ${selectedStudent.name}`
                        : 'Selecciona un alumno para abrir un seguimiento.'}
                    </p>
                  </div>
                  <div className="psychology-date-badge">
                    <PsychologyIcon name="calendar" />
                    <div>
                      <strong>{todayBadge.label}</strong>
                      <span>{todayBadge.dayMonth}</span>
                      <small>{todayBadge.dayName}</small>
                    </div>
                  </div>
                </header>

                <label className="psychology-field">
                  <span className="psychology-field__label">
                    <i aria-hidden="true"><PsychologyIcon name="doc" /></i>
                    Título del caso
                  </span>
                  <input
                    disabled={!selectedStudent}
                    placeholder="Ej. Aislamiento recurrente en descanso"
                    value={caseForm.title}
                    onChange={(event) => setCaseForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>

                <div className="psychology-form-row">
                  <label className="psychology-field">
                    <span className="psychology-field__label">Tipo</span>
                    <select
                      disabled={!selectedStudent}
                      value={caseForm.caseType}
                      onChange={(event) => setCaseForm((current) => ({ ...current, caseType: event.target.value }))}
                    >
                      {caseTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="psychology-field">
                    <span className="psychology-field__label">
                      Prioridad
                      <em className={`psychology-priority-dot is-${caseForm.priority}`} aria-hidden="true" />
                    </span>
                    <select
                      disabled={!selectedStudent}
                      value={caseForm.priority}
                      onChange={(event) => setCaseForm((current) => ({ ...current, priority: event.target.value }))}
                    >
                      {priorityOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="psychology-field">
                  <span className="psychology-field__label">Resumen profesional</span>
                  <textarea
                    disabled={!selectedStudent}
                    placeholder="Describe el motivo de consulta o reporte..."
                    rows="4"
                    value={caseForm.summary}
                    onChange={(event) => setCaseForm((current) => ({ ...current, summary: event.target.value }))}
                  />
                </label>

                <label className="psychology-field">
                  <span className="psychology-field__label">Acciones propuestas</span>
                  <textarea
                    disabled={!selectedStudent}
                    placeholder="Ej. Entrevista individual, observación en aula..."
                    rows="3"
                    value={caseForm.nextAction}
                    onChange={(event) => setCaseForm((current) => ({ ...current, nextAction: event.target.value }))}
                  />
                </label>

                <div className={`psychology-cite-box${caseForm.citeParents ? ' is-open' : ''}`}>
                  <label className="psychology-cite-toggle">
                    <input
                      checked={caseForm.citeParents}
                      disabled={!selectedStudent}
                      type="checkbox"
                      onChange={(event) => setCaseForm((current) => ({
                        ...current,
                        citeParents: event.target.checked,
                        visibility: event.target.checked ? 'family' : current.visibility,
                        notifyAudiences: event.target.checked
                          ? Array.from(new Set([...(current.notifyAudiences || []), 'parents']))
                          : current.notifyAudiences,
                      }))}
                    />
                    <span>
                      <strong>Citar a los padres</strong>
                      <small>Envía citación por correo con el caso y botón de Google Calendar.</small>
                    </span>
                  </label>

                  {caseForm.citeParents ? (
                    <div className="psychology-cite-fields">
                      <label className="psychology-field">
                        <span className="psychology-field__label">Fecha</span>
                        <input
                          disabled={!selectedStudent}
                          type="date"
                          value={caseForm.appointmentDate}
                          onChange={(event) => setCaseForm((current) => ({ ...current, appointmentDate: event.target.value }))}
                        />
                      </label>
                      <label className="psychology-field">
                        <span className="psychology-field__label">Hora</span>
                        <input
                          disabled={!selectedStudent}
                          type="time"
                          value={caseForm.appointmentTime}
                          onChange={(event) => setCaseForm((current) => ({ ...current, appointmentTime: event.target.value }))}
                        />
                      </label>
                      <label className="psychology-field">
                        <span className="psychology-field__label">Modalidad</span>
                        <select
                          disabled={!selectedStudent}
                          value={caseForm.appointmentModality}
                          onChange={(event) => setCaseForm((current) => ({ ...current, appointmentModality: event.target.value }))}
                        >
                          <option value="presencial">Presencial</option>
                          <option value="virtual">Virtual</option>
                          <option value="phone">Llamada telefónica</option>
                        </select>
                      </label>
                      <label className="psychology-field psychology-full">
                        <span className="psychology-field__label">Lugar / enlace (opcional)</span>
                        <input
                          disabled={!selectedStudent}
                          placeholder="Ej. Oficina de Bienestar, Meet..."
                          value={caseForm.appointmentLocation}
                          onChange={(event) => setCaseForm((current) => ({ ...current, appointmentLocation: event.target.value }))}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>

                {calendarLink ? (
                  <a className="psychology-calendar-link" href={calendarLink} rel="noreferrer" target="_blank">
                    <PsychologyIcon name="calendar" />
                    Añadir esta cita a Google Calendar
                  </a>
                ) : null}

                <details className="psychology-advanced">
                  <summary>Opciones de comunicación y nota inicial</summary>
                  <label className="psychology-field">
                    <span className="psychology-field__label">Primera nota / intervención</span>
                    <textarea
                      disabled={!selectedStudent}
                      placeholder="Registro de sesión, observación o primer contacto."
                      rows="3"
                      value={caseForm.initialNote}
                      onChange={(event) => setCaseForm((current) => ({ ...current, initialNote: event.target.value }))}
                    />
                  </label>
                  <label className="psychology-field">
                    <span className="psychology-field__label">Recomendaciones</span>
                    <textarea
                      disabled={!selectedStudent}
                      placeholder="Acciones sugeridas para familia o colegio, si aplica."
                      rows="2"
                      value={caseForm.recommendations}
                      onChange={(event) => setCaseForm((current) => ({ ...current, recommendations: event.target.value }))}
                    />
                  </label>
                  <label className="psychology-field">
                    <span className="psychology-field__label">Visibilidad</span>
                    <select
                      disabled={!selectedStudent}
                      value={caseForm.visibility}
                      onChange={(event) => updateCaseVisibility(event.target.value)}
                    >
                      {visibilityOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <AudiencePicker
                    selected={caseForm.notifyAudiences}
                    onChange={(notifyAudiences) => setCaseForm((current) => ({ ...current, notifyAudiences }))}
                  />
                </details>

                <div className="psychology-form-actions">
                  <button className="psychology-primary-btn" disabled={!canCreateCase} type="submit">
                    <PsychologyIcon name="plus" />
                    {savingCase ? 'Guardando...' : 'Crear seguimiento'}
                  </button>
                  <button
                    className="psychology-secondary-btn"
                    type="button"
                    onClick={onClearForm}
                    disabled={!selectedStudent || savingCase}
                  >
                    <PsychologyIcon name="refresh" />
                    Limpiar formulario
                  </button>
                </div>
              </form>

              <aside className="psychology-panel psychology-timeline-panel">
                <header className="psychology-panel-head">
                  <span className="psychology-kicker">Línea de tiempo</span>
                  <h2>Historial emocional</h2>
                  <p>
                    {selectedStudent
                      ? `Seguimientos y notas de ${selectedStudent.name}.`
                      : 'Selecciona un estudiante para ver su línea de tiempo emocional y académica.'}
                  </p>
                </header>

                {selectedStudent ? (
                  <section className="psychology-guardians">
                    <div className="psychology-guardians__head">
                      <strong>Acudientes</strong>
                      <em>{loadingProfile ? '…' : guardians.length}</em>
                    </div>
                    {loadingProfile ? <p className="psychology-empty">Cargando contactos...</p> : null}
                    {!loadingProfile && guardians.length === 0 ? (
                      <p className="psychology-empty">Sin acudientes vinculados a este alumno.</p>
                    ) : null}
                    {!loadingProfile && guardians.length > 0 ? (
                      <div className="psychology-guardians__list">
                        {guardians.map((guardian) => {
                          const whatsappHref = toWhatsAppHref(guardian.phone);
                          const mailHref = toMailHref(guardian.email);
                          return (
                            <article className="psychology-guardian-card" key={guardian.id}>
                              <div>
                                <strong>{guardian.name || 'Acudiente'}</strong>
                                <small>
                                  {guardian.relationship || 'Acudiente'}
                                  {guardian.isPrimaryContact ? ' · Contacto principal' : ''}
                                </small>
                              </div>
                              <p>
                                <span>Teléfono</span>
                                <b>{guardian.phone || 'No registrado'}</b>
                                {whatsappHref ? (
                                  <a
                                    className="psychology-whatsapp-btn"
                                    href={whatsappHref}
                                    rel="noreferrer"
                                    target="_blank"
                                    title="Abrir WhatsApp"
                                  >
                                    <PsychologyIcon name="whatsapp" />
                                    WhatsApp
                                  </a>
                                ) : null}
                              </p>
                              <p>
                                <span>Correo</span>
                                {mailHref ? (
                                  <a href={mailHref}>
                                    <PsychologyIcon name="mail" />
                                    {guardian.email}
                                  </a>
                                ) : (
                                  <b>No registrado</b>
                                )}
                              </p>
                            </article>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {selectedStudent ? (
                  <section className="psychology-student-cases">
                    <div className="psychology-guardians__head">
                      <strong>Casos del alumno</strong>
                      <em>{loadingProfile ? '…' : cases.length}</em>
                    </div>
                    {!loadingProfile && cases.length === 0 ? (
                      <p className="psychology-empty">Sin casos registrados para este alumno.</p>
                    ) : null}
                    {!loadingProfile && cases.length > 0 ? (
                      <div className="psychology-active-cases__list">
                        {cases.map((item) => {
                          const isOpen = openCaseStatuses.has(String(item.status || ''));
                          return (
                            <article className={`psychology-active-case-card is-compact${isOpen ? '' : ' is-closed'}`} key={item.id}>
                              <div>
                                <strong>{item.title || 'Seguimiento sin título'}</strong>
                                <small>
                                  {getOptionLabel(statusOptions, item.status)}
                                  {' · '}
                                  {getOptionLabel(priorityOptions, item.priority)}
                                </small>
                              </div>
                              {isOpen ? (
                                <button
                                  className="psychology-close-btn"
                                  type="button"
                                  disabled={closingCaseId === item.id}
                                  onClick={() => onCloseCase(item)}
                                >
                                  {closingCaseId === item.id ? 'Cerrando...' : 'Cerrar'}
                                </button>
                              ) : (
                                <span className="psychology-case-closed-tag">Cerrado</span>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {loadingProfile ? <p className="psychology-empty">Cargando perfil...</p> : null}

                {!loadingProfile && !selectedStudent ? (
                  <div className="psychology-timeline-empty">
                    <div className="psychology-timeline-empty__art" aria-hidden="true">
                      <PsychologyIcon name="mood" />
                    </div>
                    <p>El historial emocional aparecerá aquí cuando selecciones un alumno.</p>
                    <button className="psychology-select-cta" type="button" onClick={onFocusStudentSearch}>
                      Seleccionar estudiante
                    </button>
                  </div>
                ) : null}

                {!loadingProfile && selectedStudent && timelineItems.length === 0 ? (
                  <div className="psychology-timeline-empty">
                    <div className="psychology-timeline-empty__art" aria-hidden="true">
                      <PsychologyIcon name="mood" />
                    </div>
                    <p>Este estudiante aún no tiene casos psicológicos registrados.</p>
                  </div>
                ) : null}

                {!loadingProfile && selectedStudent && timelineItems.length > 0 ? (
                  <div className="psychology-timeline-list">
                    {timelineItems.map((item) => (
                      <article className={`psychology-timeline-card visibility-${item.visibility}`} key={item.id}>
                        <div className="psychology-timeline-top">
                          <strong>{item.title}</strong>
                          <span>{formatDateTime(item.date)}</span>
                        </div>
                        <small>{item.meta}</small>
                        <p>{item.text}</p>
                        {item.recommendations ? <p><b>Recomendación:</b> {item.recommendations}</p> : null}
                      </article>
                    ))}
                  </div>
                ) : null}

                {selectedStudent ? (
                  <div className="psychology-selected-meta">
                    <span>Acudientes <strong>{studentProfile?.guardians?.length || 0}</strong></span>
                    <span>Casos <strong>{cases.length}</strong></span>
                    <span>
                      Prioridad máxima{' '}
                      <strong>
                        {cases.some((item) => item.priority === 'urgent')
                          ? 'Urgente'
                          : cases.some((item) => item.priority === 'high')
                            ? 'Alta'
                            : 'Normal'}
                      </strong>
                    </span>
                  </div>
                ) : null}
              </aside>
            </div>

            {selectedStudent && cases.length > 0 ? (
              <section className="psychology-panel psychology-note-panel">
                <header className="psychology-panel-head">
                  <span className="psychology-kicker">Seguimiento</span>
                  <h2>Agregar nota a caso existente</h2>
                  <p>Continúa el caso de {selectedStudent.name} con una nueva sesión o acuerdo.</p>
                </header>
                <form className="psychology-note-grid" onSubmit={onAddNote}>
                  <label className="psychology-field">
                    <span className="psychology-field__label">Caso</span>
                    <select
                      value={noteForm.caseId || selectedCase?.id || ''}
                      onChange={(event) => setNoteForm((current) => ({ ...current, caseId: event.target.value }))}
                    >
                      {cases.map((item) => (
                        <option key={item.id} value={item.id}>{item.title}</option>
                      ))}
                    </select>
                  </label>
                  <label className="psychology-field">
                    <span className="psychology-field__label">Visibilidad</span>
                    <select
                      value={noteForm.visibility}
                      onChange={(event) => updateNoteVisibility(event.target.value)}
                    >
                      {visibilityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label} - {option.hint}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="psychology-field psychology-full">
                    <span className="psychology-field__label">Nota de seguimiento</span>
                    <textarea
                      rows="3"
                      value={noteForm.content}
                      onChange={(event) => setNoteForm((current) => ({ ...current, content: event.target.value }))}
                      placeholder="Describe la sesión, reporte o acuerdo."
                    />
                  </label>
                  <label className="psychology-field psychology-full">
                    <span className="psychology-field__label">Recomendaciones compartibles</span>
                    <textarea
                      rows="2"
                      value={noteForm.recommendations}
                      onChange={(event) => setNoteForm((current) => ({ ...current, recommendations: event.target.value }))}
                      placeholder="Solo escribe aquí lo que puede ser comunicado según la visibilidad elegida."
                    />
                  </label>
                  <AudiencePicker
                    selected={noteForm.notifyAudiences}
                    onChange={(notifyAudiences) => setNoteForm((current) => ({ ...current, notifyAudiences }))}
                  />
                  <button className="psychology-primary-btn" disabled={!selectedCase || savingNote} type="submit">
                    <PsychologyIcon name="plus" />
                    {savingNote ? 'Guardando...' : 'Agregar nota'}
                  </button>
                </form>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </StaffPortalShell>
  );
}

export default PsychologyPortal;
