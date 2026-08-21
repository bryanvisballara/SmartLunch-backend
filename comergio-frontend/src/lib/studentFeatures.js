export const STUDENT_FEATURE_OPTIONS = [
  { key: 'home', label: 'Inicio' },
  { key: 'finance', label: 'Cartera' },
  { key: 'academic', label: 'Académico' },
  { key: 'cafeteria', label: 'Comida' },
  { key: 'games', label: 'Juegos' },
  { key: 'nursing', label: 'Enfermería' },
  { key: 'wellbeing', label: 'Bienestar' },
  { key: 'coexistence', label: 'Convivencia' },
  { key: 'transport', label: 'Ruta escolar' },
];

export const DEFAULT_STUDENT_FEATURES = {
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

export function normalizeStudentFeatures(rawFeatures = {}) {
  return STUDENT_FEATURE_OPTIONS.reduce((features, item) => {
    const fallback = Boolean(DEFAULT_STUDENT_FEATURES[item.key]);
    features[item.key] = rawFeatures[item.key] === undefined ? fallback : Boolean(rawFeatures[item.key]);
    return features;
  }, {});
}
