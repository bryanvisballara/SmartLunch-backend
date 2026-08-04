import { useEffect, useMemo, useRef, useState } from 'react';
import useAuthStore from '../store/auth.store';
import { createNursingVisit, getNursingStudentHistory, getNursingStudentMedicalProfileHistory, searchNursingStudents } from '../services/nursing.service';
import StudentMedicalProfileHistory from '../components/StudentMedicalProfileHistory';
import StaffAnnouncementsPanel, { StaffAnnouncementsUnreadBadge, useStaffAnnouncementUnreadCount } from '../components/staff-announcements/StaffAnnouncementsPanel';
import ComergioAcademyPanel from '../components/comergio-academy/ComergioAcademyPanel';
import { isComergioAcademySection } from '../components/comergio-academy/academyNav';
import StaffPortalShell from '../components/staff-chrome/StaffPortalShell';
import NursingResourcesPanel from '../components/nursing/NursingResourcesPanel';
import { getSchoolDisplayName } from '../lib/schools';

const dispositionOptions = [
  { value: 'observation', label: 'Queda en observación' },
  { value: 'return_class', label: 'Regresa a clase' },
  { value: 'sent_home', label: 'Se remite a casa' },
  { value: 'referred', label: 'Remisión externa' },
  { value: 'other', label: 'Otro manejo' },
];

const emptyForm = {
  symptoms: '',
  treatment: '',
  notes: '',
  disposition: 'observation',
};

function formatDateTime(value) {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatTodayBadge(date = new Date()) {
  const dayName = new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(date);
  const dayMonth = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  return {
    label: 'Hoy',
    dayMonth: dayMonth.replace('.', ''),
    dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1),
  };
}

function getDispositionLabel(value) {
  return dispositionOptions.find((option) => option.value === value)?.label || 'Seguimiento registrado';
}

function getMedicalValue(value) {
  return String(value || '').trim() || 'No registrado';
}

function hasMedicalValue(value) {
  return Boolean(String(value || '').trim());
}

function toTelHref(value) {
  const digits = String(value || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

function getMedicationAuthorizationLabel(value) {
  if (value === 'authorized') {
    return 'Autorizado';
  }
  if (value === 'not_authorized') {
    return 'No autorizado';
  }
  return 'No registrado';
}

function getStudentAcademicLabel(student) {
  const displayGrade = String(student?.displayGrade || '').trim();
  const fallbackGrade = String(student?.grade || '').trim();
  const schoolCode = String(student?.schoolCode || '').trim();

  return [displayGrade || fallbackGrade, schoolCode].filter(Boolean).join(' · ');
}

function studentHasMedicalProfile(student) {
  if (typeof student?.hasMedicalProfile === 'boolean') {
    return student.hasMedicalProfile;
  }

  const profile = student?.medicalProfile || {};
  return Boolean(
    profile.completedAt
    || String(student?.bloodType || '').trim()
    || String(profile.allergies || '').trim()
    || String(profile.emergencyMedicalContactName || '').trim()
    || String(profile.emergencyMedicalContactPhone || '').trim()
    || String(profile.healthInsurance || '').trim()
  );
}

function getPersonInitials(name) {
  return String(name || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'A';
}

function NursingIcon({ name }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  if (name === 'search') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="11" cy="11" r="6.5" />
        <path {...common} d="M16.5 16.5 21 21" />
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
  if (name === 'chevron') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M9 6l6 6-6 6" />
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
  if (name === 'doc') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M7 3.5h7l4 4V20.5H7z" />
        <path {...common} d="M14 3.5V8h4.5M10 12h5M10 15.5h5" />
      </svg>
    );
  }
  if (name === 'heart') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 20s-7-4.3-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.7 12 20 12 20z" />
      </svg>
    );
  }
  if (name === 'clipboard') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect {...common} x="6" y="5" width="12" height="16" rx="2" />
        <path {...common} d="M9 5.5h6v2H9zM9 11h6M9 14.5h4" />
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
  if (name === 'info') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="12" cy="12" r="8.5" />
        <path {...common} d="M12 11v5M12 8h.01" />
      </svg>
    );
  }
  if (name === 'kit') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect {...common} x="3.5" y="7" width="17" height="13" rx="2.5" />
        <path {...common} d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M12 11v5M9.5 13.5h5" />
      </svg>
    );
  }
  if (name === 'history') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M7 3.5h7l4 4V20.5H7z" />
        <path {...common} d="M14 3.5V8h4.5" />
        <circle {...common} cx="12" cy="14" r="3.2" />
        <path {...common} d="M12 12.6V14l1.1.8" />
      </svg>
    );
  }
  if (name === 'alert') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 4.5 21 19H3L12 4.5z" />
        <path {...common} d="M12 10v4M12 16.5h.01" />
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
    return <img alt={student.name} className="nursing-student-avatar" src={imageUrl} />;
  }

  return <span className="nursing-student-avatar">{initials}</span>;
}

function NursingPortal() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const historyPanelRef = useRef(null);
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [medicalProfileRevisions, setMedicalProfileRevisions] = useState([]);
  const [loadingMedicalProfileHistory, setLoadingMedicalProfileHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [activePortalView, setActivePortalView] = useState('attention');
  const [studentLimit, setStudentLimit] = useState(30);
  const staffAnnouncementsUnreadQuery = useStaffAnnouncementUnreadCount(true);
  const staffAnnouncementsUnreadCount = Number(
    staffAnnouncementsUnreadQuery.data?.data?.unreadCount
    ?? staffAnnouncementsUnreadQuery.data?.unreadCount
    ?? 0
  );

  const latestVisit = history[0] || null;
  const canSave = Boolean(selectedStudent?.id && form.symptoms.trim() && form.treatment.trim() && !saving);
  const todayBadge = useMemo(() => formatTodayBadge(), []);

  const filteredStudentsTitle = useMemo(() => {
    if (query.trim()) {
      return `Resultados`;
    }
    return 'Alumnos recientes';
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoadingStudents(true);

    searchNursingStudents({ q: query.trim(), limit: studentLimit })
      .then((response) => {
        if (!cancelled) {
          setStudents(response.data?.students || []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStudents([]);
          setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudieron cargar los alumnos.' });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingStudents(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query, studentLimit]);

  useEffect(() => {
    if (!selectedStudent?.id) {
      setHistory([]);
      return;
    }

    let cancelled = false;
    setLoadingHistory(true);

    getNursingStudentHistory(selectedStudent.id)
      .then((response) => {
        if (!cancelled) {
          if (response.data?.student) {
            setSelectedStudent(response.data.student);
          }
          setHistory(response.data?.visits || []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setHistory([]);
          setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo cargar el historial.' });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingHistory(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStudent?.id]);

  useEffect(() => {
    if (!selectedStudent?.id) {
      setMedicalProfileRevisions([]);
      return;
    }

    let cancelled = false;
    setLoadingMedicalProfileHistory(true);

    getNursingStudentMedicalProfileHistory(selectedStudent.id)
      .then((response) => {
        if (!cancelled) {
          setMedicalProfileRevisions(response.data?.revisions || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMedicalProfileRevisions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMedicalProfileHistory(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStudent?.id]);

  const onSelectStudent = (student) => {
    setSelectedStudent(student);
    setNotice({ type: '', text: '' });
    setForm(emptyForm);
  };

  const onClearForm = () => {
    setForm(emptyForm);
    setNotice({ type: '', text: '' });
  };

  const onShowAllStudents = () => {
    setQuery('');
    setStudentLimit(50);
  };

  const onClearSelection = () => {
    setSelectedStudent(null);
    setHistory([]);
    setMedicalProfileRevisions([]);
    setForm(emptyForm);
    setNotice({ type: '', text: '' });
  };

  const onScrollToHistory = () => {
    historyPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    if (!canSave) {
      setNotice({ type: 'error', text: 'Selecciona un alumno y completa síntomas y manejo.' });
      return;
    }

    setSaving(true);
    setNotice({ type: '', text: '' });

    try {
      const response = await createNursingVisit({
        studentId: selectedStudent.id,
        symptoms: form.symptoms,
        treatment: form.treatment,
        notes: form.notes,
        disposition: form.disposition,
      });
      const savedVisit = response.data?.visit;
      setHistory((currentHistory) => (savedVisit ? [savedVisit, ...currentHistory] : currentHistory));
      setForm(emptyForm);
      setNotice({ type: 'success', text: 'Atención guardada y acudiente notificado.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo guardar la atención.' });
    } finally {
      setSaving(false);
    }
  };

  const selectedMedicalProfile = selectedStudent?.medicalProfile || {};
  const selectedMedicationAuthorization = selectedMedicalProfile.medicationAuthorization || {};
  const emergencyPhoneHref = toTelHref(selectedMedicalProfile.emergencyMedicalContactPhone);
  const physicianPhoneHref = toTelHref(selectedMedicalProfile.physicianPhone);
  const hasCriticalAllergy = hasMedicalValue(selectedMedicalProfile.allergies);
  const hasEmergencyContact = hasMedicalValue(selectedMedicalProfile.emergencyMedicalContactName)
    || hasMedicalValue(selectedMedicalProfile.emergencyMedicalContactPhone);
  const selectedHasMedicalProfile = studentHasMedicalProfile(selectedStudent);
  const schoolName = getSchoolDisplayName(user, 'Colegio');

  return (
    <StaffPortalShell
      activeKey={activePortalView}
      navItems={[
        { key: 'attention', label: 'Atención' },
        { key: 'resources', label: 'Recursos' },
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
      navLabel="Enfermería"
      onLogout={logout}
      onNavigate={setActivePortalView}
      portalLabel="Enfermería"
      schoolName={schoolName}
      userName={user?.name || user?.username || 'Enfermería'}
    >
      <div className="nursing-portal">
        {notice.text ? <div className={`nursing-notice ${notice.type || 'info'}`}>{notice.text}</div> : null}

        {isComergioAcademySection(activePortalView) ? (
          <ComergioAcademyPanel
            activeKey={activePortalView}
            className="nursing-panel"
            onNavigate={setActivePortalView}
            showLandingCards={false}
          />
        ) : null}

        {activePortalView === 'staff_announcements' ? (
          <StaffAnnouncementsPanel
            className="nursing-panel"
            description="Mensajes internos de rectoría y coordinación. Confirma cuando los hayas leído."
            mode="inbox"
            title="Comunicados internos"
          />
        ) : null}

        {activePortalView === 'resources' ? (
          <NursingResourcesPanel className="nursing-panel" />
        ) : null}

        {activePortalView === 'attention' ? (
          <>
            <section className="nursing-hero-banner">
              <div>
                <h1>{selectedStudent ? selectedStudent.name : 'Busca y selecciona un estudiante'}</h1>
                <p>
                  {selectedStudent
                    ? `${getStudentAcademicLabel(selectedStudent) || 'Sin curso'} · ${history.length} atenciones · Última: ${latestVisit ? formatDateTime(latestVisit.attendedAt) : 'sin visitas'}`
                    : 'Al seleccionarlo verás su ficha médica, historial y podrás registrar la atención de hoy.'}
                </p>
              </div>
              <div className="nursing-hero-banner__art" aria-hidden="true">
                <NursingIcon name="kit" />
              </div>
            </section>

            {selectedStudent ? (
              <section className="nursing-panel nursing-medical-sheet">
                <header className="nursing-medical-sheet__head">
                  <div>
                    <span className="nursing-kicker">Ficha médica de matrícula</span>
                    <h2>Información clínica del alumno</h2>
                    <p>
                      Datos cargados en matrícula o actualizados por el acudiente desde la app.
                      Úsalos antes de suministrar medicamentos o en una emergencia.
                    </p>
                  </div>
                  <div className="nursing-medical-sheet__badges">
                    <span className={`nursing-pill ${selectedHasMedicalProfile ? '' : 'is-alert'}`}>
                      {selectedHasMedicalProfile ? 'Ficha cargada' : 'Ficha incompleta'}
                    </span>
                    <span className={`nursing-pill ${hasCriticalAllergy ? 'is-alert' : ''}`}>
                      {hasCriticalAllergy ? 'Con alergias registradas' : 'Sin alergias registradas'}
                    </span>
                    <span className="nursing-pill">
                      Tipo de sangre: {getMedicalValue(selectedStudent.bloodType)}
                    </span>
                  </div>
                </header>

                <div className="nursing-medical-critical">
                  <article className={`nursing-critical-card ${hasCriticalAllergy ? 'is-alert' : ''}`}>
                    <span><NursingIcon name="alert" /> Alergias / sensibilidad</span>
                    <strong>{getMedicalValue(selectedMedicalProfile.allergies)}</strong>
                  </article>
                  <article className="nursing-critical-card is-emergency">
                    <span><NursingIcon name="users" /> Contacto de emergencia</span>
                    <strong>{getMedicalValue(selectedMedicalProfile.emergencyMedicalContactName)}</strong>
                    {emergencyPhoneHref ? (
                      <a className="nursing-phone-link" href={emergencyPhoneHref}>
                        {selectedMedicalProfile.emergencyMedicalContactPhone}
                      </a>
                    ) : (
                      <small>{getMedicalValue(selectedMedicalProfile.emergencyMedicalContactPhone)}</small>
                    )}
                    {!hasEmergencyContact ? (
                      <small>Sin contacto de emergencia registrado</small>
                    ) : null}
                  </article>
                  <article className="nursing-critical-card">
                    <span><NursingIcon name="heart" /> Medicamentos actuales</span>
                    <strong>{getMedicalValue(selectedMedicalProfile.currentMedications)}</strong>
                    <small>
                      Autorización: {getMedicationAuthorizationLabel(selectedMedicationAuthorization.status)}
                      {hasMedicalValue(selectedMedicationAuthorization.authorizedBy)
                        ? ` · ${selectedMedicationAuthorization.authorizedBy}`
                        : ''}
                    </small>
                  </article>
                  <article className="nursing-critical-card">
                    <span><NursingIcon name="clipboard" /> Condiciones médicas</span>
                    <strong>{getMedicalValue(selectedMedicalProfile.chronicConditions)}</strong>
                    <small>EPS: {getMedicalValue(selectedMedicalProfile.healthInsurance)}</small>
                  </article>
                </div>

                <div className="nursing-medical-grid">
                  <div>
                    <span>Restricciones alimentarias</span>
                    <strong>{getMedicalValue(selectedMedicalProfile.dietaryRestrictions)}</strong>
                  </div>
                  <div>
                    <span>Médico tratante</span>
                    <strong>{getMedicalValue(selectedMedicalProfile.physicianName)}</strong>
                    {physicianPhoneHref ? (
                      <a className="nursing-phone-link" href={physicianPhoneHref}>
                        {selectedMedicalProfile.physicianPhone}
                      </a>
                    ) : (
                      <small>{getMedicalValue(selectedMedicalProfile.physicianPhone)}</small>
                    )}
                  </div>
                  <div>
                    <span>Medicamentos autorizados</span>
                    <strong>
                      {selectedMedicationAuthorization.status === 'authorized'
                        ? getMedicalValue(selectedMedicationAuthorization.authorizedMedications)
                        : getMedicationAuthorizationLabel(selectedMedicationAuthorization.status)}
                    </strong>
                  </div>
                  <div>
                    <span>Instrucciones de suministro</span>
                    <strong>{getMedicalValue(selectedMedicationAuthorization.instructions)}</strong>
                  </div>
                  {selectedMedicationAuthorization.notes ? (
                    <div>
                      <span>Observaciones de autorización</span>
                      <strong>{selectedMedicationAuthorization.notes}</strong>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="nursing-panel nursing-medical-sheet is-placeholder">
                <header className="nursing-medical-sheet__head">
                  <div>
                    <span className="nursing-kicker">Ficha médica de matrícula</span>
                    <h2>Selecciona un alumno para ver su ficha</h2>
                    <p>
                      Aquí aparecerán alergias, medicamentos, autorización y contacto de emergencia
                      registrados en matrícula o actualizados por el acudiente.
                    </p>
                  </div>
                </header>
              </section>
            )}

            <div className="nursing-triptych">
              <aside className="nursing-panel nursing-select-panel">
                <header className="nursing-panel-head">
                  <span className="nursing-kicker">Selección</span>
                  <h2>Alumno a atender</h2>
                  <p>Busca por nombre, grado o código escolar.</p>
                </header>

                <label className="nursing-search">
                  <span className="nursing-search__icon" aria-hidden="true"><NursingIcon name="search" /></span>
                  <input
                    placeholder="Ej. Sofía, 6A, 1020..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>

                <div className="nursing-student-list-head">
                  <strong>{filteredStudentsTitle}</strong>
                  <em>{loadingStudents ? '…' : students.length}</em>
                </div>

                <div className="nursing-student-list">
                  {students.map((student) => (
                    <button
                      className={`nursing-student-card${selectedStudent?.id === student.id ? ' is-selected' : ''}`}
                      key={student.id}
                      onClick={() => onSelectStudent(student)}
                      type="button"
                    >
                      <StudentAvatar student={student} />
                      <span className="nursing-student-card__copy">
                        <strong>{student.name}</strong>
                        <small>{getStudentAcademicLabel(student) || 'Sin curso registrado'}</small>
                        <em className={`nursing-student-card__ficha ${studentHasMedicalProfile(student) ? 'is-ready' : 'is-empty'}`}>
                          {studentHasMedicalProfile(student) ? 'Con ficha médica' : 'Sin ficha médica'}
                        </em>
                      </span>
                      <i className="nursing-student-card__chevron" aria-hidden="true"><NursingIcon name="chevron" /></i>
                    </button>
                  ))}
                  {!loadingStudents && students.length === 0 ? (
                    <p className="nursing-empty">No hay alumnos con ese criterio.</p>
                  ) : null}
                </div>

                <div className="nursing-select-actions">
                  <button className="nursing-secondary-btn" type="button" onClick={onShowAllStudents}>
                    <NursingIcon name="users" />
                    Ver todos los alumnos
                  </button>
                  <button
                    className="nursing-secondary-btn is-muted"
                    type="button"
                    onClick={onClearSelection}
                    disabled={!selectedStudent}
                  >
                    <NursingIcon name="refresh" />
                    Limpiar selección
                  </button>
                </div>
              </aside>

              <form className="nursing-panel nursing-form-panel" onSubmit={onSubmit}>
                <header className="nursing-form-panel__head">
                  <div>
                    <span className="nursing-kicker">Registro</span>
                    <h2>Nueva atención</h2>
                    <p>
                      {selectedStudent
                        ? `Registrando a ${selectedStudent.name}`
                        : 'Selecciona un alumno para habilitar el formulario.'}
                    </p>
                  </div>
                  <div className="nursing-date-badge">
                    <NursingIcon name="calendar" />
                    <div>
                      <strong>{todayBadge.label}</strong>
                      <span>{todayBadge.dayMonth}</span>
                      <small>{todayBadge.dayName}</small>
                    </div>
                  </div>
                </header>

                <label className="nursing-field">
                  <span className="nursing-field__label">
                    <i className="tone-violet" aria-hidden="true"><NursingIcon name="doc" /></i>
                    Síntomas reportados
                  </span>
                  <textarea
                    disabled={!selectedStudent}
                    placeholder="Ej. dolor de cabeza, mareo, malestar estomacal..."
                    rows="4"
                    value={form.symptoms}
                    onChange={(event) => setForm((currentForm) => ({ ...currentForm, symptoms: event.target.value }))}
                  />
                </label>

                <label className="nursing-field">
                  <span className="nursing-field__label">
                    <i className="tone-blue" aria-hidden="true"><NursingIcon name="heart" /></i>
                    Qué se le dio o manejo realizado
                  </span>
                  <textarea
                    disabled={!selectedStudent}
                    placeholder="Ej. reposo, hidratación, curación, llamada preventiva..."
                    rows="4"
                    value={form.treatment}
                    onChange={(event) => setForm((currentForm) => ({ ...currentForm, treatment: event.target.value }))}
                  />
                </label>

                <label className="nursing-field">
                  <span className="nursing-field__label">Resultado</span>
                  <select
                    disabled={!selectedStudent}
                    value={form.disposition}
                    onChange={(event) => setForm((currentForm) => ({ ...currentForm, disposition: event.target.value }))}
                  >
                    {dispositionOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="nursing-field">
                  <span className="nursing-field__label">
                    <i className="tone-orange" aria-hidden="true"><NursingIcon name="clipboard" /></i>
                    Observaciones internas
                    <small>(no visibles para otros usuarios)</small>
                  </span>
                  <textarea
                    disabled={!selectedStudent}
                    placeholder="Notas adicionales para seguimiento escolar"
                    rows="3"
                    value={form.notes}
                    onChange={(event) => setForm((currentForm) => ({ ...currentForm, notes: event.target.value }))}
                  />
                </label>

                <div className="nursing-form-actions">
                  <button className="nursing-primary-btn" disabled={!canSave} type="submit">
                    <NursingIcon name="plus" />
                    {saving ? 'Guardando...' : 'Guardar atención'}
                  </button>
                  <button className="nursing-secondary-btn" type="button" onClick={onClearForm} disabled={!selectedStudent || saving}>
                    <NursingIcon name="refresh" />
                    Limpiar formulario
                  </button>
                </div>
              </form>

              <aside className="nursing-panel nursing-history-panel" ref={historyPanelRef}>
                <header className="nursing-panel-head">
                  <span className="nursing-kicker">Historial</span>
                  <h2>Atenciones anteriores</h2>
                  <p>
                    {selectedStudent
                      ? `Historial clínico de ${selectedStudent.name}.`
                      : 'Selecciona un alumno para ver su historial.'}
                  </p>
                </header>

                {loadingHistory ? <p className="nursing-empty">Cargando historial...</p> : null}

                {!loadingHistory && !selectedStudent ? (
                  <div className="nursing-history-empty">
                    <div className="nursing-history-empty__art" aria-hidden="true">
                      <NursingIcon name="history" />
                    </div>
                    <p>El historial del estudiante aparecerá aquí cuando lo selecciones.</p>
                  </div>
                ) : null}

                {!loadingHistory && selectedStudent && history.length === 0 ? (
                  <div className="nursing-history-empty">
                    <div className="nursing-history-empty__art" aria-hidden="true">
                      <NursingIcon name="history" />
                    </div>
                    <p>Este estudiante aún no tiene atenciones registradas.</p>
                  </div>
                ) : null}

                <div className="nursing-history-list">
                  {history.map((visit) => (
                    <article className="nursing-history-card" key={visit.id}>
                      <div className="nursing-history-top">
                        <strong>{getDispositionLabel(visit.disposition)}</strong>
                        <span>{formatDateTime(visit.attendedAt)}</span>
                      </div>
                      <p><b>Síntomas:</b> {visit.symptoms}</p>
                      <p><b>Manejo:</b> {visit.treatment}</p>
                      {visit.notes ? <p><b>Notas:</b> {visit.notes}</p> : null}
                      <small>Registró: {visit.attendedBy?.name || 'Enfermería'}</small>
                    </article>
                  ))}
                </div>

                <button
                  className="nursing-history-btn"
                  type="button"
                  onClick={onScrollToHistory}
                  disabled={!selectedStudent}
                >
                  <NursingIcon name="doc" />
                  Ver historial del alumno
                </button>
              </aside>
            </div>

            {selectedStudent ? (
              <section className="nursing-panel nursing-medical-profile-history">
                <div className="nursing-panel-head">
                  <span className="nursing-kicker">Historial de cambios</span>
                  <h2>Actualizaciones de la ficha médica</h2>
                  <p>
                    Aquí aparecen la carga inicial de matrícula y las ediciones posteriores del acudiente.
                    La ficha clínica vigente está arriba, en “Ficha médica de matrícula”.
                  </p>
                </div>
                {loadingMedicalProfileHistory ? <p className="nursing-empty">Cargando historial de cambios...</p> : null}
                {!loadingMedicalProfileHistory ? (
                  <StudentMedicalProfileHistory
                    emptyMessage={
                      selectedHasMedicalProfile
                        ? 'La ficha médica ya está cargada arriba. Aún no hay ediciones posteriores registradas por acudientes.'
                        : 'Este alumno aún no tiene ficha médica ni cambios registrados por acudientes.'
                    }
                    revisions={medicalProfileRevisions}
                  />
                ) : null}
              </section>
            ) : null}

            <footer className="nursing-privacy-bar">
              <NursingIcon name="info" />
              <p>La información registrada en esta sección es confidencial y de uso exclusivo del área de enfermería.</p>
            </footer>
          </>
        ) : null}
      </div>
    </StaffPortalShell>
  );
}

export default NursingPortal;
