const AdmissionAgendaSettings = require('../models/admissionAgendaSettings.model');

const SLOT_DURATION_MINUTES = 30;
const RANGE_START_MINUTES = 6 * 60;
const RANGE_END_MINUTES = 20 * 60;
const LEGACY_WINDOWS = [
  { start: '09:00', end: '11:00' },
  { start: '14:00', end: '16:00' },
];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function timeToMinutes(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time || '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  return (hour * 60) + minute;
}

function minutesToTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function formatTimeLabel(time) {
  const minutes = timeToMinutes(time);
  if (minutes === null) return time;
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? 'p. m.' : 'a. m.';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${pad2(minute)} ${suffix}`;
}

function buildSlotsForWindow(start, end, durationMinutes = SLOT_DURATION_MINUTES) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === null || endMinutes === null || endMinutes - startMinutes < durationMinutes) return [];
  const slots = [];
  for (let cursor = startMinutes; cursor + durationMinutes <= endMinutes; cursor += durationMinutes) {
    slots.push(minutesToTime(cursor));
  }
  return slots;
}

function resolveWindows(settings) {
  if (settings?.usesCustomRange) {
    return [{ start: settings.availableFrom, end: settings.availableTo }];
  }
  return LEGACY_WINDOWS.map((window) => ({ ...window }));
}

function resolveSlotTimes(settings) {
  const seen = new Set();
  const times = [];
  resolveWindows(settings).forEach((window) => {
    buildSlotsForWindow(window.start, window.end).forEach((time) => {
      if (seen.has(time)) return;
      seen.add(time);
      times.push(time);
    });
  });
  return times;
}

function isSlotBlocked(settings, dateKey, time) {
  return (Array.isArray(settings?.blocks) ? settings.blocks : []).some((block) => {
    if (String(block?.time || '') !== String(time || '')) return false;
    if (block.scope === 'weekday') return true;
    return block.scope === 'date' && String(block.date || '') === String(dateKey || '');
  });
}

function describeWindows(windows) {
  return (Array.isArray(windows) ? windows : [])
    .map((window) => `${formatTimeLabel(window.start)} – ${formatTimeLabel(window.end)}`)
    .join(' y ');
}

function serializeAgendaSettings(settings) {
  const source = settings || {};
  const windows = resolveWindows(source);
  const slotTimes = resolveSlotTimes(source);
  const blocks = (Array.isArray(source.blocks) ? source.blocks : []).map((block) => ({
    id: String(block._id || block.id || ''),
    scope: block.scope,
    date: block.date || '',
    time: block.time,
    label: formatTimeLabel(block.time),
  }));

  return {
    usesCustomRange: Boolean(source.usesCustomRange),
    availableFrom: source.usesCustomRange ? source.availableFrom : '09:00',
    availableTo: source.usesCustomRange ? source.availableTo : '16:00',
    slotDurationMinutes: SLOT_DURATION_MINUTES,
    windows,
    slotTimes,
    publishedLabel: describeWindows(windows),
    blocks,
  };
}

function assertValidRange(availableFrom, availableTo) {
  const start = timeToMinutes(availableFrom);
  const end = timeToMinutes(availableTo);
  if (start === null || end === null || start % SLOT_DURATION_MINUTES !== 0 || end % SLOT_DURATION_MINUTES !== 0) {
    const error = new Error('Elige horas en intervalos de 30 minutos.');
    error.statusCode = 400;
    throw error;
  }
  if (start < RANGE_START_MINUTES || end > RANGE_END_MINUTES) {
    const error = new Error('El horario debe estar entre las 6:00 a. m. y las 8:00 p. m.');
    error.statusCode = 400;
    throw error;
  }
  if (end - start < SLOT_DURATION_MINUTES) {
    const error = new Error('El rango debe cubrir al menos 30 minutos.');
    error.statusCode = 400;
    throw error;
  }
  return {
    availableFrom: minutesToTime(start),
    availableTo: minutesToTime(end),
  };
}

async function findAgendaSettings(schoolId) {
  return AdmissionAgendaSettings.findOne({ schoolId });
}

async function getAgendaSettings(schoolId) {
  const settings = await findAgendaSettings(schoolId);
  return serializeAgendaSettings(settings);
}

async function saveAgendaRange(schoolId, { availableFrom, availableTo } = {}) {
  const range = assertValidRange(availableFrom, availableTo);
  const nextSlotTimes = new Set(buildSlotsForWindow(range.availableFrom, range.availableTo));
  let settings = await findAgendaSettings(schoolId);
  if (!settings) {
    settings = new AdmissionAgendaSettings({ schoolId });
  }
  settings.usesCustomRange = true;
  settings.availableFrom = range.availableFrom;
  settings.availableTo = range.availableTo;
  settings.blocks = (settings.blocks || []).filter((block) => nextSlotTimes.has(block.time));
  settings.markModified('blocks');
  await settings.save();
  return serializeAgendaSettings(settings);
}

function assertBlockPayload(settings, { scope, date, time } = {}) {
  const normalizedScope = scope === 'weekday' ? 'weekday' : scope === 'date' ? 'date' : '';
  const minutes = timeToMinutes(time);
  const normalizedTime = minutes === null ? '' : minutesToTime(minutes);
  const slotTimes = resolveSlotTimes(settings);
  if (!normalizedScope) {
    const error = new Error('Indica si el bloqueo es de un día o de todos los días.');
    error.statusCode = 400;
    throw error;
  }
  if (!slotTimes.includes(normalizedTime)) {
    const error = new Error('Esa hora no está dentro del horario disponible.');
    error.statusCode = 400;
    throw error;
  }
  const normalizedDate = String(date || '').trim();
  if (normalizedScope === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    const error = new Error('Elige el día que quieres bloquear.');
    error.statusCode = 400;
    throw error;
  }
  return {
    scope: normalizedScope,
    date: normalizedScope === 'date' ? normalizedDate : '',
    time: normalizedTime,
  };
}

async function addAgendaBlock(schoolId, payload, createdByName = '') {
  let settings = await findAgendaSettings(schoolId);
  if (!settings) {
    settings = new AdmissionAgendaSettings({ schoolId });
    await settings.save();
  }
  const block = assertBlockPayload(settings, payload);
  const exists = (settings.blocks || []).some((item) => (
    item.scope === block.scope && item.time === block.time && (item.date || '') === block.date
  ));
  if (!exists) {
    settings.blocks.push({
      ...block,
      createdByName: String(createdByName || '').trim(),
    });
    await settings.save();
  }
  return serializeAgendaSettings(settings);
}

async function removeAgendaBlock(schoolId, blockId) {
  const settings = await findAgendaSettings(schoolId);
  if (!settings) return serializeAgendaSettings(null);
  const targetId = String(blockId || '');
  settings.blocks = (settings.blocks || []).filter((block) => String(block._id) !== targetId);
  settings.markModified('blocks');
  await settings.save();
  return serializeAgendaSettings(settings);
}

module.exports = {
  SLOT_DURATION_MINUTES,
  LEGACY_WINDOWS,
  timeToMinutes,
  formatTimeLabel,
  resolveWindows,
  resolveSlotTimes,
  isSlotBlocked,
  serializeAgendaSettings,
  getAgendaSettings,
  saveAgendaRange,
  addAgendaBlock,
  removeAgendaBlock,
};
