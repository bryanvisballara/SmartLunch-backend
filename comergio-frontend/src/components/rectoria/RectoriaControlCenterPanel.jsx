import { useEffect, useMemo, useState } from 'react';
import { getPsychologyDashboard } from '../../services/psychology.service';
import { getNursingSummary } from '../../services/nursing.service';
import './RectoriaControlCenter.css';

function formatScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toFixed(Number.isInteger(numeric) ? 0 : 1);
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function ControlKpiGrid({ items = [] }) {
  return (
    <div className="rectoria-control-kpi-grid">
      {items.map((item) => (
        <article className={`rectoria-control-kpi${item.tone ? ` is-tone-${item.tone}` : ''}`} key={item.key}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.helper ? <small>{item.helper}</small> : null}
        </article>
      ))}
    </div>
  );
}

function ControlListPanel({ title, emptyLabel, items = [] }) {
  return (
    <section className="rectoria-control-list-panel">
      <h3>{title}</h3>
      {items.length === 0 ? <p className="rectoria-control-empty">{emptyLabel}</p> : (
        <div className="rectoria-control-list">
          {items.map((item) => (
            <article className="rectoria-control-list-item" key={item.key}>
              <strong>{item.title}</strong>
              {item.meta ? <span>{item.meta}</span> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function RectoriaControlCenterPanel({
  view,
  overviewAcademicPerformance,
  overviewAcademicLevelKpi,
  educationalLevelSummaries = [],
  academicStructureDraft,
  campusPerformanceCourses = [],
  students = [],
  teacherLabelById = {},
  disciplineObservations = [],
  passingScoreLabel = '70',
}) {
  const [wellbeingData, setWellbeingData] = useState(null);
  const [nursingData, setNursingData] = useState(null);
  const [loadingWellbeing, setLoadingWellbeing] = useState(false);
  const [loadingNursing, setLoadingNursing] = useState(false);

  useEffect(() => {
    if (view !== 'control_wellbeing') return undefined;
    let cancelled = false;
    setLoadingWellbeing(true);
    getPsychologyDashboard()
      .then((response) => {
        if (!cancelled) setWellbeingData(response.data || null);
      })
      .catch(() => {
        if (!cancelled) setWellbeingData(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingWellbeing(false);
      });
    return () => { cancelled = true; };
  }, [view]);

  useEffect(() => {
    if (view !== 'control_nursing') return undefined;
    let cancelled = false;
    setLoadingNursing(true);
    getNursingSummary()
      .then((response) => {
        if (!cancelled) setNursingData(response.data || null);
      })
      .catch(() => {
        if (!cancelled) setNursingData(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingNursing(false);
      });
    return () => { cancelled = true; };
  }, [view]);

  const subjectRows = useMemo(() => {
    const subjects = Array.isArray(academicStructureDraft?.subjects) ? academicStructureDraft.subjects : [];
    const buckets = campusPerformanceCourses.reduce((accumulator, course) => {
      const subjectKey = String(course.subject || course.subjectKey || 'sin-asignatura').trim();
      const current = accumulator.get(subjectKey) || {
        key: subjectKey,
        label: subjectKey,
        courses: 0,
        evaluatedStudents: 0,
        scoreTotal: 0,
        scoreCount: 0,
        atRisk: 0,
      };
      current.courses += 1;
      current.evaluatedStudents += Number(course.evaluatedStudentCount || 0);
      if (Number.isFinite(Number(course.averageScore))) {
        current.scoreTotal += Number(course.averageScore);
        current.scoreCount += 1;
      }
      current.atRisk += Number(course.atRiskCount || 0);
      accumulator.set(subjectKey, current);
      return accumulator;
    }, new Map());

    subjects.forEach((subject) => {
      const key = String(subject.key || subject.label || '').trim();
      if (!key || buckets.has(key)) return;
      buckets.set(key, {
        key,
        label: subject.label || key,
        courses: 0,
        evaluatedStudents: 0,
        scoreTotal: 0,
        scoreCount: 0,
        atRisk: 0,
      });
    });

    return Array.from(buckets.values())
      .map((row) => ({
        ...row,
        averageScore: row.scoreCount > 0 ? Number((row.scoreTotal / row.scoreCount).toFixed(2)) : null,
      }))
      .sort((left, right) => Number(left.averageScore || 10) - Number(right.averageScore || 10));
  }, [academicStructureDraft?.subjects, campusPerformanceCourses]);

  const viewMeta = {
    control_levels: {
      eyebrow: 'Centro de control',
      title: 'Niveles académicos',
      description: 'Promedios consolidados, cobertura de calificaciones y alertas por nivel educativo.',
    },
    control_subjects: {
      eyebrow: 'Centro de control',
      title: 'Asignaturas',
      description: 'Lectura por materia según los promedios publicados por los docentes en campus.',
    },
    control_students: {
      eyebrow: 'Centro de control',
      title: 'Alumnos',
      description: 'Cobertura de evaluación, estudiantes en riesgo y pendientes por curso.',
    },
    control_teachers: {
      eyebrow: 'Centro de control',
      title: 'Docentes',
      description: 'Carga académica, cobertura de calificación y promedios por docente.',
    },
    control_wellbeing: {
      eyebrow: 'Centro de control',
      title: 'Bienestar',
      description: 'Casos activos reportados por el equipo psicosocial institucional.',
    },
    control_nursing: {
      eyebrow: 'Centro de control',
      title: 'Enfermería',
      description: 'Atenciones registradas por enfermería escolar.',
    },
    control_coexistence: {
      eyebrow: 'Centro de control',
      title: 'Convivencia',
      description: 'Observaciones de comportamiento reportadas por docentes y equipo institucional.',
    },
  }[view] || { eyebrow: 'Centro de control', title: 'Indicadores', description: '' };

  const levelKpis = [
    { key: 'levels', label: 'Niveles activos', value: overviewAcademicLevelKpi.totalLevels || 0, helper: `${overviewAcademicLevelKpi.totalGrades || 0} grados` },
    { key: 'courses', label: 'Cursos', value: overviewAcademicLevelKpi.totalCourses || 0, helper: 'En la estructura académica' },
    { key: 'students', label: 'Estudiantes', value: overviewAcademicLevelKpi.assignedStudents + overviewAcademicLevelKpi.pendingStudents, helper: `${overviewAcademicLevelKpi.assignedStudents || 0} con curso` },
    { key: 'evaluated', label: 'Evaluados', value: overviewAcademicPerformance?.evaluatedStudentCount || 0, helper: 'Con notas publicadas' },
  ];

  const studentKpis = [
    { key: 'total', label: 'Matriculados', value: students.length, helper: 'Alumnos activos en el colegio' },
    { key: 'assigned', label: 'Con curso', value: overviewAcademicLevelKpi.assignedStudents || 0, helper: 'Asignación completada' },
    { key: 'pending', label: 'Sin curso', value: overviewAcademicLevelKpi.pendingStudents || 0, helper: 'Pendientes por asignar', tone: overviewAcademicLevelKpi.pendingStudents > 0 ? 'warn' : '' },
    { key: 'risk', label: `Bajo ${passingScoreLabel}`, value: overviewAcademicPerformance?.atRiskStudents?.length || 0, helper: 'Promedio consolidado', tone: (overviewAcademicPerformance?.atRiskStudents?.length || 0) > 0 ? 'danger' : '' },
  ];

  const teacherRows = overviewAcademicPerformance?.teacherAttentionRows || [];

  return (
    <div className="rectoria-control-center">
      <header className="rectoria-control-hero">
        <div>
          <span className="rectoria-control-eyebrow">{viewMeta.eyebrow}</span>
          <h2>{viewMeta.title}</h2>
          <p>{viewMeta.description}</p>
        </div>
        {view === 'control_levels' && overviewAcademicPerformance?.weightedAverage != null ? (
          <div className="rectoria-control-hero-metric">
            <span>Promedio institucional</span>
            <strong>{formatScore(overviewAcademicPerformance.weightedAverage)}</strong>
          </div>
        ) : null}
      </header>

      {view === 'control_levels' ? (
        <>
          <ControlKpiGrid items={levelKpis} />
          <div className="rectoria-control-level-grid">
            {(overviewAcademicPerformance?.levelRows || []).map((level) => (
              <article className="rectoria-control-level-card" key={level.key}>
                <div className="rectoria-control-level-card-head">
                  <strong>{level.label}</strong>
                  <span className={`rectoria-control-pill is-tone-${level.performanceMeta?.tone || 'info'}`}>
                    {level.performanceMeta?.label || 'Sin calificaciones'}
                  </span>
                </div>
                <div className="rectoria-control-level-metrics">
                  <div><span>Promedio</span><strong>{level.averageScore == null ? '—' : formatScore(level.averageScore)}</strong></div>
                  <div><span>Evaluados</span><strong>{level.evaluatedStudentCount || 0}</strong></div>
                  <div><span>En riesgo</span><strong>{level.atRiskCount || 0}</strong></div>
                  <div><span>Grados</span><strong>{level.gradesCount || 0}</strong></div>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {view === 'control_subjects' ? (
        <>
          <ControlKpiGrid items={[
            { key: 'subjects', label: 'Asignaturas', value: subjectRows.length, helper: 'Configuradas en el colegio' },
            { key: 'courses', label: 'Cursos campus', value: campusPerformanceCourses.length, helper: 'Con seguimiento académico' },
            { key: 'evaluated', label: 'Evaluaciones', value: overviewAcademicPerformance?.evaluatedStudentCount || 0, helper: 'Estudiantes con notas' },
            { key: 'attention', label: 'Cursos en atención', value: overviewAcademicPerformance?.coursesNeedingAttention?.length || 0, helper: 'Bajo umbral o en riesgo', tone: (overviewAcademicPerformance?.coursesNeedingAttention?.length || 0) > 0 ? 'warn' : '' },
          ]} />
          <ControlListPanel
            emptyLabel="No hay asignaturas configuradas todavía."
            items={subjectRows.map((row) => ({
              key: row.key,
              title: row.label,
              meta: `${row.courses} curso${row.courses === 1 ? '' : 's'} · Promedio ${row.averageScore == null ? '—' : formatScore(row.averageScore)} · ${row.atRisk} en riesgo`,
            }))}
            title="Lectura por asignatura"
          />
        </>
      ) : null}

      {view === 'control_students' ? (
        <>
          <ControlKpiGrid items={studentKpis} />
          <ControlListPanel
            emptyLabel="No hay estudiantes bajo el umbral con calificaciones registradas."
            items={(overviewAcademicPerformance?.atRiskStudents || []).slice(0, 12).map((student) => ({
              key: student.studentId || student.schoolCode || student.name,
              title: student.name || 'Alumno',
              meta: `${formatScore(student.finalScore)} · ${student.courseLabel} · ${student.teacherLabel}`,
            }))}
            title="Estudiantes con promedio bajo"
          />
        </>
      ) : null}

      {view === 'control_teachers' ? (
        <>
          <ControlKpiGrid items={[
            { key: 'teachers', label: 'Docentes', value: teacherRows.length || educationalLevelSummaries.reduce((sum, level) => sum + Number(level.coordinatorCount || 0), 0), helper: 'Con datos de calificación' },
            { key: 'courses', label: 'Cursos monitoreados', value: campusPerformanceCourses.length, helper: 'En campus docente' },
            { key: 'pending', label: 'Por calificar', value: overviewAcademicPerformance?.pendingGradingCount || 0, helper: 'Actividades pendientes' },
            { key: 'risk', label: 'Alumnos en riesgo', value: overviewAcademicPerformance?.atRiskStudents?.length || 0, helper: 'Consolidado por alumno' },
          ]} />
          <ControlListPanel
            emptyLabel="Aún no hay suficientes calificaciones para priorizar docentes."
            items={teacherRows.slice(0, 12).map((teacher) => ({
              key: teacher.key,
              title: teacher.label,
              meta: `Promedio ${formatScore(teacher.averageScore)} · ${teacher.atRiskCount} en riesgo · ${teacher.coursesCount} cursos`,
            }))}
            title="Docentes a revisar"
          />
        </>
      ) : null}

      {view === 'control_wellbeing' ? (
        <>
          {loadingWellbeing ? <p className="rectoria-control-empty">Cargando indicadores de bienestar...</p> : null}
          {!loadingWellbeing ? (
            <>
              <ControlKpiGrid items={[
                { key: 'active', label: 'Casos activos', value: wellbeingData?.summary?.activeCount || 0, helper: 'Abiertos o en seguimiento' },
                { key: 'urgent', label: 'Urgentes', value: wellbeingData?.summary?.urgentCount || 0, helper: 'Prioridad alta', tone: (wellbeingData?.summary?.urgentCount || 0) > 0 ? 'danger' : '' },
                { key: 'week', label: 'Nuevos esta semana', value: wellbeingData?.summary?.newThisWeekCount || 0, helper: 'Casos creados' },
                { key: 'follow', label: 'Seguimiento pendiente', value: wellbeingData?.summary?.followUpDueCount || 0, helper: 'Requieren acción', tone: (wellbeingData?.summary?.followUpDueCount || 0) > 0 ? 'warn' : '' },
              ]} />
              <ControlListPanel
                emptyLabel="No hay casos de bienestar reportados todavía."
                items={(wellbeingData?.recentCases || []).map((item) => ({
                  key: item.id || item._id,
                  title: item.student?.name || item.studentName || 'Alumno',
                  meta: `${item.caseType || item.title || 'Caso'} · ${item.status || 'abierto'} · ${formatDate(item.updatedAt || item.createdAt)}`,
                }))}
                title="Casos recientes"
              />
            </>
          ) : null}
        </>
      ) : null}

      {view === 'control_nursing' ? (
        <>
          {loadingNursing ? <p className="rectoria-control-empty">Cargando indicadores de enfermería...</p> : null}
          {!loadingNursing ? (
            <>
              <ControlKpiGrid items={[
                { key: 'total', label: 'Atenciones totales', value: nursingData?.summary?.totalVisits || 0, helper: 'Registradas en enfermería' },
                { key: 'week', label: 'Esta semana', value: nursingData?.summary?.visitsThisWeek || 0, helper: 'Atenciones recientes' },
                { key: 'students', label: 'Alumnos atendidos', value: nursingData?.summary?.studentsAttended || 0, helper: 'Con historial clínico' },
                { key: 'discipline', label: 'Observaciones convivencia', value: disciplineObservations.length, helper: 'Reportadas por docentes' },
              ]} />
              <ControlListPanel
                emptyLabel="No hay atenciones de enfermería registradas todavía."
                items={(nursingData?.recentVisits || []).map((item) => ({
                  key: item.id,
                  title: item.studentName || 'Alumno',
                  meta: `${item.reason || 'Atención'} · ${formatDate(item.attendedAt)}`,
                }))}
                title="Atenciones recientes"
              />
            </>
          ) : null}
        </>
      ) : null}

      {view === 'control_coexistence' ? (
        <>
          <ControlKpiGrid items={[
            { key: 'total', label: 'Observaciones', value: disciplineObservations.length, helper: 'Reportes de convivencia' },
            { key: 'week', label: 'Últimos 30 registros', value: Math.min(disciplineObservations.length, 30), helper: 'Cargados en el tablero' },
            { key: 'students', label: 'Alumnos', value: new Set(disciplineObservations.map((item) => item.studentName || item.studentId).filter(Boolean)).size, helper: 'Con observaciones' },
            { key: 'risk', label: 'En riesgo académico', value: overviewAcademicPerformance?.atRiskStudents?.length || 0, helper: 'Promedio bajo umbral' },
          ]} />
          <ControlListPanel
            emptyLabel="No hay observaciones de convivencia registradas."
            items={disciplineObservations.slice(0, 12).map((item) => ({
              key: item.id || `${item.studentId}-${item.submittedAt}`,
              title: item.studentName || 'Alumno',
              meta: `${item.category || item.type || 'Observación'} · ${item.teacherName || item.reportedBy || 'Docente'} · ${formatDate(item.submittedAt || item.createdAt)}`,
            }))}
            title="Observaciones recientes"
          />
        </>
      ) : null}
    </div>
  );
}
