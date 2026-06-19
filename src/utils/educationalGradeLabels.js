function normalizeEducationalGradeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

function formatEducationalGradeLabel(value) {
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

function humanizeGradeToken(value) {
  const token = String(value || '').trim();
  if (!token || token.includes(':')) {
    return '';
  }

  return token
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
}

function formatStudentGradeFallback(student = {}) {
  const grade = String(student.grade || '').trim();
  const course = String(student.course || '').trim();

  for (const candidate of [course, grade]) {
    const formatted = formatEducationalGradeLabel(candidate);
    if (formatted) {
      return formatted;
    }
  }

  return humanizeGradeToken(course) || humanizeGradeToken(grade) || grade || course || 'Sin grado';
}

module.exports = {
  formatEducationalGradeLabel,
  formatStudentGradeFallback,
  humanizeGradeToken,
};
