const AdmissionApplicant = require('../models/admissionApplicant.model');
const { runWithSchoolContext } = require('../config/db');
const { sendAdmissionAppointmentEmail } = require('./brevo.service');
const { getSchoolDisplayName } = require('../utils/schoolDisplayName');

const BERCKLEY_SCHOOL_ID = 'International Berckley School';
const WHATSAPP_NUMBER = '573165283537';
const SLOT_DURATION_MINUTES = 30;
const SLOT_START_TIMES = ['09:00', '09:30', '10:00', '10:30', '14:00', '14:30', '15:00', '15:30'];

const APPOINTMENT_TYPE_LABELS = {
  virtual: 'Cita virtual',
  phone: 'Llamada telefónica',
  in_person: 'Cita presencial',
};

const LOCATION_OPTIONS = {
  sede_km5: 'Sede km 5 (primaria y secundaria)',
  sede_villacampestre: 'Sede Villacampestre (preescolar)',
};

const GRADE_OPTIONS = [
  { value: 'Nursery', label: 'Nursery' },
  { value: 'Toddlers', label: 'Toddlers' },
  { value: 'PK', label: 'Pre-Kinder' },
  { value: 'K', label: 'Kinder' },
  { value: '1st', label: '1st' },
  { value: '2nd', label: '2nd' },
  { value: '3rd', label: '3rd' },
  { value: '4th', label: '4th' },
  { value: '5th', label: '5th' },
  { value: '6th', label: '6th' },
  { value: '7th', label: '7th' },
  { value: '8th', label: '8th' },
  { value: '9th', label: '9th' },
  { value: '10th', label: '10th' },
  { value: '11th', label: '11th' },
  { value: '12th', label: '12th' },
];

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function normalizeAppointmentType(value) {
  const raw = normalizeText(value).toLowerCase().replace(/-/g, '_');
  if (['virtual', 'cita_virtual'].includes(raw)) return 'virtual';
  if (['phone', 'llamada', 'llamada_telefonica', 'llamada_telefónica', 'telefono', 'teléfono'].includes(raw)) return 'phone';
  if (['in_person', 'presencial', 'cita_presencial'].includes(raw)) return 'in_person';
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

function getGradeLabel(grade) {
  return GRADE_OPTIONS.find((option) => option.value === grade)?.label || grade;
}

function resolveCalendarLocation({ appointmentType, locationKey, schoolName }) {
  if (appointmentType === 'virtual') return 'Cita virtual (videollamada)';
  if (appointmentType === 'phone') return 'Llamada telefónica';
  if (locationKey && LOCATION_OPTIONS[locationKey]) return LOCATION_OPTIONS[locationKey];
  return schoolName || 'International Berckley School';
}

function buildWhatsAppMessage({
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
}) {
  const typeLabel = APPOINTMENT_TYPE_LABELS[appointmentType] || appointmentType;
  const locationLabel = appointmentType === 'in_person'
    ? (LOCATION_OPTIONS[locationKey] || '')
    : resolveCalendarLocation({ appointmentType, locationKey });

  return [
    'Hola, me interesa International Berckley School. Acabo de registrar mis datos en Primer Contacto y quiero continuar por WhatsApp.',
    '',
    `• Aspirante: ${fullName}`,
    `• Fecha de nacimiento: ${birthDate}`,
    `• Colegio de procedencia: ${previousSchool}`,
    `• Acudiente: ${guardianName}`,
    `• Email: ${guardianEmail}`,
    `• Teléfono: ${guardianPhone}`,
    `• Grado/programa: ${getGradeLabel(grade)}`,
    `• Año: ${academicYear}`,
    `• Tipo de cita: ${typeLabel}`,
    `• Fecha: ${formatAppointmentDateLabel(appointmentDate)}`,
    `• Hora: ${formatTimeLabel(appointmentTime)}`,
    locationLabel ? `• Ubicación: ${locationLabel}` : '',
  ].filter(Boolean).join('\n');
}

function buildWhatsAppUrl(message) {
  return `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;
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

function buildAvailabilityDays({ fromDate = new Date(), dayCount = 21, busyAppointments = [] } = {}) {
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const days = [];

  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(start, offset);
    if (!isWeekday(date)) continue;

    const dateKey = toDateKey(date);
    const slots = SLOT_START_TIMES.map((time) => {
      const available = !isSlotBusy(busyAppointments, dateKey, time);
      return {
        time,
        label: formatTimeLabel(time),
        available,
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

async function getPrimerContactoAvailability({ from, days = 21 } = {}) {
  return runWithSchoolContext(BERCKLEY_SCHOOL_ID, async () => {
    const fromDate = from ? parseDateKey(from) : new Date();
    const safeFrom = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : new Date();
    const dayCount = Math.min(42, Math.max(7, Number(days) || 21));
    const toDate = addDays(safeFrom, dayCount - 1);
    const fromDateKey = toDateKey(safeFrom);
    const toDateKeyValue = toDateKey(toDate);
    const busyAppointments = await listBusyAppointments(BERCKLEY_SCHOOL_ID, fromDateKey, toDateKeyValue);

    return {
      schoolId: BERCKLEY_SCHOOL_ID,
      schoolName: await getSchoolDisplayName(BERCKLEY_SCHOOL_ID) || 'International Berckley School',
      timezone: 'America/Bogota',
      slotDurationMinutes: SLOT_DURATION_MINUTES,
      windows: [
        { label: 'Mañana', start: '09:00', end: '11:00' },
        { label: 'Tarde', start: '14:00', end: '16:00' },
      ],
      appointmentTypes: [
        { value: 'virtual', label: APPOINTMENT_TYPE_LABELS.virtual },
        { value: 'phone', label: APPOINTMENT_TYPE_LABELS.phone },
        { value: 'in_person', label: APPOINTMENT_TYPE_LABELS.in_person },
      ],
      locations: Object.entries(LOCATION_OPTIONS).map(([value, label]) => ({ value, label })),
      grades: GRADE_OPTIONS,
      days: buildAvailabilityDays({
        fromDate: safeFrom,
        dayCount,
        busyAppointments,
      }),
    };
  });
}

function validatePrimerContactoPayload(body = {}) {
  const fullName = normalizeText(body.fullName || body.student?.firstName);
  const birthDate = normalizeText(body.birthDate || body.student?.birthDate);
  const previousSchool = normalizeText(body.previousSchool || body.student?.previousSchool);
  const guardianName = normalizeText(body.guardianName || body.guardian?.name);
  const guardianEmail = normalizeEmail(body.guardianEmail || body.guardian?.email);
  const guardianPhone = normalizeText(body.guardianPhone || body.guardian?.phone);
  const grade = normalizeText(body.grade);
  const academicYear = normalizeText(body.academicYear) || String(new Date().getFullYear());
  const appointmentType = normalizeAppointmentType(body.appointmentType || body.appointment?.type);
  const appointmentDate = normalizeText(body.appointmentDate || body.appointment?.date);
  const appointmentTime = normalizeText(body.appointmentTime || body.appointment?.time);
  const locationKey = normalizeLocationKey(body.locationKey || body.appointmentLocation || body.appointment?.locationKey);
  const referenceOrigin = normalizeText(body.referenceOrigin || body.source?.referenceOrigin)
    || 'Primer contacto — comergio.com/primercontacto';

  const missing = [];
  if (!fullName) missing.push('nombre del aspirante');
  if (!birthDate) missing.push('fecha de nacimiento');
  if (!previousSchool) missing.push('colegio de procedencia');
  if (!guardianName) missing.push('nombre del acudiente');
  if (!guardianEmail || !isValidEmail(guardianEmail)) missing.push('email del acudiente');
  if (!guardianPhone) missing.push('teléfono del acudiente');
  if (!grade) missing.push('grado');
  if (!appointmentType) missing.push('tipo de cita');
  if (!appointmentDate) missing.push('fecha de la cita');
  if (!appointmentTime) missing.push('hora de la cita');
  if (appointmentType === 'in_person' && !locationKey) missing.push('sede presencial');

  if (missing.length) {
    const error = new Error(`Completa: ${missing.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }

  if (!SLOT_START_TIMES.includes(appointmentTime)) {
    const error = new Error('La hora seleccionada no está disponible. Elige un horario de 9:00–11:00 o 2:00–4:00.');
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

  return {
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
  };
}

async function submitPrimerContacto(body = {}) {
  const payload = validatePrimerContactoPayload(body);

  return runWithSchoolContext(BERCKLEY_SCHOOL_ID, async () => {
    const busyAppointments = await listBusyAppointments(
      BERCKLEY_SCHOOL_ID,
      payload.appointmentDate,
      payload.appointmentDate,
    );

    if (isSlotBusy(busyAppointments, payload.appointmentDate, payload.appointmentTime)) {
      const error = new Error('Ese horario acaba de ocuparse. Elige otra hora disponible.');
      error.statusCode = 409;
      throw error;
    }

    const schoolName = await getSchoolDisplayName(BERCKLEY_SCHOOL_ID) || 'International Berckley School';
    const typeLabel = APPOINTMENT_TYPE_LABELS[payload.appointmentType];
    const locationLabel = resolveCalendarLocation({
      appointmentType: payload.appointmentType,
      locationKey: payload.locationKey,
      schoolName,
    });
    const scheduledAt = new Date(`${payload.appointmentDate}T${payload.appointmentTime}:00`);

    const applicant = await AdmissionApplicant.create({
      schoolId: BERCKLEY_SCHOOL_ID,
      student: {
        firstName: payload.fullName,
        lastName: '',
        birthDate: payload.birthDate ? new Date(`${payload.birthDate}T12:00:00`) : null,
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
      admissionEvents: [
        {
          title: 'Aspirante creado',
          notes: 'Registro desde Primer Contacto (comergio.com/primercontacto).',
          stageKey: 'interesados',
          stageLabel: 'Interesados',
          responsible: 'Primer Contacto',
          inProgress: true,
          createdByName: 'Primer Contacto web',
        },
        {
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
            scheduledAt: Number.isNaN(scheduledAt.getTime()) ? null : scheduledAt,
          },
        },
      ],
    });

    // Keep pipeline stage on interesados as requested (stage 1), while recording the appointment event.
    applicant.currentStageKey = 'interesados';
    applicant.status = 'interested';
    await applicant.save();

    try {
      await sendAdmissionAppointmentEmail({
        toEmail: payload.guardianEmail,
        toName: payload.guardianName,
        schoolName,
        applicantName: payload.fullName,
        grade: getGradeLabel(payload.grade),
        appointmentTypeLabel: typeLabel,
        appointmentDateLabel: formatAppointmentDateLabel(payload.appointmentDate),
        appointmentDate: payload.appointmentDate,
        appointmentTime: payload.appointmentTime,
        notes: 'Gracias por dar el primer paso con International Berckley School. Nuestro equipo de Admisiones te acompañará en cada etapa del proceso. Si necesitas reprogramar, responde este correo o escríbenos por WhatsApp.',
        calendarLocation: locationLabel,
        durationMinutes: SLOT_DURATION_MINUTES,
        departmentLabel: 'Departamento de Admisiones',
        retentionIntro: 'Estamos muy contentos de conocerte. Esta cita es el comienzo de una experiencia educativa bilingüe, cercana y diseñada para que tu familia se sienta acompañada desde el primer momento.',
      });
    } catch (emailError) {
      console.warn(`[PRIMER_CONTACTO_EMAIL_FAILED] applicantId=${applicant._id} error=${emailError.message}`);
    }

    const whatsappMessage = buildWhatsAppMessage(payload);
    return {
      ok: true,
      applicantId: String(applicant._id),
      schoolName,
      appointment: {
        type: payload.appointmentType,
        typeLabel,
        date: payload.appointmentDate,
        dateLabel: formatAppointmentDateLabel(payload.appointmentDate),
        time: payload.appointmentTime,
        timeLabel: formatTimeLabel(payload.appointmentTime),
        locationKey: payload.locationKey || '',
        locationLabel: payload.appointmentType === 'in_person' ? locationLabel : locationLabel,
      },
      whatsappUrl: buildWhatsAppUrl(whatsappMessage),
      whatsappNumber: WHATSAPP_NUMBER,
    };
  });
}

module.exports = {
  BERCKLEY_SCHOOL_ID,
  getPrimerContactoAvailability,
  submitPrimerContacto,
  APPOINTMENT_TYPE_LABELS,
  LOCATION_OPTIONS,
  GRADE_OPTIONS,
};
