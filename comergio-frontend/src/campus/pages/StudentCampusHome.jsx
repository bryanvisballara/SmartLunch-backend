import { useEffect, useMemo, useState } from 'react';
import useAuthStore from '../../store/auth.store';
import {
  getStudentAcademicAttendance,
  getStudentAcademicCalendar,
  getStudentPortalOverview,
} from '../../services/studentPortal.service';
import { formatEducationalGradeLabel } from '../../lib/educationalGradeLabels';

const studentSections = [
  { key: 'grades', label: 'Notas' },
  { key: 'attendance', label: 'Asistencia' },
  { key: 'calendar', label: 'Calendario' },
  { key: 'schedule', label: 'Horario' },
];

function formatGrade(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function formatDateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function buildCalendarCells(monthDate, items = []) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < startOffset; index += 1) {
    cells.push({ id: `blank-${index}`, blank: true });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const dateKey = date.toISOString().slice(0, 10);
    const dayItems = items.filter((item) => String(item.date || '').slice(0, 10) === dateKey);
    cells.push({
      id: dateKey,
      day,
      isToday: dateKey === new Date().toISOString().slice(0, 10),
      items: dayItems,
    });
  }

  return cells;
}

function StudentCampusHome() {
  const { user, logout } = useAuthStore();
  const [activeSection, setActiveSection] = useState('grades');
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [calendarItems, setCalendarItems] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState('');
  const [selectedGradeSubjectId, setSelectedGradeSubjectId] = useState('');

  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);
    setOverviewError('');

    getStudentPortalOverview()
      .then((response) => {
        if (cancelled) return;
        setOverview(response.data || null);
      })
      .catch((error) => {
        if (cancelled) return;
        setOverviewError(error?.response?.data?.message || 'No se pudo cargar tu portal académico.');
      })
      .finally(() => {
        if (!cancelled) {
          setOverviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeSection !== 'calendar') {
      return undefined;
    }

    let cancelled = false;
    setCalendarLoading(true);
    setCalendarError('');

    const monthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;
    getStudentAcademicCalendar({ month: monthKey })
      .then((response) => {
        if (cancelled) return;
        setCalendarItems(response.data?.items || []);
      })
      .catch((error) => {
        if (cancelled) return;
        setCalendarError(error?.response?.data?.message || 'No se pudo cargar el calendario.');
      })
      .finally(() => {
        if (!cancelled) {
          setCalendarLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, calendarMonth]);

  useEffect(() => {
    if (activeSection !== 'attendance') {
      return undefined;
    }

    let cancelled = false;
    setAttendanceLoading(true);
    setAttendanceError('');

    getStudentAcademicAttendance({ attendanceType: 'subject_class', limit: 20 })
      .then((response) => {
        if (cancelled) return;
        setAttendanceRecords(response.data?.records || []);
      })
      .catch((error) => {
        if (cancelled) return;
        setAttendanceError(error?.response?.data?.message || 'No se pudo cargar la asistencia.');
      })
      .finally(() => {
        if (!cancelled) {
          setAttendanceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection]);

  const student = overview?.student || null;
  const gradebook = overview?.academic?.gradebook || [];
  const schedule = overview?.academic?.schedule || [];
  const overallAverage = overview?.academic?.overallAverage;
  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth, calendarItems), [calendarMonth, calendarItems]);

  const onLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const renderGrades = () => {
    if (overviewLoading) {
      return <p className="campus-parent-mobile__empty-note">Cargando calificaciones...</p>;
    }

    if (!gradebook.length) {
      return <p className="campus-parent-mobile__empty-note">Aún no hay calificaciones publicadas para tu curso.</p>;
    }

    return (
      <>
        <div className="campus-parent-mobile__grade-overall-summary">
          <span>PROMEDIO GENERAL</span>
          <strong>{formatGrade(overallAverage)}</strong>
        </div>
        <div className="campus-parent-mobile__subject-tabs">
          {gradebook.map((subject) => {
            const isOpen = subject.id === selectedGradeSubjectId;
            const hasGrade = subject.finalAverage !== null && subject.finalAverage !== undefined;
            return (
              <article className={`campus-parent-mobile__subject-card${isOpen ? ' is-open' : ''}`} key={subject.id}>
                <button
                  className="campus-parent-mobile__subject-card-button"
                  onClick={() => setSelectedGradeSubjectId(isOpen ? '' : subject.id)}
                  type="button"
                >
                  <div className="campus-parent-mobile__subject-card-copy">
                    <span>{subject.teacher || 'Docente'}</span>
                    <strong>{subject.name}</strong>
                  </div>
                  <div className="campus-parent-mobile__subject-card-score">
                    <strong>{hasGrade ? formatGrade(subject.finalAverage) : 'Sin nota'}</strong>
                  </div>
                </button>
                {isOpen ? (
                  <div className="campus-parent-mobile__subject-card-detail">
                    {(subject.periods || []).map((period) => (
                      <article className="campus-parent-mobile__list-card campus-parent-mobile__grade-period-card" key={period.id}>
                        <div className="campus-parent-mobile__grade-period-head">
                          <div>
                            <strong>{period.label}</strong>
                            <span>{period.weight}%</span>
                          </div>
                          <strong>{formatGrade(period.average)}</strong>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </>
    );
  };

  const renderAttendance = () => {
    if (attendanceLoading) {
      return <p className="campus-parent-mobile__empty-note">Cargando asistencia...</p>;
    }
    if (attendanceError) {
      return <p className="campus-parent-mobile__feed-error">{attendanceError}</p>;
    }
    if (!attendanceRecords.length) {
      return <p className="campus-parent-mobile__empty-note">No hay registros de asistencia publicados.</p>;
    }

    return (
      <div className="campus-parent-mobile__sheet-list">
        {attendanceRecords.map((record) => (
          <article className="campus-parent-mobile__list-card" key={record.id}>
            <strong>{record.dateLabel || record.date}</strong>
            <p>{record.courseTitle || record.subject || record.attendanceTypeLabel}</p>
            <small>{record.statusLabel}</small>
          </article>
        ))}
      </div>
    );
  };

  const renderCalendar = () => (
    <section className="campus-parent-mobile__academic-calendar-board">
      <div className="campus-parent-mobile__academic-calendar-board-head">
        <strong>
          {new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(calendarMonth)}
        </strong>
        <div className="campus-parent-mobile__academic-calendar-nav">
          <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} type="button">‹</button>
          <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} type="button">›</button>
        </div>
      </div>
      {calendarLoading ? <p className="campus-parent-mobile__academic-calendar-status">Cargando calendario...</p> : null}
      {calendarError ? <p className="campus-parent-mobile__academic-calendar-status is-error">{calendarError}</p> : null}
      <div className="campus-parent-mobile__academic-calendar-weekdays">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="campus-parent-mobile__academic-calendar-grid">
        {calendarCells.map((cell) => {
          if (cell.blank) {
            return <div className="campus-parent-mobile__academic-calendar-day is-blank" key={cell.id} />;
          }
          return (
            <div className={`campus-parent-mobile__academic-calendar-day${cell.isToday ? ' is-today' : ''}`} key={cell.id}>
              <span>{cell.day}</span>
              {cell.items.length ? (
                <div className="campus-parent-mobile__academic-calendar-items">
                  {cell.items.slice(0, 2).map((item) => (
                    <span className={`campus-parent-mobile__academic-calendar-pill is-${item.accent || 'default'}`} key={item.id}>
                      {item.title}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );

  const renderSchedule = () => {
    if (overviewLoading) {
      return <p className="campus-parent-mobile__empty-note">Cargando horario...</p>;
    }
    if (!schedule.length) {
      return <p className="campus-parent-mobile__empty-note">Tu horario aún no está publicado.</p>;
    }

    return (
      <div className="campus-parent-mobile__sheet-list">
        {schedule.map((block) => (
          <article className="campus-parent-mobile__list-card" key={`${block.day}-${block.startTime}-${block.title}`}>
            <strong>{block.dayLabel || block.day}</strong>
            <p>{block.title || block.subject}</p>
            <small>{[block.startTime, block.endTime].filter(Boolean).join(' - ')}</small>
          </article>
        ))}
      </div>
    );
  };

  return (
    <div className="campus-parent-mobile-app">
      <header className="campus-parent-mobile__header">
        <div>
          <span className="campus-parent-mobile__eyebrow">Portal académico</span>
          <h1>{student?.name || user?.name || 'Alumno'}</h1>
          <p>
            {formatEducationalGradeLabel(student?.displayGrade || student?.grade || '')}
            {student?.course ? ` · ${student.course}` : ''}
          </p>
        </div>
        <button className="campus-parent-mobile__finance-pay-button" onClick={onLogout} type="button">Salir</button>
      </header>

      <main className="campus-parent-mobile__content">
        {overviewError ? <p className="campus-parent-mobile__feed-error">{overviewError}</p> : null}

        {activeSection === 'grades' ? (
          <section className="campus-parent-mobile__academic-page">
            <section className="campus-parent-mobile__academic-section">
              <h3>Calificaciones</h3>
              {renderGrades()}
            </section>
          </section>
        ) : null}

        {activeSection === 'attendance' ? (
          <section className="campus-parent-mobile__academic-page">
            <section className="campus-parent-mobile__academic-section">
              <h3>Asistencia</h3>
              {renderAttendance()}
            </section>
          </section>
        ) : null}

        {activeSection === 'calendar' ? (
          <section className="campus-parent-mobile__academic-page">
            <section className="campus-parent-mobile__academic-section">
              <h3>Calendario</h3>
              {renderCalendar()}
            </section>
          </section>
        ) : null}

        {activeSection === 'schedule' ? (
          <section className="campus-parent-mobile__academic-page">
            <section className="campus-parent-mobile__academic-section">
              <h3>Horario</h3>
              {renderSchedule()}
            </section>
          </section>
        ) : null}
      </main>

      <nav aria-label="Navegación del alumno" className="campus-parent-mobile__bottom-nav">
        {studentSections.map((section) => (
          <button
            aria-label={section.label}
            className={`campus-parent-mobile__nav-item${activeSection === section.key ? ' is-active' : ''}`}
            key={section.key}
            onClick={() => setActiveSection(section.key)}
            type="button"
          >
            <strong>{section.label}</strong>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default StudentCampusHome;
