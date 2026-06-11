export const SCHOOL_OPTIONS = [
  {
    id: 'discovery_t355i',
    label: 'Discovery',
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

export const DEFAULT_SCHOOL_ID = SCHOOL_OPTIONS[0]?.id || '';
export const DEFAULT_SCHOOL_COUNTRY = 'CO';
const KNOWN_SCHOOL_OPTIONS_STORAGE_KEY = 'knownSchoolOptions';

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
