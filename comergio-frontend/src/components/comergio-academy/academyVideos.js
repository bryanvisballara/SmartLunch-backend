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
