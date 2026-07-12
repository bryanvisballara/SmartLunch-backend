export const RECTORIA_CONTROL_CENTER_KEYS = [
  'control_levels',
  'control_subjects',
  'control_students',
  'control_teachers',
  'control_wellbeing',
  'control_nursing',
  'control_coexistence',
  'control_community_reports',
];

export const RECTORIA_PORTAL_NAV = [
  { type: 'item', key: 'overview', label: 'Resumen institucional' },
  {
    type: 'group',
    key: 'control_center',
    label: 'Centro de control',
    items: [
      { key: 'control_levels', label: 'Niveles académicos' },
      { key: 'control_subjects', label: 'Asignaturas' },
      { key: 'control_students', label: 'Alumnos' },
      { key: 'control_teachers', label: 'Docentes' },
      { key: 'control_wellbeing', label: 'Bienestar' },
      { key: 'control_nursing', label: 'Enfermería' },
      { key: 'control_coexistence', label: 'Convivencia' },
      { key: 'control_community_reports', label: 'Te escuchamos' },
    ],
  },
  {
    type: 'group',
    key: 'institutional_config',
    label: 'Configuración institucional',
    items: [
      { key: 'team', label: 'Cuerpo académico' },
      { key: 'students', label: 'Gestión académica' },
      { key: 'fees', label: 'Costos' },
    ],
  },
  {
    type: 'group',
    key: 'administrative',
    label: 'Gestión administrativa',
    items: [
      { key: 'admissions', label: 'Admisiones' },
      { key: 'resources', label: 'Recursos y compras' },
      { key: 'database', label: 'Base de datos' },
      { key: 'billing', label: 'Cartera' },
      { key: 'enrollment_matricula', label: 'Matrículas digitales' },
      { key: 'matricula_authorizations', label: 'Solicitudes' },
    ],
  },
];

export function flattenRectoriaNavKeys(nav = RECTORIA_PORTAL_NAV) {
  return nav.flatMap((entry) => {
    if (entry.type === 'item') {
      return [entry.key];
    }
    return (entry.items || []).map((item) => item.key);
  });
}

export function findRectoriaNavGroupForSection(sectionKey, nav = RECTORIA_PORTAL_NAV) {
  return nav.find((entry) => entry.type === 'group' && (entry.items || []).some((item) => item.key === sectionKey))?.key || '';
}
