const ConectaCase = require('../models/conectaCase.model');
const { runInControlDb } = require('../config/db');

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function buildLikes(entries = []) {
  return entries.map((entry, index) => ({
    schoolId: entry.schoolId,
    userId: entry.userId || `seed-like-${index}`,
    name: entry.name,
    createdAt: hoursAgo(entry.hoursAgo || 1),
  }));
}

function buildComments(entries = []) {
  return entries.map((entry, index) => ({
    schoolId: entry.schoolId,
    userId: entry.userId || `seed-comment-${index}`,
    name: entry.name,
    schoolName: entry.schoolName,
    role: entry.role || 'teacher',
    body: entry.body,
    likes: buildLikes(entry.likes || []),
    createdAt: hoursAgo(entry.hoursAgo || 1),
    updatedAt: hoursAgo(entry.hoursAgo || 1),
  }));
}

const SEED_CASES = [
  {
    author: {
      schoolId: 'jardin-sonadores',
      userId: 'seed-maria-lopez',
      name: 'María López',
      role: 'teacher',
      schoolName: 'Jardín Soñadores',
      photoUrl: '/conecta/avatars/maria-lopez.jpg',
    },
    subjectKey: 'metodologias',
    subjectLabel: 'Metodologías',
    title: 'Estrategias para trabajar la lectura crítica en secundaria',
    body: 'Estoy buscando formas de motivar a mis estudiantes de grado 8 a analizar textos más allá de la comprensión literal. ¿Qué actividades les han funcionado para despertar el pensamiento crítico sin que la clase se sienta pesada?',
    publishedAt: hoursAgo(2),
    likes: buildLikes([
      { schoolId: 'greenfield-school', name: 'Carlos Ramírez', hoursAgo: 1.8 },
      { schoolId: 'jardin-sonadores', name: 'Laura Méndez', hoursAgo: 1.5 },
      { schoolId: 'greenfield-school', name: 'Sofía Andrade', hoursAgo: 1.2 },
      { schoolId: 'jardin-sonadores', name: 'Diego Ruiz', hoursAgo: 1 },
      { schoolId: 'greenfield-school', name: 'Valentina Cruz', hoursAgo: 0.8 },
      { schoolId: 'jardin-sonadores', name: 'Ana Torres', hoursAgo: 0.7 },
      { schoolId: 'greenfield-school', name: 'Andrés Peña', hoursAgo: 0.6 },
      { schoolId: 'jardin-sonadores', name: 'Camila Ríos', hoursAgo: 0.5 },
    ]),
    comments: buildComments([
      {
        schoolId: 'greenfield-school',
        name: 'Carlos Ramírez',
        schoolName: 'Greenfield School',
        body: 'A mí me ha servido empezar con dilemas cortos: les doy una situación ética del texto y debaten en parejas antes de escribir. Sube mucho la participación.',
        hoursAgo: 1.6,
        likes: [
          { schoolId: 'jardin-sonadores', name: 'María López', hoursAgo: 1.4 },
          { schoolId: 'greenfield-school', name: 'Sofía Andrade', hoursAgo: 1.1 },
        ],
      },
      {
        schoolId: 'jardin-sonadores',
        name: 'Laura Méndez',
        schoolName: 'Jardín Soñadores',
        body: 'En mi curso usamos “preguntas de detective”: cada estudiante formula una pregunta que el texto no responde directamente. Luego las intercambiamos.',
        hoursAgo: 1.3,
        likes: [
          { schoolId: 'jardin-sonadores', name: 'María López', hoursAgo: 1 },
        ],
      },
      {
        schoolId: 'greenfield-school',
        name: 'Sofía Andrade',
        schoolName: 'Greenfield School',
        body: 'También ayuda proyectar dos interpretaciones opuestas del mismo párrafo y pedir evidencia. Les encanta “ganar” el debate con citas.',
        hoursAgo: 0.9,
        likes: [
          { schoolId: 'greenfield-school', name: 'Carlos Ramírez', hoursAgo: 0.7 },
          { schoolId: 'jardin-sonadores', name: 'Diego Ruiz', hoursAgo: 0.5 },
          { schoolId: 'jardin-sonadores', name: 'María López', hoursAgo: 0.4 },
        ],
      },
    ]),
  },
  {
    author: {
      schoolId: 'greenfield-school',
      userId: 'seed-carlos-ramirez',
      name: 'Carlos Ramírez',
      role: 'teacher',
      schoolName: 'Greenfield School',
      photoUrl: '/conecta/avatars/carlos-ramirez.jpg',
    },
    subjectKey: 'convivencia',
    subjectLabel: 'Convivencia',
    title: 'Manejo de aula en grupos numerosos',
    body: 'Este año tengo 38 estudiantes en un mismo salón y se me dificulta sostener el ritmo sin perder a quienes necesitan más acompañamiento. ¿Cómo organizan las rutinas para que el grupo grande no se sienta caótico?',
    publishedAt: hoursAgo(5),
    likes: buildLikes([
      { schoolId: 'jardin-sonadores', name: 'María López', hoursAgo: 4.5 },
      { schoolId: 'jardin-sonadores', name: 'Ana Torres', hoursAgo: 4 },
      { schoolId: 'greenfield-school', name: 'Valentina Cruz', hoursAgo: 3.5 },
      { schoolId: 'jardin-sonadores', name: 'Diego Ruiz', hoursAgo: 3 },
      { schoolId: 'greenfield-school', name: 'Sofía Andrade', hoursAgo: 2.8 },
      { schoolId: 'jardin-sonadores', name: 'Laura Méndez', hoursAgo: 2.5 },
    ]),
    comments: buildComments([
      {
        schoolId: 'jardin-sonadores',
        name: 'Ana Torres',
        schoolName: 'Jardín Soñadores',
        body: 'Nosotros usamos roles rotativos cada semana: mediador, cronometrista y reportero. Baja el ruido y todos sienten responsabilidad.',
        hoursAgo: 4.2,
        likes: [
          { schoolId: 'greenfield-school', name: 'Carlos Ramírez', hoursAgo: 4 },
          { schoolId: 'jardin-sonadores', name: 'María López', hoursAgo: 3.8 },
        ],
      },
      {
        schoolId: 'jardin-sonadores',
        name: 'Diego Ruiz',
        schoolName: 'Jardín Soñadores',
        body: 'Prueba estaciones de 12 minutos. Mientras un grupo trabaja autónomo, tú te sientas con el que necesita refuerzo. Cambia la dinámica del día.',
        hoursAgo: 3.2,
        likes: [
          { schoolId: 'greenfield-school', name: 'Carlos Ramírez', hoursAgo: 2.8 },
        ],
      },
    ]),
  },
  {
    author: {
      schoolId: 'jardin-sonadores',
      userId: 'seed-ana-torres',
      name: 'Ana Torres',
      role: 'teacher',
      schoolName: 'Jardín Soñadores',
      photoUrl: '/conecta/avatars/ana-torres.jpg',
    },
    subjectKey: 'evaluacion',
    subjectLabel: 'Evaluación formativa',
    title: 'Cómo dar retroalimentación rápida sin agotarse',
    body: 'Quiero que mis estudiantes reciban comentarios útiles en cada entrega, pero corregir todo a profundidad me está consumiendo los fines de semana. ¿Qué sistemas de feedback corto les han resultado sostenibles?',
    publishedAt: hoursAgo(9),
    likes: buildLikes([
      { schoolId: 'greenfield-school', name: 'Carlos Ramírez', hoursAgo: 8 },
      { schoolId: 'greenfield-school', name: 'Sofía Andrade', hoursAgo: 7.5 },
      { schoolId: 'jardin-sonadores', name: 'María López', hoursAgo: 7 },
      { schoolId: 'jardin-sonadores', name: 'Laura Méndez', hoursAgo: 6 },
      { schoolId: 'greenfield-school', name: 'Valentina Cruz', hoursAgo: 5 },
      { schoolId: 'jardin-sonadores', name: 'Diego Ruiz', hoursAgo: 4 },
    ]),
    comments: buildComments([
      {
        schoolId: 'greenfield-school',
        name: 'Sofía Andrade',
        schoolName: 'Greenfield School',
        body: 'Uso rúbricas de 3 criterios y solo escribo una fortaleza + una mejora. El resto lo marco en checklist. Me ahorró horas.',
        hoursAgo: 7.2,
        likes: [
          { schoolId: 'jardin-sonadores', name: 'Ana Torres', hoursAgo: 6.8 },
          { schoolId: 'greenfield-school', name: 'Carlos Ramírez', hoursAgo: 6.5 },
        ],
      },
      {
        schoolId: 'jardin-sonadores',
        name: 'María López',
        schoolName: 'Jardín Soñadores',
        body: 'También funciona la coevaluación guiada: ellos revisan el borrador de un compañero con una guía de 5 preguntas antes de que yo entre.',
        hoursAgo: 6.1,
        likes: [
          { schoolId: 'jardin-sonadores', name: 'Ana Torres', hoursAgo: 5.5 },
          { schoolId: 'greenfield-school', name: 'Sofía Andrade', hoursAgo: 5 },
          { schoolId: 'jardin-sonadores', name: 'Laura Méndez', hoursAgo: 4.5 },
        ],
      },
      {
        schoolId: 'greenfield-school',
        name: 'Valentina Cruz',
        schoolName: 'Greenfield School',
        body: 'Audio de 40 segundos por estudiante en algunas tareas. Es más humano y mucho más rápido que escribir párrafos.',
        hoursAgo: 4.8,
        likes: [
          { schoolId: 'jardin-sonadores', name: 'Ana Torres', hoursAgo: 4.2 },
        ],
      },
    ]),
  },
];

async function ensureConectaSeedCases() {
  return runInControlDb(async () => {
    let touched = 0;
    for (const item of SEED_CASES) {
      const filter = {
        conectaEntity: 'case',
        'author.userId': item.author.userId,
        title: item.title,
      };
      const existing = await ConectaCase.findOne(filter).select('_id author.photoUrl').lean();
      if (existing) {
        if (normalizePhotoNeeded(existing.author?.photoUrl, item.author.photoUrl)) {
          await ConectaCase.updateOne(filter, {
            $set: {
              author: item.author,
              likes: item.likes,
              comments: item.comments,
              body: item.body,
              subjectKey: item.subjectKey,
              subjectLabel: item.subjectLabel,
              publishedAt: item.publishedAt,
              email: `conecta-seed-${item.author.userId}@comergio.internal`,
            },
          });
          touched += 1;
        }
        continue;
      }

      await ConectaCase.create({
        conectaEntity: 'case',
        email: `conecta-seed-${item.author.userId}@comergio.internal`,
        ...item,
        media: [],
        status: 'published',
      });
      touched += 1;
    }
    return { seeded: touched > 0, count: touched };
  });
}

function normalizePhotoNeeded(current, next) {
  return String(current || '').trim() !== String(next || '').trim();
}

module.exports = {
  ensureConectaSeedCases,
  SEED_CASES,
};
