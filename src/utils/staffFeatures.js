const DEFAULT_STAFF_FEATURES = {
  purchasing: true,
  billing: true,
  academicSecretary: true,
  nursing: true,
  coexistence: true,
  psychology: true,
  teaching: true,
  coordination: true,
  direccion: true,
  rectoria: true,
};

const STAFF_FEATURE_KEYS = Object.keys(DEFAULT_STAFF_FEATURES);

function normalizeStaffFeatures(rawFeatures = {}) {
  return STAFF_FEATURE_KEYS.reduce((features, key) => {
    features[key] = rawFeatures[key] === undefined ? DEFAULT_STAFF_FEATURES[key] : Boolean(rawFeatures[key]);
    return features;
  }, {});
}

function isStaffFeatureEnabled(rawFeatures, featureKey) {
  if (!featureKey || !DEFAULT_STAFF_FEATURES[featureKey]) {
    return true;
  }
  return normalizeStaffFeatures(rawFeatures)[featureKey] !== false;
}

module.exports = {
  DEFAULT_STAFF_FEATURES,
  STAFF_FEATURE_KEYS,
  normalizeStaffFeatures,
  isStaffFeatureEnabled,
};
