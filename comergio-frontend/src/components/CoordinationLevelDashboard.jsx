import { useMemo } from 'react';
import './CoordinationLevelDashboard.css';
import CoordinationGradesScoresTable from './CoordinationGradesScoresTable';
import { PortalBootSplash } from './PortalBootSplash';

function formatScore(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(2);
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

function CoordinationIcon({ name }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  if (name === 'users') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M16 19v-1.2a3.3 3.3 0 0 0-3.3-3.3H7.3A3.3 3.3 0 0 0 4 17.8V19" />
        <circle {...common} cx="9.2" cy="8.2" r="2.7" />
        <path {...common} d="M20 19v-1a2.8 2.8 0 0 0-2.2-2.7M15.7 5.7a2.5 2.5 0 0 1 0 4.8" />
      </svg>
    );
  }
  if (name === 'cap') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="m3 10 9-5 9 5-9 5-9-5z" />
        <path {...common} d="M7 12.2v3.6c0 1.3 2.2 2.7 5 2.7s5-1.4 5-2.7v-3.6" />
        <path {...common} d="M21 10v5.5" />
      </svg>
    );
  }
  if (name === 'book') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16.5H7.5A2.5 2.5 0 0 0 5 22z" />
        <path {...common} d="M5 5.5v16.5" />
      </svg>
    );
  }
  if (name === 'teacher') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="12" cy="8" r="3" />
        <path {...common} d="M5.5 19.5c1.3-3 3.5-4.5 6.5-4.5s5.2 1.5 6.5 4.5" />
      </svg>
    );
  }
  if (name === 'chart') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 19h16M7 16V9M12 16V5M17 16v-4" />
      </svg>
    );
  }
  if (name === 'shield') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 3.5 19 6.5v5.2c0 4.3-2.9 7.3-7 8.8-4.1-1.5-7-4.5-7-8.8V6.5L12 3.5z" />
        <path {...common} d="M12 9v4M12 15.5h.01" />
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
  if (name === 'heart') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 20s-7-4.3-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.7 12 20 12 20z" />
      </svg>
    );
  }
  if (name === 'leaf') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M5 19c8-1 13-6 14-14-8 1-13 6-14 14z" />
        <path {...common} d="M9 15c2-2 4.5-3.5 7.5-4" />
      </svg>
    );
  }
  if (name === 'arrow') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...common} cx="12" cy="12" r="7.5" />
    </svg>
  );
}

const GRADE_ACCENTS = ['blue', 'cyan', 'purple', 'amber', 'rose', 'teal'];
const SUBJECT_TONES = ['blue', 'purple', 'green', 'orange', 'rose', 'sky', 'teal', 'amber'];
const TEACHER_TONES = ['purple', 'blue', 'green', 'orange', 'rose', 'sky', 'teal', 'amber'];

function getInitials(name = '') {
  return String(name || 'D')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'D';
}

function formatGradeKeys(gradeKeys = []) {
  return (Array.isArray(gradeKeys) ? gradeKeys : [])
    .map((key) => {
      const value = String(key || '').trim();
      if (!value) return '';
      if (/^\d+$/.test(value)) return `${value}°`;
      return value;
    })
    .filter(Boolean)
    .join(' · ');
}

export default function CoordinationLevelDashboard({
  dashboard,
  loading = false,
  onRefresh,
  onNavigate,
}) {
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
    {
      key: 'students',
      label: 'Estudiantes',
      value: summary.studentCount || 0,
      hint: `${summary.assignedStudentCount || 0} con curso`,
      icon: 'users',
      tone: 'blue',
    },
    {
      key: 'grades',
      label: 'Grados',
      value: summary.gradeCount || 0,
      hint: `${summary.structureCourseCount || 0} cursos estructura`,
      icon: 'cap',
      tone: 'green',
    },
    {
      key: 'subjects',
      label: 'Materias',
      value: summary.subjectCount || 0,
      hint: `${summary.campusCourseCount || 0} cursos campus`,
      icon: 'book',
      tone: 'purple',
    },
    {
      key: 'teachers',
      label: 'Docentes',
      value: summary.teacherCount || 0,
      hint: 'Con carga en el nivel',
      icon: 'teacher',
      tone: 'orange',
    },
    {
      key: 'average',
      label: 'Promedio nivel',
      value: formatScore(summary.averageScore),
      hint: `Umbral ${formatScore(performance.passingScore)}`,
      icon: 'chart',
      tone: 'sky',
    },
    {
      key: 'risk',
      label: 'En riesgo',
      value: summary.atRiskStudentCount || 0,
      hint: 'Bajo umbral académico',
      icon: 'shield',
      tone: 'rose',
    },
  ]), [summary, performance.passingScore]);

  const moduleCards = useMemo(() => ([
    {
      key: 'control_coexistence',
      title: 'Convivencia escolar',
      description: 'Registrar y dar seguimiento a casos de convivencia.',
      action: 'Ver casos',
      icon: 'users',
      tone: 'purple',
      count: Number(discipline.total || discipline.items?.length || 0),
    },
    {
      key: 'control_nursing',
      title: 'Enfermería',
      description: 'Control de atenciones, incidencias y seguimiento.',
      action: 'Ver atenciones',
      icon: 'heart',
      tone: 'rose',
      count: Number(nursing.total || nursing.items?.length || 0),
    },
    {
      key: 'control_wellbeing',
      title: 'Bienestar',
      description: 'Seguimiento emocional y actividades de apoyo.',
      action: 'Ver bienestar',
      icon: 'leaf',
      tone: 'green',
      count: Number(wellbeing.total || wellbeing.items?.length || 0),
    },
    {
      key: 'control_levels',
      title: 'Reporte general',
      description: 'Resumen de indicadores y estadísticas del nivel.',
      action: 'Ver reporte',
      icon: 'chart',
      tone: 'blue',
      count: Number(summary.studentCount || 0),
    },
  ]), [discipline, nursing, wellbeing, summary.studentCount]);

  if (loading) {
    return <PortalBootSplash embedded portal="coordinacion" />;
  }

  if (!dashboard) {
    return (
      <section className="coordination-dashboard">
        <p>No se pudo cargar el tablero de coordinación.</p>
        {onRefresh ? (
          <button className="coordination-refresh-btn" type="button" onClick={onRefresh}>
            <CoordinationIcon name="refresh" />
            Reintentar
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="coordination-dashboard">
      <header className="coordination-dashboard-hero">
        <div>
          <span className="coordination-dashboard-kicker">Tablero de coordinación</span>
          <h2>{scopeLabel}</h2>
          <p>Vista operativa del nivel: grados, docentes, calificaciones, convivencia, enfermería y bienestar.</p>
        </div>
        {onRefresh ? (
          <button className="coordination-refresh-btn" type="button" onClick={onRefresh}>
            <CoordinationIcon name="refresh" />
            Actualizar tablero
          </button>
        ) : null}
      </header>

      <div className="coordination-summary-grid">
        {summaryCards.map((card) => (
          <article className={`coordination-summary-card is-${card.tone}`} key={card.key}>
            <span className="coordination-summary-card__icon" aria-hidden="true">
              <CoordinationIcon name={card.icon} />
            </span>
            <div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <p>{card.hint}</p>
            </div>
          </article>
        ))}
      </div>

      <section className="coordination-panel">
        <SectionHeader
          title="Grados del nivel"
          description="Vista compacta por grado: alumnos, asignación de curso y promedio."
          metric={<strong>{grades.length} grados</strong>}
        />
        {grades.length === 0 ? <EmptyNote>No hay grados configurados para este nivel.</EmptyNote> : (
          <div className="coordination-grade-card-grid">
            {grades.map((grade, index) => (
              <article
                className={`coordination-grade-compact-card accent-${GRADE_ACCENTS[index % GRADE_ACCENTS.length]}${grade.pendingStudentCount > 0 ? ' has-pending' : ''}`}
                key={grade.key}
              >
                <div className="coordination-grade-compact-card-head">
                  <div className="coordination-grade-compact-card-title">
                    <em>{grade.label}</em>
                    <span className="coordination-grade-compact-count">
                      {grade.studentCount} alumno{grade.studentCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <div className="coordination-grade-compact-stats">
                  <div className="coordination-grade-compact-stat">
                    <span>Con curso</span>
                    <strong>{grade.assignedStudentCount}</strong>
                  </div>
                  <div className={`coordination-grade-compact-stat${grade.pendingStudentCount > 0 ? ' is-alert' : ''}`} title="Pendiente">
                    <span>Pend.</span>
                    <strong>{grade.pendingStudentCount}</strong>
                  </div>
                  <div className="coordination-grade-compact-stat is-score" title="Promedio">
                    <span>Prom.</span>
                    <strong>{formatScore(grade.averageScore)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="coordination-panel">
        <SectionHeader
          title="Convivencia, enfermería y bienestar"
          description="Seguimiento integral de casos recientes del nivel para priorizar acciones de coordinación."
        />
        <div className="coordination-module-grid">
          {moduleCards.map((card) => (
            <button
              className={`coordination-module-card is-${card.tone}`}
              key={card.key}
              type="button"
              onClick={() => onNavigate?.(card.key)}
            >
              <span className="coordination-module-card__icon" aria-hidden="true">
                <CoordinationIcon name={card.icon} />
              </span>
              <strong>{card.title}</strong>
              <p>{card.description}</p>
              <span className="coordination-module-card__footer">
                <em>{card.count} registro{card.count === 1 ? '' : 's'}</em>
                <span>
                  {card.action}
                  <CoordinationIcon name="arrow" />
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="coordination-panel">
        <SectionHeader
          title="Calificaciones por materia y por grado"
          description="Despliega cada grado para ver materias y, dentro de cada materia, el promedio de cada alumno."
        />
        <CoordinationGradesScoresTable grades={grades} />
      </section>

      <section className="coordination-panel">
        <SectionHeader
          title="Materias y docentes del nivel"
          description="Cuántas materias se dictan, quién las dicta y en qué grados están activas."
          metric={<strong>{subjectsOverview.length} materias</strong>}
        />
        <div className="coordination-staff-grid">
          <div className="coordination-staff-panel">
            <div className="coordination-staff-panel__head">
              <span className="coordination-staff-panel__icon is-blue" aria-hidden="true">
                <CoordinationIcon name="book" />
              </span>
              <h4>Materias del nivel</h4>
            </div>
            {subjectsOverview.length === 0 ? <EmptyNote>No hay materias asignadas a este nivel.</EmptyNote> : (
              <>
                <div className="coordination-table-wrap coordination-table-wrap--subjects">
                  <table className="coordination-table coordination-table--subjects">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Materia</th>
                        <th>Grados</th>
                        <th>Docentes</th>
                        <th>Asignaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectsOverview.slice(0, 10).map((subject, index) => (
                        <tr key={subject.key}>
                          <td>{index + 1}</td>
                          <td>
                            <span className="coordination-subject-cell">
                              <i className={`coordination-subject-dot is-${SUBJECT_TONES[index % SUBJECT_TONES.length]}`} aria-hidden="true" />
                              <strong>{subject.label}</strong>
                            </span>
                          </td>
                          <td>{formatGradeKeys(subject.gradeKeys) || '—'}</td>
                          <td>{subject.teachers?.length ? subject.teachers.join(', ') : 'Sin asignar'}</td>
                          <td>{subject.courseCount || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  className="coordination-staff-link"
                  type="button"
                  onClick={() => onNavigate?.('control_subjects')}
                >
                  Ver todas las materias ({subjectsOverview.length})
                  <CoordinationIcon name="arrow" />
                </button>
              </>
            )}
          </div>

          <div className="coordination-staff-panel">
            <div className="coordination-staff-panel__head">
              <span className="coordination-staff-panel__icon is-green" aria-hidden="true">
                <CoordinationIcon name="teacher" />
              </span>
              <h4>Docentes con carga en el nivel</h4>
            </div>
            {teachers.length === 0 ? <EmptyNote>No hay docentes con cursos en este nivel.</EmptyNote> : (
              <>
                <ul className="coordination-teacher-list">
                  {teachers.slice(0, 8).map((teacher, index) => (
                    <li key={teacher.teacherUserId}>
                      <button
                        className="coordination-teacher-row"
                        type="button"
                        onClick={() => onNavigate?.('control_teachers')}
                      >
                        <span className={`coordination-teacher-avatar is-${TEACHER_TONES[index % TEACHER_TONES.length]}`}>
                          {getInitials(teacher.teacherName)}
                        </span>
                        <span className="coordination-teacher-copy">
                          <strong>{teacher.teacherName}</strong>
                          <small>{teacher.coursesCount} curso{teacher.coursesCount === 1 ? '' : 's'}</small>
                          <em>{teacher.subjects?.join(', ') || 'Sin materias'}</em>
                        </span>
                        <i className="coordination-teacher-chevron" aria-hidden="true">
                          <CoordinationIcon name="arrow" />
                        </i>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  className="coordination-staff-link"
                  type="button"
                  onClick={() => onNavigate?.('control_teachers')}
                >
                  Ver todos los docentes ({teachers.length})
                  <CoordinationIcon name="arrow" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="coordination-staff-footer">
          <div className="coordination-info-banner">
            <CoordinationIcon name="chart" />
            <div>
              <strong>Información importante</strong>
              <p>Las asignaciones pueden cambiar según el horario académico y las actualizaciones del personal docente.</p>
            </div>
          </div>
          <button
            className="coordination-schedule-btn"
            type="button"
            onClick={() => onNavigate?.('schedule')}
          >
            <CoordinationIcon name="cap" />
            Ver horario académico
          </button>
        </div>
      </section>
    </section>
  );
}
