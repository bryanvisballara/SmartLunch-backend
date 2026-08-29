function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseGradeNumber(grade) {
  const match = String(grade || '').trim().match(/(\d{1,2})/);
  if (!match) {
    return null;
  }
  const number = Number(match[1]);
  return Number.isInteger(number) ? number : null;
}

function inferCafeteriaLevelFromGrade(grade) {
  const number = parseGradeNumber(grade);
  if (number != null && number >= 6 && number <= 13) {
    return 'secundaria';
  }
  if (number != null && number >= 1 && number <= 5) {
    return 'primaria';
  }
  return 'primaria';
}

function resolveCafeteriaLevel({ grade = '', cafeteriaLevel = '' } = {}) {
  const explicit = String(cafeteriaLevel || '').trim().toLowerCase();
  if (explicit === 'primaria' || explicit === 'secundaria') {
    return explicit;
  }
  return inferCafeteriaLevelFromGrade(grade);
}

function cafeteriaLevelLabel(level) {
  return level === 'secundaria' ? 'Secundaria' : 'Primaria';
}

function scoreStoreForLevel(store, level) {
  const name = normalizeText(store?.name);
  if (!name) {
    return 0;
  }

  if (level === 'secundaria') {
    if (name === 'teachme secundaria') return 100;
    if (name.includes('teachme') && name.includes('secundaria')) return 90;
    if (name.includes('secundaria') && !name.includes('primaria')) return 70;
    return 0;
  }

  if (name === 'teachme primaria') return 100;
  if (name.includes('teachme') && name.includes('primaria')) return 90;
  if (name.includes('primaria') && !name.includes('secundaria')) return 70;
  return 0;
}

function pickCafeteriaStore(stores, level) {
  const active = (Array.isArray(stores) ? stores : []).filter((store) => (
    store
    && !store.deletedAt
    && String(store.status || 'active') !== 'inactive'
  ));

  let best = null;
  let bestScore = 0;
  for (const store of active) {
    const score = scoreStoreForLevel(store, level);
    if (score > bestScore) {
      best = store;
      bestScore = score;
    }
  }

  if (best) {
    return best;
  }

  if (active.length === 1) {
    return active[0];
  }

  return null;
}

const CAFETERIA_GRADE_OPTIONS = [
  { value: '1', label: '1 · Primaria', level: 'primaria' },
  { value: '2', label: '2 · Primaria', level: 'primaria' },
  { value: '3', label: '3 · Primaria', level: 'primaria' },
  { value: '4', label: '4 · Primaria', level: 'primaria' },
  { value: '5', label: '5 · Primaria', level: 'primaria' },
  { value: '6', label: '6 · Secundaria', level: 'secundaria' },
  { value: '7', label: '7 · Secundaria', level: 'secundaria' },
  { value: '8', label: '8 · Secundaria', level: 'secundaria' },
  { value: '9', label: '9 · Secundaria', level: 'secundaria' },
  { value: '10', label: '10 · Secundaria', level: 'secundaria' },
  { value: '11', label: '11 · Secundaria', level: 'secundaria' },
];

module.exports = {
  CAFETERIA_GRADE_OPTIONS,
  cafeteriaLevelLabel,
  inferCafeteriaLevelFromGrade,
  parseGradeNumber,
  pickCafeteriaStore,
  resolveCafeteriaLevel,
};
