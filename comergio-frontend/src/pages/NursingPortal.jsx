import { useEffect, useMemo, useState } from 'react';
import useAuthStore from '../store/auth.store';
import { createNursingVisit, getNursingStudentHistory, getNursingStudentMedicalProfileHistory, searchNursingStudents } from '../services/nursing.service';
import StudentMedicalProfileHistory from '../components/StudentMedicalProfileHistory';
import StaffAnnouncementsPanel, { StaffAnnouncementsUnreadBadge, useStaffAnnouncementUnreadCount } from '../components/staff-announcements/StaffAnnouncementsPanel';

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

function getDispositionLabel(value) {
  return dispositionOptions.find((option) => option.value === value)?.label || 'Seguimiento registrado';
}

function getMedicalValue(value) {
  return String(value || '').trim() || 'No registrado';
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

function StudentAvatar({ student }) {
  const imageUrl = student?.thumbUrl || student?.imageUrl || '';
  const initials = String(student?.name || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (imageUrl) {
    return <img alt={student.name} className="nursing-student-avatar" src={imageUrl} />;
  }

  return <span className="nursing-student-avatar">{initials || 'A'}</span>;
}

function NursingPortal() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
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
  const staffAnnouncementsUnreadQuery = useStaffAnnouncementUnreadCount(true);
  const staffAnnouncementsUnreadCount = Number(
    staffAnnouncementsUnreadQuery.data?.data?.unreadCount
    ?? staffAnnouncementsUnreadQuery.data?.unreadCount
    ?? 0
  );

  const latestVisit = history[0] || null;
  const canSave = Boolean(selectedStudent?.id && form.symptoms.trim() && form.treatment.trim() && !saving);

  const filteredStudentsTitle = useMemo(() => {
    if (query.trim()) {
      return `Resultados para "${query.trim()}"`;
    }
    return 'Alumnos recientes';
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoadingStudents(true);

    searchNursingStudents({ q: query.trim(), limit: 30 })
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
  }, [query]);

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
      setHistory((currentHistory) => savedVisit ? [savedVisit, ...currentHistory] : currentHistory);
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

  return (
    <section className="nursing-portal">
      <header className="nursing-hero">
        <div>
          <span className="admin-kicker">Portal de enfermería</span>
          <h1>Atención de estudiantes</h1>
          <p>Registra síntomas, manejo entregado y deja historial visible para próximas visitas y acudientes.</p>
        </div>
        <div className="nursing-hero-actions">
          <span>{user?.name || user?.username || 'Enfermería'}</span>
          <button className="btn btn-outline" onClick={logout} type="button">Salir</button>
        </div>
      </header>

      {notice.text ? <div className={`nursing-notice ${notice.type || 'info'}`}>{notice.text}</div> : null}

      <div className="nursing-portal-tabs psychology-portal-tabs">
        <button className={activePortalView === 'attention' ? 'is-active' : ''} onClick={() => setActivePortalView('attention')} type="button">
          Atención
        </button>
        <button className={activePortalView === 'staff_announcements' ? 'is-active' : ''} onClick={() => setActivePortalView('staff_announcements')} type="button">
          Comunicados
          <StaffAnnouncementsUnreadBadge count={staffAnnouncementsUnreadCount} />
        </button>
      </div>

      {activePortalView === 'staff_announcements' ? (
        <StaffAnnouncementsPanel
          className="nursing-panel"
          description="Comunicados de rectoría y coordinación. Confirma cuando los hayas leído."
          mode="inbox"
          title="Comunicados"
        />
      ) : (
      <div className="nursing-layout">
        <aside className="nursing-panel nursing-student-search">
          <div className="nursing-panel-head">
            <span className="admin-kicker">Selección</span>
            <h2>Alumno a atender</h2>
          </div>
          <label className="nursing-field">
            Buscar por nombre, código, documento o grado
            <input
              placeholder="Ej. Sofia, 6A, 1020..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="nursing-student-list-head">
            <strong>{filteredStudentsTitle}</strong>
            {loadingStudents ? <span>Cargando...</span> : <span>{students.length}</span>}
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
                <span>
                  <strong>{student.name}</strong>
                  <small>{getStudentAcademicLabel(student) || 'Sin curso registrado'}</small>
                </span>
              </button>
            ))}
            {!loadingStudents && students.length === 0 ? <p className="nursing-empty">No hay alumnos con ese criterio.</p> : null}
          </div>
        </aside>

        <main className="nursing-workspace">
          <section className="nursing-panel nursing-selected-summary">
            {selectedStudent ? (
              <>
                <div className="nursing-selected-main">
                  <StudentAvatar student={selectedStudent} />
                  <div>
                    <span className="admin-kicker">Atención actual</span>
                    <h2>{selectedStudent.name}</h2>
                    <p>{getStudentAcademicLabel(selectedStudent) || 'Información académica pendiente'}</p>
                  </div>
                </div>
                <div className="nursing-selected-meta">
                  <span>Tipo de sangre <strong>{selectedStudent.bloodType || 'No registrado'}</strong></span>
                  <span>Historial <strong>{history.length} registros</strong></span>
                  <span>Última visita <strong>{latestVisit ? formatDateTime(latestVisit.attendedAt) : 'Sin visitas'}</strong></span>
                </div>
              </>
            ) : (
              <div className="nursing-empty-state">
                <span className="admin-kicker">Sin alumno seleccionado</span>
                <h2>Busca y selecciona un estudiante</h2>
                <p>Al seleccionarlo verás su historial y podrás registrar la atención de hoy.</p>
              </div>
            )}
          </section>

          {selectedStudent ? (
            <section className="nursing-panel nursing-medical-profile">
              <div className="nursing-panel-head">
                <span className="admin-kicker">Ficha médica de matrícula</span>
                <h2>Información clínica y medicamentos</h2>
              </div>
              <div className="nursing-medical-grid">
                <div><span>Alergias</span><strong>{getMedicalValue(selectedMedicalProfile.allergies)}</strong></div>
                <div><span>Condiciones médicas</span><strong>{getMedicalValue(selectedMedicalProfile.chronicConditions)}</strong></div>
                <div><span>Medicamentos actuales</span><strong>{getMedicalValue(selectedMedicalProfile.currentMedications)}</strong></div>
                <div><span>Restricciones alimentarias</span><strong>{getMedicalValue(selectedMedicalProfile.dietaryRestrictions)}</strong></div>
                <div><span>EPS / seguro</span><strong>{getMedicalValue(selectedMedicalProfile.healthInsurance)}</strong></div>
                <div><span>Contacto de emergencia</span><strong>{getMedicalValue(selectedMedicalProfile.emergencyMedicalContactName)} · {getMedicalValue(selectedMedicalProfile.emergencyMedicalContactPhone)}</strong></div>
                <div><span>Médico tratante</span><strong>{getMedicalValue(selectedMedicalProfile.physicianName)} · {getMedicalValue(selectedMedicalProfile.physicianPhone)}</strong></div>
                <div><span>Autorización medicamentos</span><strong>{getMedicationAuthorizationLabel(selectedMedicationAuthorization.status)} · {getMedicalValue(selectedMedicationAuthorization.authorizedBy)}</strong></div>
                {selectedMedicationAuthorization.status === 'authorized' ? (
                  <>
                    <div><span>Medicamentos autorizados</span><strong>{getMedicalValue(selectedMedicationAuthorization.authorizedMedications)}</strong></div>
                    <div><span>Instrucciones</span><strong>{getMedicalValue(selectedMedicationAuthorization.instructions)}</strong></div>
                  </>
                ) : null}
                {selectedMedicationAuthorization.notes ? <div><span>Observaciones</span><strong>{selectedMedicationAuthorization.notes}</strong></div> : null}
              </div>
            </section>
          ) : null}

          {selectedStudent ? (
            <section className="nursing-panel nursing-medical-profile-history">
              <div className="nursing-panel-head">
                <span className="admin-kicker">Historial de cambios</span>
                <h2>Actualizaciones de la ficha medica</h2>
              </div>
              {loadingMedicalProfileHistory ? <p className="nursing-empty">Cargando historial de cambios...</p> : null}
              {!loadingMedicalProfileHistory ? (
                <StudentMedicalProfileHistory
                  emptyMessage="Este alumno aun no tiene cambios registrados en la ficha medica por acudientes."
                  revisions={medicalProfileRevisions}
                />
              ) : null}
            </section>
          ) : null}

          <section className="nursing-grid-two">
            <form className="nursing-panel nursing-form" onSubmit={onSubmit}>
              <div className="nursing-panel-head">
                <span className="admin-kicker">Registro</span>
                <h2>Nueva atención</h2>
              </div>
              <label className="nursing-field">
                Síntomas reportados
                <textarea
                  placeholder="Ej. dolor de cabeza, mareo, malestar estomacal..."
                  rows="4"
                  value={form.symptoms}
                  onChange={(event) => setForm((currentForm) => ({ ...currentForm, symptoms: event.target.value }))}
                />
              </label>
              <label className="nursing-field">
                Qué se le dio o manejo realizado
                <textarea
                  placeholder="Ej. reposo, hidratación, curación, llamada preventiva..."
                  rows="4"
                  value={form.treatment}
                  onChange={(event) => setForm((currentForm) => ({ ...currentForm, treatment: event.target.value }))}
                />
              </label>
              <div className="nursing-form-row">
                <label className="nursing-field">
                  Resultado
                  <select
                    value={form.disposition}
                    onChange={(event) => setForm((currentForm) => ({ ...currentForm, disposition: event.target.value }))}
                  >
                    {dispositionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="nursing-field">
                Observaciones internas
                <textarea
                  placeholder="Notas adicionales para seguimiento escolar"
                  rows="3"
                  value={form.notes}
                  onChange={(event) => setForm((currentForm) => ({ ...currentForm, notes: event.target.value }))}
                />
              </label>
              <button className="btn btn-primary nursing-save-btn" disabled={!canSave} type="submit">
                {saving ? 'Guardando...' : 'Guardar y notificar acudiente'}
              </button>
            </form>

            <section className="nursing-panel nursing-history">
              <div className="nursing-panel-head">
                <span className="admin-kicker">Historial</span>
                <h2>Atenciones anteriores</h2>
              </div>
              {loadingHistory ? <p className="nursing-empty">Cargando historial...</p> : null}
              {!loadingHistory && selectedStudent && history.length === 0 ? <p className="nursing-empty">Este estudiante aún no tiene atenciones registradas.</p> : null}
              {!selectedStudent ? <p className="nursing-empty">Selecciona un alumno para ver su historial.</p> : null}
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
            </section>
          </section>
        </main>
      </div>
      )}
    </section>
  );
}

export default NursingPortal;
