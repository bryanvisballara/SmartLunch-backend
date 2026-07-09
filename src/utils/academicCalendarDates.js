const ACADEMIC_TIME_ZONE = 'America/Bogota';

function normalizeText(value) {
  return String(value || '').trim();
}

function parseAcademicCalendarDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const isoDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoDateMatch) {
    return new Date(Date.UTC(Number(isoDateMatch[1]), Number(isoDateMatch[2]) - 1, Number(isoDateMatch[3])));
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function getStoredAcademicCalendarParts(value) {
  const parsed = parseAcademicCalendarDate(value);
  if (!parsed) {
    return null;
  }

  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  };
}

function getLiveAcademicCalendarParts(value, timeZone = ACADEMIC_TIME_ZONE) {
  const reference = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(reference.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(reference);

  const year = Number(parts.find((part) => part.type === 'year')?.value || 0);
  const month = Number(parts.find((part) => part.type === 'month')?.value || 0);
  const day = Number(parts.find((part) => part.type === 'day')?.value || 0);

  if (!year || !month || !day) {
    return null;
  }

  return { year, month, day };
}

function buildAcademicCalendarDayKey(parts) {
  if (!parts) {
    return '';
  }

  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function getAcademicCalendarDayKey(value, timeZone = ACADEMIC_TIME_ZONE) {
  return buildAcademicCalendarDayKey(getStoredAcademicCalendarParts(value) || getLiveAcademicCalendarParts(value, timeZone));
}

function isAcademicCalendarDateWithinRange(referenceValue, startValue, endValue, timeZone = ACADEMIC_TIME_ZONE) {
  const referenceKey = buildAcademicCalendarDayKey(getLiveAcademicCalendarParts(referenceValue, timeZone));
  const startKey = buildAcademicCalendarDayKey(getStoredAcademicCalendarParts(startValue));
  const endKey = buildAcademicCalendarDayKey(getStoredAcademicCalendarParts(endValue));

  if (!referenceKey || !startKey || !endKey) {
    return false;
  }

  return referenceKey >= startKey && referenceKey <= endKey;
}

function getAcademicBenefitDayOfMonth(referenceDate = new Date(), timeZone = ACADEMIC_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    day: 'numeric',
  }).formatToParts(referenceDate);

  return Number(parts.find((part) => part.type === 'day')?.value || new Date(referenceDate).getDate());
}

function formatAcademicCalendarDateEs(value, { month = 'short' } = {}) {
  const parsed = parseAcademicCalendarDate(value);
  if (!parsed) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month,
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatAcademicCalendarDateLongEs(value) {
  return formatAcademicCalendarDateEs(value, { month: 'long' });
}

function normalizeAcademicDueDateForBogota(value) {
  const parsed = parseAcademicCalendarDate(value);
  if (!parsed) {
    return null;
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 5, 0, 0, 0));
}

module.exports = {
  ACADEMIC_TIME_ZONE,
  formatAcademicCalendarDateEs,
  formatAcademicCalendarDateLongEs,
  getAcademicBenefitDayOfMonth,
  getAcademicCalendarDayKey,
  isAcademicCalendarDateWithinRange,
  normalizeAcademicDueDateForBogota,
  parseAcademicCalendarDate,
};
