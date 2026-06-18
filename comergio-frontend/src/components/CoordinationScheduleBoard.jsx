import { useMemo } from 'react';
import { academicScheduleTimeToMinutes, buildScheduleBoardModel } from '../lib/academicScheduleBoard';

function ScheduleEntryBlock({ entry }) {
  const isBreak = entry.entryType === 'break';

  return (
    <div
      className={`coordination-schedule-entry ${entry.className}${isBreak ? ' coordination-schedule-entry--break' : ' coordination-schedule-entry--class'}`}
      key={`coordination-schedule-entry-${entry.key}`}
      style={{ top: entry.top, height: entry.height }}
    >
      <div className="coordination-schedule-entry-body">
        <strong className="coordination-schedule-entry-title" title={entry.title}>
          {entry.title || (isBreak ? 'Break' : 'Materia')}
        </strong>
        {entry.showTime ? (
          <small className="coordination-schedule-entry-line" title={entry.timeLabel}>
            {entry.timeLabel}
          </small>
        ) : null}
        {entry.showSecondary ? (
          <small className="coordination-schedule-entry-line" title={entry.secondary}>
            {entry.secondary}
          </small>
        ) : null}
      </div>
    </div>
  );
}

export default function CoordinationScheduleBoard({
  weeklySchedule = [],
  scheduleSettings = {},
  gradeKey = '',
}) {
  const board = useMemo(() => buildScheduleBoardModel({
    weeklySchedule,
    scheduleSettings,
    gradeKey,
    rowHeight: 24,
  }), [weeklySchedule, scheduleSettings, gradeKey]);

  if (weeklySchedule.length === 0) {
    return <p className="coordination-schedule-empty">Sin horario configurado.</p>;
  }

  return (
    <div className="school-creation-calendar-board-wrap rectoria-schedule-calendar-board-wrap coordination-schedule-board-wrap">
      <div className="school-creation-calendar-times">
        <div className="school-creation-calendar-time-header" />
        {board.rows.map((row) => (
          <div
            className={`school-creation-calendar-time-row${row.isHour ? ' is-hour' : ''}${row.isHalfHour ? ' is-half-hour' : ''}`}
            key={`coordination-schedule-time-${row.minute}`}
            style={{ height: `${board.rowHeight}px` }}
          >
            <span>{row.label}</span>
          </div>
        ))}
      </div>

      <div
        className="school-creation-calendar-board"
        style={{ gridTemplateColumns: `repeat(${board.days.length}, minmax(150px, 1fr))` }}
      >
        {board.days.map((weekday) => (
          <div className="school-creation-calendar-day-column" key={`coordination-schedule-day-${weekday.value}`}>
            <div className="school-creation-calendar-day-header">{weekday.label}</div>
            <div className="school-creation-calendar-day-grid coordination-schedule-day-grid" style={{ height: board.boardHeight }}>
              {board.rows.map((row) => (
                <div
                  className={`school-creation-calendar-cell${row.isHour ? ' is-hour' : ''}${row.isHalfHour ? ' is-half-hour' : ''}`}
                  key={`coordination-schedule-cell-${weekday.value}-${row.minute}`}
                  style={{ height: `${board.rowHeight}px` }}
                />
              ))}

              {(board.configuredBlocksByWeekday[weekday.value] || []).map((slot) => {
                const startMinutes = academicScheduleTimeToMinutes(slot.startTime) ?? board.window.start;
                const endMinutes = academicScheduleTimeToMinutes(slot.endTime) ?? (startMinutes + 60);
                const top = ((startMinutes - board.window.start) / 15) * board.rowHeight;
                const height = Math.max(board.rowHeight, ((endMinutes - startMinutes) / 15) * board.rowHeight);

                return (
                  <div
                    className="rectoria-schedule-enabled-slot"
                    key={`coordination-schedule-enabled-${weekday.value}-${slot.block}`}
                    style={{ top, height }}
                  />
                );
              })}

              {(board.entriesByWeekday[weekday.value] || []).map((entry) => (
                <ScheduleEntryBlock entry={entry} key={`coordination-schedule-entry-${entry.key}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
