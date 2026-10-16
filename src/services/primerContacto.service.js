const AdmissionApplicant = require('../models/admissionApplicant.model');
const AcademicStructure = require('../models/academicStructure.model');
const { runWithSchoolContext } = require('../config/db');
const { sendAdmissionAppointmentEmail, sendBerckleyAdmissionsOfficeAppointmentEmail } = require('./brevo.service');
const { getSchoolDisplayName } = require('../utils/schoolDisplayName');
const {
  SLOT_DURATION_MINUTES,
  resolveWindows,
  resolveSlotTimes,
  isSlotBlocked,
  getAgendaSettings,
} = require('./admissionAgenda.service');

const BERCKLEY_SCHOOL_ID = 'International Berckley School';
const MILLENNIUM_SCHOOL_ID = 'Millennium School';
const WHATSAPP_NUMBER = '573165283537';
const MILLENNIUM_WHATSAPP_NUMBER = '573113212856';

const PRIMER_CONTACTO_PROFILES = {
  berckley: {
    key: 'berckley',
    schoolId: BERCKLEY_SCHOOL_ID,
    whatsappNumber: WHATSAPP_NUMBER,
    defaultReference: 'Primer contacto — comergio.com/berckleyprimercontacto',
    applicantNotes: 'Registro desde Primer Contacto (comergio.com/berckleyprimercontacto).',
    whatsappIntro: 'Hola, me interesa International Berckley School. Acabo de registrar mis datos en Primer Contacto y quiero continuar por WhatsApp.',
    referenceWhatsappLabel: 'Cómo llegaste al Berckley',
    sendBerckleyOfficeEmail: true,
    guardianEmailNotes: 'Gracias por dar el primer paso con International Berckley School. Nuestro equipo de Admisiones te acompañará en cada etapa del proceso. Si necesitas reprogramar, responde este correo o escríbenos por WhatsApp.',
    guardianEmailRetentionIntro: 'Estamos muy contentos de conocerte. Esta cita es el comienzo de una experiencia educativa bilingüe, cercana y diseñada para que tu familia se sienta acompañada desde el primer momento.',
  },
  millennium: {
    key: 'millennium',
    schoolId: MILLENNIUM_SCHOOL_ID,
    whatsappNumber: MILLENNIUM_WHATSAPP_NUMBER,
    defaultReference: 'Primer contacto — comergio.com/millenniumprimercontacto',
    applicantNotes: 'Registro desde Primer Contacto (comergio.com/millenniumprimercontacto).',
    whatsappIntro: 'Hola, me interesa Millennium School. Acabo de registrar mis datos en Primer Contacto y quiero continuar por WhatsApp.',
    referenceWhatsappLabel: 'Cómo llegaste a Millennium School',
    sendBerckleyOfficeEmail: false,
    guardianEmailNotes: 'Gracias por dar el primer paso con Millennium School. Nuestro equipo de Admisiones te acompañará en cada etapa del proceso. Si necesitas reprogramar, responde este correo o escríbenos por WhatsApp.',
    guardianEmailRetentionIntro: 'Estamos muy contentos de conocerte. Esta cita es el comienzo de una experiencia educativa cercana y diseñada para que tu familia se sienta acompañada desde el primer momento.',
  },
};

const APPOINTMENT_TYPE_LABELS = {
  virtual: 'Cita virtual',
  phone: 'Llamada telefónica',
  in_person: 'Cita presencial',
  none: 'Sin cita',
};

const LOCATION_OPTIONS = {
  sede_km5: 'Sede km 5 (primaria y secundaria)',
  sede_villacampestre: 'Sede Villacampestre (preescolar)',
};

const HOW_HEARD_OPTIONS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  google: 'Google',
  referido: 'Referido',
  activacion_mall_plaza: 'Activación mall plaza',
  otro: 'Otro',
};

const ADDITIONAL_REQUEST_LABELS = {
  bloom: 'Información programa de estimulación BLOOM',
  millennium_discovery: 'Información colegio millennium y discovery',
  none: 'Ninguna',
};

function normalizeText(value) {
  return String(value || '').trim();
}

function resolvePrimerContactoProfile(profileKey = 'berckley') {
  const key = normalizeText(profileKey).toLowerCase();
  return PRIMER_CONTACTO_PROFILES[key] || PRIMER_CONTACTO_PROFILES.berckley;
}

function resolveHowHeardReference(body = {}, defaultReference = PRIMER_CONTACTO_PROFILES.berckley.defaultReference) {
  const howHeard = String(body.howHeard || body.howDidYouHear || '').trim().toLowerCase();
  const howHeardOther = normalizeText(body.howHeardOther || body.howDidYouHearOther);
  const explicitReference = normalizeText(body.referenceOrigin || body.source?.referenceOrigin);

  if (howHeard === 'otro') {
    return howHeardOther || explicitReference;
  }
  if (HOW_HEARD_OPTIONS[howHeard]) {
    return HOW_HEARD_OPTIONS[howHeard];
  }
  return explicitReference || defaultReference;
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeAdditionalRequest(value) {
  const raw = normalizeText(value).toLowerCase();
  if (['bloom', 'millennium_discovery', 'none'].includes(raw)) return raw;
  return '';
}

function getAdditionalRequestLabel(value) {
  const key = normalizeAdditionalRequest(value);
  return key ? (ADDITIONAL_REQUEST_LABELS[key] || key) : '';
}

function normalizeStudentAge(value) {
  return normalizeText(value);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function normalizeAppointmentType(value) {
  const raw = normalizeText(value).toLowerCase().replace(/-/g, '_');
  if (['virtual', 'cita_virtual'].includes(raw)) return 'virtual';
  if (['phone', 'llamada', 'llamada_telefonica', 'llamada_telefónica', 'telefono', 'teléfono'].includes(raw)) return 'phone';
  if (['in_person', 'presencial', 'cita_presencial'].includes(raw)) return 'in_person';
  if (['none', 'sin_cita', 'sin_cita_agendada', 'no_appointment'].includes(raw)) return 'none';
  return '';
}

function normalizeLocationKey(value) {
  const raw = normalizeText(value).toLowerCase().replace(/\s+/g, '_');
  if (['sede_km5', 'km5', 'km_5', 'sede_km_5'].includes(raw)) return 'sede_km5';
  if (['sede_villacampestre', 'villacampestre', 'villla_campestre'].includes(raw)) return 'sede_villacampestre';
  return '';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function timeToMinutes(time) {
  const [hour, minute] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return (hour * 60) + minute;
}

function slotsOverlap(timeA, timeB, durationMinutes = SLOT_DURATION_MINUTES) {
  const startA = timeToMinutes(timeA);
  const startB = timeToMinutes(timeB);
  if (startA === null || startB === null) return false;
  const endA = startA + durationMinutes;
  const endB = startB + durationMinutes;
  return startA < endB && startB < endA;
}

function formatAppointmentDateLabel(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey || '';
  return date.toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimeLabel(time) {
  const minutes = timeToMinutes(time);
  if (minutes === null) return time;
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? 'pm' : 'am';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${pad2(minute)}${suffix}`;
}

function serializeRectoriaGradeOptions(academicStructure = {}) {
  const seenValues = new Set();
  return (Array.isArray(academicStructure?.grades) ? academicStructure.grades : [])
    .filter((grade) => normalizeText(grade?.status || 'active') !== 'archived')
    .map((grade) => {
      const key = normalizeText(grade?.key);
      const label = normalizeText(grade?.label || grade?.key);
      return {
        key,
        value: label || key,
        label: label || key,
        levelKey: normalizeText(grade?.levelKey),
        order: Number(grade?.order || 0),
      };
    })
    .filter((grade) => {
      if (!grade.value || seenValues.has(grade.value)) return false;
      seenValues.add(grade.value);
      return true;
    })
    .sort((left, right) => (left.order - right.order) || left.label.localeCompare(right.label, 'es', { numeric: true }));
}

async function getRectoriaGradeOptions(schoolId = BERCKLEY_SCHOOL_ID) {
  const academicStructure = await AcademicStructure.findOne({ schoolId }).select('grades').lean();
  return serializeRectoriaGradeOptions(academicStructure);
}

function getGradeLabel(grade, gradeOptions = []) {
  const normalized = normalizeText(grade);
  const match = (Array.isArray(gradeOptions) ? gradeOptions : []).find((option) => (
    option.value === normalized || option.key === normalized || option.label === normalized
  ));
  return match?.label || normalized;
}

function resolveCalendarLocation({ appointmentType, locationKey, schoolName }) {
  if (appointmentType === 'virtual') return 'Cita virtual (videollamada)';
  if (appointmentType === 'phone') return 'Llamada telefónica';
  if (locationKey && LOCATION_OPTIONS[locationKey]) return LOCATION_OPTIONS[locationKey];
  return schoolName || 'International Berckley School';
}

function buildWhatsAppMessage(payload, profile = PRIMER_CONTACTO_PROFILES.berckley) {
  const {
    fullName,
    birthDate,
    previousSchool,
    guardianName,
    guardianEmail,
    guardianPhone,
    grade,
    academicYear,
    appointmentType,
    appointmentDate,
    appointmentTime,
    locationKey,
    referenceOrigin,
    studentAge,
    additionalRequest,
  } = payload;

  const typeLabel = APPOINTMENT_TYPE_LABELS[appointmentType] || appointmentType;
  const additionalLabel = getAdditionalRequestLabel(additionalRequest);
  const locationLabel = appointmentType === 'in_person'
    ? (LOCATION_OPTIONS[locationKey] || '')
    : resolveCalendarLocation({ appointmentType, locationKey, schoolName: profile.schoolId });

  return [
    profile.whatsappIntro,
    '',
    fullName ? `• Aspirante: ${fullName}` : '',
    birthDate ? `• Fecha de nacimiento: ${birthDate}` : '',
    studentAge ? `• Edad: ${studentAge}` : '',
    previousSchool ? `• Colegio de procedencia: ${previousSchool}` : '',
    guardianName ? `• Acudiente: ${guardianName}` : '',
    guardianEmail ? `• Email: ${guardianEmail}` : '',
    guardianPhone ? `• Teléfono: ${guardianPhone}` : '',
    grade ? `• Grado/programa: ${grade}` : '',
    academicYear ? `• Periodo: ${academicYear}` : '',
    referenceOrigin ? `• ${profile.referenceWhatsappLabel}: ${referenceOrigin}` : '',
    additionalLabel ? `• Solicitudes adicionales: ${additionalLabel}` : '',
    appointmentType ? `• Tipo de cita: ${typeLabel}` : '',
    appointmentType === 'none' ? '' : `• Fecha: ${formatAppointmentDateLabel(appointmentDate)}`,
    appointmentType === 'none' ? '' : `• Hora: ${formatTimeLabel(appointmentTime)}`,
    appointmentType === 'none' || !locationLabel ? '' : `• Ubicación: ${locationLabel}`,
  ].filter(Boolean).join('\n');
}

function buildWhatsAppUrl(message, whatsappNumber = WHATSAPP_NUMBER) {
  return `https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${encodeURIComponent(message)}`;
}

async function listBusyAppointments(schoolId, fromDateKey, toDateKey) {
  const applicants = await AdmissionApplicant.find({
    schoolId,
    deletedAt: null,
    'admissionEvents.appointment.date': { $gte: fromDateKey, $lte: toDateKey },
  }).select('admissionEvents.appointment').lean();

  const busy = [];
  applicants.forEach((applicant) => {
    (applicant.admissionEvents || []).forEach((eventItem) => {
      const appointment = eventItem?.appointment || {};
      if (!appointment.date || !appointment.time) return;
      if (appointment.date < fromDateKey || appointment.date > toDateKey) return;
      busy.push({
        date: appointment.date,
        time: appointment.time,
      });
    });
  });
  return busy;
}

function isSlotBusy(busyAppointments, dateKey, time) {
  return busyAppointments.some((item) => (
    item.date === dateKey && slotsOverlap(item.time, time)
  ));
}

function buildAvailabilityDays({
  fromDate = new Date(),
  dayCount = 21,
  busyAppointments = [],
  agendaSettings = null,
} = {}) {
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const days = [];
  const slotTimes = resolveSlotTimes(agendaSettings);

  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(start, offset);
    if (!isWeekday(date)) continue;

    const dateKey = toDateKey(date);
    const slots = slotTimes.map((time) => {
      const blocked = isSlotBlocked(agendaSettings, dateKey, time);
      const busy = isSlotBusy(busyAppointments, dateKey, time);
      return {
        time,
        label: formatTimeLabel(time),
        available: !blocked && !busy,
      };
    });

    days.push({
      date: dateKey,
      label: formatAppointmentDateLabel(dateKey),
      weekdayShort: date.toLocaleDateString('es-CO', { weekday: 'short' }),
      dayNumber: date.getDate(),
      monthLabel: date.toLocaleDateString('es-CO', { month: 'short' }),
      slots,
      availableCount: slots.filter((slot) => slot.available).length,
    });
  }

  return days;
}

async function getPrimerContactoAvailabilityForProfile(profileKey, { from, days = 21 } = {}) {
  const profile = resolvePrimerContactoProfile(profileKey);
  return runWithSchoolContext(profile.schoolId, async () => {
    const fromDate = from ? parseDateKey(from) : new Date();
    const safeFrom = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : new Date();
    const dayCount = Math.min(42, Math.max(7, Number(days) || 21));
    const toDate = addDays(safeFrom, dayCount - 1);
    const fromDateKey = toDateKey(safeFrom);
    const toDateKeyValue = toDateKey(toDate);
    const [busyAppointments, agendaSettings, gradeOptions] = await Promise.all([
      listBusyAppointments(profile.schoolId, fromDateKey, toDateKeyValue),
      getAgendaSettings(profile.schoolId),
      getRectoriaGradeOptions(profile.schoolId),
    ]);

    return {
      schoolId: profile.schoolId,
      schoolName: await getSchoolDisplayName(profile.schoolId) || profile.schoolId,
      timezone: 'America/Bogota',
      slotDurationMinutes: SLOT_DURATION_MINUTES,
      windows: resolveWindows(agendaSettings).map((window, index) => ({
        label: agendaSettings.usesCustomRange ? 'Disponible' : (index === 0 ? 'Mañana' : 'Tarde'),
        start: window.start,
        end: window.end,
      })),
      appointmentTypes: [
        { value: 'virtual', label: APPOINTMENT_TYPE_LABELS.virtual },
        { value: 'phone', label: APPOINTMENT_TYPE_LABELS.phone },
        { value: 'in_person', label: APPOINTMENT_TYPE_LABELS.in_person },
        { value: 'none', label: APPOINTMENT_TYPE_LABELS.none },
      ],
      locations: Object.entries(LOCATION_OPTIONS).map(([value, label]) => ({ value, label })),
      grades: gradeOptions,
      days: buildAvailabilityDays({
        fromDate: safeFrom,
        dayCount,
        busyAppointments,
        agendaSettings,
      }),
    };
  });
}

async function getPrimerContactoAvailability(options = {}) {
  return getPrimerContactoAvailabilityForProfile('berckley', options);
}

async function getMillenniumPrimerContactoAvailability(options = {}) {
  return getPrimerContactoAvailabilityForProfile('millennium', options);
}

function validatePrimerContactoPayload(body = {}, gradeOptions = [], agendaSettings = null, profile = PRIMER_CONTACTO_PROFILES.berckley) {
  const noSchooling = Boolean(body.noSchooling);
  const fullName = normalizeText(body.fullName || body.student?.firstName);
  const birthDate = normalizeText(body.birthDate || body.student?.birthDate);
  let previousSchool = normalizeText(body.previousSchool || body.student?.previousSchool);
  if (noSchooling) previousSchool = 'Sin escolaridad';
  const studentAge = normalizeStudentAge(body.studentAge || body.student?.age);
  const guardianName = normalizeText(body.guardianName || body.guardian?.name);
  const guardianEmail = normalizeEmail(body.guardianEmail || body.guardian?.email);
  const guardianPhone = normalizeText(body.guardianPhone || body.guardian?.phone);
  const grade = normalizeText(body.grade);
  const academicYear = normalizeText(body.academicYear) || '2026-2027';
  const appointmentType = normalizeAppointmentType(body.appointmentType || body.appointment?.type);
  const appointmentDate = normalizeText(body.appointmentDate || body.appointment?.date);
  const appointmentTime = normalizeText(body.appointmentTime || body.appointment?.time);
  const locationKey = normalizeLocationKey(body.locationKey || body.appointmentLocation || body.appointment?.locationKey);
  const howHeard = String(body.howHeard || body.howDidYouHear || '').trim().toLowerCase();
  const howHeardOther = normalizeText(body.howHeardOther || body.howDidYouHearOther);
  const referenceOrigin = resolveHowHeardReference(body, profile.defaultReference);
  const additionalRequest = normalizeAdditionalRequest(
    body.additionalRequest || body.source?.additionalRequest,
  );

  const invalid = [];
  if (guardianEmail && !isValidEmail(guardianEmail)) invalid.push('email del acudiente válido');
  const schedulingAppointment = Boolean(appointmentType && appointmentType !== 'none');
  if (schedulingAppointment && !appointmentDate) invalid.push('fecha de la cita');
  if (schedulingAppointment && !appointmentTime) invalid.push('hora de la cita');
  if (appointmentType === 'in_person' && schedulingAppointment && !locationKey) invalid.push('sede presencial');

  if (invalid.length) {
    const error = new Error(`Revisa: ${invalid.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }

  const allowedGrades = Array.isArray(gradeOptions) ? gradeOptions : [];
  if (grade && allowedGrades.length) {
    const gradeAllowed = allowedGrades.some((option) => (
      option.value === grade || option.key === grade || option.label === grade
    ));
    if (!gradeAllowed) {
      const error = new Error('El grado seleccionado no está disponible. Elige un grado configurado por Rectoría.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (schedulingAppointment) {
    const offeredTimes = resolveSlotTimes(agendaSettings);
    if (!offeredTimes.includes(appointmentTime) || isSlotBlocked(agendaSettings, appointmentDate, appointmentTime)) {
      const error = new Error('La hora seleccionada no está disponible. Elige otro horario.');
      error.statusCode = 400;
      throw error;
    }

    const dateObj = parseDateKey(appointmentDate);
    if (!dateObj || !isWeekday(dateObj)) {
      const error = new Error('Las citas solo están disponibles de lunes a viernes.');
      error.statusCode = 400;
      throw error;
    }

    const todayKey = toDateKey(new Date());
    if (appointmentDate < todayKey) {
      const error = new Error('No puedes agendar una cita en una fecha pasada.');
      error.statusCode = 400;
      throw error;
    }
  }

  return {
    fullName,
    birthDate,
    previousSchool,
    studentAge,
    guardianName,
    guardianEmail,
    guardianPhone,
    grade,
    academicYear,
    appointmentType: appointmentType || 'none',
    appointmentDate: schedulingAppointment ? appointmentDate : '',
    appointmentTime: schedulingAppointment ? appointmentTime : '',
    locationKey: schedulingAppointment ? locationKey : '',
    howHeard,
    howHeardOther: howHeard === 'otro' ? howHeardOther : '',
    referenceOrigin,
    additionalRequest,
  };
}

async function submitPrimerContactoForProfile(profileKey, body = {}) {
  const profile = resolvePrimerContactoProfile(profileKey);
  return runWithSchoolContext(profile.schoolId, async () => {
    const [gradeOptions, agendaSettings] = await Promise.all([
      getRectoriaGradeOptions(profile.schoolId),
      getAgendaSettings(profile.schoolId),
    ]);
    const payload = validatePrimerContactoPayload(body, gradeOptions, agendaSettings, profile);
    const gradeLabel = getGradeLabel(payload.grade, gradeOptions);
    const schedulingAppointment = payload.appointmentType !== 'none';

    if (schedulingAppointment) {
      const busyAppointments = await listBusyAppointments(
        profile.schoolId,
        payload.appointmentDate,
        payload.appointmentDate,
      );

      if (isSlotBusy(busyAppointments, payload.appointmentDate, payload.appointmentTime)) {
        const error = new Error('Ese horario acaba de ocuparse. Elige otra hora disponible.');
        error.statusCode = 409;
        throw error;
      }
    }

    const schoolName = await getSchoolDisplayName(profile.schoolId) || profile.schoolId;
    const typeLabel = APPOINTMENT_TYPE_LABELS[payload.appointmentType];
    const locationLabel = schedulingAppointment
      ? resolveCalendarLocation({
        appointmentType: payload.appointmentType,
        locationKey: payload.locationKey,
        schoolName,
      })
      : '';
    const scheduledAt = schedulingAppointment
      ? new Date(`${payload.appointmentDate}T${payload.appointmentTime}:00`)
      : null;

    const admissionEvents = [
      {
        title: 'Aspirante creado',
        notes: profile.applicantNotes,
        stageKey: 'interesados',
        stageLabel: 'Interesados',
        responsible: 'Primer Contacto',
        inProgress: true,
        createdByName: 'Primer Contacto web',
      },
    ];

    if (schedulingAppointment) {
      admissionEvents.push({
        title: 'CITA AGENDADA',
        notes: `CITA AGENDADA: ${typeLabel} · ${payload.appointmentDate} ${payload.appointmentTime}${payload.appointmentType === 'in_person' ? ` · ${locationLabel}` : ''}`,
        stageKey: 'agendamiento',
        stageLabel: 'Agendamiento',
        responsible: 'Primer Contacto',
        clientVisible: true,
        inProgress: true,
        createdByName: 'Primer Contacto web',
        appointment: {
          type: payload.appointmentType,
          label: typeLabel,
          date: payload.appointmentDate,
          time: payload.appointmentTime,
          locationKey: payload.locationKey || '',
          locationLabel: payload.appointmentType === 'in_person' ? locationLabel : '',
          guardianEmail: payload.guardianEmail,
          scheduledAt: scheduledAt && !Number.isNaN(scheduledAt.getTime()) ? scheduledAt : null,
        },
      });
    } else {
      admissionEvents.push({
        title: 'PRIMER CONTACTO SIN CITA',
        notes: `Tipo de contacto: ${typeLabel}. El aspirante dejó sus datos sin agendar fecha y hora.`,
        stageKey: 'interesados',
        stageLabel: 'Interesados',
        responsible: 'Primer Contacto',
        clientVisible: true,
        inProgress: true,
        createdByName: 'Primer Contacto web',
      });
    }

    const applicant = await AdmissionApplicant.create({
      schoolId: profile.schoolId,
      student: {
        firstName: payload.fullName,
        lastName: '',
        birthDate: payload.birthDate ? new Date(`${payload.birthDate}T12:00:00`) : null,
        age: payload.studentAge,
        previousSchool: payload.previousSchool,
      },
      guardian: {
        name: payload.guardianName,
        email: payload.guardianEmail,
        phone: payload.guardianPhone,
      },
      grade: payload.grade,
      academicYear: payload.academicYear,
      source: {
        referenceOrigin: payload.referenceOrigin,
        additionalRequest: payload.additionalRequest,
      },
      currentStageKey: 'interesados',
      status: 'interested',
      admissionStages: [
        { key: 'interesados', label: 'Interesados', confirmed: false, inProgress: true },
        { key: 'informacion-enviada', label: 'Información enviada', confirmed: false, inProgress: false },
        { key: 'agendamiento', label: 'Agendamiento', confirmed: false, inProgress: false },
        { key: 'inscripcion', label: 'Inscripción', confirmed: false, inProgress: false },
        { key: 'prueba-admision', label: 'Prueba de admisión', confirmed: false, inProgress: false },
        { key: 'resultados', label: 'Resultados', confirmed: false, inProgress: false },
        { key: 'matriculados', label: 'Matriculados', confirmed: false, inProgress: false },
      ],
      admissionEvents,
    });

    // Keep pipeline stage on interesados as requested (stage 1), while recording the appointment event.
    applicant.currentStageKey = 'interesados';
    applicant.status = 'interested';
    await applicant.save();

    if (schedulingAppointment) {
      const appointmentNotice = {
        schoolName,
        applicantName: payload.fullName,
        grade: gradeLabel,
        appointmentTypeLabel: typeLabel,
        appointmentDateLabel: formatAppointmentDateLabel(payload.appointmentDate),
        appointmentDate: payload.appointmentDate,
        appointmentTime: payload.appointmentTime,
        calendarLocation: locationLabel,
        durationMinutes: SLOT_DURATION_MINUTES,
      };
      const emailTasks = [
        sendAdmissionAppointmentEmail({
          ...appointmentNotice,
          toEmail: payload.guardianEmail,
          toName: payload.guardianName,
          notes: profile.guardianEmailNotes,
          departmentLabel: 'Departamento de Admisiones',
          retentionIntro: profile.guardianEmailRetentionIntro,
        }),
      ];
      if (profile.sendBerckleyOfficeEmail) {
        emailTasks.push(sendBerckleyAdmissionsOfficeAppointmentEmail({
          ...appointmentNotice,
          schoolId: profile.schoolId,
          birthDate: formatAppointmentDateLabel(payload.birthDate),
          previousSchool: payload.previousSchool,
          guardianName: payload.guardianName,
          guardianEmail: payload.guardianEmail,
          guardianPhone: payload.guardianPhone,
          source: payload.referenceOrigin || 'Primer contacto',
        }));
      }
      const emailResults = await Promise.allSettled(emailTasks);
      emailResults.forEach((result) => {
        if (result.status === 'rejected') {
          console.warn(`[PRIMER_CONTACTO_EMAIL_FAILED] applicantId=${applicant._id} error=${result.reason?.message || result.reason}`);
        }
      });
    }

    const whatsappMessage = buildWhatsAppMessage({ ...payload, grade: gradeLabel }, profile);
    return {
      ok: true,
      applicantId: String(applicant._id),
      schoolName,
      appointment: schedulingAppointment ? {
        type: payload.appointmentType,
        typeLabel,
        date: payload.appointmentDate,
        dateLabel: formatAppointmentDateLabel(payload.appointmentDate),
        time: payload.appointmentTime,
        timeLabel: formatTimeLabel(payload.appointmentTime),
        locationKey: payload.locationKey || '',
        locationLabel: payload.appointmentType === 'in_person' ? locationLabel : locationLabel,
      } : {
        type: payload.appointmentType,
        typeLabel,
        date: '',
        dateLabel: '',
        time: '',
        timeLabel: '',
        locationKey: '',
        locationLabel: '',
      },
      whatsappUrl: buildWhatsAppUrl(whatsappMessage, profile.whatsappNumber),
      whatsappNumber: profile.whatsappNumber,
    };
  });
}

async function submitPrimerContacto(body = {}) {
  return submitPrimerContactoForProfile('berckley', body);
}

async function submitMillenniumPrimerContacto(body = {}) {
  return submitPrimerContactoForProfile('millennium', body);
}

module.exports = {
  BERCKLEY_SCHOOL_ID,
  MILLENNIUM_SCHOOL_ID,
  getPrimerContactoAvailability,
  getMillenniumPrimerContactoAvailability,
  submitPrimerContacto,
  submitMillenniumPrimerContacto,
  APPOINTMENT_TYPE_LABELS,
  LOCATION_OPTIONS,
  getRectoriaGradeOptions,
};
