function normalizeEducationalGradeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

export function formatEducationalGradeLabel(value) {
  const normalized = normalizeEducationalGradeText(value);
  if (!normalized) {
    return '';
  }

  const kinderMatch = normalized.match(/^kinder(?:\s+(\d{1,2}))?$/);
  if (kinderMatch) {
    return kinderMatch[1] ? `Kinder ${kinderMatch[1]}` : 'Kinder';
  }

  if (normalized === 'maternal') {
    return 'Maternal';
  }

  if (normalized === 'prep') {
    return 'Prep';
  }

  if (normalized.startsWith('prejardin')) {
    const number = normalized.match(/(\d{1,2})/)?.[1];
    return number ? `Prejardín ${number}` : 'Prejardín';
  }

  if (normalized.startsWith('jardin')) {
    const number = normalized.match(/(\d{1,2})/)?.[1];
    return number ? `Jardín ${number}` : 'Jardín';
  }

  if (normalized.startsWith('transicion')) {
    return 'Transición';
  }

  if (normalized === 'toddlers' || normalized === 'toodlers') {
    return 'Toodlers';
  }

  if (normalized === 'infants' || normalized === 'infant') {
    return 'Infant';
  }

  if (normalized === 'k grade' || normalized === 'kgrade' || normalized === 'k-grade') {
    return 'K-grade';
  }

  return '';
}

export function resolveEducationalGradeLabel(course = {}) {
  const candidates = [
    course?.studentGradeKey,
    course?.gradeLevel,
    course?.section,
    course?.title,
  ];

  for (const candidate of candidates) {
    const formatted = formatEducationalGradeLabel(candidate);
    if (formatted) {
      return formatted;
    }
  }

  return '';
}

export function isEducationalGradeLabel(value) {
  return Boolean(formatEducationalGradeLabel(value));
}

export function isRawInternalGradeToken(value) {
  const token = String(value || '').trim();
  if (!token || /\s/.test(token)) {
    return false;
  }

  if (/^[a-z0-9]+:[a-z0-9]+(?::.+)?$/i.test(token)) {
    return true;
  }

  if (/^[a-z]+_\d+$/i.test(token)) {
    return true;
  }

  return token === token.toUpperCase() && token.includes('_');
}
