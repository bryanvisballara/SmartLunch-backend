function buildMillenniumCoexistenceBulletinTemplates() {
  return [
    {
      key: 'aprendiz',
      label: 'APRENDIZ',
      minScore: 0,
      maxScore: 69,
      text: 'Se encuentra fortaleciendo la apropiación de las normas de convivencia establecidas en el Manual de Convivencia del Colegio Bilingüe Milenio. Se le invita a continuar desarrollando habilidades de respeto, responsabilidad, empatía y autorregulación, con el acompañamiento necesario para poner en práctica estos valores en sus interacciones cotidianas y contribuir progresivamente a un ambiente escolar armónico y respetuoso.',
      active: true,
      order: 10,
    },
    {
      key: 'practicante',
      label: 'PRACTICANTE',
      minScore: 70,
      maxScore: 79,
      text: 'Avanza en la apropiación de las normas de convivencia establecidas en el Manual de Convivencia del Colegio Bilingüe Milenio y reconoce la importancia del respeto, la responsabilidad y la empatía en sus relaciones con los demás. Se le anima a continuar fortaleciendo la aplicación constante de estos valores y la autorregulación de su comportamiento para favorecer interacciones cada vez más positivas y constructivas dentro de la comunidad educativa.',
      active: true,
      order: 20,
    },
    {
      key: 'competente',
      label: 'COMPETENTE',
      minScore: 80,
      maxScore: 89,
      text: 'Demuestra una adecuada apropiación de las normas de convivencia establecidas en el Manual de Convivencia del Colegio Bilingüe Milenio y mantiene relaciones respetuosas con sus compañeros y profesores. Refleja responsabilidad, empatía y disposición para contribuir a un ambiente de armonía y colaboración. Como oportunidad de crecimiento, se le invita a continuar fortaleciendo su autonomía y a poner en práctica estos valores de manera consistente en las diferentes situaciones de la vida escolar.',
      active: true,
      order: 30,
    },
    {
      key: 'experto',
      label: 'EXPERTO',
      minScore: 90,
      maxScore: 100,
      text: 'Demuestra un compromiso sólido con las normas de convivencia establecidas en el Manual de Convivencia del Colegio Bilingüe Milenio, actuando con respeto hacia sus compañeros y profesores y promoviendo los valores fundamentales de nuestra institución. A través de su conducta diaria, refleja integridad, responsabilidad y empatía, contribuyendo positivamente a un ambiente de armonía y colaboración. Se destaca por su capacidad para fortalecer las relaciones interpersonales y constituirse en un referente positivo para la comunidad educativa.',
      active: true,
      order: 40,
    },
  ];
}

module.exports = {
  buildMillenniumCoexistenceBulletinTemplates,
};
