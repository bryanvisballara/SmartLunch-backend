const PORTAL_BOOT_SPLASH_CONTENT = {
  rectoria: {
    ariaLabel: 'Cargando portal de rectoría',
    eyebrow: 'Portal de rectoría',
    title: 'Preparando tu tablero institucional',
    message: 'Estamos consolidando cartera, estudiantes, niveles académicos y calificaciones para mostrarte el resumen completo.',
  },
  direccion: {
    ariaLabel: 'Cargando portal de dirección',
    eyebrow: 'Portal de dirección',
    title: 'Preparando la vista ejecutiva',
    message: 'Consolidamos indicadores, equipos y seguimiento académico para apoyar la gestión institucional.',
  },
  coordinacion: {
    ariaLabel: 'Cargando portal de coordinación',
    eyebrow: 'Portal de coordinación',
    title: 'Preparando el tablero de tu nivel',
    message: 'Revisamos grados, docentes, horarios y alertas del nivel asignado para que tengas el contexto listo.',
  },
  secretaria: {
    ariaLabel: 'Cargando portal de secretaría académica',
    eyebrow: 'Secretaría académica',
    title: 'Organizando tu espacio de trabajo',
    message: 'Cargamos matrículas, comunicados, calendario y aprobaciones para que gestiones el día a día del colegio.',
  },
  cartera: {
    ariaLabel: 'Cargando portal de cartera',
    eyebrow: 'Portal cartera',
    title: 'Preparando el seguimiento financiero',
    message: 'Consultamos obligaciones, pagos y cuentas de las familias para mostrarte el estado actualizado.',
  },
  enfermeria: {
    ariaLabel: 'Cargando portal de enfermería',
    eyebrow: 'Portal de enfermería',
    title: 'Preparando atención estudiantil',
    message: 'Dejamos listos los datos de alumnos, fichas médicas e historial para registrar cada atención con contexto.',
  },
  psicologia: {
    ariaLabel: 'Cargando portal de psicología',
    eyebrow: 'Portal de psicología',
    title: 'Preparando seguimiento de bienestar',
    message: 'Organizamos casos, observaciones y perfiles estudiantiles para apoyar el acompañamiento emocional.',
  },
  'recursos-humanos': {
    ariaLabel: 'Cargando portal de recursos y compras',
    eyebrow: 'Recursos y compras',
    title: 'Preparando inventario y solicitudes',
    message: 'Revisamos materiales, planners y trazabilidad de pedidos para que continúes con la operación al día.',
  },
  'super-admin': {
    ariaLabel: 'Cargando portal de super administración',
    eyebrow: 'Super administración',
    title: 'Preparando la red de colegios',
    message: 'Consolidamos colegios, suscripciones y métricas globales de la plataforma.',
  },
  embedded: {
    ariaLabel: 'Cargando información',
    eyebrow: 'Comergio',
    title: 'Cargando información',
    message: 'Estamos consultando los datos necesarios para continuar.',
  },
  default: {
    ariaLabel: 'Cargando portal',
    eyebrow: 'Comergio',
    title: 'Preparando tu portal',
    message: 'Estamos organizando la información para que puedas continuar en unos segundos.',
  },
};

export function getPortalBootSplashContent(portalKey = 'default', overrides = {}) {
  const base = PORTAL_BOOT_SPLASH_CONTENT[portalKey] || PORTAL_BOOT_SPLASH_CONTENT.default;
  return { ...base, ...overrides };
}
