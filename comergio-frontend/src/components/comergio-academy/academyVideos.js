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
      title: 'Inicio, horario, cursos, asistencia a clase, gestión académica',
      description: 'Tutorial del portal docente: inicio, horario, cursos, asistencia a clase y gestión académica.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785514935/smartlunch/academy/teacher/docente-1.mov',
      publicId: 'smartlunch/academy/teacher/docente-1',
      duration: 472.386757,
      durationLabel: '7:52',
    },
    {
      id: 'teacher-2',
      title: 'Contenido académico, convivencia escolar, feed de familias, publicaciones, solicitud de recursos, comunicados internos',
      description: 'Tutorial del portal docente: contenido académico, convivencia, feed de familias, publicaciones, recursos y comunicados internos.',
      url: 'https://res.cloudinary.com/duh2g4lo0/video/upload/v1785514813/smartlunch/academy/teacher/docente-2.mov',
      publicId: 'smartlunch/academy/teacher/docente-2',
      duration: 284.866667,
      durationLabel: '4:45',
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
