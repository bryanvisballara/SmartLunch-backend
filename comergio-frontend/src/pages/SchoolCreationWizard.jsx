import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOGIN_PATH } from '../lib/authNavigation';
import logoOwl from '../assets/logonuevo.png';
import { scheduleLocalStorageJsonSave } from '../lib/nonBlockingStorage';
import { rememberSchoolOptions } from '../lib/schools';
import { completeSchoolCreation } from '../services/schoolCreation.service';
import useAuthStore from '../store/auth.store';
import './SchoolCreationWizard.css';

const DEFAULT_LEVELS = [
  { id: 'preescolar', name: 'Preescolar' },
  { id: 'primaria', name: 'Primaria' },
  { id: 'secundaria', name: 'Secundaria' },
  { id: 'media', name: 'Media' },
];

const DEFAULT_GRADES_BY_LEVEL = {
  preescolar: ['Prejardin', 'Jardin', 'Transicion'],
  primaria: ['1', '2', '3', '4', '5'],
  secundaria: ['6', '7', '8', '9'],
  media: ['10', '11'],
};

const DEFAULT_SUBJECTS = ['Matematicas', 'Lengua', 'Ciencias', 'Sociales', 'Ingles'];

const STAFF_ROLES = [
  { key: 'rectoria', label: 'Rectoría', extra: [] },
  { key: 'direccion', label: 'Dirección', extra: [] },
  { key: 'coordinacion', label: 'Coordinación', extra: ['levels'] },
  { key: 'docencia', label: 'Docencia', extra: ['subjects', 'courses'] },
  { key: 'psicologia', label: 'Psicología', extra: ['levels'] },
  { key: 'enfermeria', label: 'Enfermería', extra: ['levels'] },
  { key: 'secretaria', label: 'Secretaría Académica', extra: [] },
  { key: 'cartera', label: 'Cartera', extra: [] },
  { key: 'recursosHumanos', label: 'Recursos y gestion de compras', extra: [] },
  { key: 'rutas', label: 'Rutas Escolares', extra: [] },
];

const WEEK_DAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

const DEFAULT_TEACHING_SCHEDULE_PRESETS = {
  completa: {
    startTime: '07:00',
    endTime: '15:00',
    workDays: ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'],
  },
  'medio-tiempo': {
    startTime: '07:00',
    endTime: '12:00',
    workDays: ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'],
  },
  semanal: {
    startTime: '07:00',
    endTime: '09:00',
    workDays: [],
  },
};

const EMPTY_TEACHING_SCHEDULE_PRESETS = {
  completa: {
    startTime: '',
    endTime: '',
    workDays: [],
  },
  'medio-tiempo': {
    startTime: '',
    endTime: '',
    workDays: [],
  },
  semanal: {
    startTime: '',
    endTime: '',
    workDays: [],
  },
};

const ACADEMIC_SCHEDULE_STEPS = [
  'Configuración de jornada',
  'Definición de bloques',
  'Breaks',
  'Guidance Routine',
  'Control',
  'Máximo de bloques juntos',
  'Asignaturas predeterminadas por horario',
  'Generar horario por cursos',
  'Revisión y edición',
];

const HIDDEN_BLOCK_CONFIGURATION_STEPS = new Set();
const SCHEDULE_SOLVER_MAX_NODES = 60000;
const SCHEDULE_SOLVER_RECALCULATE_COURSE_MAX_NODES = 18000;

const DEFAULT_FINANCIAL_CALENDAR = {
  enrollmentStartDate: '',
  lateEnrollmentSurchargePercent: '',
};

const DEFAULT_ECONOMIC_BENEFIT = {
  name: 'Pronto pago',
  type: 'discount',
  value: '',
  appliesTo: 'tuition',
  promptPaymentDayLimit: '10',
  description: 'Aplica sobre pensiones pagadas dentro de los primeros 10 días del mes.',
};

const FINANCIAL_COST_FIELDS = [
  { key: 'bond', label: 'Bono', optional: true },
  { key: 'enrollment', label: 'Matrícula', optional: false },
  { key: 'tuition', label: 'Pensión', optional: false },
];

function makeDefaultEconomicBenefit(index = 1) {
  return {
    id: `benefit-${Date.now()}-${index}`,
    ...DEFAULT_ECONOMIC_BENEFIT,
  };
}

function isNonNegativeNumericInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  const numericValue = Number(text);
  return Number.isFinite(numericValue) && numericValue >= 0;
}

function isPromptPaymentBenefit(benefit) {
  const text = String(benefit?.name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return text.includes('pronto pago');
}

function hasValidPromptPaymentRule(benefit) {
  if (!isPromptPaymentBenefit(benefit)) return true;
  const dayLimit = Number(String(benefit?.promptPaymentDayLimit || '').trim());
  return Number.isInteger(dayLimit) && dayLimit >= 1 && dayLimit <= 31;
}

function minutesToAmPmLabel(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '--:--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function minutesToClockLabel(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '--:--';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function blocksToLabel(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '0 bloques';

  const roundedValue = Math.round(numericValue);
  const unit = Math.abs(roundedValue) === 1 ? 'bloque' : 'bloques';
  return `${roundedValue} ${unit}`;
}

function formatMinutesAsHours(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 h';

  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours} h ${remainingMinutes} min`;
  }

  if (hours > 0) {
    return `${hours} h`;
  }

  return `${remainingMinutes} min`;
}

function minutesToHoursLabel(minutes) {
  return formatMinutesAsHours(minutes);
}

function formatClassBlockMix(blockGroups = [], emptyLabel = 'Sin bloques definidos') {
  if (!Array.isArray(blockGroups) || blockGroups.length === 0) return emptyLabel;

  return blockGroups
    .map((group) => `${group.count} bloque${group.count === 1 ? '' : 's'} de ${group.minutes} min`)
    .join(' + ');
}

function getSortedBlockGroupsFromMap(blockGroupsMap = {}) {
  return Object.entries(blockGroupsMap)
    .map(([minutes, count]) => ({ minutes: Number(minutes), count: Number(count) }))
    .filter((group) => Number.isFinite(group.minutes) && group.minutes > 0 && Number.isFinite(group.count) && group.count !== 0)
    .sort((left, right) => right.minutes - left.minutes);
}

function getRemainingBlockGroups(availableGroups = [], assignedGroups = []) {
  const byMinutes = {};

  availableGroups.forEach((group) => {
    byMinutes[group.minutes] = (byMinutes[group.minutes] || 0) + group.count;
  });

  assignedGroups.forEach((group) => {
    byMinutes[group.minutes] = (byMinutes[group.minutes] || 0) - group.count;
  });

  return getSortedBlockGroupsFromMap(byMinutes);
}

function formatRemainingClassBlockMix(blockGroups = []) {
  if (!Array.isArray(blockGroups) || blockGroups.length === 0) return 'Cuadrado';

  const missingGroups = blockGroups.filter((group) => group.count > 0);
  const extraGroups = blockGroups
    .filter((group) => group.count < 0)
    .map((group) => ({ ...group, count: Math.abs(group.count) }));

  if (missingGroups.length > 0 && extraGroups.length > 0) {
    return `Faltan ${formatClassBlockMix(missingGroups)} y sobran ${formatClassBlockMix(extraGroups)}`;
  }

  if (missingGroups.length > 0) {
    return `Faltan ${formatClassBlockMix(missingGroups)}`;
  }

  return `Sobran ${formatClassBlockMix(extraGroups)}`;
}

function getMinutesFromBlockSelectionValue(value) {
  const normalized = String(value || '').trim();
  const numericValue = Number(normalized);
  if (Number.isFinite(numericValue) && numericValue > 0) return numericValue;

  const matchedMinutes = normalized.match(/(\d+)/);
  if (!matchedMinutes) return null;

  const parsedMinutes = Number(matchedMinutes[1]);
  return Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? parsedMinutes : null;
}

function timeToMinutes(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    return null;
  }

  const [hours, minutes] = normalized.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return (hours * 60) + minutes;
}

function getSchedulePreviewWindow(items, fallbackStartMin = 7 * 60, fallbackEndMin = 17 * 60) {
  const validItems = (items || []).filter(
    (item) => Number.isFinite(item.startMin) && Number.isFinite(item.endMin) && item.endMin > item.startMin,
  );

  if (!validItems.length) {
    return { startMin: fallbackStartMin, endMin: fallbackEndMin };
  }

  const minStart = Math.min(...validItems.map((item) => item.startMin));
  const maxEnd = Math.max(...validItems.map((item) => item.endMin));
  const startMin = Math.max(0, Math.floor(minStart / 60) * 60);
  const endMin = Math.max(startMin + 60, Math.ceil(maxEnd / 60) * 60);

  return { startMin, endMin };
}

function distributeBlocksAcrossCourses(totalBlocks, courseCount, courseIndex) {
  if (!Number.isFinite(totalBlocks) || totalBlocks <= 0) return 0;
  if (!Number.isFinite(courseCount) || courseCount <= 1) return totalBlocks;

  const safeIndex = Number.isFinite(courseIndex) ? courseIndex : 0;
  const baseBlocks = Math.floor(totalBlocks / courseCount);
  const remainder = totalBlocks % courseCount;
  return baseBlocks + (safeIndex < remainder ? 1 : 0);
}

function makeDefaultMember() {
  return {
    name: '',
    email: '',
    password: '',
    phone: '',
    levels: [],
    jornada: '',
    workDays: [],
    weeklyDay: '',
    startTime: '',
    endTime: '',
    blockedSlots: [],
    subjects: [],
    courses: [],
  };
}

function makeDefaultRole() {
  return { skip: false, members: [makeDefaultMember()] };
}

function makeDefaultScheduleShift(index = 1) {
  return {
    name: `Jornada ${index}`,
    days: [],
    startTime: '',
    endTime: '',
    gradeKeys: [],
  };
}

function makeDefaultScheduleBlock(index = 1) {
  return {
    name: `Bloque ${index}`,
    type: 'clase',
    minutes: '45',
    gradeKeys: [],
  };
}

function makeDefaultSubjectLoad(subject = '') {
  return {
    subject,
    blockName: '',
    weeklyBlocks: '',
    weeklyHours: '',
    gradeKeys: [],
  };
}

function makeDefaultClassSpace(index = 1) {
  return {
    name: `Clase general ${index}`,
    days: [],
    startTime: '',
    endTime: '',
    gradeKeys: [],
  };
}

function makeDefaultBreak(index = 1) {
  return {
    name: `Break ${index}`,
    days: [],
    startTime: '',
    endTime: '',
    gradeKeys: [],
  };
}

function makeDefaultGuidanceRoutine(index = 1) {
  return {
    name: `Guidance Routine ${index}`,
    days: [],
    startTime: '',
    endTime: '',
    gradeKeys: [],
  };
}

function makeDefaultControl(index = 1) {
  return {
    name: `Control ${index}`,
    days: [],
    startTime: '',
    endTime: '',
    gradeKeys: [],
  };
}

function makeDefaultSports(index = 1) {
  return {
    name: `Deportes ${index}`,
    days: [],
    startTime: '',
    endTime: '',
    gradeKeys: [],
  };
}

function makeDefaultOtherBlock(index = 1) {
  return {
    name: `Otro ${index}`,
    days: [],
    startTime: '',
    endTime: '',
    gradeKeys: [],
  };
}

function makeDefaultTeacherBlockedSlot(index = 1) {
  return {
    id: `teacher-block-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Bloqueo ${index}`,
    days: [],
    startTime: '',
    endTime: '',
  };
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function getPlannerEntryDisplayLabel(type, entryName, fallbackLabel) {
  const normalizedName = String(entryName || '').trim();
  if (!normalizedName) return fallbackLabel;

  const defaultLabelByType = {
    clase: 'Clase general',
    break: 'Break',
    guidance: 'Guidance Routine',
    control: 'Control',
    sports: 'Deportes',
  };

  const defaultLabel = defaultLabelByType[type];
  if (!defaultLabel) return normalizedName;

  return new RegExp(`^${defaultLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\d+$`, 'i').test(normalizedName)
    ? defaultLabel
    : normalizedName;
}

function extractSubjectFromCoverageIssue(issue, knownSubjects = []) {
  const text = String(issue || '').trim();
  if (!text) return '';

  const fromCoverageGap = text.match(/para\s+(.+?)\s+en\s+/i);
  if (fromCoverageGap?.[1]) {
    const candidate = fromCoverageGap[1].trim();
    const known = knownSubjects.find((subject) => String(subject).toLowerCase() === candidate.toLowerCase());
    return known || candidate;
  }

  const fromLeadingLabel = text.match(/^([^:]+):/);
  if (fromLeadingLabel?.[1]) {
    const candidate = fromLeadingLabel[1].trim();
    const known = knownSubjects.find((subject) => String(subject).toLowerCase() === candidate.toLowerCase());
    return known || candidate;
  }

  const lowerText = text.toLowerCase();
  return knownSubjects.find((subject) => lowerText.includes(String(subject).toLowerCase())) || '';
}

function extractSubjectsFromSchedulingConflict(issue, knownSubjects = []) {
  const text = String(issue || '').trim();
  if (!text) return [];

  const matchedSubjects = knownSubjects.filter((subject) =>
    text.toLowerCase().includes(String(subject).toLowerCase()),
  );
  if (matchedSubjects.length > 0) {
    return [...new Set(matchedSubjects)];
  }

  const extractedSubject = extractSubjectFromCoverageIssue(text, knownSubjects);
  return extractedSubject ? [extractedSubject] : [];
}

function isTeacherAssignable(member) {
  const hasIdentity = String(member?.name || '').trim().length > 0;
  const hasSchedule = Object.keys(getTeacherAvailabilityByDay(member)).length > 0;
  const hasSubjects = (member?.subjects || []).length > 0;
  const hasCourses = (member?.courses || []).length > 0;

  return hasIdentity && hasSchedule && hasSubjects && hasCourses;
}

function normalizeSubjectLoad(load, fallbackSubject = '') {
  return {
    subject: load?.subject || fallbackSubject,
    blockName: String(load?.blockName || ''),
    weeklyBlocks: String(load?.weeklyBlocks ?? ''),
    weeklyHours: String(load?.weeklyHours ?? ''),
    gradeKeys: Array.isArray(load?.gradeKeys) ? load.gradeKeys : [],
  };
}

function getLoadWeeklyBlocks(load, classBlockMinutes) {
  const directBlocks = Number(load?.weeklyBlocks);
  if (Number.isFinite(directBlocks) && directBlocks > 0) {
    return Math.max(1, Math.round(directBlocks));
  }

  const legacyHours = Number(load?.weeklyHours);
  if (Number.isFinite(legacyHours) && legacyHours > 0 && Number.isFinite(classBlockMinutes) && classBlockMinutes > 0) {
    return Math.max(1, Math.ceil((legacyHours * 60) / classBlockMinutes));
  }

  return 0;
}

function getLoadWeeklyMinutes(load, classBlockMinutes) {
  const blocks = getLoadWeeklyBlocks(load, classBlockMinutes);
  if (blocks <= 0 || !Number.isFinite(classBlockMinutes) || classBlockMinutes <= 0) return 0;
  return blocks * classBlockMinutes;
}

function mergeTimeIntervals(intervals) {
  const sorted = [...(intervals || [])]
    .filter((entry) => Number.isFinite(entry.startMin) && Number.isFinite(entry.endMin) && entry.endMin > entry.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const merged = [];
  sorted.forEach((entry) => {
    const last = merged[merged.length - 1];
    if (!last || entry.startMin > last.endMin) {
      merged.push({ ...entry });
      return;
    }
    last.endMin = Math.max(last.endMin, entry.endMin);
  });

  return merged;
}

function normalizeDiscreteTimeIntervals(intervals) {
  return [...(intervals || [])]
    .filter((entry) => Number.isFinite(entry.startMin) && Number.isFinite(entry.endMin) && entry.endMin > entry.startMin)
    .sort((a, b) => {
      if (a.startMin !== b.startMin) return a.startMin - b.startMin;
      return a.endMin - b.endMin;
    });
}

function subtractTimeIntervals(baseIntervals, blockedIntervals) {
  const free = [];
  const mergedBlocked = mergeTimeIntervals(blockedIntervals);

  (baseIntervals || []).forEach((base) => {
    let cursor = base.startMin;
    mergedBlocked.forEach((blocked) => {
      if (blocked.endMin <= base.startMin || blocked.startMin >= base.endMin) return;
      if (blocked.startMin > cursor) {
        free.push({ startMin: cursor, endMin: Math.min(blocked.startMin, base.endMin) });
      }
      cursor = Math.max(cursor, blocked.endMin);
    });
    if (cursor < base.endMin) {
      free.push({ startMin: cursor, endMin: base.endMin });
    }
  });

  return free.filter((entry) => entry.endMin > entry.startMin);
}

function getTeacherBlockedIntervalsByDay(member) {
  const byDay = {};

  (member?.blockedSlots || []).forEach((slot) => {
    const startMin = timeToMinutes(slot?.startTime);
    const endMin = timeToMinutes(slot?.endTime);
    if (startMin === null || endMin === null || endMin <= startMin) return;

    (slot?.days || []).forEach((day) => {
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push({ startMin, endMin });
    });
  });

  Object.keys(byDay).forEach((day) => {
    byDay[day] = mergeTimeIntervals(byDay[day]);
  });

  return byDay;
}

function getTeacherAvailabilityByDay(member) {
  const startMin = timeToMinutes(member?.startTime);
  const endMin = timeToMinutes(member?.endTime);
  if (startMin === null || endMin === null || endMin <= startMin) return {};

  const days = member?.jornada === 'semanal'
    ? (member?.weeklyDay ? [member.weeklyDay] : [])
    : (member?.workDays || []);
  if (!days.length) return {};

  const blockedByDay = getTeacherBlockedIntervalsByDay(member);

  return days.reduce((acc, day) => {
    const availableIntervals = subtractTimeIntervals([{ startMin, endMin }], blockedByDay[day] || []);
    if (availableIntervals.length > 0) {
      acc[day] = availableIntervals;
    }
    return acc;
  }, {});
}

function getTeacherWeeklyAvailableMinutes(member) {
  return Object.values(getTeacherAvailabilityByDay(member)).reduce(
    (acc, intervals) => acc + intervals.reduce((sum, interval) => sum + (interval.endMin - interval.startMin), 0),
    0,
  );
}

function intersectTimeIntervals(intervalGroups) {
  if (!Array.isArray(intervalGroups) || intervalGroups.length === 0) return [];

  let result = mergeTimeIntervals(intervalGroups[0] || []);
  for (let groupIndex = 1; groupIndex < intervalGroups.length; groupIndex += 1) {
    const nextGroup = mergeTimeIntervals(intervalGroups[groupIndex] || []);
    const nextResult = [];

    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < result.length && rightIndex < nextGroup.length) {
      const left = result[leftIndex];
      const right = nextGroup[rightIndex];
      const startMin = Math.max(left.startMin, right.startMin);
      const endMin = Math.min(left.endMin, right.endMin);

      if (endMin > startMin) {
        nextResult.push({ startMin, endMin });
      }

      if (left.endMin < right.endMin) {
        leftIndex += 1;
      } else {
        rightIndex += 1;
      }
    }

    result = nextResult;
    if (result.length === 0) break;
  }

  return result;
}

function splitIntervalIntoSlots(interval, slotMinutes) {
  if (!Number.isFinite(slotMinutes) || slotMinutes <= 0) return [];
  if (!Number.isFinite(interval?.startMin) || !Number.isFinite(interval?.endMin) || interval.endMin <= interval.startMin) return [];

  const slots = [];
  const fullSlotCount = Math.floor((interval.endMin - interval.startMin) / slotMinutes);
  for (let slotIndex = 0; slotIndex < fullSlotCount; slotIndex += 1) {
    const startMin = interval.startMin + (slotIndex * slotMinutes);
    slots.push({
      startMin,
      endMin: startMin + slotMinutes,
    });
  }

  return slots;
}

function getIntervalDuration(interval) {
  if (!Number.isFinite(interval?.startMin) || !Number.isFinite(interval?.endMin) || interval.endMin <= interval.startMin) {
    return 0;
  }

  return interval.endMin - interval.startMin;
}

function selectPackableWeeklySlots(slots) {
  const slotsByDay = {};

  (slots || []).forEach((slot) => {
    if (!slot?.day) return;
    if (!Number.isFinite(slot.startMin) || !Number.isFinite(slot.endMin) || slot.endMin <= slot.startMin) return;
    if (!slotsByDay[slot.day]) slotsByDay[slot.day] = [];
    slotsByDay[slot.day].push(slot);
  });

  return Object.entries(slotsByDay)
    .sort(([leftDay], [rightDay]) => {
      const leftIndex = WEEK_DAYS.indexOf(leftDay);
      const rightIndex = WEEK_DAYS.indexOf(rightDay);
      if (leftIndex === rightIndex) return leftDay.localeCompare(rightDay, 'es');
      if (leftIndex < 0) return 1;
      if (rightIndex < 0) return -1;
      return leftIndex - rightIndex;
    })
    .flatMap(([, daySlots]) => {
      const selected = [];
      let lastEndMin = -1;

      [...daySlots]
        .sort((left, right) => {
          if (left.endMin !== right.endMin) return left.endMin - right.endMin;
          if (left.startMin !== right.startMin) return left.startMin - right.startMin;
          return getIntervalDuration(left) - getIntervalDuration(right);
        })
        .forEach((slot) => {
          if (slot.startMin < lastEndMin) return;
          selected.push(slot);
          lastEndMin = slot.endMin;
        });

      return selected.sort((left, right) => {
        if (left.startMin !== right.startMin) return left.startMin - right.startMin;
        return left.endMin - right.endMin;
      });
    });
}

function buildTeacherGradeConnectivityComponents(teacherEntries, allGradeKeys) {
  const teacherMap = new Map(
    (teacherEntries || []).map((entry) => [entry.teacherKey, {
      ...entry,
      gradeKeys: [...new Set(entry.gradeKeys || [])],
    }]),
  );
  const gradeToTeacherKeys = new Map();

  teacherMap.forEach((entry, teacherKey) => {
    (entry.gradeKeys || []).forEach((gradeKey) => {
      if (!gradeToTeacherKeys.has(gradeKey)) gradeToTeacherKeys.set(gradeKey, new Set());
      gradeToTeacherKeys.get(gradeKey).add(teacherKey);
    });
  });

  const queue = [];
  const visitedTeachers = new Set();
  const visitedGrades = new Set();
  const components = [];

  teacherMap.forEach((entry, teacherKey) => {
    if (visitedTeachers.has(teacherKey)) return;
    queue.push({ type: 'teacher', key: teacherKey });

    const componentTeacherKeys = new Set();
    const componentGradeKeys = new Set();

    while (queue.length > 0) {
      const current = queue.shift();

      if (current.type === 'teacher') {
        if (visitedTeachers.has(current.key)) continue;
        visitedTeachers.add(current.key);
        componentTeacherKeys.add(current.key);

        const currentTeacher = teacherMap.get(current.key);
        (currentTeacher?.gradeKeys || []).forEach((gradeKey) => {
          if (!visitedGrades.has(gradeKey)) queue.push({ type: 'grade', key: gradeKey });
        });
        continue;
      }

      if (visitedGrades.has(current.key)) continue;
      visitedGrades.add(current.key);
      componentGradeKeys.add(current.key);

      (gradeToTeacherKeys.get(current.key) || []).forEach((teacherKey) => {
        if (!visitedTeachers.has(teacherKey)) queue.push({ type: 'teacher', key: teacherKey });
      });
    }

    components.push({
      teacherKeys: [...componentTeacherKeys],
      gradeKeys: [...componentGradeKeys],
    });
  });

  [...new Set(allGradeKeys || [])].forEach((gradeKey) => {
    if (visitedGrades.has(gradeKey)) return;
    visitedGrades.add(gradeKey);
    components.push({ teacherKeys: [], gradeKeys: [gradeKey] });
  });

  return components.filter((component) => component.teacherKeys.length > 0 || component.gradeKeys.length > 0);
}

const LEGACY_WIZARD_STORAGE_KEYS = ['comergio_school_wizard_v1', 'comergio_school_wizard_v2'];
const WIZARD_STORAGE_KEY = 'comergio_school_wizard_v3';
const WIZARD_RESET_SIGNAL_KEY = 'comergio_school_wizard_reset_signal';
const CALENDAR_WEEKLY_OPTION = '__weekly__';
const PLANNER_DRAG_TYPE_MIME = 'application/x-comergio-planner-type';
const PLANNER_DRAG_NAME_MIME = 'application/x-comergio-planner-name';
const PLANNER_DRAG_SLOT_MIME = 'application/x-comergio-planner-slot';

let cachedWizardStateLoaded = false;
let cachedWizardState = null;

function sanitizeWizardState(state) {
  if (!state || typeof state !== 'object') return null;

  const nextState = { ...state };
  delete nextState.generatedCourseSchedules;
  delete nextState.generatedTeacherSchedules;
  delete nextState.scheduleReviewConfirmed;
  return nextState;
}

function loadWizardState() {
  if (cachedWizardStateLoaded) {
    return cachedWizardState;
  }

  try {
    LEGACY_WIZARD_STORAGE_KEYS.forEach((legacyKey) => {
      localStorage.removeItem(legacyKey);
    });
    const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
    cachedWizardState = raw ? sanitizeWizardState(JSON.parse(raw)) : null;
  } catch {
    cachedWizardState = null;
  }

  cachedWizardStateLoaded = true;
  return cachedWizardState;
}

function scheduleWizardStateSave(state) {
  return scheduleLocalStorageJsonSave(
    WIZARD_STORAGE_KEY,
    () => {
      LEGACY_WIZARD_STORAGE_KEYS.forEach((legacyKey) => {
        localStorage.removeItem(legacyKey);
      });
      return state;
    },
    {
      timeout: 1200,
      onSaved: (savedState) => {
        cachedWizardState = sanitizeWizardState(savedState);
        cachedWizardStateLoaded = true;
      },
    },
  );
}

function getStoredPlannerOtherBlockNames() {
  const storedState = loadWizardState();
  const storedNames = Array.isArray(storedState?.plannerOtherBlockNames)
    ? storedState.plannerOtherBlockNames
    : [];

  const normalizedNames = storedNames
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .filter((name, index, names) => names.findIndex((item) => normalizeKey(item) === normalizeKey(name)) === index);

  if (normalizedNames.length > 0) {
    return normalizedNames;
  }

  const legacyName = String(storedState?.plannerOtherBlockName || '').trim();
  return legacyName ? [legacyName] : [];
}

function isEditableElement(element) {
  if (!element) return false;

  const tagName = String(element.tagName || '').toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || Boolean(element.isContentEditable);
}

function SchoolCreationWizard() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [step, setStep] = useState(() => loadWizardState()?.step ?? 0);
  const [direction, setDirection] = useState('forward');

  const [schoolName, setSchoolName] = useState(() => loadWizardState()?.schoolName ?? '');

  const [availableLevels, setAvailableLevels] = useState(() => loadWizardState()?.availableLevels ?? []);
  const [selectedLevelIds, setSelectedLevelIds] = useState(() => loadWizardState()?.selectedLevelIds ?? []);
  const [customLevelInput, setCustomLevelInput] = useState('');

  const [gradesByLevel, setGradesByLevel] = useState(() => loadWizardState()?.gradesByLevel ?? {});
  const [gradeInputByLevel, setGradeInputByLevel] = useState({});

  const [coursesByGrade, setCoursesByGrade] = useState(() => loadWizardState()?.coursesByGrade ?? {});
  const [courseInputByGrade, setCourseInputByGrade] = useState({});
  const [singleCourseGrades, setSingleCourseGrades] = useState(() => loadWizardState()?.singleCourseGrades ?? {});

  const [staffByRole, setStaffByRole] = useState(
    () => loadWizardState()?.staffByRole ?? Object.fromEntries(STAFF_ROLES.map((r) => [r.key, makeDefaultRole()])),
  );
  const [teachingSchedulePresets, setTeachingSchedulePresets] = useState(
    () => loadWizardState()?.teachingSchedulePresets ?? EMPTY_TEACHING_SCHEDULE_PRESETS,
  );
  const [transitionProgress, setTransitionProgress] = useState(0);

  const [scheduleShifts, setScheduleShifts] = useState(() => loadWizardState()?.scheduleShifts ?? []);
  const [scheduleBlocks, setScheduleBlocks] = useState(() => loadWizardState()?.scheduleBlocks ?? []);
  const [scheduleClassSlots, setScheduleClassSlots] = useState(() => loadWizardState()?.scheduleClassSlots ?? []);
  const [scheduleBreaks, setScheduleBreaks] = useState(() => loadWizardState()?.scheduleBreaks ?? []);
  const [scheduleGuidanceRoutines, setScheduleGuidanceRoutines] = useState(() => loadWizardState()?.scheduleGuidanceRoutines ?? []);
  const [scheduleControl, setScheduleControl] = useState(() => loadWizardState()?.scheduleControl ?? []);
  const [scheduleSports, setScheduleSports] = useState(() => loadWizardState()?.scheduleSports ?? []);
  const [scheduleOtherBlocks, setScheduleOtherBlocks] = useState(() => loadWizardState()?.scheduleOtherBlocks ?? []);
  const [subjectLoads, setSubjectLoads] = useState(() => {
    const storedLoads = loadWizardState()?.subjectLoads;
    if (Array.isArray(storedLoads) && storedLoads.length > 0) {
      return storedLoads.map((load) => normalizeSubjectLoad(load, ''));
    }
    return [];
  });
  const [maxConsecutiveBySubject, setMaxConsecutiveBySubject] = useState(() => loadWizardState()?.maxConsecutiveBySubject ?? {});
  const [maxBlocksPreset, setMaxBlocksPreset] = useState(
    () => loadWizardState()?.maxBlocksPreset ?? { value: '', apply: false },
  );
  const [globalPinnedSubjectRules, setGlobalPinnedSubjectRules] = useState(
    () => loadWizardState()?.globalPinnedSubjectRules ?? [],
  );
  const [fixedSubjectSlots, setFixedSubjectSlots] = useState(() => loadWizardState()?.fixedSubjectSlots ?? []);
  const [calendarShiftName, setCalendarShiftName] = useState(() => loadWizardState()?.calendarShiftName ?? '');
  const [calendarGradeKey, setCalendarGradeKey] = useState(() => loadWizardState()?.calendarGradeKey ?? '');
  const [dragSubject, setDragSubject] = useState('');
  const [draggingSlotId, setDraggingSlotId] = useState(null);
  const [calendarWarning, setCalendarWarning] = useState('');
  const [resizingSlot, setResizingSlot] = useState(null);
  const [generatedCourseSchedules, setGeneratedCourseSchedules] = useState({});
  const [selectedCourseScheduleKey, setSelectedCourseScheduleKey] = useState('');
  const [selectedTeacherScheduleKey, setSelectedTeacherScheduleKey] = useState('');
  const [scheduleGenerationLevelId, setScheduleGenerationLevelId] = useState(
    () => loadWizardState()?.scheduleGenerationLevelId ?? '',
  );
  const [scheduleReviewConfirmed, setScheduleReviewConfirmed] = useState(false);
  const [generatedTeacherSchedules, setGeneratedTeacherSchedules] = useState({});
  const [courseGenerationModal, setCourseGenerationModal] = useState(null);
  const [courseGenerationWarning, setCourseGenerationWarning] = useState('');
  const [docenciaCoverageFilterSubject, setDocenciaCoverageFilterSubject] = useState('');
  const [loadPreviewFilterGradeKey, setLoadPreviewFilterGradeKey] = useState('');
  const [expandedTeacherSubjectPickers, setExpandedTeacherSubjectPickers] = useState({});
  const [blockPlannerLevelId, setBlockPlannerLevelId] = useState(() => loadWizardState()?.blockPlannerLevelId ?? '');
  const [dragPlannerType, setDragPlannerType] = useState('');
  const [draggingPlannerSlot, setDraggingPlannerSlot] = useState(null);
  const [blockPlannerWarning, setBlockPlannerWarning] = useState('');
  const [resizingPlannerSlot, setResizingPlannerSlot] = useState(null);
  const [selectedPlannerSlot, setSelectedPlannerSlot] = useState(null);
  const [copiedPlannerSlot, setCopiedPlannerSlot] = useState(null);
  const [plannerSelectedGradeKeys, setPlannerSelectedGradeKeys] = useState(() => loadWizardState()?.plannerSelectedGradeKeys ?? []);
  const [plannerOtherBlockNames, setPlannerOtherBlockNames] = useState(() => getStoredPlannerOtherBlockNames());
  const [plannerOtherBlockName, setPlannerOtherBlockName] = useState(() => {
    const storedState = loadWizardState();
    const storedName = String(storedState?.plannerOtherBlockName || '').trim();
    if (storedName) return storedName;

    const storedNames = getStoredPlannerOtherBlockNames();
    return storedNames[0] || '';
  });
  const [otherBlockModalOpen, setOtherBlockModalOpen] = useState(false);
  const [otherBlockNameDraft, setOtherBlockNameDraft] = useState('');
  const [plannerTimeModal, setPlannerTimeModal] = useState(null);

  const [subjects, setSubjects] = useState(() => loadWizardState()?.subjects ?? []);
  const [subjectInput, setSubjectInput] = useState('');

  const [subjectMapByGrade, setSubjectMapByGrade] = useState(() => loadWizardState()?.subjectMapByGrade ?? {});

  const [periods, setPeriods] = useState(() => loadWizardState()?.periods ?? []);
  const [financialCalendar, setFinancialCalendar] = useState(
    () => loadWizardState()?.financialCalendar ?? DEFAULT_FINANCIAL_CALENDAR,
  );
  const [financialCostsByGrade, setFinancialCostsByGrade] = useState(
    () => loadWizardState()?.financialCostsByGrade ?? {},
  );
  const [economicBenefits, setEconomicBenefits] = useState(
    () => loadWizardState()?.economicBenefits ?? [],
  );
  const [isCompletingSchoolCreation, setIsCompletingSchoolCreation] = useState(false);
  const [schoolCreationSubmitError, setSchoolCreationSubmitError] = useState('');

  useEffect(() => {
    return scheduleWizardStateSave({
      step,
      schoolName,
      availableLevels,
      selectedLevelIds,
      gradesByLevel,
      coursesByGrade,
      singleCourseGrades,
      staffByRole,
      teachingSchedulePresets,
      scheduleShifts,
      scheduleBlocks,
      scheduleClassSlots,
      scheduleBreaks,
      scheduleGuidanceRoutines,
      scheduleControl,
      scheduleSports,
      scheduleOtherBlocks,
      subjectLoads,
      maxConsecutiveBySubject,
      maxBlocksPreset,
      globalPinnedSubjectRules,
      fixedSubjectSlots,
      calendarShiftName,
      calendarGradeKey,
      blockPlannerLevelId,
      plannerSelectedGradeKeys,
      plannerOtherBlockNames,
      plannerOtherBlockName,
      scheduleGenerationLevelId,
      subjects,
      subjectMapByGrade,
      periods,
      financialCalendar,
      financialCostsByGrade,
      economicBenefits,
    });
  }, [
    step, schoolName, availableLevels, selectedLevelIds, gradesByLevel,
    coursesByGrade, singleCourseGrades, staffByRole, teachingSchedulePresets, scheduleShifts,
    scheduleBlocks, scheduleClassSlots, scheduleBreaks, scheduleGuidanceRoutines, scheduleControl, scheduleSports, scheduleOtherBlocks,
    subjectLoads, maxConsecutiveBySubject, maxBlocksPreset, globalPinnedSubjectRules, fixedSubjectSlots, calendarShiftName,
    calendarGradeKey, blockPlannerLevelId, plannerSelectedGradeKeys, plannerOtherBlockNames, plannerOtherBlockName, scheduleGenerationLevelId,
    subjects, subjectMapByGrade, periods, financialCalendar, financialCostsByGrade, economicBenefits,
  ]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== WIZARD_RESET_SIGNAL_KEY) return;

      setDirection('forward');
      setStep(0);
      setSchoolName('');
      setAvailableLevels([]);
      setSelectedLevelIds([]);
      setCustomLevelInput('');
      setGradesByLevel({});
      setGradeInputByLevel({});
      setCoursesByGrade({});
      setCourseInputByGrade({});
      setSingleCourseGrades({});
      setSubjects([]);
      setSubjectInput('');
      setSubjectMapByGrade({});
      setPeriods([]);
      setFinancialCalendar(DEFAULT_FINANCIAL_CALENDAR);
      setFinancialCostsByGrade({});
      setEconomicBenefits([]);
      setStaffByRole(Object.fromEntries(STAFF_ROLES.map((r) => [r.key, makeDefaultRole()])));
      setTeachingSchedulePresets(EMPTY_TEACHING_SCHEDULE_PRESETS);
      setScheduleShifts([]);
      setScheduleBlocks([]);
      setScheduleClassSlots([]);
      setScheduleBreaks([]);
      setScheduleGuidanceRoutines([]);
      setScheduleControl([]);
      setScheduleSports([]);
      setScheduleOtherBlocks([]);
      setSubjectLoads([]);
      setMaxConsecutiveBySubject({});
      setMaxBlocksPreset({ value: '', apply: false });
      setGlobalPinnedSubjectRules([]);
      setFixedSubjectSlots([]);
      setCalendarShiftName('');
      setCalendarGradeKey('');
      setBlockPlannerLevelId('');
      setDragPlannerType('');
      setDraggingPlannerSlot(null);
      setBlockPlannerWarning('');
      setResizingPlannerSlot(null);
      setPlannerSelectedGradeKeys([]);
      setPlannerOtherBlockNames([]);
      setPlannerOtherBlockName('');
      setOtherBlockModalOpen(false);
      setOtherBlockNameDraft('');
      setDragSubject('');
      setCalendarWarning('');
      setResizingSlot(null);
      setGeneratedCourseSchedules({});
      setSelectedCourseScheduleKey('');
      setScheduleReviewConfirmed(false);
      setGeneratedTeacherSchedules({});
      setTransitionProgress(0);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (!maxBlocksPreset.apply) return;
    const presetValue = String(maxBlocksPreset.value || '').trim();
    if (!presetValue) return;

    setMaxConsecutiveBySubject((current) => {
      const next = { ...current };
      let changed = false;

      subjects.forEach((subject) => {
        if (next[subject] !== presetValue) {
          next[subject] = presetValue;
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [maxBlocksPreset.apply, maxBlocksPreset.value, subjects]);

  const shouldRunScheduleDiagnostics = false;
  const shouldRunSchedulePreview = false;

  useEffect(() => {
    if (!docenciaCoverageFilterSubject) return;
    if (subjects.includes(docenciaCoverageFilterSubject)) return;
    setDocenciaCoverageFilterSubject('');
  }, [docenciaCoverageFilterSubject, subjects]);

  const selectedLevels = useMemo(
    () => availableLevels.filter((level) => selectedLevelIds.includes(level.id)),
    [availableLevels, selectedLevelIds],
  );

  const gradeRows = useMemo(() => {
    const rows = [];
    selectedLevels.forEach((level) => {
      const grades = gradesByLevel[level.id] || DEFAULT_GRADES_BY_LEVEL[level.id] || [];
      grades.forEach((grade) => {
        rows.push({
          key: `${level.id}:${grade}`,
          levelName: level.name,
          grade,
        });
      });
    });
    return rows;
  }, [selectedLevels, gradesByLevel]);

  const resolvedGradesByLevel = useMemo(
    () => Object.fromEntries(
      selectedLevels.map((level) => [
        level.id,
        gradesByLevel[level.id] || DEFAULT_GRADES_BY_LEVEL[level.id] || [],
      ]),
    ),
    [gradesByLevel, selectedLevels],
  );

  useEffect(() => {
    if (!loadPreviewFilterGradeKey) return;
    if (gradeRows.some((row) => row.key === loadPreviewFilterGradeKey)) return;
    setLoadPreviewFilterGradeKey('');
  }, [loadPreviewFilterGradeKey, gradeRows]);

  const gradeKeysByLevel = useMemo(
    () =>
      Object.fromEntries(
        selectedLevels.map((level) => [
          level.id,
          gradeRows.filter((row) => row.key.startsWith(`${level.id}:`)).map((row) => row.key),
        ]),
      ),
    [selectedLevels, gradeRows],
  );

  const scheduleGenerationLevels = useMemo(
    () => selectedLevels.filter((level) => (gradeKeysByLevel[level.id] || []).length > 0),
    [selectedLevels, gradeKeysByLevel],
  );

  useEffect(() => {
    if (scheduleGenerationLevels.length === 0) {
      if (scheduleGenerationLevelId) setScheduleGenerationLevelId('');
      return;
    }

    if (scheduleGenerationLevels.some((level) => level.id === scheduleGenerationLevelId)) return;
    setScheduleGenerationLevelId(scheduleGenerationLevels[0].id);
  }, [scheduleGenerationLevels, scheduleGenerationLevelId]);

  const scheduleGenerationGradeKeys = useMemo(
    () => new Set(gradeKeysByLevel[scheduleGenerationLevelId] || []),
    [gradeKeysByLevel, scheduleGenerationLevelId],
  );

  const allScheduleGenerationGradeKeys = useMemo(
    () => new Set(scheduleGenerationLevels.flatMap((level) => gradeKeysByLevel[level.id] || [])),
    [gradeKeysByLevel, scheduleGenerationLevels],
  );

  const hasGeneratedCourseSchedules = Object.keys(generatedCourseSchedules).length > 0;

  const queueAfterNextPaint = (callback) => {
    if (typeof window === 'undefined') {
      callback();
      return;
    }

    const runCallback = () => window.setTimeout(callback, 0);
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(runCallback);
      });
      return;
    }

    runCallback();
  };

  const courseCountByGradeKey = useMemo(
    () =>
      Object.fromEntries(
        gradeRows.map((row) => {
          const configuredCourses = coursesByGrade[row.key] || [];
          const isSingleCourse = Boolean(singleCourseGrades[row.key]) || configuredCourses.length === 0;
          return [row.key, isSingleCourse ? 1 : configuredCourses.length];
        }),
      ),
    [gradeRows, coursesByGrade, singleCourseGrades],
  );

  const getSchedulableCourseRows = () => {
    const courseRows = [];

    gradeRows.forEach((row) => {
      const gradeKey = row.key;
      const customCourses = coursesByGrade[gradeKey] || [];
      const hasSingleCourse = Boolean(singleCourseGrades[gradeKey]) || customCourses.length === 0;

      if (hasSingleCourse) {
        courseRows.push({
          courseKey: `${gradeKey}::__single__`,
          gradeKey,
          courseName: row.grade,
          levelName: row.levelName,
          courseLabel: `${row.grade} ${row.levelName}`,
        });
        return;
      }

      customCourses.forEach((courseName) => {
        courseRows.push({
          courseKey: `${gradeKey}::${courseName}`,
          gradeKey,
          courseName,
          levelName: row.levelName,
          courseLabel: `${row.grade}${courseName} ${row.levelName}`,
        });
      });
    });

    return courseRows;
  };

  const getTeacherAssignedGradeKeys = (member) => {
    const explicitGradeKeys = Array.isArray(member?.courses)
      ? member.courses.filter((gradeKey) => String(gradeKey || '').trim().length > 0)
      : [];
    if (explicitGradeKeys.length > 0) return explicitGradeKeys;

    const fallbackLevels = Array.isArray(member?.levels) ? member.levels : [];
    return [...new Set(fallbackLevels.flatMap((levelId) => gradeKeysByLevel[levelId] || []))];
  };

  const isTeacherSchedulable = (member) => {
    const hasIdentity = String(member?.name || '').trim().length > 0;
    const hasSchedule = Object.keys(getTeacherAvailabilityByDay(member)).length > 0;
    const hasSubjects = (member?.subjects || []).length > 0;
    const hasCourses = getTeacherAssignedGradeKeys(member).length > 0;

    return hasIdentity && hasSchedule && hasSubjects && hasCourses;
  };

  const connectedScheduleGenerationGradeKeys = useMemo(() => {
    if (!scheduleGenerationLevelId || scheduleGenerationGradeKeys.size === 0) {
      return new Set();
    }

    const allowedGradeKeys = allScheduleGenerationGradeKeys;
    const teachers = (staffByRole.docencia?.members || [])
      .filter((member) => isTeacherSchedulable(member))
      .map((member) => getTeacherAssignedGradeKeys(member).filter((gradeKey) => allowedGradeKeys.has(gradeKey)))
      .filter((gradeKeys) => gradeKeys.length > 0);
    const connectedGradeKeys = new Set([...scheduleGenerationGradeKeys]);
    let expanded = true;

    while (expanded) {
      expanded = false;
      teachers.forEach((gradeKeys) => {
        const sharesCurrentGroup = gradeKeys.some((gradeKey) => connectedGradeKeys.has(gradeKey));
        if (!sharesCurrentGroup) return;

        gradeKeys.forEach((gradeKey) => {
          if (connectedGradeKeys.has(gradeKey)) return;
          connectedGradeKeys.add(gradeKey);
          expanded = true;
        });
      });
    }

    return connectedGradeKeys;
  }, [
    allScheduleGenerationGradeKeys,
    scheduleGenerationGradeKeys,
    scheduleGenerationLevelId,
    staffByRole.docencia,
    gradeKeysByLevel,
  ]);

  const connectedScheduleGenerationLevelNames = useMemo(
    () => scheduleGenerationLevels
      .filter((level) => (gradeKeysByLevel[level.id] || []).some((gradeKey) => connectedScheduleGenerationGradeKeys.has(gradeKey)))
      .map((level) => level.name),
    [connectedScheduleGenerationGradeKeys, gradeKeysByLevel, scheduleGenerationLevels],
  );

  const hasGeneratedConnectedCourseSchedules = useMemo(
    () => Object.values(generatedCourseSchedules || {}).some((schedule) => connectedScheduleGenerationGradeKeys.has(schedule.gradeKey)),
    [connectedScheduleGenerationGradeKeys, generatedCourseSchedules],
  );

  const docenciaAssignedGradesBySubject = useMemo(() => {
    const docenciaMembers = staffByRole.docencia?.members || [];
    const assigned = new Map(subjects.map((subject) => [subject, new Set()]));

    docenciaMembers.forEach((member) => {
      const memberSubjects = member.subjects || [];
      const memberGrades = getTeacherAssignedGradeKeys(member);

      memberSubjects.forEach((subject) => {
        const assignedGrades = assigned.get(subject);
        if (!assignedGrades) return;

        memberGrades.forEach((gradeKey) => {
          const gradeSubjects = subjectMapByGrade[gradeKey] || [];
          if (gradeSubjects.includes(subject)) {
            assignedGrades.add(gradeKey);
          }
        });
      });
    });

    return assigned;
  }, [staffByRole, subjects, subjectMapByGrade, gradeKeysByLevel]);

  const fullyAssignedDocenciaSubjects = useMemo(() => {
    return new Set(
      subjects.filter((subject) => {
        const requiredGrades = gradeRows
          .filter((row) => (subjectMapByGrade[row.key] || []).includes(subject))
          .map((row) => row.key);

        if (!requiredGrades.length) return false;

        const assignedGrades = docenciaAssignedGradesBySubject.get(subject) || new Set();
        return requiredGrades.every((gradeKey) => assignedGrades.has(gradeKey));
      }),
    );
  }, [subjects, gradeRows, subjectMapByGrade, docenciaAssignedGradesBySubject]);

  const hasConfiguredDocenciaTeam = useMemo(() => {
    const role = staffByRole.docencia;
    if (!role || role.skip) return false;

    return (role.members || []).some((member) => {
      const baseOk = String(member?.name || '').trim().length > 0
        && String(member?.email || '').trim().length > 0
        && String(member?.password || '').trim().length > 0;
      const academicOk = (member?.subjects || []).length > 0 && (member?.courses || []).length > 0;

      return baseOk && academicOk;
    });
  }, [staffByRole.docencia]);

  const stepLabels = [
    'Nombre de institucion',
    'Niveles educativos',
    'Grados',
    'Cursos por grado',
    'Asignaturas',
    'Mapa de asignaturas',
    'Periodos academicos',
    'Rectoría',
    'Dirección',
    'Coordinación',
    'Docencia',
    'Psicología',
    'Enfermería',
    'Secretaría Académica',
    'Cartera',
    'Recursos y gestion de compras',
    'Rutas Escolares',
    'Cuerpo académico listo',
    'Calendario escolar',
    'Costos por grado',
    'Beneficios económicos',
    'Costos completados',
  ];

  const progressSegment = useMemo(() => {
    if (step <= 6) {
      const structureFlow = [0, 1, 2, 3, 4, 5, 6];
      const current = structureFlow.indexOf(step);
      return { label: 'Estructura academica', current: current >= 0 ? current + 1 : 1, total: structureFlow.length };
    }

    if (step >= 7 && step <= 17) {
      const staffFlow = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
      const current = staffFlow.indexOf(step);
      return { label: 'Cuerpo academico', current: current >= 0 ? current + 1 : 1, total: staffFlow.length };
    }

    if (step >= 18) {
      return { label: 'Costos', current: step - 17, total: 4 };
    }

    return { label: 'Costos', current: 1, total: 4 };
  }, [step]);

  const progressPercent =
    progressSegment.total <= 1
      ? 100
      : Math.round(((progressSegment.current - 1) / (progressSegment.total - 1)) * 100);

  const shiftValidationIssues = useMemo(() => {
    const issues = [];

    scheduleShifts.forEach((shift, index) => {
      const missing = [];

      if (!String(shift.name || '').trim()) missing.push('nombre');
      if (!(shift.gradeKeys || []).length) missing.push('grados');
      if (!(shift.days || []).length) missing.push('días');

      const startMin = timeToMinutes(shift.startTime);
      const endMin = timeToMinutes(shift.endTime);

      if (startMin === null) missing.push('hora inicio');
      if (endMin === null) missing.push('hora fin');
      if (startMin !== null && endMin !== null && startMin >= endMin) {
        missing.push('hora inicio/fin inválida');
      }

      if (missing.length > 0) {
        issues.push({
          index,
          message: `Jornada ${index + 1}${shift.name ? ` (${shift.name})` : ''}: falta ${missing.join(', ')}.`,
        });
      }
    });

    return issues;
  }, [scheduleShifts]);

  const breakValidationIssues = useMemo(() => {
    const issues = [];

    const breakBlockTemplates = scheduleBlocks
      .filter((block) => block.type === 'break')
      .map((block) => ({
        ...block,
        minutes: Number(block.minutes),
        gradeKeys: block.gradeKeys || [],
      }))
      .filter((block) => Number.isFinite(block.minutes) && block.minutes > 0);

    if (breakBlockTemplates.length === 0) {
      issues.push({ index: -1, message: 'Define al menos un bloque tipo break con duración válida en Definición de bloques.' });
    }

    const allowedBreakDurationsByGrade = Object.fromEntries(
      gradeRows.map((row) => [
        row.key,
        new Set(
          breakBlockTemplates
            .filter((block) => !(block.gradeKeys || []).length || (block.gradeKeys || []).includes(row.key))
            .map((block) => block.minutes),
        ),
      ]),
    );

    const gradeLabelByKey = Object.fromEntries(gradeRows.map((row) => [row.key, `${row.grade} ${row.levelName}`]));

    scheduleBreaks.forEach((entry, index) => {
      const name = String(entry.name || '').trim();
      const days = entry.days || [];
      const gradeKeys = entry.gradeKeys || [];
      const startMin = timeToMinutes(entry.startTime);
      const endMin = timeToMinutes(entry.endTime);

      if (!name || !days.length || !gradeKeys.length || startMin === null || endMin === null || startMin >= endMin) {
        issues.push({ index, message: 'Completa nombre, días, grados y horario válido (inicio menor que fin).' });
        return;
      }

      const breakDuration = endMin - startMin;
      const invalidGradeKeys = gradeKeys.filter((gradeKey) => {
        const allowedDurations = allowedBreakDurationsByGrade[gradeKey] || new Set();
        return !allowedDurations.has(breakDuration);
      });

      if (invalidGradeKeys.length > 0) {
        const invalidGradeLabels = invalidGradeKeys.map((gradeKey) => gradeLabelByKey[gradeKey] || gradeKey).join(', ');
        const allowedForInvalidGrades = [
          ...new Set(
            invalidGradeKeys.flatMap((gradeKey) => [...(allowedBreakDurationsByGrade[gradeKey] || new Set())]),
          ),
        ].sort((a, b) => a - b);
        const allowedLabel = allowedForInvalidGrades.length ? `${allowedForInvalidGrades.join(', ')} min` : 'sin bloques break configurados';

        issues.push({
          index,
          message: `La duración (${breakDuration} min) no coincide con bloques break permitidos para ${invalidGradeLabels} (${allowedLabel}).`,
        });
      }

      gradeKeys.forEach((gradeKey) => {
        days.forEach((day) => {
          const hasCompatibleShift = scheduleShifts.some((shift) => {
            const shiftDays = shift.days || [];
            const shiftGradeKeys = shift.gradeKeys || [];
            const shiftStart = timeToMinutes(shift.startTime);
            const shiftEnd = timeToMinutes(shift.endTime);

            return (
              shiftGradeKeys.includes(gradeKey) &&
              shiftDays.includes(day) &&
              shiftStart !== null &&
              shiftEnd !== null &&
              shiftStart < shiftEnd &&
              startMin >= shiftStart &&
              endMin <= shiftEnd
            );
          });

          if (!hasCompatibleShift) {
            issues.push({
              index,
              message: `${gradeLabelByKey[gradeKey] || gradeKey} no tiene jornada compatible el ${day} para ${entry.startTime} - ${entry.endTime}.`,
            });
          }
        });
      });
    });

    return issues;
  }, [scheduleBreaks, scheduleBlocks, scheduleShifts, gradeRows]);

  const guidanceRoutineValidationIssues = useMemo(() => {
    const issues = [];
    const gradeLabelByKey = Object.fromEntries(gradeRows.map((row) => [row.key, `${row.grade} ${row.levelName}`]));

    scheduleGuidanceRoutines.forEach((entry, index) => {
      const name = String(entry.name || '').trim();
      const days = entry.days || [];
      const gradeKeys = entry.gradeKeys || [];
      const startMin = timeToMinutes(entry.startTime);
      const endMin = timeToMinutes(entry.endTime);

      if (!name || !days.length || !gradeKeys.length || startMin === null || endMin === null || startMin >= endMin) {
        issues.push({ index, message: 'Completa nombre, días, grados y horario válido (inicio menor que fin).' });
        return;
      }

      gradeKeys.forEach((gradeKey) => {
        days.forEach((day) => {
          const hasCompatibleShift = scheduleShifts.some((shift) => {
            const shiftDays = shift.days || [];
            const shiftGradeKeys = shift.gradeKeys || [];
            const shiftStart = timeToMinutes(shift.startTime);
            const shiftEnd = timeToMinutes(shift.endTime);

            return (
              shiftGradeKeys.includes(gradeKey) &&
              shiftDays.includes(day) &&
              shiftStart !== null &&
              shiftEnd !== null &&
              shiftStart < shiftEnd &&
              startMin >= shiftStart &&
              endMin <= shiftEnd
            );
          });

          if (!hasCompatibleShift) {
            issues.push({
              index,
              message: `${gradeLabelByKey[gradeKey] || gradeKey} no tiene jornada compatible el ${day} para ${entry.startTime} - ${entry.endTime}.`,
            });
          }
        });
      });
    });

    return issues;
  }, [scheduleGuidanceRoutines, scheduleShifts, gradeRows]);

  const controlValidationIssues = useMemo(() => {
    const issues = [];
    const gradeLabelByKey = Object.fromEntries(gradeRows.map((row) => [row.key, `${row.grade} ${row.levelName}`]));

    scheduleControl.forEach((entry, index) => {
      const name = String(entry.name || '').trim();
      const days = entry.days || [];
      const gradeKeys = entry.gradeKeys || [];
      const startMin = timeToMinutes(entry.startTime);
      const endMin = timeToMinutes(entry.endTime);

      if (!name || !days.length || !gradeKeys.length || startMin === null || endMin === null || startMin >= endMin) {
        issues.push({ index, message: 'Completa nombre, días, grados y horario válido (inicio menor que fin).' });
        return;
      }

      gradeKeys.forEach((gradeKey) => {
        days.forEach((day) => {
          const hasCompatibleShift = scheduleShifts.some((shift) => {
            const shiftDays = shift.days || [];
            const shiftGradeKeys = shift.gradeKeys || [];
            const shiftStart = timeToMinutes(shift.startTime);
            const shiftEnd = timeToMinutes(shift.endTime);

            return (
              shiftGradeKeys.includes(gradeKey) &&
              shiftDays.includes(day) &&
              shiftStart !== null &&
              shiftEnd !== null &&
              shiftStart < shiftEnd &&
              startMin >= shiftStart &&
              endMin <= shiftEnd
            );
          });

          if (!hasCompatibleShift) {
            issues.push({
              index,
              message: `${gradeLabelByKey[gradeKey] || gradeKey} no tiene jornada compatible el ${day} para ${entry.startTime} - ${entry.endTime}.`,
            });
          }
        });
      });
    });

    return issues;
  }, [scheduleControl, scheduleShifts, gradeRows]);

  const fullyCoveredSubjects = useMemo(() => {
    const requiredBySubject = {};
    subjects.forEach((subject) => {
      requiredBySubject[subject] = new Set(
        gradeRows
          .filter((row) => (subjectMapByGrade[row.key] || []).includes(subject))
          .map((row) => row.key),
      );
    });

    const coveredBySubject = {};
    subjects.forEach((subject) => {
      coveredBySubject[subject] = new Set();
    });

    subjectLoads.forEach((load) => {
      const subject = load.subject;
      if (!coveredBySubject[subject]) return;
      (load.gradeKeys || []).forEach((gradeKey) => coveredBySubject[subject].add(gradeKey));
    });

    const completeSet = new Set();
    subjects.forEach((subject) => {
      const required = requiredBySubject[subject] || new Set();
      const covered = coveredBySubject[subject] || new Set();
      const complete = required.size === 0 || [...required].every((gradeKey) => covered.has(gradeKey));
      if (complete) completeSet.add(subject);
    });

    return completeSet;
  }, [subjects, gradeRows, subjectMapByGrade, subjectLoads]);

  const availableSubjectsForNewLoad = useMemo(
    () => subjects.filter((subject) => !fullyCoveredSubjects.has(subject)),
    [subjects, fullyCoveredSubjects],
  );

  const availableSubjectsForCurrentLoadFilter = useMemo(() => {
    if (!loadPreviewFilterGradeKey) return availableSubjectsForNewLoad;

    return subjects.filter((subject) => {
      const subjectAvailableForGrade = (subjectMapByGrade[loadPreviewFilterGradeKey] || []).includes(subject);
      if (!subjectAvailableForGrade) return false;

      const alreadyCoveredForGrade = subjectLoads.some(
        (load) => load.subject === subject && (load.gradeKeys || []).includes(loadPreviewFilterGradeKey),
      );

      return !alreadyCoveredForGrade;
    });
  }, [
    availableSubjectsForNewLoad,
    loadPreviewFilterGradeKey,
    subjects,
    subjectMapByGrade,
    subjectLoads,
  ]);

  const globalClassBlockMinutes = useMemo(() => {
    const values = scheduleBlocks
      .filter((block) => block.type === 'clase')
      .map((block) => Number(block.minutes))
      .filter((minutes) => Number.isFinite(minutes) && minutes > 0);
    return values.length ? Math.min(...values) : 60;
  }, [scheduleBlocks]);

  const classBlockMinutesByGrade = useMemo(() => {
    const byGrade = {};

    gradeRows.forEach((row) => {
      const values = scheduleBlocks
        .filter((block) => block.type === 'clase')
        .filter((block) => !(block.gradeKeys || []).length || (block.gradeKeys || []).includes(row.key))
        .map((block) => Number(block.minutes))
        .filter((minutes) => Number.isFinite(minutes) && minutes > 0);

      byGrade[row.key] = values.length ? Math.min(...values) : globalClassBlockMinutes;
    });

    return byGrade;
  }, [scheduleBlocks, gradeRows, globalClassBlockMinutes]);

  const classBlockOptions = useMemo(() => {
    const optionsByMinutes = {};

    scheduleClassSlots.forEach((entry) => {
      const start = timeToMinutes(entry.startTime);
      const end = timeToMinutes(entry.endTime);
      if (start === null || end === null || end <= start) return;

      const minutes = end - start;
      if (!Number.isFinite(minutes) || minutes <= 0) return;

      if (!optionsByMinutes[minutes]) {
        optionsByMinutes[minutes] = {
          name: String(minutes),
          label: `Bloque de ${minutes} min`,
          minutes,
          gradeKeys: new Set(),
        };
      }

      (entry.gradeKeys || []).forEach((gradeKey) => {
        optionsByMinutes[minutes].gradeKeys.add(gradeKey);
      });
    });

    const slotOptions = Object.values(optionsByMinutes)
      .map((option) => ({
        name: option.name,
        label: option.label,
        minutes: option.minutes,
        gradeKeys: [...option.gradeKeys],
      }))
      .sort((left, right) => right.minutes - left.minutes);

    if (slotOptions.length > 0) return slotOptions;

    const fallbackByMinutes = {};
    scheduleBlocks
      .filter((block) => block.type === 'clase')
      .forEach((block) => {
        const minutes = Number(block.minutes);
        if (!Number.isFinite(minutes) || minutes <= 0) return;
        if (!fallbackByMinutes[minutes]) {
          fallbackByMinutes[minutes] = {
            name: String(minutes),
            label: `Bloque de ${minutes} min`,
            minutes,
            gradeKeys: new Set(),
          };
        }

        (block.gradeKeys || []).forEach((gradeKey) => {
          fallbackByMinutes[minutes].gradeKeys.add(gradeKey);
        });
      });

    return Object.values(fallbackByMinutes)
      .map((option) => ({
        name: option.name,
        label: option.label,
        minutes: option.minutes,
        gradeKeys: [...option.gradeKeys],
      }))
      .sort((left, right) => right.minutes - left.minutes);
  }, [scheduleClassSlots, scheduleBlocks]);

  const isClassBlockApplicableToGrade = (block, gradeKey) =>
    !(block?.gradeKeys || []).length || (block.gradeKeys || []).includes(gradeKey);

  const getApplicableClassBlocksForLoad = (load) => {
    const subjectGradeKeys = gradeRows
      .filter((row) => (subjectMapByGrade[row.key] || []).includes(load?.subject))
      .map((row) => row.key);

    const candidateGradeKeys = (load?.gradeKeys || []).length ? (load.gradeKeys || []) : subjectGradeKeys;
    const matchingBlocks = classBlockOptions.filter((block) =>
      candidateGradeKeys.length === 0 || candidateGradeKeys.some((gradeKey) => isClassBlockApplicableToGrade(block, gradeKey)),
    );

    return matchingBlocks.length ? matchingBlocks : classBlockOptions;
  };

  const getSelectedClassBlockForLoad = (load, gradeKey = '') => {
    const options = gradeKey
      ? classBlockOptions.filter((block) => isClassBlockApplicableToGrade(block, gradeKey))
      : getApplicableClassBlocksForLoad(load);

    const selectedValue = String(load?.blockName || '').trim();
    const selectedMinutes = getMinutesFromBlockSelectionValue(selectedValue);

    return options.find((block) => block.name === selectedValue)
      || options.find((block) => block.minutes === selectedMinutes)
      || options[0]
      || null;
  };

  const getClassBlockMinutesForGrade = (gradeKey) => classBlockMinutesByGrade[gradeKey] || globalClassBlockMinutes;

  const getLoadBlockMinutesForGrade = (load, gradeKey) =>
    getSelectedClassBlockForLoad(load, gradeKey)?.minutes || getClassBlockMinutesForGrade(gradeKey);

  const getTeacherParallelCoverageAnalysis = (gradeKeyFilterSet = null) => {
    const activeTeachers = (staffByRole.docencia?.members || []).filter((member) => isTeacherSchedulable(member));
    const explicitWindowsByGrade = {};
    const gradeLabelByKey = Object.fromEntries(gradeRows.map((row) => [row.key, `${row.grade} ${row.levelName}`]));

    scheduleClassSlots.forEach((entry) => {
      const startMin = timeToMinutes(entry.startTime);
      const endMin = timeToMinutes(entry.endTime);
      if (startMin === null || endMin === null || endMin <= startMin) return;

      (entry.gradeKeys || []).forEach((gradeKey) => {
        if (gradeKeyFilterSet && !gradeKeyFilterSet.has(gradeKey)) return;

        (entry.days || []).forEach((day) => {
          if (!explicitWindowsByGrade[gradeKey]) explicitWindowsByGrade[gradeKey] = [];
          explicitWindowsByGrade[gradeKey].push({
            day,
            startMin,
            endMin,
            duration: endMin - startMin,
          });
        });
      });
    });

    const blockingIssues = [];
    const slotCapacityGapBlocksBySubject = {};

    subjectLoads.forEach((load) => {
      (load.gradeKeys || []).forEach((gradeKey) => {
        if (gradeKeyFilterSet && !gradeKeyFilterSet.has(gradeKey)) return;

        const blockMinutes = getLoadBlockMinutesForGrade(load, gradeKey);
        const weeklyBlocksPerCourse = getLoadWeeklyBlocks(load, blockMinutes);
        if (weeklyBlocksPerCourse <= 0) return;

        const gradeWindows = (explicitWindowsByGrade[gradeKey] || [])
          .filter((window) => getIntervalDuration(window) === blockMinutes)
          .map((window) => ({
            day: window.day,
            startMin: window.startMin,
            endMin: window.endMin,
            duration: blockMinutes,
          }));
        if (gradeWindows.length === 0) return;

        const courseCount = Math.max(1, courseCountByGradeKey[gradeKey] || 1);
        const requiredBlocks = weeklyBlocksPerCourse * courseCount;
        const candidates = activeTeachers.filter(
          (teacher) => (teacher.subjects || []).includes(load.subject) && getTeacherAssignedGradeKeys(teacher).includes(gradeKey),
        );
        if (candidates.length === 0) return;

        const totalCapacity = candidates.reduce((acc, teacher) => {
          const availabilityByDay = getTeacherAvailabilityByDay(teacher);
          const compatibleWindows = gradeWindows.filter((window) =>
            (availabilityByDay[window.day] || []).some(
              (interval) => window.startMin >= interval.startMin && window.endMin <= interval.endMin,
            ));
          return acc + selectPackableWeeklySlots(compatibleWindows).length;
        }, 0);

        if (totalCapacity >= requiredBlocks) return;

        const missingBlocks = requiredBlocks - totalCapacity;
        slotCapacityGapBlocksBySubject[load.subject] = (slotCapacityGapBlocksBySubject[load.subject] || 0) + missingBlocks;

        blockingIssues.push(
          `${load.subject}: requiere ${requiredBlocks} bloque(s) de ${blockMinutes} min en ${gradeLabelByKey[gradeKey] || gradeKey}, pero la disponibilidad combinada de sus docentes solo cubre ${totalCapacity} bloque(s) sin cruces entre cursos.`,
        );
      });
    });

    return {
      slotCapacityGapBlocksBySubject,
      blockingIssues: [...new Set(blockingIssues)],
    };
  };

  const scheduleFitAnalysis = useMemo(() => {
    const issues = [];
    const recommendations = [];
    const gradeLabelByKey = Object.fromEntries(gradeRows.map((row) => [row.key, `${row.grade} ${row.levelName}`]));

    const shiftWindowsByGradeDay = {};
    scheduleShifts.forEach((shift) => {
      const startMin = timeToMinutes(shift.startTime);
      const endMin = timeToMinutes(shift.endTime);
      if (startMin === null || endMin === null || endMin <= startMin) return;

      (shift.gradeKeys || []).forEach((gradeKey) => {
        (shift.days || []).forEach((day) => {
          const key = `${gradeKey}::${day}`;
          if (!shiftWindowsByGradeDay[key]) shiftWindowsByGradeDay[key] = [];
          shiftWindowsByGradeDay[key].push({ startMin, endMin });
        });
      });
    });

    Object.keys(shiftWindowsByGradeDay).forEach((key) => {
      shiftWindowsByGradeDay[key] = mergeTimeIntervals(shiftWindowsByGradeDay[key]);
    });

    const systemEntries = [
      { type: 'Break', entries: scheduleBreaks },
      { type: 'Guidance', entries: scheduleGuidanceRoutines },
      { type: 'Control', entries: scheduleControl },
      { type: 'Deportes', entries: scheduleSports },
      { type: 'Otro', entries: scheduleOtherBlocks },
    ];

    const classWindowsByGradeDay = {};
    scheduleClassSlots.forEach((entry) => {
      const startMin = timeToMinutes(entry.startTime);
      const endMin = timeToMinutes(entry.endTime);
      if (startMin === null || endMin === null || endMin <= startMin) return;

      (entry.gradeKeys || []).forEach((gradeKey) => {
        (entry.days || []).forEach((day) => {
          const key = `${gradeKey}::${day}`;
          if (!classWindowsByGradeDay[key]) classWindowsByGradeDay[key] = [];
          classWindowsByGradeDay[key].push({ startMin, endMin });
        });
      });
    });

    Object.keys(classWindowsByGradeDay).forEach((key) => {
      classWindowsByGradeDay[key] = normalizeDiscreteTimeIntervals(classWindowsByGradeDay[key]);
    });

    const blockedByGradeDay = {};
    systemEntries.forEach(({ type, entries }) => {
      entries.forEach((entry) => {
        const startMin = timeToMinutes(entry.startTime);
        const endMin = timeToMinutes(entry.endTime);
        if (startMin === null || endMin === null || endMin <= startMin) return;

        (entry.gradeKeys || []).forEach((gradeKey) => {
          (entry.days || []).forEach((day) => {
            const key = `${gradeKey}::${day}`;
            if (!blockedByGradeDay[key]) blockedByGradeDay[key] = [];
            blockedByGradeDay[key].push({ startMin, endMin, type, name: entry.name || type });
          });
        });
      });
    });

    let checkedPairs = 0;
    let compatiblePairs = 0;

    Object.entries(shiftWindowsByGradeDay).forEach(([key, shiftIntervals]) => {
      checkedPairs += 1;
      const [gradeKey, day] = key.split('::');
      const label = gradeLabelByKey[gradeKey] || gradeKey;
      const blocked = blockedByGradeDay[key] || [];
      const explicitClassIntervals = classWindowsByGradeDay[key] || [];
      const gradeHasExplicitClassWindows = Object.keys(classWindowsByGradeDay).some((entryKey) => entryKey.startsWith(`${gradeKey}::`));

      explicitClassIntervals.forEach((slot) => {
        const insideShift = shiftIntervals.some((shift) => slot.startMin >= shift.startMin && slot.endMin <= shift.endMin);
        if (!insideShift) {
          issues.push(
            `${label} ${day}: Clase general ${minutesToClockLabel(slot.startMin)}-${minutesToClockLabel(slot.endMin)} está fuera de la jornada.`,
          );
        }
      });

      for (let i = 1; i < explicitClassIntervals.length; i += 1) {
        const prev = explicitClassIntervals[i - 1];
        const current = explicitClassIntervals[i];
        if (current.startMin < prev.endMin) {
          issues.push(
            `${label} ${day}: dos bloques de Clase general se traslapan (${minutesToClockLabel(current.startMin)}).`,
          );
        }
      }

      blocked.forEach((slot) => {
        const insideShift = shiftIntervals.some((shift) => slot.startMin >= shift.startMin && slot.endMin <= shift.endMin);
        if (!insideShift) {
          issues.push(
            `${label} ${day}: ${slot.type} ${minutesToClockLabel(slot.startMin)}-${minutesToClockLabel(slot.endMin)} está fuera de la jornada.`,
          );
        }
      });

      explicitClassIntervals.forEach((slot) => {
        const overlappingSystem = blocked.find((blockedSlot) => blockedSlot.startMin < slot.endMin && slot.startMin < blockedSlot.endMin);
        if (overlappingSystem) {
          issues.push(
            `${label} ${day}: Clase general se traslapa con ${overlappingSystem.type} (${minutesToClockLabel(overlappingSystem.startMin)}-${minutesToClockLabel(overlappingSystem.endMin)}).`,
          );
        }
      });

      const sortedBlocked = [...blocked].sort((a, b) => a.startMin - b.startMin);
      for (let i = 1; i < sortedBlocked.length; i += 1) {
        const prev = sortedBlocked[i - 1];
        const current = sortedBlocked[i];
        if (current.startMin < prev.endMin) {
          issues.push(
            `${label} ${day}: ${prev.type} y ${current.type} se traslapan (${minutesToClockLabel(current.startMin)}).`,
          );
        }
      }

      const blockMinutesForGrade = getClassBlockMinutesForGrade(gradeKey);

      const freeIntervals = explicitClassIntervals.length
        ? explicitClassIntervals
        : gradeHasExplicitClassWindows
          ? []
          : subtractTimeIntervals(
            shiftIntervals,
            blocked.map((slot) => ({ startMin: slot.startMin, endMin: slot.endMin })),
          );

      const residuals = freeIntervals.filter((interval) => ((interval.endMin - interval.startMin) % blockMinutesForGrade) !== 0);
      if (residuals.length > 0) {
        const first = residuals[0];
        const minutes = first.endMin - first.startMin;
        const remainder = minutes % blockMinutesForGrade;
        issues.push(
          `${label} ${day}: queda una franja de ${minutes} min (${minutesToClockLabel(first.startMin)}-${minutesToClockLabel(first.endMin)}) no divisible por bloque clase de ${blockMinutesForGrade} min (residuo ${remainder} min).`,
        );
      }

      const hasPairIssues = issues.some((issue) => issue.startsWith(`${label} ${day}:`));
      if (!hasPairIssues) compatiblePairs += 1;
    });

    if (issues.some((issue) => issue.includes('no divisible por bloque clase'))) {
      recommendations.push(
        'Ajusta Clase general, jornada o duración de Break/Guidance/Control/Deportes/Otros para que los espacios docentes queden en múltiplos del bloque clase correspondiente por grado.',
      );
    }

    if (issues.some((issue) => issue.includes('fuera de la jornada'))) {
      recommendations.push('Mueve los bloques fuera de jornada o amplía la jornada en esos grados/días.');
    }

    if (issues.some((issue) => issue.includes('se traslapan'))) {
      recommendations.push('Evita traslapar Clase general, Break, Guidance, Control, Deportes y otros bloques en el mismo grado/día.');
    }

    return {
      checkedPairs,
      compatiblePairs,
      issues: [...new Set(issues)],
      recommendations: [...new Set(recommendations)],
    };
  }, [
    scheduleShifts,
    scheduleClassSlots,
    scheduleBreaks,
    scheduleGuidanceRoutines,
    scheduleControl,
    scheduleSports,
    scheduleOtherBlocks,
    classBlockMinutesByGrade,
    gradeRows,
  ]);

  useEffect(() => {
    if (!Number.isFinite(globalClassBlockMinutes) || globalClassBlockMinutes <= 0) return;

    setSubjectLoads((current) => {
      let changed = false;
      const next = current.map((load) => {
        const hasBlocks = Number(load?.weeklyBlocks) > 0;
        const legacyHours = Number(load?.weeklyHours);
        if (hasBlocks || !Number.isFinite(legacyHours) || legacyHours <= 0) return load;

        changed = true;
        const migratedBlocks = Math.max(1, Math.ceil((legacyHours * 60) / globalClassBlockMinutes));
        return {
          ...load,
          weeklyBlocks: String(migratedBlocks),
        };
      });

      return changed ? next : current;
    });
  }, [globalClassBlockMinutes]);

  const calendarGradeOptions = useMemo(() => {
    if (!scheduleShifts.length) return [];
    const byKey = Object.fromEntries(gradeRows.map((row) => [row.key, row]));
    const shiftGradeKeys = new Set(scheduleShifts.flatMap((shift) => shift.gradeKeys || []));
    return [...shiftGradeKeys]
      .map((gradeKey) => byKey[gradeKey])
      .filter(Boolean)
      .map((row) => ({ key: row.key, label: `${row.grade} ${row.levelName}` }));
  }, [scheduleShifts, gradeRows]);

  const calendarShiftOptions = useMemo(() => {
    if (!calendarGradeKey) return [];
    return scheduleShifts.filter((shift) => (shift.gradeKeys || []).includes(calendarGradeKey));
  }, [scheduleShifts, calendarGradeKey]);

  const isWeeklyCalendar = calendarShiftName === CALENDAR_WEEKLY_OPTION;

  const calendarWeeklyWindow = useMemo(() => {
    if (!calendarShiftOptions.length) {
      return { startMin: null, endMin: null, days: [] };
    }

    const starts = calendarShiftOptions
      .map((shift) => timeToMinutes(shift.startTime))
      .filter((value) => value !== null);
    const ends = calendarShiftOptions
      .map((shift) => timeToMinutes(shift.endTime))
      .filter((value) => value !== null);

    const daySet = new Set(calendarShiftOptions.flatMap((shift) => shift.days || []));
    const days = WEEK_DAYS.filter((day) => daySet.has(day));

    return {
      startMin: starts.length ? Math.min(...starts) : null,
      endMin: ends.length ? Math.max(...ends) : null,
      days,
    };
  }, [calendarShiftOptions]);

  const calendarShift = useMemo(() => {
    if (isWeeklyCalendar) return null;
    if (!calendarShiftOptions.length) return null;
    return calendarShiftOptions.find((s) => s.name === calendarShiftName) || calendarShiftOptions[0];
  }, [calendarShiftOptions, calendarShiftName, isWeeklyCalendar]);

  const calendarShiftStartMin = isWeeklyCalendar ? calendarWeeklyWindow.startMin : timeToMinutes(calendarShift?.startTime);
  const calendarShiftEndMin = isWeeklyCalendar ? calendarWeeklyWindow.endMin : timeToMinutes(calendarShift?.endTime);
  const calendarDays = isWeeklyCalendar ? calendarWeeklyWindow.days : (calendarShift?.days || []);
  const calendarSlotMinutes = 15;
  const calendarViewStartMin = 7 * 60;
  const calendarViewEndMin = 17 * 60;
  const calendarRowHeight = 18;
  const calendarTotalSlots =
    calendarViewEndMin > calendarViewStartMin
      ? Math.floor((calendarViewEndMin - calendarViewStartMin) / calendarSlotMinutes)
      : 0;

  const calendarBreakSlots = useMemo(() => {
    if (!calendarGradeKey) return [];
    return scheduleBreaks.filter(
      (entry) =>
        (entry.gradeKeys || []).includes(calendarGradeKey) &&
        (entry.days || []).some((day) => calendarDays.includes(day)),
    );
  }, [scheduleBreaks, calendarGradeKey, calendarDays]);

  const calendarGuidanceSlots = useMemo(() => {
    if (!calendarGradeKey) return [];
    return scheduleGuidanceRoutines.filter(
      (entry) =>
        (entry.gradeKeys || []).includes(calendarGradeKey) &&
        (entry.days || []).some((day) => calendarDays.includes(day)),
    );
  }, [scheduleGuidanceRoutines, calendarGradeKey, calendarDays]);

  const calendarControlSlots = useMemo(() => {
    if (!calendarGradeKey) return [];
    return scheduleControl.filter(
      (entry) =>
        (entry.gradeKeys || []).includes(calendarGradeKey) &&
        (entry.days || []).some((day) => calendarDays.includes(day)),
    );
  }, [scheduleControl, calendarGradeKey, calendarDays]);

  const calendarSportsSlots = useMemo(() => {
    if (!calendarGradeKey) return [];
    return scheduleSports.filter(
      (entry) =>
        (entry.gradeKeys || []).includes(calendarGradeKey) &&
        (entry.days || []).some((day) => calendarDays.includes(day)),
    );
  }, [scheduleSports, calendarGradeKey, calendarDays]);

  const calendarOtherSlots = useMemo(() => {
    if (!calendarGradeKey) return [];
    return scheduleOtherBlocks.filter(
      (entry) =>
        (entry.gradeKeys || []).includes(calendarGradeKey) &&
        (entry.days || []).some((day) => calendarDays.includes(day)),
    );
  }, [scheduleOtherBlocks, calendarGradeKey, calendarDays]);

  const calendarClassSpaceSlots = useMemo(() => {
    if (!calendarGradeKey) return [];
    return scheduleClassSlots.filter(
      (entry) =>
        (entry.gradeKeys || []).includes(calendarGradeKey) &&
        (entry.days || []).some((day) => calendarDays.includes(day)),
    );
  }, [scheduleClassSlots, calendarGradeKey, calendarDays]);

  const calendarVisibleShifts = useMemo(() => {
    if (isWeeklyCalendar) return calendarShiftOptions;
    return calendarShift ? [calendarShift] : [];
  }, [isWeeklyCalendar, calendarShiftOptions, calendarShift]);

  const calendarAvailableIntervalsByDay = useMemo(() => {
    const explicitClassIntervalsByDay = {};
    calendarClassSpaceSlots.forEach((entry) => {
      const start = timeToMinutes(entry.startTime);
      const end = timeToMinutes(entry.endTime);
      if (start === null || end === null || end <= start) return;
      (entry.days || []).forEach((day) => {
        if (!calendarDays.includes(day)) return;
        if (!explicitClassIntervalsByDay[day]) explicitClassIntervalsByDay[day] = [];
        explicitClassIntervalsByDay[day].push({
          startMin: Math.max(start, calendarViewStartMin),
          endMin: Math.min(end, calendarViewEndMin),
        });
      });
    });

    const hasExplicitClassSpaces = Object.keys(explicitClassIntervalsByDay).length > 0;
    const byDay = {};

    calendarDays.forEach((day) => {
      if (hasExplicitClassSpaces) {
        byDay[day] = normalizeDiscreteTimeIntervals(explicitClassIntervalsByDay[day] || []);
        return;
      }

      const dayIntervals = calendarVisibleShifts
        .filter((shift) => (shift.days || []).includes(day))
        .map((shift) => {
          const start = timeToMinutes(shift.startTime);
          const end = timeToMinutes(shift.endTime);
          if (start === null || end === null || end <= start) return null;
          return {
            start: Math.max(start, calendarViewStartMin),
            end: Math.min(end, calendarViewEndMin),
          };
        })
        .filter(Boolean)
        .filter((item) => item.end > item.start)
        .sort((a, b) => a.start - b.start);

      const merged = [];
      dayIntervals.forEach((current) => {
        const last = merged[merged.length - 1];
        if (!last || current.start > last.end) {
          merged.push({ ...current });
          return;
        }
        last.end = Math.max(last.end, current.end);
      });

      byDay[day] = merged;
    });

    return byDay;
  }, [calendarDays, calendarVisibleShifts, calendarViewStartMin, calendarViewEndMin, calendarClassSpaceSlots]);

  const calendarUnavailableSegmentsByDay = useMemo(() => {
    const byDay = {};

    calendarDays.forEach((day) => {
      const dayIntervals = calendarAvailableIntervalsByDay[day] || [];

      if (!dayIntervals.length) {
        byDay[day] = [{ start: calendarViewStartMin, end: calendarViewEndMin }];
        return;
      }

      const unavailable = [];
      let cursor = calendarViewStartMin;
      dayIntervals.forEach((item) => {
        if (item.start > cursor) unavailable.push({ start: cursor, end: item.start });
        cursor = Math.max(cursor, item.end);
      });
      if (cursor < calendarViewEndMin) unavailable.push({ start: cursor, end: calendarViewEndMin });

      byDay[day] = unavailable;
    });

    return byDay;
  }, [calendarDays, calendarAvailableIntervalsByDay, calendarViewStartMin, calendarViewEndMin]);

  const calendarGlobalPinnedSlots = useMemo(() => {
    const slots = [];

    globalPinnedSubjectRules.forEach((rule) => {
      const startMin = timeToMinutes(rule.startTime);
      const endMin = timeToMinutes(rule.endTime);
      if (startMin === null || endMin === null || endMin <= startMin) return;

      calendarDays.forEach((day) => {
        if (!(rule.days || []).includes(day)) return;

        const availableIntervals = calendarAvailableIntervalsByDay[day] || [];
        availableIntervals.forEach((interval, intervalIndex) => {
          const start = Math.max(startMin, interval.start);
          const end = Math.min(endMin, interval.end);
          if (end <= start) return;

          slots.push({
            key: `${rule.id}-${day}-${intervalIndex}`,
            day,
            subject: rule.subject,
            startMin: start,
            endMin: end,
          });
        });
      });
    });

    return slots;
  }, [globalPinnedSubjectRules, calendarDays, calendarAvailableIntervalsByDay]);

  useEffect(() => {
    if (!calendarGradeOptions.length) {
      setCalendarGradeKey('');
      return;
    }

    if (!calendarGradeOptions.some((g) => g.key === calendarGradeKey)) {
      setCalendarGradeKey(calendarGradeOptions[0].key);
    }
  }, [calendarGradeOptions, calendarGradeKey]);

  useEffect(() => {
    if (!calendarShiftOptions.length) {
      setCalendarShiftName('');
      return;
    }

    if (calendarShiftName !== CALENDAR_WEEKLY_OPTION && !calendarShiftOptions.some((shift) => shift.name === calendarShiftName)) {
      setCalendarShiftName(calendarShiftOptions[0].name);
    }
  }, [calendarShiftOptions, calendarShiftName]);

  const getSystemConflictLabel = (day, startMin, endMin, gradeKey) => {
    const collections = [
      { label: 'Break', entries: scheduleBreaks },
      { label: 'Guidance Routine', entries: scheduleGuidanceRoutines },
      { label: 'Control', entries: scheduleControl },
      { label: 'Deportes', entries: scheduleSports },
      { label: 'Otro', entries: scheduleOtherBlocks },
    ];

    for (let collectionIndex = 0; collectionIndex < collections.length; collectionIndex += 1) {
      const collection = collections[collectionIndex];
      const hit = collection.entries.some((entry) => {
        if (!(entry.gradeKeys || []).includes(gradeKey)) return false;
        if (!(entry.days || []).includes(day)) return false;
        const blockStart = timeToMinutes(entry.startTime);
        const blockEnd = timeToMinutes(entry.endTime);
        if (blockStart === null || blockEnd === null || blockEnd <= blockStart) return false;
        return startMin < blockEnd && blockStart < endMin;
      });
      if (hit) return collection.label;
    }

    return '';
  };

  const fitsCalendarAvailability = (day, startMin, endMin) =>
    (calendarAvailableIntervalsByDay[day] || []).some((interval) => startMin >= interval.startMin && endMin <= interval.endMin);

  const hasGlobalPinnedConflict = (day, startMin, endMin) =>
    globalPinnedSubjectRules.some((rule) => {
      if (!(rule.days || []).includes(day)) return false;
      const ruleStart = timeToMinutes(rule.startTime);
      const ruleEnd = timeToMinutes(rule.endTime);
      if (ruleStart === null || ruleEnd === null || ruleEnd <= ruleStart) return false;
      return startMin < ruleEnd && ruleStart < endMin;
    });

  const hasSubjectConflict = (candidate, ignoreSlotId = null) =>
    fixedSubjectSlots.some((slot) => {
      if (ignoreSlotId && slot.id === ignoreSlotId) return false;
      if (slot.shiftName !== candidate.shiftName) return false;
      if (slot.gradeKey !== candidate.gradeKey) return false;
      if (slot.day !== candidate.day) return false;
      return candidate.startMin < slot.endMin && slot.startMin < candidate.endMin;
    });

  const resolveShiftForCalendarDrop = (day, startMin) => {
    if (!isWeeklyCalendar) return calendarShift;

    const matchingShifts = calendarShiftOptions
      .filter((shift) => (shift.days || []).includes(day))
      .map((shift) => {
        const shiftStart = timeToMinutes(shift.startTime);
        const shiftEnd = timeToMinutes(shift.endTime);
        if (shiftStart === null || shiftEnd === null || shiftEnd <= shiftStart) return null;
        return { shift, shiftStart, shiftEnd };
      })
      .filter(Boolean)
      .filter(({ shiftStart, shiftEnd }) => startMin >= shiftStart && startMin < shiftEnd)
      .sort((a, b) => a.shiftStart - b.shiftStart);

    return matchingShifts[0] || null;
  };

  const resolveShiftBoundsByName = (shiftName) => {
    const shift = scheduleShifts.find((entry) => entry.name === shiftName);
    if (!shift) return { shiftStartMin: calendarViewStartMin, shiftEndMin: calendarViewEndMin };
    const shiftStartMin = timeToMinutes(shift.startTime);
    const shiftEndMin = timeToMinutes(shift.endTime);
    return {
      shiftStartMin: shiftStartMin ?? calendarViewStartMin,
      shiftEndMin: shiftEndMin ?? calendarViewEndMin,
    };
  };

  const addFixedSlotFromCalendar = (day, startMin) => {
    const subject = dragSubject || subjects[0] || '';
    if (!subject || !calendarGradeKey) return;

    const resolvedShift = resolveShiftForCalendarDrop(day, startMin);
    if (!resolvedShift) {
      setCalendarWarning('Ese horario está fuera de la jornada seleccionada.');
      return;
    }

    const activeShift = isWeeklyCalendar ? resolvedShift.shift : resolvedShift;
    const activeShiftStartMin = isWeeklyCalendar ? resolvedShift.shiftStart : calendarShiftStartMin;
    const activeShiftEndMin = isWeeklyCalendar ? resolvedShift.shiftEnd : calendarShiftEndMin;

    if (!activeShift) return;
    if (activeShiftStartMin === null || activeShiftEndMin === null) return;

    if (startMin < activeShiftStartMin || startMin >= activeShiftEndMin) {
      setCalendarWarning('Ese horario está fuera de la jornada seleccionada.');
      return;
    }

    const blockMinutesForGrade = getClassBlockMinutesForGrade(calendarGradeKey);
    const endMin = Math.min(startMin + blockMinutesForGrade, activeShiftEndMin);
    const candidate = makeDefaultFixedSlot({
      subject,
      shiftName: activeShift.name,
      gradeKey: calendarGradeKey,
      day,
      startMin,
      endMin,
    });

    if (!fitsCalendarAvailability(day, candidate.startMin, candidate.endMin)) {
      setCalendarWarning('Ese horario está fuera de los espacios de clase disponibles.');
      return;
    }

    const systemConflict = getSystemConflictLabel(day, candidate.startMin, candidate.endMin, calendarGradeKey);
    if (systemConflict) {
      setCalendarWarning(`No puedes fijar una asignatura sobre ${systemConflict}.`);
      return;
    }

    if (hasGlobalPinnedConflict(day, candidate.startMin, candidate.endMin)) {
      setCalendarWarning('Ese horario ya está reservado por una asignatura fija global.');
      return;
    }

    if (hasSubjectConflict(candidate)) {
      setCalendarWarning('Ya existe otra asignatura fijada en ese horario.');
      return;
    }

    setCalendarWarning('');
    setFixedSubjectSlots((current) => [...current, candidate]);
  };

  const moveFixedSlotFromCalendar = (slotId, day, startMin) => {
    const slot = fixedSubjectSlots.find((entry) => entry.id === slotId);
    if (!slot || !calendarGradeKey) return;

    const resolvedShift = resolveShiftForCalendarDrop(day, startMin);
    if (!resolvedShift) {
      setCalendarWarning('Ese horario está fuera de la jornada seleccionada.');
      return;
    }

    const activeShift = isWeeklyCalendar ? resolvedShift.shift : resolvedShift;
    const activeShiftStartMin = isWeeklyCalendar ? resolvedShift.shiftStart : calendarShiftStartMin;
    const activeShiftEndMin = isWeeklyCalendar ? resolvedShift.shiftEnd : calendarShiftEndMin;

    if (!activeShift) return;
    if (activeShiftStartMin === null || activeShiftEndMin === null) return;

    if (startMin < activeShiftStartMin || startMin >= activeShiftEndMin) {
      setCalendarWarning('Ese horario está fuera de la jornada seleccionada.');
      return;
    }

    const duration = Math.max(calendarSlotMinutes, slot.endMin - slot.startMin);
    const endMin = Math.min(startMin + duration, activeShiftEndMin);

    const candidate = {
      ...slot,
      shiftName: activeShift.name,
      gradeKey: calendarGradeKey,
      day,
      startMin,
      endMin,
    };

    if (!fitsCalendarAvailability(day, candidate.startMin, candidate.endMin)) {
      setCalendarWarning('Ese horario está fuera de los espacios de clase disponibles.');
      return;
    }

    const systemConflict = getSystemConflictLabel(day, candidate.startMin, candidate.endMin, calendarGradeKey);
    if (systemConflict) {
      setCalendarWarning(`No puedes fijar una asignatura sobre ${systemConflict}.`);
      return;
    }

    if (hasGlobalPinnedConflict(day, candidate.startMin, candidate.endMin)) {
      setCalendarWarning('Ese horario ya está reservado por una asignatura fija global.');
      return;
    }

    if (hasSubjectConflict(candidate, slotId)) {
      setCalendarWarning('Ya existe otra asignatura fijada en ese horario.');
      return;
    }

    setCalendarWarning('');
    setFixedSubjectSlots((current) => current.map((entry) => (entry.id === slotId ? candidate : entry)));
  };

  const handleCalendarDrop = (day, minute) => {
    if (draggingSlotId) {
      moveFixedSlotFromCalendar(draggingSlotId, day, minute);
      setDraggingSlotId(null);
      return;
    }

    addFixedSlotFromCalendar(day, minute);
  };

  const removeFixedSlot = (slotId) => {
    setFixedSubjectSlots((current) => current.filter((slot) => slot.id !== slotId));
  };

  useEffect(() => {
    if (!resizingSlot) return;
    const rowHeight = calendarRowHeight;

    const onMove = (event) => {
      const deltaY = event.clientY - resizingSlot.startY;
      const deltaSlots = Math.round(deltaY / rowHeight);
      const minDuration = calendarSlotMinutes;
      const shiftStart = resizingSlot.shiftStartMin ?? calendarViewStartMin;
      const shiftEnd = resizingSlot.shiftEndMin ?? calendarViewEndMin;

      let nextStart = resizingSlot.origStartMin;
      let nextEnd = resizingSlot.origEndMin;
      let limitBlocked = false;

      if (resizingSlot.edge === 'top') {
        const candidateStartRaw = resizingSlot.origStartMin + deltaSlots * calendarSlotMinutes;
        const candidateStart = candidateStartRaw;
        const maxStart = resizingSlot.origEndMin - minDuration;
        nextStart = Math.min(maxStart, Math.max(shiftStart, candidateStart));
        if (deltaSlots < 0 && candidateStartRaw < shiftStart) {
          limitBlocked = true;
        }
      } else {
        const candidateEndRaw = resizingSlot.origEndMin + deltaSlots * calendarSlotMinutes;
        const candidateEnd = candidateEndRaw;
        const minEnd = resizingSlot.origStartMin + minDuration;
        nextEnd = Math.max(minEnd, Math.min(shiftEnd, candidateEnd));
        if (deltaSlots > 0 && candidateEndRaw > shiftEnd) {
          limitBlocked = true;
        }
      }

      const candidate = {
        shiftName: resizingSlot.shiftName,
        gradeKey: resizingSlot.gradeKey,
        day: resizingSlot.day,
        startMin: nextStart,
        endMin: nextEnd,
      };

      if (!fitsCalendarAvailability(candidate.day, candidate.startMin, candidate.endMin)) {
        setCalendarWarning('No puedes estirar fuera de los espacios de clase disponibles.');
        return;
      }
      const systemConflict = getSystemConflictLabel(candidate.day, candidate.startMin, candidate.endMin, candidate.gradeKey);
      if (systemConflict) {
        setCalendarWarning(`No puedes estirar sobre ${systemConflict}.`);
        return;
      }
      if (hasGlobalPinnedConflict(candidate.day, candidate.startMin, candidate.endMin)) {
        setCalendarWarning('No puedes estirar sobre una asignatura fija global.');
        return;
      }
      if (hasSubjectConflict(candidate, resizingSlot.slotId)) {
        setCalendarWarning('No puedes estirar sobre otra asignatura fija.');
        return;
      }

      if (limitBlocked) {
        setCalendarWarning('No puedes estirar más allá del límite de la jornada.');
      } else {
        setCalendarWarning('');
      }

      setFixedSubjectSlots((current) =>
        current.map((slot) =>
          slot.id === resizingSlot.slotId
            ? { ...slot, startMin: nextStart, endMin: nextEnd }
            : slot,
        ),
      );
    };

    const onUp = () => setResizingSlot(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizingSlot, calendarSlotMinutes, calendarViewEndMin, calendarViewStartMin, calendarRowHeight]);

  const plannerLevelOptions = useMemo(
    () => selectedLevels.filter((level) => (gradeKeysByLevel[level.id] || []).length > 0),
    [selectedLevels, gradeKeysByLevel],
  );

  useEffect(() => {
    if (!plannerLevelOptions.length) {
      setBlockPlannerLevelId('');
      return;
    }

    if (!plannerLevelOptions.some((level) => level.id === blockPlannerLevelId)) {
      setBlockPlannerLevelId(plannerLevelOptions[0].id);
    }
  }, [plannerLevelOptions, blockPlannerLevelId]);

  const plannerLevelGradeKeys = useMemo(
    () => gradeKeysByLevel[blockPlannerLevelId] || [],
    [gradeKeysByLevel, blockPlannerLevelId],
  );

  const plannerDefaultGradeKeys = useMemo(() => {
    if (!plannerLevelGradeKeys.length) return [];

    const signaturesByGrade = Object.fromEntries(plannerLevelGradeKeys.map((gradeKey) => [gradeKey, []]));

    scheduleShifts.forEach((shift) => {
      const startMin = timeToMinutes(shift.startTime);
      const endMin = timeToMinutes(shift.endTime);
      const shiftDays = [...new Set(shift.days || [])].sort((left, right) => WEEK_DAYS.indexOf(left) - WEEK_DAYS.indexOf(right));

      if (startMin === null || endMin === null || endMin <= startMin || !shiftDays.length) return;

      (shift.gradeKeys || [])
        .filter((gradeKey) => plannerLevelGradeKeys.includes(gradeKey))
        .forEach((gradeKey) => {
          signaturesByGrade[gradeKey].push({
            startMin,
            endMin,
            days: shiftDays,
          });
        });
    });

    const groupedGradeKeys = new Map();

    plannerLevelGradeKeys.forEach((gradeKey) => {
      const signatureEntries = (signaturesByGrade[gradeKey] || [])
        .sort((left, right) => {
          if (left.startMin !== right.startMin) return left.startMin - right.startMin;
          if (left.endMin !== right.endMin) return left.endMin - right.endMin;
          return left.days.join('|').localeCompare(right.days.join('|'), 'es');
        });

      const signatureKey = JSON.stringify(signatureEntries);
      const currentGroup = groupedGradeKeys.get(signatureKey) || [];
      currentGroup.push(gradeKey);
      groupedGradeKeys.set(signatureKey, currentGroup);
    });

    const rankedGroups = [...groupedGradeKeys.values()].sort((left, right) => {
      if (right.length !== left.length) return right.length - left.length;
      return plannerLevelGradeKeys.indexOf(left[0]) - plannerLevelGradeKeys.indexOf(right[0]);
    });

    return rankedGroups[0] || plannerLevelGradeKeys;
  }, [plannerLevelGradeKeys, scheduleShifts]);

  useEffect(() => {
    if (!plannerLevelGradeKeys.length) {
      setPlannerSelectedGradeKeys([]);
      return;
    }

    setPlannerSelectedGradeKeys(plannerDefaultGradeKeys);
  }, [blockPlannerLevelId, plannerLevelGradeKeys, plannerDefaultGradeKeys]);

  const plannerGradeKeys = plannerSelectedGradeKeys.filter((gradeKey) => plannerLevelGradeKeys.includes(gradeKey));
  const plannerSlotMinutes = 15;
  const plannerViewStartMin = 7 * 60;
  const plannerViewEndMin = 17 * 60;
  const plannerRowHeight = 24;
  const plannerTotalSlots =
    plannerViewEndMin > plannerViewStartMin
      ? Math.floor((plannerViewEndMin - plannerViewStartMin) / plannerSlotMinutes)
      : 0;

  const plannerShiftIntervalsByGradeDay = useMemo(() => {
    const byGradeDay = {};

    scheduleShifts.forEach((shift) => {
      const startMin = timeToMinutes(shift.startTime);
      const endMin = timeToMinutes(shift.endTime);
      if (startMin === null || endMin === null || endMin <= startMin) return;

      (shift.gradeKeys || [])
        .filter((gradeKey) => plannerGradeKeys.includes(gradeKey))
        .forEach((gradeKey) => {
          (shift.days || []).forEach((day) => {
            const key = `${gradeKey}::${day}`;
            if (!byGradeDay[key]) byGradeDay[key] = [];
            byGradeDay[key].push({
              startMin: Math.max(startMin, plannerViewStartMin),
              endMin: Math.min(endMin, plannerViewEndMin),
            });
          });
        });
    });

    Object.keys(byGradeDay).forEach((key) => {
      byGradeDay[key] = mergeTimeIntervals(byGradeDay[key]).filter((item) => item.endMin > item.startMin);
    });

    return byGradeDay;
  }, [scheduleShifts, plannerGradeKeys, plannerViewStartMin, plannerViewEndMin]);

  const plannerDays = useMemo(
    () => WEEK_DAYS.filter((day) => plannerGradeKeys.every((gradeKey) => (plannerShiftIntervalsByGradeDay[`${gradeKey}::${day}`] || []).length > 0)),
    [plannerGradeKeys, plannerShiftIntervalsByGradeDay],
  );

  const plannerAvailableIntervalsByDay = useMemo(() => {
    const byDay = {};

    plannerDays.forEach((day) => {
      const groups = plannerGradeKeys.map((gradeKey) => plannerShiftIntervalsByGradeDay[`${gradeKey}::${day}`] || []);
      byDay[day] = intersectTimeIntervals(groups);
    });

    return byDay;
  }, [plannerDays, plannerGradeKeys, plannerShiftIntervalsByGradeDay]);

  const plannerUnavailableSegmentsByDay = useMemo(() => {
    const byDay = {};

    plannerDays.forEach((day) => {
      const available = plannerAvailableIntervalsByDay[day] || [];
      if (!available.length) {
        byDay[day] = [{ start: plannerViewStartMin, end: plannerViewEndMin }];
        return;
      }

      const unavailable = [];
      let cursor = plannerViewStartMin;
      available.forEach((interval) => {
        if (interval.startMin > cursor) unavailable.push({ start: cursor, end: interval.startMin });
        cursor = Math.max(cursor, interval.endMin);
      });
      if (cursor < plannerViewEndMin) unavailable.push({ start: cursor, end: plannerViewEndMin });
      byDay[day] = unavailable;
    });

    return byDay;
  }, [plannerDays, plannerAvailableIntervalsByDay, plannerViewStartMin, plannerViewEndMin]);

  const plannerMinuteRows = useMemo(
    () => Array.from({ length: plannerTotalSlots }, (_, index) => {
      const minute = plannerViewStartMin + index * plannerSlotMinutes;
      const minuteOfHour = minute % 60;
      return {
        minute,
        label: minuteOfHour === 0 ? minutesToAmPmLabel(minute) : '',
        isHour: minuteOfHour === 0,
        isHalfHour: minuteOfHour === 30,
      };
    }),
    [plannerTotalSlots, plannerViewStartMin, plannerSlotMinutes],
  );

  const plannerBoardHeight = plannerTotalSlots * plannerRowHeight;

  const plannerEntries = useMemo(() => {
    const collections = [
      { type: 'clase', label: 'Clase general', entries: scheduleClassSlots, className: 'school-creation-calendar-class-space' },
      { type: 'break', label: 'Break', entries: scheduleBreaks, className: 'school-creation-calendar-break' },
      { type: 'guidance', label: 'Guidance Routine', entries: scheduleGuidanceRoutines, className: 'school-creation-calendar-break school-creation-calendar-break--guidance' },
      { type: 'control', label: 'Control', entries: scheduleControl, className: 'school-creation-calendar-break school-creation-calendar-break--control' },
      { type: 'sports', label: 'Deportes', entries: scheduleSports, className: 'school-creation-calendar-break school-creation-calendar-break--sports' },
      { type: 'other', label: 'Otro', entries: scheduleOtherBlocks, className: 'school-creation-calendar-break school-creation-calendar-break--other' },
    ];

    return collections.flatMap((collection) =>
      collection.entries
        .map((entry, sourceIndex) => ({
          ...collection,
          entry,
          sourceIndex,
          displayLabel: getPlannerEntryDisplayLabel(collection.type, entry.name, collection.label),
        }))
        .filter(({ entry }) =>
          (entry.gradeKeys || []).some((gradeKey) => plannerGradeKeys.includes(gradeKey)) &&
          (entry.days || []).some((day) => plannerDays.includes(day)),
        ),
    );
  }, [scheduleClassSlots, scheduleBreaks, scheduleGuidanceRoutines, scheduleControl, scheduleSports, scheduleOtherBlocks, plannerGradeKeys, plannerDays]);

  const selectedPlannerEntry = useMemo(() => {
    if (!selectedPlannerSlot) return null;

    return plannerEntries.find((item) =>
      item.type === selectedPlannerSlot.type &&
      item.sourceIndex === selectedPlannerSlot.sourceIndex &&
      (item.entry.days || []).includes(selectedPlannerSlot.day),
    ) || null;
  }, [plannerEntries, selectedPlannerSlot]);

  const getPlannerEntriesByType = (type) => {
    if (type === 'clase') return scheduleClassSlots;
    if (type === 'break') return scheduleBreaks;
    if (type === 'guidance') return scheduleGuidanceRoutines;
    if (type === 'control') return scheduleControl;
    if (type === 'sports') return scheduleSports;
    if (type === 'other') return scheduleOtherBlocks;
    return [];
  };

  const updatePlannerEntriesByType = (type, updater) => {
    const applyUpdate = (setter) => setter((current) => updater(current));

    if (type === 'clase') return applyUpdate(setScheduleClassSlots);
    if (type === 'break') return applyUpdate(setScheduleBreaks);
    if (type === 'guidance') return applyUpdate(setScheduleGuidanceRoutines);
    if (type === 'control') return applyUpdate(setScheduleControl);
    if (type === 'sports') return applyUpdate(setScheduleSports);
    if (type === 'other') return applyUpdate(setScheduleOtherBlocks);
    return null;
  };

  const isPlannerEntryEmpty = (entry) =>
    !(entry?.gradeKeys || []).length &&
    !(entry?.days || []).length &&
    !String(entry?.startTime || '').trim() &&
    !String(entry?.endTime || '').trim();

  const appendPlannerEntry = (type, entry) => {
    updatePlannerEntriesByType(type, (current) => {
      if (current.length === 1 && isPlannerEntryEmpty(current[0])) return [entry];
      return [...current, entry];
    });
  };

  const removePlannerEntry = (type, sourceIndex) => {
    updatePlannerEntriesByType(type, (current) => current.filter((_, index) => index !== sourceIndex));

    setSelectedPlannerSlot((current) =>
      current && current.type === type && current.sourceIndex === sourceIndex ? null : current,
    );
    setCopiedPlannerSlot((current) =>
      current && current.type === type && current.sourceIndex === sourceIndex ? null : current,
    );
  };

  const startPlannerSlotResize = (event, item, day, blockStart, blockEnd, edge) => {
    event.preventDefault();
    event.stopPropagation();
    setBlockPlannerWarning('');
    setResizingPlannerSlot({
      type: item.type,
      sourceIndex: item.sourceIndex,
      day,
      startY: event.clientY,
      origStartMin: blockStart,
      origEndMin: blockEnd,
      edge,
    });
    setSelectedPlannerSlot({ type: item.type, sourceIndex: item.sourceIndex, day });
  };

  const selectPlannerSlot = (type, sourceIndex, day) => {
    setSelectedPlannerSlot({ type, sourceIndex, day });
    setBlockPlannerWarning('');
  };

  const openPlannerCreateModal = (day, startMin) => {
    const preferredType = dragPlannerType === 'other' && !plannerOtherBlockName
      ? ''
      : dragPlannerType;
    const fallbackType = preferredType || (plannerOtherBlockNames.length ? 'other' : 'clase');
    const resolvedType = fallbackType === 'other' && !plannerOtherBlockNames.length
      ? 'clase'
      : fallbackType;
    const defaultOtherName = resolvedType === 'other'
      ? String(plannerOtherBlockName || plannerOtherBlockNames[0] || '').trim()
      : '';

    setSelectedPlannerSlot(null);
    setPlannerTimeModal({
      mode: 'create',
      type: resolvedType,
      day,
      name: defaultOtherName,
      label: resolvedType === 'other'
        ? `Otro: ${defaultOtherName || 'Bloque personalizado'}`
        : getPlannerEntryDisplayLabel(resolvedType, '', ''),
      startTime: minutesToClockLabel(startMin),
      endTime: minutesToClockLabel(startMin + getPlannerDefaultMinutes(resolvedType)),
    });
    setBlockPlannerWarning('');
  };

  const openPlannerTimeModal = (item, day) => {
    setSelectedPlannerSlot({ type: item.type, sourceIndex: item.sourceIndex, day });
    setPlannerTimeModal({
      mode: 'edit',
      type: item.type,
      sourceIndex: item.sourceIndex,
      day,
      name: String(item.entry?.name || '').trim(),
      label: item.displayLabel,
      startTime: String(item.entry?.startTime || '').trim(),
      endTime: String(item.entry?.endTime || '').trim(),
    });
    setBlockPlannerWarning('');
  };

  const closePlannerTimeModal = () => {
    setPlannerTimeModal(null);
  };

  const createPlannerEntry = (day, startMin, endMin, plannerType, otherBlockName = '') => {
    const resolvedType = String(plannerType || '').trim();
    const resolvedOtherBlockName = String(otherBlockName || '').trim();

    if (!resolvedType || !plannerGradeKeys.length) return false;

    if (resolvedType === 'other' && !resolvedOtherBlockName) {
      setBlockPlannerWarning('Selecciona un bloque personalizado existente antes de guardarlo.');
      return false;
    }

    if (!plannerCandidateFitsLevel(day, startMin, endMin)) {
      setBlockPlannerWarning('Ese horario no está disponible para todos los grados seleccionados. Revisa que compartan esa misma jornada en esa franja.');
      return false;
    }

    if (hasPlannerConflict(resolvedType, -1, day, startMin, endMin)) {
      setBlockPlannerWarning('Ese bloque se traslapa con otro espacio ya definido.');
      return false;
    }

    const entryFactory = {
      clase: makeDefaultClassSpace,
      break: makeDefaultBreak,
      guidance: makeDefaultGuidanceRoutine,
      control: makeDefaultControl,
      sports: makeDefaultSports,
      other: makeDefaultOtherBlock,
    }[resolvedType];

    if (!entryFactory) return false;

    const templateEntry = entryFactory(1);
    const targetEntries = getPlannerEntriesByType(resolvedType);
    const nextSourceIndex = targetEntries.length === 1 && isPlannerEntryEmpty(targetEntries[0])
      ? 0
      : targetEntries.length;

    appendPlannerEntry(resolvedType, {
      ...templateEntry,
      name: resolvedType === 'other' ? resolvedOtherBlockName || 'Otro' : templateEntry.name,
      gradeKeys: plannerGradeKeys,
      days: [day],
      startTime: minutesToClockLabel(startMin),
      endTime: minutesToClockLabel(endMin),
    });
    setSelectedPlannerSlot({ type: resolvedType, sourceIndex: nextSourceIndex, day });
    setBlockPlannerWarning('');
    return true;
  };

  const savePlannerTimeModal = () => {
    if (!plannerTimeModal) return;

    const startTime = String(plannerTimeModal.startTime || '').trim();
    const endTime = String(plannerTimeModal.endTime || '').trim();
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);

    if (startMin === null || endMin === null || endMin <= startMin) {
      setBlockPlannerWarning('Ingresa una hora inicial y final válidas para el bloque.');
      return;
    }

    if (plannerTimeModal.mode === 'create') {
      const saved = createPlannerEntry(
        plannerTimeModal.day,
        startMin,
        endMin,
        plannerTimeModal.type,
        plannerTimeModal.name,
      );

      if (saved) {
        closePlannerTimeModal();
      }
      return;
    }

    if (!plannerCandidateFitsLevel(plannerTimeModal.day, startMin, endMin)) {
      setBlockPlannerWarning('Ese horario no está disponible para todos los grados seleccionados. Revisa que compartan esa misma jornada en esa franja.');
      return;
    }

    if (hasPlannerConflict(plannerTimeModal.type, plannerTimeModal.sourceIndex, plannerTimeModal.day, startMin, endMin)) {
      setBlockPlannerWarning('Ese bloque se traslapa con otro espacio ya definido.');
      return;
    }

    updatePlannerEntriesByType(plannerTimeModal.type, (current) =>
      current.map((entry, index) =>
        index === plannerTimeModal.sourceIndex
          ? {
            ...entry,
            days: [plannerTimeModal.day],
            startTime,
            endTime,
            gradeKeys: plannerGradeKeys,
          }
          : entry,
      ),
    );

    setCopiedPlannerSlot((current) =>
      current && current.type === plannerTimeModal.type && current.sourceIndex === plannerTimeModal.sourceIndex
        ? { ...current, day: plannerTimeModal.day, startTime, endTime }
        : current,
    );

    setBlockPlannerWarning('');
    closePlannerTimeModal();
  };

  const selectPlannerOtherBlockName = (name) => {
    const nextName = String(name || '').trim();
    setPlannerOtherBlockName(nextName);
    setDragPlannerType(nextName ? 'other' : '');
    setBlockPlannerWarning('');
  };

  const removePlannerOtherBlockName = (nameToRemove) => {
    const normalizedName = normalizeKey(nameToRemove);
    const remainingNames = plannerOtherBlockNames.filter((name) => normalizeKey(name) !== normalizedName);

    setPlannerOtherBlockNames(remainingNames);
    setScheduleOtherBlocks((current) => current.filter((entry) => normalizeKey(entry?.name) !== normalizedName));

    if (normalizeKey(plannerOtherBlockName) === normalizedName) {
      const nextSelectedName = remainingNames[0] || '';
      setPlannerOtherBlockName(nextSelectedName);
      setDragPlannerType(nextSelectedName ? 'other' : '');
    }

    setBlockPlannerWarning('');
  };

  const startPlannerChipDrag = (event, type, name = '') => {
    const nextType = String(type || '').trim();
    const nextName = String(name || '').trim();

    if (!nextType) return;

    if (nextType === 'other' && nextName) {
      setPlannerOtherBlockName(nextName);
    }

    setBlockPlannerWarning('');
    setDragPlannerType(nextType);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(PLANNER_DRAG_TYPE_MIME, nextType);
    if (nextName) {
      event.dataTransfer.setData(PLANNER_DRAG_NAME_MIME, nextName);
    }
  };

  const getPlannerDefaultMinutes = () => 15;

  const plannerCandidateFitsLevel = (day, startMin, endMin) =>
    (plannerAvailableIntervalsByDay[day] || []).some((interval) => startMin >= interval.startMin && endMin <= interval.endMin);

  const hasPlannerConflict = (type, sourceIndex, day, startMin, endMin) =>
    plannerEntries.some((item) => {
      if (item.type === type && item.sourceIndex === sourceIndex) return false;
      if (!(item.entry.days || []).includes(day)) return false;
      const blockStart = timeToMinutes(item.entry.startTime);
      const blockEnd = timeToMinutes(item.entry.endTime);
      if (blockStart === null || blockEnd === null || blockEnd <= blockStart) return false;
      return startMin < blockEnd && blockStart < endMin;
    });

  const addPlannerSlotFromCalendar = (day, startMin, plannerTypeOverride = dragPlannerType, otherBlockNameOverride = plannerOtherBlockName) => {
    const resolvedType = String(plannerTypeOverride || '').trim();
    const resolvedOtherBlockName = String(otherBlockNameOverride || '').trim();

    if (!resolvedType || !plannerGradeKeys.length) return;

    if (resolvedType === 'other' && !resolvedOtherBlockName) {
      setBlockPlannerWarning('Crea o selecciona un bloque personalizado antes de arrastrarlo a la grilla.');
      return;
    }

    const duration = getPlannerDefaultMinutes(resolvedType);
    const endMin = startMin + duration;

    createPlannerEntry(day, startMin, endMin, resolvedType, resolvedOtherBlockName);
  };

  const movePlannerSlotFromCalendar = (dragged, day, startMin) => {
    const targetEntry = plannerEntries.find((item) => item.type === dragged.type && item.sourceIndex === dragged.sourceIndex);
    if (!targetEntry) return;

    const currentStart = timeToMinutes(targetEntry.entry.startTime);
    const currentEnd = timeToMinutes(targetEntry.entry.endTime);
    if (currentStart === null || currentEnd === null || currentEnd <= currentStart) return;

    const endMin = startMin + (currentEnd - currentStart);
    if (!plannerCandidateFitsLevel(day, startMin, endMin)) {
      setBlockPlannerWarning('Ese horario no está disponible para todos los grados seleccionados. Revisa que compartan esa misma jornada en esa franja.');
      return;
    }
    if (hasPlannerConflict(dragged.type, dragged.sourceIndex, day, startMin, endMin)) {
      setBlockPlannerWarning('Ese bloque se traslapa con otro espacio ya definido.');
      return;
    }

    updatePlannerEntriesByType(dragged.type, (current) =>
      current.map((entry, index) =>
        index === dragged.sourceIndex
          ? { ...entry, days: [day], startTime: minutesToClockLabel(startMin), endTime: minutesToClockLabel(endMin), gradeKeys: plannerGradeKeys }
          : entry,
      ),
    );
    setSelectedPlannerSlot({ type: dragged.type, sourceIndex: dragged.sourceIndex, day });
    setCopiedPlannerSlot((current) =>
      current && current.type === dragged.type && current.sourceIndex === dragged.sourceIndex
        ? { ...current, day, startTime: minutesToClockLabel(startMin), endTime: minutesToClockLabel(endMin) }
        : current,
    );
    setBlockPlannerWarning('');
  };

  const copySelectedPlannerSlot = () => {
    if (!selectedPlannerEntry || !selectedPlannerSlot) return false;

    setCopiedPlannerSlot({
      type: selectedPlannerEntry.type,
      sourceIndex: selectedPlannerEntry.sourceIndex,
      day: selectedPlannerSlot.day,
      entry: { ...selectedPlannerEntry.entry },
      name: String(selectedPlannerEntry.entry?.name || '').trim(),
      startTime: String(selectedPlannerEntry.entry?.startTime || '').trim(),
      endTime: String(selectedPlannerEntry.entry?.endTime || '').trim(),
    });
    setBlockPlannerWarning('');
    return true;
  };

  const pasteCopiedPlannerSlot = () => {
    const slotToPaste = copiedPlannerSlot || (
      selectedPlannerEntry && selectedPlannerSlot
        ? {
          type: selectedPlannerEntry.type,
          sourceIndex: selectedPlannerEntry.sourceIndex,
          day: selectedPlannerSlot.day,
          entry: { ...selectedPlannerEntry.entry },
          name: String(selectedPlannerEntry.entry?.name || '').trim(),
          startTime: String(selectedPlannerEntry.entry?.startTime || '').trim(),
          endTime: String(selectedPlannerEntry.entry?.endTime || '').trim(),
        }
        : null
    );

    if (!slotToPaste) return false;

    const currentDayIndex = plannerDays.indexOf(slotToPaste.day);
    const nextDay = currentDayIndex >= 0 && currentDayIndex < plannerDays.length - 1
      ? plannerDays[currentDayIndex + 1]
      : currentDayIndex > 0
        ? plannerDays[currentDayIndex - 1]
        : '';

    if (!nextDay) {
      setBlockPlannerWarning('No hay un día adyacente disponible para pegar este bloque.');
      return false;
    }

    const startMin = timeToMinutes(slotToPaste.startTime);
    const endMin = timeToMinutes(slotToPaste.endTime);
    if (startMin === null || endMin === null || endMin <= startMin) {
      setBlockPlannerWarning('El bloque seleccionado no tiene una franja horaria válida para copiar.');
      return false;
    }

    if (!plannerCandidateFitsLevel(nextDay, startMin, endMin)) {
      setBlockPlannerWarning(`No puedes pegar el bloque en ${nextDay} porque queda fuera de la jornada común.`);
      return false;
    }

    if (hasPlannerConflict(slotToPaste.type, -1, nextDay, startMin, endMin)) {
      setBlockPlannerWarning(`Ya existe otro bloque en ${nextDay} para esa misma franja.`);
      return false;
    }

    const targetEntries = getPlannerEntriesByType(slotToPaste.type);
    const nextSourceIndex = targetEntries.length === 1 && isPlannerEntryEmpty(targetEntries[0])
      ? 0
      : targetEntries.length;

    appendPlannerEntry(slotToPaste.type, {
      ...slotToPaste.entry,
      name: slotToPaste.name || slotToPaste.entry?.name || '',
      gradeKeys: plannerGradeKeys,
      days: [nextDay],
      startTime: slotToPaste.startTime,
      endTime: slotToPaste.endTime,
    });

    setSelectedPlannerSlot({ type: slotToPaste.type, sourceIndex: nextSourceIndex, day: nextDay });
    setCopiedPlannerSlot({
      ...slotToPaste,
      sourceIndex: nextSourceIndex,
      day: nextDay,
      entry: {
        ...slotToPaste.entry,
        gradeKeys: plannerGradeKeys,
        days: [nextDay],
        startTime: slotToPaste.startTime,
        endTime: slotToPaste.endTime,
      },
    });
    setBlockPlannerWarning('');
    return true;
  };

  const handlePlannerDrop = (day, minute, event) => {
    const draggedSlotRaw = event?.dataTransfer?.getData(PLANNER_DRAG_SLOT_MIME);
    if (draggingPlannerSlot || draggedSlotRaw) {
      let draggedSlot = draggingPlannerSlot;

      if (!draggedSlot && draggedSlotRaw) {
        try {
          draggedSlot = JSON.parse(draggedSlotRaw);
        } catch {
          draggedSlot = null;
        }
      }

      if (draggedSlot) {
        movePlannerSlotFromCalendar(draggedSlot, day, minute);
      }

      setDraggingPlannerSlot(null);
      return;
    }

    const droppedPlannerType = event?.dataTransfer?.getData(PLANNER_DRAG_TYPE_MIME) || dragPlannerType;
    const droppedPlannerName = event?.dataTransfer?.getData(PLANNER_DRAG_NAME_MIME) || plannerOtherBlockName;

    addPlannerSlotFromCalendar(day, minute, droppedPlannerType, droppedPlannerName);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (isEditableElement(event.target)) return;

      const key = String(event.key || '').toLowerCase();
      if (key === 'c') {
        if (copySelectedPlannerSlot()) {
          event.preventDefault();
        }
        return;
      }

      if (key === 'v') {
        if (pasteCopiedPlannerSlot()) {
          event.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPlannerEntry, selectedPlannerSlot, copiedPlannerSlot, plannerDays, plannerGradeKeys, plannerEntries, plannerAvailableIntervalsByDay]);

  useEffect(() => {
    if (!resizingPlannerSlot) return;

    const onMove = (event) => {
      const deltaY = event.clientY - resizingPlannerSlot.startY;
      const deltaSlots = Math.round(deltaY / plannerRowHeight);
      const minDuration = plannerSlotMinutes;

      let nextStart = resizingPlannerSlot.origStartMin;
      let nextEnd = resizingPlannerSlot.origEndMin;
      if (resizingPlannerSlot.edge === 'top') {
        const maxStart = resizingPlannerSlot.origEndMin - minDuration;
        nextStart = Math.min(maxStart, resizingPlannerSlot.origStartMin + deltaSlots * plannerSlotMinutes);
      } else {
        const minEnd = resizingPlannerSlot.origStartMin + minDuration;
        nextEnd = Math.max(minEnd, resizingPlannerSlot.origEndMin + deltaSlots * plannerSlotMinutes);
      }

      if (!plannerCandidateFitsLevel(resizingPlannerSlot.day, nextStart, nextEnd)) {
        setBlockPlannerWarning('No puedes estirar fuera de la jornada comun del nivel o fuera de los espacios validos.');
        return;
      }
      if (hasPlannerConflict(resizingPlannerSlot.type, resizingPlannerSlot.sourceIndex, resizingPlannerSlot.day, nextStart, nextEnd)) {
        setBlockPlannerWarning('No puedes estirar sobre otro bloque existente.');
        return;
      }

      updatePlannerEntriesByType(resizingPlannerSlot.type, (current) =>
        current.map((entry, index) =>
          index === resizingPlannerSlot.sourceIndex
            ? { ...entry, startTime: minutesToClockLabel(nextStart), endTime: minutesToClockLabel(nextEnd), gradeKeys: plannerGradeKeys }
            : entry,
        ),
      );
      setBlockPlannerWarning('');
    };

    const onUp = () => setResizingPlannerSlot(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizingPlannerSlot, plannerRowHeight, plannerSlotMinutes, plannerGradeKeys, plannerEntries, plannerAvailableIntervalsByDay]);

  const weeklyLoadByGradePreview = useMemo(() => {
    const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

    const blockedIntervalsByGradeDay = {};
    [scheduleBreaks, scheduleGuidanceRoutines, scheduleControl, scheduleSports, scheduleOtherBlocks].forEach((entries) => {
      entries.forEach((entry) => {
        const start = timeToMinutes(entry.startTime);
        const end = timeToMinutes(entry.endTime);
        if (start === null || end === null || start >= end) return;

        (entry.gradeKeys || []).forEach((gradeKey) => {
          (entry.days || []).forEach((day) => {
            const key = `${gradeKey}::${day}`;
            if (!blockedIntervalsByGradeDay[key]) blockedIntervalsByGradeDay[key] = [];
            blockedIntervalsByGradeDay[key].push({ start, end });
          });
        });
      });
    });

    return gradeRows.map((row) => {
      const shiftMinutes = scheduleShifts.reduce((acc, shift) => {
        if (!(shift.gradeKeys || []).includes(row.key)) return acc;
        const start = timeToMinutes(shift.startTime);
        const end = timeToMinutes(shift.endTime);
        if (start === null || end === null || start >= end) return acc;
        return acc + (end - start) * (shift.days || []).length;
      }, 0);

      const usableExplicitClassWindows = [];

      scheduleClassSlots.forEach((entry) => {
        if (!(entry.gradeKeys || []).includes(row.key)) return;
        const start = timeToMinutes(entry.startTime);
        const end = timeToMinutes(entry.endTime);
        if (start === null || end === null || start >= end) return;

        (entry.days || []).forEach((day) => {
          const blockedIntervals = blockedIntervalsByGradeDay[`${row.key}::${day}`] || [];
          const hasBlockedOverlap = blockedIntervals.some((interval) => overlaps(start, end, interval.start, interval.end));
          if (hasBlockedOverlap) return;

          usableExplicitClassWindows.push({ day, minutes: end - start });
        });
      });

      const classMinutes = usableExplicitClassWindows.reduce((acc, window) => acc + window.minutes, 0);

      const explicitClassBlockGroupsMap = usableExplicitClassWindows.reduce((acc, window) => {
        acc[window.minutes] = (acc[window.minutes] || 0) + 1;
        return acc;
      }, {});

      const explicitClassBlockGroups = getSortedBlockGroupsFromMap(explicitClassBlockGroupsMap)
        .filter((group) => group.count > 0);

      const breakMinutes = scheduleBreaks.reduce((acc, entry) => {
        if (!(entry.gradeKeys || []).includes(row.key)) return acc;
        const start = timeToMinutes(entry.startTime);
        const end = timeToMinutes(entry.endTime);
        if (start === null || end === null || start >= end) return acc;
        return acc + (end - start) * (entry.days || []).length;
      }, 0);

      const guidanceMinutes = scheduleGuidanceRoutines.reduce((acc, entry) => {
        if (!(entry.gradeKeys || []).includes(row.key)) return acc;
        const start = timeToMinutes(entry.startTime);
        const end = timeToMinutes(entry.endTime);
        if (start === null || end === null || start >= end) return acc;
        return acc + (end - start) * (entry.days || []).length;
      }, 0);

      const controlMinutes = scheduleControl.reduce((acc, entry) => {
        if (!(entry.gradeKeys || []).includes(row.key)) return acc;
        const start = timeToMinutes(entry.startTime);
        const end = timeToMinutes(entry.endTime);
        if (start === null || end === null || start >= end) return acc;
        return acc + (end - start) * (entry.days || []).length;
      }, 0);

      const sportsMinutes = scheduleSports.reduce((acc, entry) => {
        if (!(entry.gradeKeys || []).includes(row.key)) return acc;
        const start = timeToMinutes(entry.startTime);
        const end = timeToMinutes(entry.endTime);
        if (start === null || end === null || start >= end) return acc;
        return acc + (end - start) * (entry.days || []).length;
      }, 0);

      const otherBlockMinutes = scheduleOtherBlocks.reduce((acc, entry) => {
        if (!(entry.gradeKeys || []).includes(row.key)) return acc;
        const start = timeToMinutes(entry.startTime);
        const end = timeToMinutes(entry.endTime);
        if (start === null || end === null || start >= end) return acc;
        return acc + (end - start) * (entry.days || []).length;
      }, 0);

      const availableMinutes = classMinutes > 0
        ? classMinutes
        : shiftMinutes - breakMinutes - guidanceMinutes - controlMinutes - sportsMinutes - otherBlockMinutes;
      const classBlockMinutes = getClassBlockMinutesForGrade(row.key);

      const assignedMinutes = subjectLoads.reduce((acc, load) => {
        if (!(load.gradeKeys || []).includes(row.key)) return acc;
        const minutes = getLoadWeeklyMinutes(load, getLoadBlockMinutesForGrade(load, row.key));
        if (minutes <= 0) return acc;
        return acc + minutes;
      }, 0);

      const remainingMinutes = availableMinutes - assignedMinutes;
      const availableWholeBlocks = explicitClassBlockGroups.length > 0
        ? explicitClassBlockGroups.reduce((acc, group) => acc + group.count, 0)
        : classBlockMinutes > 0
          ? Math.max(0, Math.floor(availableMinutes / classBlockMinutes))
          : 0;
      const availableBlockGroups = explicitClassBlockGroups.length > 0
        ? explicitClassBlockGroups
        : classBlockMinutes > 0 && availableWholeBlocks > 0
          ? [{ minutes: classBlockMinutes, count: availableWholeBlocks }]
          : [];
      const assignedBlockGroupsMap = subjectLoads.reduce((acc, load) => {
        if (!(load.gradeKeys || []).includes(row.key)) return acc;
        const blockMinutes = getLoadBlockMinutesForGrade(load, row.key);
        const blockCount = getLoadWeeklyBlocks(load, blockMinutes);
        if (blockCount <= 0) return acc;
        acc[blockMinutes] = (acc[blockMinutes] || 0) + blockCount;
        return acc;
      }, {});
      const assignedBlockGroups = getSortedBlockGroupsFromMap(assignedBlockGroupsMap)
        .filter((group) => group.count > 0);
      const assignedBlocks = assignedBlockGroups.reduce((acc, group) => acc + group.count, 0);
      const remainingBlockGroups = getRemainingBlockGroups(availableBlockGroups, assignedBlockGroups);
      const remainingWholeBlocks = remainingBlockGroups.reduce((acc, group) => acc + group.count, 0);
      const hasBlockMixDifference = remainingBlockGroups.length > 0;

      return {
        ...row,
        shiftMinutes,
        classMinutes,
        explicitClassBlockGroups,
        breakMinutes,
        guidanceMinutes,
        controlMinutes,
        sportsMinutes,
        otherBlockMinutes,
        availableMinutes,
        availableBlockGroups,
        assignedMinutes,
        assignedBlockGroups,
        remainingMinutes,
        availableBlocks: availableWholeBlocks,
        assignedBlocks,
        remainingBlockGroups,
        remainingBlocks: remainingWholeBlocks,
        hasBlockMixDifference,
      };
    });
  }, [
    gradeRows,
    scheduleShifts,
    scheduleClassSlots,
    scheduleBreaks,
    scheduleGuidanceRoutines,
    scheduleControl,
    scheduleSports,
    scheduleOtherBlocks,
    subjectLoads,
    classBlockMinutesByGrade,
  ]);

  const schedulePrevalidationAnalysis = useMemo(() => {
    if (!shouldRunScheduleDiagnostics || gradeRows.length === 0) {
      return {
        blockingIssues: [],
        courseIssues: [],
        durationAuditByGrade: {},
        teacherIssues: [],
        slotsByGrade: {},
        subjectDemandBlocks: {},
        teacherCapacityBlocksBySubject: {},
      };
    }

    const gradeLabelByKey = Object.fromEntries(gradeRows.map((row) => [row.key, `${row.grade} ${row.levelName}`]));
    const shiftIntervalsByGradeDay = {};
    const explicitClassIntervalsByGradeDay = {};
    const blockedIntervalsByGradeDay = {};

    const pushGradeDayInterval = (target, gradeKey, day, interval) => {
      const key = `${gradeKey}::${day}`;
      if (!target[key]) target[key] = [];
      target[key].push(interval);
    };

    scheduleShifts.forEach((entry) => {
      const startMin = timeToMinutes(entry.startTime);
      const endMin = timeToMinutes(entry.endTime);
      if (startMin === null || endMin === null || endMin <= startMin) return;

      (entry.gradeKeys || []).forEach((gradeKey) => {
        (entry.days || []).forEach((day) => {
          pushGradeDayInterval(shiftIntervalsByGradeDay, gradeKey, day, { startMin, endMin });
        });
      });
    });

    scheduleClassSlots.forEach((entry) => {
      const startMin = timeToMinutes(entry.startTime);
      const endMin = timeToMinutes(entry.endTime);
      if (startMin === null || endMin === null || endMin <= startMin) return;

      (entry.gradeKeys || []).forEach((gradeKey) => {
        (entry.days || []).forEach((day) => {
          pushGradeDayInterval(explicitClassIntervalsByGradeDay, gradeKey, day, { startMin, endMin });
        });
      });
    });

    [scheduleBreaks, scheduleGuidanceRoutines, scheduleControl, scheduleSports, scheduleOtherBlocks].forEach((entries) => {
      entries.forEach((entry) => {
        const startMin = timeToMinutes(entry.startTime);
        const endMin = timeToMinutes(entry.endTime);
        if (startMin === null || endMin === null || endMin <= startMin) return;

        (entry.gradeKeys || []).forEach((gradeKey) => {
          (entry.days || []).forEach((day) => {
            pushGradeDayInterval(blockedIntervalsByGradeDay, gradeKey, day, { startMin, endMin });
          });
        });
      });
    });

    Object.keys(shiftIntervalsByGradeDay).forEach((key) => {
      shiftIntervalsByGradeDay[key] = mergeTimeIntervals(shiftIntervalsByGradeDay[key]);
    });
    Object.keys(explicitClassIntervalsByGradeDay).forEach((key) => {
      explicitClassIntervalsByGradeDay[key] = normalizeDiscreteTimeIntervals(explicitClassIntervalsByGradeDay[key]);
    });
    Object.keys(blockedIntervalsByGradeDay).forEach((key) => {
      blockedIntervalsByGradeDay[key] = mergeTimeIntervals(blockedIntervalsByGradeDay[key]);
    });

    const slotsByGrade = {};
    const durationAuditByGrade = {};
    const courseIssues = [];
    const subjectDemandBlocks = {};
    const subjectDemandBlocksByGrade = {};
    const subjectBlockMinutesByGrade = {};
    const requiredBlockMinutesByGrade = Object.fromEntries(
      gradeRows.map((row) => {
        const minutes = [...new Set(
          subjectLoads
            .filter((load) => (load.gradeKeys || []).includes(row.key))
            .map((load) => getLoadBlockMinutesForGrade(load, row.key))
            .filter((value) => Number.isFinite(value) && value > 0),
        )].sort((left, right) => left - right);

        return [row.key, minutes];
      }),
    );

    gradeRows.forEach((row) => {
      const gradeKey = row.key;
      const classBlockMinutes = getClassBlockMinutesForGrade(gradeKey);
      const slots = [];
      const hasAnyExplicitWindows = Object.keys(explicitClassIntervalsByGradeDay).some((key) => key.startsWith(`${gradeKey}::`));
      const rawExplicitSlotsByMinutes = {};
      const usableDiscreteSlotsByMinutes = {};

      Object.entries(explicitClassIntervalsByGradeDay).forEach(([gradeDayKey, intervals]) => {
        if (!gradeDayKey.startsWith(`${gradeKey}::`)) return;

        intervals.forEach((interval) => {
          const minutes = getIntervalDuration(interval);
          if (minutes <= 0) return;
          rawExplicitSlotsByMinutes[minutes] = (rawExplicitSlotsByMinutes[minutes] || 0) + 1;
        });
      });

      WEEK_DAYS.forEach((day) => {
        const gradeDayKey = `${gradeKey}::${day}`;
        const shiftIntervals = shiftIntervalsByGradeDay[gradeDayKey] || [];
        const blockedIntervals = blockedIntervalsByGradeDay[gradeDayKey] || [];
        const explicitIntervals = explicitClassIntervalsByGradeDay[gradeDayKey] || [];

        if (explicitIntervals.length > 0) {
          explicitIntervals
            .filter((interval) =>
              shiftIntervals.some((shift) => interval.startMin >= shift.startMin && interval.endMin <= shift.endMin)
              && !blockedIntervals.some((blocked) => interval.startMin < blocked.endMin && blocked.startMin < interval.endMin),
            )
            .forEach((interval, index) => {
              const minutes = getIntervalDuration(interval);
              if (minutes <= 0) return;

              usableDiscreteSlotsByMinutes[minutes] = (usableDiscreteSlotsByMinutes[minutes] || 0) + 1;

              slots.push({
                id: `${gradeKey}__${day}__${index}__${interval.startMin}-${interval.endMin}`,
                gradeKey,
                day,
                startMin: interval.startMin,
                endMin: interval.endMin,
                minutes,
                isProgrammable: true,
              });
            });
          return;
        }

        if (hasAnyExplicitWindows || shiftIntervals.length === 0 || !Number.isFinite(classBlockMinutes) || classBlockMinutes <= 0) {
          return;
        }

        const freeIntervals = subtractTimeIntervals(shiftIntervals, blockedIntervals);
        freeIntervals.forEach((interval, intervalIndex) => {
          const intervalMinutes = interval.endMin - interval.startMin;
          const fullSlotCount = Math.floor(intervalMinutes / classBlockMinutes);

          for (let slotIndex = 0; slotIndex < fullSlotCount; slotIndex += 1) {
            const startMin = interval.startMin + (slotIndex * classBlockMinutes);
            const endMin = startMin + classBlockMinutes;
            slots.push({
              id: `${gradeKey}__${day}__${intervalIndex}__${slotIndex}__${startMin}-${endMin}`,
              gradeKey,
              day,
              startMin,
              endMin,
              minutes: classBlockMinutes,
              isProgrammable: true,
            });
          }
        });
      });

      const availableByMinutes = slots.reduce((acc, slot) => {
        acc[slot.minutes] = (acc[slot.minutes] || 0) + 1;
        return acc;
      }, {});
      const courseCount = Math.max(1, courseCountByGradeKey[gradeKey] || 1);
      const totalAvailableByMinutes = Object.fromEntries(
        Object.entries(availableByMinutes).map(([minutes, count]) => [minutes, count * courseCount]),
      );

      const requiredByMinutes = {};
      subjectLoads
        .filter((load) => (load.gradeKeys || []).includes(gradeKey))
        .forEach((load) => {
          const blockMinutes = getLoadBlockMinutesForGrade(load, gradeKey);
          const requiredBlocks = getLoadWeeklyBlocks(load, blockMinutes);
          if (requiredBlocks <= 0) return;

          requiredByMinutes[blockMinutes] = (requiredByMinutes[blockMinutes] || 0) + (requiredBlocks * courseCount);
          if (!subjectBlockMinutesByGrade[load.subject]) subjectBlockMinutesByGrade[load.subject] = {};
          if (!subjectBlockMinutesByGrade[load.subject][gradeKey]) subjectBlockMinutesByGrade[load.subject][gradeKey] = new Set();
          subjectBlockMinutesByGrade[load.subject][gradeKey].add(blockMinutes);
          if (!subjectDemandBlocksByGrade[load.subject]) subjectDemandBlocksByGrade[load.subject] = {};
          subjectDemandBlocksByGrade[load.subject][gradeKey] = (subjectDemandBlocksByGrade[load.subject][gradeKey] || 0) + (requiredBlocks * courseCount);

          subjectDemandBlocks[load.subject] = (subjectDemandBlocks[load.subject] || 0) + (requiredBlocks * courseCount);
        });

      const remainingByMinutes = getRemainingBlockGroups(
        getSortedBlockGroupsFromMap(totalAvailableByMinutes),
        getSortedBlockGroupsFromMap(requiredByMinutes),
      );

      if (remainingByMinutes.length > 0) {
        const label = gradeLabelByKey[gradeKey] || gradeKey;
        const availableLabel = formatClassBlockMix(getSortedBlockGroupsFromMap(totalAvailableByMinutes));
        const requiredLabel = formatClassBlockMix(getSortedBlockGroupsFromMap(requiredByMinutes));
        courseIssues.push(
          `${label}: requiere ${requiredLabel} y solo tiene ${availableLabel} en slots programables reales. ${formatRemainingClassBlockMix(remainingByMinutes)}.`,
        );
      }

      const auditMinuteKeys = [...new Set([
        ...Object.keys(rawExplicitSlotsByMinutes),
        ...Object.keys(usableDiscreteSlotsByMinutes),
        ...Object.keys(requiredByMinutes),
        ...Object.keys(totalAvailableByMinutes),
        ...(requiredBlockMinutesByGrade[gradeKey] || []).map(String),
      ])]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((left, right) => left - right);

      durationAuditByGrade[gradeKey] = auditMinuteKeys.map((minutes) => ({
        minutes,
        rawExplicitSlots: rawExplicitSlotsByMinutes[minutes] || 0,
        derivedCompatibleSlots: 0,
        realUsableDiscreteSlots: usableDiscreteSlotsByMinutes[minutes] || 0,
        finalCountedCapacity: totalAvailableByMinutes[minutes] || 0,
        requiredSlots: requiredByMinutes[minutes] || 0,
      }));

      slotsByGrade[gradeKey] = slots;
    });

    const activeTeachers = (staffByRole.docencia?.members || []).filter((member) => isTeacherSchedulable(member));
    const teacherCapacityBlocksBySubject = {};
    const teacherCapacityBySubjectByTeacher = {};
    const teacherNominalMinutesBySubject = {};
    const teacherRawCompatibleBlocksBySubject = {};
    const teacherCompatibleMinutesBySubject = {};
    const teacherCompatibleSlotsBySubjectByTeacher = {};
    const teacherIssues = [];

    activeTeachers.forEach((teacher, teacherIndex) => {
      const availabilityByDay = getTeacherAvailabilityByDay(teacher);
      const gradeKeys = new Set(getTeacherAssignedGradeKeys(teacher));
      const nominalWeeklyMinutes = getTeacherWeeklyAvailableMinutes(teacher);
      const teacherKey = String(teacher?.id || '').trim() || `${String(teacher?.name || 'docente').trim() || 'docente'}::${teacherIndex}`;

      (teacher.subjects || []).forEach((subject) => {
        const compatibleSlots = [];
        const compatibleSlotsByGrade = {};

        gradeKeys.forEach((gradeKey) => {
          const validMinutes = subjectBlockMinutesByGrade[subject]?.[gradeKey];
          if (!validMinutes || validMinutes.size === 0) return;

          (slotsByGrade[gradeKey] || []).forEach((slot) => {
            if (!validMinutes.has(slot.minutes)) return;
            const fitsTeacher = (availabilityByDay[slot.day] || []).some(
              (interval) => slot.startMin >= interval.startMin && slot.endMin <= interval.endMin,
            );
            if (!fitsTeacher) return;

            compatibleSlots.push({
              day: slot.day,
              startMin: slot.startMin,
              endMin: slot.endMin,
              minutes: slot.minutes,
              gradeKey,
            });

            if (!compatibleSlotsByGrade[gradeKey]) compatibleSlotsByGrade[gradeKey] = [];
            compatibleSlotsByGrade[gradeKey].push({
              day: slot.day,
              startMin: slot.startMin,
              endMin: slot.endMin,
              minutes: slot.minutes,
              gradeKey,
            });
          });
        });

        const packableSlots = selectPackableWeeklySlots(compatibleSlots);
        const compatibleBlocks = packableSlots.length;
        const rawCompatibleBlocks = compatibleSlots.length;
        const compatibleMinutes = packableSlots.reduce((acc, slot) => acc + slot.minutes, 0);

        if (!teacherCapacityBySubjectByTeacher[subject]) teacherCapacityBySubjectByTeacher[subject] = {};
        teacherCapacityBySubjectByTeacher[subject][teacherKey] = {
          blocks: compatibleBlocks,
          rawBlocks: rawCompatibleBlocks,
          compatibleMinutes,
          nominalMinutes: nominalWeeklyMinutes,
          teacherName: String(teacher?.name || '').trim() || `Docente ${teacherIndex + 1}`,
        };
        if (!teacherCompatibleSlotsBySubjectByTeacher[subject]) teacherCompatibleSlotsBySubjectByTeacher[subject] = {};
        teacherCompatibleSlotsBySubjectByTeacher[subject][teacherKey] = {
          teacher,
          teacherKey,
          teacherName: String(teacher?.name || '').trim() || `Docente ${teacherIndex + 1}`,
          nominalMinutes: nominalWeeklyMinutes,
          assignedGradeKeys: [...gradeKeys],
          compatibleSlotsByGrade,
        };
      });
    });

    Object.entries(subjectDemandBlocks).forEach(([subject, demandBlocks]) => {
      const subjectTeacherEntries = Object.values(teacherCompatibleSlotsBySubjectByTeacher[subject] || {});
      const subjectGradeDemand = subjectDemandBlocksByGrade[subject] || {};
      const subjectGradeKeys = [...new Set([
        ...Object.keys(subjectGradeDemand),
        ...subjectTeacherEntries.flatMap((entry) => Object.keys(entry.compatibleSlotsByGrade || {})),
      ])];
      const components = buildTeacherGradeConnectivityComponents(
        subjectTeacherEntries.map((entry) => ({
          teacherKey: entry.teacherKey,
          gradeKeys: entry.assignedGradeKeys.filter((gradeKey) => subjectGradeKeys.includes(gradeKey)),
        })),
        subjectGradeKeys,
      );
      const subjectBlockMinutes = [...new Set(
        Object.values(subjectBlockMinutesByGrade[subject] || {}).flatMap((minutesSet) => [...minutesSet]),
      )].sort((left, right) => left - right);
      const blockDurationLabel = subjectBlockMinutes.length === 1
        ? ` de ${subjectBlockMinutes[0]} min`
        : '';
      const demandLabel = subjectBlockMinutes.length === 1
        ? `${demandBlocks} slot(s)${blockDurationLabel} (${minutesToHoursLabel(demandBlocks * subjectBlockMinutes[0])})`
        : `${demandBlocks} slot(s)`;
      let capacityBlocks = 0;
      let compatibleMinutes = 0;
      let nominalMinutes = 0;
      let rawCompatibleBlocks = 0;
      let largestTeacherCount = 0;

      components.forEach((component) => {
        const componentDemandBlocks = component.gradeKeys.reduce(
          (acc, gradeKey) => acc + (subjectGradeDemand[gradeKey] || 0),
          0,
        );
        if (componentDemandBlocks <= 0 && component.teacherKeys.length === 0) return;

        const componentTeacherEntries = component.teacherKeys
          .map((teacherKey) => teacherCompatibleSlotsBySubjectByTeacher[subject]?.[teacherKey])
          .filter(Boolean);
        const componentTeacherCapacities = componentTeacherEntries.map((entry) => {
          const componentCompatibleSlots = component.gradeKeys.flatMap((gradeKey) => entry.compatibleSlotsByGrade?.[gradeKey] || []);
          const componentPackableSlots = selectPackableWeeklySlots(componentCompatibleSlots);
          return {
            teacherName: entry.teacherName,
            blocks: componentPackableSlots.length,
            rawBlocks: componentCompatibleSlots.length,
            compatibleMinutes: componentPackableSlots.reduce((acc, slot) => acc + slot.minutes, 0),
            nominalMinutes: entry.nominalMinutes,
          };
        });

        const componentCapacityBlocks = componentTeacherCapacities.reduce((acc, entry) => acc + entry.blocks, 0);
        const componentRawCompatibleBlocks = componentTeacherCapacities.reduce((acc, entry) => acc + entry.rawBlocks, 0);
        const componentCompatibleMinutes = componentTeacherCapacities.reduce((acc, entry) => acc + entry.compatibleMinutes, 0);
        const componentNominalMinutes = componentTeacherCapacities.reduce((acc, entry) => acc + entry.nominalMinutes, 0);

        capacityBlocks += componentCapacityBlocks;
        rawCompatibleBlocks += componentRawCompatibleBlocks;
        compatibleMinutes += componentCompatibleMinutes;
        nominalMinutes += componentNominalMinutes;
        largestTeacherCount = Math.max(largestTeacherCount, componentTeacherEntries.length);

        componentTeacherEntries.forEach((entry, index) => {
          const existing = teacherCapacityBySubjectByTeacher[subject]?.[entry.teacherKey] || {
            blocks: 0,
            rawBlocks: 0,
            compatibleMinutes: 0,
            nominalMinutes: entry.nominalMinutes,
            teacherName: entry.teacherName,
          };
          teacherCapacityBySubjectByTeacher[subject][entry.teacherKey] = {
            ...existing,
            blocks: existing.blocks + (componentTeacherCapacities[index]?.blocks || 0),
            rawBlocks: existing.rawBlocks + (componentTeacherCapacities[index]?.rawBlocks || 0),
            compatibleMinutes: existing.compatibleMinutes + (componentTeacherCapacities[index]?.compatibleMinutes || 0),
          };
        });

        if (componentCapacityBlocks >= componentDemandBlocks) return;

        const positiveCapacities = componentTeacherCapacities
          .map((entry) => entry.blocks)
          .filter((value) => Number.isFinite(value) && value > 0);
        const averageCapacity = positiveCapacities.length
          ? Math.max(1, Math.round(positiveCapacities.reduce((acc, value) => acc + value, 0) / positiveCapacities.length))
          : 0;
        const missingBlocks = componentDemandBlocks - componentCapacityBlocks;
        const levelLabels = [...new Set(
          component.gradeKeys
            .map((gradeKey) => gradeRows.find((row) => row.key === gradeKey)?.levelName)
            .filter(Boolean),
        )].sort((a, b) => a.localeCompare(b, 'es'));
        const poolLabel = levelLabels.length === 1
          ? levelLabels[0]
          : component.gradeKeys
            .map((gradeKey) => gradeLabelByKey[gradeKey] || gradeKey)
            .sort((a, b) => a.localeCompare(b, 'es'))
            .slice(0, 4)
            .join(', ');
        const componentDemandLabel = subjectBlockMinutes.length === 1
          ? `${componentDemandBlocks} slot(s)${blockDurationLabel} (${minutesToHoursLabel(componentDemandBlocks * subjectBlockMinutes[0])})`
          : `${componentDemandBlocks} slot(s)`;
        const componentCapacityLabel = componentCompatibleMinutes > 0
          ? `${componentCapacityBlocks} bloque(s) encadenables${blockDurationLabel} (${minutesToHoursLabel(componentCompatibleMinutes)} de clase)`
          : `${componentCapacityBlocks} bloque(s) encadenables${blockDurationLabel}`;
        const componentRawCompatibilityLabel = componentRawCompatibleBlocks !== componentCapacityBlocks
          ? `${componentRawCompatibleBlocks} slot(s) compatibles brutos, pero solo ${componentCapacityLabel}`
          : componentCapacityLabel;
        const totalTeachersNeeded = averageCapacity > 0 ? Math.ceil(componentDemandBlocks / averageCapacity) : null;
        const additionalTeachersNeeded = totalTeachersNeeded !== null
          ? Math.max(0, totalTeachersNeeded - componentTeacherEntries.length)
          : null;

        teacherIssues.push(
          additionalTeachersNeeded > 0
            ? `${subject} (${poolLabel}): demanda real ${componentDemandLabel} y la grilla actual solo deja ${componentRawCompatibilityLabel}. Este pool docente tiene ${minutesToHoursLabel(componentNominalMinutes)} nominales configuradas, pero solo ${minutesToHoursLabel(componentCompatibleMinutes)} se pueden empaquetar sin cruces reales dentro de sus grados asignados; faltan ${missingBlocks} bloque(s) encadenables. Si mantienes esta misma grilla, eso equivale a ${additionalTeachersNeeded} docente(s) adicional(es) (${totalTeachersNeeded} en total) o a abrir ${missingBlocks} bloque(s) más para esta asignatura en este pool.`
            : `${subject} (${poolLabel}): demanda real ${componentDemandLabel} y la grilla actual solo deja ${componentRawCompatibilityLabel}. Este pool docente tiene ${minutesToHoursLabel(componentNominalMinutes)} nominales configuradas, pero solo ${minutesToHoursLabel(componentCompatibleMinutes)} se pueden empaquetar sin cruces reales dentro de sus grados asignados; faltan ${missingBlocks} bloque(s) encadenables.`,
        );
      });

      teacherCapacityBlocksBySubject[subject] = capacityBlocks;
      teacherRawCompatibleBlocksBySubject[subject] = rawCompatibleBlocks;
      teacherNominalMinutesBySubject[subject] = nominalMinutes;
      teacherCompatibleMinutesBySubject[subject] = compatibleMinutes;

      if (capacityBlocks >= demandBlocks) return;

      const compatibleCapacityLabel = compatibleMinutes > 0
        ? `${capacityBlocks} bloque(s) encadenables${blockDurationLabel} (${minutesToHoursLabel(compatibleMinutes)} de clase)`
        : `${capacityBlocks} bloque(s) encadenables${blockDurationLabel}`;
      const rawCompatibilityLabel = rawCompatibleBlocks !== capacityBlocks
        ? `${rawCompatibleBlocks} slot(s) compatibles brutos, pero solo ${compatibleCapacityLabel}`
        : compatibleCapacityLabel;
      const missingBlocks = demandBlocks - capacityBlocks;
      const aggregatePoolCount = components.filter((component) => component.gradeKeys.some((gradeKey) => (subjectGradeDemand[gradeKey] || 0) > 0)).length;

      if (teacherIssues.some((issue) => issue.startsWith(`${subject} (`))) return;

      teacherIssues.push(
        `${subject}: demanda real ${demandLabel} y la grilla actual solo deja ${rawCompatibilityLabel}. La capacidad ya fue separada por ${aggregatePoolCount} pool(es) independientes para evitar cruces falsos entre primaria y secundaria, pero aun asi faltan ${missingBlocks} bloque(s) encadenables.`,
      );
    });

    return {
      blockingIssues: [...new Set([...courseIssues, ...teacherIssues])],
      courseIssues,
      durationAuditByGrade,
      teacherIssues,
      slotsByGrade,
      subjectDemandBlocks,
      teacherCapacityBlocksBySubject,
    };
  }, [
    shouldRunScheduleDiagnostics,
    gradeRows,
    scheduleShifts,
    scheduleClassSlots,
    scheduleBreaks,
    scheduleGuidanceRoutines,
    scheduleControl,
    scheduleSports,
    scheduleOtherBlocks,
    subjectLoads,
    staffByRole,
    courseCountByGradeKey,
    classBlockMinutesByGrade,
  ]);

  const gradeRowByKey = useMemo(
    () => Object.fromEntries(gradeRows.map((row) => [row.key, row])),
    [gradeRows],
  );

  const plannerClassHoursSummary = useMemo(
    () => plannerGradeKeys
      .map((gradeKey) => {
        const previewRow = weeklyLoadByGradePreview.find((item) => item.key === gradeKey);
        if (!previewRow) return null;

        return {
          gradeKey,
          label: `${previewRow.grade} ${previewRow.levelName}`,
          totalBlocks: previewRow.availableBlocks,
          blockMix: previewRow.explicitClassBlockGroups,
        };
      })
      .filter(Boolean),
    [plannerGradeKeys, weeklyLoadByGradePreview],
  );

  const weeklyDemandBySubject = useMemo(() => {
    const demand = {};

    subjectLoads.forEach((load) => {
      (load.gradeKeys || []).forEach((gradeKey) => {
        const weeklyMinutesPerCourse = getLoadWeeklyMinutes(load, getLoadBlockMinutesForGrade(load, gradeKey));
        if (weeklyMinutesPerCourse <= 0) return;
        const courseCount = Math.max(1, courseCountByGradeKey[gradeKey] || 1);
        demand[load.subject] = (demand[load.subject] || 0) + (weeklyMinutesPerCourse * courseCount);
      });
    });

    return demand;
  }, [subjectLoads, courseCountByGradeKey, classBlockMinutesByGrade]);

  const weeklyDemandBySubjectFiltered = useMemo(() => {
    if (!loadPreviewFilterGradeKey) return weeklyDemandBySubject;

    const demand = {};
    subjectLoads.forEach((load) => {
      if (!(load.gradeKeys || []).includes(loadPreviewFilterGradeKey)) return;
      const weeklyMinutesPerCourse = getLoadWeeklyMinutes(load, getLoadBlockMinutesForGrade(load, loadPreviewFilterGradeKey));
      if (weeklyMinutesPerCourse <= 0) return;
      const courseCount = Math.max(1, courseCountByGradeKey[loadPreviewFilterGradeKey] || 1);
      demand[load.subject] = (demand[load.subject] || 0) + (weeklyMinutesPerCourse * courseCount);
    });

    return demand;
  }, [
    loadPreviewFilterGradeKey,
    weeklyDemandBySubject,
    subjectLoads,
    courseCountByGradeKey,
    classBlockMinutesByGrade,
  ]);

  const weeklyDemandBlocksBySubjectFiltered = useMemo(() => {
    const demand = {};

    subjectLoads.forEach((load) => {
      (load.gradeKeys || []).forEach((gradeKey) => {
        if (loadPreviewFilterGradeKey && gradeKey !== loadPreviewFilterGradeKey) return;

        const weeklyBlocksPerCourse = getLoadWeeklyBlocks(load, getLoadBlockMinutesForGrade(load, gradeKey));
        if (weeklyBlocksPerCourse <= 0) return;

        const courseCount = Math.max(1, courseCountByGradeKey[gradeKey] || 1);
        demand[load.subject] = (demand[load.subject] || 0) + (weeklyBlocksPerCourse * courseCount);
      });
    });

    return demand;
  }, [subjectLoads, loadPreviewFilterGradeKey, courseCountByGradeKey, classBlockMinutesByGrade]);

  const subjectLoadsForDisplay = useMemo(
    () => subjectLoads
      .map((load, index) => ({ load, index }))
      .filter(({ load }) => !loadPreviewFilterGradeKey || (load.gradeKeys || []).includes(loadPreviewFilterGradeKey)),
    [subjectLoads, loadPreviewFilterGradeKey],
  );

  const weeklyDocenciaSupplyBySubject = useMemo(() => {
    const supply = {};

    (staffByRole.docencia?.members || []).forEach((member) => {
      if (!isTeacherSchedulable(member)) return;
      const weeklyMinutes = getTeacherWeeklyAvailableMinutes(member);
      if (weeklyMinutes <= 0) return;

      (member.subjects || []).forEach((subject) => {
        supply[subject] = (supply[subject] || 0) + weeklyMinutes;
      });
    });

    return supply;
  }, [staffByRole.docencia, gradeKeysByLevel]);

  const generatedScheduleConflictAnalysis = useMemo(() => {
    const blockingIssues = [];
    const conflictCountBySubject = {};

    Object.values(generatedCourseSchedules || {}).forEach((schedule) => {
      (schedule.conflicts || []).forEach((issue) => {
        const matchedSubjects = extractSubjectsFromSchedulingConflict(issue, subjects);
        matchedSubjects.forEach((subject) => {
          conflictCountBySubject[subject] = (conflictCountBySubject[subject] || 0) + 1;
          blockingIssues.push(`${subject}: la última generación reportó conflicto de horario. ${issue}`);
        });
      });
    });

    return {
      conflictCountBySubject,
      blockingIssues: [...new Set(blockingIssues)],
    };
  }, [generatedCourseSchedules, subjects]);

  const loadBalanceIssues = useMemo(() => {
    const issues = [];
    weeklyLoadByGradePreview.forEach((row) => {
      if (row.availableMinutes < 0) {
        issues.push(`${row.grade} ${row.levelName}: breaks/guidance/control/deportes/otros exceden el tiempo de jornada.`);
        return;
      }

      if (row.remainingMinutes < 0) {
        issues.push(
          `${row.grade} ${row.levelName}: excede la carga semanal (${formatRemainingClassBlockMix(row.remainingBlockGroups)}).`,
        );
        return;
      }

      if (row.hasBlockMixDifference) {
        issues.push(
          `${row.grade} ${row.levelName}: ${formatRemainingClassBlockMix(row.remainingBlockGroups)} para completar la jornada semanal por bloques.`,
        );
      }
    });

    return issues;
  }, [weeklyLoadByGradePreview]);

  const teacherCoverageAnalysis = useMemo(() => {
    const activeTeachers = (staffByRole.docencia?.members || []).filter((member) => isTeacherSchedulable(member));
    const parallelCoverageAnalysis = getTeacherParallelCoverageAnalysis();

    const teacherCapacityMinutes = activeTeachers.map((teacher) => getTeacherWeeklyAvailableMinutes(teacher));

    const averageTeacherCapacity = teacherCapacityMinutes.length
      ? Math.round(teacherCapacityMinutes.reduce((acc, value) => acc + value, 0) / teacherCapacityMinutes.length)
      : 0;

    const subjectDemandMinutes = { ...weeklyDemandBySubject };
    const subjectSupplyMinutes = {};
    const blockingIssues = [];
    const uncoveredCourseCountBySubject = {};
    const demandGapMinutesBySubject = {};
    const uncoveredPairs = new Set();

    subjectLoads.forEach((load) => {
      (load.gradeKeys || []).forEach((gradeKey) => {
        const weeklyMinutes = getLoadWeeklyMinutes(load, getLoadBlockMinutesForGrade(load, gradeKey));
        if (weeklyMinutes <= 0) return;
        const candidates = activeTeachers.filter(
          (teacher) => (teacher.subjects || []).includes(load.subject) && getTeacherAssignedGradeKeys(teacher).includes(gradeKey),
        );

        if (candidates.length === 0) {
          const grade = gradeRows.find((row) => row.key === gradeKey);
          const pairKey = `${load.subject}::${gradeKey}`;
          if (!uncoveredPairs.has(pairKey)) {
            uncoveredPairs.add(pairKey);
            uncoveredCourseCountBySubject[load.subject] = (uncoveredCourseCountBySubject[load.subject] || 0) + 1;
          }
          blockingIssues.push(
            `Sin cobertura docente para ${load.subject} en ${grade ? `${grade.grade} ${grade.levelName}` : gradeKey}.`,
          );
        }
      });
    });

    subjects.forEach((subject) => {
      subjectSupplyMinutes[subject] = weeklyDocenciaSupplyBySubject[subject] || 0;
    });

    Object.entries(subjectDemandMinutes).forEach(([subject, demand]) => {
      const supply = subjectSupplyMinutes[subject] || 0;
      if (supply >= demand) return;
      const missing = demand - supply;
      demandGapMinutesBySubject[subject] = missing;
      const suggestedTeachers = averageTeacherCapacity > 0 ? Math.ceil(missing / averageTeacherCapacity) : null;
      blockingIssues.push(
        suggestedTeachers
          ? `${subject}: faltan ${minutesToHoursLabel(missing)} semanales. Recomendación: agregar ${suggestedTeachers} docente(s) con esta asignatura o ampliar jornadas.`
          : `${subject}: faltan ${minutesToHoursLabel(missing)} semanales de cobertura docente.`,
      );
    });

    return {
      subjectDemandMinutes,
      subjectSupplyMinutes,
      uncoveredCourseCountBySubject,
      slotCapacityGapBlocksBySubject: parallelCoverageAnalysis.slotCapacityGapBlocksBySubject,
      demandGapMinutesBySubject,
      blockingIssues: [
        ...new Set([
          ...blockingIssues,
          ...parallelCoverageAnalysis.blockingIssues,
        ]),
      ],
      activeTeacherCount: activeTeachers.length,
    };
  }, [
    staffByRole,
    subjectLoads,
    subjects,
    gradeRows,
    weeklyDemandBySubject,
    weeklyDocenciaSupplyBySubject,
    classBlockMinutesByGrade,
    gradeKeysByLevel,
    scheduleClassSlots,
    courseCountByGradeKey,
  ]);

  const teacherBlockingIssues = useMemo(
    () => [...new Set([...teacherCoverageAnalysis.blockingIssues, ...schedulePrevalidationAnalysis.teacherIssues])],
    [teacherCoverageAnalysis.blockingIssues, schedulePrevalidationAnalysis.teacherIssues],
  );

  const solveCourseSchedulesWithCsp = (
    gradeKeySet,
    solverSeed = 0,
    seededCourseSchedules = generatedCourseSchedules,
    options = {},
  ) => {
    const maxNodes = Number.isFinite(options.maxNodes) && options.maxNodes > 0
      ? Math.floor(options.maxNodes)
      : SCHEDULE_SOLVER_MAX_NODES;

    if (!gradeKeySet || gradeKeySet.size === 0) {
      return {
        byCourse: {},
        blockingIssues: [],
        unitDomains: {},
        solverDiagnostics: {
          solved: true,
          assignedUnits: 0,
          totalUnits: 0,
          nodesVisited: 0,
        },
      };
    }

    const parseTimeWindow = (startTime, endTime) => {
      const startMin = timeToMinutes(startTime);
      const endMin = timeToMinutes(endTime);
      if (startMin === null || endMin === null || endMin <= startMin) return null;
      return { startMin, endMin };
    };

    const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
    const toSlotKey = (day, startMin, endMin) => `${day}::${startMin}-${endMin}`;
    const getSeededRank = (...parts) => {
      const input = `${solverSeed}::${parts.join('::')}`;
      let hash = 2166136261 ^ (solverSeed >>> 0);

      for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }

      return hash >>> 0;
    };

    const getExplorationBias = (magnitude, ...parts) => {
      if (!magnitude) return 0;
      const normalized = getSeededRank(...parts) / 4294967295;
      return Math.round(((normalized * 2) - 1) * magnitude);
    };

    const courseKeySet = options?.courseKeySet instanceof Set ? options.courseKeySet : null;
    const filteredCourseRows = getSchedulableCourseRows().filter(
      (course) => gradeKeySet.has(course.gradeKey) && (!courseKeySet || courseKeySet.has(course.courseKey)),
    );
    if (filteredCourseRows.length === 0) {
      return {
        byCourse: {},
        blockingIssues: [],
        unitDomains: {},
        solverDiagnostics: {
          solved: true,
          assignedUnits: 0,
          totalUnits: 0,
          nodesVisited: 0,
        },
      };
    }

    const docentes = (staffByRole.docencia?.members || [])
      .filter((member) => isTeacherSchedulable(member))
      .map((member, index) => ({
        id: member.email || `docente-${index + 1}`,
        name: member.name,
        subjects: new Set(member.subjects || []),
        gradeKeys: new Set(getTeacherAssignedGradeKeys(member)),
        availabilityByDay: getTeacherAvailabilityByDay(member),
      }));
    const docentesById = Object.fromEntries(docentes.map((teacher) => [teacher.id, teacher]));

    const teacherCanAttend = (teacher, day, startMin, endMin) =>
      (teacher.availabilityByDay[day] || []).some((window) => startMin >= window.startMin && endMin <= window.endMin);

    const getTeacherCandidateIdsForSlot = (subject, gradeKey, day, startMin, endMin) =>
      docentes
        .filter(
          (teacher) =>
            teacher.subjects.has(subject)
            && teacher.gradeKeys.has(gradeKey)
            && teacherCanAttend(teacher, day, startMin, endMin),
        )
        .map((teacher) => teacher.id);

    const courseStatesByKey = {};
    const unitById = {};
    const unitOrder = [];
    const unitDomains = {};

    filteredCourseRows.forEach((course) => {
      const baseItems = [];
      const baseOccupiedByDay = {};
      const subjectTargetMinutes = {};
      const subjectBlockMinutesBySubject = {};
      const alreadyCoveredMinutesBySubject = {};
      const teacherCandidateCountBySubject = {};
      const staticConflicts = [];
      let baseItemIndex = 0;

      const createBaseItem = (payload) => ({
        id: `${course.courseKey}-base-${baseItemIndex += 1}`,
        ...payload,
      });

      const addBaseOccupied = (day, startMin, endMin) => {
        if (!baseOccupiedByDay[day]) baseOccupiedByDay[day] = [];
        baseOccupiedByDay[day].push({ startMin, endMin });
      };

      const addSystemBlocks = (sourceEntries, type, label) => {
        sourceEntries
          .filter((entry) => (entry.gradeKeys || []).includes(course.gradeKey))
          .forEach((entry) => {
            const window = parseTimeWindow(entry.startTime, entry.endTime);
            if (!window) return;
            (entry.days || []).forEach((day) => {
              baseItems.push(createBaseItem({
                type,
                label,
                day,
                subject: label,
                startMin: window.startMin,
                endMin: window.endMin,
              }));
              addBaseOccupied(day, window.startMin, window.endMin);
            });
          });
      };

      addSystemBlocks(scheduleBreaks, 'break', 'Break');
      addSystemBlocks(scheduleGuidanceRoutines, 'guidance', 'Guidance Routine');
      addSystemBlocks(scheduleControl, 'control', 'Control');
      addSystemBlocks(scheduleSports, 'sports', 'Deportes');
      scheduleOtherBlocks
        .filter((entry) => (entry.gradeKeys || []).includes(course.gradeKey))
        .forEach((entry) => {
          const window = parseTimeWindow(entry.startTime, entry.endTime);
          if (!window) return;
          (entry.days || []).forEach((day) => {
            baseItems.push(createBaseItem({
              type: 'other',
              label: entry.name || 'Otro',
              day,
              subject: entry.name || 'Otro',
              startMin: window.startMin,
              endMin: window.endMin,
            }));
            addBaseOccupied(day, window.startMin, window.endMin);
          });
        });

      const explicitClassWindowsByDay = {};
      scheduleClassSlots
        .filter((entry) => (entry.gradeKeys || []).includes(course.gradeKey))
        .forEach((entry) => {
          const window = parseTimeWindow(entry.startTime, entry.endTime);
          if (!window) return;
          (entry.days || []).forEach((day) => {
            if (!explicitClassWindowsByDay[day]) explicitClassWindowsByDay[day] = [];
            explicitClassWindowsByDay[day].push({ startMin: window.startMin, endMin: window.endMin });
          });
        });

      const hasExplicitClassWindows = Object.keys(explicitClassWindowsByDay).length > 0;
      const schedulableWindowsByDay = {};

      if (hasExplicitClassWindows) {
        Object.keys(explicitClassWindowsByDay).forEach((day) => {
          schedulableWindowsByDay[day] = normalizeDiscreteTimeIntervals(explicitClassWindowsByDay[day]);
        });
      } else {
        scheduleShifts
          .filter((shift) => (shift.gradeKeys || []).includes(course.gradeKey))
          .forEach((shift) => {
            const window = parseTimeWindow(shift.startTime, shift.endTime);
            if (!window) return;
            (shift.days || []).forEach((day) => {
              if (!schedulableWindowsByDay[day]) schedulableWindowsByDay[day] = [];
              schedulableWindowsByDay[day].push({ startMin: window.startMin, endMin: window.endMin });
            });
          });

        Object.keys(schedulableWindowsByDay).forEach((day) => {
          schedulableWindowsByDay[day] = mergeTimeIntervals(schedulableWindowsByDay[day]);
        });
      }

      subjectLoads
        .filter((load) => (load.gradeKeys || []).includes(course.gradeKey))
        .forEach((load) => {
          const loadBlockMinutes = getLoadBlockMinutesForGrade(load, course.gradeKey);
          const courseBlocks = getLoadWeeklyBlocks(load, loadBlockMinutes);
          if (courseBlocks <= 0) return;

          subjectTargetMinutes[load.subject] = courseBlocks * loadBlockMinutes;
          subjectBlockMinutesBySubject[load.subject] = loadBlockMinutes;
          teacherCandidateCountBySubject[load.subject] = docentes.filter(
            (teacher) => teacher.subjects.has(load.subject) && teacher.gradeKeys.has(course.gradeKey),
          ).length;
        });

      const cachedFlexibleSlotsByMinutes = new Map();
      const getFlexibleSlotsForMinutes = (minutes) => {
        const cacheKey = String(minutes);
        if (cachedFlexibleSlotsByMinutes.has(cacheKey)) {
          return cachedFlexibleSlotsByMinutes.get(cacheKey);
        }

        const nextSlots = [];
        if (hasExplicitClassWindows) {
          Object.entries(schedulableWindowsByDay).forEach(([day, windows]) => {
            windows.forEach((window) => {
              if (getIntervalDuration(window) !== minutes) return;
              nextSlots.push({
                day,
                startMin: window.startMin,
                endMin: window.endMin,
                slotKey: toSlotKey(day, window.startMin, window.endMin),
              });
            });
          });
        } else {
          Object.entries(schedulableWindowsByDay).forEach(([day, windows]) => {
            const freeIntervals = subtractTimeIntervals(windows, baseOccupiedByDay[day] || []);
            freeIntervals.forEach((interval) => {
              for (let cursor = interval.startMin; cursor + minutes <= interval.endMin; cursor += calendarSlotMinutes) {
                nextSlots.push({
                  day,
                  startMin: cursor,
                  endMin: cursor + minutes,
                  slotKey: toSlotKey(day, cursor, cursor + minutes),
                });
              }
            });
          });
        }

        const dedupedSlots = [];
        const seenSlotKeys = new Set();
        nextSlots.forEach((slot) => {
          if (seenSlotKeys.has(slot.slotKey)) return;
          seenSlotKeys.add(slot.slotKey);
          dedupedSlots.push(slot);
        });

        cachedFlexibleSlotsByMinutes.set(cacheKey, dedupedSlots);
        return dedupedSlots;
      };

      const registerUnit = (unit) => {
        const enrichedSlots = unit.possibleSlots.map((slot) => ({
          ...slot,
          possibleTeachers: getTeacherCandidateIdsForSlot(unit.subject, course.gradeKey, slot.day, slot.startMin, slot.endMin),
        }));
        const possibleTeachers = [...new Set(enrichedSlots.flatMap((slot) => slot.possibleTeachers || []))];
        const nextUnit = {
          ...unit,
          possibleSlots: enrichedSlots,
          possibleTeachers,
          priority: unit.kind === 'fixed' ? 0 : unit.kind === 'global' ? 1 : 2,
          baseTeacherCount: possibleTeachers.length,
          baseSlotCount: enrichedSlots.length,
        };

        unitById[nextUnit.id] = nextUnit;
        unitOrder.push(nextUnit.id);
        unitDomains[nextUnit.id] = {
          id: nextUnit.id,
          course: course.courseLabel,
          subject: nextUnit.subject,
          kind: nextUnit.kind,
          possibleSlots: nextUnit.possibleSlots.map((slot) => ({
            day: slot.day,
            startMin: slot.startMin,
            endMin: slot.endMin,
            possibleTeachers: slot.possibleTeachers.map((teacherId) => docentesById[teacherId]?.name || teacherId),
          })),
          possibleTeachers: possibleTeachers.map((teacherId) => docentesById[teacherId]?.name || teacherId),
        };
      };

      fixedSubjectSlots
        .filter((slot) => slot.gradeKey === course.gradeKey)
        .forEach((slot, index) => {
          if (!slot.subject || !slot.day || !Number.isFinite(slot.startMin) || !Number.isFinite(slot.endMin) || slot.endMin <= slot.startMin) {
            staticConflicts.push('Franja fija inválida en la configuración de asignaturas predeterminadas.');
            return;
          }

          alreadyCoveredMinutesBySubject[slot.subject] = (alreadyCoveredMinutesBySubject[slot.subject] || 0) + (slot.endMin - slot.startMin);
          registerUnit({
            id: `${course.courseKey}::fixed::${index + 1}`,
            kind: 'fixed',
            courseKey: course.courseKey,
            gradeKey: course.gradeKey,
            courseLabel: course.courseLabel,
            courseName: course.courseName,
            levelName: course.levelName,
            subject: slot.subject,
            minutes: slot.endMin - slot.startMin,
            possibleSlots: [{
              day: slot.day,
              startMin: slot.startMin,
              endMin: slot.endMin,
              slotKey: toSlotKey(slot.day, slot.startMin, slot.endMin),
            }],
          });
        });

      globalPinnedSubjectRules.forEach((rule, ruleIndex) => {
        const window = parseTimeWindow(rule.startTime, rule.endTime);
        if (!window || !rule.subject) return;

        (rule.days || []).forEach((day, dayIndex) => {
          const overlapsShift = scheduleShifts.some((shift) => {
            if (!(shift.gradeKeys || []).includes(course.gradeKey)) return false;
            if (!(shift.days || []).includes(day)) return false;
            const shiftWindow = parseTimeWindow(shift.startTime, shift.endTime);
            if (!shiftWindow) return false;
            return overlaps(window.startMin, window.endMin, shiftWindow.startMin, shiftWindow.endMin);
          });

          if (!overlapsShift) return;

          alreadyCoveredMinutesBySubject[rule.subject] = (alreadyCoveredMinutesBySubject[rule.subject] || 0) + (window.endMin - window.startMin);
          registerUnit({
            id: `${course.courseKey}::global::${ruleIndex + 1}-${dayIndex + 1}`,
            kind: 'global',
            courseKey: course.courseKey,
            gradeKey: course.gradeKey,
            courseLabel: course.courseLabel,
            courseName: course.courseName,
            levelName: course.levelName,
            subject: rule.subject,
            minutes: window.endMin - window.startMin,
            possibleSlots: [{
              day,
              startMin: window.startMin,
              endMin: window.endMin,
              slotKey: toSlotKey(day, window.startMin, window.endMin),
            }],
          });
        });
      });

      Object.entries(subjectTargetMinutes).forEach(([subject, targetMinutes]) => {
        const blockMinutes = subjectBlockMinutesBySubject[subject];
        if (!Number.isFinite(blockMinutes) || blockMinutes <= 0) return;

        const pendingMinutes = Math.max(0, targetMinutes - (alreadyCoveredMinutesBySubject[subject] || 0));
        const sessionCount = Math.ceil(pendingMinutes / blockMinutes);
        for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
          registerUnit({
            id: `${course.courseKey}::class::${normalizeKey(subject)}::${sessionIndex + 1}`,
            kind: 'class',
            courseKey: course.courseKey,
            gradeKey: course.gradeKey,
            courseLabel: course.courseLabel,
            courseName: course.courseName,
            levelName: course.levelName,
            subject,
            minutes: blockMinutes,
            groupKey: `${course.courseKey}::class::${normalizeKey(subject)}::${blockMinutes}`,
            sequenceIndex: sessionIndex,
            possibleSlots: getFlexibleSlotsForMinutes(blockMinutes),
          });
        }
      });

      courseStatesByKey[course.courseKey] = {
        course,
        courseClassBlockMinutes: getClassBlockMinutesForGrade(course.gradeKey),
        baseItems,
        baseOccupiedByDay,
        schedulableWindowsByDay,
        hasExplicitClassWindows,
        subjectTargetMinutes,
        subjectBlockMinutesBySubject,
        teacherCandidateCountBySubject,
        staticConflicts,
      };
    });

    const teacherIdByName = Object.fromEntries(
      docentes.map((teacher) => [normalizeKey(teacher.name), teacher.id]),
    );

    const buildSeededTeacherRuntime = () => {
      const teacherBusy = Object.fromEntries(docentes.map((teacher) => [teacher.id, {}]));
      const teacherLoad = Object.fromEntries(docentes.map((teacher) => [teacher.id, 0]));

      Object.values(seededCourseSchedules || {})
        .filter((schedule) => !gradeKeySet.has(schedule.gradeKey))
        .forEach((schedule) => {
          (schedule.items || [])
            .filter((item) => ['class', 'fixed', 'global'].includes(item.type))
            .forEach((item) => {
              if (!item?.day || !Number.isFinite(item.startMin) || !Number.isFinite(item.endMin) || item.endMin <= item.startMin) return;

              const teacherId = item.teacherId || teacherIdByName[normalizeKey(item.teacherName || '')];
              if (!teacherId || !teacherBusy[teacherId]) return;

              if (!teacherBusy[teacherId][item.day]) teacherBusy[teacherId][item.day] = [];
              teacherBusy[teacherId][item.day].push({ startMin: item.startMin, endMin: item.endMin });
              teacherLoad[teacherId] = (teacherLoad[teacherId] || 0) + (item.endMin - item.startMin);
            });
        });

      Object.keys(teacherBusy).forEach((teacherId) => {
        Object.keys(teacherBusy[teacherId]).forEach((day) => {
          teacherBusy[teacherId][day] = mergeTimeIntervals(teacherBusy[teacherId][day]);
        });
      });

      return { teacherBusy, teacherLoad };
    };

    const createRuntimeState = () => {
      const seededTeacherRuntime = buildSeededTeacherRuntime();

      return {
        runtimeByCourse: Object.fromEntries(
          filteredCourseRows.map((course) => {
            const baseState = courseStatesByKey[course.courseKey];
            return [course.courseKey, {
              ...baseState,
              items: baseState.baseItems.map((item) => ({ ...item })),
              occupiedByDay: Object.fromEntries(
                Object.entries(baseState.baseOccupiedByDay).map(([day, intervals]) => [day, intervals.map((interval) => ({ ...interval }))]),
              ),
              subjectMinutesAssigned: {},
              nextItemIndex: baseState.baseItems.length,
            }];
          }),
        ),
        teacherBusy: seededTeacherRuntime.teacherBusy,
        teacherLoad: seededTeacherRuntime.teacherLoad,
      };
    };

    const getCourseConflict = (runtimeCourse, day, startMin, endMin) =>
      (runtimeCourse.occupiedByDay[day] || []).some((entry) => overlaps(startMin, endMin, entry.startMin, entry.endMin));

    const wouldExceedConsecutiveLimit = (runtimeCourse, day, startMin, endMin, subject) => {
      const limit = Number(maxConsecutiveBySubject[subject]);
      if (!Number.isFinite(limit) || limit <= 0) return false;

      const teachingItems = runtimeCourse.items
        .filter((item) => item.day === day && ['class', 'fixed', 'global'].includes(item.type))
        .sort((a, b) => a.startMin - b.startMin);

      let chain = 1;
      let cursorStart = startMin;
      let cursorEnd = endMin;

      for (let index = teachingItems.length - 1; index >= 0; index -= 1) {
        const item = teachingItems[index];
        if (item.subject !== subject || item.endMin !== cursorStart) continue;
        chain += 1;
        cursorStart = item.startMin;
      }

      for (let index = 0; index < teachingItems.length; index += 1) {
        const item = teachingItems[index];
        if (item.subject !== subject || item.startMin !== cursorEnd) continue;
        chain += 1;
        cursorEnd = item.endMin;
      }

      return chain > limit;
    };

    const getCoursePlacementScore = (runtimeCourse, day, startMin, endMin, subject) => {
      const dayItems = runtimeCourse.items
        .filter((item) => item.day === day)
        .sort((a, b) => a.startMin - b.startMin);
      let previousItem = null;
      let nextItem = null;

      dayItems.forEach((item) => {
        if (item.endMin <= startMin) previousItem = item;
        if (!nextItem && item.startMin >= endMin) nextItem = item;
      });

      const gapBefore = previousItem ? Math.max(0, startMin - previousItem.endMin) : startMin;
      const gapAfter = nextItem ? Math.max(0, nextItem.startMin - endMin) : 0;
      const targetMinutes = runtimeCourse.subjectTargetMinutes[subject] || (endMin - startMin);
      const assignedMinutes = runtimeCourse.subjectMinutesAssigned[subject] || 0;
      const ratio = assignedMinutes / Math.max(targetMinutes, endMin - startMin);

      return (ratio * 10000) + ((runtimeCourse.occupiedByDay[day] || []).length * 2000) + gapBefore + gapAfter + startMin;
    };

    const getTeacherPlacementScore = (teacherId, teacherBusy, teacherLoad, day, startMin, endMin) => {
      const teacher = docentesById[teacherId];
      const busyEntries = mergeTimeIntervals(teacherBusy[teacherId]?.[day] || []);
      let previousEntry = null;
      let nextEntry = null;

      busyEntries.forEach((entry) => {
        if (entry.endMin <= startMin) previousEntry = entry;
        if (!nextEntry && entry.startMin >= endMin) nextEntry = entry;
      });

      const hasContiguousBefore = previousEntry?.endMin === startMin;
      const hasContiguousAfter = nextEntry?.startMin === endMin;
      const dayLoad = busyEntries.reduce((acc, entry) => acc + (entry.endMin - entry.startMin), 0);
      const dayStart = teacher?.availabilityByDay?.[day]?.[0]?.startMin ?? startMin;
      const gapBefore = previousEntry
        ? Math.max(0, startMin - previousEntry.endMin)
        : Math.max(0, startMin - dayStart);
      const gapAfter = nextEntry ? Math.max(0, nextEntry.startMin - endMin) : 0;

      return (hasContiguousBefore ? -20000 : 0)
        + (hasContiguousAfter ? -6000 : 0)
        + (dayLoad > 0 ? -2500 : 0)
        + gapBefore
        + gapAfter
        + ((teacherLoad[teacherId] || 0) / 30);
    };

    const getPlacementOrderValue = (day, startMin, endMin) => {
      const dayIndex = WEEK_DAYS.indexOf(day);
      return ((dayIndex >= 0 ? dayIndex : WEEK_DAYS.length) * 100000) + (startMin * 100) + endMin;
    };

    const getSymmetryBoundsForUnit = (unit, currentAssignments) => {
      if (!unit.groupKey || !Number.isFinite(unit.sequenceIndex)) {
        return { minOrder: -Infinity, maxOrder: Infinity };
      }

      let minOrder = -Infinity;
      let maxOrder = Infinity;

      Object.entries(currentAssignments).forEach(([unitId, assignment]) => {
        const sibling = unitById[unitId];
        if (!sibling || sibling.groupKey !== unit.groupKey || !Number.isFinite(sibling.sequenceIndex)) return;
        if (!Number.isFinite(assignment.placementOrder)) return;

        if (sibling.sequenceIndex < unit.sequenceIndex) {
          minOrder = Math.max(minOrder, assignment.placementOrder);
        } else if (sibling.sequenceIndex > unit.sequenceIndex) {
          maxOrder = Math.min(maxOrder, assignment.placementOrder);
        }
      });

      return { minOrder, maxOrder };
    };

    const getDomainForUnit = (unit, runtimeByCourse, teacherBusy, teacherLoad, currentAssignments) => {
      const runtimeCourse = runtimeByCourse[unit.courseKey];
      const placements = [];
      const availableSlotKeys = new Set();
      const availableTeacherIds = new Set();
      const symmetryBounds = getSymmetryBoundsForUnit(unit, currentAssignments);
      const diagnostics = {
        baseSlotCount: unit.possibleSlots.length,
        courseConflictSlots: 0,
        consecutiveBlockedSlots: 0,
        noCompatibleTeacherSlots: 0,
        teacherBusySlots: 0,
      };

      unit.possibleSlots.forEach((slot) => {
        if (getCourseConflict(runtimeCourse, slot.day, slot.startMin, slot.endMin)) {
          diagnostics.courseConflictSlots += 1;
          return;
        }
        if (wouldExceedConsecutiveLimit(runtimeCourse, slot.day, slot.startMin, slot.endMin, unit.subject)) {
          diagnostics.consecutiveBlockedSlots += 1;
          return;
        }
        if (!(slot.possibleTeachers || []).length) {
          diagnostics.noCompatibleTeacherSlots += 1;
          return;
        }

        const teacherIds = (slot.possibleTeachers || []).filter((teacherId) => {
          const busyEntries = teacherBusy[teacherId]?.[slot.day] || [];
          return !busyEntries.some((entry) => overlaps(slot.startMin, slot.endMin, entry.startMin, entry.endMin));
        });
        if (!teacherIds.length) {
          diagnostics.teacherBusySlots += 1;
          return;
        }

        availableSlotKeys.add(slot.slotKey);
        teacherIds.forEach((teacherId) => {
          const placementOrder = getPlacementOrderValue(slot.day, slot.startMin, slot.endMin);
          if (placementOrder <= symmetryBounds.minOrder || placementOrder >= symmetryBounds.maxOrder) return;

          availableTeacherIds.add(teacherId);
          const placementRank = getSeededRank(unit.id, teacherId, slot.day, slot.startMin, slot.endMin);
          placements.push({
            slot,
            teacherId,
            placementOrder,
            placementRank,
            score:
              getCoursePlacementScore(runtimeCourse, slot.day, slot.startMin, slot.endMin, unit.subject)
              + getTeacherPlacementScore(teacherId, teacherBusy, teacherLoad, slot.day, slot.startMin, slot.endMin)
              + getExplorationBias(240, unit.id, teacherId, slot.day, slot.startMin, slot.endMin),
          });
        });
      });

      placements.sort((left, right) => {
        const scoreDiff = left.score - right.score;
        if (scoreDiff !== 0) return scoreDiff;
        const dayDiff = WEEK_DAYS.indexOf(left.slot.day) - WEEK_DAYS.indexOf(right.slot.day);
        if (dayDiff !== 0) return dayDiff;
        const startDiff = left.slot.startMin - right.slot.startMin;
        if (startDiff !== 0) return startDiff;
        const rankDiff = left.placementRank - right.placementRank;
        if (rankDiff !== 0) return rankDiff;
        return (docentesById[left.teacherId]?.name || '').localeCompare(docentesById[right.teacherId]?.name || '', 'es');
      });

      return {
        placements,
        slotCount: availableSlotKeys.size,
        teacherCount: availableTeacherIds.size,
        diagnostics: {
          ...diagnostics,
          remainingSlotCount: availableSlotKeys.size,
          remainingTeacherCount: availableTeacherIds.size,
          placementCount: placements.length,
        },
      };
    };

    const applyAssignment = (unit, placement, runtimeByCourse, teacherBusy, teacherLoad, currentAssignments) => {
      const runtimeCourse = runtimeByCourse[unit.courseKey];
      const previousItemIndex = runtimeCourse.nextItemIndex;
      runtimeCourse.nextItemIndex += 1;

      const day = placement.slot.day;
      const startMin = placement.slot.startMin;
      const endMin = placement.slot.endMin;
      const teacherId = placement.teacherId;
      const teacherName = docentesById[teacherId]?.name || 'Sin docente';
      const item = {
        id: `${unit.courseKey}-${unit.kind}-${runtimeCourse.nextItemIndex}`,
        type: unit.kind === 'class' ? 'class' : unit.kind,
        label: unit.kind === 'global' ? `${unit.subject} (Global)` : unit.subject,
        day,
        subject: unit.subject,
        startMin,
        endMin,
        teacherId,
        teacherName,
      };

      runtimeCourse.items.push(item);
      if (!runtimeCourse.occupiedByDay[day]) runtimeCourse.occupiedByDay[day] = [];
      runtimeCourse.occupiedByDay[day].push({ startMin, endMin });
      runtimeCourse.subjectMinutesAssigned[unit.subject] = (runtimeCourse.subjectMinutesAssigned[unit.subject] || 0) + unit.minutes;

      if (!teacherBusy[teacherId][day]) teacherBusy[teacherId][day] = [];
      teacherBusy[teacherId][day].push({ startMin, endMin });
      teacherLoad[teacherId] = (teacherLoad[teacherId] || 0) + unit.minutes;

      currentAssignments[unit.id] = {
        teacherId,
        day,
        startMin,
        endMin,
        placementOrder: placement.placementOrder ?? getPlacementOrderValue(day, startMin, endMin),
      };

      return {
        runtimeCourse,
        teacherId,
        day,
        previousItemIndex,
      };
    };

    const undoAssignment = (unit, undoData, teacherBusy, teacherLoad, currentAssignments) => {
      undoData.runtimeCourse.items.pop();
      undoData.runtimeCourse.occupiedByDay[undoData.day]?.pop();
      if ((undoData.runtimeCourse.occupiedByDay[undoData.day] || []).length === 0) {
        delete undoData.runtimeCourse.occupiedByDay[undoData.day];
      }

      undoData.runtimeCourse.subjectMinutesAssigned[unit.subject] = Math.max(
        0,
        (undoData.runtimeCourse.subjectMinutesAssigned[unit.subject] || 0) - unit.minutes,
      );
      if (undoData.runtimeCourse.subjectMinutesAssigned[unit.subject] === 0) {
        delete undoData.runtimeCourse.subjectMinutesAssigned[unit.subject];
      }
      undoData.runtimeCourse.nextItemIndex = undoData.previousItemIndex;

      teacherBusy[undoData.teacherId][undoData.day]?.pop();
      if ((teacherBusy[undoData.teacherId][undoData.day] || []).length === 0) {
        delete teacherBusy[undoData.teacherId][undoData.day];
      }
      teacherLoad[undoData.teacherId] = Math.max(0, (teacherLoad[undoData.teacherId] || 0) - unit.minutes);
      delete currentAssignments[unit.id];
    };

    const failureUnits = new Map();
    const rememberFailure = (unit, domain) => {
      if (failureUnits.has(unit.id)) return;
      let reason = 'sin combinaciones restantes de horario + docente';
      if (unit.possibleSlots.length === 0) reason = 'sin slots base posibles';
      else if (unit.possibleTeachers.length === 0) reason = 'sin docentes compatibles';
      else if (domain && domain.slotCount === 0) reason = 'sin slots disponibles tras aplicar restricciones';
      else if (domain && domain.teacherCount === 0) reason = 'sin docentes disponibles tras aplicar restricciones';

      const blockers = [];
      const diagnostics = domain?.diagnostics;
      if (diagnostics?.courseConflictSlots > 0) {
        blockers.push(`${diagnostics.courseConflictSlots} slot(s) ocupados por el curso`);
      }
      if (diagnostics?.consecutiveBlockedSlots > 0) {
        blockers.push(`${diagnostics.consecutiveBlockedSlots} slot(s) bloqueados por máximo consecutivo`);
      }
      if (diagnostics?.noCompatibleTeacherSlots > 0) {
        blockers.push(`${diagnostics.noCompatibleTeacherSlots} slot(s) sin docente compatible`);
      }
      if (diagnostics?.teacherBusySlots > 0) {
        blockers.push(`${diagnostics.teacherBusySlots} slot(s) con docentes ya ocupados`);
      }

      failureUnits.set(unit.id, {
        unitId: unit.id,
        courseLabel: unit.courseLabel,
        subject: unit.subject,
        kind: unit.kind,
        reason,
        blockers,
        domainSize: domain?.placements.length || 0,
        baseSlotCount: unit.possibleSlots.length,
        baseTeacherCount: unit.possibleTeachers.length,
        remainingSlotCount: domain?.slotCount || 0,
        remainingTeacherCount: domain?.teacherCount || 0,
      });
    };

    const buildFinalResult = ({ solved, currentAssignments, nodesVisited, bestAssignedCount }) => {
      if (!solved) {
        const limitBlockingIssues = nodesVisited >= maxNodes
          ? [`No se pudo cerrar una combinación estable después de ${maxNodes.toLocaleString('es-CO')} intentos. Ajusta restricciones, docentes o franjas antes de recalcular.`]
          : [];
        const staticBlockingIssues = filteredCourseRows.flatMap((course) =>
          (courseStatesByKey[course.courseKey]?.staticConflicts || []).map((issue) => `${course.courseLabel}: ${issue}`),
        );
        const deadEndBlockingIssues = [...failureUnits.values()].map((failure) => {
          const blockerLabel = failure.blockers.length > 0
            ? ` Motivos: ${failure.blockers.join('; ')}.`
            : '';
          return `${failure.courseLabel}: ${failure.subject} (${failure.kind}) quedó sin dominio. ${failure.reason}. Slots base: ${failure.baseSlotCount}, docentes base: ${failure.baseTeacherCount}, slots restantes: ${failure.remainingSlotCount}, docentes restantes: ${failure.remainingTeacherCount}.${blockerLabel}`;
        });

        return {
          byCourse: {},
          blockingIssues: [...new Set([...limitBlockingIssues, ...staticBlockingIssues, ...deadEndBlockingIssues])],
          unitDomains,
          solverDiagnostics: {
            solved: false,
            assignedUnits: 0,
            totalUnits: unitOrder.length,
            nodesVisited,
            reachedNodeLimit: nodesVisited >= maxNodes,
            deepestAssignedUnits: bestAssignedCount,
            deadEndUnits: [...failureUnits.values()].slice(0, 24),
          },
        };
      }

      const materializedRuntime = createRuntimeState();

      Object.entries(currentAssignments)
        .map(([unitId, placement]) => ({ unit: unitById[unitId], placement }))
        .sort((left, right) => {
          const dayDiff = WEEK_DAYS.indexOf(left.placement.day) - WEEK_DAYS.indexOf(right.placement.day);
          if (dayDiff !== 0) return dayDiff;
          const startDiff = left.placement.startMin - right.placement.startMin;
          if (startDiff !== 0) return startDiff;
          return left.unit.courseLabel.localeCompare(right.unit.courseLabel, 'es');
        })
        .forEach(({ unit, placement }) => {
          applyAssignment(
            unit,
            { slot: { day: placement.day, startMin: placement.startMin, endMin: placement.endMin }, teacherId: placement.teacherId },
            materializedRuntime.runtimeByCourse,
            materializedRuntime.teacherBusy,
            materializedRuntime.teacherLoad,
            {},
          );
        });

      const byCourse = {};
      filteredCourseRows.forEach((course) => {
        const runtimeCourse = materializedRuntime.runtimeByCourse[course.courseKey];
        const courseUnits = unitOrder.map((unitId) => unitById[unitId]).filter((unit) => unit.courseKey === course.courseKey);
        const assignedUnitIds = new Set(
          Object.keys(currentAssignments).filter((unitId) => unitById[unitId]?.courseKey === course.courseKey),
        );
        const missingRegularUnitsBySubject = {};
        const conflicts = [...runtimeCourse.staticConflicts];

        courseUnits.forEach((unit) => {
          if (assignedUnitIds.has(unit.id)) return;

          if (unit.kind === 'fixed' || unit.kind === 'global') {
            const slot = unit.possibleSlots[0];
            conflicts.push(
              `${unit.kind === 'global' ? 'Fija global' : 'Fija'} ${unit.subject} sin combinación disponible (${slot?.day || 'Sin día'} ${minutesToClockLabel(slot?.startMin)}-${minutesToClockLabel(slot?.endMin)}).`,
            );
            return;
          }

          if (!missingRegularUnitsBySubject[unit.subject]) {
            missingRegularUnitsBySubject[unit.subject] = { count: 0, minutes: 0 };
          }
          missingRegularUnitsBySubject[unit.subject].count += 1;
          missingRegularUnitsBySubject[unit.subject].minutes += unit.minutes;
        });

        Object.entries(missingRegularUnitsBySubject).forEach(([subject, info]) => {
          conflicts.push(`No se pudo ubicar ${blocksToLabel(info.count)} de ${subject} (${minutesToHoursLabel(info.minutes)}).`);
        });

        byCourse[course.courseKey] = {
          courseLabel: course.courseLabel,
          gradeKey: course.gradeKey,
          courseName: course.courseName,
          levelName: course.levelName,
          items: [...runtimeCourse.items].sort((left, right) => {
            const dayDiff = WEEK_DAYS.indexOf(left.day) - WEEK_DAYS.indexOf(right.day);
            if (dayDiff !== 0) return dayDiff;
            return left.startMin - right.startMin;
          }),
          conflicts,
        };
      });

      const blockingIssues = Object.values(byCourse)
        .flatMap((schedule) => (schedule.conflicts || []).map((issue) => `${schedule.courseLabel}: ${issue}`));

      return {
        byCourse,
        blockingIssues: [...new Set(blockingIssues)],
        unitDomains,
        solverDiagnostics: {
          solved: true,
          assignedUnits: Object.keys(currentAssignments).length,
          totalUnits: unitOrder.length,
          nodesVisited,
          reachedNodeLimit: false,
          deepestAssignedUnits: bestAssignedCount,
          deadEndUnits: [...failureUnits.values()].slice(0, 24),
        },
      };
    };

    const createSearchEngine = () => {
      const { runtimeByCourse, teacherBusy, teacherLoad } = createRuntimeState();
      const currentAssignments = {};
      const stack = [];
      let pendingUnitIds = [...unitOrder];
      let nodesVisited = 0;
      let bestAssignedCount = 0;
      let solved = false;
      let finished = false;

      const selectUnit = () => {
        const evaluatedDomains = [];
        for (const unitId of pendingUnitIds) {
          const unit = unitById[unitId];
          const domain = getDomainForUnit(unit, runtimeByCourse, teacherBusy, teacherLoad, currentAssignments);
          if (domain.placements.length === 0) {
            rememberFailure(unit, domain);
            return null;
          }
          evaluatedDomains.push({ unit, domain });
        }

        evaluatedDomains.sort((left, right) => {
          const domainDiff = left.domain.placements.length - right.domain.placements.length;
          if (domainDiff !== 0) return domainDiff;

          const slotDiff = left.domain.slotCount - right.domain.slotCount;
          if (slotDiff !== 0) return slotDiff;

          const teacherDiff = left.domain.teacherCount - right.domain.teacherCount;
          if (teacherDiff !== 0) return teacherDiff;

          const priorityDiff = left.unit.priority - right.unit.priority;
          if (priorityDiff !== 0) return priorityDiff;

          const scarcityDiff = (left.unit.baseTeacherCount || 0) - (right.unit.baseTeacherCount || 0);
          if (scarcityDiff !== 0) return scarcityDiff;

          const groupDiff = String(left.unit.groupKey || left.unit.id).localeCompare(String(right.unit.groupKey || right.unit.id), 'es');
          if (groupDiff !== 0) return groupDiff;

          const sequenceDiff = (left.unit.sequenceIndex ?? 0) - (right.unit.sequenceIndex ?? 0);
          if (sequenceDiff !== 0) return sequenceDiff;

          const seededDiff = getSeededRank(left.unit.id) - getSeededRank(right.unit.id);
          if (seededDiff !== 0) return seededDiff;

          return left.unit.courseLabel.localeCompare(right.unit.courseLabel, 'es') || left.unit.subject.localeCompare(right.unit.subject, 'es');
        });

        const selected = evaluatedDomains[0];
        return {
          pendingUnitIds,
          selected,
          nextPendingUnitIds: pendingUnitIds.filter((unitId) => unitId !== selected.unit.id),
          placementIndex: 0,
          undoData: null,
        };
      };

      const backtrack = () => {
        while (stack.length > 0) {
          const frame = stack[stack.length - 1];

          if (frame.undoData) {
            undoAssignment(frame.selected.unit, frame.undoData, teacherBusy, teacherLoad, currentAssignments);
            frame.undoData = null;
          }

          if (frame.placementIndex < frame.selected.domain.placements.length) {
            const placement = frame.selected.domain.placements[frame.placementIndex];
            frame.placementIndex += 1;
            frame.undoData = applyAssignment(frame.selected.unit, placement, runtimeByCourse, teacherBusy, teacherLoad, currentAssignments);
            pendingUnitIds = frame.nextPendingUnitIds;
            return true;
          }

          rememberFailure(frame.selected.unit, frame.selected.domain);
          stack.pop();
        }

        finished = true;
        solved = false;
        return false;
      };

      const step = (nodeBudget = 250) => {
        let processedNodes = 0;

        while (!finished && processedNodes < nodeBudget) {
          if (nodesVisited >= maxNodes) {
            finished = true;
            solved = false;
            break;
          }

          processedNodes += 1;
          nodesVisited += 1;

          const assignedCount = unitOrder.length - pendingUnitIds.length;
          if (assignedCount > bestAssignedCount) {
            bestAssignedCount = assignedCount;
          }

          if (pendingUnitIds.length === 0) {
            solved = true;
            finished = true;
            break;
          }

          const frame = selectUnit();
          if (!frame) {
            if (!backtrack()) {
              break;
            }
            continue;
          }

          stack.push(frame);
          const placement = frame.selected.domain.placements[frame.placementIndex];
          frame.placementIndex += 1;
          frame.undoData = applyAssignment(frame.selected.unit, placement, runtimeByCourse, teacherBusy, teacherLoad, currentAssignments);
          pendingUnitIds = frame.nextPendingUnitIds;
        }

        return {
          finished,
          solved,
          nodesVisited,
          reachedNodeLimit: nodesVisited >= maxNodes && !solved,
          deepestAssignedUnits: bestAssignedCount,
          assignedUnits: Object.keys(currentAssignments).length,
          totalUnits: unitOrder.length,
        };
      };

      const buildResult = () => buildFinalResult({
        solved,
        currentAssignments,
        nodesVisited,
        bestAssignedCount,
      });

      return { step, buildResult };
    };

    if (options.returnEngine) {
      return createSearchEngine();
    }

    const engine = createSearchEngine();
    let status = engine.step(500);
    while (!status.finished) {
      status = engine.step(500);
    }
    return engine.buildResult();
  };

  const buildGeneratedCourseSchedulePreview = (gradeKeySet) => solveCourseSchedulesWithCsp(gradeKeySet);

  const buildGeneratedCourseSchedulePreviewLegacy = (gradeKeySet) => {
    if (!gradeKeySet || gradeKeySet.size === 0) {
      return { byCourse: {}, blockingIssues: [] };
    }

    const parseTimeWindow = (startTime, endTime) => {
      const startMin = timeToMinutes(startTime);
      const endMin = timeToMinutes(endTime);
      if (startMin === null || endMin === null || endMin <= startMin) return null;
      return { startMin, endMin };
    };

    const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

    const mergeIntervals = (intervals) => {
      const sorted = [...intervals]
        .filter((entry) => Number.isFinite(entry.startMin) && Number.isFinite(entry.endMin) && entry.endMin > entry.startMin)
        .sort((a, b) => a.startMin - b.startMin);

      const merged = [];
      sorted.forEach((entry) => {
        const last = merged[merged.length - 1];
        if (!last || entry.startMin > last.endMin) {
          merged.push({ ...entry });
          return;
        }
        last.endMin = Math.max(last.endMin, entry.endMin);
      });
      return merged;
    };

    const subtractIntervals = (baseIntervals, blockedIntervals) => {
      const free = [];
      const mergedBlocked = mergeIntervals(blockedIntervals);

      baseIntervals.forEach((base) => {
        let cursor = base.startMin;
        mergedBlocked.forEach((blocked) => {
          if (blocked.endMin <= base.startMin || blocked.startMin >= base.endMin) return;
          if (blocked.startMin > cursor) {
            free.push({ startMin: cursor, endMin: Math.min(blocked.startMin, base.endMin) });
          }
          cursor = Math.max(cursor, blocked.endMin);
        });
        if (cursor < base.endMin) {
          free.push({ startMin: cursor, endMin: base.endMin });
        }
      });

      return free.filter((entry) => entry.endMin > entry.startMin);
    };

    const courseRows = [];
    gradeRows.forEach((row) => {
      const customCourses = coursesByGrade[row.key] || [];
      const hasSingleCourse = Boolean(singleCourseGrades[row.key]) || customCourses.length === 0;

      if (hasSingleCourse) {
        courseRows.push({
          courseKey: `${row.key}::__single__`,
          gradeKey: row.key,
          courseName: row.grade,
          levelName: row.levelName,
          courseLabel: `${row.grade} ${row.levelName}`,
        });
        return;
      }

      customCourses.forEach((courseName) => {
        courseRows.push({
          courseKey: `${row.key}::${courseName}`,
          gradeKey: row.key,
          courseName,
          levelName: row.levelName,
          courseLabel: `${row.grade}${courseName} ${row.levelName}`,
        });
      });
    });

    const filteredCourseRows = courseRows.filter((course) => gradeKeySet.has(course.gradeKey));
    const courseKeysByGrade = filteredCourseRows.reduce((acc, course) => {
      if (!acc[course.gradeKey]) acc[course.gradeKey] = [];
      acc[course.gradeKey].push(course.courseKey);
      return acc;
    }, {});

    const courseIndexByKey = Object.fromEntries(
      Object.entries(courseKeysByGrade).flatMap(([, courseKeys]) =>
        courseKeys.map((courseKey, index) => [courseKey, index]),
      ),
    );

    const docentes = (staffByRole.docencia?.members || [])
      .filter((member) => isTeacherSchedulable(member))
      .map((member, index) => ({
        id: member.email || `docente-${index + 1}`,
        name: member.name,
        subjects: new Set(member.subjects || []),
        gradeKeys: new Set(getTeacherAssignedGradeKeys(member)),
        availabilityByDay: getTeacherAvailabilityByDay(member),
      }));

    const teacherBusy = Object.fromEntries(docentes.map((teacher) => [teacher.id, {}]));
    const teacherLoad = Object.fromEntries(docentes.map((teacher) => [teacher.id, 0]));

    const teacherCanAttend = (teacher, day, startMin, endMin) =>
      (teacher.availabilityByDay[day] || []).some((window) => startMin >= window.startMin && endMin <= window.endMin);

    const hasTeacherCoverageForSlot = (subject, gradeKey, day, startMin, endMin) =>
      docentes.some(
        (teacher) =>
          teacher.subjects.has(subject)
          && teacher.gradeKeys.has(gradeKey)
          && teacherCanAttend(teacher, day, startMin, endMin),
      );

    const getAssignableTeachers = (subject, gradeKey, day, startMin, endMin) =>
      docentes
        .filter(
          (teacher) =>
            teacher.subjects.has(subject)
            && teacher.gradeKeys.has(gradeKey)
            && teacherCanAttend(teacher, day, startMin, endMin),
        )
        .sort((a, b) => (teacherLoad[a.id] || 0) - (teacherLoad[b.id] || 0));

    const getTeacherPlacementScore = (teacher, day, startMin, endMin) => {
      const busyEntries = mergeIntervals(teacherBusy[teacher.id][day] || []);
      let previousEntry = null;
      let nextEntry = null;

      busyEntries.forEach((entry) => {
        if (entry.endMin <= startMin) previousEntry = entry;
        if (!nextEntry && entry.startMin >= endMin) nextEntry = entry;
      });

      const hasContiguousBefore = previousEntry?.endMin === startMin;
      const hasContiguousAfter = nextEntry?.startMin === endMin;
      const dayLoad = busyEntries.reduce((acc, entry) => acc + (entry.endMin - entry.startMin), 0);
      const dayStart = teacher.availabilityByDay[day]?.[0]?.startMin ?? startMin;
      const gapBefore = previousEntry
        ? Math.max(0, startMin - previousEntry.endMin)
        : Math.max(0, startMin - dayStart);
      const gapAfter = nextEntry ? Math.max(0, nextEntry.startMin - endMin) : 0;

      return (hasContiguousBefore ? -20000 : 0)
        + (hasContiguousAfter ? -6000 : 0)
        + (dayLoad > 0 ? -2500 : 0)
        + gapBefore
        + gapAfter
        + ((teacherLoad[teacher.id] || 0) / 30);
    };

    const registerTeacherBusy = (teacherId, day, startMin, endMin) => {
      if (!teacherBusy[teacherId][day]) teacherBusy[teacherId][day] = [];
      teacherBusy[teacherId][day].push({ startMin, endMin });
      teacherLoad[teacherId] = (teacherLoad[teacherId] || 0) + (endMin - startMin);
    };

    const getTeacherForSlot = (subject, gradeKey, day, startMin, endMin) => {
      const candidates = getAssignableTeachers(subject, gradeKey, day, startMin, endMin)
        .filter((teacher) => {
          const busy = teacherBusy[teacher.id][day] || [];
          return !busy.some((entry) => overlaps(startMin, endMin, entry.startMin, entry.endMin));
        })
        .sort((a, b) => getTeacherPlacementScore(a, day, startMin, endMin) - getTeacherPlacementScore(b, day, startMin, endMin));

      return candidates[0] || null;
    };

    const getCourseScarcityScore = (course) => {
      const gradeLoads = subjectLoads.filter((load) => (load.gradeKeys || []).includes(course.gradeKey));

      return gradeLoads.reduce((acc, load) => {
        const loadBlockMinutes = getLoadBlockMinutesForGrade(load, course.gradeKey);
        const courseBlocks = getLoadWeeklyBlocks(load, loadBlockMinutes);
        if (courseBlocks <= 0) return acc;
        const availableTeachers = docentes.filter(
          (teacher) => teacher.subjects.has(load.subject) && teacher.gradeKeys.has(course.gradeKey),
        ).length;

        return acc + (courseBlocks * loadBlockMinutes) / Math.max(1, availableTeachers);
      }, 0);
    };

    const courseRowsForGeneration = [...filteredCourseRows].sort((a, b) => {
      const scoreDiff = getCourseScarcityScore(b) - getCourseScarcityScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.courseLabel.localeCompare(b.courseLabel, 'es');
    });

    const courseStates = [];

    const placeClassRequirementForCourseState = (state, requirement) => {
      const candidates = [];
      const {
        course,
        schedulableWindowsByDay,
        hasExplicitClassWindows,
        hasOccupiedConflict,
        wouldExceedConsecutiveLimit,
        scoreCandidate,
      } = state;

      WEEK_DAYS.filter((day) => (schedulableWindowsByDay[day] || []).length > 0).forEach((day) => {
        const windows = schedulableWindowsByDay[day] || [];

        windows.forEach((window) => {
          if (hasExplicitClassWindows) {
            const duration = window.endMin - window.startMin;
            if (duration !== requirement.minutes) return;

            const startMin = window.startMin;
            const endMin = window.endMin;
            if (hasOccupiedConflict(day, startMin, endMin)) return;
            if (wouldExceedConsecutiveLimit(day, startMin, endMin, requirement.subject)) return;

            getAssignableTeachers(requirement.subject, course.gradeKey, day, startMin, endMin)
              .filter((teacher) => {
                const busy = teacherBusy[teacher.id][day] || [];
                return !busy.some((entry) => overlaps(startMin, endMin, entry.startMin, entry.endMin));
              })
              .forEach((teacher) => {
                candidates.push({
                  day,
                  startMin,
                  endMin,
                  teacher,
                  score: scoreCandidate(day, startMin, endMin) + getTeacherPlacementScore(teacher, day, startMin, endMin),
                });
              });
            return;
          }

          for (let cursor = window.startMin; cursor + requirement.minutes <= window.endMin; cursor += calendarSlotMinutes) {
            const startMin = cursor;
            const endMin = cursor + requirement.minutes;
            if (hasOccupiedConflict(day, startMin, endMin)) continue;
            if (wouldExceedConsecutiveLimit(day, startMin, endMin, requirement.subject)) continue;

            getAssignableTeachers(requirement.subject, course.gradeKey, day, startMin, endMin)
              .filter((teacher) => {
                const busy = teacherBusy[teacher.id][day] || [];
                return !busy.some((entry) => overlaps(startMin, endMin, entry.startMin, entry.endMin));
              })
              .forEach((teacher) => {
                candidates.push({
                  day,
                  startMin,
                  endMin,
                  teacher,
                  score: scoreCandidate(day, startMin, endMin) + getTeacherPlacementScore(teacher, day, startMin, endMin),
                });
              });
          }
        });
      });

      candidates.sort((a, b) => a.score - b.score);
      const selectedCandidate = candidates[0];

      if (!selectedCandidate) {
        state.conflicts.push(`No se pudo ubicar ${requirement.subject} por disponibilidad docente o espacio.`);
        return;
      }

      state.items.push(state.createCourseItem({
        type: 'class',
        label: requirement.subject,
        day: selectedCandidate.day,
        subject: requirement.subject,
        startMin: selectedCandidate.startMin,
        endMin: selectedCandidate.endMin,
        teacherName: selectedCandidate.teacher.name,
      }));
      state.addOccupied(selectedCandidate.day, selectedCandidate.startMin, selectedCandidate.endMin);
      registerTeacherBusy(selectedCandidate.teacher.id, selectedCandidate.day, selectedCandidate.startMin, selectedCandidate.endMin);
      state.subjectMinutesAssigned[requirement.subject] = (state.subjectMinutesAssigned[requirement.subject] || 0) + requirement.minutes;
    };

    const byCourse = {};

    courseRowsForGeneration.forEach((course) => {
      const courseClassBlockMinutes = getClassBlockMinutesForGrade(course.gradeKey);
      const items = [];
      const occupiedByDay = {};
      const conflicts = [];
      let courseItemIndex = 0;
      const subjectTargetMinutes = {};
      const subjectBlockMinutesBySubject = {};
      const subjectMinutesAssigned = {};

      const createCourseItem = (payload) => ({
        id: `${course.courseKey}-${courseItemIndex += 1}`,
        ...payload,
      });

      const addOccupied = (day, startMin, endMin) => {
        if (!occupiedByDay[day]) occupiedByDay[day] = [];
        occupiedByDay[day].push({ startMin, endMin });
      };

      const hasOccupiedConflict = (day, startMin, endMin) =>
        (occupiedByDay[day] || []).some((item) => overlaps(startMin, endMin, item.startMin, item.endMin));

      const addSystemBlocks = (sourceEntries, type, label) => {
        sourceEntries
          .filter((entry) => (entry.gradeKeys || []).includes(course.gradeKey))
          .forEach((entry) => {
            const window = parseTimeWindow(entry.startTime, entry.endTime);
            if (!window) return;
            (entry.days || []).forEach((day) => {
              items.push(createCourseItem({ type, label, day, subject: label, startMin: window.startMin, endMin: window.endMin }));
              addOccupied(day, window.startMin, window.endMin);
            });
          });
      };

      addSystemBlocks(scheduleBreaks, 'break', 'Break');
      addSystemBlocks(scheduleGuidanceRoutines, 'guidance', 'Guidance Routine');
      addSystemBlocks(scheduleControl, 'control', 'Control');
      addSystemBlocks(scheduleSports, 'sports', 'Deportes');
      scheduleOtherBlocks
        .filter((entry) => (entry.gradeKeys || []).includes(course.gradeKey))
        .forEach((entry) => {
          const window = parseTimeWindow(entry.startTime, entry.endTime);
          if (!window) return;
          (entry.days || []).forEach((day) => {
            items.push(createCourseItem({
              type: 'other',
              label: entry.name || 'Otro',
              day,
              subject: entry.name || 'Otro',
              startMin: window.startMin,
              endMin: window.endMin,
            }));
            addOccupied(day, window.startMin, window.endMin);
          });
        });

      const explicitClassWindowsByDay = {};
      scheduleClassSlots
        .filter((entry) => (entry.gradeKeys || []).includes(course.gradeKey))
        .forEach((entry) => {
          const window = parseTimeWindow(entry.startTime, entry.endTime);
          if (!window) return;
          (entry.days || []).forEach((day) => {
            if (!explicitClassWindowsByDay[day]) explicitClassWindowsByDay[day] = [];
            explicitClassWindowsByDay[day].push({ startMin: window.startMin, endMin: window.endMin });
          });
        });

      const hasExplicitClassWindows = Object.keys(explicitClassWindowsByDay).length > 0;
      const schedulableWindowsByDay = {};

      if (hasExplicitClassWindows) {
        Object.keys(explicitClassWindowsByDay).forEach((day) => {
          schedulableWindowsByDay[day] = [...explicitClassWindowsByDay[day]].sort((a, b) => a.startMin - b.startMin);
        });
      } else {
        scheduleShifts
          .filter((shift) => (shift.gradeKeys || []).includes(course.gradeKey))
          .forEach((shift) => {
            const window = parseTimeWindow(shift.startTime, shift.endTime);
            if (!window) return;
            (shift.days || []).forEach((day) => {
              if (!schedulableWindowsByDay[day]) schedulableWindowsByDay[day] = [];
              schedulableWindowsByDay[day].push({ startMin: window.startMin, endMin: window.endMin });
            });
          });
        Object.keys(schedulableWindowsByDay).forEach((day) => {
          schedulableWindowsByDay[day] = mergeIntervals(schedulableWindowsByDay[day]);
        });
      }

      fixedSubjectSlots
        .filter((slot) => slot.gradeKey === course.gradeKey)
        .forEach((slot) => {
          const teacher = getTeacherForSlot(slot.subject, course.gradeKey, slot.day, slot.startMin, slot.endMin);
          if (!teacher) {
            conflicts.push(`Sin docente disponible para ${slot.subject} (${slot.day} ${minutesToClockLabel(slot.startMin)}-${minutesToClockLabel(slot.endMin)}).`);
          }

          items.push(createCourseItem({
            type: 'fixed',
            label: slot.subject,
            day: slot.day,
            subject: slot.subject,
            startMin: slot.startMin,
            endMin: slot.endMin,
            teacherName: teacher?.name || 'Sin docente',
          }));
          addOccupied(slot.day, slot.startMin, slot.endMin);
          subjectMinutesAssigned[slot.subject] = (subjectMinutesAssigned[slot.subject] || 0) + (slot.endMin - slot.startMin);
          if (teacher) registerTeacherBusy(teacher.id, slot.day, slot.startMin, slot.endMin);
        });

      globalPinnedSubjectRules.forEach((rule) => {
        const window = parseTimeWindow(rule.startTime, rule.endTime);
        if (!window) return;

        (rule.days || []).forEach((day) => {
          const overlapsShift = scheduleShifts.some((shift) => {
            if (!(shift.gradeKeys || []).includes(course.gradeKey)) return false;
            if (!(shift.days || []).includes(day)) return false;
            const shiftWindow = parseTimeWindow(shift.startTime, shift.endTime);
            if (!shiftWindow) return false;
            return overlaps(window.startMin, window.endMin, shiftWindow.startMin, shiftWindow.endMin);
          });

          if (!overlapsShift || hasOccupiedConflict(day, window.startMin, window.endMin)) return;

          const teacher = getTeacherForSlot(rule.subject, course.gradeKey, day, window.startMin, window.endMin);
          if (!teacher) {
            conflicts.push(`Sin docente disponible para fija global ${rule.subject} (${day} ${rule.startTime}-${rule.endTime}).`);
          }

          items.push(createCourseItem({
            type: 'global',
            label: `${rule.subject} (Global)`,
            day,
            subject: rule.subject,
            startMin: window.startMin,
            endMin: window.endMin,
            teacherName: teacher?.name || 'Sin docente',
          }));
          addOccupied(day, window.startMin, window.endMin);
          subjectMinutesAssigned[rule.subject] = (subjectMinutesAssigned[rule.subject] || 0) + (window.endMin - window.startMin);
          if (teacher) registerTeacherBusy(teacher.id, day, window.startMin, window.endMin);
        });
      });

      const classRequirements = [];
      const teacherCandidateCountBySubject = {};
      subjectLoads
        .filter((load) => (load.gradeKeys || []).includes(course.gradeKey))
        .forEach((load) => {
          const loadBlockMinutes = getLoadBlockMinutesForGrade(load, course.gradeKey);
          const courseBlocks = getLoadWeeklyBlocks(load, loadBlockMinutes);
          if (courseBlocks <= 0) return;

          teacherCandidateCountBySubject[load.subject] = docentes.filter(
            (teacher) => teacher.subjects.has(load.subject) && teacher.gradeKeys.has(course.gradeKey),
          ).length;

          const targetMinutesForCourse = courseBlocks * loadBlockMinutes;
          subjectTargetMinutes[load.subject] = targetMinutesForCourse;
          subjectBlockMinutesBySubject[load.subject] = loadBlockMinutes;

          const alreadyFixed = items
            .filter((item) => ['fixed', 'global'].includes(item.type) && item.subject === load.subject)
            .reduce((acc, item) => acc + (item.endMin - item.startMin), 0);

          const pendingMinutes = Math.max(0, targetMinutesForCourse - alreadyFixed);
          const sessions = Math.ceil(pendingMinutes / loadBlockMinutes);
          for (let i = 0; i < sessions; i += 1) {
            classRequirements.push({ subject: load.subject, minutes: loadBlockMinutes });
          }
        });

      classRequirements.sort((a, b) => {
        const candidateDiff = (teacherCandidateCountBySubject[a.subject] || 0) - (teacherCandidateCountBySubject[b.subject] || 0);
        if (candidateDiff !== 0) return candidateDiff;
        return a.subject.localeCompare(b.subject);
      });

      const wouldExceedConsecutiveLimit = (day, startMin, endMin, subject) => {
        const limit = Number(maxConsecutiveBySubject[subject]);
        if (!Number.isFinite(limit) || limit <= 0) return false;

        const teachingItems = items
          .filter((item) => item.day === day && ['class', 'fixed', 'global'].includes(item.type))
          .sort((a, b) => a.startMin - b.startMin);

        let chain = 1;
        let cursorStart = startMin;
        let cursorEnd = endMin;

        for (let index = teachingItems.length - 1; index >= 0; index -= 1) {
          const item = teachingItems[index];
          if (item.subject !== subject || item.endMin !== cursorStart) continue;
          chain += 1;
          cursorStart = item.startMin;
        }

        for (let index = 0; index < teachingItems.length; index += 1) {
          const item = teachingItems[index];
          if (item.subject !== subject || item.startMin !== cursorEnd) continue;
          chain += 1;
          cursorEnd = item.endMin;
        }

        return chain > limit;
      };

      const subjectHasPendingMinutes = (subject) =>
        (subjectTargetMinutes[subject] || 0) > ((subjectMinutesAssigned[subject] || 0) + 1);

      const pendingSubjectsForCourse = () =>
        Object.keys(subjectTargetMinutes).filter((subject) => subjectHasPendingMinutes(subject));

      const scoreCandidate = (day, startMin, endMin) => {
        const dayItems = items.filter((item) => item.day === day).sort((a, b) => a.startMin - b.startMin);
        let previousItem = null;
        let nextItem = null;

        dayItems.forEach((item) => {
          if (item.endMin <= startMin) previousItem = item;
          if (!nextItem && item.startMin >= endMin) nextItem = item;
        });

        const gapBefore = previousItem ? Math.max(0, startMin - previousItem.endMin) : startMin;
        const gapAfter = nextItem ? Math.max(0, nextItem.startMin - endMin) : 0;
        return ((occupiedByDay[day] || []).length * 2000) + gapBefore + gapAfter + startMin;
      };

      courseStates.push({
        course,
        courseClassBlockMinutes,
        items,
        occupiedByDay,
        conflicts,
        subjectTargetMinutes,
        subjectBlockMinutesBySubject,
        subjectMinutesAssigned,
        schedulableWindowsByDay,
        hasExplicitClassWindows,
        classRequirements,
        teacherCandidateCountBySubject,
        createCourseItem,
        addOccupied,
        hasOccupiedConflict,
        wouldExceedConsecutiveLimit,
        pendingSubjectsForCourse,
        scoreCandidate,
      });
    });

    const totalPendingMinutesBySubject = {};
    const scarcityScoreBySubject = {};

    courseStates.forEach((state) => {
      const pendingMinutesBySubjectForState = state.classRequirements.reduce((acc, requirement) => {
        acc[requirement.subject] = (acc[requirement.subject] || 0) + requirement.minutes;
        return acc;
      }, {});

      Object.entries(pendingMinutesBySubjectForState).forEach(([subject, pendingMinutes]) => {
        totalPendingMinutesBySubject[subject] = (totalPendingMinutesBySubject[subject] || 0) + pendingMinutes;
        scarcityScoreBySubject[subject] = (scarcityScoreBySubject[subject] || 0) + (pendingMinutes / Math.max(1, state.teacherCandidateCountBySubject[subject] || 0));
      });
    });

    const subjectsInSchedulingOrder = Object.keys(totalPendingMinutesBySubject).sort((a, b) => {
      const scarcityDiff = (scarcityScoreBySubject[b] || 0) - (scarcityScoreBySubject[a] || 0);
      if (scarcityDiff !== 0) return scarcityDiff;

      const demandDiff = (totalPendingMinutesBySubject[b] || 0) - (totalPendingMinutesBySubject[a] || 0);
      if (demandDiff !== 0) return demandDiff;

      return a.localeCompare(b, 'es');
    });

    subjectsInSchedulingOrder.forEach((subject) => {
      const subjectRequirements = courseStates
        .flatMap((state) => state.classRequirements.map((requirement, index) => ({
          ...requirement,
          state,
          order: index,
        })))
        .filter((requirement) => requirement.subject === subject)
        .sort((a, b) => {
          const candidateDiff = (a.state.teacherCandidateCountBySubject[subject] || 0) - (b.state.teacherCandidateCountBySubject[subject] || 0);
          if (candidateDiff !== 0) return candidateDiff;

          const assignedDiff = (a.state.subjectMinutesAssigned[subject] || 0) - (b.state.subjectMinutesAssigned[subject] || 0);
          if (assignedDiff !== 0) return assignedDiff;

          const courseDiff = a.state.course.courseLabel.localeCompare(b.state.course.courseLabel, 'es');
          if (courseDiff !== 0) return courseDiff;

          return a.order - b.order;
        });

      subjectRequirements.forEach(({ state, order, ...requirement }) => {
        placeClassRequirementForCourseState(state, requirement);
      });
    });

    courseStates.forEach((state) => {
      const {
        course,
        courseClassBlockMinutes,
        items,
        occupiedByDay,
        conflicts,
        subjectTargetMinutes,
        subjectBlockMinutesBySubject,
        subjectMinutesAssigned,
        schedulableWindowsByDay,
        hasExplicitClassWindows,
        createCourseItem,
        addOccupied,
        hasOccupiedConflict,
        wouldExceedConsecutiveLimit,
        pendingSubjectsForCourse,
      } = state;

      WEEK_DAYS.forEach((day) => {
        const schedulableWindows = schedulableWindowsByDay[day] || [];
        if (!schedulableWindows.length) return;

        if (hasExplicitClassWindows) {
          schedulableWindows.forEach((window) => {
            const duration = window.endMin - window.startMin;
            if (hasOccupiedConflict(day, window.startMin, window.endMin)) return;

            const pendingSubjects = pendingSubjectsForCourse().filter((subject) => subjectBlockMinutesBySubject[subject] === duration);

            if (pendingSubjects.length === 0) {
              items.push(createCourseItem({
                type: 'unassigned',
                label: 'Bloque sin asignatura',
                day,
                subject: 'Bloque sin asignatura',
                startMin: window.startMin,
                endMin: window.endMin,
                teacherName: 'Sin asignar',
              }));
              addOccupied(day, window.startMin, window.endMin);
              conflicts.push(`Bloque de clase sin asignatura (${day} ${minutesToClockLabel(window.startMin)}-${minutesToClockLabel(window.endMin)}). La carga académica configurada no llena esta franja.`);
              return;
            }

            const assignmentCandidates = pendingSubjects
              .filter((subject) => !wouldExceedConsecutiveLimit(day, window.startMin, window.endMin, subject))
              .flatMap((subject) => {
                const ratio = (subjectMinutesAssigned[subject] || 0) / Math.max(subjectTargetMinutes[subject] || duration, duration);
                return getAssignableTeachers(subject, course.gradeKey, day, window.startMin, window.endMin)
                  .filter((teacher) => {
                    const busy = teacherBusy[teacher.id][day] || [];
                    return !busy.some((entry) => overlaps(window.startMin, window.endMin, entry.startMin, entry.endMin));
                  })
                  .map((teacher) => ({
                    subject,
                    teacher,
                    score: (ratio * 10000) + (subjectMinutesAssigned[subject] || 0) + getTeacherPlacementScore(teacher, day, window.startMin, window.endMin),
                  }));
              })
              .sort((a, b) => a.score - b.score);

            const selectedAssignment = assignmentCandidates[0];

            if (!selectedAssignment) {
              items.push(createCourseItem({
                type: 'unassigned',
                label: 'Bloque sin asignatura',
                day,
                subject: 'Bloque sin asignatura',
                startMin: window.startMin,
                endMin: window.endMin,
                teacherName: 'Sin asignar',
              }));
              addOccupied(day, window.startMin, window.endMin);
              conflicts.push(`No se pudo asignar una asignatura en ${day} ${minutesToClockLabel(window.startMin)}-${minutesToClockLabel(window.endMin)} por disponibilidad docente o espacio.`);
              return;
            }

            items.push(createCourseItem({
              type: 'class',
              label: selectedAssignment.subject,
              day,
              subject: selectedAssignment.subject,
              startMin: window.startMin,
              endMin: window.endMin,
              teacherName: selectedAssignment.teacher.name,
            }));
            addOccupied(day, window.startMin, window.endMin);
            registerTeacherBusy(selectedAssignment.teacher.id, day, window.startMin, window.endMin);
            subjectMinutesAssigned[selectedAssignment.subject] = (subjectMinutesAssigned[selectedAssignment.subject] || 0) + duration;
          });

          return;
        }

        const dayOccupied = mergeIntervals((occupiedByDay[day] || []).map((entry) => ({ startMin: entry.startMin, endMin: entry.endMin })));
        const freeIntervals = subtractIntervals(schedulableWindows, dayOccupied);

        freeIntervals.forEach((interval) => {
          let cursor = interval.startMin;

          while (cursor < interval.endMin) {
            const remaining = interval.endMin - cursor;
            if (remaining < courseClassBlockMinutes) {
              items.push(createCourseItem({
                type: 'unassigned',
                label: 'Bloque sin asignatura',
                day,
                subject: 'Bloque sin asignatura',
                startMin: cursor,
                endMin: interval.endMin,
                teacherName: 'Sin asignar',
              }));
              addOccupied(day, cursor, interval.endMin);
              conflicts.push(`Franja de clase sin asignatura (${day} ${minutesToClockLabel(cursor)}-${minutesToClockLabel(interval.endMin)}). La jornada deja un espacio que no está cubierto por la carga académica.`);
              break;
            }

            const duration = courseClassBlockMinutes;
            const pendingSubjects = pendingSubjectsForCourse();

            if (pendingSubjects.length === 0) {
              items.push(createCourseItem({
                type: 'unassigned',
                label: 'Bloque sin asignatura',
                day,
                subject: 'Bloque sin asignatura',
                startMin: cursor,
                endMin: cursor + duration,
                teacherName: 'Sin asignar',
              }));
              addOccupied(day, cursor, cursor + duration);
              conflicts.push(`Bloque de clase sin asignatura (${day} ${minutesToClockLabel(cursor)}-${minutesToClockLabel(cursor + duration)}). La carga académica configurada no llena esta franja.`);
              cursor += duration;
              continue;
            }

            const assignmentCandidates = pendingSubjects
              .filter((subject) => hasTeacherCoverageForSlot(subject, course.gradeKey, day, cursor, cursor + duration))
              .filter((subject) => !wouldExceedConsecutiveLimit(day, cursor, cursor + duration, subject))
              .flatMap((subject) => {
                const ratio = (subjectMinutesAssigned[subject] || 0) / Math.max(subjectTargetMinutes[subject] || courseClassBlockMinutes, courseClassBlockMinutes);
                return getAssignableTeachers(subject, course.gradeKey, day, cursor, cursor + duration)
                  .filter((teacher) => {
                    const busy = teacherBusy[teacher.id][day] || [];
                    return !busy.some((entry) => overlaps(cursor, cursor + duration, entry.startMin, entry.endMin));
                  })
                  .map((teacher) => ({
                    subject,
                    teacher,
                    score: (ratio * 10000) + (subjectMinutesAssigned[subject] || 0) + getTeacherPlacementScore(teacher, day, cursor, cursor + duration),
                  }));
              })
              .sort((a, b) => a.score - b.score);

            const selectedAssignment = assignmentCandidates[0];

            if (!selectedAssignment) {
              items.push(createCourseItem({
                type: 'unassigned',
                label: 'Bloque pendiente',
                day,
                subject: 'Bloque pendiente',
                startMin: cursor,
                endMin: cursor + duration,
                teacherName: 'Sin docente',
              }));
              addOccupied(day, cursor, cursor + duration);
              conflicts.push(`Bloque pendiente sin docente (${day} ${minutesToClockLabel(cursor)}-${minutesToClockLabel(cursor + duration)}).`);
              cursor += duration;
              continue;
            }

            items.push(createCourseItem({
              type: 'class',
              label: selectedAssignment.subject,
              day,
              subject: selectedAssignment.subject,
              startMin: cursor,
              endMin: cursor + duration,
              teacherName: selectedAssignment.teacher.name,
            }));
            addOccupied(day, cursor, cursor + duration);
            registerTeacherBusy(selectedAssignment.teacher.id, day, cursor, cursor + duration);
            subjectMinutesAssigned[selectedAssignment.subject] = (subjectMinutesAssigned[selectedAssignment.subject] || 0) + duration;
            cursor += duration;
          }
        });
      });

      const sortedItems = items.sort((a, b) => {
        const dayDiff = WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day);
        if (dayDiff !== 0) return dayDiff;
        return a.startMin - b.startMin;
      });

      const unmetSubjects = Object.entries(subjectTargetMinutes)
        .map(([subject, targetMinutes]) => ({ subject, targetMinutes, assignedMinutes: subjectMinutesAssigned[subject] || 0 }))
        .filter((entry) => entry.assignedMinutes + 1 < entry.targetMinutes);

      if (unmetSubjects.length > 0) {
        conflicts.push(`Asignaturas pendientes: ${unmetSubjects.map((entry) => `${entry.subject} (${minutesToHoursLabel(entry.assignedMinutes)} / ${minutesToHoursLabel(entry.targetMinutes)})`).join(', ')}.`);
      }

      byCourse[course.courseKey] = {
        courseLabel: course.courseLabel,
        gradeKey: course.gradeKey,
        courseName: course.courseName,
        levelName: course.levelName,
        items: sortedItems,
        conflicts,
      };
    });

    const blockingIssues = Object.values(byCourse)
      .flatMap((schedule) => (schedule.conflicts || []).map((issue) => `${schedule.courseLabel}: ${issue}`));

    return {
      byCourse,
      blockingIssues: [...new Set(blockingIssues)],
    };
  };

  const preGenerationScheduleAnalysis = useMemo(() => {
    if (!shouldRunSchedulePreview || gradeRows.length === 0) {
      return { byCourse: {}, blockingIssues: [] };
    }

    return buildGeneratedCourseSchedulePreview(new Set(gradeRows.map((row) => row.key)));
  }, [
    shouldRunSchedulePreview,
    gradeRows,
    coursesByGrade,
    singleCourseGrades,
    staffByRole,
    subjectLoads,
    scheduleShifts,
    scheduleBreaks,
    scheduleGuidanceRoutines,
    scheduleControl,
    scheduleSports,
    scheduleOtherBlocks,
    scheduleClassSlots,
    fixedSubjectSlots,
    globalPinnedSubjectRules,
    maxConsecutiveBySubject,
    calendarSlotMinutes,
  ]);

  const canPreviewScheduleConflictsInDocencia = useMemo(() => (
    scheduleShifts.length > 0
    && shiftValidationIssues.length === 0
    && subjects.length > 0
    && subjects.every((subject) => Number(maxConsecutiveBySubject[subject]) > 0)
  ), [scheduleShifts, shiftValidationIssues, subjects, maxConsecutiveBySubject]);

  const preGenerationConflictCountBySubject = useMemo(() => {
    if (!canPreviewScheduleConflictsInDocencia || preGenerationScheduleAnalysis.blockingIssues.length === 0) {
      return {};
    }

    return preGenerationScheduleAnalysis.blockingIssues.reduce((acc, issue) => {
      extractSubjectsFromSchedulingConflict(issue, subjects).forEach((subject) => {
        acc[subject] = (acc[subject] || 0) + 1;
      });
      return acc;
    }, {});
  }, [canPreviewScheduleConflictsInDocencia, preGenerationScheduleAnalysis.blockingIssues, subjects]);

  const preGenerationConflictIssuesBySubject = useMemo(() => {
    if (!canPreviewScheduleConflictsInDocencia || preGenerationScheduleAnalysis.blockingIssues.length === 0) {
      return {};
    }

    return preGenerationScheduleAnalysis.blockingIssues.reduce((acc, issue) => {
      extractSubjectsFromSchedulingConflict(issue, subjects).forEach((subject) => {
        if (!acc[subject]) acc[subject] = [];
        acc[subject].push(issue);
      });
      return acc;
    }, {});
  }, [canPreviewScheduleConflictsInDocencia, preGenerationScheduleAnalysis.blockingIssues, subjects]);

  const preGenerationTeacherSchedulesForFilteredSubject = useMemo(() => {
    if (!docenciaCoverageFilterSubject) return [];

    const previewWeekDays = WEEK_DAYS.filter((day) => day !== 'Sabado');
    const schedulesByCourse = Object.values(preGenerationScheduleAnalysis.byCourse || {});

    return (staffByRole.docencia?.members || [])
      .filter((member) => isTeacherSchedulable(member) && (member.subjects || []).includes(docenciaCoverageFilterSubject))
      .map((member, index) => {
        const teacherName = String(member?.name || '').trim();
        const availabilityByDay = getTeacherAvailabilityByDay(member);
        const normalizedAvailabilityByDay = Object.fromEntries(
          previewWeekDays.map((day) => [day, [...(availabilityByDay[day] || [])].sort((a, b) => a.startMin - b.startMin)]),
        );
        const scheduledByDay = Object.fromEntries(previewWeekDays.map((day) => [day, []]));

        schedulesByCourse.forEach((schedule) => {
          (schedule.items || []).forEach((item) => {
            if (!teacherName || String(item?.teacherName || '').trim() !== teacherName) return;
            if (!previewWeekDays.includes(item?.day)) return;
            if (!Number.isFinite(item?.startMin) || !Number.isFinite(item?.endMin) || item.endMin <= item.startMin) return;
            if (!['class', 'fixed', 'global'].includes(item?.type)) return;

            scheduledByDay[item.day].push({
              courseLabel: schedule.courseLabel,
              subject: item.subject,
              type: item.type,
              startMin: item.startMin,
              endMin: item.endMin,
            });
          });
        });

        previewWeekDays.forEach((day) => {
          scheduledByDay[day].sort((a, b) => a.startMin - b.startMin);
        });

        const allAvailabilityIntervals = previewWeekDays.flatMap((day) => normalizedAvailabilityByDay[day] || []);
        const fallbackStartMin = timeToMinutes(member?.startTime) ?? (7 * 60);
        const fallbackEndMin = timeToMinutes(member?.endTime) ?? (15 * 60);
        const visibleStartMin = allAvailabilityIntervals.length
          ? Math.min(...allAvailabilityIntervals.map((interval) => interval.startMin))
          : fallbackStartMin;
        const visibleEndMin = allAvailabilityIntervals.length
          ? Math.max(...allAvailabilityIntervals.map((interval) => interval.endMin))
          : fallbackEndMin;

        const totalAvailableMinutes = previewWeekDays.reduce(
          (acc, day) => acc + (normalizedAvailabilityByDay[day] || []).reduce((sum, interval) => sum + (interval.endMin - interval.startMin), 0),
          0,
        );
        const assignedMinutes = previewWeekDays.reduce(
          (acc, day) => acc + (scheduledByDay[day] || []).reduce((sum, item) => sum + (item.endMin - item.startMin), 0),
          0,
        );
        const selectedSubjectMinutes = previewWeekDays.reduce(
          (acc, day) => acc + (scheduledByDay[day] || [])
            .filter((item) => item.subject === docenciaCoverageFilterSubject)
            .reduce((sum, item) => sum + (item.endMin - item.startMin), 0),
          0,
        );

        const assignedGradeLabels = getTeacherAssignedGradeKeys(member)
          .map((gradeKey) => {
            const row = gradeRows.find((entry) => entry.key === gradeKey);
            return row ? `${row.grade} ${row.levelName}` : gradeKey;
          })
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'es'));

        return {
          id: `${teacherName || 'docente'}-${index}`,
          teacherName: teacherName || `Docente ${index + 1}`,
          assignedGradeLabels,
          availabilityByDay: normalizedAvailabilityByDay,
          scheduledByDay,
          visibleStartMin,
          visibleEndMin,
          totalAvailableMinutes,
          assignedMinutes,
          selectedSubjectMinutes,
          remainingMinutes: Math.max(0, totalAvailableMinutes - assignedMinutes),
        };
      })
      .sort((a, b) => {
        if (b.selectedSubjectMinutes !== a.selectedSubjectMinutes) return b.selectedSubjectMinutes - a.selectedSubjectMinutes;
        if (b.assignedMinutes !== a.assignedMinutes) return b.assignedMinutes - a.assignedMinutes;
        return a.teacherName.localeCompare(b.teacherName, 'es');
      });
  }, [
    docenciaCoverageFilterSubject,
    gradeRows,
    preGenerationScheduleAnalysis.byCourse,
    staffByRole,
  ]);

  const scheduleGenerationCoverageAnalysis = useMemo(() => {
    if (!scheduleGenerationLevelId || connectedScheduleGenerationGradeKeys.size === 0) {
      return { blockingIssues: [], activeTeacherCount: 0 };
    }

    const activeTeachers = (staffByRole.docencia?.members || []).filter((member) => isTeacherSchedulable(member));
    const parallelCoverageAnalysis = getTeacherParallelCoverageAnalysis(connectedScheduleGenerationGradeKeys);
    const teacherCapacityMinutes = activeTeachers.map((teacher) => getTeacherWeeklyAvailableMinutes(teacher));
    const averageTeacherCapacity = teacherCapacityMinutes.length
      ? Math.round(teacherCapacityMinutes.reduce((acc, value) => acc + value, 0) / teacherCapacityMinutes.length)
      : 0;

    const subjectDemandMinutes = {};
    const subjectSupplyMinutes = {};
    const blockingIssues = [];
    const uncoveredPairs = new Set();

    subjectLoads.forEach((load) => {
      (load.gradeKeys || []).forEach((gradeKey) => {
        if (!connectedScheduleGenerationGradeKeys.has(gradeKey)) return;

        const weeklyMinutesPerCourse = getLoadWeeklyMinutes(load, getLoadBlockMinutesForGrade(load, gradeKey));
        if (weeklyMinutesPerCourse <= 0) return;

        const courseCount = Math.max(1, courseCountByGradeKey[gradeKey] || 1);
        subjectDemandMinutes[load.subject] = (subjectDemandMinutes[load.subject] || 0) + (weeklyMinutesPerCourse * courseCount);

        const candidates = activeTeachers.filter(
          (teacher) => (teacher.subjects || []).includes(load.subject) && getTeacherAssignedGradeKeys(teacher).includes(gradeKey),
        );

        if (candidates.length === 0) {
          const grade = gradeRows.find((row) => row.key === gradeKey);
          const pairKey = `${load.subject}::${gradeKey}`;
          if (uncoveredPairs.has(pairKey)) return;
          uncoveredPairs.add(pairKey);
          blockingIssues.push(
            `Sin cobertura docente para ${load.subject} en ${grade ? `${grade.grade} ${grade.levelName}` : gradeKey}.`,
          );
        }
      });
    });

    activeTeachers.forEach((member) => {
      const hasSelectedLevelCourse = getTeacherAssignedGradeKeys(member).some((gradeKey) => connectedScheduleGenerationGradeKeys.has(gradeKey));
      if (!hasSelectedLevelCourse) return;
      const weeklyMinutes = getTeacherWeeklyAvailableMinutes(member);
      if (weeklyMinutes <= 0) return;

      (member.subjects || []).forEach((subject) => {
        subjectSupplyMinutes[subject] = (subjectSupplyMinutes[subject] || 0) + weeklyMinutes;
      });
    });

    Object.entries(subjectDemandMinutes).forEach(([subject, demand]) => {
      const supply = subjectSupplyMinutes[subject] || 0;
      if (supply >= demand) return;
      const missing = demand - supply;
      const suggestedTeachers = averageTeacherCapacity > 0 ? Math.ceil(missing / averageTeacherCapacity) : null;
      blockingIssues.push(
        suggestedTeachers
          ? `${subject}: faltan ${minutesToHoursLabel(missing)} semanales en ${connectedScheduleGenerationLevelNames.join(', ') || 'este grupo conectado'}. Recomendación: agregar ${suggestedTeachers} docente(s) con esta asignatura o ampliar jornadas.`
          : `${subject}: faltan ${minutesToHoursLabel(missing)} semanales de cobertura docente en ${connectedScheduleGenerationLevelNames.join(', ') || 'este grupo conectado'}.`,
      );
    });

    return {
      blockingIssues: [...new Set([...blockingIssues, ...parallelCoverageAnalysis.blockingIssues])],
      activeTeacherCount: activeTeachers.length,
    };
  }, [
    scheduleGenerationLevelId,
    connectedScheduleGenerationGradeKeys,
    connectedScheduleGenerationLevelNames,
    staffByRole,
    subjectLoads,
    courseCountByGradeKey,
    gradeRows,
    selectedLevels,
    gradeKeysByLevel,
    scheduleClassSlots,
    coursesByGrade,
    singleCourseGrades,
    scheduleShifts,
    scheduleBreaks,
    scheduleGuidanceRoutines,
    scheduleControl,
    scheduleSports,
    scheduleOtherBlocks,
    fixedSubjectSlots,
    globalPinnedSubjectRules,
    maxConsecutiveBySubject,
    calendarSlotMinutes,
  ]);

  const canContinue = useMemo(() => {
    if (step === 0) {
      return schoolName.trim().length >= 3;
    }

    if (step === 1) {
      return selectedLevelIds.length > 0;
    }

    if (step === 2) {
      return selectedLevels.every((level) => {
        const grades = gradesByLevel[level.id] || DEFAULT_GRADES_BY_LEVEL[level.id] || [];
        return grades.length > 0;
      });
    }

    if (step === 3) {
      if (gradeRows.length === 0) return false;
      return gradeRows.every((row) => singleCourseGrades[row.key] || (coursesByGrade[row.key] || []).length > 0);
    }

    if (step === 4) {
      return subjects.length > 0;
    }

    if (step === 5) {
      if (gradeRows.length === 0) {
        return false;
      }

      return gradeRows.every((row) => (subjectMapByGrade[row.key] || []).length > 0);
    }

    if (step === 6) {
      return periods.length > 0 && periods.every((period) => String(period.name || '').trim().length > 0);
    }

    if (step === 9) {
      const role = staffByRole.coordinacion;
      if (role.skip) return true;

      const hasAtLeastOneValidMember = role.members.some(
        (m) =>
          m.name.trim().length > 0 &&
          String(m.email || '').trim().length > 0 &&
          String(m.password || '').trim().length > 0,
      );

      if (!hasAtLeastOneValidMember) return false;

      const assignedLevels = new Set(role.members.flatMap((m) => m.levels || []));
      return selectedLevels.every((level) => assignedLevels.has(level.id));
    }

    if (step === 10) {
      const role = staffByRole.docencia;
      if (role.skip) return false;

      const hasConfiguredTeacher = role.members.some((m) => {
        const baseOk =
          m.name.trim().length > 0 &&
          String(m.email || '').trim().length > 0 &&
          String(m.password || '').trim().length > 0;

        const academicOk = (m.subjects || []).length > 0 && (m.courses || []).length > 0;

        return baseOk && academicOk;
      });

      if (!hasConfiguredTeacher) return false;

      const activeMembers11 = staffByRole.docencia.members.filter((m) => m.name.trim().length > 0);
      const uncovered11 = [];
      gradeRows.forEach((row) => {
        (subjectMapByGrade[row.key] || []).forEach((subject) => {
          const covered = activeMembers11.some(
            (m) => (m.subjects || []).includes(subject) && (m.courses || []).includes(row.key),
          );
          if (!covered) uncovered11.push(row.key);
        });
      });

      return uncovered11.length === 0;
    }

    if (step === 18) {
      const surcharge = String(financialCalendar.lateEnrollmentSurchargePercent || '').trim();
      const surchargeValid = !surcharge || isNonNegativeNumericInput(surcharge);
      return String(financialCalendar.enrollmentStartDate || '').trim().length > 0 && surchargeValid;
    }

    if (step === 19) {
      return gradeRows.length > 0 && gradeRows.every((row) => {
        const costs = financialCostsByGrade[row.key] || {};
        return FINANCIAL_COST_FIELDS.every((field) => {
          const value = costs[field.key];
          if (field.optional && String(value || '').trim().length === 0) return true;
          return isNonNegativeNumericInput(value);
        });
      });
    }

    if (step === 20) {
      return economicBenefits.every((benefit) => {
        const hasAnyValue = String(benefit.name || '').trim()
          || String(benefit.value || '').trim()
          || String(benefit.promptPaymentDayLimit || '').trim()
          || String(benefit.description || '').trim();
        if (!hasAnyValue) return true;
        return String(benefit.name || '').trim().length > 0
          && isNonNegativeNumericInput(benefit.value)
          && hasValidPromptPaymentRule(benefit);
      });
    }

    if (step === 30) {
      return scheduleShifts.length > 0 && shiftValidationIssues.length === 0;
    }

    if (step === 31) {
      return classBlockOptions.length > 0;
    }

    if (step === 32) {
      return scheduleBreaks.length > 0 && breakValidationIssues.length === 0;
    }

    if (step === 33) {
      return scheduleGuidanceRoutines.length > 0 && guidanceRoutineValidationIssues.length === 0;
    }

    if (step === 34) {
      return scheduleControl.length > 0 && controlValidationIssues.length === 0;
    }

    if (step === 35) {
      return subjects.length > 0 && subjects.every((subject) => Number(maxConsecutiveBySubject[subject]) > 0);
    }

    if (step === 36) {
      return schedulePrevalidationAnalysis.blockingIssues.length === 0;
    }

    if (step === 37) {
      return Object.keys(generatedCourseSchedules).length > 0;
    }

    if (step === 38) {
      return scheduleReviewConfirmed;
    }

    if (step === 39) {
      return Object.keys(generatedTeacherSchedules).length > 0;
    }

    if (step >= 7 && step <= 16) {
      const role = staffByRole[STAFF_ROLES[step - 7].key];
      if (role.skip) return true;

      const hasValidMember = role.members.some(
        (m) =>
          m.name.trim().length > 0 &&
          String(m.email || '').trim().length > 0 &&
          String(m.password || '').trim().length > 0,
      );

      if (!hasValidMember) return false;

      // Roles that require level assignment: coordinacion (step 9 handled separately),
      // psicologia, enfermeria.
      const rolesRequiringLevels = ['psicologia', 'enfermeria'];
      const roleKey = STAFF_ROLES[step - 7].key;
      if (rolesRequiringLevels.includes(roleKey)) {
        const assignedLevels = new Set(
          role.members
            .filter((m) => m.name.trim().length > 0)
            .flatMap((m) => m.levels || []),
        );
        return selectedLevels.every((level) => assignedLevels.has(level.id));
      }

      return true;
    }

    return true;
  }, [
    step,
    schoolName,
    selectedLevelIds,
    selectedLevels,
    gradesByLevel,
    coursesByGrade,
    singleCourseGrades,
    subjects,
    gradeRows,
    subjectMapByGrade,
    periods,
    staffByRole,
    scheduleShifts,
    scheduleBlocks,
    scheduleBreaks,
    scheduleGuidanceRoutines,
    scheduleControl,
    subjectLoads,
    maxConsecutiveBySubject,
    fixedSubjectSlots,
    generatedCourseSchedules,
    scheduleReviewConfirmed,
    generatedTeacherSchedules,
    financialCalendar,
    financialCostsByGrade,
    economicBenefits,
    shiftValidationIssues,
    breakValidationIssues,
    guidanceRoutineValidationIssues,
    controlValidationIssues,
    loadBalanceIssues,
    globalClassBlockMinutes,
    teacherBlockingIssues,
    schedulePrevalidationAnalysis.blockingIssues,
    preGenerationScheduleAnalysis.blockingIssues,
  ]);

  const blockReason = useMemo(() => {
    if (canContinue) return null;

    if (step === 0) return 'El nombre debe tener al menos 3 caracteres.';
    if (step === 1) return 'Selecciona al menos un nivel educativo.';
    if (step === 2) return 'Cada nivel debe tener al menos un grado.';
    if (step === 3) return "Cada grado debe tener al menos un curso, o marca 'Solo tiene un curso'.";
    if (step === 4) return 'Agrega al menos una asignatura.';
    if (step === 5) return 'Todos los cursos deben tener al menos una asignatura asignada en el mapa.';
    if (step === 6) return 'Todos los periodos deben tener nombre.';
    if (step === 18) return 'Define la fecha de inicio de matrículas. El recargo por matrícula tardía debe ser un porcentaje válido si lo usas.';
    if (step === 19) return 'Define matrícula y pensión para cada grado. El bono es opcional.';
    if (step === 20) return 'Completa nombre y valor en cada beneficio. Para pronto pago, define cuántos primeros días del mes aplican.';

    if (step === 9) {
      const role = staffByRole.coordinacion;
      const hasValid = role.members.some(
        (m) => m.name.trim().length > 0 && String(m.email || '').trim().length > 0 && String(m.password || '').trim().length > 0,
      );
      if (!hasValid) return 'Agrega al menos un coordinador con nombre, correo y contraseña.';
      const assigned = new Set(role.members.flatMap((m) => m.levels || []));
      const missing = selectedLevels.filter((l) => !assigned.has(l.id)).map((l) => l.name);
      return `Niveles sin coordinador asignado: ${missing.join(', ')}.`;
    }

    if (step === 10) {
      const role = staffByRole.docencia;
      const hasValid = role.members.some(
        (m) =>
          m.name.trim().length > 0 &&
          String(m.email || '').trim().length > 0 &&
          String(m.password || '').trim().length > 0 &&
          (m.subjects || []).length > 0 &&
          (m.courses || []).length > 0,
      );
          if (!hasValid) return 'Configura al menos un docente con asignatura(s) y grado(s).';

      const active = role.members.filter((m) => m.name.trim().length > 0);
      const missing = [];
      gradeRows.forEach((row) => {
        (subjectMapByGrade[row.key] || []).forEach((subject) => {
          const covered = active.some((m) => (m.subjects || []).includes(subject) && (m.courses || []).includes(row.key));
          if (!covered) missing.push(`${row.grade} ${row.levelName} / ${subject}`);
        });
      });
      if (missing.length) return `Sin docente asignado: ${missing.slice(0, 3).join('; ')}${missing.length > 3 ? ` y ${missing.length - 3} más` : ''}.`;
    }

    if (step >= 7 && step <= 16) {
      const roleKey = STAFF_ROLES[step - 7].key;
      const role = staffByRole[roleKey];
      const hasValid = role.members.some(
        (m) => m.name.trim().length > 0 && String(m.email || '').trim().length > 0 && String(m.password || '').trim().length > 0,
      );
      if (!hasValid) return 'Agrega al menos un integrante con nombre, correo y contraseña.';
      const rolesRequiringLevels = ['psicologia', 'enfermeria'];
      if (rolesRequiringLevels.includes(roleKey)) {
        const assigned = new Set(role.members.filter((m) => m.name.trim()).flatMap((m) => m.levels || []));
        const missing = selectedLevels.filter((l) => !assigned.has(l.id)).map((l) => l.name);
        return `Niveles sin asignar: ${missing.join(', ')}.`;
      }
    }

    return 'Completa los campos requeridos para continuar.';
  }, [
    canContinue,
    step,
    staffByRole,
    selectedLevels,
    gradeRows,
    subjectMapByGrade,
    shiftValidationIssues,
    classBlockOptions,
    breakValidationIssues,
    guidanceRoutineValidationIssues,
    controlValidationIssues,
    loadBalanceIssues,
    teacherBlockingIssues,
    schedulePrevalidationAnalysis.blockingIssues,
    calendarWarning,
    financialCalendar,
    financialCostsByGrade,
    economicBenefits,
  ]);

  const generatedCourseEntries = useMemo(
    () =>
      Object.entries(generatedCourseSchedules).sort(([, a], [, b]) =>
        String(a.courseLabel || '').localeCompare(String(b.courseLabel || ''), 'es'),
      ),
    [generatedCourseSchedules],
  );

  const generatedCourseEntriesForDisplay = useMemo(
    () => generatedCourseEntries.filter(([, course]) =>
      !scheduleGenerationLevelId || scheduleGenerationGradeKeys.has(course.gradeKey)
    ),
    [generatedCourseEntries, scheduleGenerationLevelId, scheduleGenerationGradeKeys],
  );

  const selectedGeneratedCourseSchedule = useMemo(() => {
    if (generatedCourseEntriesForDisplay.length === 0) return null;
    const direct = generatedCourseSchedules[selectedCourseScheduleKey];
    if (direct && (!scheduleGenerationLevelId || scheduleGenerationGradeKeys.has(direct.gradeKey))) {
      return { key: selectedCourseScheduleKey, data: direct };
    }
    const [fallbackKey, fallbackData] = generatedCourseEntriesForDisplay[0];
    return { key: fallbackKey, data: fallbackData };
  }, [
    generatedCourseEntriesForDisplay,
    generatedCourseSchedules,
    scheduleGenerationGradeKeys,
    scheduleGenerationLevelId,
    selectedCourseScheduleKey,
  ]);

  const selectedSchedulePreviewWindow = useMemo(() => {
    if (!selectedGeneratedCourseSchedule) {
      return getSchedulePreviewWindow([], calendarViewStartMin, calendarViewEndMin);
    }

    return getSchedulePreviewWindow(
      selectedGeneratedCourseSchedule.data.items || [],
      calendarViewStartMin,
      calendarViewEndMin,
    );
  }, [selectedGeneratedCourseSchedule, calendarViewStartMin, calendarViewEndMin]);

  const generatedTeacherEntries = useMemo(
    () => Object.entries(generatedTeacherSchedules).sort(([, left], [, right]) =>
      String(left.teacherName || '').localeCompare(String(right.teacherName || ''), 'es')
    ),
    [generatedTeacherSchedules],
  );

  const generatedTeacherEntriesForDisplay = useMemo(
    () => generatedTeacherEntries.map(([teacherKey, teacherSchedule]) => ([
      teacherKey,
      {
        ...teacherSchedule,
        courseLabel: teacherSchedule.teacherName,
        items: (teacherSchedule.items || []).map((item) => ({
          ...item,
          label: item.subject,
          teacherName: item.courseLabel,
        })),
      },
    ])),
    [generatedTeacherEntries],
  );

  const selectedGeneratedTeacherSchedule = useMemo(() => {
    if (generatedTeacherEntriesForDisplay.length === 0) return null;
    const direct = generatedTeacherEntriesForDisplay.find(([teacherKey]) => teacherKey === selectedTeacherScheduleKey);
    if (direct) {
      return { key: direct[0], data: direct[1] };
    }
    const [fallbackKey, fallbackData] = generatedTeacherEntriesForDisplay[0];
    return { key: fallbackKey, data: fallbackData };
  }, [generatedTeacherEntriesForDisplay, selectedTeacherScheduleKey]);

  const selectedTeacherSchedulePreviewWindow = useMemo(() => {
    if (!selectedGeneratedTeacherSchedule) {
      return getSchedulePreviewWindow([], calendarViewStartMin, calendarViewEndMin);
    }

    return getSchedulePreviewWindow(
      selectedGeneratedTeacherSchedule.data.items || [],
      calendarViewStartMin,
      calendarViewEndMin,
    );
  }, [selectedGeneratedTeacherSchedule, calendarViewStartMin, calendarViewEndMin]);

  const getLoadWeeklySummaryLabel = (load) => {
    const selectedBlock = getSelectedClassBlockForLoad(load);
    const fallbackMinutes = selectedBlock?.minutes || globalClassBlockMinutes;
    const blocks = getLoadWeeklyBlocks(load, fallbackMinutes);
    if (blocks <= 0) return 'Define bloques semanales para calcular minutos.';

    const minutes = blocks * fallbackMinutes;
    if (!selectedBlock) {
      return `${minutesToHoursLabel(minutes)} por curso (${blocks} bloque(s) x ${fallbackMinutes} min).`;
    }

    return `${minutesToHoursLabel(minutes)} por curso (${blocks} bloque(s) x ${fallbackMinutes} min, ${selectedBlock.label || `Bloque de ${fallbackMinutes} min`}).`;
  };

  const goToWizardStep = (targetStep) => {
    if (!Number.isInteger(targetStep) || targetStep < 0 || targetStep >= stepLabels.length) return;
    const resolvedTargetStep = HIDDEN_BLOCK_CONFIGURATION_STEPS.has(targetStep) ? 21 : targetStep;
    setDirection(resolvedTargetStep >= step ? 'forward' : 'backward');
    setStep(resolvedTargetStep);
  };

  const renderConflictWithActions = (conflict, key) => {
    const lowerConflict = String(conflict || '').toLowerCase();
    const showBreaksAction = lowerConflict.includes('jornada/breaks') || lowerConflict.includes('breaks');
    const showClassBlocksAction = lowerConflict.includes('bloques de clase') || lowerConflict.includes('bloque clase');

    return (
      <li key={key}>
        <span>{conflict}</span>
        {showBreaksAction || showClassBlocksAction ? (
          <div className="school-creation-conflict-actions">
            {showBreaksAction ? (
              <button
                className="school-creation-link-button school-creation-conflict-action-button"
                type="button"
                onClick={() => goToWizardStep(21)}
              >
                Ir a Definición de bloques
              </button>
            ) : null}
            {showClassBlocksAction ? (
              <button
                className="school-creation-link-button school-creation-conflict-action-button"
                type="button"
                onClick={() => goToWizardStep(21)}
              >
                Ir a Bloques de clase
              </button>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  const renderGeneratedScheduleBoard = (course, size = 'compact') => {
    if (!course) return null;

    const items = course.items || [];
    const previewWindow = getSchedulePreviewWindow(items, calendarViewStartMin, calendarViewEndMin);
    const totalMinutes = Math.max(60, previewWindow.endMin - previewWindow.startMin);
    const previewDays = WEEK_DAYS.filter(
      (day) => items.some((item) => item.day === day) || ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'].includes(day),
    );
    const hourMarkers = [];

    for (let minute = previewWindow.startMin; minute <= previewWindow.endMin; minute += 60) {
      hourMarkers.push(minute);
    }

    if (size === 'compact') {
      return (
        <div className="school-creation-schedule-board school-creation-schedule-board--compact">
          <div className="school-creation-schedule-board-days">
            {previewDays.map((day) => {
              const dayItems = items.filter((item) => item.day === day);
              return (
                <div key={`compact-${course.courseLabel}-${day}`} className="school-creation-schedule-board-day">
                  <span>{day.slice(0, 1)}</span>
                  <div className="school-creation-schedule-board-lane">
                    {hourMarkers.map((marker) => {
                      const top = ((marker - previewWindow.startMin) / totalMinutes) * 100;
                      return <div key={`compact-line-${day}-${marker}`} className="school-creation-schedule-board-line" style={{ top: `${top}%` }} />;
                    })}
                    {dayItems.map((item, index) => {
                      const startMin = Math.max(item.startMin, previewWindow.startMin);
                      const endMin = Math.min(item.endMin, previewWindow.endMin);
                      const top = ((startMin - previewWindow.startMin) / totalMinutes) * 100;
                      const height = ((endMin - startMin) / totalMinutes) * 100;
                      return (
                        <div
                          key={`compact-item-${day}-${index}`}
                          className={`school-creation-schedule-board-block is-${item.type}`}
                          style={{ top: `${top}%`, height: `${height}%` }}
                          title={`${day} ${minutesToClockLabel(item.startMin)}-${minutesToClockLabel(item.endMin)} ${item.label}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    const totalSlots = Math.max(1, Math.ceil(totalMinutes / calendarSlotMinutes));
    const boardHeight = totalSlots * calendarRowHeight;
    const minuteRows = Array.from({ length: totalSlots }, (_, index) => {
      const minute = previewWindow.startMin + index * calendarSlotMinutes;
      const minuteOfHour = minute % 60;
      return {
        minute,
        label: minuteOfHour === 0 ? minutesToAmPmLabel(minute) : '',
        isHour: minuteOfHour === 0,
        isHalfHour: minuteOfHour === 30,
      };
    });

    return (
      <div className="school-creation-schedule-preview-calendar">
        <div className="school-creation-calendar-board-wrap">
          <div className="school-creation-calendar-times" style={{ height: `${boardHeight}px` }}>
            <div className="school-creation-calendar-time-header" aria-hidden="true" />
            {minuteRows.map((row) => (
              <div
                key={`preview-time-${row.minute}`}
                className={`school-creation-calendar-time-row ${row.isHour ? 'is-hour' : ''} ${row.isHalfHour ? 'is-half-hour' : ''}`}
              >
                <span>{row.label}</span>
              </div>
            ))}
          </div>

          <div
            className="school-creation-calendar-board"
            style={{ gridTemplateColumns: `repeat(${previewDays.length}, minmax(180px, 1fr))` }}
          >
            {previewDays.map((day) => {
              const dayItems = items.filter((item) => item.day === day);

              return (
                <div key={`preview-large-${course.courseLabel}-${day}`} className="school-creation-calendar-day-column">
                  <div className="school-creation-calendar-day-header">{day}</div>
                  <div className="school-creation-calendar-day-grid" style={{ height: `${boardHeight}px` }}>
                    {minuteRows.map((row) => (
                      <div
                        key={`preview-grid-${day}-${row.minute}`}
                        className={`school-creation-calendar-cell ${row.isHour ? 'is-hour' : ''} ${row.isHalfHour ? 'is-half-hour' : ''}`}
                      />
                    ))}

                    {dayItems.map((item, index) => {
                      const startMin = Math.max(item.startMin, previewWindow.startMin);
                      const endMin = Math.min(item.endMin, previewWindow.endMin);
                      if (endMin <= startMin) return null;

                      const top = ((startMin - previewWindow.startMin) / calendarSlotMinutes) * calendarRowHeight;
                      const height = ((endMin - startMin) / calendarSlotMinutes) * calendarRowHeight;

                      if (['break', 'guidance', 'control', 'sports', 'other'].includes(item.type)) {
                        const breakClass = item.type === 'guidance'
                          ? 'school-creation-calendar-break school-creation-calendar-break--guidance'
                          : item.type === 'control'
                          ? 'school-creation-calendar-break school-creation-calendar-break--control'
                          : item.type === 'sports'
                          ? 'school-creation-calendar-break school-creation-calendar-break--sports'
                          : item.type === 'other'
                          ? 'school-creation-calendar-break school-creation-calendar-break--other'
                          : 'school-creation-calendar-break';

                        return (
                          <div
                            key={`preview-break-${day}-${index}`}
                            className={breakClass}
                            style={{ top: `${top}px`, height: `${height}px` }}
                          >
                            {item.type === 'guidance' ? 'Guidance Routine' : item.type === 'control' ? 'Control' : item.type === 'sports' ? 'Deportes' : item.label || 'Otro' }
                          </div>
                        );
                      }

                      return (
                        <div
                          key={`preview-slot-${day}-${index}`}
                          className={`school-creation-calendar-subject-slot school-creation-schedule-preview-slot ${item.type === 'global' ? 'school-creation-calendar-subject-slot--global' : ''} ${item.type === 'unassigned' ? 'is-unassigned' : ''}`}
                          style={{ top: `${top}px`, height: `${height}px` }}
                        >
                          <strong>{item.label}</strong>
                          <small>{minutesToClockLabel(item.startMin)} - {minutesToClockLabel(item.endMin)}</small>
                          {item.teacherName ? <small>{item.teacherName}</small> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!selectedCourseScheduleKey && generatedCourseEntries.length > 0) {
      setSelectedCourseScheduleKey(generatedCourseEntries[0][0]);
      return;
    }

    if (selectedCourseScheduleKey && !generatedCourseSchedules[selectedCourseScheduleKey]) {
      setSelectedCourseScheduleKey(generatedCourseEntries[0]?.[0] || '');
    }
  }, [generatedCourseEntries, generatedCourseSchedules, selectedCourseScheduleKey]);

  useEffect(() => {
    if (!selectedTeacherScheduleKey && generatedTeacherEntriesForDisplay.length > 0) {
      setSelectedTeacherScheduleKey(generatedTeacherEntriesForDisplay[0][0]);
      return;
    }

    if (selectedTeacherScheduleKey && !generatedTeacherSchedules[selectedTeacherScheduleKey]) {
      setSelectedTeacherScheduleKey(generatedTeacherEntriesForDisplay[0]?.[0] || '');
    }
  }, [generatedTeacherEntriesForDisplay, generatedTeacherSchedules, selectedTeacherScheduleKey]);

  const goNext = () => {
    if (!canContinue || step >= stepLabels.length - 1) {
      return;
    }

    setDirection('forward');
    setStep((current) => current + 1);
  };

  const goBack = () => {
    if (step <= 0) {
      return;
    }

    setDirection('backward');
    setStep((current) => current - 1);
  };

  const updateFinancialCalendarField = (field, value) => {
    setFinancialCalendar((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateFinancialCostByGrade = (gradeKey, field, value) => {
    setFinancialCostsByGrade((current) => ({
      ...current,
      [gradeKey]: {
        ...(current[gradeKey] || {}),
        [field]: value,
      },
    }));
  };

  const addEconomicBenefit = () => {
    setEconomicBenefits((current) => [...current, makeDefaultEconomicBenefit(current.length + 1)]);
  };

  const updateEconomicBenefit = (benefitId, field, value) => {
    setEconomicBenefits((current) =>
      current.map((benefit) => {
        if (benefit.id !== benefitId) return benefit;
        const nextBenefit = { ...benefit, [field]: value, appliesTo: 'tuition' };
        if (field === 'name' && isPromptPaymentBenefit(nextBenefit) && !String(nextBenefit.promptPaymentDayLimit || '').trim()) {
          nextBenefit.promptPaymentDayLimit = '10';
        }
        return nextBenefit;
      }),
    );
  };

  const removeEconomicBenefit = (benefitId) => {
    setEconomicBenefits((current) => current.filter((benefit) => benefit.id !== benefitId));
  };

  const buildSchoolCreationPayload = () => ({
    schoolName,
    availableLevels,
    selectedLevelIds,
    gradesByLevel: resolvedGradesByLevel,
    coursesByGrade,
    singleCourseGrades,
    subjects,
    subjectMapByGrade,
    periods,
    staffByRole,
    financialCalendar,
    financialCostsByGrade,
    economicBenefits: economicBenefits.map((benefit) => ({
      ...benefit,
      appliesTo: 'tuition',
    })),
  });

  const completeSchoolSetupAndEnterRectoria = async () => {
    if (isCompletingSchoolCreation) return;

    setIsCompletingSchoolCreation(true);
    setSchoolCreationSubmitError('');

    try {
      const { data } = await completeSchoolCreation(buildSchoolCreationPayload());
      if (!data?.auth?.token || !data?.auth?.user) {
        throw new Error('El backend no devolvió una sesión válida de rectoría.');
      }

      setAuth(data.auth);
  rememberSchoolOptions({ id: data.school?.schoolId, label: data.school?.schoolName });
  localStorage.setItem('selectedSchoolId', data.school?.schoolId || data.auth.user.schoolId || '');
      localStorage.removeItem(WIZARD_STORAGE_KEY);
      cachedWizardState = null;
      cachedWizardStateLoaded = true;
      navigate('/rectoria', { replace: true });
    } catch (error) {
      setSchoolCreationSubmitError(error?.response?.data?.message || error?.message || 'No se pudo crear el colegio. Intenta de nuevo.');
    } finally {
      setIsCompletingSchoolCreation(false);
    }
  };

  useEffect(() => {
    if (step < stepLabels.length) return;
    setDirection('forward');
    setStep(18);
  }, [step, stepLabels.length]);

  useEffect(() => {
    setSubjectLoads((current) => {
      const filtered = current.filter((entry) => subjects.includes(entry.subject));
      if (filtered.length > 0) {
        return filtered;
      }

      return [makeDefaultSubjectLoad(subjects[0] || '')];
    });
  }, [subjects]);

  const toggleLevel = (levelId) => {
    setSelectedLevelIds((current) => {
      if (current.includes(levelId)) {
        return current.filter((id) => id !== levelId);
      }

      return [...current, levelId];
    });
  };

  const addCustomLevel = () => {
    const label = customLevelInput.trim();
    if (!label) {
      return;
    }

    const levelId = normalizeKey(label);
    if (!levelId) {
      return;
    }

    const exists = availableLevels.some((level) => level.id === levelId);
    if (!exists) {
      setAvailableLevels((current) => [...current, { id: levelId, name: label }]);
    }

    setSelectedLevelIds((current) => (current.includes(levelId) ? current : [...current, levelId]));
    setCustomLevelInput('');
  };

  const addGradeToLevel = (levelId) => {
    const label = String(gradeInputByLevel[levelId] || '').trim();
    if (!label) {
      return;
    }

    setGradesByLevel((current) => {
      const baseGrades = current[levelId] || DEFAULT_GRADES_BY_LEVEL[levelId] || [];
      if (baseGrades.includes(label)) {
        return current;
      }

      return {
        ...current,
        [levelId]: [...baseGrades, label],
      };
    });

    setGradeInputByLevel((current) => ({
      ...current,
      [levelId]: '',
    }));
  };

  const removeGrade = (levelId, gradeName) => {
    setGradesByLevel((current) => {
      const baseGrades = current[levelId] || DEFAULT_GRADES_BY_LEVEL[levelId] || [];
      const nextGrades = baseGrades.filter((grade) => grade !== gradeName);

      return {
        ...current,
        [levelId]: nextGrades,
      };
    });

    const gradeKey = `${levelId}:${gradeName}`;
    setSubjectMapByGrade((current) => {
      const nextMap = { ...current };
      delete nextMap[gradeKey];
      return nextMap;
    });
  };

  const toggleSingleCourse = (gradeKey) => {
    setSingleCourseGrades((current) => {
      const next = { ...current };
      if (next[gradeKey]) {
        delete next[gradeKey];
      } else {
        next[gradeKey] = true;
      }
      return next;
    });
  };

  const addCourseToGrade = (gradeKey) => {
    const label = String(courseInputByGrade[gradeKey] || '').trim();
    if (!label) return;
    setCoursesByGrade((current) => {
      const existing = current[gradeKey] || [];
      if (existing.includes(label)) return current;
      return { ...current, [gradeKey]: [...existing, label] };
    });
    setCourseInputByGrade((current) => ({ ...current, [gradeKey]: '' }));
  };

  const removeCourseFromGrade = (gradeKey, course) => {
    setCoursesByGrade((current) => ({
      ...current,
      [gradeKey]: (current[gradeKey] || []).filter((c) => c !== course),
    }));
  };

  const addSubject = () => {
    const label = subjectInput.trim();
    if (!label || subjects.includes(label)) {
      return;
    }

    setSubjects((current) => [...current, label]);
    setSubjectInput('');
  };

  const removeSubject = (subjectName) => {
    setSubjects((current) => current.filter((subject) => subject !== subjectName));

    setSubjectMapByGrade((current) => {
      const nextMap = {};
      Object.entries(current).forEach(([gradeKey, selectedSubjects]) => {
        nextMap[gradeKey] = selectedSubjects.filter((subject) => subject !== subjectName);
      });
      return nextMap;
    });
  };

  const toggleSubjectForGrade = (gradeKey, subjectName) => {
    setSubjectMapByGrade((current) => {
      const selectedSubjects = current[gradeKey] || [];
      if (selectedSubjects.includes(subjectName)) {
        return {
          ...current,
          [gradeKey]: selectedSubjects.filter((subject) => subject !== subjectName),
        };
      }

      return {
        ...current,
        [gradeKey]: [...selectedSubjects, subjectName],
      };
    });
  };

  const updatePeriod = (index, field, value) => {
    setPeriods((current) =>
      current.map((period, periodIndex) => {
        if (periodIndex !== index) {
          return period;
        }

        return {
          ...period,
          [field]: value,
        };
      }),
    );
  };

  const addPeriod = () => {
    setPeriods((current) => [...current, { name: `Periodo ${current.length + 1}`, startDate: '', endDate: '', weight: '' }]);
  };

  const removePeriod = (index) => {
    setPeriods((current) => current.filter((_, periodIndex) => periodIndex !== index));
  };

  const updateStaffMember = (roleKey, index, field, value) => {
    setStaffByRole((current) => {
      const role = current[roleKey];
      const members = role.members.map((m, i) => (i === index ? { ...m, [field]: value } : m));
      return { ...current, [roleKey]: { ...role, members } };
    });
  };

  const updateTeachingSchedulePreset = (presetKey, field, value) => {
    setTeachingSchedulePresets((current) => ({
      ...current,
      [presetKey]: {
        ...(current[presetKey] || {}),
        [field]: value,
      },
    }));
  };

  const toggleTeachingSchedulePresetDay = (presetKey, day) => {
    setTeachingSchedulePresets((current) => {
      const preset = current[presetKey] || { startTime: '', endTime: '', workDays: [] };
      const dayList = preset.workDays || [];
      const nextDays = dayList.includes(day) ? dayList.filter((d) => d !== day) : [...dayList, day];
      return {
        ...current,
        [presetKey]: {
          ...preset,
          workDays: nextDays,
        },
      };
    });
  };

  const setStaffMemberJornada = (roleKey, index, nextJornada) => {
    setStaffByRole((current) => {
      const role = current[roleKey];
      const members = role.members.map((member, i) => {
        if (i !== index) return member;

        if (!nextJornada) {
          return { ...member, jornada: '' };
        }

        if (roleKey !== 'docencia' || (nextJornada !== 'completa' && nextJornada !== 'medio-tiempo')) {
          if (nextJornada === 'semanal') {
            return { ...member, jornada: nextJornada, workDays: [] };
          }
          return { ...member, jornada: nextJornada, weeklyDay: '' };
        }

        const preset = teachingSchedulePresets[nextJornada] || {};
        const hasPresetValues =
          String(preset.startTime || '').trim().length > 0
          && String(preset.endTime || '').trim().length > 0
          && (preset.workDays || []).length > 0;

        if (!hasPresetValues) {
          return { ...member, jornada: nextJornada, weeklyDay: '' };
        }

        return {
          ...member,
          jornada: nextJornada,
          weeklyDay: '',
          startTime: preset.startTime,
          endTime: preset.endTime,
          workDays: [...(preset.workDays || [])],
        };
      });

      return { ...current, [roleKey]: { ...role, members } };
    });
  };

  const toggleStaffMemberField = (roleKey, index, field, value) => {
    setStaffByRole((current) => {
      const role = current[roleKey];
      const members = role.members.map((m, i) => {
        if (i !== index) return m;
        const arr = m[field] || [];
        const nextArr = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

        // In docencia, selected courses must remain compatible with selected subjects.
        if (roleKey === 'docencia' && field === 'subjects') {
          const compatibleCourseKeys = new Set(
            gradeRows
              .filter((row) => {
                const gradeSubjects = subjectMapByGrade[row.key] || [];
                return nextArr.some((subject) => gradeSubjects.includes(subject));
              })
              .map((row) => row.key),
          );

          return {
            ...m,
            [field]: nextArr,
            courses: (m.courses || []).filter((courseKey) => compatibleCourseKeys.has(courseKey)),
          };
        }

        return {
          ...m,
          [field]: nextArr,
        };
      });
      return { ...current, [roleKey]: { ...role, members } };
    });
  };

  const addStaffMember = (roleKey, initialMember = {}) => {
    setStaffByRole((current) => {
      const role = current[roleKey];
      return { ...current, [roleKey]: { ...role, members: [...role.members, { ...makeDefaultMember(), ...initialMember }] } };
    });
  };

  const removeStaffMember = (roleKey, index) => {
    setStaffByRole((current) => {
      const role = current[roleKey];
      if (role.members.length <= 1) return current;
      return { ...current, [roleKey]: { ...role, members: role.members.filter((_, i) => i !== index) } };
    });
  };

  const toggleTeacherSubjectPicker = (roleKey, index) => {
    const pickerKey = `${roleKey}:${index}`;
    setExpandedTeacherSubjectPickers((current) => ({
      ...current,
      [pickerKey]: !current[pickerKey],
    }));
  };

  const addTeacherBlockedSlot = (memberIndex) => {
    setStaffByRole((current) => {
      const role = current.docencia;
      const members = role.members.map((member, index) => {
        if (index !== memberIndex) return member;
        const nextIndex = (member.blockedSlots || []).length + 1;
        return {
          ...member,
          blockedSlots: [...(member.blockedSlots || []), makeDefaultTeacherBlockedSlot(nextIndex)],
        };
      });
      return { ...current, docencia: { ...role, members } };
    });
  };

  const updateTeacherBlockedSlot = (memberIndex, slotId, field, value) => {
    setStaffByRole((current) => {
      const role = current.docencia;
      const members = role.members.map((member, index) => {
        if (index !== memberIndex) return member;
        return {
          ...member,
          blockedSlots: (member.blockedSlots || []).map((slot) =>
            slot.id === slotId ? { ...slot, [field]: value } : slot,
          ),
        };
      });
      return { ...current, docencia: { ...role, members } };
    });
  };

  const toggleTeacherBlockedSlotDay = (memberIndex, slotId, day) => {
    setStaffByRole((current) => {
      const role = current.docencia;
      const members = role.members.map((member, index) => {
        if (index !== memberIndex) return member;
        return {
          ...member,
          blockedSlots: (member.blockedSlots || []).map((slot) => {
            if (slot.id !== slotId) return slot;
            const nextDays = (slot.days || []).includes(day)
              ? (slot.days || []).filter((entry) => entry !== day)
              : [...(slot.days || []), day];
            return { ...slot, days: nextDays };
          }),
        };
      });
      return { ...current, docencia: { ...role, members } };
    });
  };

  const removeTeacherBlockedSlot = (memberIndex, slotId) => {
    setStaffByRole((current) => {
      const role = current.docencia;
      const members = role.members.map((member, index) => {
        if (index !== memberIndex) return member;
        return {
          ...member,
          blockedSlots: (member.blockedSlots || []).filter((slot) => slot.id !== slotId),
        };
      });
      return { ...current, docencia: { ...role, members } };
    });
  };

  const toggleRoleSkip = (roleKey) => {
    setStaffByRole((current) => {
      const role = current[roleKey];
      return { ...current, [roleKey]: { ...role, skip: !role.skip } };
    });
  };

  const toggleGradeKeyInList = (list, gradeKey) =>
    list.includes(gradeKey) ? list.filter((g) => g !== gradeKey) : [...list, gradeKey];

  const toggleGradeGroupInList = (list, gradeKeys) => {
    const uniqueGradeKeys = [...new Set(gradeKeys || [])];
    if (uniqueGradeKeys.length === 0) return list;

    const allSelected = uniqueGradeKeys.every((gradeKey) => list.includes(gradeKey));
    if (allSelected) {
      return list.filter((gradeKey) => !uniqueGradeKeys.includes(gradeKey));
    }

    const merged = [...list];
    uniqueGradeKeys.forEach((gradeKey) => {
      if (!merged.includes(gradeKey)) merged.push(gradeKey);
    });
    return merged;
  };

  const updateScheduleShift = (index, field, value) => {
    setScheduleShifts((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const toggleShiftGrade = (index, gradeKey) => {
    setScheduleShifts((current) =>
      current.map((item, i) => (i === index ? { ...item, gradeKeys: toggleGradeKeyInList(item.gradeKeys || [], gradeKey) } : item)),
    );
  };

  const toggleShiftLevel = (index, levelId) => {
    const levelGradeKeys = gradeKeysByLevel[levelId] || [];
    setScheduleShifts((current) =>
      current.map((item, i) =>
        i === index
          ? { ...item, gradeKeys: toggleGradeGroupInList(item.gradeKeys || [], levelGradeKeys) }
          : item,
      ),
    );
  };

  const updateScheduleBlock = (index, field, value) => {
    setScheduleBlocks((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const toggleBlockGrade = (index, gradeKey) => {
    setScheduleBlocks((current) =>
      current.map((item, i) => {
        if (i !== index || !['clase', 'break', 'guidance_routine', 'control', 'sports'].includes(item.type)) return item;
        return { ...item, gradeKeys: toggleGradeKeyInList(item.gradeKeys || [], gradeKey) };
      }),
    );
  };

  const toggleBlockLevel = (index, levelId) => {
    const levelGradeKeys = gradeKeysByLevel[levelId] || [];
    setScheduleBlocks((current) =>
      current.map((item, i) => {
        if (i !== index || !['clase', 'break', 'guidance_routine', 'control', 'sports'].includes(item.type)) return item;
        return {
          ...item,
          gradeKeys: toggleGradeGroupInList(item.gradeKeys || [], levelGradeKeys),
        };
      }),
    );
  };

  const removeScheduleBlock = (index) => {
    setScheduleBlocks((current) => {
      if (current.length <= 1) return current;
      return current.filter((_, i) => i !== index);
    });
  };

  const updateScheduleBreak = (index, field, value) => {
    setScheduleBreaks((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const removeScheduleBreak = (index) => {
    setScheduleBreaks((current) => {
      if (current.length <= 1) return current;
      return current.filter((_, i) => i !== index);
    });
  };

  const toggleBreakGrade = (index, gradeKey) => {
    setScheduleBreaks((current) =>
      current.map((item, i) => (i === index ? { ...item, gradeKeys: toggleGradeKeyInList(item.gradeKeys || [], gradeKey) } : item)),
    );
  };

  const toggleBreakLevel = (index, levelId) => {
    const levelGradeKeys = gradeKeysByLevel[levelId] || [];
    setScheduleBreaks((current) =>
      current.map((item, i) =>
        i === index
          ? { ...item, gradeKeys: toggleGradeGroupInList(item.gradeKeys || [], levelGradeKeys) }
          : item,
      ),
    );
  };

  const updateScheduleGuidanceRoutine = (index, field, value) => {
    setScheduleGuidanceRoutines((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const toggleGuidanceRoutineGrade = (index, gradeKey) => {
    setScheduleGuidanceRoutines((current) =>
      current.map((item, i) => (i === index ? { ...item, gradeKeys: toggleGradeKeyInList(item.gradeKeys || [], gradeKey) } : item)),
    );
  };

  const toggleGuidanceRoutineLevel = (index, levelId) => {
    const levelGradeKeys = gradeKeysByLevel[levelId] || [];
    setScheduleGuidanceRoutines((current) =>
      current.map((item, i) =>
        i === index
          ? { ...item, gradeKeys: toggleGradeGroupInList(item.gradeKeys || [], levelGradeKeys) }
          : item,
      ),
    );
  };

  const removeScheduleGuidanceRoutine = (index) => {
    setScheduleGuidanceRoutines((current) => {
      if (current.length <= 1) return current;
      return current.filter((_, i) => i !== index);
    });
  };

  const updateScheduleControl = (index, field, value) => {
    setScheduleControl((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const toggleControlGrade = (index, gradeKey) => {
    setScheduleControl((current) =>
      current.map((item, i) => (i === index ? { ...item, gradeKeys: toggleGradeKeyInList(item.gradeKeys || [], gradeKey) } : item)),
    );
  };

  const toggleControlLevel = (index, levelId) => {
    const levelGradeKeys = gradeKeysByLevel[levelId] || [];
    setScheduleControl((current) =>
      current.map((item, i) =>
        i === index
          ? { ...item, gradeKeys: toggleGradeGroupInList(item.gradeKeys || [], levelGradeKeys) }
          : item,
      ),
    );
  };

  const removeScheduleControl = (index) => {
    setScheduleControl((current) => {
      if (current.length <= 1) return current;
      return current.filter((_, i) => i !== index);
    });
  };

  const updateSubjectLoad = (index, field, value) => {
    setSubjectLoads((current) =>
      current.map((item, i) => {
        if (i !== index) return item;

        if (field === 'subject') {
          const allowedGradeKeys = new Set(
            gradeRows
              .filter((row) => (subjectMapByGrade[row.key] || []).includes(value))
              .map((row) => row.key),
          );

          const nextGradeKeys = (item.gradeKeys || []).filter((gradeKey) => allowedGradeKeys.has(gradeKey));
          const nextBlockOptions = classBlockOptions.filter((block) =>
            [...allowedGradeKeys].some((gradeKey) => isClassBlockApplicableToGrade(block, gradeKey)),
          );
          const currentBlockMinutes = getMinutesFromBlockSelectionValue(item.blockName);
          const currentBlockIsValid = nextBlockOptions.some(
            (block) => block.name === item.blockName || block.minutes === currentBlockMinutes,
          );

          return {
            ...item,
            subject: value,
            blockName: currentBlockIsValid ? item.blockName : (nextBlockOptions[0]?.name || ''),
            gradeKeys: nextGradeKeys,
          };
        }

        if (field === 'blockName') {
          const selectedMinutes = getMinutesFromBlockSelectionValue(value);
          const selectedBlock = classBlockOptions.find(
            (block) => block.name === value || block.minutes === selectedMinutes,
          ) || null;
          const nextGradeKeys = selectedBlock
            ? (item.gradeKeys || []).filter((gradeKey) => isClassBlockApplicableToGrade(selectedBlock, gradeKey))
            : (item.gradeKeys || []);

          return { ...item, blockName: selectedBlock?.name || value, gradeKeys: nextGradeKeys };
        }

        if (field === 'weeklyBlocks') {
          const normalizedBlocks = String(value || '').replace(/[^\d]/g, '');
          return { ...item, weeklyBlocks: normalizedBlocks, weeklyHours: '' };
        }

        return { ...item, [field]: value };
      }),
    );
  };

  const addSubjectLoad = () => {
    const subjectPool = loadPreviewFilterGradeKey
      ? availableSubjectsForCurrentLoadFilter
      : availableSubjectsForNewLoad;

    if (subjectPool.length === 0) {
      return;
    }

    const defaultSubject = subjectPool[0];
    const subjectGradeKeys = gradeRows
      .filter((row) => (subjectMapByGrade[row.key] || []).includes(defaultSubject))
      .map((row) => row.key);
    const defaultGradeKeys = loadPreviewFilterGradeKey && subjectGradeKeys.includes(loadPreviewFilterGradeKey)
      ? [loadPreviewFilterGradeKey]
      : subjectGradeKeys;
    const defaultBlockName = classBlockOptions.find((block) =>
      defaultGradeKeys.some((gradeKey) => isClassBlockApplicableToGrade(block, gradeKey)),
    )?.name || classBlockOptions[0]?.name || '';

    setSubjectLoads((current) => [
      ...current,
      {
        ...makeDefaultSubjectLoad(defaultSubject),
        blockName: defaultBlockName,
        gradeKeys: defaultGradeKeys,
      },
    ]);
  };

  const removeSubjectLoad = (index) => {
    setSubjectLoads((current) => {
      if (current.length <= 1) return current;
      return current.filter((_, i) => i !== index);
    });
  };

  const addGlobalPinnedSubjectRule = () => {
    setGlobalPinnedSubjectRules((current) => {
      const defaultSubject = subjects[0] || '';
      return [...current, makeDefaultGlobalPinnedRule(defaultSubject)];
    });
  };

  const updateGlobalPinnedSubjectRule = (ruleId, field, value) => {
    setGlobalPinnedSubjectRules((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, [field]: value } : rule)),
    );
  };

  const toggleGlobalPinnedSubjectRuleDay = (ruleId, day) => {
    setGlobalPinnedSubjectRules((current) =>
      current.map((rule) => {
        if (rule.id !== ruleId) return rule;
        const days = rule.days || [];
        const nextDays = days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day];
        return { ...rule, days: nextDays };
      }),
    );
  };

  const removeGlobalPinnedSubjectRule = (ruleId) => {
    setGlobalPinnedSubjectRules((current) => current.filter((rule) => rule.id !== ruleId));
  };

  const toggleSubjectLoadGrade = (index, gradeKey) => {
    setSubjectLoads((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const selectedBlock = getSelectedClassBlockForLoad(item);
        if (selectedBlock && !isClassBlockApplicableToGrade(selectedBlock, gradeKey)) return item;
        return { ...item, gradeKeys: toggleGradeKeyInList(item.gradeKeys || [], gradeKey) };
      }),
    );
  };

  const toggleSubjectLoadLevel = (index, levelId) => {
    setSubjectLoads((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const levelGradeKeys = gradeRows
          .filter(
            (row) =>
              row.key.startsWith(`${levelId}:`) && (subjectMapByGrade[row.key] || []).includes(item.subject),
          )
          .map((row) => row.key);
        const selectedBlock = getSelectedClassBlockForLoad(item);
        const compatibleGradeKeys = selectedBlock
          ? levelGradeKeys.filter((gradeKey) => isClassBlockApplicableToGrade(selectedBlock, gradeKey))
          : levelGradeKeys;

        return {
          ...item,
          gradeKeys: toggleGradeGroupInList(item.gradeKeys || [], compatibleGradeKeys),
        };
      }),
    );
  };

  const updateFixedSlot = (index, field, value) => {
    setFixedSubjectSlots((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const generateCourseSchedules = () => {
    if (courseGenerationModal) return;
    setCourseGenerationWarning('');

    const targetGradeKeys = connectedScheduleGenerationGradeKeys;
    const targetLevelLabel = connectedScheduleGenerationLevelNames.join(', ') || 'el nivel seleccionado';
    const recalculatingConnectedGroup = hasGeneratedConnectedCourseSchedules;
    const openGenerationModal = () => {
      setCourseGenerationModal({
        title: recalculatingConnectedGroup ? 'Recalculando horarios conectados' : 'Generando horarios conectados',
        message: recalculatingConnectedGroup
          ? `Estamos recalculando ${targetLevelLabel}. Este proceso puede tardar un momento.`
          : `Estamos generando ${targetLevelLabel}. Este proceso puede tardar un momento.`,
        progressLabel: '',
      });
    };

    const closeGenerationModal = () => setCourseGenerationModal(null);
    const runSolverEngine = ({ engine, label, onSuccess, onFailure }) => {
      const advance = () => {
        const status = engine.step(90);

        setCourseGenerationModal((current) => (current ? {
          ...current,
          progressLabel: `${label} · ${status.assignedUnits}/${status.totalUnits} bloques · ${status.nodesVisited.toLocaleString('es-CO')} intentos`,
        } : current));

        if (status.finished) {
          const result = engine.buildResult();
          if (!result.solverDiagnostics?.solved || result.blockingIssues.length > 0) {
            onFailure(result);
            return;
          }

          onSuccess(result);
          return;
        }

        window.setTimeout(advance, 0);
      };

      window.setTimeout(advance, 0);
    };

    if (!scheduleGenerationLevelId || targetGradeKeys.size === 0) {
      openGenerationModal();
      queueAfterNextPaint(() => {
        try {
          setGeneratedCourseSchedules({});
          setSelectedCourseScheduleKey('');
          setScheduleReviewConfirmed(false);
          setGeneratedTeacherSchedules({});
          setSelectedTeacherScheduleKey('');
        } finally {
          closeGenerationModal();
        }
      });
      return;
    }

    if (targetGradeKeys.size === 0) {
      openGenerationModal();
      queueAfterNextPaint(() => {
        try {
          setGeneratedCourseSchedules({});
          setSelectedCourseScheduleKey('');
          setScheduleReviewConfirmed(false);
          setGeneratedTeacherSchedules({});
          setSelectedTeacherScheduleKey('');
        } finally {
          closeGenerationModal();
        }
      });
      return;
    }

    openGenerationModal();
    queueAfterNextPaint(() => {
      if (scheduleGenerationCoverageAnalysis.blockingIssues.length > 0) {
        setCourseGenerationWarning(scheduleGenerationCoverageAnalysis.blockingIssues[0] || 'Ajusta cobertura docente y carga académica antes de generar.');
        setGeneratedCourseSchedules((current) => {
          const filteredEntries = Object.entries(current).filter(([, schedule]) => !targetGradeKeys.has(schedule.gradeKey));
          return Object.fromEntries(filteredEntries);
        });
        setSelectedCourseScheduleKey('');
        setScheduleReviewConfirmed(false);
        setGeneratedTeacherSchedules({});
        setSelectedTeacherScheduleKey('');
        closeGenerationModal();
        return;
      }

      const engine = solveCourseSchedulesWithCsp(targetGradeKeys, Date.now(), generatedCourseSchedules, {
        returnEngine: true,
        maxNodes: SCHEDULE_SOLVER_MAX_NODES,
      });
      runSolverEngine({
        engine,
        label: `Calculando ${targetLevelLabel}`,
        onSuccess: (solvedSchedules) => {
          const byCourse = solvedSchedules.byCourse;
          setCourseGenerationWarning('');
          setGeneratedCourseSchedules((current) => {
            const remainingEntries = Object.entries(current).filter(([, schedule]) => !targetGradeKeys.has(schedule.gradeKey));
            return {
              ...Object.fromEntries(remainingEntries),
              ...byCourse,
            };
          });
          const firstKey = Object.keys(byCourse)[0] || '';
          setSelectedCourseScheduleKey(firstKey);
          setScheduleReviewConfirmed(false);
          setGeneratedTeacherSchedules({});
          setSelectedTeacherScheduleKey('');
          closeGenerationModal();
        },
        onFailure: (result) => {
          setCourseGenerationWarning(result?.blockingIssues?.[0] || 'No se pudo generar el horario con la configuración actual. Ajusta restricciones y vuelve a intentar.');
          setGeneratedCourseSchedules((current) => {
            const remainingEntries = Object.entries(current).filter(([, schedule]) => !targetGradeKeys.has(schedule.gradeKey));
            return Object.fromEntries(remainingEntries);
          });
          setSelectedCourseScheduleKey('');
          setScheduleReviewConfirmed(false);
          setGeneratedTeacherSchedules({});
          setSelectedTeacherScheduleKey('');
          closeGenerationModal();
        },
      });
    });
  };

  const generateTeacherSchedules = () => {
    const byTeacher = {};

    Object.values(generatedCourseSchedules || {}).forEach((schedule) => {
      (schedule.items || [])
        .filter((item) => ['class', 'fixed', 'global'].includes(item.type) && String(item.teacherName || '').trim().length > 0 && item.teacherName !== 'Sin docente')
        .forEach((item) => {
          const teacherKey = item.teacherId || normalizeKey(item.teacherName);
          if (!byTeacher[teacherKey]) {
            byTeacher[teacherKey] = {
              teacherId: item.teacherId || '',
              teacherName: item.teacherName,
              courses: [],
              subjects: [],
              items: [],
            };
          }

          if (!byTeacher[teacherKey].courses.includes(schedule.courseLabel)) {
            byTeacher[teacherKey].courses.push(schedule.courseLabel);
          }
          if (!byTeacher[teacherKey].subjects.includes(item.subject)) {
            byTeacher[teacherKey].subjects.push(item.subject);
          }

          byTeacher[teacherKey].items.push({
            courseKey: schedule.courseKey || '',
            courseLabel: schedule.courseLabel,
            gradeKey: schedule.gradeKey,
            subject: item.subject,
            type: item.type,
            day: item.day,
            startMin: item.startMin,
            endMin: item.endMin,
          });
        });
    });

    Object.values(byTeacher).forEach((teacherSchedule) => {
      teacherSchedule.items.sort((left, right) => {
        const dayDiff = WEEK_DAYS.indexOf(left.day) - WEEK_DAYS.indexOf(right.day);
        if (dayDiff !== 0) return dayDiff;
        return left.startMin - right.startMin;
      });
      teacherSchedule.courses.sort((left, right) => left.localeCompare(right, 'es'));
      teacherSchedule.subjects.sort((left, right) => left.localeCompare(right, 'es'));
    });

    setGeneratedTeacherSchedules(byTeacher);
  };

  const resetWizard = () => {
    LEGACY_WIZARD_STORAGE_KEYS.forEach((legacyKey) => {
      localStorage.removeItem(legacyKey);
    });
    localStorage.removeItem(WIZARD_STORAGE_KEY);
    localStorage.setItem(WIZARD_RESET_SIGNAL_KEY, String(Date.now()));
    setDirection('forward');
    setStep(0);
    setSchoolName('');
    setAvailableLevels([]);
    setSelectedLevelIds([]);
    setCustomLevelInput('');
    setGradesByLevel({});
    setGradeInputByLevel({});
    setCoursesByGrade({});
    setCourseInputByGrade({});
    setSingleCourseGrades({});
    setSubjects([]);
    setSubjectInput('');
    setSubjectMapByGrade({});
    setPeriods([]);
    setFinancialCalendar(DEFAULT_FINANCIAL_CALENDAR);
    setFinancialCostsByGrade({});
    setEconomicBenefits([]);
    setStaffByRole(Object.fromEntries(STAFF_ROLES.map((r) => [r.key, makeDefaultRole()])));
    setTeachingSchedulePresets(EMPTY_TEACHING_SCHEDULE_PRESETS);
    setScheduleShifts([]);
    setScheduleBlocks([]);
    setScheduleClassSlots([]);
    setScheduleBreaks([]);
    setScheduleGuidanceRoutines([]);
    setScheduleControl([]);
    setScheduleSports([]);
    setScheduleOtherBlocks([]);
    setSubjectLoads([]);
    setMaxConsecutiveBySubject({});
    setMaxBlocksPreset({ value: '', apply: false });
    setGlobalPinnedSubjectRules([]);
    setFixedSubjectSlots([]);
    setCalendarShiftName('');
    setCalendarGradeKey('');
    setBlockPlannerLevelId('');
    setDragPlannerType('');
    setDraggingPlannerSlot(null);
    setBlockPlannerWarning('');
    setResizingPlannerSlot(null);
    setPlannerSelectedGradeKeys([]);
    setPlannerOtherBlockNames([]);
    setPlannerOtherBlockName('');
    setOtherBlockModalOpen(false);
    setOtherBlockNameDraft('');
    setDragSubject('');
    setCalendarWarning('');
    setResizingSlot(null);
    setGeneratedCourseSchedules({});
    setSelectedCourseScheduleKey('');
    setScheduleReviewConfirmed(false);
    setGeneratedTeacherSchedules({});
    setTransitionProgress(0);
  };

  const loadDemoAndJumpToCalendar = () => {
    // ── Estructura ─────────────────────────────────────────────────────────────
    const berckleyLevelIds = ['preescolar', 'primaria', 'secundaria'];

    const berckleyGradesByLevel = {
      preescolar: ['Maternal', 'Toodlers', 'K-grade', 'Infant'],
      primaria: ['1', '2', '3', '4', '5'],
      secundaria: ['6', '7', '8', '9', '10', '11'],
    };

    const preescolarGradeKeys = berckleyGradesByLevel.primaria.map
      ? berckleyGradesByLevel.preescolar.map((g) => `preescolar:${g}`)
      : [];
    const primariaGradeKeys = berckleyGradesByLevel.primaria.map((g) => `primaria:${g}`);
    const secundariaGradeKeys = berckleyGradesByLevel.secundaria.map((g) => `secundaria:${g}`);
    const allGradeKeys = [...preescolarGradeKeys, ...primariaGradeKeys, ...secundariaGradeKeys];

    // Preescolar → 1 curso (singleCourse), Primaria y Secundaria → A y B
    const berckleyCoursesByGrade = Object.fromEntries([
      ...primariaGradeKeys.map((k) => [k, ['A', 'B']]),
      ...secundariaGradeKeys.map((k) => [k, ['A', 'B']]),
    ]);
    const berckleySingleCourseGrades = Object.fromEntries(
      preescolarGradeKeys.map((k) => [k, true]),
    );

    // ── Asignaturas ─────────────────────────────────────────────────────────────
    const berckleySubjects = [
      'Matematicas', 'Arte', 'Deporte', 'Educacion Fisica', 'Biologia',
      'Quimica', 'Fisica', 'Etica', 'Musica', 'Lengua Castellana',
      'Ingles', 'Ciencias', 'Sociales', 'Emprendimiento', 'Computacion',
      'Manualidades', 'Religion', 'Filosofia', 'Geometria',
    ];

    const subjectsPreescolar = ['Arte', 'Musica', 'Lengua Castellana', 'Manualidades'];
    const subjectsPrimaria = [
      'Matematicas', 'Arte', 'Etica', 'Musica', 'Ingles', 'Ciencias',
      'Deporte', 'Educacion Fisica', 'Lengua Castellana', 'Sociales', 'Religion', 'Geometria',
    ];
    const subjectsSecundaria = [
      'Matematicas', 'Arte', 'Biologia', 'Etica', 'Musica', 'Ingles', 'Fisica',
      'Ciencias', 'Emprendimiento', 'Quimica', 'Deporte', 'Educacion Fisica',
      'Lengua Castellana', 'Sociales', 'Computacion', 'Religion', 'Filosofia',
    ];

    const berckleySubjectMapByGrade = {
      ...Object.fromEntries(preescolarGradeKeys.map((k) => [k, subjectsPreescolar])),
      ...Object.fromEntries(primariaGradeKeys.map((k) => [k, subjectsPrimaria])),
      ...Object.fromEntries(secundariaGradeKeys.map((k) => [k, subjectsSecundaria])),
    };

    // ── Periodos ────────────────────────────────────────────────────────────────
    const berckleyPeriods = [
      { name: 'Periodo 1', startDate: '2026-08-14', endDate: '2026-09-20', weight: '30' },
      { name: 'Periodo 2', startDate: '2026-09-21', endDate: '2026-12-14', weight: '40' },
      { name: 'Periodo 3', startDate: '2027-01-14', endDate: '2027-05-14', weight: '30' },
    ];

    // ── Personal ────────────────────────────────────────────────────────────────
    const berckleyStaffByRole = {
      rectoria: {
        skip: false,
        members: [{
          name: 'Juan Carlos Ríos Mendez',
          email: 'jcrios@berckley.edu.co',
          password: 'Berckley2026*',
          phone: '3001234567',
          levels: [], jornada: '', workDays: [], weeklyDay: '', startTime: '', endTime: '', subjects: [], courses: [],
        }],
      },
      direccion: {
        skip: false,
        members: [{
          name: 'María Elena Suárez Pinto',
          email: 'mesuarez@berckley.edu.co',
          password: 'Berckley2026*',
          phone: '3009876543',
          levels: [], jornada: '', workDays: [], weeklyDay: '', startTime: '', endTime: '', subjects: [], courses: [],
        }],
      },
      coordinacion: {
        skip: false,
        members: [
          {
            name: 'Ana Lucía Torres Gómez',
            email: 'altorres@berckley.edu.co',
            password: 'Berckley2026*',
            phone: '3151112233',
            levels: ['preescolar'], jornada: '', workDays: [], weeklyDay: '', startTime: '', endTime: '', subjects: [], courses: [],
          },
          {
            name: 'Roberto Gómez Vargas',
            email: 'rgomez@berckley.edu.co',
            password: 'Berckley2026*',
            phone: '3152223344',
            levels: ['primaria'], jornada: '', workDays: [], weeklyDay: '', startTime: '', endTime: '', subjects: [], courses: [],
          },
          {
            name: 'Sandra Patricia Ruiz Herrera',
            email: 'spruiz@berckley.edu.co',
            password: 'Berckley2026*',
            phone: '3153334455',
            levels: ['secundaria'], jornada: '', workDays: [], weeklyDay: '', startTime: '', endTime: '', subjects: [], courses: [],
          },
        ],
      },
      docencia: { skip: false, members: [makeDefaultMember()] },
      psicologia: { skip: true, members: [makeDefaultMember()] },
      enfermeria: { skip: true, members: [makeDefaultMember()] },
      secretaria: { skip: true, members: [makeDefaultMember()] },
      cartera: { skip: true, members: [makeDefaultMember()] },
      recursosHumanos: { skip: true, members: [makeDefaultMember()] },
      rutas: { skip: true, members: [makeDefaultMember()] },
    };

    // ── Horario (placeholder para continuar luego) ───────────────────────────────
    const berckleyShifts = [
      {
        name: 'Jornada Mañana',
        gradeKeys: allGradeKeys,
        days: ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'],
        startTime: '07:00',
        endTime: '13:30',
      },
    ];

    // ── Aplicar estado ──────────────────────────────────────────────────────────
    setDirection('forward');
    setSchoolName('Berckley');
    setAvailableLevels(DEFAULT_LEVELS);
    setSelectedLevelIds(berckleyLevelIds);
    setCustomLevelInput('');
    setGradesByLevel(berckleyGradesByLevel);
    setGradeInputByLevel({});
    setCoursesByGrade(berckleyCoursesByGrade);
    setCourseInputByGrade({});
    setSingleCourseGrades(berckleySingleCourseGrades);
    setSubjects(berckleySubjects);
    setSubjectInput('');
    setSubjectMapByGrade(berckleySubjectMapByGrade);
    setPeriods(berckleyPeriods);
    setFinancialCalendar(DEFAULT_FINANCIAL_CALENDAR);
    setFinancialCostsByGrade({});
    setEconomicBenefits([]);
    setStaffByRole(berckleyStaffByRole);
    setScheduleShifts(berckleyShifts);
    setScheduleBlocks([makeDefaultScheduleBlock(1)]);
    setScheduleClassSlots([]);
    setScheduleBreaks([makeDefaultBreak(1)]);
    setScheduleGuidanceRoutines([makeDefaultGuidanceRoutine(1)]);
    setScheduleControl([makeDefaultControl(1)]);
    setScheduleSports([]);
    setScheduleOtherBlocks([]);
    setSubjectLoads([makeDefaultSubjectLoad(berckleySubjects[0])]);
    setMaxConsecutiveBySubject({});
    setFixedSubjectSlots([]);
    setCalendarGradeKey('');
    setCalendarShiftName('');
    setBlockPlannerLevelId('');
    setDragPlannerType('');
    setDraggingPlannerSlot(null);
    setBlockPlannerWarning('');
    setResizingPlannerSlot(null);
    setPlannerSelectedGradeKeys([]);
    setPlannerOtherBlockNames([]);
    setPlannerOtherBlockName('');
    setOtherBlockModalOpen(false);
    setOtherBlockNameDraft('');
    setDragSubject('');
    setCalendarWarning('');
    setResizingSlot(null);
    setGeneratedCourseSchedules({});
    setSelectedCourseScheduleKey('');
    setScheduleReviewConfirmed(false);
    setGeneratedTeacherSchedules({});
    setTransitionProgress(0);
    setStep(11); // Docencia
  };

  return (
    <div className="school-creation-shell">
      <header className="school-creation-topbar">
        <button className="school-creation-link-button" onClick={() => navigate(LOGIN_PATH)} type="button">
          Volver al login
        </button>
        <span className="school-creation-topbar-label">Comergio · Configuracion academica</span>
      </header>

      <main className={`school-creation-main ${step >= 18 && step <= 20 ? 'school-creation-main--wide' : ''}`}>
        <div className="school-creation-brand-row">
          <img className="school-creation-brand-logo" src={logoOwl} alt="Comergio" />
          <h1>Crea tu colegio en minutos</h1>
          <p>Configura la estructura academica completa con un flujo guiado y listo para usar en el portal.</p>
        </div>

        <div className="school-creation-progress-shell">
          <div className="school-creation-progress-track">
            <div className="school-creation-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <small>
            {progressSegment.label} · Paso {progressSegment.current} de {progressSegment.total}
          </small>
        </div>

        <article key={step} className={`school-creation-step-content is-${direction}`}>
            <p className="school-creation-step-chip">{stepLabels[step]}</p>

            {step === 0 ? (
              <div className="school-creation-step-grid">
                <h2>Como se llama la institucion educativa?</h2>
                <p>Este nombre se mostrara en reportes, facturas y en todo el ecosistema Comergio.</p>
                <label>
                  Nombre de la institucion
                  <input
                    placeholder="Ej: Colegio Campestre San Miguel"
                    value={schoolName}
                    onChange={(event) => setSchoolName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      if (canContinue) goNext();
                    }}
                  />
                </label>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="school-creation-step-grid">
                <h2>Selecciona los niveles educativos que manejas</h2>
                <p>Puedes elegir varios y agregar niveles personalizados si lo necesitas.</p>

                <div className="school-creation-chip-grid">
                  {availableLevels.map((level) => (
                    <button
                      key={level.id}
                      className={`school-creation-chip ${selectedLevelIds.includes(level.id) ? 'is-active' : ''}`}
                      onClick={() => toggleLevel(level.id)}
                      type="button"
                    >
                      {level.name}
                    </button>
                  ))}
                </div>

                <form
                  className="school-creation-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addCustomLevel();
                  }}
                >
                  <input
                    placeholder="Agregar otro nivel (ej: Tecnico)"
                    value={customLevelInput}
                    onChange={(event) => setCustomLevelInput(event.target.value)}
                  />
                  <button type="submit">
                    Agregar
                  </button>
                </form>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="school-creation-step-grid">
                <h2>Asigna grados a cada nivel</h2>
                <p>Define como quedaran organizados los grados por nivel educativo.</p>

                {selectedLevels.map((level) => {
                  const grades = gradesByLevel[level.id] || DEFAULT_GRADES_BY_LEVEL[level.id] || [];
                  const gradeInput = gradeInputByLevel[level.id] || '';

                  return (
                    <div key={level.id} className="school-creation-level-box">
                      <h3>{level.name}</h3>

                      <div className="school-creation-chip-grid compact">
                        {grades.map((grade) => (
                          <span key={`${level.id}:${grade}`} className="school-creation-pill removable">
                            {grade}
                            <button onClick={() => removeGrade(level.id, grade)} type="button" aria-label="Eliminar grado">
                              x
                            </button>
                          </span>
                        ))}
                      </div>

                      <form
                        className="school-creation-inline-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          addGradeToLevel(level.id);
                        }}
                      >
                        <input
                          placeholder="Ej: 6B"
                          value={gradeInput}
                          onChange={(event) =>
                            setGradeInputByLevel((current) => ({
                              ...current,
                              [level.id]: event.target.value,
                            }))
                          }
                        />
                        <button type="submit">
                          Anadir grado
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="school-creation-step-grid">
                <h2>Agrega los cursos de cada grado</h2>
                <p>Por ejemplo, el grado 6 puede tener los cursos 6A, 6B, 6C.</p>

                {gradeRows.map((row) => {
                  const courses = coursesByGrade[row.key] || [];
                  const courseInput = courseInputByGrade[row.key] || '';
                  const isSingle = !!singleCourseGrades[row.key];

                  return (
                    <div key={row.key} className="school-creation-level-box">
                      <div className="school-creation-grade-header-row">
                        <h3 style={{ margin: 0 }}>
                          {row.grade}{' '}
                          <span style={{ fontWeight: 400, fontSize: '0.82rem', color: 'var(--school-text-soft)' }}>
                            {row.levelName}
                          </span>
                        </h3>
                        <label className="school-creation-single-course-label">
                          <input
                            type="checkbox"
                            checked={isSingle}
                            onChange={() => toggleSingleCourse(row.key)}
                          />
                          Solo tiene un curso
                        </label>
                      </div>

                      {!isSingle && (
                        <div className="school-creation-chip-grid compact">
                          {courses.map((course) => (
                            <span key={`${row.key}:${course}`} className="school-creation-pill removable">
                              {course}
                              <button
                                onClick={() => removeCourseFromGrade(row.key, course)}
                                type="button"
                                aria-label="Eliminar curso"
                              >
                                x
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {!isSingle && (
                        <form
                          className="school-creation-inline-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            addCourseToGrade(row.key);
                          }}
                        >
                          <input
                            placeholder="Ej: 6A"
                            value={courseInput}
                            onChange={(event) =>
                              setCourseInputByGrade((current) => ({
                                ...current,
                                [row.key]: event.target.value,
                              }))
                            }
                          />
                          <button type="submit">
                            Anadir curso
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {step === 4 ? (
              <div className="school-creation-step-grid">
                <h2>Agrega las asignaturas que dicta la institucion</h2>
                <p>Luego las podras mapear por cada grado para dejar todo listo.</p>

                <div className="school-creation-chip-grid">
                  {subjects.map((subject) => (
                    <span key={subject} className="school-creation-pill removable">
                      {subject}
                      <button onClick={() => removeSubject(subject)} type="button" aria-label="Eliminar asignatura">
                        x
                      </button>
                    </span>
                  ))}
                </div>

                <form
                  className="school-creation-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addSubject();
                  }}
                >
                  <input
                    placeholder="Ej: Tecnologia"
                    value={subjectInput}
                    onChange={(event) => setSubjectInput(event.target.value)}
                  />
                  <button type="submit">
                    Anadir asignatura
                  </button>
                </form>
              </div>
            ) : null}

            {step === 5 ? (
              <div className="school-creation-step-grid">
                <h2>Mapea asignaturas por grado</h2>
                <p>Selecciona para cada curso las materias que debe cursar durante el ano academico.</p>

                <div className="school-creation-mapping-grid">
                  {gradeRows.map((row) => (
                    <div key={row.key} className="school-creation-grade-card">
                      <div className="school-creation-grade-header">
                        <strong>{row.grade}</strong>
                        <span>{row.levelName}</span>
                      </div>

                      <div className="school-creation-chip-grid compact">
                        {subjects.map((subject) => {
                          const selectedSubjects = subjectMapByGrade[row.key] || [];
                          const active = selectedSubjects.includes(subject);

                          return (
                            <button
                              key={`${row.key}:${subject}`}
                              className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                              onClick={() => toggleSubjectForGrade(row.key, subject)}
                              type="button"
                            >
                              {subject}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {false && step === 6 ? (
              <div className="school-creation-step-grid">
                <h2>Carga académica base semanal</h2>
                <p>
                  Asigna bloques semanales por asignatura y grado. Cada carga debe usar uno de los bloques de clase
                  que definiste arriba para que los minutos y tarjetas cierren correctamente.
                </p>

                {!hasConfiguredDocenciaTeam ? (
                  <div className="school-creation-level-box">
                    <h3>Configura Docencia antes de cerrar la carga</h3>
                    <p style={{ margin: '0.2rem 0 0.6rem', color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                      La carga académica puede definirse aquí, pero la validación real de cobertura depende del equipo docente configurado. Si aún no has creado docentes con materias y grados asignados, entra primero a Docencia.
                    </p>
                    <button
                      type="button"
                      className="school-creation-secondary-button"
                      onClick={() => goToWizardStep(11)}
                    >
                      Ir a Docencia
                    </button>
                  </div>
                ) : null}

                {loadPreviewFilterGradeKey ? (
                  <div className="school-creation-inline-actions" style={{ marginTop: '-0.25rem' }}>
                    <span style={{ color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                      Filtrando asignaturas para {gradeRowByKey[loadPreviewFilterGradeKey]?.grade} {gradeRowByKey[loadPreviewFilterGradeKey]?.levelName}.
                    </span>
                    <button
                      className="school-creation-link-button"
                      type="button"
                      onClick={() => setLoadPreviewFilterGradeKey('')}
                    >
                      Limpiar filtro
                    </button>
                  </div>
                ) : null}

                {subjectLoadsForDisplay.map(({ load, index }) => {
                  const subjectOptions = subjects.filter(
                    (subject) => !fullyCoveredSubjects.has(subject) || subject === load.subject,
                  );
                  const blockOptions = getApplicableClassBlocksForLoad(load);
                  const selectedBlock = getSelectedClassBlockForLoad(load);
                  const applicableRows = gradeRows.filter((row) =>
                    (subjectMapByGrade[row.key] || []).includes(load.subject),
                  );
                  const compatibleRows = selectedBlock
                    ? applicableRows.filter((row) => isClassBlockApplicableToGrade(selectedBlock, row.key))
                    : applicableRows;

                  return (
                    <div key={`setup-load-${load.subject}-${index}`} className="school-creation-period-card">
                      {subjectLoads.length > 1 ? (
                        <button
                          className="school-creation-delete-inline"
                          type="button"
                          onClick={() => removeSubjectLoad(index)}
                          aria-label="Eliminar carga"
                        >
                          x
                        </button>
                      ) : null}

                      <div className="school-creation-period-dates">
                        <label>
                          Asignatura
                          <select
                            value={load.subject}
                            onChange={(e) => updateSubjectLoad(index, 'subject', e.target.value)}
                          >
                            {subjectOptions.map((subject) => (
                              <option key={subject} value={subject}>
                                {subject}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Tipo de bloque
                          <select
                            value={selectedBlock?.name || ''}
                            onChange={(e) => updateSubjectLoad(index, 'blockName', e.target.value)}
                          >
                            {blockOptions.map((block) => (
                              <option key={`${block.name}-${block.minutes}`} value={block.name}>
                                {block.label || `Bloque de ${block.minutes} min`}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Bloques por semana (por curso)
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={load.weeklyBlocks}
                            onChange={(e) => updateSubjectLoad(index, 'weeklyBlocks', e.target.value)}
                          />
                        </label>
                      </div>

                      <p style={{ margin: '0.1rem 0 0.55rem', color: 'var(--school-text-soft)', fontSize: '0.8rem' }}>
                        Equivale a {getLoadWeeklySummaryLabel(load)}
                      </p>

                      <div className="school-creation-chip-grid compact" style={{ marginBottom: '0.35rem' }}>
                        {selectedLevels.map((level) => {
                          const levelGradeKeys = compatibleRows
                            .filter((row) => row.key.startsWith(`${level.id}:`))
                            .map((row) => row.key);
                          if (levelGradeKeys.length === 0) return null;
                          const allSelected = levelGradeKeys.every((gradeKey) => (load.gradeKeys || []).includes(gradeKey));
                          return (
                            <button
                              key={`setup-load-level-${index}-${level.id}`}
                              type="button"
                              className={`school-creation-chip tiny ${allSelected ? 'is-active' : ''}`}
                              onClick={() => toggleSubjectLoadLevel(index, level.id)}
                            >
                              {level.name}
                            </button>
                          );
                        })}
                      </div>

                      <div className="school-creation-chip-grid compact">
                        {compatibleRows.map((row) => {
                          const active = (load.gradeKeys || []).includes(row.key);
                          return (
                            <button
                              key={`setup-load-grade-${row.key}`}
                              type="button"
                              className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                              onClick={() => toggleSubjectLoadGrade(index, row.key)}
                            >
                              {row.grade} {row.levelName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {subjectLoadsForDisplay.length === 0 ? (
                  <p style={{ margin: '0.15rem 0 0', color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                    No hay asignaturas configuradas para este grado en la carga base.
                  </p>
                ) : null}

                <button
                  className="school-creation-secondary-button"
                  type="button"
                  onClick={addSubjectLoad}
                  disabled={availableSubjectsForCurrentLoadFilter.length === 0}
                >
                  + Agregar otra carga
                </button>

                <div className="school-creation-level-box">
                  <h3>Demanda semanal estimada por asignatura</h3>
                  <p style={{ margin: 0, color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                    Esta cifra ya considera bloques por curso multiplicados por el número de cursos por grado.
                  </p>
                  <ul className="school-creation-coverage-list" style={{ marginTop: '0.4rem' }}>
                    {Object.entries(weeklyDemandBlocksBySubjectFiltered)
                      .sort(([a], [b]) => a.localeCompare(b, 'es'))
                      .map(([subject, blocks]) => (
                        <li key={`demand-${subject}`}>
                          <strong>{subject}</strong>: {blocks} bloque(s) semanales requeridos
                        </li>
                      ))}
                  </ul>
                </div>

                <div className="school-creation-level-box">
                  <h3>Preview semanal por curso del grado</h3>
                  <p style={{ margin: '0.2rem 0 0.7rem', color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                    Los bloques definidos para un grado se replican en cada curso de ese grado. Si décimo tiene 34 bloques, 10A, 10B y los demás cursos de décimo reciben esos mismos 34 bloques; la carga académica configurada para décimo también se replica por curso.
                  </p>
                  <div className="school-creation-preview-grid">
                    {weeklyLoadByGradePreview.map((row) => {
                      const hasExtraAssignedBlocks = row.remainingBlockGroups.some((group) => group.count < 0);
                      const isBalanced = row.remainingMinutes === 0 && !row.hasBlockMixDifference;
                      const statusClass =
                        isBalanced
                          ? 'is-ok'
                          : row.remainingMinutes < 0 || hasExtraAssignedBlocks
                          ? 'is-over'
                          : 'is-under';

                      const statusLabel =
                        isBalanced
                          ? 'Cuadrado'
                          : row.remainingMinutes < 0 || hasExtraAssignedBlocks
                          ? 'Excedido'
                          : 'Incompleto';

                      return (
                        <button
                          key={`weekly-preview-${row.key}`}
                          type="button"
                          className={`school-creation-preview-card ${statusClass} ${loadPreviewFilterGradeKey === row.key ? 'is-filter-active' : ''}`}
                          onClick={() =>
                            setLoadPreviewFilterGradeKey((current) => (current === row.key ? '' : row.key))
                          }
                        >
                          <div className="school-creation-preview-card-header">
                            <strong>
                              {row.grade} <span>{row.levelName}</span>
                            </strong>
                            <span className={`school-creation-preview-status ${statusClass}`}>{statusLabel}</span>
                          </div>

                          <div className="school-creation-preview-metric">
                            <span>Disponibles</span>
                            <b>{blocksToLabel(row.availableBlocks)}</b>
                          </div>
                          <div className="school-creation-preview-metric" style={{ alignItems: 'flex-start' }}>
                            <span>Clase general</span>
                            <b style={{ textAlign: 'right' }}>{formatClassBlockMix(row.explicitClassBlockGroups)}</b>
                          </div>
                          <div className="school-creation-preview-metric">
                            <span>Asignadas</span>
                            <b style={{ textAlign: 'right' }}>{formatClassBlockMix(row.assignedBlockGroups, 'Sin bloques asignados')}</b>
                          </div>
                          <div className="school-creation-preview-metric" style={{ alignItems: 'flex-start' }}>
                            <span>Restantes</span>
                            <b style={{ textAlign: 'right' }}>{formatRemainingClassBlockMix(row.remainingBlockGroups)}</b>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="school-creation-level-box">
                  <h3>Prevalidador por slots programables</h3>
                  <p style={{ margin: 0, color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                    Antes de generar, el sistema convierte la semana en slots programables reales y compara carga exacta por curso y capacidad útil docente.
                  </p>
                  {schedulePrevalidationAnalysis.blockingIssues.length > 0 ? (
                    <ul className="school-creation-coverage-list" style={{ marginTop: '0.4rem' }}>
                      {schedulePrevalidationAnalysis.blockingIssues.map((issue, index) => (
                        <li key={`slot-prevalidation-${index}`}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: '0.45rem 0 0', color: '#9be7be', fontSize: '0.82rem' }}>
                      La carga por curso y la capacidad docente útil cuadran con los slots programables actuales.
                    </p>
                  )}
                  {gradeRows.some((row) => (schedulePrevalidationAnalysis.durationAuditByGrade?.[row.key] || []).some(
                    (entry) => entry.rawExplicitSlots > 0 || entry.realUsableDiscreteSlots > 0 || entry.requiredSlots > 0,
                  )) ? (
                    <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.75rem' }}>
                      {gradeRows.map((row) => {
                        const durationAudit = (schedulePrevalidationAnalysis.durationAuditByGrade?.[row.key] || []).filter(
                          (entry) => entry.rawExplicitSlots > 0 || entry.realUsableDiscreteSlots > 0 || entry.requiredSlots > 0,
                        );
                        if (durationAudit.length === 0) return null;

                        return (
                          <div key={`duration-audit-${row.key}`} className="school-creation-level-box" style={{ marginTop: 0 }}>
                            <h4 style={{ margin: 0 }}>{row.grade} {row.levelName}</h4>
                            <p style={{ margin: '0.25rem 0 0', color: 'var(--school-text-soft)', fontSize: '0.78rem' }}>
                              Modo estricto: una ventana explícita solo cuenta en su duración real; no se subdivide para otra duración.
                            </p>
                            <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.55rem' }}>
                              {durationAudit.map((entry) => (
                                <div key={`duration-audit-${row.key}-${entry.minutes}`} className="school-creation-preview-metric" style={{ alignItems: 'flex-start' }}>
                                  <span>{entry.minutes} min</span>
                                  <b style={{ textAlign: 'right' }}>
                                    crudos {entry.rawExplicitSlots} | derivados {entry.derivedCompatibleSlots} | utilizables {entry.realUsableDiscreteSlots} | capacidad final {entry.finalCountedCapacity} | demanda {entry.requiredSlots}
                                  </b>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="school-creation-level-box">
                  <h3>Recomendaciones de cobertura docente</h3>
                  <p style={{ margin: 0, color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                    Antes de generar horarios, valida que el equipo docente cubra toda la carga semanal.
                  </p>
                  {teacherBlockingIssues.length > 0 ? (
                    <ul className="school-creation-coverage-list" style={{ marginTop: '0.4rem' }}>
                      {teacherBlockingIssues.map((issue, index) => (
                        <li key={`coverage-issue-${index}`}>{issue}</li>
                      ))}
                    </ul>
                  ) : canPreviewScheduleConflictsInDocencia && preGenerationScheduleAnalysis.blockingIssues.length > 0 ? (
                    <p className="school-creation-warning-inline" style={{ margin: '0.45rem 0 0' }}>
                      La cobertura base alcanza, pero la simulación aún detecta conflictos reales de horario, disponibilidad o espacio.
                    </p>
                  ) : (
                    <p style={{ margin: 0, color: '#9be7be', fontSize: '0.82rem' }}>
                      Cobertura docente suficiente para la carga configurada.
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {step === 6 ? (
              <div className="school-creation-step-grid">
                <h2>Configura los periodos academicos</h2>
                <p>Puedes ajustar nombres y fechas de inicio/cierre para cada periodo.</p>

                <div className="school-creation-period-list">
                  {periods.map((period, index) => (
                    <div key={`period-${index + 1}`} className="school-creation-period-card">
                      <label>
                        Nombre del periodo
                        <input
                          placeholder={`Periodo ${index + 1}`}
                          value={period.name}
                          onChange={(event) => updatePeriod(index, 'name', event.target.value)}
                        />
                      </label>

                      <div className="school-creation-period-dates">
                        <label>
                          Inicio
                          <input
                            type="date"
                            value={period.startDate}
                            onChange={(event) => updatePeriod(index, 'startDate', event.target.value)}
                          />
                        </label>
                        <label>
                          Cierre
                          <input
                            type="date"
                            value={period.endDate}
                            onChange={(event) => updatePeriod(index, 'endDate', event.target.value)}
                          />
                        </label>
                      </div>

                      <label>
                        % de peso en la nota final
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="Ej: 25"
                          value={period.weight}
                          onChange={(event) => updatePeriod(index, 'weight', event.target.value)}
                        />
                      </label>

                      {periods.length > 1 ? (
                        <button
                          className="school-creation-delete-inline"
                          onClick={() => removePeriod(index)}
                          type="button"
                          aria-label="Eliminar periodo"
                        >
                          x
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                <button className="school-creation-secondary-button" onClick={addPeriod} type="button">
                  Agregar otro periodo
                </button>
              </div>
            ) : null}

            {step >= 7 && step <= 16 ? (() => {
              const roleConfig = STAFF_ROLES[step - 7];
              const roleData = staffByRole[roleConfig.key];
              const knownCoverageSubjects = Object.keys(weeklyDemandBySubject);
              const docenciaMemberEntries = roleData.members.map((member, index) => ({ member, index }));
              const visibleMemberEntries = docenciaMemberEntries;

              const descriptions = {
                coordinacion: 'Asigna los coordinadores a los niveles educativos de la institución.',
                docencia: 'Define asignaturas y grados de cada docente.',
                psicologia: 'Asigna al psicólogo/a al nivel educativo donde trabajará.',
                enfermeria: 'Asigna al enfermero/a al nivel educativo donde trabajará.',
              };

              return (
                <div className="school-creation-step-grid">
                  <h2>Crea el equipo de {roleConfig.label}</h2>
                  <p>{descriptions[roleConfig.key] || `Agrega los integrantes del equipo de ${roleConfig.label}.`}</p>

                  <label className="school-creation-single-course-label">
                    <input
                      type="checkbox"
                      checked={roleData.skip}
                      onChange={() => toggleRoleSkip(roleConfig.key)}
                    />
                    Este colegio no tiene {roleConfig.label}
                  </label>

                  {!roleData.skip && (
                    <>
                      {false && roleConfig.key === 'docencia' && (
                        <div className="school-creation-level-box">
                          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Valores predeterminados de jornada</h3>
                          <p style={{ margin: '0.35rem 0 0.8rem', color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                            Define aquí los valores base para Tiempo completo y Medio tiempo. Al seleccionar esa modalidad en cada docente, se completarán automáticamente.
                          </p>

                          {[
                            { key: 'completa', label: 'Tiempo completo' },
                            { key: 'medio-tiempo', label: 'Medio tiempo' },
                          ].map((preset) => (
                            <div key={preset.key} style={{ marginTop: '0.75rem' }}>
                              <strong style={{ fontSize: '0.84rem' }}>{preset.label}</strong>
                              <div className="school-creation-chip-grid compact" style={{ marginTop: '0.45rem' }}>
                                {WEEK_DAYS.map((day) => {
                                  const active = (teachingSchedulePresets[preset.key]?.workDays || []).includes(day);
                                  return (
                                    <button
                                      key={`${preset.key}-${day}`}
                                      className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                      onClick={() => toggleTeachingSchedulePresetDay(preset.key, day)}
                                      type="button"
                                    >
                                      {day}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="school-creation-period-dates" style={{ marginTop: '0.5rem' }}>
                                <label>
                                  Hora inicio
                                  <input
                                    type="time"
                                    value={teachingSchedulePresets[preset.key]?.startTime || ''}
                                    onChange={(e) => updateTeachingSchedulePreset(preset.key, 'startTime', e.target.value)}
                                  />
                                </label>
                                <label>
                                  Hora fin
                                  <input
                                    type="time"
                                    value={teachingSchedulePresets[preset.key]?.endTime || ''}
                                    onChange={(e) => updateTeachingSchedulePreset(preset.key, 'endTime', e.target.value)}
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {false && roleConfig.key === 'docencia' && Object.keys(weeklyDemandBySubject).length > 0 ? (
                        <div className="school-creation-level-box">
                          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Demanda vs cobertura docente por asignatura</h3>
                          <p style={{ margin: '0.35rem 0 0.6rem', color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                            Este chequeo valida cobertura y capacidad base del personal docente. La validación final de generación sin conflictos se hace con la grilla semanal.
                          </p>

                          {teacherBlockingIssues.length > 0 ? (
                            <>
                              <p className="school-creation-warning-inline" style={{ marginBottom: '0.45rem' }}>
                                Cobertura insuficiente detectada. No podrás continuar hasta que todas las asignaturas estén viables.
                              </p>
                              <ul className="school-creation-coverage-list" style={{ marginBottom: '0.5rem' }}>
                                {teacherBlockingIssues.slice(0, 6).map((issue, index) => {
                                  const issueSubject = extractSubjectFromCoverageIssue(issue, knownCoverageSubjects);
                                  const isFilterable = Boolean(issueSubject);
                                  const isActive = isFilterable && docenciaCoverageFilterSubject === issueSubject;

                                  return (
                                    <li key={`docencia-blocking-${index}`}>
                                      {isFilterable ? (
                                        <button
                                          type="button"
                                          className={`school-creation-coverage-item-button ${isActive ? 'is-active' : ''}`}
                                          onClick={() => setDocenciaCoverageFilterSubject((current) => (current === issueSubject ? '' : issueSubject))}
                                        >
                                          {issue}
                                        </button>
                                      ) : issue}
                                    </li>
                                  );
                                })}
                              </ul>
                            </>
                          ) : null}

                          {docenciaCoverageFilterSubject ? (
                            <button
                              type="button"
                              className="school-creation-chip tiny"
                              style={{ width: 'fit-content' }}
                              onClick={() => setDocenciaCoverageFilterSubject('')}
                            >
                              Limpiar filtro: {docenciaCoverageFilterSubject}
                            </button>
                          ) : null}

                          <ul className="school-creation-coverage-list">
                            {Object.entries(weeklyDemandBySubject)
                              .sort(([a], [b]) => a.localeCompare(b, 'es'))
                              .map(([subject, demandMinutes]) => {
                                const supplyMinutes = weeklyDocenciaSupplyBySubject[subject] || 0;
                                const missingMinutes = Math.max(0, demandMinutes - supplyMinutes);
                                const uncoveredCourseCount = teacherCoverageAnalysis.uncoveredCourseCountBySubject?.[subject] || 0;
                                const slotCapacityGapBlocks = teacherCoverageAnalysis.slotCapacityGapBlocksBySubject?.[subject] || 0;
                                const projectedConflictCount = preGenerationConflictCountBySubject[subject] || 0;
                                const hasCoverageGap = uncoveredCourseCount > 0;
                                const hasDemandGap = missingMinutes > 0;
                                const hasParallelGap = slotCapacityGapBlocks > 0;
                                const hasProjectedConflict = projectedConflictCount > 0;
                                const hasCoverageIssue = hasCoverageGap || hasDemandGap || hasParallelGap;
                                const statusText = hasCoverageIssue ? 'Cobertura insuficiente' : 'Cobertura OK';
                                const statusClass = hasCoverageIssue ? 'is-over' : 'is-ok';
                                const detailParts = [];
                                if (hasDemandGap) {
                                  detailParts.push(`faltan ${minutesToHoursLabel(missingMinutes)}`);
                                }
                                if (hasCoverageGap) {
                                  detailParts.push(`sin docente en ${uncoveredCourseCount} curso(s)`);
                                }
                                if (hasParallelGap) {
                                  detailParts.push(`faltan ${slotCapacityGapBlocks} bloque(s) sin cruce entre cursos`);
                                }
                                if (hasProjectedConflict) {
                                  detailParts.push(`${projectedConflictCount} conflicto(s) de horario proyectado(s) al generar horario`);
                                }

                                return (
                                  <li key={`docencia-coverage-${subject}`}>
                                    <button
                                      type="button"
                                      className={`school-creation-coverage-item-button ${docenciaCoverageFilterSubject === subject ? 'is-active' : ''}`}
                                      onClick={() => setDocenciaCoverageFilterSubject((current) => (current === subject ? '' : subject))}
                                    >
                                      <strong>{subject}</strong>
                                      {' — '}
                                      demanda {minutesToHoursLabel(demandMinutes)} / cobertura {minutesToHoursLabel(supplyMinutes)}
                                      {' · '}
                                      <span className={`school-creation-preview-status ${statusClass}`} style={{ marginLeft: '0.35rem' }}>{statusText}</span>
                                      {detailParts.length > 0 ? ` (${detailParts.join(', ')})` : ''}
                                    </button>
                                  </li>
                                );
                              })}
                          </ul>
                        </div>
                      ) : null}

                      {false && roleConfig.key === 'docencia' && docenciaCoverageFilterSubject ? (
                        <p style={{ margin: 0, color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                          Mostrando integrantes que tienen asignada la materia {docenciaCoverageFilterSubject}.
                        </p>
                      ) : null}

                      {false && roleConfig.key === 'docencia' && canPreviewScheduleConflictsInDocencia ? (
                        <div className="school-creation-level-box">
                          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Conflictos proyectados al generar horarios</h3>
                          <p style={{ margin: '0.35rem 0 0.6rem', color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                            Esta simulación usa la configuración actual de jornadas, bloques y cargas para mostrar qué materias o cursos todavía no cuadran.
                          </p>

                          {preGenerationScheduleAnalysis.blockingIssues.length > 0 ? (
                            <>
                              <p className="school-creation-warning-inline" style={{ marginBottom: '0.45rem' }}>
                                Aún hay conflictos proyectados antes de la generación de horarios.
                              </p>
                              <ul className="school-creation-coverage-list" style={{ marginBottom: 0 }}>
                                {preGenerationScheduleAnalysis.blockingIssues.slice(0, 12).map((issue, index) => (
                                  <li key={`docencia-pre-generation-${index}`}>{issue}</li>
                                ))}
                              </ul>
                              {preGenerationScheduleAnalysis.blockingIssues.length > 12 ? (
                                <p style={{ margin: '0.55rem 0 0', color: 'var(--school-text-soft)', fontSize: '0.8rem' }}>
                                  Mostrando 12 de {preGenerationScheduleAnalysis.blockingIssues.length} conflictos detectados.
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <p style={{ margin: 0, color: '#9be7be', fontSize: '0.82rem' }}>
                              No se detectan conflictos proyectados con la configuración horaria actual.
                            </p>
                          )}

                          {docenciaCoverageFilterSubject && (preGenerationConflictIssuesBySubject[docenciaCoverageFilterSubject] || []).length > 0 ? (
                            <div className="school-creation-level-box" style={{ marginTop: '0.75rem', padding: '0.85rem 1rem' }}>
                              <h4 style={{ margin: 0, fontSize: '0.88rem' }}>Detalle de conflictos para {docenciaCoverageFilterSubject}</h4>
                              <p style={{ margin: '0.3rem 0 0.55rem', color: 'var(--school-text-soft)', fontSize: '0.8rem' }}>
                                Estos son los conflictos exactos incluidos en el contador mostrado para esta materia.
                              </p>
                              <ul className="school-creation-coverage-list" style={{ marginBottom: 0 }}>
                                {preGenerationConflictIssuesBySubject[docenciaCoverageFilterSubject].map((issue, index) => (
                                  <li key={`docencia-pre-generation-detail-${docenciaCoverageFilterSubject}-${index}`}>{issue}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {docenciaCoverageFilterSubject ? (
                            <div className="school-creation-level-box" style={{ marginTop: '0.75rem', padding: '0.85rem 1rem' }}>
                              <h4 style={{ margin: 0, fontSize: '0.88rem' }}>Vista semanal docente para {docenciaCoverageFilterSubject}</h4>
                              <p style={{ margin: '0.3rem 0 0.55rem', color: 'var(--school-text-soft)', fontSize: '0.8rem' }}>
                                Esta vista muestra la jornada disponible de cada docente de la materia y los bloques que la simulación previa ya logró ocupar de lunes a viernes.
                              </p>

                              {preGenerationTeacherSchedulesForFilteredSubject.length > 0 ? (
                                <div style={{ display: 'grid', gap: '0.9rem' }}>
                                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                    <span className="school-creation-chip tiny is-active">{docenciaCoverageFilterSubject}</span>
                                    <span className="school-creation-chip tiny">Otras materias</span>
                                    <span className="school-creation-chip tiny">Jornada disponible</span>
                                  </div>

                                  {preGenerationTeacherSchedulesForFilteredSubject.map((teacher) => {
                                    const previewWeekDays = WEEK_DAYS.filter((day) => day !== 'Sabado');
                                    const visibleDuration = Math.max(1, teacher.visibleEndMin - teacher.visibleStartMin);

                                    return (
                                      <div
                                        key={`docencia-teacher-preview-${docenciaCoverageFilterSubject}-${teacher.id}`}
                                        style={{
                                          border: '1px solid rgba(255,255,255,0.08)',
                                          borderRadius: '18px',
                                          padding: '0.85rem',
                                          background: 'rgba(7, 14, 30, 0.26)',
                                        }}
                                      >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                                          <div>
                                            <strong style={{ fontSize: '0.88rem' }}>{teacher.teacherName}</strong>
                                            <p style={{ margin: '0.22rem 0 0', fontSize: '0.76rem', color: 'var(--school-text-soft)' }}>
                                              {teacher.assignedGradeLabels.length > 0
                                                ? `Cursos y niveles: ${teacher.assignedGradeLabels.join(', ')}`
                                                : 'No tiene cursos asignados actualmente.'}
                                            </p>
                                          </div>

                                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                            <span className="school-creation-chip tiny">Disponibilidad {minutesToHoursLabel(teacher.totalAvailableMinutes)}</span>
                                            <span className="school-creation-chip tiny">Asignado {minutesToHoursLabel(teacher.assignedMinutes)}</span>
                                            <span className={`school-creation-chip tiny ${teacher.selectedSubjectMinutes > 0 ? 'is-active' : ''}`}>
                                              {docenciaCoverageFilterSubject} {minutesToHoursLabel(teacher.selectedSubjectMinutes)}
                                            </span>
                                            <span className="school-creation-chip tiny">Libre {minutesToHoursLabel(teacher.remainingMinutes)}</span>
                                          </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.55rem' }}>
                                          {previewWeekDays.map((day) => {
                                            const dayAvailability = teacher.availabilityByDay[day] || [];
                                            const dayItems = teacher.scheduledByDay[day] || [];
                                            const availabilityLabel = dayAvailability.length > 0
                                              ? `${minutesToClockLabel(dayAvailability[0].startMin)}-${minutesToClockLabel(dayAvailability[dayAvailability.length - 1].endMin)}`
                                              : 'Sin jornada';

                                            return (
                                              <div key={`docencia-teacher-preview-day-${teacher.id}-${day}`} style={{ minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.35rem', marginBottom: '0.3rem' }}>
                                                  <strong style={{ fontSize: '0.79rem' }}>{day}</strong>
                                                  <span style={{ fontSize: '0.7rem', color: 'var(--school-text-soft)' }}>{availabilityLabel}</span>
                                                </div>

                                                <div
                                                  style={{
                                                    position: 'relative',
                                                    height: '230px',
                                                    borderRadius: '14px',
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    background: 'rgba(5, 10, 24, 0.34)',
                                                    overflow: 'hidden',
                                                  }}
                                                >
                                                  {dayAvailability.length === 0 ? (
                                                    <div
                                                      style={{
                                                        position: 'absolute',
                                                        inset: 0,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        textAlign: 'center',
                                                        padding: '0.55rem',
                                                        fontSize: '0.74rem',
                                                        color: 'var(--school-text-soft)',
                                                      }}
                                                    >
                                                      Sin disponibilidad este día.
                                                    </div>
                                                  ) : (
                                                    <>
                                                      {dayAvailability.map((interval, intervalIndex) => {
                                                        const top = ((interval.startMin - teacher.visibleStartMin) / visibleDuration) * 100;
                                                        const height = Math.max(6, ((interval.endMin - interval.startMin) / visibleDuration) * 100);

                                                        return (
                                                          <div
                                                            key={`docencia-teacher-preview-availability-${teacher.id}-${day}-${intervalIndex}`}
                                                            style={{
                                                              position: 'absolute',
                                                              left: '8%',
                                                              width: '84%',
                                                              top: `${top}%`,
                                                              height: `${height}%`,
                                                              borderRadius: '10px',
                                                              background: 'rgba(91, 231, 176, 0.08)',
                                                              border: '1px dashed rgba(91, 231, 176, 0.32)',
                                                            }}
                                                          />
                                                        );
                                                      })}

                                                      {dayItems.map((item, itemIndex) => {
                                                        const top = ((item.startMin - teacher.visibleStartMin) / visibleDuration) * 100;
                                                        const height = Math.max(12, ((item.endMin - item.startMin) / visibleDuration) * 100);
                                                        const isSelectedSubject = item.subject === docenciaCoverageFilterSubject;

                                                        return (
                                                          <div
                                                            key={`docencia-teacher-preview-item-${teacher.id}-${day}-${itemIndex}`}
                                                            style={{
                                                              position: 'absolute',
                                                              left: isSelectedSubject ? '12%' : '24%',
                                                              width: isSelectedSubject ? '76%' : '60%',
                                                              top: `${top}%`,
                                                              height: `${height}%`,
                                                              minHeight: '30px',
                                                              borderRadius: '10px',
                                                              padding: '0.26rem 0.34rem',
                                                              overflow: 'hidden',
                                                              background: isSelectedSubject
                                                                ? 'linear-gradient(180deg, rgba(112, 240, 170, 0.92), rgba(58, 186, 124, 0.92))'
                                                                : 'linear-gradient(180deg, rgba(121, 144, 255, 0.88), rgba(78, 102, 220, 0.88))',
                                                              color: '#0b1220',
                                                              boxShadow: '0 8px 18px rgba(0,0,0,0.18)',
                                                            }}
                                                          >
                                                            <div style={{ fontSize: '0.62rem', fontWeight: 700, lineHeight: 1.1 }}>
                                                              {minutesToClockLabel(item.startMin)}-{minutesToClockLabel(item.endMin)}
                                                            </div>
                                                            <div style={{ fontSize: '0.66rem', fontWeight: 800, lineHeight: 1.05, marginTop: '0.1rem' }}>
                                                              {item.courseLabel}
                                                            </div>
                                                            <div style={{ fontSize: '0.62rem', lineHeight: 1.05, marginTop: '0.08rem' }}>
                                                              {item.subject}
                                                            </div>
                                                          </div>
                                                        );
                                                      })}

                                                      <div style={{ position: 'absolute', top: '0.28rem', left: '0.32rem', fontSize: '0.66rem', color: 'rgba(255,255,255,0.45)' }}>
                                                        {minutesToClockLabel(teacher.visibleStartMin)}
                                                      </div>
                                                      <div style={{ position: 'absolute', bottom: '0.28rem', left: '0.32rem', fontSize: '0.66rem', color: 'rgba(255,255,255,0.45)' }}>
                                                        {minutesToClockLabel(teacher.visibleEndMin)}
                                                      </div>
                                                    </>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p style={{ margin: 0, color: 'var(--school-text-soft)', fontSize: '0.8rem' }}>
                                  No hay docentes configurados con la materia {docenciaCoverageFilterSubject} y una jornada válida para construir esta vista.
                                </p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {visibleMemberEntries.map(({ member, index: idx }) => (
                        <div key={idx} className="school-creation-level-box">
                          {roleData.members.length > 1 && (
                            <div className="school-creation-grade-header">
                              <strong style={{ fontSize: '0.88rem' }}>Integrante {idx + 1}</strong>
                              <button
                                className="school-creation-delete-inline"
                                onClick={() => removeStaffMember(roleConfig.key, idx)}
                                type="button"
                                aria-label="Eliminar integrante"
                              >
                                x
                              </button>
                            </div>
                          )}

                          <label>
                            Nombre completo
                            <input
                              placeholder="Ej: Ana García"
                              value={member.name}
                              onChange={(e) => updateStaffMember(roleConfig.key, idx, 'name', e.target.value)}
                            />
                          </label>

                          <label>
                            Correo electrónico
                            <input
                              type="email"
                              placeholder="Ej: ana@colegio.edu.co"
                              value={member.email}
                              onChange={(e) => updateStaffMember(roleConfig.key, idx, 'email', e.target.value)}
                            />
                          </label>

                          <label>
                            Contraseña
                            <input
                              type="password"
                              placeholder="Crea una contraseña"
                              value={member.password || ''}
                              onChange={(e) => updateStaffMember(roleConfig.key, idx, 'password', e.target.value)}
                            />
                          </label>

                          <label>
                            Teléfono (opcional)
                            <input
                              type="tel"
                              placeholder="Ej: 3001234567"
                              value={member.phone}
                              onChange={(e) => updateStaffMember(roleConfig.key, idx, 'phone', e.target.value)}
                            />
                          </label>

                          {roleConfig.extra.includes('levels') && selectedLevels.length > 0 && (
                            <label>
                              Nivel(es) educativo(s)
                              <div className="school-creation-chip-grid compact" style={{ marginTop: '0.4rem' }}>
                                {selectedLevels.map((level) => {
                                  const active = (member.levels || []).includes(level.id);
                                  return (
                                    <button
                                      key={level.id}
                                      className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                      onClick={() => toggleStaffMemberField(roleConfig.key, idx, 'levels', level.id)}
                                      type="button"
                                    >
                                      {level.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </label>
                          )}

                          {roleConfig.extra.includes('jornada') && (
                            <label>
                              Modalidad y horario laboral
                              <div className="school-creation-chip-grid compact" style={{ marginTop: '0.4rem' }}>
                                {[
                                  { key: 'completa', label: 'Tiempo completo' },
                                  { key: 'medio-tiempo', label: 'Medio tiempo' },
                                  { key: 'semanal', label: 'Una vez por semana' },
                                ].map((j) => (
                                  <button
                                    key={j.key}
                                    className={`school-creation-chip tiny ${member.jornada === j.key ? 'is-active' : ''}`}
                                    onClick={() => setStaffMemberJornada(roleConfig.key, idx, member.jornada === j.key ? '' : j.key)}
                                    type="button"
                                  >
                                    {j.label}
                                  </button>
                                ))}
                              </div>

                              {member.jornada === 'medio-tiempo' ? (
                                <small style={{ color: 'var(--school-text-soft)', marginTop: '0.2rem' }}>
                                  Puedes definir una franja como 08:00 a 12:00.
                                </small>
                              ) : null}

                              {member.jornada === 'semanal' ? (
                                <div className="school-creation-period-dates" style={{ marginTop: '0.5rem' }}>
                                  <label>
                                    Día de clase
                                    <select
                                      value={member.weeklyDay || ''}
                                      onChange={(e) => updateStaffMember(roleConfig.key, idx, 'weeklyDay', e.target.value)}
                                    >
                                      <option value="">Selecciona un día</option>
                                      {WEEK_DAYS.map((day) => (
                                        <option key={day} value={day}>
                                          {day}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    Hora inicio / fin
                                    <div className="school-creation-period-dates" style={{ marginTop: '0.35rem' }}>
                                      <input
                                        type="time"
                                        value={member.startTime || ''}
                                        onChange={(e) => updateStaffMember(roleConfig.key, idx, 'startTime', e.target.value)}
                                      />
                                      <input
                                        type="time"
                                        value={member.endTime || ''}
                                        onChange={(e) => updateStaffMember(roleConfig.key, idx, 'endTime', e.target.value)}
                                      />
                                    </div>
                                  </label>
                                </div>
                              ) : null}

                              {member.jornada && member.jornada !== 'semanal' ? (
                                <>
                                  <div className="school-creation-chip-grid compact" style={{ marginTop: '0.5rem' }}>
                                    {WEEK_DAYS.map((day) => {
                                      const active = (member.workDays || []).includes(day);
                                      return (
                                        <button
                                          key={day}
                                          className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                          onClick={() => toggleStaffMemberField(roleConfig.key, idx, 'workDays', day)}
                                          type="button"
                                        >
                                          {day}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="school-creation-period-dates" style={{ marginTop: '0.5rem' }}>
                                    <label>
                                      Hora inicio
                                      <input
                                        type="time"
                                        value={member.startTime || ''}
                                        onChange={(e) => updateStaffMember(roleConfig.key, idx, 'startTime', e.target.value)}
                                      />
                                    </label>
                                    <label>
                                      Hora fin
                                      <input
                                        type="time"
                                        value={member.endTime || ''}
                                        onChange={(e) => updateStaffMember(roleConfig.key, idx, 'endTime', e.target.value)}
                                      />
                                    </label>
                                  </div>
                                </>
                              ) : null}

                              {roleConfig.key === 'docencia' && member.jornada ? (
                                <div className="school-creation-level-box" style={{ marginTop: '0.75rem', padding: '0.85rem 1rem' }}>
                                  <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Descansos o bloqueos del docente</h4>
                                  <p style={{ margin: '0.35rem 0 0.65rem', color: 'var(--school-text-soft)', fontSize: '0.8rem' }}>
                                    Úsalo para almuerzo, meriendas, reuniones o cualquier franja donde el docente no puede dictar clase.
                                  </p>

                                  {(member.blockedSlots || []).map((slot, slotIndex) => (
                                    <div key={slot.id} className="school-creation-period-card" style={{ marginBottom: '0.55rem' }}>
                                      <button
                                        className="school-creation-delete-inline"
                                        type="button"
                                        onClick={() => removeTeacherBlockedSlot(idx, slot.id)}
                                        aria-label="Eliminar bloqueo docente"
                                      >
                                        x
                                      </button>

                                      <label>
                                        Nombre del bloqueo
                                        <input
                                          value={slot.name || ''}
                                          onChange={(e) => updateTeacherBlockedSlot(idx, slot.id, 'name', e.target.value)}
                                          placeholder={`Ej: Almuerzo ${slotIndex + 1}`}
                                        />
                                      </label>

                                      <div className="school-creation-chip-grid compact" style={{ marginTop: '0.45rem' }}>
                                        {WEEK_DAYS.map((day) => {
                                          const active = (slot.days || []).includes(day);
                                          return (
                                            <button
                                              key={`${slot.id}-${day}`}
                                              className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                              onClick={() => toggleTeacherBlockedSlotDay(idx, slot.id, day)}
                                              type="button"
                                            >
                                              {day}
                                            </button>
                                          );
                                        })}
                                      </div>

                                      <div className="school-creation-period-dates" style={{ marginTop: '0.5rem' }}>
                                        <label>
                                          Hora inicio
                                          <input
                                            type="time"
                                            value={slot.startTime || ''}
                                            onChange={(e) => updateTeacherBlockedSlot(idx, slot.id, 'startTime', e.target.value)}
                                          />
                                        </label>
                                        <label>
                                          Hora fin
                                          <input
                                            type="time"
                                            value={slot.endTime || ''}
                                            onChange={(e) => updateTeacherBlockedSlot(idx, slot.id, 'endTime', e.target.value)}
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  ))}

                                  <button
                                    className="school-creation-secondary-button"
                                    type="button"
                                    onClick={() => addTeacherBlockedSlot(idx)}
                                  >
                                    + Agregar descanso o bloqueo
                                  </button>
                                </div>
                              ) : null}
                            </label>
                          )}

                          {roleConfig.extra.includes('subjects') && subjects.length > 0 && (
                            (() => {
                              const selectedSubjects = member.subjects || [];
                              const pickerKey = `${roleConfig.key}:${idx}`;
                              const showAllSubjects = selectedSubjects.length === 0 || expandedTeacherSubjectPickers[pickerKey];
                              const hasMoreSubjects = subjects.some((subject) => !selectedSubjects.includes(subject));

                              return (
                                <label>
                                  Asignaturas que dicta

                                  {selectedSubjects.length > 0 ? (
                                    <div className="school-creation-chip-grid compact" style={{ marginTop: '0.4rem' }}>
                                      {selectedSubjects.map((subject) => (
                                        <button
                                          key={`${pickerKey}-selected-${subject}`}
                                          className="school-creation-chip tiny is-active"
                                          onClick={() => toggleStaffMemberField(roleConfig.key, idx, 'subjects', subject)}
                                          type="button"
                                        >
                                          {subject}
                                        </button>
                                      ))}

                                      {hasMoreSubjects ? (
                                        <button
                                          className={`school-creation-chip tiny ${showAllSubjects ? 'is-active' : ''}`}
                                          onClick={() => toggleTeacherSubjectPicker(roleConfig.key, idx)}
                                          type="button"
                                        >
                                          {showAllSubjects ? 'Ocultar materias' : 'Agregar otra asignatura'}
                                        </button>
                                      ) : null}
                                    </div>
                                  ) : null}

                                  {showAllSubjects ? (
                                    <div className="school-creation-chip-grid compact" style={{ marginTop: selectedSubjects.length > 0 ? '0.5rem' : '0.4rem' }}>
                                      {subjects.map((subject) => {
                                        const active = selectedSubjects.includes(subject);
                                        return (
                                          <button
                                            key={`${pickerKey}-option-${subject}`}
                                            className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                            onClick={() => toggleStaffMemberField(roleConfig.key, idx, 'subjects', subject)}
                                            type="button"
                                          >
                                            {subject}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </label>
                              );
                            })()
                          )}

                          {roleConfig.extra.includes('courses') && gradeRows.length > 0 && (() => {
                            const selectableGradeRows = gradeRows.filter((row) => {
                              const selectedSubjects = member.subjects || [];
                              if (selectedSubjects.length === 0) {
                                return true;
                              }

                              const gradeSubjects = subjectMapByGrade[row.key] || [];
                              return selectedSubjects.some((subject) => gradeSubjects.includes(subject));
                            });

                            return (
                              <label>
                                Grados asignados

                                {selectedLevels.length > 0 ? (
                                  <div className="school-creation-chip-grid compact" style={{ marginTop: '0.35rem' }}>
                                    {selectedLevels
                                      .map((level) => {
                                        const levelRows = selectableGradeRows.filter((row) => row.key.startsWith(`${level.id}:`));
                                        if (levelRows.length === 0) return null;
                                        const allSelected = levelRows.every((row) => (member.courses || []).includes(row.key));
                                        return (
                                          <button
                                            key={`docencia-level-${idx}-${level.id}`}
                                            className={`school-creation-chip tiny ${allSelected ? 'is-active' : ''}`}
                                            onClick={() => {
                                              setStaffByRole((current) => {
                                                const role = current[roleConfig.key];
                                                const members = role.members.map((entryMember, memberIndex) => {
                                                  if (memberIndex !== idx) return entryMember;
                                                  return {
                                                    ...entryMember,
                                                    courses: toggleGradeGroupInList(
                                                      entryMember.courses || [],
                                                      levelRows.map((row) => row.key),
                                                    ),
                                                  };
                                                });
                                                return { ...current, [roleConfig.key]: { ...role, members } };
                                              });
                                            }}
                                            type="button"
                                          >
                                            {level.name}
                                          </button>
                                        );
                                      })
                                      .filter(Boolean)}
                                  </div>
                                ) : null}

                                <div className="school-creation-chip-grid compact" style={{ marginTop: '0.4rem' }}>
                                  {selectableGradeRows.map((row) => {
                                    const active = (member.courses || []).includes(row.key);
                                    return (
                                      <button
                                        key={row.key}
                                        className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                        onClick={() => toggleStaffMemberField(roleConfig.key, idx, 'courses', row.key)}
                                        type="button"
                                      >
                                        {row.grade}{' '}
                                        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{row.levelName}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </label>
                            );
                          })()}
                        </div>
                      ))}

                      {roleConfig.key === 'docencia' && docenciaCoverageFilterSubject && visibleMemberEntries.length === 0 ? (
                        <p className="school-creation-warning-inline">
                          No hay integrantes con la asignatura {docenciaCoverageFilterSubject}. Usa "Limpiar filtro" para ver todos.
                        </p>
                      ) : null}

                      <button
                        className="school-creation-secondary-button"
                        onClick={() => {
                          if (roleConfig.key === 'docencia' && docenciaCoverageFilterSubject) {
                            addStaffMember(roleConfig.key, { subjects: [docenciaCoverageFilterSubject] });
                            return;
                          }
                          addStaffMember(roleConfig.key);
                        }}
                        type="button"
                      >
                        + Agregar otro integrante
                      </button>

                      {roleConfig.key === 'docencia' ? (() => {
                        const activeMembers = roleData.members.filter((m) => m.name.trim().length > 0);
                        const byGrade = {};
                        gradeRows.forEach((row) => {
                          (subjectMapByGrade[row.key] || []).forEach((subject) => {
                            const covered = activeMembers.some(
                              (m) => (m.subjects || []).includes(subject) && (m.courses || []).includes(row.key),
                            );
                            if (!covered) {
                              if (!byGrade[row.key]) byGrade[row.key] = { grade: row.grade, levelName: row.levelName, subjects: [] };
                              byGrade[row.key].subjects.push(subject);
                            }
                          });
                        });

                        const uncoveredEntries = Object.values(byGrade);
                        if (uncoveredEntries.length === 0) return null;

                        return (
                          <div className="school-creation-coverage-warning">
                            <p className="school-creation-coverage-title">
                              ⚠ Faltan docentes para cubrir estos cursos:
                            </p>
                            <ul className="school-creation-coverage-list">
                              {uncoveredEntries.map(({ grade, levelName, subjects }) => (
                                <li key={`${grade}-${levelName}`}>
                                  <strong>{grade}</strong>
                                  {' '}
                                  <span className="school-creation-coverage-level">{levelName}</span>
                                  {' — '}
                                  {subjects.join(', ')}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })() : null}
                    </>
                  )}
                </div>
              );
            })() : null}

            {step === 17 ? (
              <div className="school-creation-step-grid completion">
                <div className="school-creation-confetti" aria-hidden="true">
                  <span className="dot d1" />
                  <span className="dot d2" />
                  <span className="dot d3" />
                  <span className="dot d4" />
                  <span className="dot d5" />
                </div>

                <h2>¡Cuerpo académico creado!</h2>
                <p>Tu institución está completamente configurada y lista para operar en Comergio.</p>

                <div className="school-creation-summary-grid">
                  <div className="school-creation-summary-block">
                    <h4>Estructura académica</h4>
                    <ul className="school-creation-summary-list">
                      <li><strong>{selectedLevels.length}</strong> niveles educativos</li>
                      <li><strong>{gradeRows.length}</strong> grados</li>
                      <li><strong>{subjects.length}</strong> asignaturas</li>
                      <li><strong>{periods.length}</strong> periodos académicos</li>
                    </ul>
                  </div>
                  <div className="school-creation-summary-block">
                    <h4>Cuerpo académico</h4>
                    <ul className="school-creation-summary-list">
                      {STAFF_ROLES.map((role) => {
                        const roleData = staffByRole[role.key];
                        if (roleData.skip) return null;
                        const count = roleData.members.filter((m) => m.name.trim()).length;
                        if (!count) return null;
                        return (
                          <li key={role.key}>
                            <strong>{count}</strong> {role.label}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>

                <div className="school-creation-completion-actions school-creation-completion-actions-centered">
                  <button className="school-creation-primary-button" onClick={() => setStep(18)} type="button">
                    Continuar con costos
                  </button>
                </div>
              </div>
            ) : null}

            {false && step === 19 ? (
              <div className="school-creation-step-grid school-creation-transition-grid">
                <div className="school-creation-transition-badge" aria-hidden="true">🗓</div>
                <h2>Ahora creemos el horario académico</h2>
                <p>
                  Preparando el módulo para configurar jornadas, bloques, breaks, cargas y generar
                  horarios automáticos por curso y docente.
                </p>
                <div className="school-creation-transition-track">
                  <div className="school-creation-transition-fill" style={{ width: `${transitionProgress}%` }} />
                </div>
                <small className="school-creation-transition-label">
                  Iniciando en {Math.max(1, Math.ceil((1 - transitionProgress / 100) * 5))} seg…
                </small>
              </div>
            ) : null}

            {false && step >= 20 && step <= 29 ? (() => {
              const scheduleIndex = step - 20;

              if (scheduleIndex === 0) {
                return (
                  <div className="school-creation-step-grid">
                    <h2>Configuración de jornada</h2>
                    <p>Crea jornadas y asigna grados/cursos a cada jornada.</p>
                    {scheduleShifts.map((shift, index) => (
                      <div key={`shift-${index}`} className="school-creation-level-box">
                        <label>
                          Nombre de jornada
                          <input
                            value={shift.name}
                            onChange={(e) => updateScheduleShift(index, 'name', e.target.value)}
                            placeholder="Ej: Mañana"
                          />
                        </label>

                        <label>
                          Dias de la jornada
                          <div className="school-creation-chip-grid compact" style={{ marginTop: '0.4rem' }}>
                            {WEEK_DAYS.map((day) => {
                              const active = (shift.days || []).includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                  onClick={() =>
                                    updateScheduleShift(
                                      index,
                                      'days',
                                      active ? (shift.days || []).filter((d) => d !== day) : [...(shift.days || []), day],
                                    )
                                  }
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </label>

                        <div className="school-creation-period-dates">
                          <label>
                            Hora inicio
                            <input
                              type="time"
                              value={shift.startTime || ''}
                              onChange={(e) => updateScheduleShift(index, 'startTime', e.target.value)}
                            />
                          </label>
                          <label>
                            Hora fin
                            <input
                              type="time"
                              value={shift.endTime || ''}
                              onChange={(e) => updateScheduleShift(index, 'endTime', e.target.value)}
                            />
                          </label>
                        </div>

                        <div className="school-creation-chip-grid compact" style={{ marginBottom: '0.35rem' }}>
                          {selectedLevels.map((level) => {
                            const levelGradeKeys = gradeKeysByLevel[level.id] || [];
                            if (levelGradeKeys.length === 0) return null;
                            const allSelected = levelGradeKeys.every((gradeKey) => (shift.gradeKeys || []).includes(gradeKey));
                            return (
                              <button
                                key={`shift-level-${index}-${level.id}`}
                                type="button"
                                className={`school-creation-chip tiny ${allSelected ? 'is-active' : ''}`}
                                onClick={() => toggleShiftLevel(index, level.id)}
                              >
                                {level.name}
                              </button>
                            );
                          })}
                        </div>

                        <div className="school-creation-chip-grid compact">
                          {gradeRows.map((row) => {
                            const active = (shift.gradeKeys || []).includes(row.key);
                            return (
                              <button
                                key={row.key}
                                type="button"
                                className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                onClick={() => toggleShiftGrade(index, row.key)}
                              >
                                {row.grade} {row.levelName}
                              </button>
                            );
                          })}
                        </div>

                        {shiftValidationIssues
                          .filter((issue) => issue.index === index)
                          .slice(0, 1)
                          .map((issue, issueIndex) => (
                            <p key={`shift-issue-${index}-${issueIndex}`} className="school-creation-break-inline-warning">
                              {issue.message}
                            </p>
                          ))}
                      </div>
                    ))}
                    <button
                      className="school-creation-secondary-button"
                      type="button"
                      onClick={() => setScheduleShifts((c) => [...c, makeDefaultScheduleShift(c.length + 1)])}
                    >
                      + Agregar jornada
                    </button>

                  </div>
                );
              }

              if (scheduleIndex === 1) {
                return (
                  <div className="school-creation-step-grid">
                    <h2>Definición de bloques</h2>
                    <div className="school-creation-level-box">
                      <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Diseño semanal por nivel</h3>
                      <p style={{ margin: '0.35rem 0 0.7rem', color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                        Selecciona un nivel y arrastra los tipos de bloque sobre la grilla semanal. Clase general define las ventanas donde luego se autogenerarán materias. Deportes se reserva igual que un bloque fijo del sistema.
                      </p>

                      <div className="school-creation-calendar-toolbar">
                        <label>
                          Nivel educativo
                          <select
                            value={blockPlannerLevelId}
                            onChange={(e) => {
                              setBlockPlannerWarning('');
                              setBlockPlannerLevelId(e.target.value);
                            }}
                          >
                            {plannerLevelOptions.map((level) => (
                              <option key={level.id} value={level.id}>
                                {level.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {plannerLevelGradeKeys.length ? (
                        <div className="school-creation-chip-grid compact school-creation-planner-grade-chips">
                          {plannerLevelGradeKeys.map((gradeKey) => {
                            const row = gradeRowByKey[gradeKey];
                            if (!row) return null;
                            const active = plannerGradeKeys.includes(gradeKey);
                            return (
                              <button
                                key={`planner-grade-${gradeKey}`}
                                type="button"
                                className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                onClick={() => setPlannerSelectedGradeKeys((current) => current.includes(gradeKey)
                                  ? current.filter((item) => item !== gradeKey)
                                  : [...current, gradeKey])}
                              >
                                {row.grade}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="school-creation-calendar-subjects">
                        {[
                          { type: 'clase', label: 'Clase general' },
                          { type: 'break', label: 'Break' },
                          { type: 'guidance', label: 'Guidance Routine' },
                          { type: 'control', label: 'Control' },
                          { type: 'sports', label: 'Deportes' },
                        ].map((item) => (
                          <button
                            key={`planner-type-${item.type}`}
                            className={`school-creation-chip ${dragPlannerType === item.type ? 'is-active' : ''}`}
                            type="button"
                            draggable
                            onClick={() => {
                              setBlockPlannerWarning('');
                              setDragPlannerType(item.type);
                            }}
                            onDragStart={(event) => {
                              startPlannerChipDrag(event, item.type);
                            }}
                            onDragEnd={() => setDragPlannerType('')}
                          >
                            {item.label}
                          </button>
                        ))}

                        <button
                          className="school-creation-chip school-creation-chip--add"
                          type="button"
                          onClick={() => {
                            setOtherBlockNameDraft('');
                            setOtherBlockModalOpen(true);
                          }}
                        >
                          + Otro bloque
                        </button>

                        {plannerOtherBlockNames.map((name) => {
                          const active = normalizeKey(plannerOtherBlockName) === normalizeKey(name);

                          return (
                            <div
                              key={`planner-other-chip-${normalizeKey(name)}`}
                              className={`school-creation-chip-removable ${active ? 'is-active' : ''}`}
                            >
                              <button
                                className={`school-creation-chip ${active ? 'is-active' : ''}`}
                                type="button"
                                draggable
                                onClick={() => selectPlannerOtherBlockName(name)}
                                onDragStart={(event) => {
                                  selectPlannerOtherBlockName(name);
                                  startPlannerChipDrag(event, 'other', name);
                                }}
                                onDragEnd={() => setDragPlannerType('')}
                              >
                                Otro: {name}
                              </button>
                              <button
                                className={`school-creation-chip-remove ${active ? 'is-active' : ''}`}
                                type="button"
                                aria-label={`Eliminar bloque ${name}`}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  removePlannerOtherBlockName(name);
                                }}
                              >
                                x
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {blockPlannerWarning ? <p className="school-creation-warning-inline">{blockPlannerWarning}</p> : null}
                      {!blockPlannerLevelId || !plannerGradeKeys.length || !plannerDays.length ? (
                        <div className="school-creation-level-box" style={{ marginTop: '0.75rem' }}>
                          <p style={{ margin: 0, color: 'var(--school-text-soft)' }}>
                            Selecciona al menos un grado y asegúrate de que comparta una jornada compatible para habilitar la grilla.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="school-creation-calendar-board-wrap" style={{ marginTop: '0.8rem' }}>
                            <div className="school-creation-calendar-times" style={{ height: `${plannerBoardHeight}px` }}>
                              <div className="school-creation-calendar-time-header" aria-hidden="true" />
                              {plannerMinuteRows.map((row) => (
                                <div
                                  key={`planner-time-${row.minute}`}
                                  className={`school-creation-calendar-time-row ${row.isHour ? 'is-hour' : ''} ${row.isHalfHour ? 'is-half-hour' : ''}`}
                                  style={{ height: `${plannerRowHeight}px` }}
                                >
                                  <span>{row.label}</span>
                                </div>
                              ))}
                            </div>

                            <div
                              className="school-creation-calendar-board"
                              style={{ gridTemplateColumns: `repeat(${plannerDays.length}, minmax(180px, 1fr))` }}
                            >
                              {plannerDays.map((day) => (
                                <div key={`planner-day-${day}`} className="school-creation-calendar-day-column">
                                  <div className="school-creation-calendar-day-header">{day}</div>
                                  <div className="school-creation-calendar-day-grid" style={{ height: `${plannerBoardHeight}px` }}>
                                    {(plannerUnavailableSegmentsByDay[day] || []).map((segment, index) => {
                                      const top = ((segment.start - plannerViewStartMin) / plannerSlotMinutes) * plannerRowHeight;
                                      const height = ((segment.end - segment.start) / plannerSlotMinutes) * plannerRowHeight;
                                      if (height <= 0) return null;

                                      return (
                                        <div
                                          key={`planner-unavailable-${day}-${index}`}
                                          className="school-creation-calendar-unavailable"
                                          style={{ top: `${top}px`, height: `${height}px` }}
                                        />
                                      );
                                    })}

                                    {plannerMinuteRows.map((row) => (
                                      <div
                                        key={`planner-drop-${day}-${row.minute}`}
                                        className={`school-creation-calendar-cell ${row.isHour ? 'is-hour' : ''} ${row.isHalfHour ? 'is-half-hour' : ''}`}
                                        style={{ height: `${plannerRowHeight}px` }}
                                        onClick={() => openPlannerCreateModal(day, row.minute)}
                                        onDragOver={(event) => event.preventDefault()}
                                        onDrop={(event) => {
                                          event.preventDefault();
                                          handlePlannerDrop(day, row.minute, event);
                                        }}
                                      />
                                    ))}

                                    {plannerEntries
                                      .filter((item) => (item.entry.days || []).includes(day))
                                      .map((item) => {
                                      const blockStart = timeToMinutes(item.entry.startTime);
                                      const blockEnd = timeToMinutes(item.entry.endTime);
                                      if (blockStart === null || blockEnd === null || blockEnd <= blockStart) return null;

                                      const top = ((blockStart - plannerViewStartMin) / plannerSlotMinutes) * plannerRowHeight;
                                      const height = ((blockEnd - blockStart) / plannerSlotMinutes) * plannerRowHeight;
                                      const isSelected = selectedPlannerSlot?.type === item.type
                                        && selectedPlannerSlot?.sourceIndex === item.sourceIndex
                                        && selectedPlannerSlot?.day === day;

                                        return (
                                        <div
                                          key={`planner-entry-${item.type}-${item.sourceIndex}-${day}`}
                                          className={`${item.className} ${isSelected ? 'is-selected' : ''}`}
                                          onClick={() => selectPlannerSlot(item.type, item.sourceIndex, day)}
                                          onDoubleClick={() => openPlannerTimeModal(item, day)}
                                          style={{
                                            top: `${top}px`,
                                            height: `${height}px`,
                                            pointerEvents: 'auto',
                                            zIndex: item.type === 'clase' ? 2 : 3,
                                            ...(item.type !== 'clase'
                                              ? {
                                                display: 'grid',
                                                alignContent: 'center',
                                                justifyItems: 'stretch',
                                                gap: '0.16rem',
                                                padding: '0.55rem 1.9rem 0.55rem 0.45rem',
                                              }
                                              : {}),
                                          }}
                                        >
                                          <button
                                            className="school-creation-planner-resize-zone school-creation-planner-resize-zone--top"
                                            type="button"
                                            aria-label="Ajustar inicio del bloque"
                                            onMouseDown={(event) => startPlannerSlotResize(event, item, day, blockStart, blockEnd, 'top')}
                                          />
                                          {item.type === 'clase' ? (
                                            <>
                                              <div
                                                className="school-creation-calendar-subject-slot-head school-creation-calendar-subject-slot-head--draggable"
                                                draggable
                                                onDragStart={(event) => {
                                                  setBlockPlannerWarning('');
                                                  event.dataTransfer.effectAllowed = 'move';
                                                  event.dataTransfer.setData(PLANNER_DRAG_SLOT_MIME, JSON.stringify({ type: item.type, sourceIndex: item.sourceIndex }));
                                                  setDraggingPlannerSlot({ type: item.type, sourceIndex: item.sourceIndex });
                                                }}
                                                onDragEnd={() => setDraggingPlannerSlot(null)}
                                              >
                                                <strong>{item.displayLabel}</strong>
                                              </div>
                                              <small>
                                                {minutesToClockLabel(blockStart)} - {minutesToClockLabel(blockEnd)}
                                              </small>
                                            </>
                                          ) : (
                                            <>
                                              <div
                                                className="school-creation-calendar-overlay-head school-creation-calendar-subject-slot-head--draggable"
                                                draggable
                                                onDragStart={(event) => {
                                                  setBlockPlannerWarning('');
                                                  event.dataTransfer.effectAllowed = 'move';
                                                  event.dataTransfer.setData(PLANNER_DRAG_SLOT_MIME, JSON.stringify({ type: item.type, sourceIndex: item.sourceIndex }));
                                                  setDraggingPlannerSlot({ type: item.type, sourceIndex: item.sourceIndex });
                                                }}
                                                onDragEnd={() => setDraggingPlannerSlot(null)}
                                              >
                                                <strong>{item.displayLabel}</strong>
                                              </div>
                                              <small style={{ padding: '0 0.45rem', textAlign: 'left' }}>
                                                {minutesToClockLabel(blockStart)} - {minutesToClockLabel(blockEnd)}
                                              </small>
                                            </>
                                          )}
                                          <button
                                            className="school-creation-planner-entry-remove"
                                            type="button"
                                            aria-label="Eliminar bloque"
                                            onClick={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              removePlannerEntry(item.type, item.sourceIndex);
                                            }}
                                          >
                                            x
                                          </button>
                                          <button
                                            className="school-creation-planner-resize-zone school-creation-planner-resize-zone--bottom"
                                            type="button"
                                            aria-label="Ajustar fin del bloque"
                                            onMouseDown={(event) => startPlannerSlotResize(event, item, day, blockStart, blockEnd, 'bottom')}
                                          />
                                        </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {plannerClassHoursSummary.length ? (
                            <div className="school-creation-level-box" style={{ marginTop: '0.85rem' }}>
                              <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Bloques semanales de Clase general</h3>
                              <p style={{ margin: '0.3rem 0 0.55rem', color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                                Esta información se deduce de los bloques explícitos que armaste en la grilla y se usará al generar el horario de cursos.
                              </p>
                              <div className="school-creation-chip-grid compact">
                                {plannerClassHoursSummary.map((entry) => (
                                  <div key={`planner-class-hours-${entry.gradeKey}`} className="school-creation-chip tiny is-active" style={{ cursor: 'default' }}>
                                    {entry.label}: {entry.totalBlocks} bloque{entry.totalBlocks === 1 ? '' : 's'} · {formatClassBlockMix(entry.blockMix)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>

                    {otherBlockModalOpen ? (
                      <div className="school-creation-modal-backdrop" role="presentation">
                        <div className="school-creation-modal-card" role="dialog" aria-modal="true" aria-label="Nombre del bloque personalizado">
                          <h3>Nombre del bloque</h3>
                          <label>
                            Escribe el nombre
                            <input
                              value={otherBlockNameDraft}
                              onChange={(e) => setOtherBlockNameDraft(e.target.value)}
                              placeholder="Ej: Almuerzo, Asamblea, Laboratorio"
                              autoFocus
                            />
                          </label>
                          <div className="school-creation-modal-actions">
                            <button
                              className="school-creation-secondary-button"
                              type="button"
                              onClick={() => {
                                setOtherBlockModalOpen(false);
                                setOtherBlockNameDraft('');
                              }}
                            >
                              Cancelar
                            </button>
                            <button
                              className="school-creation-primary-button"
                              type="button"
                              onClick={() => {
                                const nextName = otherBlockNameDraft.trim();
                                if (!nextName) return;

                                const existingName = plannerOtherBlockNames.find(
                                  (name) => normalizeKey(name) === normalizeKey(nextName),
                                );
                                const selectedName = existingName || nextName;

                                setPlannerOtherBlockNames((current) => existingName
                                  ? current
                                  : [...current, nextName]);
                                setPlannerOtherBlockName(selectedName);
                                setDragPlannerType('other');
                                setOtherBlockModalOpen(false);
                                setOtherBlockNameDraft('');
                              }}
                            >
                              Guardar
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {plannerTimeModal ? (
                      <div className="school-creation-modal-backdrop" role="presentation">
                        <div className="school-creation-modal-card" role="dialog" aria-modal="true" aria-label="Ajustar hora del bloque">
                          <h3>{plannerTimeModal.mode === 'create' ? 'Agregar bloque' : 'Ajustar hora del bloque'}</h3>
                          <p style={{ margin: 0, color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                            {plannerTimeModal.mode === 'create'
                              ? `${plannerTimeModal.type === 'other'
                                ? `Otro: ${plannerTimeModal.name || 'Bloque personalizado'}`
                                : ({
                                  clase: 'Clase general',
                                  break: 'Break',
                                  guidance: 'Guidance Routine',
                                  control: 'Control',
                                  sports: 'Deportes',
                                }[plannerTimeModal.type] || 'Bloque')
                              } · ${plannerTimeModal.day}`
                              : `${plannerTimeModal.label} · ${plannerTimeModal.day}`}
                          </p>
                          {plannerTimeModal.mode === 'create' ? (
                            <div className="school-creation-period-dates" style={{ marginTop: '0.75rem' }}>
                              <label>
                                Bloque
                                <select
                                  value={plannerTimeModal.type}
                                  onChange={(event) => {
                                    const nextType = event.target.value;
                                    setPlannerTimeModal((current) => {
                                      if (!current) return current;
                                      return {
                                        ...current,
                                        type: nextType,
                                        name: nextType === 'other'
                                          ? String(current.name || plannerOtherBlockName || plannerOtherBlockNames[0] || '').trim()
                                          : '',
                                      };
                                    });
                                  }}
                                >
                                  <option value="clase">Clase general</option>
                                  <option value="break">Break</option>
                                  <option value="guidance">Guidance Routine</option>
                                  <option value="control">Control</option>
                                  <option value="sports">Deportes</option>
                                  {plannerOtherBlockNames.length ? (
                                    <option value="other">Otro bloque existente</option>
                                  ) : null}
                                </select>
                              </label>
                              {plannerTimeModal.type === 'other' ? (
                                <label>
                                  Nombre del bloque
                                  <select
                                    value={plannerTimeModal.name}
                                    onChange={(event) => setPlannerTimeModal((current) => (current ? { ...current, name: event.target.value } : current))}
                                  >
                                    {plannerOtherBlockNames.map((name) => (
                                      <option key={`planner-modal-other-${normalizeKey(name)}`} value={name}>
                                        {name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="school-creation-period-dates">
                            <label>
                              Inicio
                              <input
                                type="time"
                                value={plannerTimeModal.startTime}
                                onChange={(event) => setPlannerTimeModal((current) => (current ? { ...current, startTime: event.target.value } : current))}
                              />
                            </label>
                            <label>
                              Fin
                              <input
                                type="time"
                                value={plannerTimeModal.endTime}
                                onChange={(event) => setPlannerTimeModal((current) => (current ? { ...current, endTime: event.target.value } : current))}
                              />
                            </label>
                          </div>
                          <div className="school-creation-modal-actions">
                            <button
                              className="school-creation-secondary-button"
                              type="button"
                              onClick={closePlannerTimeModal}
                            >
                              Cancelar
                            </button>
                            <button
                              className="school-creation-primary-button"
                              type="button"
                              onClick={savePlannerTimeModal}
                            >
                              Guardar
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                  </div>
                );
              }

              if (scheduleIndex === 2) {
                return (
                  <div className="school-creation-step-grid">
                    <h2>Breaks</h2>
                    <p>Crea breaks y asigna los grados/cursos que los toman.</p>
                    {scheduleBreaks.map((entry, index) => (
                      <div key={`break-${index}`} className="school-creation-period-card">
                        {scheduleBreaks.length > 1 ? (
                          <button
                            className="school-creation-delete-inline"
                            type="button"
                            onClick={() => removeScheduleBreak(index)}
                            aria-label="Eliminar break"
                          >
                            x
                          </button>
                        ) : null}
                        <label>
                          Nombre del break
                          <input
                            value={entry.name}
                            onChange={(e) => updateScheduleBreak(index, 'name', e.target.value)}
                            placeholder="Ej: Recreo mañana"
                          />
                        </label>
                        <label>
                          Días del break
                          <div className="school-creation-chip-grid compact" style={{ marginTop: '0.4rem' }}>
                            {WEEK_DAYS.map((day) => {
                              const active = (entry.days || []).includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                  onClick={() =>
                                    updateScheduleBreak(
                                      index,
                                      'days',
                                      active ? (entry.days || []).filter((d) => d !== day) : [...(entry.days || []), day],
                                    )
                                  }
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </label>
                        <div className="school-creation-period-dates">
                          <label>
                            Inicio
                            <input
                              type="time"
                              value={entry.startTime}
                              onChange={(e) => updateScheduleBreak(index, 'startTime', e.target.value)}
                            />
                          </label>
                          <label>
                            Fin
                            <input
                              type="time"
                              value={entry.endTime}
                              onChange={(e) => updateScheduleBreak(index, 'endTime', e.target.value)}
                            />
                          </label>
                        </div>
                        <div className="school-creation-chip-grid compact" style={{ marginBottom: '0.35rem' }}>
                          {selectedLevels.map((level) => {
                            const levelGradeKeys = gradeKeysByLevel[level.id] || [];
                            if (levelGradeKeys.length === 0) return null;
                            const allSelected = levelGradeKeys.every((gradeKey) => (entry.gradeKeys || []).includes(gradeKey));
                            return (
                              <button
                                key={`break-level-${index}-${level.id}`}
                                type="button"
                                className={`school-creation-chip tiny ${allSelected ? 'is-active' : ''}`}
                                onClick={() => toggleBreakLevel(index, level.id)}
                              >
                                {level.name}
                              </button>
                            );
                          })}
                        </div>

                        <div className="school-creation-chip-grid compact">
                          {gradeRows.map((row) => {
                            const active = (entry.gradeKeys || []).includes(row.key);
                            return (
                              <button
                                key={row.key}
                                type="button"
                                className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                onClick={() => toggleBreakGrade(index, row.key)}
                              >
                                {row.grade} {row.levelName}
                              </button>
                            );
                          })}
                        </div>

                        {breakValidationIssues
                          .filter((issue) => issue.index === index)
                          .slice(0, 2)
                          .map((issue, issueIndex) => (
                            <p key={`break-issue-${index}-${issueIndex}`} className="school-creation-break-inline-warning">
                              {issue.message}
                            </p>
                          ))}
                      </div>
                    ))}
                    <button
                      className="school-creation-secondary-button"
                      type="button"
                      onClick={() => setScheduleBreaks((c) => [...c, makeDefaultBreak(c.length + 1)])}
                    >
                      + Agregar break
                    </button>

                  </div>
                );
              }

              if (scheduleIndex === 3) {
                return (
                  <div className="school-creation-step-grid">
                    <h2>Guidance Routine</h2>
                    <p>Crea guidance routines y asigna los grados/cursos que las tienen.</p>
                    {scheduleGuidanceRoutines.map((entry, index) => (
                      <div key={`guidance-${index}`} className="school-creation-period-card">
                        {scheduleGuidanceRoutines.length > 1 ? (
                          <button
                            className="school-creation-delete-inline"
                            type="button"
                            onClick={() => removeScheduleGuidanceRoutine(index)}
                            aria-label="Eliminar guidance routine"
                          >
                            x
                          </button>
                        ) : null}
                        <label>
                          Nombre de la guidance routine
                          <input
                            value={entry.name}
                            onChange={(e) => updateScheduleGuidanceRoutine(index, 'name', e.target.value)}
                            placeholder="Ej: Orientación académica"
                          />
                        </label>
                        <label>
                          Días
                          <div className="school-creation-chip-grid compact" style={{ marginTop: '0.4rem' }}>
                            {WEEK_DAYS.map((day) => {
                              const active = (entry.days || []).includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                  onClick={() =>
                                    updateScheduleGuidanceRoutine(
                                      index,
                                      'days',
                                      active ? (entry.days || []).filter((d) => d !== day) : [...(entry.days || []), day],
                                    )
                                  }
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </label>
                        <div className="school-creation-period-dates">
                          <label>
                            Inicio
                            <input
                              type="time"
                              value={entry.startTime}
                              onChange={(e) => updateScheduleGuidanceRoutine(index, 'startTime', e.target.value)}
                            />
                          </label>
                          <label>
                            Fin
                            <input
                              type="time"
                              value={entry.endTime}
                              onChange={(e) => updateScheduleGuidanceRoutine(index, 'endTime', e.target.value)}
                            />
                          </label>
                        </div>
                        <div className="school-creation-chip-grid compact" style={{ marginBottom: '0.35rem' }}>
                          {selectedLevels.map((level) => {
                            const levelGradeKeys = gradeKeysByLevel[level.id] || [];
                            if (levelGradeKeys.length === 0) return null;
                            const allSelected = levelGradeKeys.every((gradeKey) => (entry.gradeKeys || []).includes(gradeKey));
                            return (
                              <button
                                key={`guidance-level-${index}-${level.id}`}
                                type="button"
                                className={`school-creation-chip tiny ${allSelected ? 'is-active' : ''}`}
                                onClick={() => toggleGuidanceRoutineLevel(index, level.id)}
                              >
                                {level.name}
                              </button>
                            );
                          })}
                        </div>

                        <div className="school-creation-chip-grid compact">
                          {gradeRows.map((row) => {
                            const active = (entry.gradeKeys || []).includes(row.key);
                            return (
                              <button
                                key={row.key}
                                type="button"
                                className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                onClick={() => toggleGuidanceRoutineGrade(index, row.key)}
                              >
                                {row.grade} {row.levelName}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <button
                      className="school-creation-secondary-button"
                      type="button"
                      onClick={() => setScheduleGuidanceRoutines((c) => [...c, makeDefaultGuidanceRoutine(c.length + 1)])}
                    >
                      + Agregar guidance routine
                    </button>

                  </div>
                );
              }

              if (scheduleIndex === 4) {
                return (
                  <div className="school-creation-step-grid">
                    <h2>Control</h2>
                    <p>Crea controles y asigna los grados/cursos que los tienen.</p>
                    {scheduleControl.map((entry, index) => (
                      <div key={`control-${index}`} className="school-creation-period-card">
                        {scheduleControl.length > 1 ? (
                          <button
                            className="school-creation-delete-inline"
                            type="button"
                            onClick={() => removeScheduleControl(index)}
                            aria-label="Eliminar control"
                          >
                            x
                          </button>
                        ) : null}

                        <label>
                          Nombre del control
                          <input
                            value={entry.name}
                            onChange={(e) => updateScheduleControl(index, 'name', e.target.value)}
                            placeholder="Ej: Control de asistencia"
                          />
                        </label>
                        <label>
                          Días
                          <div className="school-creation-chip-grid compact" style={{ marginTop: '0.4rem' }}>
                            {WEEK_DAYS.map((day) => {
                              const active = (entry.days || []).includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                  onClick={() =>
                                    updateScheduleControl(
                                      index,
                                      'days',
                                      active ? (entry.days || []).filter((d) => d !== day) : [...(entry.days || []), day],
                                    )
                                  }
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </label>
                        <div className="school-creation-period-dates">
                          <label>
                            Inicio
                            <input
                              type="time"
                              value={entry.startTime}
                              onChange={(e) => updateScheduleControl(index, 'startTime', e.target.value)}
                            />
                          </label>
                          <label>
                            Fin
                            <input
                              type="time"
                              value={entry.endTime}
                              onChange={(e) => updateScheduleControl(index, 'endTime', e.target.value)}
                            />
                          </label>
                        </div>
                        <div className="school-creation-chip-grid compact" style={{ marginBottom: '0.35rem' }}>
                          {selectedLevels.map((level) => {
                            const levelGradeKeys = gradeKeysByLevel[level.id] || [];
                            if (levelGradeKeys.length === 0) return null;
                            const allSelected = levelGradeKeys.every((gradeKey) => (entry.gradeKeys || []).includes(gradeKey));
                            return (
                              <button
                                key={`control-level-${index}-${level.id}`}
                                type="button"
                                className={`school-creation-chip tiny ${allSelected ? 'is-active' : ''}`}
                                onClick={() => toggleControlLevel(index, level.id)}
                              >
                                {level.name}
                              </button>
                            );
                          })}
                        </div>

                        <div className="school-creation-chip-grid compact">
                          {gradeRows.map((row) => {
                            const active = (entry.gradeKeys || []).includes(row.key);
                            return (
                              <button
                                key={row.key}
                                type="button"
                                className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                onClick={() => toggleControlGrade(index, row.key)}
                              >
                                {row.grade} {row.levelName}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <button
                      className="school-creation-secondary-button"
                      type="button"
                      onClick={() => setScheduleControl((c) => [...c, makeDefaultControl(c.length + 1)])}
                    >
                      + Agregar control
                    </button>

                  </div>
                );
              }

              if (scheduleIndex === 5) {
                return (
                  <div className="school-creation-step-grid">
                    <h2>Máximo de bloques juntos</h2>
                    <p>Define cuántos bloques seguidos puede tener cada asignatura.</p>

                    <div className="school-creation-level-box">
                      <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Valor predeterminado</h3>
                      <div className="school-creation-period-dates" style={{ marginTop: '0.5rem' }}>
                        <label>
                          Bloques predeterminados
                          <input
                            type="number"
                            min="1"
                            max="8"
                            value={maxBlocksPreset.value}
                            onChange={(e) =>
                              setMaxBlocksPreset((current) => ({
                                ...current,
                                value: e.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                      <label className="school-creation-single-course-label" style={{ marginTop: '0.6rem' }}>
                        <input
                          type="checkbox"
                          checked={maxBlocksPreset.apply}
                          onChange={(e) =>
                            setMaxBlocksPreset((current) => ({
                              ...current,
                              apply: e.target.checked,
                            }))
                          }
                        />
                        Aplicar valor predeterminado a todas las asignaturas
                      </label>
                    </div>

                    {subjects.map((subject) => (
                      <div key={subject} className="school-creation-period-dates">
                        <label>
                          {subject}
                          <input
                            type="number"
                            min="1"
                            max="8"
                            value={maxConsecutiveBySubject[subject] || ''}
                            onChange={(e) =>
                              setMaxConsecutiveBySubject((current) => ({
                                ...current,
                                [subject]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                );
              }

              if (scheduleIndex === 6) {
                const rowHeight = calendarRowHeight;
                const isShiftReady =
                  calendarShiftStartMin !== null &&
                  calendarShiftEndMin !== null &&
                  calendarShiftEndMin > calendarShiftStartMin &&
                  calendarDays.length > 0;
                const boardHeight = calendarTotalSlots * rowHeight;

                const visibleFixedSlots = fixedSubjectSlots.filter((slot) => {
                  if (slot.gradeKey !== calendarGradeKey) return false;
                  if (!calendarDays.includes(slot.day)) return false;
                  if (isWeeklyCalendar) return true;
                  return slot.shiftName === calendarShift?.name;
                });

                const minuteRows = Array.from({ length: calendarTotalSlots }, (_, index) => {
                  const minute = calendarViewStartMin + index * calendarSlotMinutes;
                  const minuteOfHour = minute % 60;
                  return {
                    minute,
                    label: minuteOfHour === 0 ? minutesToAmPmLabel(minute) : '',
                    isHour: minuteOfHour === 0,
                    isHalfHour: minuteOfHour === 30,
                  };
                });

                return (
                  <div className="school-creation-step-grid school-creation-step-grid--calendar">
                    <h2>Asignaturas predeterminadas por horario</h2>
                    <p>Arrastra una asignatura a la grilla semanal y estira verticalmente para fijar su duración.</p>

                    <div className="school-creation-level-box">
                      <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Asignaturas fijas globales</h3>
                      <p style={{ margin: '0.35rem 0 0.65rem', color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                        Reserva franjas por asignatura para todos los grados y cursos antes de organizar el resto del horario.
                      </p>

                      {globalPinnedSubjectRules.map((rule) => (
                        <div key={rule.id} className="school-creation-period-card" style={{ marginBottom: '0.55rem' }}>
                          <button
                            className="school-creation-delete-inline"
                            type="button"
                            onClick={() => removeGlobalPinnedSubjectRule(rule.id)}
                            aria-label="Eliminar asignatura fija global"
                          >
                            x
                          </button>

                          <div className="school-creation-period-dates">
                            <label>
                              Asignatura
                              <select
                                value={rule.subject}
                                onChange={(e) => updateGlobalPinnedSubjectRule(rule.id, 'subject', e.target.value)}
                              >
                                {subjects.map((subject) => (
                                  <option key={`${rule.id}-${subject}`} value={subject}>
                                    {subject}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Hora inicio
                              <input
                                type="time"
                                value={rule.startTime || ''}
                                onChange={(e) => updateGlobalPinnedSubjectRule(rule.id, 'startTime', e.target.value)}
                              />
                            </label>
                            <label>
                              Hora fin
                              <input
                                type="time"
                                value={rule.endTime || ''}
                                onChange={(e) => updateGlobalPinnedSubjectRule(rule.id, 'endTime', e.target.value)}
                              />
                            </label>
                          </div>

                          <div className="school-creation-chip-grid compact" style={{ marginTop: '0.45rem' }}>
                            {WEEK_DAYS.map((day) => {
                              const active = (rule.days || []).includes(day);
                              return (
                                <button
                                  key={`${rule.id}-${day}`}
                                  type="button"
                                  className={`school-creation-chip tiny ${active ? 'is-active' : ''}`}
                                  onClick={() => toggleGlobalPinnedSubjectRuleDay(rule.id, day)}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      <button className="school-creation-secondary-button" type="button" onClick={addGlobalPinnedSubjectRule}>
                        + Agregar asignatura fija global
                      </button>
                    </div>

                    <div className="school-creation-calendar-toolbar">
                      <label>
                        Grado
                        <select
                          value={calendarGradeKey}
                          onChange={(e) => {
                            setCalendarWarning('');
                            setCalendarGradeKey(e.target.value);
                          }}
                        >
                          {calendarGradeOptions.map((grade) => (
                            <option key={grade.key} value={grade.key}>
                              {grade.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Jornada
                        <select
                          value={calendarShiftName || ''}
                          onChange={(e) => {
                            setCalendarWarning('');
                            setCalendarShiftName(e.target.value);
                          }}
                        >
                          <option value={CALENDAR_WEEKLY_OPTION}>Jornada semanal</option>
                          {calendarShiftOptions.map((shift, i) => (
                            <option key={`${shift.name}-${i}`} value={shift.name}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="school-creation-calendar-subjects">
                      {subjects.map((subject) => (
                        <button
                          key={`calendar-subject-${subject}`}
                          className={`school-creation-chip ${dragSubject === subject ? 'is-active' : ''}`}
                          type="button"
                          draggable
                          onDragStart={() => {
                            setCalendarWarning('');
                            setDragSubject(subject);
                          }}
                          onDragEnd={() => setDragSubject('')}
                        >
                          {subject}
                        </button>
                      ))}
                    </div>

                    {isWeeklyCalendar ? (
                      <p className="school-creation-warning-inline">
                        Vista semanal activa: muestra todas las jornadas del grado seleccionado.
                      </p>
                    ) : null}

                    {calendarWarning ? <p className="school-creation-warning-inline">{calendarWarning}</p> : null}

                    {preGenerationScheduleAnalysis.blockingIssues.length > 0 ? (
                      <div className="school-creation-level-box">
                        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Conflictos que debes resolver antes de generar</h3>
                        <p style={{ margin: '0.35rem 0 0.6rem', color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                          Con la configuración actual, la simulación detecta conflictos reales por curso. Corrige estos puntos antes de pasar a la generación de horarios.
                        </p>
                        <ul className="school-creation-coverage-list" style={{ marginBottom: 0 }}>
                          {preGenerationScheduleAnalysis.blockingIssues.slice(0, 12).map((issue, index) => (
                            <li key={`pre-generation-blocking-${index}`}>{issue}</li>
                          ))}
                        </ul>
                        {preGenerationScheduleAnalysis.blockingIssues.length > 12 ? (
                          <p style={{ margin: '0.55rem 0 0', color: 'var(--school-text-soft)', fontSize: '0.8rem' }}>
                            Mostrando 12 de {preGenerationScheduleAnalysis.blockingIssues.length} conflictos detectados.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {!isShiftReady || !calendarGradeKey || calendarDays.length === 0 ? (
                      <div className="school-creation-level-box">
                        <p style={{ margin: 0, color: 'var(--school-text-soft)' }}>
                          Configura una jornada con hora inicio/fin, días y grados para habilitar la grilla.
                        </p>
                      </div>
                    ) : (
                      <div className="school-creation-calendar-board-wrap">
                        <div className="school-creation-calendar-times" style={{ height: `${boardHeight}px` }}>
                          <div className="school-creation-calendar-time-header" aria-hidden="true" />
                          {minuteRows.map((row) => (
                            <div
                              key={`time-row-${row.minute}`}
                              className={`school-creation-calendar-time-row ${row.isHour ? 'is-hour' : ''} ${row.isHalfHour ? 'is-half-hour' : ''}`}
                            >
                              <span>{row.label}</span>
                            </div>
                          ))}
                        </div>

                        <div
                          className="school-creation-calendar-board"
                          style={{ gridTemplateColumns: `repeat(${calendarDays.length}, minmax(180px, 1fr))` }}
                        >
                          {calendarDays.map((day) => (
                            <div key={`day-column-${day}`} className="school-creation-calendar-day-column">
                              <div className="school-creation-calendar-day-header">{day}</div>
                              <div className="school-creation-calendar-day-grid" style={{ height: `${boardHeight}px` }}>
                                {(calendarUnavailableSegmentsByDay[day] || []).map((segment, index) => {
                                  const top = ((segment.start - calendarViewStartMin) / calendarSlotMinutes) * rowHeight;
                                  const height = ((segment.end - segment.start) / calendarSlotMinutes) * rowHeight;
                                  if (height <= 0) return null;

                                  return (
                                    <div
                                      key={`unavailable-${day}-${index}`}
                                      className="school-creation-calendar-unavailable"
                                      style={{ top: `${top}px`, height: `${height}px` }}
                                    />
                                  );
                                })}

                                {minuteRows.map((row) => (
                                  <div
                                    key={`drop-${day}-${row.minute}`}
                                    className={`school-creation-calendar-cell ${row.isHour ? 'is-hour' : ''} ${row.isHalfHour ? 'is-half-hour' : ''}`}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      handleCalendarDrop(day, row.minute);
                                    }}
                                  />
                                ))}

                                {calendarBreakSlots
                                  .filter((entry) => (entry.days || []).includes(day))
                                  .map((entry, index) => {
                                    const breakStart = timeToMinutes(entry.startTime);
                                    const breakEnd = timeToMinutes(entry.endTime);
                                    if (breakStart === null || breakEnd === null) return null;

                                    const start = Math.max(breakStart, calendarViewStartMin);
                                    const end = Math.min(breakEnd, calendarViewEndMin);
                                    if (end <= start) return null;

                                    const top = ((start - calendarViewStartMin) / calendarSlotMinutes) * rowHeight;
                                    const height = ((end - start) / calendarSlotMinutes) * rowHeight;

                                    return (
                                      <div
                                        key={`break-${day}-${index}-${entry.startTime}`}
                                        className="school-creation-calendar-break"
                                        style={{ top: `${top}px`, height: `${height}px` }}
                                      >
                                        Break
                                      </div>
                                    );
                                  })}

                                {calendarGuidanceSlots
                                  .filter((entry) => (entry.days || []).includes(day))
                                  .map((entry, index) => {
                                    const blockStart = timeToMinutes(entry.startTime);
                                    const blockEnd = timeToMinutes(entry.endTime);
                                    if (blockStart === null || blockEnd === null) return null;

                                    const start = Math.max(blockStart, calendarViewStartMin);
                                    const end = Math.min(blockEnd, calendarViewEndMin);
                                    if (end <= start) return null;

                                    const top = ((start - calendarViewStartMin) / calendarSlotMinutes) * rowHeight;
                                    const height = ((end - start) / calendarSlotMinutes) * rowHeight;

                                    return (
                                      <div
                                        key={`guidance-${day}-${index}-${entry.startTime}`}
                                        className="school-creation-calendar-break school-creation-calendar-break--guidance"
                                        style={{ top: `${top}px`, height: `${height}px` }}
                                      >
                                        Guidance Routine
                                      </div>
                                    );
                                  })}

                                {calendarControlSlots
                                  .filter((entry) => (entry.days || []).includes(day))
                                  .map((entry, index) => {
                                    const blockStart = timeToMinutes(entry.startTime);
                                    const blockEnd = timeToMinutes(entry.endTime);
                                    if (blockStart === null || blockEnd === null) return null;

                                    const start = Math.max(blockStart, calendarViewStartMin);
                                    const end = Math.min(blockEnd, calendarViewEndMin);
                                    if (end <= start) return null;

                                    const top = ((start - calendarViewStartMin) / calendarSlotMinutes) * rowHeight;
                                    const height = ((end - start) / calendarSlotMinutes) * rowHeight;

                                    return (
                                      <div
                                        key={`control-${day}-${index}-${entry.startTime}`}
                                        className="school-creation-calendar-break school-creation-calendar-break--control"
                                        style={{ top: `${top}px`, height: `${height}px` }}
                                      >
                                        Control
                                      </div>
                                    );
                                  })}

                                {calendarSportsSlots
                                  .filter((entry) => (entry.days || []).includes(day))
                                  .map((entry, index) => {
                                    const blockStart = timeToMinutes(entry.startTime);
                                    const blockEnd = timeToMinutes(entry.endTime);
                                    if (blockStart === null || blockEnd === null) return null;

                                    const start = Math.max(blockStart, calendarViewStartMin);
                                    const end = Math.min(blockEnd, calendarViewEndMin);
                                    if (end <= start) return null;

                                    const top = ((start - calendarViewStartMin) / calendarSlotMinutes) * rowHeight;
                                    const height = ((end - start) / calendarSlotMinutes) * rowHeight;

                                    return (
                                      <div
                                        key={`sports-${day}-${index}-${entry.startTime}`}
                                        className="school-creation-calendar-break school-creation-calendar-break--sports"
                                        style={{ top: `${top}px`, height: `${height}px` }}
                                      >
                                        Deportes
                                      </div>
                                    );
                                  })}

                                {calendarOtherSlots
                                  .filter((entry) => (entry.days || []).includes(day))
                                  .map((entry, index) => {
                                    const blockStart = timeToMinutes(entry.startTime);
                                    const blockEnd = timeToMinutes(entry.endTime);
                                    if (blockStart === null || blockEnd === null) return null;

                                    const start = Math.max(blockStart, calendarViewStartMin);
                                    const end = Math.min(blockEnd, calendarViewEndMin);
                                    if (end <= start) return null;

                                    const top = ((start - calendarViewStartMin) / calendarSlotMinutes) * rowHeight;
                                    const height = ((end - start) / calendarSlotMinutes) * rowHeight;

                                    return (
                                      <div
                                        key={`other-${day}-${index}-${entry.startTime}`}
                                        className="school-creation-calendar-break school-creation-calendar-break--other"
                                        style={{ top: `${top}px`, height: `${height}px` }}
                                      >
                                        {entry.name || 'Otro'}
                                      </div>
                                    );
                                  })}

                                {calendarGlobalPinnedSlots
                                  .filter((slot) => slot.day === day)
                                  .map((slot) => {
                                    const top = ((slot.startMin - calendarViewStartMin) / calendarSlotMinutes) * rowHeight;
                                    const height = ((slot.endMin - slot.startMin) / calendarSlotMinutes) * rowHeight;
                                    return (
                                      <div
                                        key={`global-slot-${slot.key}`}
                                        className="school-creation-calendar-subject-slot school-creation-calendar-subject-slot--global"
                                        style={{ top: `${top}px`, height: `${height}px` }}
                                      >
                                        <div className="school-creation-calendar-subject-slot-head">
                                          <strong>{slot.subject}</strong>
                                          <span style={{ fontSize: '0.62rem', fontWeight: 700 }}>Global</span>
                                        </div>
                                        <small>
                                          {minutesToClockLabel(slot.startMin)} - {minutesToClockLabel(slot.endMin)}
                                        </small>
                                      </div>
                                    );
                                  })}

                                {visibleFixedSlots
                                  .filter((slot) => slot.day === day)
                                  .map((slot) => {
                                    const top = ((slot.startMin - calendarViewStartMin) / calendarSlotMinutes) * rowHeight;
                                    const height = ((slot.endMin - slot.startMin) / calendarSlotMinutes) * rowHeight;

                                    return (
                                      <div
                                        key={slot.id}
                                        className="school-creation-calendar-subject-slot"
                                        style={{ top: `${top}px`, height: `${height}px` }}
                                      >
                                        <button
                                          className="school-creation-calendar-resize school-creation-calendar-resize--top"
                                          type="button"
                                          onMouseDown={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            const { shiftStartMin, shiftEndMin } = resolveShiftBoundsByName(slot.shiftName);
                                            setCalendarWarning('');
                                            setResizingSlot({
                                              slotId: slot.id,
                                              startY: event.clientY,
                                              origStartMin: slot.startMin,
                                              origEndMin: slot.endMin,
                                              shiftName: slot.shiftName,
                                              gradeKey: slot.gradeKey,
                                              day: slot.day,
                                              shiftStartMin,
                                              shiftEndMin,
                                              edge: 'top',
                                            });
                                          }}
                                        >
                                          Estirar
                                        </button>

                                        <div
                                          className="school-creation-calendar-subject-slot-head school-creation-calendar-subject-slot-head--draggable"
                                          draggable
                                          onDragStart={() => {
                                            setCalendarWarning('');
                                            setDraggingSlotId(slot.id);
                                          }}
                                          onDragEnd={() => setDraggingSlotId(null)}
                                        >
                                          <strong>{slot.subject}</strong>
                                          <button type="button" onClick={() => removeFixedSlot(slot.id)}>
                                            x
                                          </button>
                                        </div>
                                        <small>
                                          {minutesToClockLabel(slot.startMin)} - {minutesToClockLabel(slot.endMin)}
                                        </small>
                                        <button
                                          className="school-creation-calendar-resize"
                                          type="button"
                                          onMouseDown={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            const { shiftStartMin, shiftEndMin } = resolveShiftBoundsByName(slot.shiftName);
                                            setCalendarWarning('');
                                            setResizingSlot({
                                              slotId: slot.id,
                                              startY: event.clientY,
                                              origStartMin: slot.startMin,
                                              origEndMin: slot.endMin,
                                              shiftName: slot.shiftName,
                                              gradeKey: slot.gradeKey,
                                              day: slot.day,
                                              shiftStartMin,
                                              shiftEndMin,
                                              edge: 'bottom',
                                            });
                                          }}
                                        >
                                          Estirar
                                        </button>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              if (scheduleIndex === 7) {
                return (
                  <div className="school-creation-step-grid">
                    <h2>Generar horario por cursos</h2>
                    <p>
                      Genera automáticamente teniendo en cuenta disponibilidad docente, breaks,
                      jornadas y cargas académicas.
                    </p>
                    <label>
                      Nivel educativo a generar
                      <select
                        value={scheduleGenerationLevelId}
                        disabled={Boolean(courseGenerationModal)}
                        onChange={(e) => setScheduleGenerationLevelId(e.target.value)}
                      >
                        {scheduleGenerationLevels.map((level) => (
                          <option key={level.id} value={level.id}>
                            {level.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    {scheduleGenerationCoverageAnalysis.blockingIssues.length > 0 ? (
                      <p className="school-creation-warning-inline">
                        No es posible generar este nivel sin conflictos todavía. Ajusta cobertura docente y carga académica.
                      </p>
                    ) : null}

                    {connectedScheduleGenerationLevelNames.length > 1 ? (
                      <p className="school-creation-warning-inline">
                        También se generarán {connectedScheduleGenerationLevelNames.join(', ')} porque comparten docentes asignados.
                      </p>
                    ) : null}

                    {courseGenerationWarning ? (
                      <p className="school-creation-warning-inline">
                        {courseGenerationWarning}
                      </p>
                    ) : null}

                    <button
                      className="school-creation-primary-button"
                      type="button"
                      onClick={generateCourseSchedules}
                      disabled={Boolean(courseGenerationModal) || scheduleGenerationLevels.length === 0 || scheduleGenerationCoverageAnalysis.blockingIssues.length > 0}
                    >
                      {hasGeneratedConnectedCourseSchedules ? 'Recalcular horarios conectados' : 'Generar horarios conectados'}
                    </button>

                    {scheduleGenerationCoverageAnalysis.blockingIssues.length > 0 ? (
                      <div className="school-creation-level-box">
                        <h3 style={{ margin: 0 }}>Acciones recomendadas antes de generar</h3>
                        <ul className="school-creation-coverage-list" style={{ marginTop: '0.35rem' }}>
                          {scheduleGenerationCoverageAnalysis.blockingIssues.slice(0, 8).map((issue, index) => (
                            <li key={`gen-blocking-${index}`}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {courseGenerationModal ? (
                      <div className="school-creation-modal-backdrop" role="presentation">
                        <div className="school-creation-modal-card" role="dialog" aria-modal="true" aria-label="Generando horarios">
                          <h3>{courseGenerationModal.title}</h3>
                          <p style={{ margin: 0, color: 'var(--school-text-soft)' }}>
                            {courseGenerationModal.message}
                          </p>
                          {courseGenerationModal.progressLabel ? (
                            <p style={{ margin: 0, color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                              {courseGenerationModal.progressLabel}
                            </p>
                          ) : null}
                          <div className="school-creation-loading-pulse" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {generatedCourseEntriesForDisplay.length > 0 ? (
                      <>
                        <p className="school-creation-transition-label">
                          Horarios generados para {generatedCourseEntriesForDisplay.length} cursos.
                        </p>

                        <div className="school-creation-schedule-cards">
                          {generatedCourseEntriesForDisplay.map(([courseKey, course]) => {
                            const itemCount = (course.items || []).length;
                            const classCount = (course.items || []).filter((item) => item.type === 'class').length;
                            const fixedCount = (course.items || []).filter((item) => ['fixed', 'global'].includes(item.type)).length;
                            const conflictCount = (course.conflicts || []).length;

                            return (
                              <button
                                key={courseKey}
                                type="button"
                                className={`school-creation-schedule-card ${selectedGeneratedCourseSchedule?.key === courseKey ? 'is-active' : ''}`}
                                onClick={() => setSelectedCourseScheduleKey(courseKey)}
                              >
                                <div className="school-creation-schedule-card-header">
                                  <strong>{course.courseLabel}</strong>
                                  <span className={`school-creation-schedule-card-status ${conflictCount > 0 ? 'is-danger' : 'is-ok'}`}>
                                    {conflictCount > 0 ? `${conflictCount} conflicto(s)` : 'Sin conflictos'}
                                  </span>
                                </div>

                                <div className="school-creation-schedule-card-preview">
                                  {renderGeneratedScheduleBoard(course, 'compact')}
                                </div>

                                <p className="school-creation-schedule-card-meta">
                                  {classCount} clases programadas · {fixedCount} fijas · {itemCount} bloques totales
                                </p>
                              </button>
                            );
                          })}
                        </div>

                        {selectedGeneratedCourseSchedule ? (
                          <div className="school-creation-level-box">
                            <h3 style={{ margin: 0 }}>Previsualización: {selectedGeneratedCourseSchedule.data.courseLabel}</h3>
                            <p style={{ margin: 0, color: 'var(--school-text-soft)' }}>
                              Vista ampliada de {minutesToClockLabel(selectedSchedulePreviewWindow.startMin)} a {minutesToClockLabel(selectedSchedulePreviewWindow.endMin)}.
                            </p>
                            {renderGeneratedScheduleBoard(selectedGeneratedCourseSchedule.data, 'large')}
                            {(selectedGeneratedCourseSchedule.data.conflicts || []).length > 0 ? (
                              <ul className="school-creation-schedule-conflicts">
                                {selectedGeneratedCourseSchedule.data.conflicts.map((conflict, i) =>
                                  renderConflictWithActions(conflict, `preview-conflict-${i}`),
                                )}
                              </ul>
                            ) : (
                              <p style={{ margin: 0, color: 'var(--school-text-soft)' }}>
                                Este horario se generó sin conflictos detectados.
                              </p>
                            )}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                );
              }

              if (scheduleIndex === 8) {
                return (
                  <div className="school-creation-step-grid">
                    <h2>Revisión y edición</h2>
                    <p>Revisa los horarios generados por curso y confirma que no haya conflictos.</p>
                    <div className="school-creation-level-box">
                      <p style={{ margin: 0, color: 'var(--school-text-soft)' }}>
                        Cursos generados: {generatedCourseEntries.length}
                      </p>
                      <p style={{ margin: 0, color: 'var(--school-text-soft)' }}>
                        Cursos con conflictos: {generatedCourseEntries.filter(([, course]) => (course.conflicts || []).length > 0).length}
                      </p>
                      <label className="school-creation-single-course-label">
                        <input
                          type="checkbox"
                          checked={scheduleReviewConfirmed}
                          onChange={(e) => setScheduleReviewConfirmed(e.target.checked)}
                        />
                        Confirmo que revisé y edité sin conflictos.
                      </label>
                    </div>
                  </div>
                );
              }

              return (
                <div className="school-creation-step-grid">
                  <h2>Generación de horario para docentes</h2>
                  <p>Una vez definido el horario de alumnos, genera el horario individual de docentes.</p>
                  <button className="school-creation-primary-button" type="button" onClick={generateTeacherSchedules}>
                    Generar horarios de docentes
                  </button>

                  {generatedTeacherEntriesForDisplay.length > 0 ? (
                    <>
                      <p className="school-creation-transition-label">
                        Horarios generados para {generatedTeacherEntriesForDisplay.length} docentes.
                      </p>

                      <div className="school-creation-schedule-cards">
                        {generatedTeacherEntriesForDisplay.map(([teacherKey, teacher]) => {
                          const itemCount = (teacher.items || []).length;
                          const classCount = (teacher.items || []).filter((item) => item.type === 'class').length;
                          const fixedCount = (teacher.items || []).filter((item) => ['fixed', 'global'].includes(item.type)).length;

                          return (
                            <button
                              key={teacherKey}
                              type="button"
                              className={`school-creation-schedule-card ${selectedGeneratedTeacherSchedule?.key === teacherKey ? 'is-active' : ''}`}
                              onClick={() => setSelectedTeacherScheduleKey(teacherKey)}
                            >
                              <div className="school-creation-schedule-card-header">
                                <strong>{teacher.teacherName}</strong>
                                <span className="school-creation-schedule-card-status is-ok">
                                  {teacher.courses?.length || 0} curso(s)
                                </span>
                              </div>

                              <div className="school-creation-schedule-card-preview">
                                {renderGeneratedScheduleBoard(teacher, 'compact')}
                              </div>

                              <p className="school-creation-schedule-card-meta">
                                {classCount} clases programadas · {fixedCount} fijas · {itemCount} bloques totales
                              </p>
                            </button>
                          );
                        })}
                      </div>

                      {selectedGeneratedTeacherSchedule ? (
                        <div className="school-creation-level-box">
                          <h3 style={{ margin: 0 }}>Previsualización: {selectedGeneratedTeacherSchedule.data.teacherName}</h3>
                          <p style={{ margin: 0, color: 'var(--school-text-soft)' }}>
                            Vista ampliada de {minutesToClockLabel(selectedTeacherSchedulePreviewWindow.startMin)} a {minutesToClockLabel(selectedTeacherSchedulePreviewWindow.endMin)}.
                          </p>
                          <p style={{ margin: 0, color: 'var(--school-text-soft)' }}>
                            Cursos asignados: {(selectedGeneratedTeacherSchedule.data.courses || []).join(', ') || 'Sin cursos'}.
                          </p>
                          {renderGeneratedScheduleBoard(selectedGeneratedTeacherSchedule.data, 'large')}
                          <p style={{ margin: 0, color: 'var(--school-text-soft)' }}>
                            Asignaturas: {(selectedGeneratedTeacherSchedule.data.subjects || []).join(', ') || 'Sin asignaturas'}.
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })() : null}

            {step === 18 ? (
              <div className="school-creation-step-grid">
                <h2>Definir calendario escolar</h2>
                <p>Configura el inicio de matrículas y el recargo que se aplicará si una familia matricula tarde.</p>
                <div className="school-creation-finance-grid">
                  <label>
                    Fecha de inicio de matrículas
                    <input
                      type="date"
                      value={financialCalendar.enrollmentStartDate}
                      onChange={(event) => updateFinancialCalendarField('enrollmentStartDate', event.target.value)}
                    />
                  </label>
                  <label>
                    Recargo por matrícula tardía (%)
                    <input
                      min="0"
                      placeholder="Ej: 5"
                      type="number"
                      value={financialCalendar.lateEnrollmentSurchargePercent}
                      onChange={(event) => updateFinancialCalendarField('lateEnrollmentSurchargePercent', event.target.value)}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {step === 19 ? (
              <div className="school-creation-step-grid">
                <h2>Definir costos por grado</h2>
                <p>Registra matrícula y pensión para cada grado configurado. El bono puede dejarse vacío.</p>
                <div className="school-creation-finance-grade-list">
                  {gradeRows.map((row) => {
                    const costs = financialCostsByGrade[row.key] || {};
                    return (
                      <div key={`cost-${row.key}`} className="school-creation-level-box school-creation-finance-grade-card">
                        <div className="school-creation-grade-header">
                          <h3>{row.grade} {row.levelName}</h3>
                          <span>{courseCountByGradeKey[row.key] || 1} curso(s)</span>
                        </div>
                        <div className="school-creation-finance-grid school-creation-finance-grid--three">
                          {FINANCIAL_COST_FIELDS.map((field) => (
                            <label key={`${row.key}-${field.key}`}>
                              {field.label}{field.optional ? ' (opcional)' : ''}
                              <input
                                min="0"
                                placeholder={field.optional ? 'Opcional' : '0'}
                                type="number"
                                value={costs[field.key] || ''}
                                onChange={(event) => updateFinancialCostByGrade(row.key, field.key, event.target.value)}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {step === 20 ? (
              <div className="school-creation-step-grid">
                <h2>Definir beneficios económicos (sobre pensiones)</h2>
                <p>Agrega beneficios como pronto pago, becas, descuentos familiares u otros acuerdos. Todos aplican únicamente sobre pensiones. Este paso es opcional.</p>
                <button className="school-creation-secondary-button school-creation-fit-button" type="button" onClick={addEconomicBenefit}>
                  Agregar beneficio
                </button>
                {economicBenefits.length === 0 ? (
                  <div className="school-creation-level-box">
                    <p style={{ margin: 0, color: 'var(--school-text-soft)' }}>
                      No hay beneficios configurados. Puedes continuar sin agregar ninguno.
                    </p>
                  </div>
                ) : (
                  <div className="school-creation-finance-grade-list">
                    {economicBenefits.map((benefit, index) => (
                      <div key={benefit.id} className="school-creation-level-box school-creation-finance-benefit-card">
                        <div className="school-creation-grade-header">
                          <h3>Beneficio {index + 1}</h3>
                          <button className="school-creation-delete-inline" type="button" onClick={() => removeEconomicBenefit(benefit.id)}>
                            Eliminar
                          </button>
                        </div>
                        <div className="school-creation-finance-grid school-creation-finance-grid--three">
                          <label>
                            Nombre
                            <input
                              placeholder="Ej: Pronto pago"
                              value={benefit.name}
                              onChange={(event) => updateEconomicBenefit(benefit.id, 'name', event.target.value)}
                            />
                          </label>
                          <label>
                            Tipo
                            <select
                              value={benefit.type}
                              onChange={(event) => updateEconomicBenefit(benefit.id, 'type', event.target.value)}
                            >
                              <option value="discount">Descuento</option>
                              <option value="scholarship">Beca</option>
                              <option value="agreement">Convenio</option>
                              <option value="other">Otro</option>
                            </select>
                          </label>
                          <label>
                            Valor (%)
                            <input
                              min="0"
                              placeholder="Ej: 10"
                              type="number"
                              value={benefit.value}
                              onChange={(event) => updateEconomicBenefit(benefit.id, 'value', event.target.value)}
                            />
                          </label>
                        </div>
                        <div className="school-creation-level-box" style={{ marginTop: '0.65rem' }}>
                          <h4 style={{ margin: 0 }}>Aplica sobre pensiones</h4>
                          <p style={{ margin: '0.25rem 0 0', color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                            Este beneficio se calcula únicamente sobre el valor de la pensión mensual, no sobre matrícula ni bono.
                          </p>
                        </div>
                        {isPromptPaymentBenefit(benefit) ? (
                          <div className="school-creation-finance-grid" style={{ marginTop: '0.65rem' }}>
                            <label>
                              Aplica durante los primeros días del mes
                              <input
                                min="1"
                                max="31"
                                placeholder="Ej: 10"
                                type="number"
                                value={benefit.promptPaymentDayLimit || ''}
                                onChange={(event) => updateEconomicBenefit(benefit.id, 'promptPaymentDayLimit', event.target.value)}
                              />
                            </label>
                            <p style={{ margin: 0, color: 'var(--school-text-soft)', fontSize: '0.82rem' }}>
                              Ejemplo: si defines 10, el descuento aplica a pensiones pagadas del día 1 al 10 de cada mes.
                            </p>
                            {!hasValidPromptPaymentRule(benefit) ? (
                              <p className="school-creation-warning-inline" style={{ margin: 0 }}>
                                Define un número entero entre 1 y 31 para que el sistema pueda aplicar la regla mensual.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        <label>
                          Descripción o condición
                          <textarea
                            placeholder="Ej: Aplica pagando antes del día 5 de cada mes."
                            rows="3"
                            value={benefit.description}
                            onChange={(event) => updateEconomicBenefit(benefit.id, 'description', event.target.value)}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {step === 21 ? (
              <div className="school-creation-step-grid completion">
                <div className="school-creation-confetti" aria-hidden="true">
                  <span className="dot d1" />
                  <span className="dot d2" />
                  <span className="dot d3" />
                  <span className="dot d4" />
                  <span className="dot d5" />
                </div>
                <h2>Costos completados</h2>
                <p>
                  Quedaron definidos calendario de matrículas, costos por grado y beneficios económicos. Ya puedes pasar al dashboard.
                </p>
                {schoolCreationSubmitError ? (
                  <p className="school-creation-block-reason">{schoolCreationSubmitError}</p>
                ) : null}
                <div className="school-creation-completion-actions">
                  <button className="school-creation-secondary-button" onClick={resetWizard} type="button" disabled={isCompletingSchoolCreation}>
                    Crear otra institución
                  </button>
                  <button className="school-creation-primary-button" onClick={completeSchoolSetupAndEnterRectoria} type="button" disabled={isCompletingSchoolCreation}>
                    {isCompletingSchoolCreation ? 'Creando colegio...' : 'Ir al dashboard'}
                  </button>
                </div>
              </div>
            ) : null}

            {step !== 17 && step < 21 ? (
              <footer className="school-creation-actions">
                {!canContinue && blockReason ? (
                  <p className="school-creation-block-reason">{blockReason}</p>
                ) : null}
                <div className="school-creation-actions-buttons">
                  <button className="school-creation-secondary-button" onClick={resetWizard} type="button">
                    Empezar de cero
                  </button>
                  <button className="school-creation-secondary-button" onClick={goBack} type="button" disabled={step === 0}>
                    Anterior
                  </button>
                  <button className="school-creation-primary-button" onClick={goNext} type="button" disabled={!canContinue}>
                    Siguiente
                  </button>
                </div>
              </footer>
            ) : null}

            {step === 17 ? (
              <footer className="school-creation-actions">
                <div className="school-creation-actions-buttons school-creation-actions-buttons-centered">
                  <button className="school-creation-secondary-button" onClick={goBack} type="button">
                    Anterior
                  </button>
                </div>
              </footer>
            ) : null}
        </article>
      </main>
    </div>
  );
}

export default SchoolCreationWizard;
