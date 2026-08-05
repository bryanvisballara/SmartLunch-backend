/** Staff portals with Academy video tutorials (excludes parent + student). */
export const ACADEMY_TUTORIAL_PORTALS = [
  { key: 'teacher', label: 'Portal docente', tone: 'teacher', icon: 'grad' },
  { key: 'rectoria', label: 'Rectoría', tone: 'rectoria', icon: 'building' },
  { key: 'direccion', label: 'Dirección', tone: 'direccion', icon: 'people' },
  { key: 'coordinacion', label: 'Coordinación', tone: 'coordinacion', icon: 'team' },
  { key: 'academic_secretary', label: 'Secretaría académica', tone: 'secretary', icon: 'folder' },
  { key: 'admissions', label: 'Admisiones', tone: 'admissions', icon: 'person' },
  { key: 'cartera', label: 'Cartera', tone: 'cartera', icon: 'wallet' },
  { key: 'cafeteria', label: 'Cafetería', tone: 'cafeteria', icon: 'food' },
  { key: 'ruta_escolar', label: 'Ruta escolar', tone: 'ruta', icon: 'bus' },
  { key: 'enfermeria', label: 'Enfermería', tone: 'enfermeria', icon: 'cross' },
  { key: 'psicologia', label: 'Psicología', tone: 'psicologia', icon: 'brain' },
  { key: 'recursos_humanos', label: 'Recursos humanos', tone: 'hr', icon: 'people' },
];

/**
 * Cloudinary-hosted tutorial videos per portal.
 * URLs are filled after upload (folder: comergio/academy/<portalKey>).
 */
export const ACADEMY_TUTORIAL_VIDEOS = {
  teacher: [
    {
      id: 'teacher-1',
      title: 'Inicio, horario, cursos',
      description: 'Tutorial del portal docente: inicio, horario y cursos.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785896024/smartlunch/academy/teacher/docente-1.mov',
      publicId: 'smartlunch/academy/teacher/docente-1',
      duration: 190.633333,
      durationLabel: '3:11',
    },
    {
      id: 'teacher-2',
      title: 'Gestión académica',
      description: 'Tutorial del portal docente: gestión académica.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785896030/smartlunch/academy/teacher/docente-2.mov',
      publicId: 'smartlunch/academy/teacher/docente-2',
      duration: 397.733333,
      durationLabel: '6:38',
    },
    {
      id: 'teacher-3',
      title: 'Contenido académico hasta publicaciones',
      description: 'Tutorial del portal docente: contenido académico, convivencia, feed de familias y publicaciones.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785896035/smartlunch/academy/teacher/docente-3.mov',
      publicId: 'smartlunch/academy/teacher/docente-3',
      duration: 202.2,
      durationLabel: '3:22',
    },
    {
      id: 'teacher-4',
      title: 'Solicitud de recursos, comunicados internos',
      description: 'Tutorial del portal docente: solicitud de recursos y comunicados internos.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785896039/smartlunch/academy/teacher/docente-4.mov',
      publicId: 'smartlunch/academy/teacher/docente-4',
      duration: 190.8,
      durationLabel: '3:11',
    },
  ],
  rectoria: [
    {
      id: 'rectoria-1',
      title: 'Resumen Institucional hasta centro de control',
      description: 'Tutorial de Rectoría: resumen institucional hasta el centro de control.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785897591/smartlunch/academy/rectoria/rectoria-1.mov',
      publicId: 'smartlunch/academy/rectoria/rectoria-1',
      duration: 353.433333,
      durationLabel: '5:53',
    },
    {
      id: 'rectoria-2',
      title: 'Gestión administrativa',
      description: 'Tutorial de Rectoría: gestión administrativa.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785897593/smartlunch/academy/rectoria/rectoria-2.mov',
      publicId: 'smartlunch/academy/rectoria/rectoria-2',
      duration: 276,
      durationLabel: '4:36',
    },
    {
      id: 'rectoria-3',
      title: 'Configuración institucional',
      description: 'Tutorial de Rectoría: configuración institucional.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785897605/smartlunch/academy/rectoria/rectoria-3.mov',
      publicId: 'smartlunch/academy/rectoria/rectoria-3',
      duration: 376.466667,
      durationLabel: '6:16',
    },
  ],
  admissions: [
    {
      id: 'admissions-1',
      title: 'Dashboard, agenda y matrícula',
      description: 'Tutorial de Admisiones: dashboard, agenda y matrícula.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785897961/smartlunch/academy/admissions/admissions-1.mov',
      publicId: 'smartlunch/academy/admissions/admissions-1',
      duration: 370.033333,
      durationLabel: '6:10',
    },
    {
      id: 'admissions-2',
      title: 'Comunicados internos hasta matrículas digital',
      description: 'Tutorial de Admisiones: comunicados internos hasta matrículas digital.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785897951/smartlunch/academy/admissions/admissions-2.mov',
      publicId: 'smartlunch/academy/admissions/admissions-2',
      duration: 263.233333,
      durationLabel: '4:23',
    },
  ],
  cartera: [
    {
      id: 'cartera-1',
      title: 'Cartera',
      description: 'Tutorial del portal de Cartera.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785898150/smartlunch/academy/cartera/cartera-1.mov',
      publicId: 'smartlunch/academy/cartera/cartera-1',
      duration: 331.166667,
      durationLabel: '5:31',
    },
  ],
  academic_secretary: [
    {
      id: 'academic_secretary-1',
      title: 'Secretaría académica',
      description: 'Tutorial del portal de Secretaría académica.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785898318/smartlunch/academy/academic_secretary/secretaria-1.mov',
      publicId: 'smartlunch/academy/academic_secretary/secretaria-1',
      duration: 486.3,
      durationLabel: '8:06',
    },
  ],
  cafeteria: [
    {
      id: 'cafeteria-1',
      title: 'Cafeterías - portal administrativo 1',
      description: 'Tutorial de Cafetería: portal administrativo (parte 1).',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785898480/smartlunch/academy/cafeteria/cafeteria-1.mov',
      publicId: 'smartlunch/academy/cafeteria/cafeteria-1',
      duration: 394,
      durationLabel: '6:34',
    },
    {
      id: 'cafeteria-2',
      title: 'Cafeterías - portal administrativo 2',
      description: 'Tutorial de Cafetería: portal administrativo (parte 2).',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785898508/smartlunch/academy/cafeteria/cafeteria-2.mov',
      publicId: 'smartlunch/academy/cafeteria/cafeteria-2',
      duration: 360.033333,
      durationLabel: '6:00',
    },
    {
      id: 'cafeteria-3',
      title: 'Cafetería - vendedores',
      description: 'Tutorial de Cafetería: portal de vendedores.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785898531/smartlunch/academy/cafeteria/cafeteria-3.mov',
      publicId: 'smartlunch/academy/cafeteria/cafeteria-3',
      duration: 289.466667,
      durationLabel: '4:49',
    },
    {
      id: 'cafeteria-4',
      title: 'Cafetería - Tutor de alimentación',
      description: 'Tutorial de Cafetería: tutor de alimentación.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785898542/smartlunch/academy/cafeteria/cafeteria-4.mov',
      publicId: 'smartlunch/academy/cafeteria/cafeteria-4',
      duration: 131.1,
      durationLabel: '2:11',
    },
  ],
  enfermeria: [
    {
      id: 'enfermeria-1',
      title: 'Enfermería',
      description: 'Tutorial del portal de Enfermería.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785898694/smartlunch/academy/enfermeria/enfermeria-1.mov',
      publicId: 'smartlunch/academy/enfermeria/enfermeria-1',
      duration: 240.766667,
      durationLabel: '4:01',
    },
  ],
  psicologia: [
    {
      id: 'psicologia-1',
      title: 'Bienestar - Psicología',
      description: 'Tutorial del portal de Bienestar / Psicología.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785898810/smartlunch/academy/psicologia/psicologia-1.mov',
      publicId: 'smartlunch/academy/psicologia/psicologia-1',
      duration: 287.366667,
      durationLabel: '4:47',
    },
  ],
  coordinacion: [
    {
      id: 'coordinacion-1',
      title: 'Coordinación',
      description: 'Tutorial del portal de Coordinación.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785899052/smartlunch/academy/coordinacion/coordinacion-1.mov',
      publicId: 'smartlunch/academy/coordinacion/coordinacion-1',
      duration: 478.8,
      durationLabel: '7:59',
    },
  ],
  direccion: [
    {
      id: 'direccion-1',
      title: 'Dirección 1',
      description: 'Tutorial del portal de Dirección (parte 1).',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785899125/smartlunch/academy/direccion/direccion-1.mov',
      publicId: 'smartlunch/academy/direccion/direccion-1',
      duration: 334.133333,
      durationLabel: '5:34',
    },
    {
      id: 'direccion-2',
      title: 'Dirección 2',
      description: 'Tutorial del portal de Dirección (parte 2).',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785899157/smartlunch/academy/direccion/direccion-2.mov',
      publicId: 'smartlunch/academy/direccion/direccion-2',
      duration: 339.6,
      durationLabel: '5:40',
    },
  ],
  recursos_humanos: [
    {
      id: 'recursos_humanos-1',
      title: 'Recursos humanos',
      description: 'Tutorial del portal de Recursos humanos.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785899261/smartlunch/academy/recursos_humanos/recursos-1.mov',
      publicId: 'smartlunch/academy/recursos_humanos/recursos-1',
      duration: 260.7,
      durationLabel: '4:21',
    },
  ],
  ruta_escolar: [
    {
      id: 'ruta_escolar-1',
      title: 'Ruta escolar',
      description: 'Tutorial del portal de Ruta escolar.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785899356/smartlunch/academy/ruta_escolar/ruta-1.mov',
      publicId: 'smartlunch/academy/ruta_escolar/ruta-1',
      duration: 140.766667,
      durationLabel: '2:21',
    },
  ],
};

export function getAcademyVideosForPortal(portalKey = '') {
  return ACADEMY_TUTORIAL_VIDEOS[String(portalKey || '')] || [];
}

export function getAcademyPortalVideoCount(portalKey = '') {
  return getAcademyVideosForPortal(portalKey).filter((video) => Boolean(video.url)).length;
}

export function getAcademyVideoThumb(video = {}) {
  const publicId = String(video.publicId || '').trim();
  if (publicId) {
    return `https://res.cloudinary.com/duh2g4lo0/video/upload/so_1,w_320,h_180,c_fill,q_auto,f_jpg/${publicId}.jpg`;
  }
  const url = String(video.url || '').trim();
  if (!url) return '';
  return url.replace('/video/upload/', '/video/upload/so_1,w_320,h_180,c_fill,q_auto,f_jpg/').replace(/\.(mov|mp4|webm)(\?.*)?$/i, '.jpg');
}

export function getAcademyPopularVideos(limit = 3) {
  return ACADEMY_TUTORIAL_PORTALS.flatMap((portal) => (
    getAcademyVideosForPortal(portal.key)
      .filter((video) => Boolean(video.url))
      .map((video) => ({
        ...video,
        portalKey: portal.key,
        portalLabel: portal.label,
        thumbUrl: getAcademyVideoThumb(video),
      }))
  )).slice(0, limit);
}

export function getAcademyPortalByKey(portalKey = '') {
  return ACADEMY_TUTORIAL_PORTALS.find((portal) => portal.key === String(portalKey || '')) || null;
}
