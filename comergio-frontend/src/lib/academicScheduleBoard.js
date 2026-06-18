export const ACADEMIC_SCHEDULE_WEEKDAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

const ALLOWED_DURATIONS = Array.from({ length: 12 }, (_, index) => (index + 1) * 15);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeGradeKey(value) {
  return normalizeText(value);
}

export function academicScheduleTimeToMinutes(value) {
  const normalized = normalizeText(value);
  if (!/^\d{2}:\d{2}$/.test(normalized)) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return (hours * 60) + minutes;
}

function academicScheduleMinutesToTime(totalMinutes) {
  const hours = Math.floor(Number(totalMinutes || 0) / 60);
  const minutes = Number(totalMinutes || 0) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function academicScheduleMinutesToAmPmLabel(totalMinutes) {
  const normalizedMinutes = Number(totalMinutes || 0);
  const hours24 = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  const meridiem = hours24 >= 12 ? 'p.m.' : 'a.m.';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}

function createDefaultDayBlocks() {
  return Array.from({ length: 8 }, (_, index) => ({
    block: index + 1,
    durationMinutes: 60,
    order: (index + 1) * 10,
  }));
}

function buildBlocksFromGroup(group) {
  let runningMinutes = academicScheduleTimeToMinutes(group?.dayStartTime);
  if (runningMinutes === null) runningMinutes = academicScheduleTimeToMinutes('07:00');

  const slots = [];
  (Array.isArray(group?.blocks) ? group.blocks : createDefaultDayBlocks()).forEach((item) => {
    const durationMinutes = Number(item?.durationMinutes || 60);
    const parts = Math.max(1, Math.ceil(durationMinutes / 15));
    for (let index = 0; index < parts; index += 1) {
      const slotStart = runningMinutes;
      const slotEnd = Math.min(runningMinutes + 15, slotStart + durationMinutes - (index * 15));
      runningMinutes = slotEnd;
      const block = slots.length + 1;
      slots.push({
        block,
        startTime: academicScheduleMinutesToTime(slotStart),
        endTime: academicScheduleMinutesToTime(slotEnd),
      });
    }
  });

  return slots;
}

function normalizeScheduleSettings(raw = {}) {
  const groups = Array.isArray(raw?.groups) ? raw.groups : [];
  return groups.map((group, index) => ({
    key: String(group?.key || `schedule_group_${index + 1}`).trim(),
    name: String(group?.name || '').trim() || `Jornada ${index + 1}`,
    weekdays: Array.from(new Set((Array.isArray(group?.weekdays) ? group.weekdays : []).map(Number)))
      .filter((weekday) => ACADEMIC_SCHEDULE_WEEKDAYS.some((item) => item.value === weekday)),
    gradeKeys: Array.from(new Set((Array.isArray(group?.gradeKeys) ? group.gradeKeys : []).map(normalizeGradeKey).filter(Boolean))),
    dayStartTime: String(group?.dayStartTime || '07:00').trim() || '07:00',
    blocks: (Array.isArray(group?.blocks) && group.blocks.length > 0 ? group.blocks : createDefaultDayBlocks())
      .map((item, blockIndex) => ({
        block: blockIndex + 1,
        durationMinutes: ALLOWED_DURATIONS.includes(Number(item?.durationMinutes)) ? Number(item.durationMinutes) : 60,
      })),
    order: Number(group?.order || (index + 1) * 10),
  })).filter((group) => group.weekdays.length > 0);
}

export function buildConfiguredBlocksByWeekday(groups = [], gradeKey = '') {
  const normalizedGradeKey = normalizeGradeKey(gradeKey);
  return ACADEMIC_SCHEDULE_WEEKDAYS.reduce((accumulator, weekday) => {
    const candidates = (Array.isArray(groups) ? groups : []).filter((group) => (
      Array.isArray(group?.weekdays) && group.weekdays.includes(weekday.value)
    ));
    const matchedGroup = normalizedGradeKey
      ? candidates.find((group) => Array.isArray(group?.gradeKeys) && group.gradeKeys.includes(normalizedGradeKey))
      : null;
    const universalGroup = candidates.find((group) => !Array.isArray(group?.gradeKeys) || group.gradeKeys.length === 0);
    const group = matchedGroup || universalGroup || null;
    accumulator[weekday.value] = group
      ? buildBlocksFromGroup(group).map((slot) => ({ ...slot, weekday: weekday.value }))
      : [];
    return accumulator;
  }, {});
}

function resolveBreakClassName(breakLabel = '', breakKey = '') {
  const normalized = String(breakLabel || breakKey || '').trim().toLowerCase();
  if (normalized.includes('guidance')) {
    return 'school-creation-calendar-break school-creation-calendar-break--guidance';
  }
  if (normalized.includes('control')) {
    return 'school-creation-calendar-break school-creation-calendar-break--control';
  }
  if (normalized && normalized !== 'break') {
    return 'school-creation-calendar-break school-creation-calendar-break--other';
  }
  return 'school-creation-calendar-break';
}

export function buildScheduleBoardModel({
  weeklySchedule = [],
  scheduleSettings = {},
  gradeKey = '',
  rowHeight = 24,
}) {
  const groups = normalizeScheduleSettings(scheduleSettings);
  const configuredBlocksByWeekday = buildConfiguredBlocksByWeekday(groups, gradeKey);
  const configuredBlocks = ACADEMIC_SCHEDULE_WEEKDAYS.flatMap((weekday) => configuredBlocksByWeekday[weekday.value] || []);

  const normalizedEntries = (Array.isArray(weeklySchedule) ? weeklySchedule : [])
    .filter((entry) => String(entry?.entryType || 'class') === 'break' || String(entry?.subjectKey || '').trim())
    .map((entry) => ({
      key: String(entry?.key || `d${entry?.weekday}_b${entry?.block}`),
      weekday: Number(entry?.weekday || 0),
      block: Number(entry?.block || 0),
      startTime: String(entry?.startTime || '').trim(),
      endTime: String(entry?.endTime || '').trim(),
      entryType: String(entry?.entryType || 'class').trim() === 'break' ? 'break' : 'class',
      subjectKey: String(entry?.subjectKey || '').trim(),
      breakKey: String(entry?.breakKey || '').trim(),
      breakLabel: String(entry?.breakLabel || '').trim(),
      teacherUserId: String(entry?.teacherUserId || '').trim(),
      title: String(entry?.title || '').trim(),
      secondary: String(entry?.secondary || '').trim(),
      meta: String(entry?.meta || '').trim(),
    }));

  const jornadaMinutes = configuredBlocks.flatMap((entry) => [
    academicScheduleTimeToMinutes(entry.startTime),
    academicScheduleTimeToMinutes(entry.endTime),
  ]).filter((value) => value !== null);

  const entryMinutes = normalizedEntries.flatMap((entry) => [
    academicScheduleTimeToMinutes(entry.startTime),
    academicScheduleTimeToMinutes(entry.endTime),
  ]).filter((value) => value !== null);

  const sourceMinutes = [...jornadaMinutes, ...entryMinutes];
  const start = sourceMinutes.length > 0 ? Math.min(...sourceMinutes) : 7 * 60;
  const end = sourceMinutes.length > 0 ? Math.max(...sourceMinutes) : 15 * 60;
  const roundedStart = Math.max(0, Math.floor(start / 60) * 60);
  const roundedEnd = Math.min(24 * 60, Math.ceil(end / 60) * 60);
  const window = {
    start: roundedStart,
    end: Math.max(roundedStart + 60, roundedEnd),
  };

  const rows = Array.from(
    { length: Math.max(1, Math.ceil((window.end - window.start) / 15) + 1) },
    (_, index) => {
      const minute = window.start + index * 15;
      return {
        minute,
        label: minute % 60 === 0 ? academicScheduleMinutesToAmPmLabel(minute) : '',
        isHour: minute % 60 === 0,
        isHalfHour: minute % 60 === 30,
      };
    }
  );

  const entriesByWeekday = ACADEMIC_SCHEDULE_WEEKDAYS.reduce((accumulator, weekday) => {
    accumulator[weekday.value] = normalizedEntries
      .filter((entry) => Number(entry.weekday) === weekday.value)
      .map((entry) => {
        const startMinutes = academicScheduleTimeToMinutes(entry.startTime) ?? window.start;
        const endMinutes = academicScheduleTimeToMinutes(entry.endTime) ?? (startMinutes + 60);
        const top = ((startMinutes - window.start) / 15) * rowHeight;
        const height = Math.max(rowHeight, ((endMinutes - startMinutes) / 15) * rowHeight);
        const isBreak = entry.entryType === 'break';
        const timeLabel = `${academicScheduleMinutesToAmPmLabel(startMinutes)} - ${academicScheduleMinutesToAmPmLabel(endMinutes)}`;
        const contentLineHeight = 12;
        const verticalPadding = 8;
        const maxLines = Math.max(1, Math.floor((height - verticalPadding) / contentLineHeight));

        return {
          ...entry,
          top,
          height,
          timeLabel,
          className: isBreak ? resolveBreakClassName(entry.breakLabel, entry.breakKey) : 'school-creation-calendar-subject-slot school-creation-schedule-preview-slot',
          showTime: maxLines >= 2,
          showSecondary: !isBreak && maxLines >= 3 && Boolean(entry.secondary),
        };
      })
      .sort((left, right) => {
        const leftStart = academicScheduleTimeToMinutes(left.startTime) ?? 0;
        const rightStart = academicScheduleTimeToMinutes(right.startTime) ?? 0;
        return leftStart - rightStart || Number(left.block || 0) - Number(right.block || 0);
      });
    return accumulator;
  }, {});

  return {
    days: ACADEMIC_SCHEDULE_WEEKDAYS,
    rows,
    rowHeight,
    boardHeight: rows.length * rowHeight,
    window,
    entriesByWeekday,
    configuredBlocksByWeekday,
  };
}
