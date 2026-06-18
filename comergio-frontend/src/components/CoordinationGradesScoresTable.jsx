import { Fragment, useMemo, useState } from 'react';
import './CoordinationGradesCoursesPanel.css';

function formatScore(value) {
  if (!Number.isFinite(Number(value))) return 'Sin nota';
  return Number(value).toFixed(2);
}

function ScoreBadge({ value }) {
  const numeric = Number(value);
  const hasScore = Number.isFinite(numeric);
  const tone = !hasScore
    ? 'neutral'
    : numeric >= 90
      ? 'excellent'
      : numeric >= 80
        ? 'good'
        : numeric >= 70
          ? 'ok'
          : 'risk';

  return (
    <span className={`coordination-grades-score coordination-grades-score--${tone}`}>
      {hasScore ? formatScore(numeric) : 'Sin nota'}
    </span>
  );
}

export default function CoordinationGradesScoresTable({ grades = [] }) {
  const [expandedGradeKey, setExpandedGradeKey] = useState('');
  const [expandedSubjectKey, setExpandedSubjectKey] = useState('');

  const gradeRows = useMemo(() => (
    grades.map((grade) => ({
      key: grade.key,
      label: grade.label,
      studentCount: grade.studentCount || 0,
      subjectCount: Array.isArray(grade.subjects) ? grade.subjects.length : 0,
      averageScore: grade.averageScore,
      subjects: Array.isArray(grade.subjects) ? grade.subjects : [],
    }))
  ), [grades]);

  const toggleGrade = (gradeKey) => {
    setExpandedGradeKey((current) => (current === gradeKey ? '' : gradeKey));
    setExpandedSubjectKey('');
  };

  const toggleSubject = (gradeKey, subjectKey) => {
    const compositeKey = `${gradeKey}::${subjectKey}`;
    setExpandedSubjectKey((current) => (current === compositeKey ? '' : compositeKey));
  };

  if (gradeRows.length === 0) {
    return <p className="coordination-grades-courses-empty">No hay grados configurados para mostrar calificaciones.</p>;
  }

  return (
    <div className="coordination-grades-courses-table-wrap">
      <table className="coordination-grades-courses-table">
        <thead>
          <tr>
            <th className="coordination-grades-courses-col-toggle" aria-hidden="true" />
            <th>Grado</th>
            <th>Materias</th>
            <th>Alumnos</th>
            <th>Promedio grado</th>
          </tr>
        </thead>
        <tbody>
          {gradeRows.map((grade) => {
            const isGradeExpanded = expandedGradeKey === grade.key;
            return (
              <Fragment key={grade.key}>
                <tr
                  className={`coordination-grades-grade-row${isGradeExpanded ? ' is-expanded' : ''}`}
                  onClick={() => toggleGrade(grade.key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggleGrade(grade.key);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isGradeExpanded}
                >
                  <td className="coordination-grades-courses-col-toggle">
                    <span className={`coordination-grades-chevron${isGradeExpanded ? ' is-open' : ''}`} aria-hidden="true">›</span>
                  </td>
                  <td className="coordination-grades-grade-label">{grade.label}</td>
                  <td>{grade.subjectCount} materia{grade.subjectCount === 1 ? '' : 's'}</td>
                  <td>{grade.studentCount}</td>
                  <td><ScoreBadge value={grade.averageScore} /></td>
                </tr>
                {isGradeExpanded ? (
                  <tr className="coordination-grades-detail-row">
                    <td colSpan={5}>
                      {grade.subjects.length === 0 ? (
                        <p className="coordination-grades-courses-empty">Sin materias registradas para este grado.</p>
                      ) : (
                        <table className="coordination-grades-courses-table coordination-grades-courses-table--nested">
                          <thead>
                            <tr>
                              <th className="coordination-grades-courses-col-toggle" aria-hidden="true" />
                              <th>Materia</th>
                              <th>Docente</th>
                              <th>Alumnos con nota</th>
                              <th>Promedio materia</th>
                            </tr>
                          </thead>
                          <tbody>
                            {grade.subjects.map((subject) => {
                              const subjectCompositeKey = `${grade.key}::${subject.key}`;
                              const isSubjectExpanded = expandedSubjectKey === subjectCompositeKey;
                              return (
                                <Fragment key={subject.key}>
                                  <tr
                                    className={`coordination-grades-subject-row${isSubjectExpanded ? ' is-expanded' : ''}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleSubject(grade.key, subject.key);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        toggleSubject(grade.key, subject.key);
                                      }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={isSubjectExpanded}
                                  >
                                    <td className="coordination-grades-courses-col-toggle">
                                      <span className={`coordination-grades-chevron coordination-grades-chevron--nested${isSubjectExpanded ? ' is-open' : ''}`} aria-hidden="true">›</span>
                                    </td>
                                    <td>{subject.label}</td>
                                    <td>{subject.teachers?.length ? subject.teachers.join(', ') : 'Sin docente'}</td>
                                    <td>{subject.studentCount || 0}</td>
                                    <td><ScoreBadge value={subject.averageScore} /></td>
                                  </tr>
                                  {isSubjectExpanded ? (
                                    <tr className="coordination-grades-students-row">
                                      <td colSpan={5}>
                                        {subject.students?.length ? (
                                          <table className="coordination-grades-courses-table coordination-grades-courses-table--students">
                                            <thead>
                                              <tr>
                                                <th>Alumno</th>
                                                <th>Código</th>
                                                <th>Curso</th>
                                                <th>Promedio</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {subject.students.map((student) => (
                                                <tr key={student.studentId || `${subject.key}-${student.name}`}>
                                                  <td>{student.name}</td>
                                                  <td>{student.schoolCode || '-'}</td>
                                                  <td>{student.course || 'Sin curso'}</td>
                                                  <td><ScoreBadge value={student.averageScore} /></td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        ) : (
                                          <p className="coordination-grades-courses-empty">Sin calificaciones registradas para esta materia.</p>
                                        )}
                                      </td>
                                    </tr>
                                  ) : null}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
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
  );
}
