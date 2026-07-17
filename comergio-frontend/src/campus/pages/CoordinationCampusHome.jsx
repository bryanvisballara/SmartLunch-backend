import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DismissibleNotice from '../../components/DismissibleNotice';
import {
  consolidateHrPlannerRequests,
  createHrPlannerCycle,
  getHrCoordinationPlannerRequests,
  getHrPlannerCycles,
} from '../../services/hr.service';
import {
  getCampusCoordinationCourses,
  getCampusCoordinationTeachers,
  getCampusDisciplineObservations,
  updateCampusCoordinationCourse,
} from '../services/campus.service';
import { mockCoordinationWorkspace } from '../mockCampusContext';

const campusPreviewEnabled = import.meta.env.DEV && String(import.meta.env.VITE_CAMPUS_PREVIEW || '').trim() === 'true';
const weekdays = [
  { key: 1, label: 'Lunes' },
  { key: 2, label: 'Martes' },
  { key: 3, label: 'Miércoles' },
  { key: 4, label: 'Jueves' },
  { key: 5, label: 'Viernes' },
];

function buildScheduleRows() {
  const rows = [];
  const starts = [
    '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00',
    '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00',
  ];

  starts.forEach((startTime) => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const endDate = new Date(2026, 0, 1, hours, minutes + 60, 0, 0);
    rows.push({
      key: startTime,
      startTime,
      endTime: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`,
      label: `${startTime} - ${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`,
    });
  });

  return rows;
}

function buildSessionKey(session) {
  return `${Number(session?.weekday)}-${String(session?.startTime || '')}-${String(session?.endTime || '')}`;
}

function sortSessions(sessions) {
  return [...(sessions || [])].sort((left, right) => {
    if (Number(left.weekday) !== Number(right.weekday)) {
      return Number(left.weekday) - Number(right.weekday);
    }
    return String(left.startTime || '').localeCompare(String(right.startTime || ''));
  });
}

function formatContentPeriodRange(startDate, endDate) {
  if (!startDate && !endDate) {
    return 'Sin fechas';
  }

  if (startDate && endDate) {
    return `${startDate} - ${endDate}`;
  }

  return startDate ? `Desde ${startDate}` : `Hasta ${endDate}`;
}

function createPlannerCycleDraft() {
  return {
    title: '',
    startDate: '',
    endDate: '',
    submissionDeadline: '',
    instructions: '',
    publishAsAnnouncement: true,
  };
}

function formatPlannerDate(value) {
  if (!value) return 'Sin fecha';
  const raw = String(value);
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsed = dateOnlyMatch
    ? new Date(Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]), 12, 0, 0))
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
  return parsed.toLocaleDateString('es-CO', { dateStyle: 'medium', timeZone: 'UTC' });
}

function getPlannerRequestItemsLabel(request) {
  return (request.items || [])
    .map((entry) => `${entry.item?.name || entry.customName || 'Material'} x${entry.quantity}`)
    .join(' · ');
}

function CoordinationCampusHome() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState({ type: 'info', text: '' });
  const [previewWorkspace, setPreviewWorkspace] = useState(() => ({
    teachers: mockCoordinationWorkspace.teachers.map((teacher) => ({ ...teacher })),
    courses: mockCoordinationWorkspace.courses.map((course) => ({
      ...course,
      classSessions: (course.classSessions || []).map((session) => ({ ...session })),
    })),
  }));
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [draftSessions, setDraftSessions] = useState([]);
  const [plannerCycleDraft, setPlannerCycleDraft] = useState(createPlannerCycleDraft);
  const [selectedPlannerRequestIds, setSelectedPlannerRequestIds] = useState([]);
  const [plannerConsolidationNote, setPlannerConsolidationNote] = useState('');

  const teachersQuery = useQuery({
    queryKey: ['campus', 'coordination', 'teachers'],
    queryFn: getCampusCoordinationTeachers,
    retry: false,
    staleTime: 30_000,
    enabled: !campusPreviewEnabled,
  });

  const coursesQuery = useQuery({
    queryKey: ['campus', 'coordination', 'courses'],
    queryFn: getCampusCoordinationCourses,
    retry: false,
    staleTime: 30_000,
    enabled: !campusPreviewEnabled,
  });

  const disciplineObservationsQuery = useQuery({
    queryKey: ['campus', 'discipline-observations', 'coordination'],
    queryFn: () => getCampusDisciplineObservations({ limit: 30 }),
    retry: false,
    staleTime: 20_000,
    enabled: !campusPreviewEnabled,
  });

  const plannerCyclesQuery = useQuery({
    queryKey: ['hr', 'coordination', 'planner-cycles'],
    queryFn: () => getHrPlannerCycles({ status: 'active' }),
    retry: false,
    staleTime: 30_000,
    enabled: !campusPreviewEnabled,
  });

  const plannerRequestsQuery = useQuery({
    queryKey: ['hr', 'coordination', 'planner-requests'],
    queryFn: () => getHrCoordinationPlannerRequests({ status: 'pending_coordination_review' }),
    retry: false,
    staleTime: 20_000,
    enabled: !campusPreviewEnabled,
  });

  const updateCourseMutation = useMutation({
    mutationFn: ({ courseId, payload }) => updateCampusCoordinationCourse(courseId, payload),
    onSuccess: (updatedCourse) => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'coordination', 'courses'] });
      setNotice({ type: 'success', text: 'Horario actualizado correctamente.' });
      if (campusPreviewEnabled) {
        return;
      }
      setDraftSessions(sortSessions(updatedCourse.classSessions || []));
    },
    onError: (error) => {
      setNotice({ type: 'error', text: error?.message || 'No fue posible actualizar el horario.' });
    },
  });

  const createPlannerCycleMutation = useMutation({
    mutationFn: createHrPlannerCycle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'coordination', 'planner-cycles'] });
      setPlannerCycleDraft(createPlannerCycleDraft());
      setNotice({ type: 'success', text: 'Planner docente definido para los profesores.' });
    },
    onError: (error) => {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No fue posible crear el planner.' });
    },
  });

  const consolidatePlannerMutation = useMutation({
    mutationFn: consolidateHrPlannerRequests,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'coordination', 'planner-requests'] });
      setSelectedPlannerRequestIds([]);
      setPlannerConsolidationNote('');
      setNotice({ type: 'success', text: 'Requerimientos consolidados y enviados a gestion de compras.' });
    },
    onError: (error) => {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No fue posible consolidar los planners.' });
    },
  });

  const workspace = useMemo(() => {
    if (campusPreviewEnabled) {
      return previewWorkspace;
    }

    return {
      teachers: teachersQuery.data?.teachers || [],
      courses: coursesQuery.data?.courses || [],
    };
  }, [coursesQuery.data?.courses, previewWorkspace, teachersQuery.data?.teachers]);

  const teachers = workspace.teachers || [];
  const courses = workspace.courses || [];
  const disciplineObservations = disciplineObservationsQuery.data?.observations || [];
  const plannerCycles = plannerCyclesQuery.data?.data?.cycles || plannerCyclesQuery.data?.cycles || [];
  const plannerRequests = plannerRequestsQuery.data?.data?.requests || plannerRequestsQuery.data?.requests || [];
  const scheduleRows = useMemo(() => buildScheduleRows(), []);

  useEffect(() => {
    if (!teachers.length) {
      setSelectedTeacherId('');
      return;
    }

    setSelectedTeacherId((current) => (current && teachers.some((teacher) => teacher.userId === current) ? current : teachers[0].userId));
  }, [teachers]);

  const teacherCourses = useMemo(
    () => courses.filter((course) => String(course.teacherUserId || '') === String(selectedTeacherId || '')),
    [courses, selectedTeacherId]
  );

  useEffect(() => {
    if (!teacherCourses.length) {
      setSelectedCourseId('');
      return;
    }

    setSelectedCourseId((current) => (current && teacherCourses.some((course) => course.id === current) ? current : teacherCourses[0].id));
  }, [teacherCourses]);

  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => teacher.userId === selectedTeacherId) || null,
    [selectedTeacherId, teachers]
  );
  const selectedCourse = useMemo(
    () => teacherCourses.find((course) => course.id === selectedCourseId) || null,
    [selectedCourseId, teacherCourses]
  );

  useEffect(() => {
    setDraftSessions(sortSessions(selectedCourse?.classSessions || []));
  }, [selectedCourse]);

  const occupiedSlots = useMemo(() => {
    const occupied = new Map();

    teacherCourses.forEach((course) => {
      if (course.id === selectedCourseId) {
        return;
      }

      (course.classSessions || []).forEach((session) => {
        occupied.set(buildSessionKey(session), {
          courseId: course.id,
          courseTitle: course.title,
          subject: course.subject,
          studentGradeKey: course.studentGradeKey,
          label: session.label || 'Bloque asignado',
        });
      });
    });

    return occupied;
  }, [selectedCourseId, teacherCourses]);

  const selectedSessionMap = useMemo(() => new Map(draftSessions.map((session) => [buildSessionKey(session), session])), [draftSessions]);

  const onToggleSlot = (weekday, row) => {
    const nextSessionKey = buildSessionKey({ weekday, startTime: row.startTime, endTime: row.endTime });
    if (occupiedSlots.has(nextSessionKey)) {
      return;
    }

    setDraftSessions((currentSessions) => {
      const exists = currentSessions.some((session) => buildSessionKey(session) === nextSessionKey);
      if (exists) {
        return sortSessions(currentSessions.filter((session) => buildSessionKey(session) !== nextSessionKey));
      }

      return sortSessions([
        ...currentSessions,
        {
          weekday,
          startTime: row.startTime,
          endTime: row.endTime,
          label: '',
        },
      ]);
    });
  };

  const onChangeSessionLabel = (sessionKey, value) => {
    setDraftSessions((currentSessions) => currentSessions.map((session) => (
      buildSessionKey(session) === sessionKey
        ? { ...session, label: value }
        : session
    )));
  };

  const onSaveSchedule = async () => {
    if (!selectedCourse) {
      return;
    }

    const payload = {
      classSessions: draftSessions.map((session) => ({
        weekday: Number(session.weekday),
        startTime: session.startTime,
        endTime: session.endTime,
        label: String(session.label || '').trim(),
      })),
    };

    if (campusPreviewEnabled) {
      setPreviewWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        courses: currentWorkspace.courses.map((course) => (
          course.id === selectedCourse.id
            ? { ...course, classSessions: payload.classSessions }
            : course
        )),
      }));
      setNotice({ type: 'success', text: 'Horario actualizado correctamente en vista previa.' });
      return;
    }

    await updateCourseMutation.mutateAsync({ courseId: selectedCourse.id, payload });
  };

  const onCreatePlannerCycle = async (event) => {
    event.preventDefault();
    if (!plannerCycleDraft.title.trim() || !plannerCycleDraft.submissionDeadline) {
      setNotice({ type: 'error', text: 'Escribe titulo y fecha limite del planner.' });
      return;
    }

    await createPlannerCycleMutation.mutateAsync(plannerCycleDraft);
  };

  const onTogglePlannerRequest = (requestId) => {
    setSelectedPlannerRequestIds((currentIds) => (
      currentIds.includes(requestId)
        ? currentIds.filter((currentId) => currentId !== requestId)
        : [...currentIds, requestId]
    ));
  };

  const onConsolidatePlannerRequests = async () => {
    if (!selectedPlannerRequestIds.length) {
      setNotice({ type: 'error', text: 'Selecciona al menos un planner docente para consolidar.' });
      return;
    }

    await consolidatePlannerMutation.mutateAsync({
      requestIds: selectedPlannerRequestIds,
      reviewNotes: plannerConsolidationNote,
      priority: 'medium',
    });
  };

  const teacherLoadError = teachersQuery.error?.message;
  const courseLoadError = coursesQuery.error?.message;

  return (
    <section className="campus-shell__page campus-coordination">
      <div className="campus-shell__hero campus-shell__hero--compact">
        <div className="campus-shell__hero-copy">
          <span className="campus-panel__kicker">Campus Coordinación</span>
          <h1>Asignación de horarios</h1>
          <p>Define bloques válidos por curso sin chocar horarios del mismo docente. La grilla muestra ocupación real antes de guardar.</p>
        </div>
      </div>

      <div className="campus-coordination__layout">
        <article className="campus-coordination__filters campus-teacher__panel-surface">
          <div className="campus-teacher__panel-head">
            <div>
              <span className="campus-panel__kicker">Planeación</span>
              <h2>Docente y curso</h2>
            </div>
          </div>

          {notice.text ? <DismissibleNotice onClose={() => setNotice({ type: 'info', text: '' })} text={notice.text} type={notice.type} /> : null}
          {teacherLoadError ? <DismissibleNotice text={teacherLoadError} type="error" /> : null}
          {courseLoadError ? <DismissibleNotice text={courseLoadError} type="error" /> : null}

          <label className="campus-coordination__field">
            <span>Docente</span>
            <select value={selectedTeacherId} onChange={(event) => setSelectedTeacherId(event.target.value)}>
              {teachers.map((teacher) => (
                <option key={teacher.userId} value={teacher.userId}>{teacher.name}</option>
              ))}
            </select>
          </label>

          <label className="campus-coordination__field">
            <span>Curso</span>
            <select value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>
              {teacherCourses.map((course) => (
                <option key={course.id} value={course.id}>{course.title}</option>
              ))}
            </select>
          </label>

          {selectedCourse ? (
            <div className="campus-coordination__course-card" style={{ '--campus-course-accent': selectedCourse.colorToken || '#2a6f97' }}>
              <strong>{selectedCourse.title}</strong>
              <span>{[selectedCourse.subject, selectedCourse.studentGradeKey].filter(Boolean).join(' · ')}</span>
              <small>{selectedTeacher?.name || 'Docente sin nombre'}</small>
            </div>
          ) : <p className="campus-panel__meta">Selecciona un docente con cursos asignados.</p>}

          {selectedCourse ? (
            <div className="campus-coordination__selected-list">
              <div className="campus-teacher__panel-head">
                <div>
                  <span className="campus-panel__kicker">Contenido académico</span>
                  <h3>Temas por periodo</h3>
                </div>
              </div>
              {(selectedCourse.academicContent || []).length > 0 ? (selectedCourse.academicContent || []).map((period) => (
                <div className="campus-coordination__selected-item" key={period.periodKey}>
                  <div>
                    <strong>{period.periodName}</strong>
                    <span>{formatContentPeriodRange(period.startDate, period.endDate)}</span>
                    {(period.topics || []).length > 0 ? (
                      <small>{(period.topics || []).map((topic) => topic.title).join(' · ')}</small>
                    ) : <small>Sin temas cargados</small>}
                  </div>
                </div>
              )) : <p className="campus-panel__meta">El docente todavía no ha cargado temas para este curso.</p>}
            </div>
          ) : null}

          <div className="campus-coordination__selected-list">
            <div className="campus-teacher__panel-head">
              <div>
                <span className="campus-panel__kicker">Convivencia escolar</span>
                <h3>Observaciones docentes</h3>
              </div>
            </div>
            {disciplineObservationsQuery.isLoading ? <p className="campus-panel__meta">Cargando observaciones...</p> : null}
            {disciplineObservations.length === 0 && !disciplineObservationsQuery.isLoading ? <p className="campus-panel__meta">No hay observaciones de comportamiento registradas.</p> : null}
            {disciplineObservations.slice(0, 6).map((item) => (
              <div className="campus-coordination__selected-item" key={item.id}>
                <div>
                  <strong>{item.studentName}</strong>
                  <span>{[item.courseTitle, item.teacherName].filter(Boolean).join(' · ')}</span>
                  <small>{item.observation}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="campus-coordination__selected-list">
            <div className="campus-teacher__panel-head">
              <div>
                <span className="campus-panel__kicker">Bloques del curso</span>
                <h3>{draftSessions.length} seleccionados</h3>
              </div>
            </div>
            {draftSessions.length > 0 ? draftSessions.map((session) => {
              const sessionKey = buildSessionKey(session);
              return (
                <div className="campus-coordination__selected-item" key={sessionKey}>
                  <div>
                    <strong>{weekdays.find((day) => day.key === Number(session.weekday))?.label || 'Día'}</strong>
                    <span>{session.startTime} - {session.endTime}</span>
                  </div>
                  <input
                    placeholder="Etiqueta del bloque"
                    type="text"
                    value={session.label || ''}
                    onChange={(event) => onChangeSessionLabel(sessionKey, event.target.value)}
                  />
                </div>
              );
            }) : <p className="campus-panel__meta">Haz clic en la grilla para asignar uno o varios bloques a este curso.</p>}
          </div>

          <button className="campus-coordination__save-button" disabled={!selectedCourse || updateCourseMutation.isPending} onClick={onSaveSchedule} type="button">
            {updateCourseMutation.isPending ? 'Guardando...' : 'Guardar horario'}
          </button>
        </article>

        <article className="campus-coordination__filters campus-teacher__panel-surface">
          <div className="campus-teacher__panel-head">
            <div>
              <span className="campus-panel__kicker">Recursos didacticos</span>
              <h2>Planner docente</h2>
            </div>
          </div>

          <form className="campus-teacher__resource-form" onSubmit={onCreatePlannerCycle}>
            <label className="campus-coordination__field">
              <span>Titulo</span>
              <input value={plannerCycleDraft.title} onChange={(event) => setPlannerCycleDraft((draft) => ({ ...draft, title: event.target.value }))} placeholder="Planner semana cultural" />
            </label>
            <label className="campus-coordination__field">
              <span>Desde</span>
              <input type="date" value={plannerCycleDraft.startDate} onChange={(event) => setPlannerCycleDraft((draft) => ({ ...draft, startDate: event.target.value }))} />
            </label>
            <label className="campus-coordination__field">
              <span>Hasta</span>
              <input type="date" value={plannerCycleDraft.endDate} onChange={(event) => setPlannerCycleDraft((draft) => ({ ...draft, endDate: event.target.value }))} />
            </label>
            <label className="campus-coordination__field">
              <span>Fecha limite</span>
              <input type="date" value={plannerCycleDraft.submissionDeadline} onChange={(event) => setPlannerCycleDraft((draft) => ({ ...draft, submissionDeadline: event.target.value }))} />
            </label>
            <label className="campus-coordination__field">
              <span>Indicaciones</span>
              <textarea value={plannerCycleDraft.instructions} onChange={(event) => setPlannerCycleDraft((draft) => ({ ...draft, instructions: event.target.value }))} rows={3} />
            </label>
            <label className="campus-coordination__field campus-coordination__field--checkbox">
              <span>
                <input
                  checked={Boolean(plannerCycleDraft.publishAsAnnouncement)}
                  onChange={(event) => setPlannerCycleDraft((draft) => ({ ...draft, publishAsAnnouncement: event.target.checked }))}
                  type="checkbox"
                />
                {' '}También publicar en Comunicados internos para docentes
              </span>
            </label>
            <button className="campus-coordination__save-button" disabled={createPlannerCycleMutation.isPending} type="submit">
              {createPlannerCycleMutation.isPending ? 'Creando...' : 'Definir planner'}
            </button>
          </form>

          <div className="campus-coordination__selected-list">
            <div className="campus-teacher__panel-head">
              <div>
                <span className="campus-panel__kicker">Activos</span>
                <h3>{plannerCycles.length} planner(s)</h3>
              </div>
            </div>
            {plannerCycles.length === 0 ? <p className="campus-panel__meta">No hay planners activos.</p> : null}
            {plannerCycles.map((cycle) => (
              <div className="campus-coordination__selected-item" key={cycle.id}>
                <div>
                  <strong>{cycle.title}</strong>
                  <span>{formatPlannerDate(cycle.startDate)} - {formatPlannerDate(cycle.endDate)}</span>
                  <small>Limite: {formatPlannerDate(cycle.submissionDeadline)}</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="campus-coordination__filters campus-teacher__panel-surface">
          <div className="campus-teacher__panel-head">
            <div>
              <span className="campus-panel__kicker">Consolidacion</span>
              <h2>Planners recibidos</h2>
            </div>
            <button className="campus-teacher__ghost-btn" disabled={plannerRequestsQuery.isFetching} onClick={() => plannerRequestsQuery.refetch()} type="button">Actualizar</button>
          </div>

          {plannerRequestsQuery.isLoading ? <p className="campus-panel__meta">Cargando planners docentes...</p> : null}
          {plannerRequests.length === 0 && !plannerRequestsQuery.isLoading ? <p className="campus-panel__meta">No hay planners pendientes de consolidar.</p> : null}
          <div className="campus-coordination__selected-list">
            {plannerRequests.map((request) => (
              <button className={`campus-coordination__selected-item${selectedPlannerRequestIds.includes(request.id) ? ' is-selected' : ''}`} key={request.id} onClick={() => onTogglePlannerRequest(request.id)} type="button">
                <div>
                  <strong>{request.requestedBy?.name || 'Docente'}</strong>
                  <span>{request.plannerCycle?.title || 'Planner'} · {request.requestedForArea || 'Sin area'}</span>
                  <small>{getPlannerRequestItemsLabel(request)}</small>
                </div>
              </button>
            ))}
          </div>

          <label className="campus-coordination__field">
            <span>Nota para compras</span>
            <textarea value={plannerConsolidationNote} onChange={(event) => setPlannerConsolidationNote(event.target.value)} rows={3} />
          </label>
          <button className="campus-coordination__save-button" disabled={consolidatePlannerMutation.isPending || selectedPlannerRequestIds.length === 0} onClick={onConsolidatePlannerRequests} type="button">
            {consolidatePlannerMutation.isPending ? 'Enviando...' : 'Enviar consolidado a compras'}
          </button>
        </article>

        <article className="campus-coordination__grid-panel campus-teacher__panel-surface">
          <div className="campus-teacher__panel-head">
            <div>
              <span className="campus-panel__kicker">Matriz semanal</span>
              <h2>Disponibilidad del docente</h2>
            </div>
            <p className="campus-panel__meta">Selecciona una celda libre para asignarla al curso actual. Las celdas ocupadas por otros cursos quedan bloqueadas.</p>
          </div>

          <div className="campus-coordination__grid-wrap">
            <table className="campus-coordination__grid">
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  {weekdays.map((day) => <th key={day.key} scope="col">{day.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {scheduleRows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    {weekdays.map((day) => {
                      const cellKey = buildSessionKey({ weekday: day.key, startTime: row.startTime, endTime: row.endTime });
                      const selectedSession = selectedSessionMap.get(cellKey);
                      const occupiedSession = occupiedSlots.get(cellKey);
                      const className = occupiedSession
                        ? 'campus-coordination__slot is-occupied'
                        : selectedSession
                          ? 'campus-coordination__slot is-selected'
                          : 'campus-coordination__slot';

                      return (
                        <td key={`${row.key}-${day.key}`}>
                          <button className={className} disabled={Boolean(occupiedSession)} onClick={() => onToggleSlot(day.key, row)} type="button">
                            {occupiedSession ? (
                              <>
                                <strong>{occupiedSession.courseTitle}</strong>
                                <span>{occupiedSession.studentGradeKey}</span>
                              </>
                            ) : selectedSession ? (
                              <>
                                <strong>{selectedCourse?.title || 'Curso'}</strong>
                                <span>{selectedSession.label || 'Bloque seleccionado'}</span>
                              </>
                            ) : <span>Disponible</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}

export default CoordinationCampusHome;
