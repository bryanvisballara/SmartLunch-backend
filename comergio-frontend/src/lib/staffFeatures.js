export const STAFF_FEATURE_OPTIONS = [
  { key: 'purchasing', label: 'Compras' },
  { key: 'billing', label: 'Cartera' },
  { key: 'academicSecretary', label: 'Secretaría académica' },
  { key: 'nursing', label: 'Enfermería' },
  { key: 'coexistence', label: 'Convivencia' },
  { key: 'psychology', label: 'Psicología' },
  { key: 'teaching', label: 'Docencia' },
  { key: 'coordination', label: 'Coordinación' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'rectoria', label: 'Rectoría' },
];

export const DEFAULT_STAFF_FEATURES = STAFF_FEATURE_OPTIONS.reduce((features, item) => {
  features[item.key] = true;
  return features;
}, {});

const STAFF_NAV_FEATURE_BY_KEY = {
  resources: 'purchasing',
  billing: 'billing',
  control_nursing: 'nursing',
  control_coexistence: 'coexistence',
  control_wellbeing: 'psychology',
};

const TEACHER_SECTION_FEATURE_BY_KEY = {
  school_coexistence: 'coexistence',
  resource_requests: 'purchasing',
};

export function normalizeStaffFeatures(rawFeatures = {}) {
  return STAFF_FEATURE_OPTIONS.reduce((features, item) => {
    features[item.key] = rawFeatures[item.key] === undefined ? true : Boolean(rawFeatures[item.key]);
    return features;
  }, {});
}

export function getStaffFeaturesFromUser(user = null) {
  return normalizeStaffFeatures(user?.staffFeatures || {});
}

export function isStaffFeatureEnabled(userOrFeatures, featureKey) {
  if (!featureKey) {
    return true;
  }
  const features = userOrFeatures?.staffFeatures !== undefined || userOrFeatures?.role
    ? getStaffFeaturesFromUser(userOrFeatures)
    : normalizeStaffFeatures(userOrFeatures || {});
  return features[featureKey] !== false;
}

export function filterStaffPortalNav(nav = [], userOrFeatures) {
  const features = userOrFeatures?.staffFeatures !== undefined || userOrFeatures?.role
    ? getStaffFeaturesFromUser(userOrFeatures)
    : normalizeStaffFeatures(userOrFeatures || {});

  return nav
    .map((entry) => {
      if (entry.type === 'item') {
        const featureKey = STAFF_NAV_FEATURE_BY_KEY[entry.key];
        if (featureKey && features[featureKey] === false) {
          return null;
        }
        return entry;
      }

      const items = (entry.items || []).filter((item) => {
        const featureKey = STAFF_NAV_FEATURE_BY_KEY[item.key];
        return !featureKey || features[featureKey] !== false;
      });

      if (!items.length) {
        return null;
      }

      return { ...entry, items };
    })
    .filter(Boolean);
}

export function isTeacherSectionEnabled(sectionKey, userOrFeatures) {
  const featureKey = TEACHER_SECTION_FEATURE_BY_KEY[sectionKey];
  if (!featureKey) {
    return true;
  }
  return isStaffFeatureEnabled(userOrFeatures, featureKey);
}

export function getStaffFeatureLabel(featureKey) {
  return STAFF_FEATURE_OPTIONS.find((item) => item.key === featureKey)?.label || 'este módulo';
}
