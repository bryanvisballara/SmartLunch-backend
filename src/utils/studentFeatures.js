const DEFAULT_STUDENT_FEATURES = {
  home: true,
  finance: false,
  academic: true,
  cafeteria: true,
  games: true,
  nursing: true,
  wellbeing: true,
  coexistence: true,
  transport: true,
};

const STUDENT_FEATURE_KEYS = Object.keys(DEFAULT_STUDENT_FEATURES);

function normalizeStudentFeatures(rawFeatures = {}) {
  return STUDENT_FEATURE_KEYS.reduce((features, key) => {
    features[key] = rawFeatures[key] === undefined ? DEFAULT_STUDENT_FEATURES[key] : Boolean(rawFeatures[key]);
    return features;
  }, {});
}

module.exports = {
  DEFAULT_STUDENT_FEATURES,
  STUDENT_FEATURE_KEYS,
  normalizeStudentFeatures,
};
