import { COMERGIO_ACADEMY_NAV_GROUP } from '../comergio-academy/academyNav';

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

export const RECTORIA_CONTROL_CENTER_NAV_GROUP = {
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
};

export const COORDINATION_PORTAL_NAV = [
  { type: 'item', key: 'overview', label: 'Tablero de nivel' },
  RECTORIA_CONTROL_CENTER_NAV_GROUP,
  {
    type: 'group',
    key: 'institutional_config',
    label: 'Configuración institucional',
    items: [
      { key: 'students', label: 'Gestión académica' },
    ],
  },
  { type: 'item', key: 'communications', label: 'Comunicados a familias' },
  { type: 'item', key: 'staff_announcements', label: 'Comunicados internos' },
  { type: 'item', key: 'resources', label: 'Recursos y compras' },
  { type: 'item', key: 'schedule', label: 'Horario académico' },
  COMERGIO_ACADEMY_NAV_GROUP,
];

export const RECTORIA_PORTAL_NAV = [
  { type: 'item', key: 'overview', label: 'Resumen institucional' },
  { type: 'item', key: 'staff_announcements', label: 'Comunicados internos' },
  RECTORIA_CONTROL_CENTER_NAV_GROUP,
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
  COMERGIO_ACADEMY_NAV_GROUP,
];

/** Dirección = mismo menú de rectoría, sin Costos ni módulos de cartera/matrícula. */
export const DIRECCION_PORTAL_NAV = RECTORIA_PORTAL_NAV.map((entry) => {
  if (entry.type !== 'group') {
    return entry;
  }
  if (entry.key === 'institutional_config') {
    return {
      ...entry,
      items: (entry.items || []).filter((item) => item.key !== 'fees'),
    };
  }
  if (entry.key === 'administrative') {
    return {
      ...entry,
      items: (entry.items || []).filter((item) => (
        item.key !== 'billing'
        && item.key !== 'enrollment_matricula'
        && item.key !== 'matricula_authorizations'
      )),
    };
  }
  return entry;
});

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
