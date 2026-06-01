const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const AdmissionApplicant = require('../models/admissionApplicant.model');
const AcademicStructure = require('../models/academicStructure.model');
const Student = require('../models/student.model');
const {
  uploadCampusMaterialsMiddleware,
  processStoredCampusMaterialFiles,
} = require('../utils/campusMaterialUpload');

const router = express.Router();
const uploadAdmissionDocuments = uploadCampusMaterialsMiddleware.array('files', 6);
const ADMISSION_ROLES = ['academic_secretary', 'admissions', 'admin', 'rectoria', 'direccion'];

const admissionStageTemplates = [
  { key: 'interesados', code: 'E1', label: 'Interesados' },
  { key: 'informacion-enviada', code: 'E2', label: 'Información enviada' },
  { key: 'agendamiento', code: 'E3', label: 'Agendamiento' },
  { key: 'inscripcion', code: 'E4', label: 'Inscripción' },
  { key: 'prueba-admision', code: 'E5', label: 'Prueba de admisión' },
  { key: 'resultados', code: 'E6', label: 'Resultados' },
  { key: 'matriculados', code: 'E7', label: 'Matriculados' },
];

const documentTypeLabels = {
  identidad: 'Documento de identidad',
  certificado_notas: 'Certificado de notas',
  registro_civil: 'Registro civil',
  foto: 'Foto',
  comprobante_pago: 'Comprobante de pago',
  formulario_inscripcion: 'Formulario de inscripción',
  resultado_prueba: 'Resultado prueba',
  otro: 'Otro',
};

const appointmentTypeLabels = {
  virtual: 'Cita virtual',
  phone: 'Llamada telefónica',
  in_person: 'Cita presencial',
};

router.use(authMiddleware);
router.use(roleMiddleware(ADMISSION_ROLES));

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeAdmissionText(value) {
  return normalizeText(value).toLocaleUpperCase('es-CO');
}

function serializeAdmissionGradeOptions(academicStructure = {}) {
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

async function getAdmissionGradeOptions(schoolId) {
  const academicStructure = await AcademicStructure.findOne({ schoolId }).select('grades').lean();
  return serializeAdmissionGradeOptions(academicStructure);
}

function normalizeEmail(value) {
  return normalizeAdmissionText(value);
}

function normalizeStageKey(value) {
  const requestedKey = normalizeText(value).toLowerCase();
  return admissionStageTemplates.some((stage) => stage.key === requestedKey) ? requestedKey : admissionStageTemplates[0].key;
}

function normalizeAppointmentType(value) {
  const rawType = normalizeText(value).toLowerCase().replace(/-/g, '_');
  if (['virtual', 'cita_virtual'].includes(rawType)) return 'virtual';
  if (['phone', 'llamada', 'llamada_telefonica', 'llamada_telefónica', 'telefono', 'teléfono'].includes(rawType)) return 'phone';
  if (['in_person', 'presencial', 'cita_presencial'].includes(rawType)) return 'in_person';
  return '';
}

function buildAppointmentPayload(body = {}) {
  const type = normalizeAppointmentType(body.appointment?.type || body.appointmentType);
  const date = normalizeText(body.appointment?.date || body.appointmentDate);
  const time = normalizeText(body.appointment?.time || body.appointmentTime);

  if (!type && !date && !time) {
    return { type: '', label: '', date: '', time: '', scheduledAt: null };
  }

  if (!type || !date || !time) {
    const error = new Error('Tipo, fecha y hora de la cita son requeridos.');
    error.statusCode = 400;
    throw error;
  }

  const scheduledAt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(scheduledAt.getTime())) {
    const error = new Error('Fecha u hora de la cita inválida.');
    error.statusCode = 400;
    throw error;
  }

  return {
    type,
    label: appointmentTypeLabels[type] || '',
    date,
    time,
    scheduledAt,
  };
}

function getStageIndex(stageKey) {
  return admissionStageTemplates.findIndex((stage) => stage.key === stageKey);
}

function getStageTemplate(stageKey) {
  return admissionStageTemplates.find((stage) => stage.key === stageKey) || admissionStageTemplates[0];
}

function buildStageMovementDescription(direction, stage) {
  const action = direction === 'previous' ? 'retrocedió' : 'avanzó';
  return normalizeAdmissionText(`El aspirante ${action} a ${stage?.label || 'la siguiente etapa'}`);
}

function buildDefaultStages(currentStageKey = 'interesados', existingStages = []) {
  const existingByKey = new Map((Array.isArray(existingStages) ? existingStages : []).map((stage) => [String(stage?.key || ''), stage]));
  const currentIndex = Math.max(0, getStageIndex(currentStageKey));

  return admissionStageTemplates.map((template, index) => {
    const existing = existingByKey.get(template.key) || {};
    return {
      key: template.key,
      label: template.label,
      confirmed: Boolean(existing.confirmed || index < currentIndex),
      inProgress: Boolean(index === currentIndex && currentStageKey !== 'matriculados'),
      updatedAt: existing.updatedAt || new Date(),
      confirmedAt: existing.confirmedAt || (index < currentIndex ? new Date() : null),
    };
  });
}

function normalizeStatus(value, stageKey = 'interesados') {
  const rawStatus = normalizeText(value).toLowerCase();
  if (['withdrawn', 'desistido', 'desistida', 'desistidos', 'desistidas'].includes(rawStatus)) {
    return 'withdrawn';
  }
  if (['enrolled', 'matriculado', 'matriculada'].includes(rawStatus) || stageKey === 'matriculados') {
    return 'enrolled';
  }
  if (stageKey === 'interesados') {
    return 'interested';
  }
  return 'in_process';
}

function getStudentName(applicant = {}) {
  return [applicant.student?.firstName, applicant.student?.lastName].map(normalizeText).filter(Boolean).join(' ') || 'Aspirante sin nombre';
}

function serializeApplicant(applicant) {
  const plain = typeof applicant?.toObject === 'function' ? applicant.toObject() : applicant;
  return {
    ...plain,
    id: String(plain?._id || plain?.id || ''),
    studentName: getStudentName(plain),
    currentStage: getStageTemplate(plain?.currentStageKey),
    admissionStages: buildDefaultStages(plain?.currentStageKey, plain?.admissionStages),
  };
}

function buildApplicantPayload(body = {}, existingApplicant = null) {
  const existing = existingApplicant || {};
  const student = body.student && typeof body.student === 'object' ? body.student : body;
  const guardian = body.guardian && typeof body.guardian === 'object' ? body.guardian : body;
  const currentStageKey = normalizeStageKey(body.currentStageKey || existing.currentStageKey || 'interesados');

  return {
    student: {
      firstName: normalizeAdmissionText(student.firstName || student.studentFirstName || existing.student?.firstName),
      lastName: normalizeAdmissionText(student.lastName || student.studentLastName || existing.student?.lastName),
      documentNumber: normalizeAdmissionText(student.documentNumber || student.document || existing.student?.documentNumber),
      birthDate: student.birthDate ? new Date(student.birthDate) : (existing.student?.birthDate || null),
      previousSchool: normalizeAdmissionText(student.previousSchool || student.schoolOfOrigin || existing.student?.previousSchool),
    },
    guardian: {
      name: normalizeAdmissionText(guardian.name || guardian.guardianName || existing.guardian?.name),
      email: normalizeEmail(guardian.email || guardian.guardianEmail || existing.guardian?.email),
      phone: normalizeAdmissionText(guardian.phone || guardian.guardianPhone || existing.guardian?.phone),
    },
    grade: normalizeAdmissionText(body.grade || existing.grade),
    academicYear: normalizeAdmissionText(body.academicYear || existing.academicYear || new Date().getFullYear()),
    source: {
      referenceOrigin: normalizeAdmissionText(body.source?.referenceOrigin || body.referenceOrigin || existing.source?.referenceOrigin),
    },
    currentStageKey,
    status: normalizeStatus(body.status || existing.status, currentStageKey),
  };
}

function buildEventPayload(body = {}, req) {
  const stageKey = normalizeStageKey(body.stageKey || body.currentStageKey || 'interesados');
  const stage = getStageTemplate(stageKey);
  const appointment = buildAppointmentPayload(body);
  const hasAppointment = Boolean(appointment.type && appointment.date && appointment.time);
  const fallbackAppointmentTitle = hasAppointment ? 'CITA AGENDADA' : '';
  const fallbackAppointmentNotes = hasAppointment ? `CITA AGENDADA: ${appointment.label || appointment.type} · ${appointment.date} ${appointment.time}` : '';
  const fallbackStageTitle = stageKey === 'agendamiento' ? 'EVENTO REGISTRADO' : '';
  return {
    title: normalizeAdmissionText(body.title || fallbackAppointmentTitle || fallbackStageTitle),
    notes: normalizeAdmissionText(body.notes || body.description || fallbackAppointmentNotes),
    stageKey,
    stageLabel: stage.label,
    responsible: normalizeAdmissionText(body.responsible || req.user?.name || req.user?.username),
    appointment,
    clientVisible: Boolean(body.clientVisible),
    completed: Boolean(body.completed),
    inProgress: Boolean(body.inProgress),
    createdBy: req.user?.userId || req.user?.id || null,
    createdByName: normalizeAdmissionText(req.user?.name || req.user?.username),
  };
}

function buildQuery(req) {
  const query = { schoolId: req.user.schoolId, deletedAt: null };
  const search = normalizeText(req.query.search);
  const document = normalizeText(req.query.document);
  const guardian = normalizeText(req.query.guardian);
  const grade = normalizeText(req.query.grade);
  const stage = normalizeText(req.query.stage || req.query.stageKey);
  const status = normalizeText(req.query.status || (req.query.view === 'dashboard' ? '' : req.query.view));
  const from = normalizeText(req.query.from);
  const to = normalizeText(req.query.to);

  if (search) {
    query.$or = [
      { 'student.firstName': { $regex: search, $options: 'i' } },
      { 'student.lastName': { $regex: search, $options: 'i' } },
    ];
  }
  if (document) {
    query['student.documentNumber'] = { $regex: document, $options: 'i' };
  }
  if (guardian) {
    query['guardian.name'] = { $regex: guardian, $options: 'i' };
  }
  if (grade) {
    query.grade = { $regex: grade, $options: 'i' };
  }
  if (stage) {
    query.currentStageKey = normalizeStageKey(stage);
  }
  if (status) {
    const normalizedStatus = normalizeStatus(status);
    if (['active', 'enrolled', 'withdrawn'].includes(normalizedStatus)) {
      query.status = normalizedStatus === 'active' ? { $ne: 'withdrawn' } : normalizedStatus;
    }
  }
  if (from || to) {
    query.createdAt = {};
    if (from) {
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);
      query.createdAt.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      query.createdAt.$lte = toDate;
    }
  }

  return query;
}

function getApplicantEvents(applicant) {
  return (Array.isArray(applicant?.admissionEvents) ? applicant.admissionEvents : [])
    .map((event) => ({
      ...event.toObject?.() || event,
      applicantId: String(applicant._id || applicant.id || ''),
      studentName: getStudentName(applicant),
      guardianName: applicant.guardian?.name || '',
      grade: applicant.grade || '',
    }))
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));
}

async function buildAdmissionSummary(schoolId) {
  const applicants = await AdmissionApplicant.find({ schoolId, deletedAt: null }).sort({ updatedAt: -1 }).limit(500).lean();
  const stageCounts = admissionStageTemplates.reduce((accumulator, stage) => ({ ...accumulator, [stage.key]: 0 }), {});
  const metrics = { total: applicants.length, inProcess: 0, enrolled: 0, withdrawn: 0 };

  applicants.forEach((applicant) => {
    const status = normalizeStatus(applicant.status, applicant.currentStageKey);
    if (status !== 'withdrawn' && stageCounts[applicant.currentStageKey] !== undefined) {
      stageCounts[applicant.currentStageKey] += 1;
    }
    if (status === 'enrolled') metrics.enrolled += 1;
    if (status === 'withdrawn') metrics.withdrawn += 1;
    const stageIndex = getStageIndex(applicant.currentStageKey);
    if (stageIndex >= 1 && stageIndex <= 5 && !['enrolled', 'withdrawn'].includes(status)) {
      metrics.inProcess += 1;
    }
  });

  const globalEvents = applicants.flatMap(getApplicantEvents).slice(0, 12);
  const scheduledEvents = applicants
    .flatMap(getApplicantEvents)
    .filter((event) => event?.appointment?.scheduledAt)
    .sort((left, right) => new Date(left.appointment.scheduledAt || 0) - new Date(right.appointment.scheduledAt || 0))
    .slice(0, 120);
  return { metrics, stageCounts, globalEvents, scheduledEvents };
}

async function findApplicant(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.applicantId)) {
    res.status(400).json({ message: 'Invalid applicantId' });
    return null;
  }

  const applicant = await AdmissionApplicant.findOne({ _id: req.params.applicantId, schoolId: req.user.schoolId, deletedAt: null });
  if (!applicant) {
    res.status(404).json({ message: 'Aspirante no encontrado' });
    return null;
  }
  return applicant;
}

router.get('/', async (req, res) => {
  try {
    const query = buildQuery(req);
    const applicants = await AdmissionApplicant.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(250);
    const [summary, gradeOptions] = await Promise.all([
      buildAdmissionSummary(req.user.schoolId),
      getAdmissionGradeOptions(req.user.schoolId),
    ]);
    return res.status(200).json({
      applicants: applicants.map(serializeApplicant),
      stageTemplates: admissionStageTemplates,
      documentTypes: documentTypeLabels,
      gradeOptions,
      ...summary,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo cargar admisiones.' });
  }
});

router.get('/:applicantId', async (req, res) => {
  try {
    const applicant = await findApplicant(req, res);
    if (!applicant) return null;
    return res.status(200).json({ applicant: serializeApplicant(applicant) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo cargar el aspirante.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = {
      ...buildApplicantPayload(req.body),
      currentStageKey: 'interesados',
      status: 'interested',
    };
    if (!payload.student.firstName) {
      return res.status(400).json({ message: 'Nombre del aspirante es requerido.' });
    }
    const applicant = await AdmissionApplicant.create({
      ...payload,
      schoolId: req.user.schoolId,
      admissionStages: buildDefaultStages(payload.currentStageKey),
      admissionEvents: [{
        title: 'Aspirante creado',
        notes: 'Registro inicial de admisiones.',
        stageKey: payload.currentStageKey,
        stageLabel: getStageTemplate(payload.currentStageKey).label,
        responsible: normalizeAdmissionText(req.user?.name || req.user?.username),
        inProgress: true,
        createdBy: req.user?.userId || null,
        createdByName: normalizeAdmissionText(req.user?.name || req.user?.username),
      }],
    });
    return res.status(201).json({ applicant: serializeApplicant(applicant), summary: await buildAdmissionSummary(req.user.schoolId) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo crear el aspirante.' });
  }
});

router.patch('/:applicantId', async (req, res) => {
  try {
    const applicant = await findApplicant(req, res);
    if (!applicant) return null;
    const payload = buildApplicantPayload(req.body, applicant);
    Object.assign(applicant, payload);
    applicant.admissionStages = buildDefaultStages(payload.currentStageKey, applicant.admissionStages);
    await applicant.save();
    return res.status(200).json({ applicant: serializeApplicant(applicant), summary: await buildAdmissionSummary(req.user.schoolId) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo actualizar el aspirante.' });
  }
});

router.patch('/:applicantId/stages/:stageKey', async (req, res) => {
  try {
    const applicant = await findApplicant(req, res);
    if (!applicant) return null;
    const previousStageIndex = getStageIndex(applicant.currentStageKey);
    const stageKey = normalizeStageKey(req.params.stageKey);
    const nextStage = getStageTemplate(stageKey);
    const nextStageIndex = getStageIndex(stageKey);
    const movedStage = applicant.currentStageKey !== stageKey;
    applicant.currentStageKey = stageKey;
    applicant.status = normalizeStatus(req.body.status || applicant.status, stageKey);
    applicant.admissionStages = buildDefaultStages(stageKey, applicant.admissionStages);
    if (movedStage) {
      const direction = nextStageIndex < previousStageIndex ? 'previous' : 'next';
      applicant.admissionEvents.push({
        title: direction === 'previous' ? `Retroceso a ${nextStage.code}` : `Cambio de etapa a ${nextStage.code}`,
        notes: buildStageMovementDescription(direction, nextStage),
        stageKey: nextStage.key,
        stageLabel: nextStage.label,
        responsible: normalizeText(req.user?.name || req.user?.username),
        inProgress: nextStage.key !== 'matriculados',
        completed: nextStage.key === 'matriculados',
        createdBy: req.user?.userId || null,
        createdByName: normalizeText(req.user?.name || req.user?.username),
      });
    }
    await applicant.save();
    return res.status(200).json({ applicant: serializeApplicant(applicant), summary: await buildAdmissionSummary(req.user.schoolId) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo actualizar la etapa.' });
  }
});

router.patch('/:applicantId/stage-transition', async (req, res) => {
  try {
    const applicant = await findApplicant(req, res);
    if (!applicant) return null;
    const direction = normalizeText(req.body.direction || 'next');
    const currentIndex = Math.max(0, getStageIndex(applicant.currentStageKey));
    const nextIndex = Math.min(admissionStageTemplates.length - 1, Math.max(0, currentIndex + (direction === 'previous' ? -1 : 1)));
    const nextStage = admissionStageTemplates[nextIndex];
    applicant.currentStageKey = nextStage.key;
    applicant.status = normalizeStatus(applicant.status, nextStage.key);
    applicant.admissionStages = buildDefaultStages(nextStage.key, applicant.admissionStages);
    applicant.admissionEvents.push({
      title: direction === 'previous' ? `Retroceso a ${nextStage.code}` : `Cambio de etapa a ${nextStage.code}`,
      notes: buildStageMovementDescription(direction, nextStage),
      stageKey: nextStage.key,
      stageLabel: nextStage.label,
      responsible: normalizeText(req.user?.name || req.user?.username),
      inProgress: nextStage.key !== 'matriculados',
      completed: nextStage.key === 'matriculados',
      createdBy: req.user?.userId || null,
      createdByName: normalizeText(req.user?.name || req.user?.username),
    });
    await applicant.save();
    return res.status(200).json({ applicant: serializeApplicant(applicant), summary: await buildAdmissionSummary(req.user.schoolId) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo mover la etapa.' });
  }
});

router.patch('/:applicantId/finalize', async (req, res) => {
  try {
    const applicant = await findApplicant(req, res);
    if (!applicant) return null;
    applicant.currentStageKey = 'matriculados';
    applicant.status = 'enrolled';
    applicant.admissionStages = buildDefaultStages('matriculados', applicant.admissionStages).map((stage) => ({
      ...stage,
      confirmed: true,
      inProgress: false,
      confirmedAt: stage.confirmedAt || new Date(),
    }));
    applicant.admissionEvents.push({
      title: 'Matrícula finalizada',
      notes: normalizeText(req.body.notes || 'Aspirante marcado como matriculado.'),
      stageKey: 'matriculados',
      stageLabel: 'Matriculados',
      responsible: normalizeText(req.user?.name || req.user?.username),
      completed: true,
      createdBy: req.user?.userId || null,
      createdByName: normalizeText(req.user?.name || req.user?.username),
    });
    await applicant.save();
    return res.status(200).json({ applicant: serializeApplicant(applicant), summary: await buildAdmissionSummary(req.user.schoolId) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo finalizar la matrícula.' });
  }
});

router.post('/:applicantId/events', async (req, res) => {
  try {
    const applicant = await findApplicant(req, res);
    if (!applicant) return null;
    const eventPayload = buildEventPayload(req.body, req);
    if (!eventPayload.title) {
      return res.status(400).json({ message: 'El título del evento es requerido.' });
    }
    applicant.admissionEvents.push(eventPayload);
    applicant.currentStageKey = eventPayload.stageKey;
    applicant.status = normalizeStatus(applicant.status, eventPayload.stageKey);
    applicant.admissionStages = buildDefaultStages(eventPayload.stageKey, applicant.admissionStages);
    await applicant.save();
    return res.status(201).json({ applicant: serializeApplicant(applicant), summary: await buildAdmissionSummary(req.user.schoolId) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo crear el evento.' });
  }
});

router.patch('/:applicantId/events/:eventId', async (req, res) => {
  try {
    const applicant = await findApplicant(req, res);
    if (!applicant) return null;
    const eventItem = applicant.admissionEvents.id(req.params.eventId);
    if (!eventItem) return res.status(404).json({ message: 'Evento no encontrado' });
    const payload = buildEventPayload({ ...eventItem.toObject(), ...req.body }, req);
    Object.assign(eventItem, payload);
    await applicant.save();
    return res.status(200).json({ applicant: serializeApplicant(applicant), summary: await buildAdmissionSummary(req.user.schoolId) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo actualizar el evento.' });
  }
});

router.delete('/:applicantId/events/:eventId', async (req, res) => {
  try {
    const applicant = await findApplicant(req, res);
    if (!applicant) return null;
    const eventItem = applicant.admissionEvents.id(req.params.eventId);
    if (!eventItem) return res.status(404).json({ message: 'Evento no encontrado' });
    eventItem.deleteOne();
    await applicant.save();
    return res.status(200).json({ applicant: serializeApplicant(applicant), summary: await buildAdmissionSummary(req.user.schoolId) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo eliminar el evento.' });
  }
});

router.post('/:applicantId/documents', uploadAdmissionDocuments, async (req, res) => {
  try {
    const applicant = await findApplicant(req, res);
    if (!applicant) return null;
    const files = await processStoredCampusMaterialFiles(req.files || [], { folder: 'admissions' });
    const type = normalizeText(req.body.type || 'otro');
    const label = documentTypeLabels[type] || documentTypeLabels.otro;
    const note = normalizeAdmissionText(req.body.note);
    files.forEach((file) => {
      applicant.documents.push({
        type,
        label,
        note,
        clientVisible: String(req.body.clientVisible || '').toLowerCase() === 'true',
        fileName: file.fileName || '',
        originalName: file.title || file.fileName || '',
        url: file.url || '',
        mimeType: file.mimeType || '',
        sizeBytes: file.sizeBytes || 0,
        storage: file.storage || '',
        uploadedBy: req.user?.userId || null,
        uploadedByName: normalizeAdmissionText(req.user?.name || req.user?.username),
      });
    });
    await applicant.save();
    return res.status(201).json({ applicant: serializeApplicant(applicant), summary: await buildAdmissionSummary(req.user.schoolId) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudieron subir los documentos.' });
  }
});

router.patch('/:applicantId/documents/:documentId', async (req, res) => {
  try {
    const applicant = await findApplicant(req, res);
    if (!applicant) return null;
    const documentItem = applicant.documents.id(req.params.documentId);
    if (!documentItem) return res.status(404).json({ message: 'Documento no encontrado' });
    const type = normalizeText(req.body.type || documentItem.type || 'otro');
    documentItem.type = type;
    documentItem.label = documentTypeLabels[type] || documentTypeLabels.otro;
    documentItem.note = normalizeText(req.body.note || documentItem.note);
    if (Object.prototype.hasOwnProperty.call(req.body, 'clientVisible')) {
      documentItem.clientVisible = Boolean(req.body.clientVisible);
    }
    await applicant.save();
    return res.status(200).json({ applicant: serializeApplicant(applicant), summary: await buildAdmissionSummary(req.user.schoolId) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo actualizar el documento.' });
  }
});

router.delete('/:applicantId/documents/:documentId', async (req, res) => {
  try {
    const applicant = await findApplicant(req, res);
    if (!applicant) return null;
    const documentItem = applicant.documents.id(req.params.documentId);
    if (!documentItem) return res.status(404).json({ message: 'Documento no encontrado' });
    documentItem.deleteOne();
    await applicant.save();
    return res.status(200).json({ applicant: serializeApplicant(applicant), summary: await buildAdmissionSummary(req.user.schoolId) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo eliminar el documento.' });
  }
});

module.exports = router;
module.exports.admissionStageTemplates = admissionStageTemplates;
