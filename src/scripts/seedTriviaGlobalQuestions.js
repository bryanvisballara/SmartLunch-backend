require('dotenv').config({ override: true });

const { connectDB, runInControlDb } = require('../config/db');
require('../models');
const { TriviaGlobalQuestion } = require('../models/triviaQuestion.model');

const CATEGORIES = ['Historia', 'Ciencia', 'Cultura', 'Arte', 'Deportes'];

function question(ageBand, category, prompt, correct, wrong) {
  const answers = [correct, ...wrong];
  return {
    ageBand,
    category,
    prompt,
    options: answers.map((text, index) => ({ key: String.fromCharCode(65 + index), text })),
    correctAnswer: 'A',
    explanation: '',
    difficulty: ageBand === '6-8' ? 'easy' : ageBand === '15-17' ? 'hard' : 'medium',
  };
}

const QUESTIONS = [
  question('6-8', 'Historia', '¿En qué país vivimos si estamos en Bogotá?', 'Colombia', ['México', 'España', 'Brasil']),
  question('6-8', 'Historia', '¿Qué objeto antiguo usaban los caballeros para protegerse?', 'Un escudo', ['Un telescopio', 'Una brújula', 'Un pincel']),
  question('6-8', 'Ciencia', '¿En qué planeta vivimos?', 'La Tierra', ['Marte', 'Júpiter', 'Venus']),
  question('6-8', 'Ciencia', '¿Qué necesitan las plantas para crecer?', 'Agua y luz', ['Solo piedras', 'Plástico', 'Humo']),
  question('6-8', 'Cultura', '¿Cuáles son los colores de la bandera de Colombia?', 'Amarillo, azul y rojo', ['Verde, blanco y negro', 'Rojo y blanco', 'Azul y naranja']),
  question('6-8', 'Cultura', '¿Cuál de estos es un baile tradicional colombiano?', 'La cumbia', ['El ballet ruso', 'El flamenco', 'El vals vienés']),
  question('6-8', 'Arte', '¿Qué color aparece al mezclar azul y amarillo?', 'Verde', ['Rojo', 'Morado', 'Negro']),
  question('6-8', 'Arte', '¿Qué herramienta se usa normalmente para pintar?', 'Un pincel', ['Una cuchara', 'Un martillo', 'Una regla']),
  question('6-8', 'Deportes', '¿Con qué parte del cuerpo se patea un balón?', 'El pie', ['La oreja', 'El codo', 'La nariz']),
  question('6-8', 'Deportes', '¿En qué deporte se encesta un balón en un aro?', 'Baloncesto', ['Natación', 'Ciclismo', 'Tenis']),

  question('9-11', 'Historia', '¿En qué año se recuerda la Independencia de Colombia?', '1810', ['1492', '1910', '2000']),
  question('9-11', 'Historia', '¿Qué civilización construyó las pirámides de Giza?', 'La egipcia', ['La romana', 'La vikinga', 'La inca']),
  question('9-11', 'Ciencia', '¿Cómo se llama el proceso con el que las plantas producen alimento?', 'Fotosíntesis', ['Evaporación', 'Hibernación', 'Erosión']),
  question('9-11', 'Ciencia', '¿A qué temperatura se congela el agua en grados Celsius?', '0 °C', ['10 °C', '50 °C', '100 °C']),
  question('9-11', 'Cultura', '¿Qué idioma se habla principalmente en Brasil?', 'Portugués', ['Italiano', 'Francés', 'Alemán']),
  question('9-11', 'Cultura', '¿En qué ciudad colombiana se celebra un carnaval famoso?', 'Barranquilla', ['Tunja', 'Manizales', 'Leticia']),
  question('9-11', 'Arte', '¿Cuáles son los colores primarios tradicionales?', 'Rojo, amarillo y azul', ['Verde, naranja y morado', 'Blanco, gris y negro', 'Azul, verde y rosa']),
  question('9-11', 'Arte', '¿Cómo se llama una obra representada por actores?', 'Teatro', ['Escultura', 'Fotografía', 'Arquitectura']),
  question('9-11', 'Deportes', '¿Cuántos jugadores tiene un equipo de fútbol en la cancha al iniciar?', '11', ['5', '7', '15']),
  question('9-11', 'Deportes', '¿Cada cuántos años se celebran normalmente los Juegos Olímpicos?', '4 años', ['2 años', '5 años', '10 años']),

  question('12-14', 'Historia', '¿En qué año comenzó la Revolución francesa?', '1789', ['1492', '1810', '1914']),
  question('12-14', 'Historia', '¿En qué año fue promulgada la actual Constitución Política de Colombia?', '1991', ['1886', '1957', '2010']),
  question('12-14', 'Ciencia', '¿Qué orgánulo celular produce gran parte de la energía de la célula?', 'La mitocondria', ['El ribosoma', 'El núcleo', 'La vacuola']),
  question('12-14', 'Ciencia', '¿Cuál es la fórmula básica de la rapidez?', 'Distancia dividida entre tiempo', ['Tiempo dividido entre distancia', 'Masa por volumen', 'Fuerza dividida entre masa']),
  question('12-14', 'Cultura', '¿Qué organización declara lugares como Patrimonio de la Humanidad?', 'La UNESCO', ['La FIFA', 'La NASA', 'La OPEP']),
  question('12-14', 'Cultura', '¿Qué palabra describe la mezcla de diferentes tradiciones culturales?', 'Mestizaje cultural', ['Aislamiento', 'Monocultivo', 'Gravedad']),
  question('12-14', 'Arte', '¿Qué artista pintó La Gioconda o Mona Lisa?', 'Leonardo da Vinci', ['Pablo Picasso', 'Vincent van Gogh', 'Fernando Botero']),
  question('12-14', 'Arte', '¿Qué técnica permite representar profundidad sobre una superficie plana?', 'La perspectiva', ['La simetría', 'El collage', 'La rima']),
  question('12-14', 'Deportes', '¿Cuántos jugadores por equipo hay en la cancha de voleibol?', '6', ['5', '7', '11']),
  question('12-14', 'Deportes', '¿Qué distancia aproximada tiene una maratón?', '42,195 kilómetros', ['10 kilómetros', '21 kilómetros', '100 kilómetros']),

  question('15-17', 'Historia', '¿Qué dos potencias protagonizaron principalmente la Guerra Fría?', 'Estados Unidos y la Unión Soviética', ['Francia y Portugal', 'China y Japón', 'España e Italia']),
  question('15-17', 'Historia', '¿Qué fuente de energía impulsó las primeras máquinas de la Revolución Industrial?', 'El vapor', ['La energía solar', 'La energía nuclear', 'El hidrógeno']),
  question('15-17', 'Ciencia', '¿Qué molécula almacena la información genética?', 'El ADN', ['La glucosa', 'El oxígeno', 'El calcio']),
  question('15-17', 'Ciencia', '¿Cuál es el pH aproximado de una sustancia neutra?', '7', ['0', '3', '14']),
  question('15-17', 'Cultura', '¿Qué es el patrimonio cultural inmaterial?', 'Tradiciones y saberes transmitidos entre generaciones', ['Solo edificios antiguos', 'Únicamente objetos de museo', 'Recursos minerales']),
  question('15-17', 'Cultura', '¿Qué proceso intensifica la conexión económica y cultural entre países?', 'La globalización', ['La sedimentación', 'La fotosíntesis', 'La electrólisis']),
  question('15-17', 'Arte', '¿Qué movimiento artístico buscó capturar la luz y el instante?', 'El impresionismo', ['El cubismo', 'El barroco', 'El surrealismo']),
  question('15-17', 'Arte', '¿En qué categoría recibió Gabriel García Márquez el Premio Nobel?', 'Literatura', ['Paz', 'Física', 'Economía']),
  question('15-17', 'Deportes', '¿Qué organismo gestiona el circuito profesional masculino de tenis?', 'La ATP', ['La FIFA', 'La FIBA', 'La UCI']),
  question('15-17', 'Deportes', '¿Qué sanciona la regla del fuera de juego en fútbol?', 'Una posición ofensiva indebida al recibir el balón', ['Tocar el balón con el pie', 'Hacer un saque de banda', 'Cambiar de portero']),
];

async function main() {
  await connectDB();
  const result = await runInControlDb(async () => {
    let inserted = 0;
    let updated = 0;
    for (const item of QUESTIONS) {
      const operation = await TriviaGlobalQuestion.updateOne(
        { prompt: item.prompt, category: item.category, ageBand: item.ageBand },
        {
          $set: {
            ...item,
            subjectKey: item.category,
            subjectLabel: item.category,
            gradeKey: item.ageBand,
            gradeLabel: item.ageBand,
            status: 'published',
            moderationStatus: 'approved',
          },
          $setOnInsert: { createdByUserId: 'comergio-global-seed' },
        },
        { upsert: true }
      );
      inserted += Number(operation.upsertedCount || 0);
      updated += Number(operation.modifiedCount || 0);
    }
    return { inserted, updated, total: QUESTIONS.length };
  });
  const categoryCoverage = Object.fromEntries(CATEGORIES.map((category) => [
    category,
    QUESTIONS.filter((item) => item.category === category).length,
  ]));
  console.log(JSON.stringify({ ...result, categoryCoverage }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
