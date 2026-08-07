import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCampusAttendanceReport } from '../../campus/services/campus.service';

const statusFilters = [
  { value: 'attention', label: 'Ausentes y tarde' },
  { value: 'all', label: 'Todos' },
  { value: 'absent', label: 'Ausentes' },
  { value: 'late', label: 'Tarde' },
  { value: 'present', label: 'Presentes' },
  { value: 'excused', label: 'Excusados' },
];

function getTodayDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value) {
  if (!value) return 'Sin fecha';
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function recordMatchesFilter(record, filter) {
  if (filter === 'all') return true;
  if (filter === 'attention') return record.status === 'absent' || record.status === 'late';
  return record.status === filter;
}

export default function GuidanceAttendanceReportPanel({
  className = '',
  description = 'Asistencia de llegada al colegio tomada por el docente headroom (primera del día). No incluye asistencia por materias.',
  kicker = 'Llegada al colegio',
  title = 'Asistencia del día',
}) {
  const [date, setDate] = useState(getTodayDateInputValue);
  const [statusFilter, setStatusFilter] = useState('attention');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCourseId, setExpandedCourseId] = useState('');

  const loadReport = useCallback(async (nextDate = date) => {
    setLoading(true);
    setError('');
    try {
      const payload = await getCampusAttendanceReport({
        date: nextDate,
        attendanceType: 'guidance_routine',
      });
      setReport(payload || null);
      const firstSubmitted = (payload?.sessions || []).find((session) => session.submitted);
      setExpandedCourseId((current) => {
        if (current && (payload?.sessions || []).some((session) => session.courseId === current)) {
          return current;
        }
        return firstSubmitted?.courseId || payload?.sessions?.[0]?.courseId || '';
      });
    } catch (requestError) {
      setReport(null);
      setError(requestError?.response?.data?.message || 'No se pudo cargar el reporte de asistencia.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadReport(date);
  }, [date, loadReport]);

  const summary = report?.summary || {
    sessionsSubmitted: 0,
    coursesMissing: 0,
    studentsMarked: 0,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
  };

  const sessions = useMemo(() => report?.sessions || [], [report]);

  const filteredSessions = useMemo(() => sessions.map((session) => {
    const records = (session.records || []).filter((record) => recordMatchesFilter(record, statusFilter));
    return { ...session, filteredRecords: records };
  }).filter((session) => {
    if (statusFilter === 'all') return true;
    if (!session.submitted) return statusFilter === 'attention';
    return session.filteredRecords.length > 0;
  }), [sessions, statusFilter]);

  return (
    <section className={`guidance-attendance-panel${className ? ` ${className}` : ''}`}>
      <header className="guidance-attendance-panel__head">
        <div>
          <span className="guidance-attendance-panel__kicker">{kicker}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="guidance-attendance-panel__controls">
          <label>
            <span>Fecha</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value || getTodayDateInputValue())}
            />
          </label>
          <button
            className="guidance-attendance-panel__refresh"
            disabled={loading}
            onClick={() => loadReport(date)}
            type="button"
          >
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </header>

      <p className="guidance-attendance-panel__date-label">{formatDateLabel(date)}</p>

      {error ? <p className="guidance-attendance-panel__error">{error}</p> : null}

      <div className="guidance-attendance-panel__kpis">
        <article>
          <span>Presentes</span>
          <strong>{summary.present || 0}</strong>
        </article>
        <article className="is-late">
          <span>Tarde</span>
          <strong>{summary.late || 0}</strong>
        </article>
        <article className="is-absent">
          <span>Ausentes</span>
          <strong>{summary.absent || 0}</strong>
        </article>
        <article>
          <span>Excusados</span>
          <strong>{summary.excused || 0}</strong>
        </article>
        <article>
          <span>Planillas enviadas</span>
          <strong>{summary.sessionsSubmitted || 0}</strong>
        </article>
        <article className="is-missing">
          <span>Sin registrar</span>
          <strong>{summary.coursesMissing || 0}</strong>
        </article>
      </div>

      <div className="guidance-attendance-panel__filters" role="tablist" aria-label="Filtro de asistencia">
        {statusFilters.map((filter) => (
          <button
            className={statusFilter === filter.value ? 'is-active' : ''}
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? <p className="guidance-attendance-panel__empty">Cargando asistencia de llegada...</p> : null}

      {!loading && filteredSessions.length === 0 ? (
        <div className="guidance-attendance-panel__empty-card">
          <strong>Sin registros para este filtro</strong>
          <p>
            {sessions.length === 0
              ? 'Todavía no hay planillas de llegada (headroom) para esta fecha.'
              : 'No hay alumnos que coincidan con el filtro seleccionado.'}
          </p>
        </div>
      ) : null}

      {!loading && filteredSessions.length > 0 ? (
        <div className="guidance-attendance-panel__sessions">
          {filteredSessions.map((session) => {
            const isExpanded = expandedCourseId === session.courseId;
            return (
              <article className={`guidance-attendance-session${session.submitted ? '' : ' is-pending'}`} key={session.courseId || session.courseTitle}>
                <button
                  className="guidance-attendance-session__toggle"
                  onClick={() => setExpandedCourseId(isExpanded ? '' : session.courseId)}
                  type="button"
                >
                  <div>
                    <strong>{session.courseTitle || 'Curso'}</strong>
                    <small>
                      {[session.grade, session.teacherName].filter(Boolean).join(' · ') || 'Sin docente'}
                      {session.submittedAt ? ` · ${formatDateTime(session.submittedAt)}` : ''}
                    </small>
                  </div>
                  <div className="guidance-attendance-session__badges">
                    {session.submitted ? (
                      <>
                        <span className="is-absent">{session.summary?.absent || 0} aus.</span>
                        <span className="is-late">{session.summary?.late || 0} tar.</span>
                        <span>{session.summary?.present || 0} pre.</span>
                      </>
                    ) : (
                      <span className="is-missing">Sin planilla</span>
                    )}
                  </div>
                </button>

                {isExpanded ? (
                  <div className="guidance-attendance-session__body">
                    {!session.submitted ? (
                      <p className="guidance-attendance-panel__empty">
                        El docente headroom aún no ha enviado la asistencia de llegada de este curso.
                      </p>
                    ) : null}

                    {session.submitted && session.filteredRecords.length === 0 ? (
                      <p className="guidance-attendance-panel__empty">
                        No hay alumnos en este curso para el filtro actual.
                      </p>
                    ) : null}

                    {session.filteredRecords?.length > 0 ? (
                      <div className="guidance-attendance-session__records">
                        {session.filteredRecords.map((record) => (
                          <div className={`guidance-attendance-record is-${record.status}`} key={`${session.courseId}-${record.studentId}`}>
                            <div>
                              <strong>{record.studentName || 'Estudiante'}</strong>
                              <small>{record.schoolCode || 'Sin código'}</small>
                            </div>
                            <span className={`guidance-attendance-status is-${record.status}`}>
                              {record.statusLabel || record.status}
                            </span>
                            {record.notes ? <p>{record.notes}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
