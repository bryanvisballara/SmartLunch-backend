import { useMemo } from 'react';
import './CoordinationLevelDashboard.css';
import CoordinationGradesScoresTable from './CoordinationGradesScoresTable';
import { PortalBootSplash } from './PortalBootSplash';

function formatScore(value) {
  if (!Number.isFinite(Number(value))) return 'Sin nota';
  return Number(value).toFixed(2);
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function SectionHeader({ eyebrow, title, description, metric }) {
  return (
    <div className="coordination-section-header">
      <div>
        {eyebrow ? <span className="coordination-section-eyebrow">{eyebrow}</span> : null}
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {metric ? <div className="coordination-section-metric">{metric}</div> : null}
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="coordination-empty-note">{children}</p>;
}

export default function CoordinationLevelDashboard({ dashboard, loading = false, onRefresh }) {
  const summary = dashboard?.summary || {};
  const grades = Array.isArray(dashboard?.grades) ? dashboard.grades : [];
  const subjectsOverview = Array.isArray(dashboard?.subjectsOverview) ? dashboard.subjectsOverview : [];
  const teachers = Array.isArray(dashboard?.teachers) ? dashboard.teachers : [];
  const performance = dashboard?.performance || {};
  const discipline = dashboard?.discipline || { items: [] };
  const nursing = dashboard?.nursing || { items: [] };
  const wellbeing = dashboard?.wellbeing || { items: [] };

  const scopeLabel = dashboard?.scope?.label || dashboard?.scope?.coordinationScope || 'Nivel asignado';

  const summaryCards = useMemo(() => ([
    { label: 'Estudiantes', value: summary.studentCount || 0, hint: `${summary.assignedStudentCount || 0} con curso` },
    { label: 'Grados', value: summary.gradeCount || 0, hint: `${summary.structureCourseCount || 0} cursos estructura` },
    { label: 'Materias', value: summary.subjectCount || 0, hint: `${summary.campusCourseCount || 0} cursos campus` },
    { label: 'Docentes', value: summary.teacherCount || 0, hint: 'Con carga en el nivel' },
    { label: 'Promedio nivel', value: formatScore(summary.averageScore), hint: `Umbral ${formatScore(performance.passingScore)}` },
    { label: 'En riesgo', value: summary.atRiskStudentCount || 0, hint: 'Bajo umbral académico' },
  ]), [summary, performance.passingScore]);

  if (loading) {
    return <PortalBootSplash embedded portal="coordinacion" />;
  }

  if (!dashboard) {
    return (
      <section className="coordination-dashboard">
        <p>No se pudo cargar el tablero de coordinación.</p>
        {onRefresh ? <button className="btn btn-primary" type="button" onClick={onRefresh}>Reintentar</button> : null}
      </section>
    );
  }

  return (
    <section className="coordination-dashboard">
      <header className="coordination-dashboard-hero panel">
        <div>
          <span className="coordination-dashboard-kicker">Tablero de coordinación</span>
          <h2>{scopeLabel}</h2>
          <p>Vista operativa del nivel: grados, docentes, calificaciones, convivencia, enfermería y bienestar.</p>
        </div>
        {onRefresh ? (
          <button className="btn btn-primary" type="button" onClick={onRefresh}>Actualizar tablero</button>
        ) : null}
      </header>

      <div className="coordination-summary-grid">
        {summaryCards.map((card) => (
          <article className="coordination-summary-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.hint}</p>
          </article>
        ))}
      </div>

      <section className="panel coordination-panel">
        <SectionHeader
          eyebrow="Sección 1"
          title="Grados del nivel"
          description="Vista compacta por grado: alumnos, asignación de curso y promedio."
          metric={<strong>{grades.length} grados</strong>}
        />
        {grades.length === 0 ? <EmptyNote>No hay grados configurados para este nivel.</EmptyNote> : (
          <div className="coordination-grade-card-grid">
            {grades.map((grade) => (
              <article
                className={`coordination-grade-compact-card${grade.pendingStudentCount > 0 ? ' has-pending' : ''}`}
                key={grade.key}
              >
                <div className="coordination-grade-compact-card-head">
                  <h4>{grade.label}</h4>
                  <span className="coordination-grade-compact-count">
                    {grade.studentCount} alumno{grade.studentCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="coordination-grade-compact-stats">
                  <div className="coordination-grade-compact-stat">
                    <span>Con curso</span>
                    <strong>{grade.assignedStudentCount}</strong>
                  </div>
                  <div className={`coordination-grade-compact-stat${grade.pendingStudentCount > 0 ? ' is-alert' : ''}`}>
                    <span>Pendientes</span>
                    <strong>{grade.pendingStudentCount}</strong>
                  </div>
                  <div className="coordination-grade-compact-stat">
                    <span>Promedio</span>
                    <strong>{formatScore(grade.averageScore)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel coordination-panel">
        <SectionHeader
          eyebrow="Sección 2"
          title="Convivencia, enfermería y bienestar"
          description="Seguimiento integral de casos recientes del nivel para priorizar acciones de coordinación."
        />
        <div className="coordination-triple-grid">
          <div className="coordination-subpanel">
            <h4>Disciplina ({discipline.total || 0})</h4>
            {discipline.items?.length ? (
              <ul className="coordination-case-list">
                {discipline.items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.studentName}</strong>
                    <span>{item.studentGrade} · {item.teacherName}</span>
                    <p>{item.observation}</p>
                    <small>{formatDate(item.submittedAt)}</small>
                  </li>
                ))}
              </ul>
            ) : <EmptyNote>Sin observaciones de convivencia recientes.</EmptyNote>}
          </div>
          <div className="coordination-subpanel">
            <h4>Enfermería ({nursing.total || 0})</h4>
            {nursing.items?.length ? (
              <ul className="coordination-case-list">
                {nursing.items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.studentName}</strong>
                    <span>{item.studentGrade} · {item.disposition}</span>
                    <p>{item.symptoms}</p>
                    <small>{formatDate(item.attendedAt)}</small>
                  </li>
                ))}
              </ul>
            ) : <EmptyNote>Sin visitas de enfermería recientes.</EmptyNote>}
          </div>
          <div className="coordination-subpanel">
            <h4>Bienestar ({wellbeing.total || 0})</h4>
            {wellbeing.items?.length ? (
              <ul className="coordination-case-list">
                {wellbeing.items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.studentName}</strong>
                    <span>{item.studentGrade} · {item.priority} · {item.status}</span>
                    <p>{item.title || item.summary}</p>
                    <small>{formatDate(item.updatedAt)}</small>
                  </li>
                ))}
              </ul>
            ) : <EmptyNote>Sin casos de bienestar recientes.</EmptyNote>}
          </div>
        </div>
      </section>

      <section className="panel coordination-panel">
        <SectionHeader
          eyebrow="Sección 3"
          title="Calificaciones por materia y por grado"
          description="Despliega cada grado para ver materias y, dentro de cada materia, el promedio de cada alumno."
        />
        <CoordinationGradesScoresTable grades={grades} />
      </section>

      <section className="panel coordination-panel">
        <SectionHeader
          eyebrow="Sección 4"
          title="Materias y docentes del nivel"
          description="Cuántas materias se dictan, quién las dicta y en qué grados están activas."
          metric={<strong>{subjectsOverview.length} materias</strong>}
        />
        <div className="coordination-split-grid">
          <div className="coordination-subpanel">
            <h4>Materias del nivel</h4>
            {subjectsOverview.length === 0 ? <EmptyNote>No hay materias asignadas a este nivel.</EmptyNote> : (
              <div className="coordination-table-wrap">
                <table className="coordination-table">
                  <thead>
                    <tr>
                      <th>Materia</th>
                      <th>Grados</th>
                      <th>Docentes</th>
                      <th>Asignaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectsOverview.map((subject) => (
                      <tr key={subject.key}>
                        <td>{subject.label}</td>
                        <td>{subject.gradeKeys?.length || 0}</td>
                        <td>{subject.teachers?.length ? subject.teachers.join(', ') : 'Sin asignar'}</td>
                        <td>{subject.courseCount || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="coordination-subpanel">
            <h4>Docentes con carga</h4>
            {teachers.length === 0 ? <EmptyNote>No hay docentes con cursos en este nivel.</EmptyNote> : (
              <ul className="coordination-list">
                {teachers.map((teacher) => (
                  <li key={teacher.teacherUserId}>
                    <strong>{teacher.teacherName}</strong>
                    <span>{teacher.coursesCount} cursos · {teacher.subjects?.join(', ') || 'Sin materias'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
