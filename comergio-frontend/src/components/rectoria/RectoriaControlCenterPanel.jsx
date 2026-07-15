import { Fragment, useEffect, useMemo, useState } from 'react';
import { getPsychologyDashboard } from '../../services/psychology.service';
import { getNursingSummary } from '../../services/nursing.service';
import CommunityReportsPanel from '../community/CommunityReportsPanel';
import TeEscuchamosLabel from '../community/TeEscuchamosLabel';
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

function SubjectCoursesPanel({
  title,
  emptyLabel,
  subjects = [],
  teacherLabelById = {},
  performanceLevels = [],
}) {
  const [expandedSubjectKey, setExpandedSubjectKey] = useState('');
  const [expandedCourseKey, setExpandedCourseKey] = useState('');

  return (
    <section className="rectoria-control-list-panel">
      <h3>{title}</h3>
      {subjects.length === 0 ? <p className="rectoria-control-empty">{emptyLabel}</p> : (
        <div className="rectoria-control-list">
          {subjects.map((subject) => {
            const isExpanded = expandedSubjectKey === subject.key;
            return (
              <article className={`rectoria-control-subject-card${isExpanded ? ' is-expanded' : ''}`} key={subject.key}>
                <button
                  aria-expanded={isExpanded}
                  className="rectoria-control-subject-toggle"
                  onClick={() => {
                    setExpandedSubjectKey((previous) => (previous === subject.key ? '' : subject.key));
                    setExpandedCourseKey('');
                  }}
                  type="button"
                >
                  <span className="rectoria-control-subject-toggle__main">
                    <strong>{subject.label}</strong>
                    <span>
                      {subject.courses} curso{subject.courses === 1 ? '' : 's'}
                      {' · '}
                      Promedio <ScoreText performanceLevels={performanceLevels} score={subject.averageScore} />
                      {' · '}
                      {subject.atRisk} en riesgo
                    </span>
                  </span>
                  <span className="rectoria-control-subject-toggle__chevron" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
                </button>

                {isExpanded ? (
                  <div className="rectoria-control-subject-courses">
                    {subject.courseRows.length === 0 ? (
                      <p className="rectoria-control-empty">No hay cursos campus para esta asignatura.</p>
                    ) : subject.courseRows.map((course) => {
                      const isCourseExpanded = expandedCourseKey === course.key;
                      return (
                        <div className={`rectoria-control-subject-course${isCourseExpanded ? ' is-expanded' : ''}`} key={course.key}>
                          <button
                            aria-expanded={isCourseExpanded}
                            className="rectoria-control-subject-course-toggle"
                            onClick={() => setExpandedCourseKey((previous) => (previous === course.key ? '' : course.key))}
                            type="button"
                          >
                            <span className="rectoria-control-subject-toggle__main">
                              <strong>{course.label}</strong>
                              <span>
                                Promedio <ScoreText performanceLevels={performanceLevels} score={course.averageScore} />
                                {' · '}
                                {teacherLabelById[course.teacherUserId] || 'Docente sin asignar'}
                                {Number(course.evaluatedStudentCount || 0) > 0
                                  ? ` · ${course.evaluatedStudentCount} evaluado${course.evaluatedStudentCount === 1 ? '' : 's'}`
                                  : ''}
                              </span>
                            </span>
                            <span className="rectoria-control-subject-toggle__chevron" aria-hidden="true">{isCourseExpanded ? '▾' : '▸'}</span>
                          </button>

                          {isCourseExpanded ? (
                            <div className="rectoria-control-subject-students">
                              {(course.students || []).length === 0 ? (
                                <p className="rectoria-control-empty">Sin alumnos con promedio registrado en este curso.</p>
                              ) : course.students.map((student) => (
                                <div className="rectoria-control-subject-student" key={`${course.key}-${student.key}`}>
                                  <strong>{student.name}</strong>
                                  <span>
                                    Promedio <ScoreText performanceLevels={performanceLevels} score={student.finalScore} />
                                    {student.schoolCode ? ` · ${student.schoolCode}` : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function resolvePerformanceCategory(score, performanceLevels = []) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return null;
  }
  return (Array.isArray(performanceLevels) ? performanceLevels : []).find((level) => (
    numericScore >= Number(level.minScore)
    && numericScore <= Number(level.maxScore)
  )) || null;
}

function ScoreText({ score, performanceLevels = [] }) {
  const hasScore = score != null && Number.isFinite(Number(score));
  const performance = hasScore ? resolvePerformanceCategory(score, performanceLevels) : null;
  const color = hasScore ? (performance?.color || undefined) : '#2563eb';
  return (
    <em
      className="rectoria-control-score-text"
      style={color ? { color } : undefined}
      title={hasScore ? (performance?.label || undefined) : 'Sin calificaciones'}
    >
      {hasScore ? formatScore(score) : '—'}
    </em>
  );
}

function normalizeMembershipValue(value = '') {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function collectInstitutionalCourseAliases(course = {}, gradeKey = '') {
  const aliases = new Set();
  [course.key, course.label, course.section, course.sourceCourseKey]
    .map((value) => normalizeMembershipValue(value))
    .filter(Boolean)
    .forEach((value) => aliases.add(value));

  const gradeNorm = normalizeMembershipValue(gradeKey);
  aliases.forEach((alias) => {
    if (gradeNorm && /^[a-z]$/.test(alias)) {
      aliases.add(`${gradeNorm}${alias}`);
      aliases.add(`${gradeNorm}:${alias}`);
    }
  });

  return aliases;
}

function campusCourseMatchesInstitutionalCourse(campusCourse = {}, gradeKey = '', institutionalCourse = {}) {
  const campusGrade = normalizeMembershipValue(campusCourse.gradeKey || campusCourse.studentGradeKey);
  const gradeNorm = normalizeMembershipValue(gradeKey);
  if (!campusGrade || !gradeNorm || campusGrade !== gradeNorm) {
    return false;
  }

  const aliases = collectInstitutionalCourseAliases(institutionalCourse, gradeKey);
  if (aliases.size === 0) {
    return false;
  }

  const sectionCandidates = [
    campusCourse.section,
    campusCourse.sourceCourseKey,
    campusCourse.displayLabel,
    campusCourse.title,
  ].map((value) => normalizeMembershipValue(value)).filter(Boolean);

  return sectionCandidates.some((candidate) => (
    aliases.has(candidate)
    || Array.from(aliases).some((alias) => candidate === alias || candidate.endsWith(alias) || candidate.includes(`:${alias}`))
  ));
}

function studentBelongsToInstitutionalCourse(student = {}, gradeKey = '', institutionalCourse = {}) {
  const studentGrade = normalizeMembershipValue(student.grade);
  const gradeNorm = normalizeMembershipValue(gradeKey);
  if (!studentGrade || !gradeNorm || studentGrade !== gradeNorm) {
    return false;
  }

  const aliases = collectInstitutionalCourseAliases(institutionalCourse, gradeKey);
  const studentCourse = normalizeMembershipValue(student.course);
  if (!studentCourse) {
    return aliases.size === 0;
  }

  return aliases.has(studentCourse)
    || Array.from(aliases).some((alias) => studentCourse === alias || studentCourse.endsWith(alias) || studentCourse.includes(`:${alias}`));
}

function LevelDrilldownPanel({
  levels = [],
  performanceLevels = [],
}) {
  const [selectedLevelKey, setSelectedLevelKey] = useState('');
  const [selectedGradeKey, setSelectedGradeKey] = useState('');
  const [selectedCourseKey, setSelectedCourseKey] = useState('');
  const [courseViewMode, setCourseViewMode] = useState('subjects');

  const selectedLevel = levels.find((level) => level.key === selectedLevelKey) || null;
  const selectedGrade = selectedLevel?.grades?.find((grade) => grade.key === selectedGradeKey) || null;
  const selectedCourse = selectedGrade?.courses?.find((course) => course.key === selectedCourseKey) || null;

  const breadcrumbs = [
    { key: 'levels', label: 'Niveles', onClick: () => {
      setSelectedLevelKey('');
      setSelectedGradeKey('');
      setSelectedCourseKey('');
      setCourseViewMode('subjects');
    } },
  ];
  if (selectedLevel) {
    breadcrumbs.push({
      key: selectedLevel.key,
      label: selectedLevel.label,
      onClick: () => {
        setSelectedGradeKey('');
        setSelectedCourseKey('');
        setCourseViewMode('subjects');
      },
    });
  }
  if (selectedGrade) {
    breadcrumbs.push({
      key: selectedGrade.key,
      label: selectedGrade.label,
      onClick: () => {
        setSelectedCourseKey('');
        setCourseViewMode('subjects');
      },
    });
  }
  if (selectedCourse) {
    breadcrumbs.push({
      key: selectedCourse.key,
      label: selectedCourse.label,
      onClick: null,
    });
  }

  return (
    <section className="rectoria-control-list-panel">
      {selectedLevel ? (
        <div className="rectoria-control-levels-breadcrumb">
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.key}>
              {index > 0 ? <span className="rectoria-control-levels-breadcrumb__sep">/</span> : null}
              {crumb.onClick ? (
                <button className="rectoria-control-levels-breadcrumb__link" onClick={crumb.onClick} type="button">
                  {crumb.label}
                </button>
              ) : (
                <strong>{crumb.label}</strong>
              )}
            </span>
          ))}
        </div>
      ) : null}

      {!selectedLevel ? (
        <div className="rectoria-control-level-grid">
          {levels.length === 0 ? (
            <p className="rectoria-control-empty">No hay niveles académicos configurados.</p>
          ) : levels.map((level) => (
            <button
              className="rectoria-control-level-card rectoria-control-level-card--button"
              key={level.key}
              onClick={() => {
                setSelectedLevelKey(level.key);
                setSelectedGradeKey('');
                setSelectedCourseKey('');
                setCourseViewMode('subjects');
              }}
              type="button"
            >
              <div className="rectoria-control-level-card-head">
                <strong>{level.label}</strong>
                <span className={`rectoria-control-pill is-tone-${level.performanceMeta?.tone || 'info'}`}>
                  {level.performanceMeta?.label || 'Sin calificaciones'}
                </span>
              </div>
              <div className="rectoria-control-level-metrics">
                <div><span>Promedio</span><strong><ScoreText performanceLevels={performanceLevels} score={level.averageScore} /></strong></div>
                <div><span>Evaluados</span><strong>{level.evaluatedStudentCount || 0}</strong></div>
                <div><span>En riesgo</span><strong>{level.atRiskCount || 0}</strong></div>
                <div><span>Grados</span><strong>{level.grades?.length || level.gradesCount || 0}</strong></div>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {selectedLevel && !selectedGrade ? (
        <div className="rectoria-control-list">
          {selectedLevel.grades.length === 0 ? (
            <p className="rectoria-control-empty">Este nivel no tiene grados configurados.</p>
          ) : selectedLevel.grades.map((grade) => (
            <button
              className="rectoria-control-subject-toggle rectoria-control-level-row"
              key={grade.key}
              onClick={() => {
                setSelectedGradeKey(grade.key);
                setSelectedCourseKey('');
                setCourseViewMode('subjects');
              }}
              type="button"
            >
              <span className="rectoria-control-subject-toggle__main">
                <strong>{grade.label}</strong>
                <span>
                  {grade.courses.length} curso{grade.courses.length === 1 ? '' : 's'}
                  {' · '}
                  Promedio <ScoreText performanceLevels={performanceLevels} score={grade.averageScore} />
                  {' · '}
                  {grade.evaluatedStudentCount} evaluado{grade.evaluatedStudentCount === 1 ? '' : 's'}
                </span>
              </span>
              <span className="rectoria-control-subject-toggle__chevron" aria-hidden="true">▸</span>
            </button>
          ))}
        </div>
      ) : null}

      {selectedGrade && !selectedCourse ? (
        <div className="rectoria-control-list">
          {selectedGrade.courses.length === 0 ? (
            <p className="rectoria-control-empty">Este grado no tiene cursos configurados.</p>
          ) : selectedGrade.courses.map((course) => (
            <button
              className="rectoria-control-subject-toggle rectoria-control-level-row"
              key={course.key}
              onClick={() => {
                setSelectedCourseKey(course.key);
                setCourseViewMode('subjects');
              }}
              type="button"
            >
              <span className="rectoria-control-subject-toggle__main">
                <strong>{course.label}</strong>
                <span>
                  {course.studentCount} alumno{course.studentCount === 1 ? '' : 's'}
                  {' · '}
                  Promedio <ScoreText performanceLevels={performanceLevels} score={course.averageScore} />
                  {' · '}
                  {course.subjects.length} asignatura{course.subjects.length === 1 ? '' : 's'}
                </span>
              </span>
              <span className="rectoria-control-subject-toggle__chevron" aria-hidden="true">▸</span>
            </button>
          ))}
        </div>
      ) : null}

      {selectedCourse ? (
        <div className="rectoria-control-level-course-panel">
          <div className="rectoria-control-level-mode-tabs">
            <button
              className={`rectoria-control-level-mode-tab${courseViewMode === 'subjects' ? ' is-active' : ''}`}
              onClick={() => setCourseViewMode('subjects')}
              type="button"
            >
              Asignaturas
            </button>
            <button
              className={`rectoria-control-level-mode-tab${courseViewMode === 'students' ? ' is-active' : ''}`}
              onClick={() => setCourseViewMode('students')}
              type="button"
            >
              Alumnos
            </button>
          </div>

          {courseViewMode === 'subjects' ? (
            selectedCourse.subjects.length === 0 ? (
              <p className="rectoria-control-empty">No hay asignaturas con datos para este curso.</p>
            ) : (
              <div className="rectoria-control-list">
                {selectedCourse.subjects.map((subject) => (
                  <article className="rectoria-control-list-item" key={subject.key}>
                    <strong>{subject.label}</strong>
                    <span>
                      Promedio <ScoreText performanceLevels={performanceLevels} score={subject.averageScore} />
                      {subject.teacherLabel ? ` · ${subject.teacherLabel}` : ''}
                      {subject.evaluatedStudentCount > 0
                        ? ` · ${subject.evaluatedStudentCount} evaluado${subject.evaluatedStudentCount === 1 ? '' : 's'}`
                        : ''}
                    </span>
                  </article>
                ))}
              </div>
            )
          ) : (
            selectedCourse.students.length === 0 ? (
              <p className="rectoria-control-empty">No hay alumnos en este curso.</p>
            ) : (
              <div className="rectoria-control-list">
                {selectedCourse.students.map((student) => (
                  <article className="rectoria-control-list-item" key={student.key}>
                    <strong>{student.name}</strong>
                    <span>
                      Promedio <ScoreText performanceLevels={performanceLevels} score={student.averageScore} />
                      {student.schoolCode ? ` · ${student.schoolCode}` : ''}
                      {student.subjectsCount > 0
                        ? ` · ${student.subjectsCount} asignatura${student.subjectsCount === 1 ? '' : 's'}`
                        : ''}
                    </span>
                  </article>
                ))}
              </div>
            )
          )}
        </div>
      ) : null}
    </section>
  );
}

function TeacherDirectoryPanel({
  teachers = [],
  performanceLevels = [],
}) {
  const [expandedTeacherKey, setExpandedTeacherKey] = useState('');
  const [expandedSubjectKey, setExpandedSubjectKey] = useState('');
  const [expandedGradeKey, setExpandedGradeKey] = useState('');
  const [expandedCourseKey, setExpandedCourseKey] = useState('');

  return (
    <section className="rectoria-control-list-panel">
      <h3>Docentes</h3>
      {teachers.length === 0 ? (
        <p className="rectoria-control-empty">Aún no hay docentes con cursos campus para mostrar.</p>
      ) : (
        <div className="rectoria-control-list">
          {teachers.map((teacher) => {
            const isTeacherExpanded = expandedTeacherKey === teacher.key;
            return (
              <article className={`rectoria-control-subject-card${isTeacherExpanded ? ' is-expanded' : ''}`} key={teacher.key}>
                <button
                  aria-expanded={isTeacherExpanded}
                  className="rectoria-control-subject-toggle"
                  onClick={() => {
                    setExpandedTeacherKey((previous) => (previous === teacher.key ? '' : teacher.key));
                    setExpandedSubjectKey('');
                    setExpandedGradeKey('');
                    setExpandedCourseKey('');
                  }}
                  type="button"
                >
                  <span className="rectoria-control-subject-toggle__main">
                    <strong>{teacher.label}</strong>
                    <span>
                      {teacher.subjectsCount} asignatura{teacher.subjectsCount === 1 ? '' : 's'}
                      {' · '}
                      {teacher.coursesCount} curso{teacher.coursesCount === 1 ? '' : 's'}
                      {' · '}
                      Promedio <ScoreText performanceLevels={performanceLevels} score={teacher.averageScore} />
                      {' · '}
                      {teacher.atRiskCount} en riesgo
                    </span>
                  </span>
                  <span className="rectoria-control-subject-toggle__chevron" aria-hidden="true">{isTeacherExpanded ? '▾' : '▸'}</span>
                </button>

                {isTeacherExpanded ? (
                  <div className="rectoria-control-subject-courses">
                    {teacher.subjects.length === 0 ? (
                      <p className="rectoria-control-empty">Este docente no tiene asignaturas campus asociadas.</p>
                    ) : teacher.subjects.map((subject) => {
                      const subjectExpandKey = `${teacher.key}::${subject.key}`;
                      const isSubjectExpanded = expandedSubjectKey === subjectExpandKey;
                      return (
                        <div className={`rectoria-control-subject-course${isSubjectExpanded ? ' is-expanded' : ''}`} key={subjectExpandKey}>
                          <button
                            aria-expanded={isSubjectExpanded}
                            className="rectoria-control-subject-course-toggle"
                            onClick={() => {
                              setExpandedSubjectKey((previous) => (previous === subjectExpandKey ? '' : subjectExpandKey));
                              setExpandedGradeKey('');
                              setExpandedCourseKey('');
                            }}
                            type="button"
                          >
                            <span className="rectoria-control-subject-toggle__main">
                              <strong>{subject.label}</strong>
                              <span>
                                {subject.grades.length} grado{subject.grades.length === 1 ? '' : 's'}
                                {' · '}
                                {subject.coursesCount} curso{subject.coursesCount === 1 ? '' : 's'}
                                {' · '}
                                Promedio <ScoreText performanceLevels={performanceLevels} score={subject.averageScore} />
                              </span>
                            </span>
                            <span className="rectoria-control-subject-toggle__chevron" aria-hidden="true">{isSubjectExpanded ? '▾' : '▸'}</span>
                          </button>

                          {isSubjectExpanded ? (
                            <div className="rectoria-control-teacher-courses">
                              {subject.grades.length === 0 ? (
                                <p className="rectoria-control-empty">No hay grados para esta asignatura.</p>
                              ) : subject.grades.map((grade) => {
                                const gradeExpandKey = `${subjectExpandKey}::${grade.key}`;
                                const isGradeExpanded = expandedGradeKey === gradeExpandKey;
                                return (
                                  <div className={`rectoria-control-teacher-course${isGradeExpanded ? ' is-expanded' : ''}`} key={gradeExpandKey}>
                                    <button
                                      aria-expanded={isGradeExpanded}
                                      className="rectoria-control-subject-course-toggle"
                                      onClick={() => {
                                        setExpandedGradeKey((previous) => (previous === gradeExpandKey ? '' : gradeExpandKey));
                                        setExpandedCourseKey('');
                                      }}
                                      type="button"
                                    >
                                      <span className="rectoria-control-subject-toggle__main">
                                        <strong>{grade.label}</strong>
                                        <span>
                                          {grade.courses.length} curso{grade.courses.length === 1 ? '' : 's'}
                                          {' · '}
                                          Promedio <ScoreText performanceLevels={performanceLevels} score={grade.averageScore} />
                                        </span>
                                      </span>
                                      <span className="rectoria-control-subject-toggle__chevron" aria-hidden="true">{isGradeExpanded ? '▾' : '▸'}</span>
                                    </button>

                                    {isGradeExpanded ? (
                                      <div className="rectoria-control-teacher-courses">
                                        {grade.courses.map((course) => {
                                          const courseExpandKey = `${gradeExpandKey}::${course.key}`;
                                          const isCourseExpanded = expandedCourseKey === courseExpandKey;
                                          return (
                                            <div className={`rectoria-control-teacher-course${isCourseExpanded ? ' is-expanded' : ''}`} key={courseExpandKey}>
                                              <button
                                                aria-expanded={isCourseExpanded}
                                                className="rectoria-control-subject-course-toggle"
                                                onClick={() => setExpandedCourseKey((previous) => (previous === courseExpandKey ? '' : courseExpandKey))}
                                                type="button"
                                              >
                                                <span className="rectoria-control-subject-toggle__main">
                                                  <strong>{course.label}</strong>
                                                  <span>
                                                    Promedio <ScoreText performanceLevels={performanceLevels} score={course.averageScore} />
                                                    {course.studentCount > 0
                                                      ? ` · ${course.studentCount} alumno${course.studentCount === 1 ? '' : 's'}`
                                                      : ''}
                                                  </span>
                                                </span>
                                                <span className="rectoria-control-subject-toggle__chevron" aria-hidden="true">{isCourseExpanded ? '▾' : '▸'}</span>
                                              </button>

                                              {isCourseExpanded ? (
                                                <div className="rectoria-control-subject-students">
                                                  {course.students.length === 0 ? (
                                                    <p className="rectoria-control-empty">Sin alumnos en este curso.</p>
                                                  ) : course.students.map((student) => (
                                                    <div className="rectoria-control-subject-student" key={`${courseExpandKey}-${student.key}`}>
                                                      <strong>{student.name}</strong>
                                                      <span>
                                                        Promedio <ScoreText performanceLevels={performanceLevels} score={student.finalScore} />
                                                        {student.schoolCode ? ` · ${student.schoolCode}` : ''}
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : null}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StudentDirectoryPanel({
  students = [],
  performanceLevels = [],
}) {
  const [nameFilter, setNameFilter] = useState('');
  const [performanceFilter, setPerformanceFilter] = useState('');
  const [expandedStudentKey, setExpandedStudentKey] = useState('');

  const filteredStudents = useMemo(() => {
    const normalizedName = String(nameFilter || '').trim().toLowerCase();
    return students.filter((student) => {
      if (normalizedName) {
        const haystack = `${student.name || ''} ${student.schoolCode || ''}`.toLowerCase();
        if (!haystack.includes(normalizedName)) {
          return false;
        }
      }
      if (performanceFilter === '__without_grades__') {
        return student.averageScore == null;
      }
      if (performanceFilter) {
        return student.performanceKey === performanceFilter;
      }
      return true;
    });
  }, [nameFilter, performanceFilter, students]);

  return (
    <section className="rectoria-control-list-panel">
      <div className="rectoria-control-students-head">
        <div>
          <h3>Directorio de alumnos</h3>
          <p>Filtra por nombre o por categoría de desempeño y abre cada fila para ver promedios por asignatura.</p>
        </div>
      </div>

      <div className="rectoria-control-students-filters">
        <label>
          Buscar por nombre
          <input
            onChange={(event) => setNameFilter(event.target.value)}
            placeholder="Nombre o código"
            type="search"
            value={nameFilter}
          />
        </label>
        <label>
          Categoría de desempeño
          <select
            onChange={(event) => setPerformanceFilter(event.target.value)}
            value={performanceFilter}
          >
            <option value="">Todas</option>
            <option value="__without_grades__">Sin calificaciones</option>
            {performanceLevels.map((level) => (
              <option key={level.key} value={level.key}>
                {level.label} ({formatScore(level.minScore)} – {formatScore(level.maxScore)})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rectoria-control-students-table-wrap">
        <table className="rectoria-control-students-table">
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Grado / curso</th>
              <th>Promedio</th>
              <th>Desempeño</th>
              <th>Asignaturas</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={5}>No hay alumnos que coincidan con el filtro.</td>
              </tr>
            ) : filteredStudents.map((student) => {
              const isExpanded = expandedStudentKey === student.key;
              return (
                <Fragment key={student.key}>
                  <tr
                    className={`rectoria-control-students-row${isExpanded ? ' is-expanded' : ''}`}
                    onClick={() => setExpandedStudentKey((previous) => (previous === student.key ? '' : student.key))}
                  >
                    <td>
                      <strong>{student.name}</strong>
                      {student.schoolCode ? <small>{student.schoolCode}</small> : null}
                    </td>
                    <td>{[student.grade, student.course].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{student.averageScore == null ? '—' : formatScore(student.averageScore)}</td>
                    <td>
                      {student.performanceLabel ? (
                        <span className="rectoria-control-performance-pill" style={{ background: `${student.performanceColor || '#e2e8f0'}22`, color: student.performanceColor || '#334155' }}>
                          {student.performanceLabel}
                        </span>
                      ) : 'Sin notas'}
                    </td>
                    <td>{student.subjects.length}</td>
                  </tr>
                  {isExpanded ? (
                    <tr className="rectoria-control-students-detail-row">
                      <td colSpan={5}>
                        {student.subjects.length === 0 ? (
                          <p className="rectoria-control-empty">Este alumno aún no tiene asignaturas campus asociadas.</p>
                        ) : (
                          <div className="rectoria-control-student-subjects">
                            {student.subjects.map((subject) => {
                              const hasScore = subject.averageScore != null;
                              const scoreColor = hasScore
                                ? (subject.performanceColor || undefined)
                                : '#2563eb';
                              return (
                                <div className="rectoria-control-student-subject" key={`${student.key}-${subject.key}`}>
                                  <strong>{subject.label}</strong>
                                  <span>
                                    Promedio{' '}
                                    <em
                                      className="rectoria-control-student-subject-score"
                                      style={scoreColor ? { color: scoreColor } : undefined}
                                      title={hasScore ? (subject.performanceLabel || undefined) : 'Sin calificaciones'}
                                    >
                                      {hasScore ? formatScore(subject.averageScore) : '—'}
                                    </em>
                                    {subject.teacherLabel ? ` · ${subject.teacherLabel}` : ''}
                                    {subject.courseLabel ? ` · ${subject.courseLabel}` : ''}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function RectoriaControlCenterPanel({
  view,
  overviewAcademicPerformance,
  overviewAcademicLevelKpi,
  educationalLevelSummaries = [],
  academicStructureDraft,
  academicGradingScale = null,
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

    const normalizeSubjectIdentity = (value = '') => String(value || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');

    const resolveCanonicalSubject = (rawValue = '') => {
      const slug = normalizeSubjectIdentity(rawValue);
      if (!slug) {
        return { key: 'sin-asignatura', label: 'Sin asignatura' };
      }
      const matched = subjects.find((subject) => (
        normalizeSubjectIdentity(subject.key) === slug
        || normalizeSubjectIdentity(subject.label) === slug
      ));
      if (matched) {
        return {
          key: String(matched.key || matched.label || slug).trim(),
          label: String(matched.label || matched.key || rawValue).trim(),
        };
      }
      return {
        key: slug,
        label: String(rawValue || slug).trim(),
      };
    };

    const resolveCourseIdentity = (course = {}) => [
      String(course.teacherUserId || '').trim(),
      String(course.gradeKey || course.studentGradeKey || '').trim(),
      String(course.sourceCourseKey || course.section || course.key || '').trim().toLowerCase(),
    ].join('::');

    const buckets = new Map();
    const ensureBucket = (canonical) => {
      if (!buckets.has(canonical.key)) {
        buckets.set(canonical.key, {
          key: canonical.key,
          label: canonical.label,
          courseIdentities: new Set(),
          courseRows: [],
          evaluatedStudents: 0,
          scoreWeightedTotal: 0,
          scoreWeight: 0,
          atRisk: 0,
        });
      }
      return buckets.get(canonical.key);
    };

    subjects.forEach((subject) => {
      const key = String(subject.key || subject.label || '').trim();
      if (!key) return;
      ensureBucket({
        key,
        label: String(subject.label || subject.key || key).trim(),
      });
    });

    campusPerformanceCourses.forEach((course) => {
      const canonical = resolveCanonicalSubject(course.subject || course.subjectKey || '');
      const bucket = ensureBucket(canonical);
      const courseIdentity = resolveCourseIdentity(course);
      if (bucket.courseIdentities.has(courseIdentity)) {
        return;
      }

      bucket.courseIdentities.add(courseIdentity);
      const evaluatedStudentCount = Number(course.evaluatedStudentCount || 0);
      const rawAverage = course.averageScore;
      const averageScore = rawAverage == null || rawAverage === ''
        ? null
        : Number(rawAverage);
      const hasRealAverage = evaluatedStudentCount > 0 && Number.isFinite(averageScore);

      bucket.courseRows.push({
        key: courseIdentity || `${canonical.key}-${bucket.courseRows.length}`,
        label: course.displayLabel || course.title || course.label || canonical.label,
        teacherUserId: String(course.teacherUserId || '').trim(),
        averageScore: hasRealAverage ? averageScore : null,
        evaluatedStudentCount,
        atRiskCount: Number(course.atRiskCount || 0),
        students: (Array.isArray(course.evaluatedStudents) ? course.evaluatedStudents : [])
          .map((student) => {
            const finalScore = student?.finalScore == null || student?.finalScore === ''
              ? null
              : Number(student.finalScore);
            return {
              key: String(student.studentId || student.schoolCode || student.name || '').trim(),
              name: String(student.name || 'Alumno').trim(),
              schoolCode: String(student.schoolCode || '').trim(),
              finalScore: Number.isFinite(finalScore) ? finalScore : null,
            };
          })
          .filter((student) => student.key && student.finalScore != null)
          .sort((left, right) => Number(right.finalScore) - Number(left.finalScore) || String(left.name).localeCompare(String(right.name), 'es')),
      });

      bucket.evaluatedStudents += evaluatedStudentCount;
      bucket.atRisk += Number(course.atRiskCount || 0);
      if (hasRealAverage) {
        bucket.scoreWeightedTotal += averageScore * evaluatedStudentCount;
        bucket.scoreWeight += evaluatedStudentCount;
      }
    });

    return Array.from(buckets.values())
      .map((row) => ({
        key: row.key,
        label: row.label,
        courses: row.courseIdentities.size,
        courseRows: row.courseRows.sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'es', { numeric: true })),
        evaluatedStudents: row.evaluatedStudents,
        atRisk: row.atRisk,
        averageScore: row.scoreWeight > 0
          ? Number((row.scoreWeightedTotal / row.scoreWeight).toFixed(2))
          : null,
      }))
      .sort((left, right) => {
        if (left.averageScore == null && right.averageScore == null) {
          return String(left.label || '').localeCompare(String(right.label || ''), 'es');
        }
        if (left.averageScore == null) return 1;
        if (right.averageScore == null) return -1;
        return Number(left.averageScore) - Number(right.averageScore);
      });
  }, [academicStructureDraft?.subjects, campusPerformanceCourses]);

  const uniqueCampusCourseCount = useMemo(() => {
    const identities = new Set(
      campusPerformanceCourses.map((course) => [
        String(course.teacherUserId || '').trim(),
        String(course.gradeKey || course.studentGradeKey || '').trim(),
        String(course.subject || course.subjectKey || '').trim().toLowerCase(),
        String(course.sourceCourseKey || course.section || course.key || '').trim().toLowerCase(),
      ].join('::')),
    );
    return identities.size;
  }, [campusPerformanceCourses]);

  const performanceLevels = useMemo(() => {
    const levels = Array.isArray(academicGradingScale?.performanceLevels)
      ? academicGradingScale.performanceLevels
      : [];
    return levels.filter((level) => level?.key && level?.label);
  }, [academicGradingScale]);

  const levelsDirectory = useMemo(() => {
    const normalizeSubjectIdentity = (value = '') => String(value || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');

    const structureGrades = Array.isArray(academicStructureDraft?.grades)
      ? academicStructureDraft.grades
      : [];
    const enrolledStudents = Array.isArray(students) ? students : [];

    return (overviewAcademicPerformance?.levelRows || []).map((level) => {
      const grades = structureGrades
        .filter((grade) => String(grade.levelKey || '').trim() === String(level.key || '').trim())
        .map((grade) => {
          const gradeKey = String(grade.key || '').trim();
          const institutionalCourses = Array.isArray(grade.courses) ? grade.courses : [];

          const courses = institutionalCourses.map((institutionalCourse) => {
            const courseKey = String(institutionalCourse.key || institutionalCourse.label || '').trim();
            const courseLabel = String(institutionalCourse.label || institutionalCourse.section || institutionalCourse.key || courseKey).trim();
            const matchedCampusCourses = campusPerformanceCourses.filter((campusCourse) => (
              campusCourseMatchesInstitutionalCourse(campusCourse, gradeKey, institutionalCourse)
            ));

            const subjectBuckets = new Map();
            matchedCampusCourses.forEach((campusCourse) => {
              const subjectLabel = String(campusCourse.subject || campusCourse.subjectKey || 'Asignatura').trim();
              const subjectKey = normalizeSubjectIdentity(subjectLabel) || subjectLabel;
              const evaluated = (Array.isArray(campusCourse.evaluatedStudents) ? campusCourse.evaluatedStudents : [])
                .filter((student) => {
                  const enrolled = enrolledStudents.find((item) => String(item._id || item.id || '') === String(student.studentId || ''));
                  const studentForMatch = {
                    grade: student.grade || enrolled?.grade || campusCourse.gradeKey,
                    course: student.course || enrolled?.course || '',
                  };
                  return studentBelongsToInstitutionalCourse(studentForMatch, gradeKey, institutionalCourse)
                    && Number.isFinite(Number(student.finalScore));
                });

              if (!subjectBuckets.has(subjectKey)) {
                subjectBuckets.set(subjectKey, {
                  key: subjectKey,
                  label: subjectLabel,
                  scores: [],
                  teacherLabels: new Set(),
                });
              }
              const bucket = subjectBuckets.get(subjectKey);
              const teacherLabel = teacherLabelById[String(campusCourse.teacherUserId || '').trim()] || '';
              if (teacherLabel) {
                bucket.teacherLabels.add(teacherLabel);
              }
              evaluated.forEach((student) => {
                bucket.scores.push(Number(student.finalScore));
              });
              if (evaluated.length === 0 && campusCourse.averageScore != null && Number.isFinite(Number(campusCourse.averageScore))) {
                // Course-level average when roster filtering removed named scores.
                bucket.scores.push(Number(campusCourse.averageScore));
              }
            });

            const subjects = Array.from(subjectBuckets.values())
              .map((subject) => ({
                key: subject.key,
                label: subject.label,
                teacherLabel: Array.from(subject.teacherLabels)[0] || 'Docente sin asignar',
                averageScore: subject.scores.length
                  ? Number((subject.scores.reduce((sum, score) => sum + score, 0) / subject.scores.length).toFixed(2))
                  : null,
                evaluatedStudentCount: subject.scores.length,
              }))
              .sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'es'));

            const courseEnrolled = enrolledStudents.filter((student) => (
              studentBelongsToInstitutionalCourse(student, gradeKey, institutionalCourse)
            ));

            const studentScoreMap = new Map();
            matchedCampusCourses.forEach((campusCourse) => {
              (Array.isArray(campusCourse.evaluatedStudents) ? campusCourse.evaluatedStudents : []).forEach((student) => {
                const studentId = String(student.studentId || '').trim();
                if (!studentId || !Number.isFinite(Number(student.finalScore))) return;
                const enrolled = enrolledStudents.find((item) => String(item._id || item.id || '') === studentId);
                const studentForMatch = {
                  grade: student.grade || enrolled?.grade || campusCourse.gradeKey,
                  course: student.course || enrolled?.course || '',
                };
                if (!studentBelongsToInstitutionalCourse(studentForMatch, gradeKey, institutionalCourse)) {
                  return;
                }
                if (!studentScoreMap.has(studentId)) {
                  studentScoreMap.set(studentId, {
                    key: studentId,
                    name: String(student.name || enrolled?.name || 'Alumno').trim(),
                    schoolCode: String(student.schoolCode || enrolled?.schoolCode || enrolled?.documentNumber || '').trim(),
                    scores: [],
                  });
                }
                studentScoreMap.get(studentId).scores.push(Number(student.finalScore));
              });
            });

            courseEnrolled.forEach((student) => {
              const studentId = String(student._id || student.id || '').trim();
              if (!studentId || studentScoreMap.has(studentId)) return;
              studentScoreMap.set(studentId, {
                key: studentId,
                name: String(student.name || 'Alumno').trim(),
                schoolCode: String(student.schoolCode || student.documentNumber || '').trim(),
                scores: [],
              });
            });

            const courseStudents = Array.from(studentScoreMap.values())
              .map((student) => ({
                key: student.key,
                name: student.name,
                schoolCode: student.schoolCode,
                averageScore: student.scores.length
                  ? Number((student.scores.reduce((sum, score) => sum + score, 0) / student.scores.length).toFixed(2))
                  : null,
                subjectsCount: student.scores.length,
              }))
              .sort((left, right) => {
                if (left.averageScore == null && right.averageScore == null) {
                  return String(left.name).localeCompare(String(right.name), 'es');
                }
                if (left.averageScore == null) return 1;
                if (right.averageScore == null) return -1;
                return Number(right.averageScore) - Number(left.averageScore)
                  || String(left.name).localeCompare(String(right.name), 'es');
              });

            const studentAverages = courseStudents
              .map((student) => student.averageScore)
              .filter((score) => score != null && Number.isFinite(Number(score)));

            return {
              key: courseKey || courseLabel,
              label: courseLabel,
              averageScore: studentAverages.length
                ? Number((studentAverages.reduce((sum, score) => sum + score, 0) / studentAverages.length).toFixed(2))
                : null,
              studentCount: courseStudents.length,
              subjects,
              students: courseStudents,
            };
          }).sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'es', { numeric: true }));

          const gradeStudentAverages = courses
            .flatMap((course) => course.students.map((student) => student.averageScore))
            .filter((score) => score != null && Number.isFinite(Number(score)));
          const uniqueEvaluatedIds = new Set(
            courses.flatMap((course) => course.students.filter((student) => student.averageScore != null).map((student) => student.key)),
          );

          return {
            key: gradeKey,
            label: String(grade.label || grade.key || '').trim(),
            averageScore: gradeStudentAverages.length
              ? Number((gradeStudentAverages.reduce((sum, score) => sum + score, 0) / gradeStudentAverages.length).toFixed(2))
              : null,
            evaluatedStudentCount: uniqueEvaluatedIds.size,
            courses,
          };
        })
        .sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'es', { numeric: true }));

      return {
        ...level,
        grades,
      };
    });
  }, [academicStructureDraft?.grades, campusPerformanceCourses, overviewAcademicPerformance?.levelRows, students, teacherLabelById]);

  const studentDirectory = useMemo(() => {
    const normalizeSubjectIdentity = (value = '') => String(value || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');

    const buckets = new Map();

    const ensureStudent = ({
      studentId = '',
      name = '',
      schoolCode = '',
      grade = '',
      course = '',
    } = {}) => {
      const key = String(studentId || schoolCode || name).trim();
      if (!key) return null;
      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          studentId: String(studentId || '').trim(),
          name: String(name || 'Alumno').trim(),
          schoolCode: String(schoolCode || '').trim(),
          grade: String(grade || '').trim(),
          course: String(course || '').trim(),
          subjectMap: new Map(),
          scores: [],
        });
      }
      return buckets.get(key);
    };

    (Array.isArray(students) ? students : []).forEach((student) => {
      ensureStudent({
        studentId: student._id || student.id,
        name: student.name,
        schoolCode: student.schoolCode || student.documentNumber,
        grade: student.grade,
        course: student.course,
      });
    });

    campusPerformanceCourses.forEach((course) => {
      const subjectLabel = String(course.subject || course.subjectKey || 'Asignatura').trim();
      const subjectKey = normalizeSubjectIdentity(subjectLabel) || subjectLabel;
      const courseLabel = course.displayLabel || course.title || course.label || subjectLabel;
      const teacherLabel = teacherLabelById[String(course.teacherUserId || '').trim()] || 'Docente sin asignar';
      const evaluatedById = new Map(
        (Array.isArray(course.evaluatedStudents) ? course.evaluatedStudents : [])
          .map((student) => [String(student.studentId || '').trim(), student])
          .filter(([id]) => id),
      );
      const rosterIds = new Set([
        ...(Array.isArray(course.studentIds) ? course.studentIds : []).map((id) => String(id || '').trim()).filter(Boolean),
        ...evaluatedById.keys(),
      ]);

      rosterIds.forEach((studentId) => {
        const evaluated = evaluatedById.get(studentId);
        const row = ensureStudent({
          studentId,
          name: evaluated?.name,
          schoolCode: evaluated?.schoolCode,
          grade: evaluated?.grade || course.gradeKey || course.studentGradeKey,
          course: evaluated?.course || course.section,
        });
        if (!row) return;

        if (!row.name && evaluated?.name) row.name = evaluated.name;
        if (!row.schoolCode && evaluated?.schoolCode) row.schoolCode = evaluated.schoolCode;
        if (!row.grade && (evaluated?.grade || course.gradeKey || course.studentGradeKey)) {
          row.grade = String(evaluated?.grade || course.gradeKey || course.studentGradeKey || '').trim();
        }

        const rawScore = evaluated?.finalScore;
        const averageScore = rawScore == null || rawScore === ''
          ? null
          : (Number.isFinite(Number(rawScore)) ? Number(rawScore) : null);

        const currentSubject = row.subjectMap.get(subjectKey) || {
          key: subjectKey,
          label: subjectLabel,
          scores: [],
          teacherLabels: new Set(),
          courseLabels: new Set(),
        };
        currentSubject.courseLabels.add(courseLabel);
        currentSubject.teacherLabels.add(teacherLabel);
        if (averageScore != null) {
          currentSubject.scores.push(averageScore);
          row.scores.push(averageScore);
        }
        row.subjectMap.set(subjectKey, currentSubject);
      });
    });

    return Array.from(buckets.values())
      .map((row) => {
        const subjects = Array.from(row.subjectMap.values())
          .map((subject) => {
            const averageScore = subject.scores.length
              ? Number((subject.scores.reduce((sum, score) => sum + score, 0) / subject.scores.length).toFixed(2))
              : null;
            const performance = resolvePerformanceCategory(averageScore, performanceLevels);
            return {
              key: subject.key,
              label: subject.label,
              averageScore,
              performanceLabel: performance?.label || '',
              performanceColor: performance?.color || '',
              teacherLabel: Array.from(subject.teacherLabels)[0] || '',
              courseLabel: Array.from(subject.courseLabels).slice(0, 2).join(' · '),
            };
          })
          .sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'es'));

        const averageScore = row.scores.length
          ? Number((row.scores.reduce((sum, score) => sum + score, 0) / row.scores.length).toFixed(2))
          : null;
        const performance = resolvePerformanceCategory(averageScore, performanceLevels);

        return {
          key: row.key,
          name: row.name,
          schoolCode: row.schoolCode,
          grade: row.grade,
          course: row.course,
          averageScore,
          performanceKey: performance?.key || '',
          performanceLabel: performance?.label || '',
          performanceColor: performance?.color || '',
          subjects,
        };
      })
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'es'));
  }, [campusPerformanceCourses, performanceLevels, students, teacherLabelById]);

  const teacherDirectory = useMemo(() => {
    const normalizeSubjectIdentity = (value = '') => String(value || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');

    const studentById = new Map(
      (Array.isArray(students) ? students : [])
        .map((student) => {
          const id = String(student._id || student.id || '').trim();
          return id ? [id, student] : null;
        })
        .filter(Boolean),
    );

    const resolveCourseIdentity = (course = {}) => [
      String(course.teacherUserId || '').trim(),
      String(course.gradeKey || course.studentGradeKey || '').trim(),
      String(course.subject || course.subjectKey || '').trim().toLowerCase(),
      String(course.sourceCourseKey || course.section || course.key || '').trim().toLowerCase(),
    ].join('::');

    const teacherBuckets = new Map();

    campusPerformanceCourses.forEach((course) => {
      const teacherKey = String(course.teacherUserId || '').trim() || 'sin-docente';
      const subjectLabel = String(course.subject || course.subjectKey || 'Asignatura').trim();
      const subjectKey = normalizeSubjectIdentity(subjectLabel) || subjectLabel;
      const courseIdentity = resolveCourseIdentity(course);
      const evaluatedStudentCount = Number(course.evaluatedStudentCount || 0);
      const rawAverage = course.averageScore;
      const averageScore = rawAverage == null || rawAverage === ''
        ? null
        : Number(rawAverage);
      const hasRealAverage = evaluatedStudentCount > 0 && Number.isFinite(averageScore);

          if (!teacherBuckets.has(teacherKey)) {
        teacherBuckets.set(teacherKey, {
          key: teacherKey,
          label: teacherLabelById[teacherKey] || 'Docente sin asignar',
          subjectMap: new Map(),
          courseIdentities: new Set(),
          scoreWeightedTotal: 0,
          scoreWeight: 0,
        });
      }

      const teacherBucket = teacherBuckets.get(teacherKey);
      teacherBucket.courseIdentities.add(courseIdentity);
      if (hasRealAverage) {
        teacherBucket.scoreWeightedTotal += averageScore * evaluatedStudentCount;
        teacherBucket.scoreWeight += evaluatedStudentCount;
      }

      if (!teacherBucket.subjectMap.has(subjectKey)) {
        teacherBucket.subjectMap.set(subjectKey, {
          key: subjectKey,
          label: subjectLabel,
          courseMap: new Map(),
          scoreWeightedTotal: 0,
          scoreWeight: 0,
        });
      }

      const subjectBucket = teacherBucket.subjectMap.get(subjectKey);
      if (subjectBucket.courseMap.has(courseIdentity)) {
        return;
      }

      const evaluatedById = new Map(
        (Array.isArray(course.evaluatedStudents) ? course.evaluatedStudents : [])
          .map((student) => [String(student.studentId || '').trim(), student])
          .filter(([id]) => id),
      );
      const rosterIds = [
        ...new Set([
          ...(Array.isArray(course.studentIds) ? course.studentIds : []).map((id) => String(id || '').trim()).filter(Boolean),
          ...evaluatedById.keys(),
        ]),
      ];

      const courseStudents = rosterIds
        .map((studentId) => {
          const evaluated = evaluatedById.get(studentId);
          const enrolled = studentById.get(studentId);
          const rawScore = evaluated?.finalScore;
          const finalScore = rawScore == null || rawScore === ''
            ? null
            : (Number.isFinite(Number(rawScore)) ? Number(rawScore) : null);
          return {
            key: studentId,
            name: String(evaluated?.name || enrolled?.name || 'Alumno').trim(),
            schoolCode: String(evaluated?.schoolCode || enrolled?.schoolCode || enrolled?.documentNumber || '').trim(),
            finalScore,
          };
        })
        .sort((left, right) => {
          if (left.finalScore == null && right.finalScore == null) {
            return String(left.name).localeCompare(String(right.name), 'es');
          }
          if (left.finalScore == null) return 1;
          if (right.finalScore == null) return -1;
          return Number(right.finalScore) - Number(left.finalScore)
            || String(left.name).localeCompare(String(right.name), 'es');
        });

      const studentScoreValues = courseStudents
        .map((student) => student.finalScore)
        .filter((score) => score != null && Number.isFinite(Number(score)))
        .map(Number);
      const derivedAverage = studentScoreValues.length > 0
        ? Number((studentScoreValues.reduce((sum, score) => sum + score, 0) / studentScoreValues.length).toFixed(2))
        : (hasRealAverage ? averageScore : null);
      const derivedWeight = studentScoreValues.length > 0
        ? studentScoreValues.length
        : (hasRealAverage ? evaluatedStudentCount : 0);

      subjectBucket.courseMap.set(courseIdentity, {
        key: courseIdentity,
        label: course.displayLabel || course.title || course.label || subjectLabel,
        sectionLabel: String(course.section || course.sourceCourseKey || '').trim(),
        gradeKey: String(course.gradeKey || course.studentGradeKey || '').trim() || 'sin-grado',
        gradeLabel: String(course.gradeLevel || course.gradeKey || course.studentGradeKey || 'Sin grado').trim(),
        averageScore: derivedAverage,
        scoreWeight: derivedWeight,
        studentCount: courseStudents.length,
        students: courseStudents,
      });

      if (derivedAverage != null && derivedWeight > 0) {
        subjectBucket.scoreWeightedTotal += derivedAverage * derivedWeight;
        subjectBucket.scoreWeight += derivedWeight;
      }
    });

    const passingScore = Number(academicGradingScale?.passingScore);
    const hasPassingScore = Number.isFinite(passingScore);

    return Array.from(teacherBuckets.values())
      .map((teacher) => {
        const subjects = Array.from(teacher.subjectMap.values())
          .map((subject) => {
            const courses = Array.from(subject.courseMap.values());
            const gradeBuckets = new Map();

            courses.forEach((course) => {
              const gradeKey = course.gradeKey || 'sin-grado';
              if (!gradeBuckets.has(gradeKey)) {
                gradeBuckets.set(gradeKey, {
                  key: gradeKey,
                  label: course.gradeLabel || gradeKey,
                  courses: [],
                  scoreWeightedTotal: 0,
                  scoreWeight: 0,
                });
              }
              const gradeBucket = gradeBuckets.get(gradeKey);
              gradeBucket.courses.push({
                ...course,
                label: course.sectionLabel
                  || course.label
                  || subject.label,
              });
              if (course.averageScore != null && course.scoreWeight > 0) {
                gradeBucket.scoreWeightedTotal += course.averageScore * course.scoreWeight;
                gradeBucket.scoreWeight += course.scoreWeight;
              }
            });

            const grades = Array.from(gradeBuckets.values())
              .map((grade) => ({
                key: grade.key,
                label: grade.label,
                averageScore: grade.scoreWeight > 0
                  ? Number((grade.scoreWeightedTotal / grade.scoreWeight).toFixed(2))
                  : null,
                courses: grade.courses.sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'es', { numeric: true })),
              }))
              .sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'es', { numeric: true }));

            return {
              key: subject.key,
              label: subject.label,
              averageScore: subject.scoreWeight > 0
                ? Number((subject.scoreWeightedTotal / subject.scoreWeight).toFixed(2))
                : null,
              coursesCount: courses.length,
              grades,
            };
          })
          .sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'es'));

        let atRiskCount = 0;
        if (hasPassingScore) {
          const atRiskStudents = new Set();
          subjects.forEach((subject) => {
            subject.grades.forEach((grade) => {
              grade.courses.forEach((course) => {
                course.students.forEach((student) => {
                  if (student.finalScore != null && Number(student.finalScore) < passingScore) {
                    atRiskStudents.add(student.key);
                  }
                });
              });
            });
          });
          atRiskCount = atRiskStudents.size;
        }

        return {
          key: teacher.key,
          label: teacher.label,
          subjectsCount: subjects.length,
          coursesCount: teacher.courseIdentities.size,
          averageScore: teacher.scoreWeight > 0
            ? Number((teacher.scoreWeightedTotal / teacher.scoreWeight).toFixed(2))
            : null,
          atRiskCount,
          subjects,
        };
      })
      .sort((left, right) => {
        if (left.averageScore == null && right.averageScore == null) {
          return String(left.label || '').localeCompare(String(right.label || ''), 'es');
        }
        if (left.averageScore == null) return 1;
        if (right.averageScore == null) return -1;
        return Number(left.averageScore) - Number(right.averageScore)
          || String(left.label || '').localeCompare(String(right.label || ''), 'es');
      });
  }, [academicGradingScale?.passingScore, campusPerformanceCourses, students, teacherLabelById]);

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
    control_community_reports: {
      eyebrow: 'Centro de control',
      title: 'Te escuchamos',
      description: 'Reportes de bullying, depresión, docentes y recomendaciones enviados por acudientes y alumnos.',
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

  return (
    <div className="rectoria-control-center">
      <header className="rectoria-control-hero">
        <div>
          <span className="rectoria-control-eyebrow">{viewMeta.eyebrow}</span>
          <h2>{view === 'control_community_reports' ? <TeEscuchamosLabel as="span" /> : viewMeta.title}</h2>
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
          <LevelDrilldownPanel
            levels={levelsDirectory}
            performanceLevels={performanceLevels}
          />
        </>
      ) : null}

      {view === 'control_subjects' ? (
        <>
          <ControlKpiGrid items={[
            { key: 'subjects', label: 'Asignaturas', value: subjectRows.length, helper: 'Configuradas en el colegio' },
            { key: 'courses', label: 'Cursos campus', value: uniqueCampusCourseCount, helper: 'Con seguimiento académico' },
            { key: 'evaluated', label: 'Evaluaciones', value: overviewAcademicPerformance?.evaluatedStudentCount || 0, helper: 'Estudiantes con notas' },
            { key: 'attention', label: 'Cursos en atención', value: overviewAcademicPerformance?.coursesNeedingAttention?.length || 0, helper: 'Bajo umbral o en riesgo', tone: (overviewAcademicPerformance?.coursesNeedingAttention?.length || 0) > 0 ? 'warn' : '' },
          ]} />
          <SubjectCoursesPanel
            emptyLabel="No hay asignaturas configuradas todavía."
            performanceLevels={performanceLevels}
            subjects={subjectRows}
            teacherLabelById={teacherLabelById}
            title="Lectura por asignatura"
          />
        </>
      ) : null}

      {view === 'control_students' ? (
        <>
          <ControlKpiGrid items={studentKpis} />
          <StudentDirectoryPanel
            performanceLevels={performanceLevels}
            students={studentDirectory}
          />
        </>
      ) : null}

      {view === 'control_teachers' ? (
        <>
          <ControlKpiGrid items={[
            { key: 'teachers', label: 'Docentes', value: teacherDirectory.length, helper: 'Con cursos en campus' },
            { key: 'courses', label: 'Cursos monitoreados', value: uniqueCampusCourseCount, helper: 'En campus docente' },
            { key: 'pending', label: 'Por calificar', value: overviewAcademicPerformance?.pendingGradingCount || 0, helper: 'Actividades pendientes' },
            { key: 'risk', label: 'Alumnos en riesgo', value: overviewAcademicPerformance?.atRiskStudents?.length || 0, helper: 'Consolidado por alumno' },
          ]} />
          <TeacherDirectoryPanel
            performanceLevels={performanceLevels}
            teachers={teacherDirectory}
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

      {view === 'control_community_reports' ? (
        <CommunityReportsPanel className="community-reports-panel--embedded" />
      ) : null}
    </div>
  );
}
