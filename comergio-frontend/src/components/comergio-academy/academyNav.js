export const COMERGIO_ACADEMY_CHILDREN = [
  {
    key: 'video_tutoriales',
    label: 'Video tutoriales',
    description: 'Aprende a usar el portal con guías en video.',
    tone: 'video',
  },
  {
    key: 'conecta',
    label: 'Conecta',
    description: 'Casos reales entre el equipo de todos los colegios Comergio.',
    tone: 'conecta',
  },
  {
    key: 'informa',
    label: 'Comergio Informa',
    description: 'Novedades, tips y comunicados de Gerencia Comergio para todo el equipo.',
    tone: 'informa',
  },
];

export const COMERGIO_ACADEMY_PARENT = {
  key: 'comergio_academy',
  label: 'Comergio Academy',
  description: 'Capacitación, comunidad e información para sacar el máximo a Comergio.',
  tone: 'academy',
};

export const COMERGIO_ACADEMY_SECTION_KEYS = [
  COMERGIO_ACADEMY_PARENT.key,
  ...COMERGIO_ACADEMY_CHILDREN.map((child) => child.key),
];

export const COMERGIO_ACADEMY_NAV_GROUP = {
  type: 'group',
  key: 'comergio_academy_group',
  label: 'Comergio Academy',
  tone: 'academy',
  items: COMERGIO_ACADEMY_CHILDREN.map(({ key, label, tone }) => ({ key, label, tone })),
};

export function isComergioAcademySection(sectionKey = '') {
  return COMERGIO_ACADEMY_SECTION_KEYS.includes(String(sectionKey || ''));
}

export function getComergioAcademyChildTone(sectionKey = '') {
  return COMERGIO_ACADEMY_CHILDREN.find((child) => child.key === sectionKey)?.tone || '';
}
