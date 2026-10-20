export const SCHOOL_INTERVIEW_AREAS = [
  {
    id: 'communications',
    label: 'Comunicaciones',
    summary: 'Cómo llegan hoy las novedades a las familias.',
  },
  {
    id: 'billing',
    label: 'Cartera',
    summary: 'Cómo paga una familia y cómo se hace seguimiento.',
  },
  {
    id: 'academics',
    label: 'Academia',
    summary: 'Tareas, calificaciones, boletines y asistencia.',
  },
  {
    id: 'store',
    label: 'Tienda escolar',
    summary: 'Cómo compran los estudiantes en el colegio.',
  },
  {
    id: 'wellbeing',
    label: 'Enfermería y bienestar',
    summary: 'Avisos a las familias e historial de los casos.',
  },
];

const BASE_SCHOOL_INTERVIEW_QUESTIONS = [
  {
    id: 'family_news',
    areaId: 'communications',
    prompt: '¿Cómo informan a los padres de novedades y eventos?',
    help: 'Puede marcar todo lo que usen hoy. No hay una respuesta incorrecta.',
    options: [
      {
        id: 'circulars',
        label: 'Circulares, carteleras o notas impresas',
        score: 36,
        strength: '',
        accompaniment: 'Las circulares pueden convivir con un aviso en la app de las familias, para que nadie se quede sin la información si el papel no llega a casa.',
      },
      {
        id: 'whatsapp',
        label: 'Grupos de WhatsApp o cadenas de mensajes',
        score: 44,
        strength: 'La cercanía con las familias por mensaje es un activo del colegio.',
        accompaniment: 'WhatsApp puede seguir para lo urgente. Comergio deja un registro institucional de lo enviado, visible para rectoría y para cada familia.',
      },
      {
        id: 'email',
        label: 'Correo electrónico',
        score: 58,
        strength: 'El correo ya deja un rastro de lo comunicado.',
        accompaniment: 'Ese mismo aviso puede llegar también al campus de padres, junto con el resto de la vida escolar.',
      },
      {
        id: 'social',
        label: 'Redes sociales del colegio',
        score: 46,
        strength: 'Las redes ayudan a mostrar la vida del colegio.',
        accompaniment: 'Lo público puede quedarse en redes. Lo que es de cada familia —eventos, autorizaciones, novedades del curso— queda mejor en un canal privado.',
      },
      {
        id: 'one_to_one',
        label: 'Llamadas o mensajes uno a uno',
        score: 34,
        strength: 'El trato personal con las familias se nota.',
        accompaniment: 'Las llamadas importantes se mantienen. Los avisos generales pueden salir una sola vez y llegar a todos los acudientes.',
      },
      {
        id: 'institutional_app',
        label: 'Una app o plataforma institucional',
        score: 90,
        strength: 'Ya cuentan con un canal institucional para hablar con las familias.',
        accompaniment: 'Comergio puede reunir ese canal con cartera, academia y enfermería, para que la familia no tenga que entrar a varios lugares.',
      },
    ],
  },
  {
    id: 'parent_payments',
    areaId: 'billing',
    prompt: '¿Cómo paga un papá y qué medios de pago tienen?',
    help: 'Marque los medios que una familia puede usar hoy.',
    options: [
      {
        id: 'cash_office',
        label: 'Efectivo o pago en la oficina del colegio',
        score: 34,
        strength: 'La oficina sigue siendo un punto de confianza para algunas familias.',
        accompaniment: 'El pago en oficina puede seguir. Comergio también permite que la familia pague desde casa y que cartera vea el estado al momento.',
      },
      {
        id: 'manual_transfer',
        label: 'Transferencia que luego se concilia a mano',
        score: 46,
        strength: 'Ya reciben pagos digitales.',
        accompaniment: 'La conciliación manual puede aliviarse cuando el pago queda asociado al estudiante y al concepto, sin buscar el soporte en el chat.',
      },
      {
        id: 'bank_agreement',
        label: 'Convenio o ventanilla bancaria',
        score: 64,
        strength: 'El convenio bancario ya ordena una parte de la cartera.',
        accompaniment: 'Ese convenio puede complementarse con pagos en línea (PSE, Nequi, Daviplata, tarjeta y otros) dentro del mismo estado de cuenta.',
      },
      {
        id: 'online_gateway',
        label: 'Pasarela en línea (PSE, tarjeta, Nequi, Daviplata u otra)',
        score: 86,
        strength: 'Las familias ya pueden pagar en línea.',
        accompaniment: 'Comergio puede dejar ese pago al lado de la pensión, la tienda y los comunicados, con el mismo usuario de la familia.',
      },
      {
        id: 'manual_followup',
        label: 'Varios medios, con seguimiento de cartera todavía manual',
        score: 40,
        strength: 'Hay flexibilidad para que cada familia pague como pueda.',
        accompaniment: 'Cartera puede ver quién está al día y a quién acompañar, sin armar el reporte en una hoja aparte.',
      },
    ],
  },
  {
    id: 'study_content',
    areaId: 'academics',
    prompt: '¿Cómo comparten las tareas y el contenido de estudio?',
    help: 'Marque las formas que usan los docentes con más frecuencia.',
    options: [
      {
        id: 'notebook',
        label: 'En clase, en el cuaderno o con fotocopias',
        score: 32,
        strength: 'El aula sigue siendo el centro del aprendizaje.',
        accompaniment: 'Lo que se explicó en clase puede quedar también en el campus del estudiante, para repasarlo en casa.',
      },
      {
        id: 'chat_email_tasks',
        label: 'Por WhatsApp, correo o fotos del tablero',
        score: 42,
        strength: 'Los docentes ya se esfuerzan por hacer llegar la tarea.',
        accompaniment: 'Esa tarea puede publicarse una vez en el curso, con fecha y material, y llegar a estudiantes y familias.',
      },
      {
        id: 'drive_classroom',
        label: 'Drive, Classroom u otra nube',
        score: 72,
        strength: 'El material de estudio ya vive en un lugar digital.',
        accompaniment: 'Comergio puede reunir ese contenido con la nota, la asistencia y el boletín, para que no quede separado del resto del periodo.',
      },
      {
        id: 'school_lms',
        label: 'Una plataforma académica del colegio',
        score: 90,
        strength: 'Tareas y contenidos ya tienen un lugar institucional.',
        accompaniment: 'Si esa plataforma está aparte de cartera y de las familias, Comergio puede ser el lugar donde el acudiente lo ve todo junto.',
      },
    ],
  },
  {
    id: 'grading_platform',
    areaId: 'academics',
    prompt: '¿En qué plataforma califican a los alumnos?',
    help: 'Si cada área lo hace distinto, puede marcar más de una.',
    options: [
      {
        id: 'gradebook_paper',
        label: 'Planilla en papel o cuaderno del docente',
        score: 30,
        strength: 'Los docentes ya llevan el registro de sus estudiantes.',
        accompaniment: 'Esa misma planilla puede vivir en el curso, para que coordinación consulte sin pedir el cuaderno.',
      },
      {
        id: 'spreadsheet_grades',
        label: 'Excel u hojas de cálculo',
        score: 48,
        strength: 'Las notas ya están en un archivo que se puede revisar.',
        accompaniment: 'Comergio calcula el periodo desde las actividades del curso y deja el historial con el docente, no solo en un archivo.',
      },
      {
        id: 'other_grade_platform',
        label: 'Otra plataforma de notas',
        score: 74,
        strength: 'Ya existe un lugar digital para calificar.',
        accompaniment: 'Esas notas pueden alimentar el boletín y el campus de familias sin volver a copiarlas.',
      },
      {
        id: 'each_teacher_own',
        label: 'Cada docente usa la herramienta que prefiere',
        score: 28,
        strength: 'Hay autonomía docente, y el colegio puede ordenarla con calma.',
        accompaniment: 'Un solo libro de notas por curso ayuda a coordinación y a rectoría a ver el periodo completo.',
      },
      {
        id: 'institutional_grades',
        label: 'Una plataforma institucional única',
        score: 92,
        strength: 'Las calificaciones ya están centralizadas.',
        accompaniment: 'Comergio puede conectar esa nota con el boletín, la asistencia y lo que ve la familia.',
      },
    ],
  },
  {
    id: 'report_cards',
    areaId: 'academics',
    prompt: '¿Cómo generan los boletines de periodo?',
    help: 'Piense en el camino desde la nota del docente hasta el documento que recibe la familia.',
    options: [
      {
        id: 'manual_document',
        label: 'Se arman a mano en Word, Excel o un formato',
        score: 28,
        strength: 'El equipo ya sabe qué debe decir el boletín.',
        accompaniment: 'Ese formato puede salir del mismo registro de notas, listo para revisión de coordinación y para la familia.',
      },
      {
        id: 'partial_manual',
        label: 'Una parte sale del sistema y otra se completa a mano',
        score: 52,
        strength: 'Ya hay una base digital del boletín.',
        accompaniment: 'Comergio reduce la parte manual: periodos, componentes y observaciones del docente quedan en el mismo informe.',
      },
      {
        id: 'external_vendor',
        label: 'Un proveedor o software especializado de boletines',
        score: 76,
        strength: 'El boletín ya tiene un proceso definido.',
        accompaniment: 'El informe puede entregarse en el campus de padres, junto con la pensión y los comunicados del periodo.',
      },
      {
        id: 'from_grades',
        label: 'Se generan desde las notas del periodo',
        score: 94,
        strength: 'El boletín nace de las notas, y eso cuida el tiempo del equipo.',
        accompaniment: 'Comergio puede conservar ese flujo y sumar la firma, el historial y la vista para la familia.',
      },
    ],
  },
  {
    id: 'attendance',
    areaId: 'academics',
    prompt: '¿Cómo llevan la asistencia?',
    help: 'Incluya lo que pasa en el aula y lo que después consulta coordinación.',
    options: [
      {
        id: 'paper_roll',
        label: 'Lista en papel',
        score: 30,
        strength: 'La lista en el aula es un hábito claro para los docentes.',
        accompaniment: 'Esa lista puede tomarse en el celular del docente y quedar el mismo día para coordinación y para la familia.',
      },
      {
        id: 'attendance_sheet',
        label: 'Excel o un formato compartido',
        score: 50,
        strength: 'La asistencia ya se puede consultar después de la clase.',
        accompaniment: 'Comergio la deja por curso y por fecha, sin depender de que el archivo esté actualizado.',
      },
      {
        id: 'teacher_tool',
        label: 'Cada docente en su propia herramienta',
        score: 36,
        strength: 'Los docentes registran la asistencia de alguna forma.',
        accompaniment: 'Un registro único por clase permite ver inasistencias del día sin reunir formatos.',
      },
      {
        id: 'institutional_attendance',
        label: 'Registro digital por clase, visible para el colegio',
        score: 92,
        strength: 'La asistencia ya es visible para el equipo.',
        accompaniment: 'Ese registro puede avisarse también a la familia y cruzarse con enfermería cuando el estudiante estuvo en el colegio.',
      },
    ],
  },
  {
    id: 'student_purchases',
    areaId: 'store',
    prompt: '¿Cómo compran los alumnos actualmente?',
    help: 'Si el colegio no tiene tienda ni cafetería, puede indicarlo.',
    options: [
      {
        id: 'no_store',
        label: 'No tienen tienda ni cafetería escolar',
        score: null,
        excludesArea: true,
        strength: 'Este frente no hace parte de la operación de hoy.',
        accompaniment: 'Si más adelante abren tienda o cafetería, las familias pueden recargar un saldo y el estudiante compra sin llevar efectivo.',
      },
      {
        id: 'cash_counter',
        label: 'Con efectivo en la tienda o la cafetería',
        score: 34,
        strength: 'La tienda ya atiende a los estudiantes cada día.',
        accompaniment: 'El papá puede recargar desde casa. El estudiante compra con saldo y rectoría ve el movimiento sin manejar tanto efectivo.',
      },
      {
        id: 'money_from_home',
        label: 'El acudiente envía dinero con el estudiante',
        score: 30,
        strength: 'Las familias ya participan en lo que el estudiante consume.',
        accompaniment: 'Esa decisión puede hacerse desde la app: recarga, tope diario y visibilidad de lo que se compró.',
      },
      {
        id: 'separate_pos',
        label: 'Caja, datáfono o sistema aparte de la tienda',
        score: 66,
        strength: 'La tienda ya tiene un control de caja.',
        accompaniment: 'Comergio puede unir esa caja con el saldo de la familia y con el resto de la operación del colegio.',
      },
      {
        id: 'prepaid_wallet',
        label: 'Saldo o app que el acudiente recarga',
        score: 90,
        strength: 'Las compras de los estudiantes ya están cuidadas desde casa.',
        accompaniment: 'Ese saldo puede vivir en el mismo lugar donde la familia ve pensión, comunicados y academia.',
      },
    ],
  },
  {
    id: 'nursing_notice',
    areaId: 'wellbeing',
    prompt: '¿Cómo comunican a los papás cuando un alumno está en enfermería?',
    help: 'Marque lo que ocurre con más frecuencia.',
    options: [
      {
        id: 'nurse_call',
        label: 'Llamada telefónica',
        score: 62,
        strength: 'La llamada directa cuida a la familia en un momento delicado.',
        accompaniment: 'La llamada puede mantenerse. Comergio deja además el aviso y el motivo en el historial, por si hay que retomarlo.',
      },
      {
        id: 'nurse_whatsapp',
        label: 'WhatsApp de enfermería o del colegio',
        score: 48,
        strength: 'Las familias reciben el aviso con rapidez.',
        accompaniment: 'Ese aviso puede salir del registro de la visita, para que no dependa del chat personal de quien está de turno.',
      },
      {
        id: 'end_of_day_note',
        label: 'Nota o comentario al final del día',
        score: 34,
        strength: 'Queda constancia de que algo ocurrió.',
        accompaniment: 'La familia puede enterarse mientras el estudiante aún está en enfermería, y el colegio conserva el caso.',
      },
      {
        id: 'depends_on_shift',
        label: 'Depende de quién esté de turno',
        score: 28,
        strength: 'El equipo de enfermería resuelve con los medios del momento.',
        accompaniment: 'Un mismo flujo —visita, aviso a la familia e historial— da la misma tranquilidad en cualquier turno.',
      },
      {
        id: 'nurse_platform',
        label: 'Aviso desde una plataforma, con registro',
        score: 92,
        strength: 'Enfermería ya avisa y deja registro.',
        accompaniment: 'Ese aviso puede llegar al mismo campus donde la familia ve lo demás del colegio.',
      },
    ],
  },
  {
    id: 'clinical_history',
    areaId: 'wellbeing',
    prompt: '¿Llevan historial de los casos clínicos?',
    help: 'Piense en lo que podría consultar enfermería si el estudiante vuelve.',
    options: [
      {
        id: 'no_clinical_history',
        label: 'No se guarda un historial',
        score: 24,
        strength: 'La atención del momento ya está resuelta por el equipo.',
        accompaniment: 'Un historial breve por estudiante ayuda a enfermería la próxima vez, y a la familia a ver lo que ya se atendió.',
      },
      {
        id: 'paper_clinical',
        label: 'Carpetas, fichas o cuadernos',
        score: 42,
        strength: 'Los casos quedan por escrito en el colegio.',
        accompaniment: 'Esa ficha puede consultarse por estudiante, con fecha y motivo, sin buscar la carpeta.',
      },
      {
        id: 'sheet_clinical',
        label: 'Excel, Drive u otro archivo',
        score: 58,
        strength: 'El historial ya se puede buscar.',
        accompaniment: 'Comergio lo deja junto a la ficha del estudiante y al aviso que recibió la familia.',
      },
      {
        id: 'clinical_system',
        label: 'Historial clínico digital del colegio',
        score: 94,
        strength: 'Los casos clínicos ya tienen memoria institucional.',
        accompaniment: 'Ese historial puede acompañar el aviso a la familia y el seguimiento de bienestar.',
      },
    ],
  },
];

export const INTERVIEW_OTHER_OPTION_ID = 'other';

export const SCHOOL_INTERVIEW_OTHER_PLACEHOLDERS = {
  family_news: 'Ej. usamos una app propia, cartelera y asamblea de padres…',
  parent_payments: 'Ej. consignación con soporte por correo y recibo en secretaría…',
  study_content: 'Ej. Moodle más cuaderno de actividades en clase…',
  grading_platform: 'Ej. un software de notas distinto por nivel…',
  report_cards: 'Ej. diseñamos el boletín en Canva y lo enviamos en PDF…',
  attendance: 'Ej. docentes marcan en una planilla compartida al final del día…',
  student_purchases: 'Ej. contrato con proveedor externo de cafetería…',
  nursing_notice: 'Ej. enfermería llama y luego deja constancia en una ficha…',
  clinical_history: 'Ej. llevamos registro en carpeta física por estudiante…',
};

export const SCHOOL_INTERVIEW_QUESTIONS = BASE_SCHOOL_INTERVIEW_QUESTIONS.map((question) => ({
  ...question,
  options: [
    ...question.options,
    { id: INTERVIEW_OTHER_OPTION_ID, label: 'Otro', isOther: true },
  ],
}));

export function normalizeQuestionAnswer(raw) {
  if (Array.isArray(raw)) {
    return { selectedIds: raw, otherText: '' };
  }
  if (raw && typeof raw === 'object') {
    return {
      selectedIds: Array.isArray(raw.selectedIds) ? raw.selectedIds : [],
      otherText: String(raw.otherText || '').trim(),
    };
  }
  return { selectedIds: [], otherText: '' };
}

export function getQuestionSelectedIds(raw) {
  return normalizeQuestionAnswer(raw).selectedIds;
}

export function isQuestionAnswerComplete(raw) {
  const { selectedIds, otherText } = normalizeQuestionAnswer(raw);
  if (!selectedIds.length) {
    return false;
  }
  if (selectedIds.includes(INTERVIEW_OTHER_OPTION_ID) && !otherText) {
    return false;
  }
  return true;
}

const TEXT_SIGNALS = [
  { pattern: /comergio|campus de padres|app del colegio|app institucional|portal institucional|plataforma propia|plataforma del colegio/i, score: 88, strength: 'Ya cuentan con un canal digital pensado para el colegio.', accompaniment: 'Comergio puede complementar o reunir ese canal con cartera, academia y bienestar en una sola experiencia para las familias.' },
  { pattern: /whatsapp|wsp|telegram|sms/i, score: 44, strength: 'Mantienen cercanía con las familias por mensaje.', accompaniment: 'Lo urgente puede seguir por chat. Lo institucional queda mejor registrado para rectoría y para cada acudiente.' },
  { pattern: /classroom|google drive|drive|moodle|teams|zoom|meet|canvas|blackboard|edmodo/i, score: 74, strength: 'Ya usan herramientas digitales en el día a día.', accompaniment: 'Esas herramientas pueden conversar con el libro de notas, la asistencia y lo que ve la familia, sin volver a copiar información.' },
  { pattern: /excel|hoja de c[aá]lculo|spreadsheet|google sheets|planilla/i, score: 48, strength: 'Tienen registros que el equipo ya sabe usar.', accompaniment: 'Esa misma información puede vivir en el sistema del colegio y actualizarse sola para coordinación y familias.' },
  { pattern: /papel|manual|cuaderno|libreta|ficha f[ií]sica|carpeta|impreso|fotocopia/i, score: 34, strength: 'El equipo ya tiene un ritual claro para sostener el proceso.', accompaniment: 'Se puede conservar lo que funciona en el aula y ir digitalizando el registro para que rectoría lo vea al momento.' },
  { pattern: /pse|nequi|daviplata|tarjeta|pasarela|epayco|bold|bancolombia|transferencia|consignaci[oó]n|dat[aá]fono/i, score: 78, strength: 'Las familias ya tienen opciones digitales para pagar o mover dinero.', accompaniment: 'Esos pagos pueden quedar ligados al estudiante y al concepto, sin conciliar a mano en cartera.' },
  { pattern: /efectivo|caja|ventanilla|oficina/i, score: 36, strength: 'La oficina sigue siendo un punto de confianza.', accompaniment: 'El pago presencial puede continuar mientras las familias también pueden hacerlo desde casa.' },
  { pattern: /tienda|cafeter[ií]a|kiosco|restaurante|proveedor|pos|caja registradora/i, score: 62, strength: 'La operación de tienda o cafetería ya está en marcha.', accompaniment: 'El saldo familiar y la caja pueden verse junto al resto de la operación del colegio.' },
  { pattern: /enfermer[ií]a|cl[ií]nica|salud|bienestar|psicolog[ií]a|historial cl[ií]nico|ficha m[eé]dica/i, score: 70, strength: 'El cuidado de salud y bienestar ya tiene un lugar en el colegio.', accompaniment: 'Cada visita puede quedar registrada y avisarse a la familia desde el mismo campus.' },
  { pattern: /bolet[ií]n|informe|report card|calificaci[oó]n|notas|asistencia/i, score: 68, strength: 'El seguimiento académico ya es parte de la rutina del colegio.', accompaniment: 'Notas, asistencia y boletín pueden salir del mismo registro del periodo.' },
];

function analyzeOtherText(areaId, questionId, text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return null;
  }

  let best = null;
  TEXT_SIGNALS.forEach((signal) => {
    if (signal.pattern.test(trimmed)) {
      if (!best || signal.score > best.score) {
        best = signal;
      }
    }
  });

  if (best) {
    return {
      score: best.score,
      strength: best.strength,
      accompaniment: best.accompaniment,
      summary: `Mencionan: «${trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed}».`,
    };
  }

  if (/digital|software|sistema|plataforma|app|automat/i.test(trimmed)) {
    return {
      score: 68,
      strength: 'Ya apoyan el proceso con alguna herramienta digital.',
      accompaniment: 'Esa herramienta puede integrarse con el resto de la operación para que el equipo no tenga que mirar varios lugares.',
      summary: `Describen un proceso digital: «${trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed}».`,
    };
  }

  if (/manual|persona|secretar[ií]a|coordinaci[oó]n|docente|llamada|reuni[oó]n/i.test(trimmed)) {
    return {
      score: 42,
      strength: 'El proceso hoy depende del cuidado del equipo, y eso se valora.',
      accompaniment: 'Comergio puede quitarle carga repetitiva al equipo y dejar el mismo servicio con mejor registro para rectoría.',
      summary: `Lo hacen con el equipo: «${trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed}».`,
    };
  }

  return {
    score: 52,
    strength: 'Tienen una forma de trabajo propia que ya conocen.',
    accompaniment: `Lo que nos cuenta puede ordenarse en Comergio sin cambiar de golpe la cultura del colegio: «${trimmed.length > 100 ? `${trimmed.slice(0, 97)}…` : trimmed}».`,
    summary: `Proceso particular: «${trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed}».`,
  };
}

function clampScore(value) {
  return Math.max(16, Math.min(96, Math.round(value)));
}

function questionById(questionId) {
  return SCHOOL_INTERVIEW_QUESTIONS.find((question) => question.id === questionId) || null;
}

export function scoreQuestion(question, answerPayload = {}) {
  const { selectedIds, otherText } = normalizeQuestionAnswer(answerPayload);
  const selected = (question?.options || []).filter((option) => (
    selectedIds.includes(option.id) && option.id !== INTERVIEW_OTHER_OPTION_ID
  ));

  if (selectedIds.includes(INTERVIEW_OTHER_OPTION_ID)) {
    const inferred = analyzeOtherText(question.areaId, question.id, otherText);
    if (inferred) {
      selected.push({
        id: `${INTERVIEW_OTHER_OPTION_ID}-inferred`,
        label: 'Otro',
        score: inferred.score,
        strength: inferred.strength,
        accompaniment: inferred.accompaniment,
        otherSummary: inferred.summary,
      });
    }
  }

  if (!selected.length) {
    return { status: 'empty', score: null, selected: [], otherText };
  }

  const exclusions = selected.filter((option) => option.excludesArea);
  const scored = selected.filter((option) => !option.excludesArea && Number.isFinite(option.score));
  if (!scored.length && exclusions.length) {
    return { status: 'excluded', score: null, selected, otherText };
  }

  const maxScore = Math.max(...scored.map((option) => option.score));
  const average = scored.reduce((total, option) => total + option.score, 0) / scored.length;
  const hasStrongPractice = scored.some((option) => option.score >= 80);
  const informalCount = scored.filter((option) => option.score < 60).length;
  const blended = hasStrongPractice
    ? (maxScore * 0.84) + (average * 0.16) - (informalCount * 3)
    : average;

  return {
    status: 'scored',
    score: clampScore(blended),
    selected,
    otherText,
  };
}

function bandForScore(score) {
  if (score >= 85) {
    return {
      id: 'joined',
      label: 'Muy articulado',
      headline: 'El colegio ya tiene procesos reunidos.',
      paragraph: 'Varias áreas cuentan con un camino claro. Comergio puede acompañar para que familias, docentes y rectoría vean esa misma información en un solo lugar, con menos idas y vueltas entre herramientas.',
    };
  }
  if (score >= 70) {
    return {
      id: 'ordered',
      label: 'Bien encaminado',
      headline: 'Hay una base ordenada sobre la cual seguir.',
      paragraph: 'El colegio ya resolvió partes importantes de la operación. El acompañamiento de Comergio está en unir lo que hoy vive en lugares distintos, para que el equipo gane tiempo y las familias encuentren todo con más calma.',
    };
  }
  if (score >= 52) {
    return {
      id: 'evolving',
      label: 'En evolución',
      headline: 'Los procesos avanzan y todavía pueden reunirse.',
      paragraph: 'Parte del día a día ya es digital y otra parte sigue en manos del equipo. Es un momento cómodo para acompañar: se conserva lo que funciona y se ordena lo que hoy se rehace en varios canales.',
    };
  }
  return {
    id: 'open',
    label: 'Con amplio espacio de acompañamiento',
    headline: 'Hay una oportunidad serena de acompañar al colegio.',
    paragraph: 'Hoy gran parte de la operación depende del cuidado del equipo y de canales cercanos a las familias. Comergio puede ir tomando esos procesos con calma, para que rectoría tenga visibilidad y las familias reciban la información en un solo campus.',
  };
}

function areaSentence(areaId, score) {
  const high = score >= 80;
  const mid = score >= 55;
  const copy = {
    communications: high
      ? 'Las familias ya tienen un canal institucional. El siguiente cuidado es que ese canal converse con el resto de la vida escolar.'
      : mid
        ? 'Los avisos llegan. Un registro único ayudaría a que rectoría sepa qué se envió y a que cada familia lo encuentre después.'
        : 'Los avisos salen con dedicación del equipo. Un canal del colegio puede conservar esa cercanía y dejar constancia para todos los acudientes.',
    billing: high
      ? 'Las familias ya cuentan con una forma ordenada de pagar. Comergio puede dejar ese pago junto al resto de la relación con el colegio.'
      : mid
        ? 'Hay medios de pago. Cartera ganaría tranquilidad si el estado de cada familia se actualiza sin conciliar a mano.'
        : 'El recaudo hoy pide bastante seguimiento del equipo. Las familias pueden pagar desde casa y cartera puede ver el estado sin armarlo de nuevo.',
    academics: high
      ? 'Academia ya tiene estructura. El valor está en que tareas, notas, asistencia y boletín se lean como un solo periodo.'
      : mid
        ? 'Hay piezas digitales del proceso académico. Unirlas evita volver a copiar la nota en el boletín o la tarea en el chat.'
        : 'Los docentes sostienen el seguimiento con mucha dedicación. Un curso digital les devuelve tiempo y le da a coordinación una lectura del periodo.',
    store: high
      ? 'La tienda ya cuida la compra del estudiante. Puede compartir casa con la recarga de la familia y el resto del campus.'
      : mid
        ? 'La caja de la tienda tiene control. El saldo familiar reduciría el efectivo y le mostraría al acudiente lo que se compró.'
        : 'La tienda atiende bien el día a día. Un saldo recargado por la familia alivia el efectivo y deja el movimiento a la vista.',
    wellbeing: high
      ? 'Enfermería ya deja rastro y avisa. Ese cuidado puede llegar a la familia en el mismo lugar donde ve lo demás.'
      : mid
        ? 'La familia se entera y queda alguna constancia. Un historial por estudiante haría más fácil la siguiente atención.'
        : 'El equipo atiende con cercanía. Un mismo flujo de visita, aviso e historial da la misma calma en cualquier turno.',
  };
  return copy[areaId] || '';
}

function collectAccompaniments(questionResults) {
  const items = [];
  questionResults.forEach((result) => {
    if (result.status === 'empty' || result.score == null || result.score >= 88) {
      return;
    }
    const ranked = [...result.selected]
      .filter((option) => option.accompaniment && !option.excludesArea)
      .sort((left, right) => left.score - right.score);
    const pick = ranked[0];
    if (!pick) {
      return;
    }
    items.push({
      questionId: result.questionId,
      areaId: result.areaId,
      title: SCHOOL_INTERVIEW_AREAS.find((area) => area.id === result.areaId)?.label || 'Acompañamiento',
      text: pick.accompaniment,
      priority: pick.score,
    });
  });

  const excludedStore = questionResults.find((result) => result.questionId === 'student_purchases' && result.status === 'excluded');
  if (excludedStore) {
    const option = excludedStore.selected.find((item) => item.excludesArea);
    if (option?.accompaniment) {
      items.push({
        questionId: 'student_purchases',
        areaId: 'store',
        title: 'Tienda escolar',
        text: option.accompaniment,
        priority: 80,
      });
    }
  }

  return items
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 5);
}

function collectStrengths(questionResults) {
  const strengths = [];
  questionResults.forEach((result) => {
    result.selected
      .filter((option) => option.strength && (option.score == null || option.score >= 58 || option.excludesArea))
      .forEach((option) => {
        if (!strengths.includes(option.strength)) {
          strengths.push(option.strength);
        }
      });
  });

  if (!strengths.length) {
    strengths.push('El equipo ya sostiene la operación día a día y mantiene una relación cercana con las familias. Ese cuidado es el mejor punto de partida.');
  }

  return strengths.slice(0, 4);
}

export function buildSchoolInterviewReport(answers = {}) {
  const questionResults = SCHOOL_INTERVIEW_QUESTIONS.map((question) => {
    const scored = scoreQuestion(question, answers[question.id]);
    return {
      questionId: question.id,
      areaId: question.areaId,
      prompt: question.prompt,
      ...scored,
    };
  });

  const areas = SCHOOL_INTERVIEW_AREAS.map((area) => {
    const results = questionResults.filter((result) => result.areaId === area.id);
    const scored = results.filter((result) => result.status === 'scored' && result.score != null);
    const excluded = results.length > 0 && results.every((result) => result.status === 'excluded' || result.status === 'empty')
      && results.some((result) => result.status === 'excluded');
    if (!scored.length) {
      return {
        ...area,
        score: null,
        excluded,
        sentence: excluded
          ? 'Hoy este frente no hace parte de la operación. Si más adelante lo necesitan, se puede acompañar sin cambiar el resto.'
          : 'Aún no hay una lectura de este frente.',
      };
    }
    const score = clampScore(scored.reduce((total, result) => total + result.score, 0) / scored.length);
    return {
      ...area,
      score,
      excluded: false,
      sentence: areaSentence(area.id, score),
    };
  });

  const included = areas.filter((area) => area.score != null);
  const overall = included.length
    ? clampScore(included.reduce((total, area) => total + area.score, 0) / included.length)
    : null;
  const band = overall == null ? null : bandForScore(overall);

  const otherInsights = questionResults
    .filter((result) => result.otherText)
    .map((result) => {
      const inferred = result.selected.find((option) => option.otherSummary);
      const areaLabel = SCHOOL_INTERVIEW_AREAS.find((area) => area.id === result.areaId)?.label || 'Proceso';
      return {
        questionId: result.questionId,
        areaId: result.areaId,
        areaLabel,
        prompt: result.prompt,
        text: result.otherText,
        summary: inferred?.otherSummary || '',
        accompaniment: inferred?.accompaniment || '',
      };
    });

  return {
    overall,
    band,
    areas,
    strengths: collectStrengths(questionResults),
    accompaniments: collectAccompaniments(questionResults),
    otherInsights,
    questionResults: questionResults.map((result) => ({
      questionId: result.questionId,
      areaId: result.areaId,
      status: result.status,
      score: result.score,
      otherText: result.otherText || '',
      selectedIds: result.selected
        .map((option) => option.id)
        .filter((id) => !String(id).startsWith(`${INTERVIEW_OTHER_OPTION_ID}-`)),
    })),
  };
}

export function interviewAnswersComplete(answers = {}) {
  return SCHOOL_INTERVIEW_QUESTIONS.every((question) => isQuestionAnswerComplete(answers[question.id]));
}

export function getInterviewQuestion(questionId) {
  return questionById(questionId);
}
