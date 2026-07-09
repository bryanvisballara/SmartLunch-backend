import { useEffect, useMemo, useState } from 'react';
import useAuthStore from '../store/auth.store';
import { getCampusDisciplineObservations } from '../campus/services/campus.service';
import {
  addPsychologyCaseNote,
  createPsychologyCase,
  getPsychologyDashboard,
  getPsychologyStudentProfile,
  searchPsychologyStudents,
} from '../services/psychology.service';
import CommunityReportsPanel from '../components/community/CommunityReportsPanel';
import TeEscuchamosLabel from '../components/community/TeEscuchamosLabel';

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

function getOptionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || value || 'Sin definir';
}

function defaultAudiences(visibility) {
  if (visibility === 'family') return ['parents'];
  if (visibility === 'institutional') return ['teachers', 'coordination', 'leadership'];
  if (visibility === 'shared_all') return ['teachers', 'coordination', 'leadership', 'parents'];
  return [];
}

function StudentAvatar({ student }) {
  const imageUrl = student?.thumbUrl || student?.imageUrl || '';
  const initials = String(student?.name || 'E')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (imageUrl) {
    return <img alt={student.name} className="psychology-student-avatar" src={imageUrl} />;
  }

  return <span className="psychology-student-avatar">{initials || 'E'}</span>;
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
  const [dashboard, setDashboard] = useState({ summary: {}, recentCases: [], typeStats: [], priorityStats: [] });
  const [disciplineObservations, setDisciplineObservations] = useState([]);
  const [query, setQuery] = useState('');
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
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [activePortalView, setActivePortalView] = useState('cases');

  const cases = studentProfile?.cases || [];
  const selectedCase = cases.find((item) => item.id === noteForm.caseId) || cases[0] || null;
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
        setDashboard(dashboardResult.status === 'fulfilled' ? (dashboardResult.value.data || { summary: {}, recentCases: [], typeStats: [], priorityStats: [] }) : { summary: {}, recentCases: [], typeStats: [], priorityStats: [] });
        setDisciplineObservations(observationsResult.status === 'fulfilled' ? (observationsResult.value.observations || []) : []);
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

    searchPsychologyStudents({ q: query.trim(), limit: 30 })
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
  }, [query]);

  const onSelectStudent = (student) => {
    setSelectedStudent(student);
    setCaseForm(emptyCaseForm);
    setNoteForm(emptyNoteForm);
    setNotice({ type: '', text: '' });
    refreshStudentProfile(student.id);
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

    setSavingCase(true);
    setNotice({ type: '', text: '' });
    try {
      await createPsychologyCase({ ...caseForm, studentId: selectedStudent.id });
      setCaseForm(emptyCaseForm);
      setNotice({ type: 'success', text: 'Caso creado y comunicación enviada según visibilidad.' });
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

  return (
    <section className="psychology-portal">
      <header className="psychology-hero">
        <div>
          <span className="admin-kicker">Portal de psicología</span>
          <h1>Bienestar, casos y seguimiento institucional</h1>
          <p>Gestiona casos con privacidad inteligente, trazabilidad y comunicación selectiva entre familia y colegio.</p>
        </div>
        <div className="psychology-hero-actions">
          <span>{user?.name || user?.username || 'Psicología'}</span>
          <button className="btn btn-outline" onClick={logout} type="button">Salir</button>
        </div>
      </header>

      {notice.text ? <div className={`psychology-notice ${notice.type || 'info'}`}>{notice.text}</div> : null}

      <div className="psychology-portal-tabs">
        <button className={activePortalView === 'cases' ? 'is-active' : ''} onClick={() => setActivePortalView('cases')} type="button">
          Casos clínicos
        </button>
        <button className={activePortalView === 'community_reports' ? 'is-active' : ''} onClick={() => setActivePortalView('community_reports')} type="button">
          <TeEscuchamosLabel className="te-escuchamos-label--tab" />
        </button>
      </div>

      {activePortalView === 'community_reports' ? (
        <CommunityReportsPanel className="community-reports-panel--embedded" />
      ) : (
      <>
      <section className="psychology-kpi-grid">
        <article className="psychology-kpi-card tone-danger">
          <span>Casos urgentes</span>
          <strong>{dashboard.summary?.urgentCount || 0}</strong>
        </article>
        <article className="psychology-kpi-card tone-good">
          <span>Seguimientos activos</span>
          <strong>{dashboard.summary?.activeCount || 0}</strong>
        </article>
        <article className="psychology-kpi-card tone-warn">
          <span>Nuevos esta semana</span>
          <strong>{dashboard.summary?.newThisWeekCount || 0}</strong>
        </article>
        <article className="psychology-kpi-card tone-neutral">
          <span>Citas/acciones pendientes</span>
          <strong>{dashboard.summary?.followUpDueCount || 0}</strong>
        </article>
      </section>

      <section className="psychology-panel psychology-timeline">
        <div className="psychology-panel-head">
          <span className="admin-kicker">Convivencia escolar</span>
          <h2>Observaciones docentes recientes</h2>
        </div>
        {loadingDashboard ? <p className="psychology-empty">Cargando observaciones...</p> : null}
        {!loadingDashboard && disciplineObservations.length === 0 ? <p className="psychology-empty">No hay observaciones de comportamiento registradas.</p> : null}
        <div className="psychology-timeline-list">
          {disciplineObservations.slice(0, 5).map((item) => (
            <article className="psychology-timeline-card visibility-institutional" key={item.id}>
              <div className="psychology-timeline-top">
                <strong>{item.studentName}</strong>
                <span>{formatDateTime(item.submittedAt)}</span>
              </div>
              <small>{[item.courseTitle, item.teacherName].filter(Boolean).join(' · ')}</small>
              <p>{item.observation}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="psychology-layout">
        <aside className="psychology-panel psychology-sidebar">
          <div className="psychology-panel-head">
            <span className="admin-kicker">Estudiantes</span>
            <h2>Seleccionar alumno</h2>
          </div>
          <label className="psychology-field">
            Buscar por nombre, código, documento o curso
            <input placeholder="Ej. Sofia, 6A, 1020..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="psychology-student-list-head">
            <strong>{query.trim() ? 'Resultados' : 'Alumnos recientes'}</strong>
            <span>{loadingStudents ? '...' : students.length}</span>
          </div>
          <div className="psychology-student-list">
            {students.map((student) => (
              <button className={`psychology-student-card${selectedStudent?.id === student.id ? ' is-selected' : ''}`} key={student.id} onClick={() => onSelectStudent(student)} type="button">
                <StudentAvatar student={student} />
                <span>
                  <strong>{student.name}</strong>
                  <small>{student.displayGrade || student.grade || 'Sin curso registrado'}</small>
                </span>
              </button>
            ))}
            {!loadingStudents && students.length === 0 ? <p className="psychology-empty">No hay estudiantes con ese criterio.</p> : null}
          </div>
        </aside>

        <main className="psychology-workspace">
          <section className="psychology-panel psychology-student-summary">
            {selectedStudent ? (
              <>
                <div className="psychology-selected-main">
                  <StudentAvatar student={selectedStudent} />
                  <div>
                    <span className="admin-kicker">Perfil del estudiante</span>
                    <h2>{selectedStudent.name}</h2>
                    <p>{selectedStudent.displayGrade || selectedStudent.grade || 'Información académica pendiente'}</p>
                  </div>
                </div>
                <div className="psychology-selected-meta">
                  <span>Acudientes <strong>{studentProfile?.guardians?.length || 0}</strong></span>
                  <span>Casos <strong>{cases.length}</strong></span>
                  <span>Prioridad máxima <strong>{cases.some((item) => item.priority === 'urgent') ? 'Urgente' : cases.some((item) => item.priority === 'high') ? 'Alta' : 'Normal'}</strong></span>
                </div>
              </>
            ) : (
              <div className="psychology-empty-state">
                <span className="admin-kicker">Sin alumno seleccionado</span>
                <h2>Busca un estudiante para iniciar</h2>
                <p>Al seleccionarlo podrás abrir casos, registrar sesiones y ver toda su línea de tiempo.</p>
              </div>
            )}
          </section>

          <section className="psychology-grid-two">
            <form className="psychology-panel psychology-form" onSubmit={onCreateCase}>
              <div className="psychology-panel-head">
                <span className="admin-kicker">Nuevo caso</span>
                <h2>Abrir seguimiento</h2>
              </div>
              <label className="psychology-field">
                Título del caso
                <input value={caseForm.title} onChange={(event) => setCaseForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ej. Aislamiento recurrente en descanso" />
              </label>
              <div className="psychology-form-row">
                <label className="psychology-field">
                  Tipo
                  <select value={caseForm.caseType} onChange={(event) => setCaseForm((current) => ({ ...current, caseType: event.target.value }))}>
                    {caseTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="psychology-field">
                  Prioridad
                  <select value={caseForm.priority} onChange={(event) => setCaseForm((current) => ({ ...current, priority: event.target.value }))}>
                    {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="psychology-field">
                Resumen profesional
                <textarea rows="4" value={caseForm.summary} onChange={(event) => setCaseForm((current) => ({ ...current, summary: event.target.value }))} placeholder="Describe el motivo de consulta o reporte inicial." />
              </label>
              <label className="psychology-field">
                Primera nota/intervención
                <textarea rows="3" value={caseForm.initialNote} onChange={(event) => setCaseForm((current) => ({ ...current, initialNote: event.target.value }))} placeholder="Registro de sesión, observación o primer contacto." />
              </label>
              <label className="psychology-field">
                Recomendaciones
                <textarea rows="2" value={caseForm.recommendations} onChange={(event) => setCaseForm((current) => ({ ...current, recommendations: event.target.value }))} placeholder="Acciones sugeridas para familia o colegio, si aplica." />
              </label>
              <div className="psychology-form-row">
                <label className="psychology-field">
                  Visibilidad
                  <select value={caseForm.visibility} onChange={(event) => updateCaseVisibility(event.target.value)}>
                    {visibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="psychology-field">
                  Próxima acción
                  <input value={caseForm.nextAction} onChange={(event) => setCaseForm((current) => ({ ...current, nextAction: event.target.value }))} placeholder="Ej. citar acudiente" />
                </label>
              </div>
              <AudiencePicker selected={caseForm.notifyAudiences} onChange={(notifyAudiences) => setCaseForm((current) => ({ ...current, notifyAudiences }))} />
              <button className="btn btn-primary psychology-save-btn" disabled={!selectedStudent || savingCase} type="submit">{savingCase ? 'Guardando...' : 'Crear caso'}</button>
            </form>

            <section className="psychology-panel psychology-timeline">
              <div className="psychology-panel-head">
                <span className="admin-kicker">Línea de tiempo</span>
                <h2>Historial emocional</h2>
              </div>
              {loadingProfile ? <p className="psychology-empty">Cargando perfil...</p> : null}
              {!loadingProfile && selectedStudent && timelineItems.length === 0 ? <p className="psychology-empty">Este estudiante aún no tiene casos psicológicos registrados.</p> : null}
              {!selectedStudent ? <p className="psychology-empty">Selecciona un estudiante para ver su línea de tiempo.</p> : null}
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
            </section>
          </section>

          <section className="psychology-panel psychology-note-panel">
            <div className="psychology-panel-head">
              <span className="admin-kicker">Seguimiento</span>
              <h2>Agregar nota a caso existente</h2>
            </div>
            <form className="psychology-note-grid" onSubmit={onAddNote}>
              <label className="psychology-field">
                Caso
                <select value={noteForm.caseId || selectedCase?.id || ''} onChange={(event) => setNoteForm((current) => ({ ...current, caseId: event.target.value }))}>
                  {cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </label>
              <label className="psychology-field">
                Visibilidad
                <select value={noteForm.visibility} onChange={(event) => updateNoteVisibility(event.target.value)}>
                  {visibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.hint}</option>)}
                </select>
              </label>
              <label className="psychology-field psychology-full">
                Nota de seguimiento
                <textarea rows="3" value={noteForm.content} onChange={(event) => setNoteForm((current) => ({ ...current, content: event.target.value }))} placeholder="Describe la sesión, reporte o acuerdo." />
              </label>
              <label className="psychology-field psychology-full">
                Recomendaciones compartibles
                <textarea rows="2" value={noteForm.recommendations} onChange={(event) => setNoteForm((current) => ({ ...current, recommendations: event.target.value }))} placeholder="Solo escribe aquí lo que puede ser comunicado según la visibilidad elegida." />
              </label>
              <AudiencePicker selected={noteForm.notifyAudiences} onChange={(notifyAudiences) => setNoteForm((current) => ({ ...current, notifyAudiences }))} />
              <button className="btn btn-primary psychology-save-btn" disabled={!selectedCase || savingNote} type="submit">{savingNote ? 'Guardando...' : 'Agregar nota'}</button>
            </form>
          </section>
        </main>
      </div>
      </>
      )}
    </section>
  );
}

export default PsychologyPortal;
