export const SCHOOL_OPTIONS = [
  {
    id: 'comergio_demo_kns8p',
    label: 'Comergio Demo',
    country: 'CO',
  },
  {
    id: 'International Berckley School',
    label: 'International Berckley School',
    country: 'CO',
  },
  {
    id: 'Millennium School',
    label: 'Millennium School',
    country: 'CO',
  },
];

export const DEFAULT_SCHOOL_ID = 'comergio_demo_kns8p';
export const DEFAULT_SCHOOL_COUNTRY = 'CO';
const KNOWN_SCHOOL_OPTIONS_STORAGE_KEY = 'knownSchoolOptions';

const MILLENNIUM_SCHOOL_ID = 'Millennium School';

const STORED_SCHOOL_ID_ALIASES = {
  'comergio-demo': DEFAULT_SCHOOL_ID,
  comergio_demo: DEFAULT_SCHOOL_ID,
  discovery_t3a0h: MILLENNIUM_SCHOOL_ID,
  'millennium school': MILLENNIUM_SCHOOL_ID,
  millennium: MILLENNIUM_SCHOOL_ID,
};

export function resolveStoredSchoolId(storedSchoolId = '', options = SCHOOL_OPTIONS) {
  const normalizedOptions = normalizeSchoolOptions(options);
  const rawStoredId = String(storedSchoolId || '').trim();

  if (!rawStoredId) {
    return normalizedOptions.some((school) => school.id === DEFAULT_SCHOOL_ID)
      ? DEFAULT_SCHOOL_ID
      : (normalizedOptions[0]?.id || '');
  }

  const aliasTarget = STORED_SCHOOL_ID_ALIASES[rawStoredId.toLowerCase()];
  if (aliasTarget && normalizedOptions.some((school) => school.id === aliasTarget)) {
    return aliasTarget;
  }

  if (normalizedOptions.some((school) => school.id === rawStoredId)) {
    return rawStoredId;
  }

  const storedLabelKey = normalizeSchoolLabelKey(rawStoredId);
  const labelMatch = normalizedOptions.find((school) => (
    normalizeSchoolLabelKey(school.label) === storedLabelKey
    || normalizeSchoolLabelKey(school.id) === storedLabelKey
  ));
  if (labelMatch?.id) {
    return labelMatch.id;
  }

  return normalizedOptions.some((school) => school.id === DEFAULT_SCHOOL_ID)
    ? DEFAULT_SCHOOL_ID
    : (normalizedOptions[0]?.id || '');
}

function humanizeSchoolId(value) {
  const normalizedValue = String(value || '')
    .trim()
    .replace(/[_-][a-z0-9]{5}$/i, '')
    .replace(/[_-]+/g, ' ');

  return normalizedValue.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
export function getSchoolDisplayName(userOrSchool = {}, fallback = 'Colegio') {
  const rawName = String(userOrSchool?.schoolName || userOrSchool?.label || '').trim();
  const rawId = String(userOrSchool?.schoolId || userOrSchool?.id || userOrSchool || '').trim();
  if (rawName && rawName !== rawId) {
    return rawName;
  }

  return humanizeSchoolId(rawId || fallback) || fallback;
}

function normalizeSchoolLabelKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeSchoolOptions(...sources) {
  const optionsById = new Map();
  const optionIdsByLabel = new Map();

  sources.flat().forEach((school) => {
    const id = String(school?.id || school?.schoolId || '').trim();
    const rawLabel = String(school?.label || school?.schoolName || id).trim();
    const label = rawLabel && rawLabel !== id ? rawLabel : humanizeSchoolId(id);
    const country = String(school?.country || school?.countryCode || school?.schoolCountry || DEFAULT_SCHOOL_COUNTRY)
      .trim()
      .toUpperCase() || DEFAULT_SCHOOL_COUNTRY;

    if (!id) {
      return;
    }

    const labelKey = normalizeSchoolLabelKey(label || id);
    const existingOptionId = optionIdsByLabel.get(labelKey);

    if (existingOptionId && existingOptionId !== id) {
      return;
    }

    optionIdsByLabel.set(labelKey, id);
    optionsById.set(id, {
      id,
      label: label || id,
      country,
    });
  });

  return Array.from(optionsById.values()).sort((left, right) => (
    String(left.label || left.id).localeCompare(String(right.label || right.id), 'es', { sensitivity: 'base' })
  ));
}

export function getSchoolOptionsByCountry(options, countryId = DEFAULT_SCHOOL_COUNTRY) {
  const normalizedCountryId = String(countryId || DEFAULT_SCHOOL_COUNTRY).trim().toUpperCase();
  return normalizeSchoolOptions(options).filter((school) => school.country === normalizedCountryId);
}

export function readKnownSchoolOptions() {
  try {
    const parsedOptions = JSON.parse(localStorage.getItem(KNOWN_SCHOOL_OPTIONS_STORAGE_KEY) || '[]');
    return Array.isArray(parsedOptions) ? normalizeSchoolOptions(parsedOptions) : [];
  } catch {
    return [];
  }
}

export function rememberSchoolOptions(...sources) {
  const nextOptions = normalizeSchoolOptions(sources.flat());
  localStorage.setItem(KNOWN_SCHOOL_OPTIONS_STORAGE_KEY, JSON.stringify(nextOptions));
  return nextOptions;
}
