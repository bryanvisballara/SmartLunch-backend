import { useMemo, useState } from 'react';
import { resolveGradeCourses } from '../lib/academicGradeCourses';
import CoordinationScheduleBoard from './CoordinationScheduleBoard';
import '../pages/SchoolCreationWizard.css';
import './CoordinationSchedulePanel.css';

function normalizeCourseKey(value = '') {
  return String(value || '').trim().toUpperCase();
}

function sortEntries(left, right) {
  const weekdayDiff = Number(left.weekday || 0) - Number(right.weekday || 0);
  if (weekdayDiff !== 0) return weekdayDiff;
  return String(left.startTime || '').localeCompare(String(right.startTime || ''));
}

function resolveScheduleForCourse(gradeSchedules = [], gradeKey = '', courseKey = '') {
  const normalizedCourseKey = normalizeCourseKey(courseKey);
  return gradeSchedules.find((schedule) => (
    schedule.gradeKey === gradeKey && normalizeCourseKey(schedule.courseKey) === normalizedCourseKey
  )) || gradeSchedules.find((schedule) => (
    schedule.gradeKey === gradeKey && !String(schedule.courseKey || '').trim()
  )) || null;
}

function buildBoardEntry(entry, {
  subjectLabelByKey,
  teacherLabels,
  gradeLabel = '',
  courseLabel = '',
  viewMode = 'courses',
}) {
  const isBreak = String(entry?.entryType || 'class').trim() === 'break';
  const subjectLabel = subjectLabelByKey[entry?.subjectKey] || entry?.subjectKey || 'Materia';
  const teacherLabel = teacherLabels[String(entry?.teacherUserId || '')] || 'Sin docente';

  return {
    key: String(entry?.key || `${entry?.weekday}-${entry?.block}-${entry?.subjectKey || entry?.breakKey || 'slot'}`),
    weekday: Number(entry?.weekday || 0),
    block: Number(entry?.block || 0),
    startTime: String(entry?.startTime || '').trim(),
    endTime: String(entry?.endTime || '').trim(),
    entryType: isBreak ? 'break' : 'class',
    subjectKey: String(entry?.subjectKey || '').trim(),
    breakKey: String(entry?.breakKey || '').trim(),
    breakLabel: String(entry?.breakLabel || '').trim(),
    teacherUserId: String(entry?.teacherUserId || '').trim(),
    title: isBreak ? (String(entry?.breakLabel || '').trim() || 'Break') : subjectLabel,
    secondary: isBreak
      ? ''
      : (viewMode === 'teachers' ? `${gradeLabel} · ${courseLabel}` : teacherLabel),
  };
}

export default function CoordinationSchedulePanel({
  academicStructure,
  gradeLabels = {},
  teacherLabels = {},
  scopeLabel = 'Nivel asignado',
}) {
  const grades = Array.isArray(academicStructure?.grades) ? academicStructure.grades : [];
  const subjects = Array.isArray(academicStructure?.subjects) ? academicStructure.subjects : [];
  const gradeSchedules = Array.isArray(academicStructure?.gradeSchedules) ? academicStructure.gradeSchedules : [];
  const scheduleSettings = academicStructure?.scheduleSettings || {};

  const [viewMode, setViewMode] = useState('teachers');
  const [expandedKey, setExpandedKey] = useState('');

  const subjectLabelByKey = useMemo(() => (
    subjects.reduce((accumulator, subject) => {
      const key = String(subject?.key || '').trim();
      if (key) accumulator[key] = String(subject?.label || key).trim();
      return accumulator;
    }, {})
  ), [subjects]);

  const courseRows = useMemo(() => (
    grades.flatMap((grade) => {
      const gradeLabel = gradeLabels[grade.key] || grade.label || grade.key;
      return resolveGradeCourses(grade).map((course) => {
        const schedule = resolveScheduleForCourse(gradeSchedules, grade.key, course.key);
        const weeklySchedule = (Array.isArray(schedule?.weeklySchedule) ? schedule.weeklySchedule : [])
          .filter((entry) => String(entry?.entryType || 'class') === 'break' || String(entry?.subjectKey || '').trim())
          .map((entry) => buildBoardEntry(entry, {
            subjectLabelByKey,
            teacherLabels,
            gradeLabel,
            courseLabel: course.label || course.key,
            viewMode: 'courses',
          }))
          .sort(sortEntries);

        return {
          key: `${grade.key}::${course.key}`,
          title: `${gradeLabel} · ${course.label || course.key}`,
          subtitle: `${weeklySchedule.length} bloque${weeklySchedule.length === 1 ? '' : 's'} en la semana`,
          gradeKey: grade.key,
          weeklySchedule,
        };
      });
    })
  ), [gradeLabels, gradeSchedules, grades, subjectLabelByKey, teacherLabels]);

  const teacherRows = useMemo(() => {
    const teacherMap = new Map();

    gradeSchedules.forEach((schedule) => {
      const grade = grades.find((item) => item.key === schedule.gradeKey);
      const gradeLabel = gradeLabels[schedule.gradeKey] || grade?.label || schedule.gradeKey;
      const courseKey = String(schedule.courseKey || '').trim();
      const course = grade
        ? resolveGradeCourses(grade).find((item) => normalizeCourseKey(item.key) === normalizeCourseKey(courseKey))
        : null;
      const courseLabel = course?.label || (courseKey || 'General');

      (Array.isArray(schedule.weeklySchedule) ? schedule.weeklySchedule : []).forEach((entry) => {
        if (String(entry?.entryType || 'class') === 'break') return;
        const teacherId = String(entry?.teacherUserId || '').trim();
        if (!teacherId) return;

        const current = teacherMap.get(teacherId) || {
          teacherId,
          teacherName: teacherLabels[teacherId] || 'Docente',
          weeklySchedule: [],
        };

        current.weeklySchedule.push(buildBoardEntry(entry, {
          subjectLabelByKey,
          teacherLabels,
          gradeLabel,
          courseLabel,
          viewMode: 'teachers',
        }));
        teacherMap.set(teacherId, current);
      });
    });

    return [...teacherMap.values()]
      .map((teacher) => ({
        ...teacher,
        key: teacher.teacherId,
        title: teacher.teacherName,
        subtitle: `${teacher.weeklySchedule.length} bloque${teacher.weeklySchedule.length === 1 ? '' : 's'} semanal${teacher.weeklySchedule.length === 1 ? '' : 'es'}`,
        gradeKey: '',
        weeklySchedule: [...teacher.weeklySchedule].sort(sortEntries),
      }))
      .sort((left, right) => left.title.localeCompare(right.title, 'es', { sensitivity: 'base' }));
  }, [gradeLabels, gradeSchedules, grades, subjectLabelByKey, teacherLabels]);

  const visibleRows = viewMode === 'teachers' ? teacherRows : courseRows;

  const onModeChange = (nextMode) => {
    setViewMode(nextMode);
    setExpandedKey('');
  };

  const onToggleRow = (rowKey) => {
    setExpandedKey((current) => (current === rowKey ? '' : rowKey));
  };

  return (
    <section className="coordination-schedule rectoria-panel--school-schedule">
      <div className="coordination-schedule-header">
        <div>
          <span className="coordination-schedule-kicker">Horario académico</span>
          <h3>{scopeLabel}</h3>
          <p>Elige si quieres revisar la malla por docente o por curso. Luego despliega cada opción para ver el horario semanal.</p>
        </div>
      </div>

      <div className="coordination-schedule-mode-picker" role="tablist" aria-label="Tipo de horario">
        <button
          className={`coordination-schedule-mode-btn${viewMode === 'teachers' ? ' is-active' : ''}`}
          type="button"
          onClick={() => onModeChange('teachers')}
        >
          Horario por docente
        </button>
        <button
          className={`coordination-schedule-mode-btn${viewMode === 'courses' ? ' is-active' : ''}`}
          type="button"
          onClick={() => onModeChange('courses')}
        >
          Horario por curso
        </button>
      </div>

      {visibleRows.length === 0 ? (
        <p className="coordination-schedule-empty">
          {viewMode === 'teachers'
            ? 'Todavía no hay bloques de clase asignados a docentes en este nivel.'
            : 'No hay cursos configurados para este nivel.'}
        </p>
      ) : (
        <div className="coordination-schedule-accordion-list">
          {visibleRows.map((row) => {
            const isExpanded = expandedKey === row.key;
            return (
              <article
                className={`coordination-schedule-accordion${isExpanded ? ' is-expanded' : ''}`}
                key={row.key}
              >
                <button
                  className="coordination-schedule-accordion-summary"
                  type="button"
                  onClick={() => onToggleRow(row.key)}
                  aria-expanded={isExpanded}
                >
                  <div>
                    <strong>{row.title}</strong>
                    <span>{row.subtitle}</span>
                  </div>
                  <span className={`coordination-schedule-accordion-chevron${isExpanded ? ' is-open' : ''}`} aria-hidden="true">›</span>
                </button>
                {isExpanded ? (
                  <div className="coordination-schedule-accordion-body">
                    <CoordinationScheduleBoard
                      weeklySchedule={row.weeklySchedule}
                      scheduleSettings={scheduleSettings}
                      gradeKey={row.gradeKey}
                    />
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
