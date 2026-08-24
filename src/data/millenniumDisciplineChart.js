const MILLENNIUM_DISCIPLINE_CHART_YEAR = '2026-27';

const MILLENNIUM_DISCIPLINE_CATEGORIES = [
  {
    key: 'A',
    weightPercent: 30,
    label: 'A. Respeto a cada miembro de la comunidad educativa (30%)',
    description: 'Tratar a cada miembro de la comunidad educativa como un ser humano con derechos que deben respetarse.',
  },
  {
    key: 'B',
    weightPercent: 10,
    label: 'B. Participación y derechos fundamentales (10%)',
    description: 'Participar en la toma de decisiones en el contexto escolar, respetando los derechos fundamentales de las personas.',
  },
  {
    key: 'C',
    weightPercent: 10,
    label: 'C. Normas, buenos modales y etiqueta (10%)',
    description: 'Respetar las normas para desarrollar buenos modales y estándares de etiqueta.',
  },
  {
    key: 'D',
    weightPercent: 40,
    label: 'D. Competencias ciudadanas y derechos humanos (40%)',
    description: 'Desarrollar competencias ciudadanas para la formación de una persona integral preocupada por los derechos humanos.',
  },
  {
    key: 'E',
    weightPercent: 10,
    label: 'E. Diversidad humana (10%)',
    description: 'Reconocer y respetar la diversidad humana.',
  },
];

const MILLENNIUM_DISCIPLINE_INFRACTIONS = [
  {
    code: 'A1',
    categoryKey: 'A',
    severityPercent: 30,
    deductionPercent: 9,
    label: 'El estudiante no cumple con las normas establecidas en el Código de Convivencia Escolar.',
    description: 'The student does not comply with the rules outlined in the school\'s Code of Conduct.',
  },
  {
    code: 'A2',
    categoryKey: 'A',
    severityPercent: 30,
    deductionPercent: 9,
    label: 'El estudiante es irrespetuoso con compañeros, docentes, administrativos o personal de servicio.',
    description: 'The student is disrespectful to teachers, administrators, or service personnel.',
  },
  {
    code: 'A3',
    categoryKey: 'A',
    severityPercent: 50,
    deductionPercent: 15,
    label: 'El estudiante es específicamente irrespetuoso e incita a los demás a serlo con sus compañeros.',
    description: 'The student is specifically disrespectful to peers and incites others to be disrespectful.',
  },
  {
    code: 'A4',
    categoryKey: 'A',
    severityPercent: 30,
    deductionPercent: 9,
    label: 'El estudiante no protege el medio ambiente ni cuida los bienes de la institución (materiales, equipos, plantas, baños).',
    description: 'The student fails to protect the environment and does not take care of school property.',
  },
  {
    code: 'A5',
    categoryKey: 'A',
    severityPercent: 30,
    deductionPercent: 9,
    label: 'El estudiante no respeta la privacidad de los demás.',
    description: 'The student disrespects the privacy of others.',
  },
  {
    code: 'A6',
    categoryKey: 'A',
    severityPercent: 30,
    deductionPercent: 9,
    label: 'El estudiante utiliza un lenguaje inapropiado o realiza gestos vulgares que violan las normas de una sexualidad sana.',
    description: 'The student uses inappropriate language or makes vulgar gestures that violate the norms of healthy sexuality.',
  },
  {
    code: 'B1',
    categoryKey: 'B',
    severityPercent: 20,
    deductionPercent: 2,
    label: 'Al estudiante le cuesta participar o cooperar con sus compañeros en trabajos colaborativos.',
    description: 'The student struggles to participate or cooperate with peers in collaborative work.',
  },
  {
    code: 'B2',
    categoryKey: 'B',
    severityPercent: 40,
    deductionPercent: 4,
    label: 'El estudiante responde de forma inapropiada al ser reprendido.',
    description: 'The student responds inappropriately when reprimanded.',
  },
  {
    code: 'B3',
    categoryKey: 'B',
    severityPercent: 40,
    deductionPercent: 4,
    label: 'El estudiante interrumpe o no participa en proyectos colectivos orientados al bien común y la comunidad escolar.',
    description: 'The student disrupts or does not participate in collective projects aimed at the common good.',
  },
  {
    code: 'C1',
    categoryKey: 'C',
    severityPercent: 20,
    deductionPercent: 2,
    label: 'El estudiante llega tarde al colegio sin justificación (después de las 7:30 a.m.).',
    description: 'The student arrives late to school without justification (after 7:30 a.m.).',
  },
  {
    code: 'C2',
    categoryKey: 'C',
    severityPercent: 20,
    deductionPercent: 2,
    label: 'El estudiante llega tarde a clases o actividades programadas (hora común, tutorías, reuniones).',
    description: 'The student arrives late to classes or scheduled activities (e.g., school hour, tutorials, meetings).',
  },
  {
    code: 'C3',
    categoryKey: 'C',
    severityPercent: 40,
    deductionPercent: 4,
    label: 'El estudiante falta a clase sin proporcionar una justificación.',
    description: 'The student misses class without providing justification.',
  },
  {
    code: 'C4',
    categoryKey: 'C',
    severityPercent: 40,
    deductionPercent: 4,
    label: 'El estudiante no asiste a las clases de Pre-Saber en las fechas programadas.',
    description: 'The student skips Pre-Saber classes on scheduled dates.',
  },
  {
    code: 'C5',
    categoryKey: 'C',
    severityPercent: 40,
    deductionPercent: 4,
    label: 'El estudiante no asiste a sesiones de refuerzo o recuperación.',
    description: 'The student misses re-teaching or recovery sessions.',
  },
  {
    code: 'C6',
    categoryKey: 'C',
    severityPercent: 50,
    deductionPercent: 5,
    label: 'El estudiante abandona la clase o el colegio sin una excusa válida.',
    description: 'The student leaves class or school without a valid excuse.',
  },
  {
    code: 'C7',
    categoryKey: 'C',
    severityPercent: 30,
    deductionPercent: 3,
    label: 'El estudiante no entrega tareas, proyectos o materiales a tiempo.',
    description: 'The student fails to submit assignments, projects, or materials on time.',
  },
  {
    code: 'C8',
    categoryKey: 'C',
    severityPercent: 30,
    deductionPercent: 3,
    label: 'El estudiante no presenta los exámenes programados y no justifica su ausencia.',
    description: 'The student does not take scheduled exams and provides no justification.',
  },
  {
    code: 'C9',
    categoryKey: 'C',
    severityPercent: 30,
    deductionPercent: 3,
    label: 'El estudiante no sigue las instrucciones del docente durante las clases presenciales o virtuales.',
    description: 'The student disregards teacher instructions during in-person or online classes.',
  },
  {
    code: 'C10',
    categoryKey: 'C',
    severityPercent: 20,
    deductionPercent: 2,
    label: 'El estudiante adopta posturas inadecuadas durante actividades presenciales o virtuales.',
    description: 'The student adopts improper postures during in-person or online activities.',
  },
  {
    code: 'C11',
    categoryKey: 'C',
    severityPercent: 50,
    deductionPercent: 5,
    label: 'El estudiante interrumpe frecuentemente las actividades de clase.',
    description: 'The student frequently disrupts class activities.',
  },
  {
    code: 'C12',
    categoryKey: 'C',
    severityPercent: 30,
    deductionPercent: 3,
    label: 'El estudiante usa el celular o dispositivos electrónicos de forma inapropiada durante actividades escolares (chatear, jugar).',
    description: 'The student uses a cell phone or electronic devices inappropriately during school activities.',
  },
  {
    code: 'C13',
    categoryKey: 'C',
    severityPercent: 30,
    deductionPercent: 3,
    label: 'El estudiante usa su teléfono para tomar fotos o videos no autorizados durante actividades escolares y los publica en redes sociales.',
    description: 'The student takes unauthorized photos or videos during school activities and posts them on social media.',
  },
  {
    code: 'C14',
    categoryKey: 'C',
    severityPercent: 30,
    deductionPercent: 3,
    label: 'El estudiante publica fotos, memes, stickers o videos de otros sin su consentimiento en el contexto escolar.',
    description: 'The student publishes photos, memes, stickers, or videos of others without their consent.',
  },
  {
    code: 'C15',
    categoryKey: 'C',
    severityPercent: 30,
    deductionPercent: 3,
    label: 'El estudiante etiqueta a otros sin su autorización en publicaciones en redes sociales en el contexto escolar.',
    description: 'The student tags others without their authorization in social media posts.',
  },
  {
    code: 'C16',
    categoryKey: 'C',
    severityPercent: 40,
    deductionPercent: 4,
    label: 'El estudiante trae alimentos o materiales no autorizados a la institución.',
    description: 'The student brings unauthorized food or materials to the institution.',
  },
  {
    code: 'D1',
    categoryKey: 'D',
    severityPercent: 30,
    deductionPercent: 12,
    label: 'El estudiante comete faltas como copiar en evaluaciones, plagiar o presentar el mismo trabajo más de una vez.',
    description: 'The student engages in misconduct such as cheating on evaluations, plagiarism, or submitting the same work more than once.',
  },
  {
    code: 'D2',
    categoryKey: 'D',
    severityPercent: 60,
    deductionPercent: 24,
    label: 'El estudiante incurre repetidamente en conductas académicas deshonestas (copiar, plagiar, colusión).',
    description: 'The student repeatedly engages in academic misconduct (e.g., cheating, plagiarism, collusion).',
  },
  {
    code: 'D3',
    categoryKey: 'D',
    severityPercent: 60,
    deductionPercent: 24,
    label: 'El estudiante falta reiteradamente el respeto a los docentes u otros miembros con lenguaje ofensivo o insultos.',
    description: 'The student is repeatedly disrespectful to teachers or other school members using offensive language or insults.',
  },
  {
    code: 'D4',
    categoryKey: 'D',
    severityPercent: 60,
    deductionPercent: 24,
    label: 'El estudiante incurre en agresión física, como golpear, patear, empujar o jalar el cabello.',
    description: 'The student engages in physical aggression, such as hitting, kicking, pushing, or pulling hair.',
  },
  {
    code: 'D5',
    categoryKey: 'D',
    severityPercent: 60,
    deductionPercent: 24,
    label: 'El estudiante utiliza gestos para humillar o intimidar a otros.',
    description: 'The student uses gestures to humiliate or intimidate others.',
  },
  {
    code: 'D6',
    categoryKey: 'D',
    severityPercent: 50,
    deductionPercent: 20,
    label: 'El estudiante excluye deliberadamente a compañeros o difunde rumores para dañar su reputación.',
    description: 'The student deliberately excludes peers or spreads rumors to damage their reputation.',
  },
  {
    code: 'D7',
    categoryKey: 'D',
    severityPercent: 60,
    deductionPercent: 24,
    label: 'El estudiante publica contenido ofensivo o insultante sobre compañeros o miembros de la escuela en redes sociales.',
    description: 'The student posts offensive or insulting content about peers or school members on social media.',
  },
  {
    code: 'D8',
    categoryKey: 'D',
    severityPercent: 60,
    deductionPercent: 24,
    label: 'El estudiante amenaza e incita a la violencia contra compañeros.',
    description: 'The student threatens or incites violence against peers.',
  },
  {
    code: 'D9',
    categoryKey: 'D',
    severityPercent: 50,
    deductionPercent: 20,
    label: 'El estudiante realiza actividades comerciales no autorizadas dentro del colegio, como rifas o ventas.',
    description: 'The student conducts unauthorized business within the school, such as raffles or sales.',
  },
  {
    code: 'D10',
    categoryKey: 'D',
    severityPercent: 100,
    deductionPercent: 40,
    label: 'El estudiante trae armas o elementos peligrosos que puedan causar daño al colegio.',
    description: 'The student brings weapons or dangerous items that could cause harm.',
  },
  {
    code: 'D11',
    categoryKey: 'D',
    severityPercent: 50,
    deductionPercent: 20,
    label: 'El estudiante organiza actividades relacionadas con la escuela (paseos, fiestas) sin autorización previa de la dirección.',
    description: 'The student organizes school-related activities (trips, parties) without prior authorization.',
  },
  {
    code: 'D12',
    categoryKey: 'D',
    severityPercent: 80,
    deductionPercent: 32,
    label: 'El estudiante roba o retiene objetos o dinero pertenecientes al colegio u otros miembros de la comunidad.',
    description: 'The student steals or retains objects or money belonging to the school or other community members.',
  },
  {
    code: 'D13',
    categoryKey: 'D',
    severityPercent: 100,
    deductionPercent: 40,
    label: 'El estudiante trae o consume alcohol, drogas, cigarrillos o vapeadores en las instalaciones del colegio o durante eventos escolares.',
    description: 'The student brings or consumes alcohol, drugs, cigarettes, or vape pens on school premises or during school events.',
  },
  {
    code: 'D14',
    categoryKey: 'D',
    severityPercent: 60,
    deductionPercent: 24,
    label: 'El estudiante trae o visualiza contenido inapropiado, como pornografía, en el contexto escolar.',
    description: 'The student brings or views inappropriate content, such as pornography, within the school context.',
  },
  {
    code: 'E1',
    categoryKey: 'E',
    severityPercent: 30,
    deductionPercent: 3,
    label: 'El estudiante demuestra intolerancia al interactuar con compañeros, docentes o administrativos.',
    description: 'The student demonstrates intolerance when interacting with peers, teachers, or administrators.',
  },
  {
    code: 'E2',
    categoryKey: 'E',
    severityPercent: 50,
    deductionPercent: 5,
    label: 'El estudiante no respeta las diferencias culturales, religiosas o personales (género, etnia, condición económica).',
    description: 'The student disrespects cultural, religious, or personal differences (e.g., gender, ethnicity, economic status).',
  },
  {
    code: 'E3',
    categoryKey: 'E',
    severityPercent: 80,
    deductionPercent: 8,
    label: 'El estudiante incurre en conductas de exclusión hacia sus compañeros.',
    description: 'The student engages in exclusionary behavior towards peers.',
  },
];

const GENERIC_DEFAULT_INFRACTION_KEYS = ['llegada_tarde', 'copia_examen'];

function getMillenniumDisciplineCategory(categoryKey) {
  return MILLENNIUM_DISCIPLINE_CATEGORIES.find((item) => item.key === categoryKey) || null;
}

function buildMillenniumDisciplineInfractions() {
  return MILLENNIUM_DISCIPLINE_INFRACTIONS.map((item, index) => {
    const category = getMillenniumDisciplineCategory(item.categoryKey);
    return {
      key: String(item.code || '').trim().toLowerCase(),
      code: item.code,
      categoryKey: item.categoryKey,
      categoryLabel: category?.label || item.categoryKey,
      label: item.label,
      description: item.description,
      severityPercent: item.severityPercent,
      deductionPercent: item.deductionPercent,
      active: true,
      order: (index + 1) * 10,
    };
  });
}

function looksLikeGenericCoexistenceDefaults(infractions = []) {
  const list = Array.isArray(infractions) ? infractions : [];
  if (!list.length) {
    return true;
  }
  const keys = list.map((item) => String(item?.key || '').trim().toLowerCase()).filter(Boolean);
  if (!keys.length || keys.length > GENERIC_DEFAULT_INFRACTION_KEYS.length) {
    return false;
  }
  return keys.every((key) => GENERIC_DEFAULT_INFRACTION_KEYS.includes(key));
}

module.exports = {
  MILLENNIUM_DISCIPLINE_CHART_YEAR,
  MILLENNIUM_DISCIPLINE_CATEGORIES,
  MILLENNIUM_DISCIPLINE_INFRACTIONS,
  buildMillenniumDisciplineInfractions,
  looksLikeGenericCoexistenceDefaults,
};
