const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const sharp = require('sharp');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const AdmissionApplicant = require('../models/admissionApplicant.model');
const AdmissionMarketingAsset = require('../models/admissionMarketingAsset.model');
const AdmissionMarketingCampaign = require('../models/admissionMarketingCampaign.model');
const AcademicStructure = require('../models/academicStructure.model');
const Student = require('../models/student.model');
const { sendAdmissionAppointmentEmail, sendAdmissionMarketingEmail } = require('../services/brevo.service');
const {
  uploadCampusMaterialsMiddleware,
  processStoredCampusMaterialFiles,
} = require('../utils/campusMaterialUpload');

const router = express.Router();
const uploadAdmissionDocuments = uploadCampusMaterialsMiddleware.array('files', 6);
const uploadAdmissionMarketingImage = uploadCampusMaterialsMiddleware.array('files', 1);
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
  return normalizeText(value).toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function humanizeSchoolName(value) {
  const normalizedValue = normalizeText(value).replace(/[_-][a-z0-9]{5}$/i, '').replace(/[_-]+/g, ' ');
  return normalizedValue.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPublicBackendBaseUrl(req) {
  const explicit = String(process.env.BACKEND_PUBLIC_URL || process.env.PUBLIC_BACKEND_URL || process.env.API_PUBLIC_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const uploadsPublicBaseUrl = String(process.env.UPLOADS_PUBLIC_BASE_URL || '').trim();
  if (/^https?:\/\//i.test(uploadsPublicBaseUrl)) {
    return uploadsPublicBaseUrl.replace(/\/assets\/?$/i, '').replace(/\/+$/, '');
  }

  const forwardedHost = normalizeText(req.get('x-forwarded-host')).split(',')[0];
  const requestHost = forwardedHost || normalizeText(req.get('host'));
  if (!requestHost || /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestHost)) {
    return 'https://smartlunch-backend-3uqr.onrender.com';
  }

  const forwardedProto = normalizeText(req.get('x-forwarded-proto')).split(',')[0];
  const protocol = forwardedProto || req.protocol || 'https';
  return `${protocol}://${requestHost}`.replace(/\/+$/, '');
}

function resolvePublicEmailAssetUrl(req, value) {
  const rawUrl = normalizeText(value);
  if (!rawUrl || /^(?:https?:|data:)/i.test(rawUrl)) return rawUrl;
  const cleanPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  return `${getPublicBackendBaseUrl(req)}${cleanPath}`;
}

function slugifyMarketingAssetName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'marketing';
}

function buildAdmissionMarketingAssetUrl(req, fileName) {
  return `${getPublicBackendBaseUrl(req)}/assets/admissions-marketing/${encodeURIComponent(fileName)}`;
}

async function storeAdmissionMarketingImage(req, file) {
  if (!file?.buffer) {
    throw new Error('No se recibio ninguna imagen.');
  }

  const image = sharp(file.buffer).rotate();
  const metadata = await image.metadata();
  const imageBuffer = await sharp(file.buffer)
    .rotate()
    .resize({ width: 1400, withoutEnlargement: true, fit: 'inside' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  const fileName = `${slugifyMarketingAssetName(file.originalname || 'marketing')}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;

  const asset = await AdmissionMarketingAsset.create({
    schoolId: req.user.schoolId,
    fileName,
    originalName: normalizeText(file.originalname),
    mimeType: 'image/jpeg',
    sizeBytes: imageBuffer.length,
    width: Number(metadata?.width || 0),
    height: Number(metadata?.height || 0),
    data: imageBuffer,
    createdByUserId: mongoose.Types.ObjectId.isValid(req.user?.userId) ? new mongoose.Types.ObjectId(req.user.userId) : null,
  });

  return {
    url: buildAdmissionMarketingAssetUrl(req, asset.fileName),
    thumbUrl: buildAdmissionMarketingAssetUrl(req, asset.fileName),
    fileName: asset.fileName,
    title: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    storage: 'mongodb',
  };
}

function formatAdmissionAppointmentDateLabel(value) {
  if (!value) return '';
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function resolveAdmissionCalendarLocation(schoolName, appointmentType) {
  if (appointmentType === 'virtual') return 'Cita virtual';
  if (appointmentType === 'phone') return 'Llamada telefonica';
  return schoolName || 'Instalaciones del colegio';
}

async function getAdmissionSchoolName(schoolId) {
  const academicStructure = await AcademicStructure.findOne({ schoolId }).select('schoolName').lean();
  return normalizeText(academicStructure?.schoolName) || humanizeSchoolName(schoolId) || 'Colegio';
}

async function notifyAdmissionAppointment(applicant, eventPayload, schoolId) {
  if (!eventPayload?.appointment?.type) return { skipped: true };
  const toEmail = normalizeEmail(eventPayload.appointment.guardianEmail || applicant.guardian?.email);
  if (!toEmail) return { skipped: true };

  const schoolName = await getAdmissionSchoolName(schoolId);
  return sendAdmissionAppointmentEmail({
    toEmail,
    toName: normalizeText(applicant.guardian?.name) || 'Acudiente',
    schoolName,
    applicantName: getStudentName(applicant),
    grade: normalizeText(applicant.grade),
    appointmentTypeLabel: eventPayload.appointment.label || appointmentTypeLabels[eventPayload.appointment.type] || eventPayload.appointment.type,
    appointmentDateLabel: formatAdmissionAppointmentDateLabel(eventPayload.appointment.date),
    appointmentDate: eventPayload.appointment.date,
    appointmentTime: eventPayload.appointment.time,
    notes: normalizeText(eventPayload.notes),
    calendarLocation: resolveAdmissionCalendarLocation(schoolName, eventPayload.appointment.type),
  });
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
  const guardianEmail = normalizeEmail(body.appointment?.guardianEmail || body.guardianEmail);

  // Only treat as an appointment draft when type/date/time are present.
  // guardianEmail alone is often sent with unrelated events (e.g. E6 result).
  if (!type && !date && !time) {
    return { type: '', label: '', date: '', time: '', guardianEmail: '', scheduledAt: null };
  }

  if (!type || !date || !time) {
    const error = new Error('Tipo, fecha y hora de la cita son requeridos.');
    error.statusCode = 400;
    throw error;
  }

  if (!isValidEmail(guardianEmail)) {
    const error = new Error('Correo electrónico del acudiente requerido para enviar la cita.');
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
    guardianEmail,
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
    const isConfirmed = index < currentIndex
      || (currentStageKey === 'matriculados' && index === currentIndex);

    return {
      key: template.key,
      label: template.label,
      confirmed: isConfirmed,
      inProgress: Boolean(index === currentIndex && currentStageKey !== 'matriculados'),
      updatedAt: existing.updatedAt || new Date(),
      confirmedAt: isConfirmed ? (existing.confirmedAt || new Date()) : null,
    };
  });
}

function normalizeStatus(value, stageKey = 'interesados') {
  const rawStatus = normalizeText(value).toLowerCase();
  if (['withdrawn', 'desistido', 'desistida', 'desistidos', 'desistidas'].includes(rawStatus)) {
    return 'withdrawn';
  }
  if (['not_admitted', 'no_admitido', 'no-admitido', 'noadmitido', 'no-admitidos', 'no_admitidos', 'noadmitidos'].includes(rawStatus)) {
    return 'not_admitted';
  }
  if (stageKey === 'matriculados') {
    return ['enrolled', 'matriculado', 'matriculada'].includes(rawStatus) ? 'enrolled' : 'in_process';
  }
  if (stageKey === 'interesados') {
    return 'interested';
  }
  return 'in_process';
}

function normalizeAdmissionResult(value) {
  const raw = normalizeText(value).toLowerCase();
  if (['admitted', 'admitido', 'admitida'].includes(raw)) return 'admitted';
  if (['not_admitted', 'no_admitido', 'no-admitido', 'noadmitido'].includes(raw)) return 'not_admitted';
  return '';
}

function getStudentName(applicant = {}) {
  return [applicant.student?.firstName, applicant.student?.lastName].map(normalizeText).filter(Boolean).join(' ') || 'Aspirante sin nombre';
}

function serializeApplicant(applicant) {
  const plain = typeof applicant?.toObject === 'function' ? applicant.toObject() : applicant;
  const currentStageKey = normalizeStageKey(plain?.currentStageKey);
  const status = normalizeStatus(plain?.status, currentStageKey);

  return {
    ...plain,
    id: String(plain?._id || plain?.id || ''),
    studentName: getStudentName(plain),
    currentStageKey,
    status,
    currentStage: getStageTemplate(currentStageKey),
    admissionStages: buildDefaultStages(currentStageKey, plain?.admissionStages),
  };
}

function serializeMarketingRecipient(applicant) {
  const plain = typeof applicant?.toObject === 'function' ? applicant.toObject() : applicant;
  return {
    id: String(plain?._id || plain?.id || ''),
    studentName: getStudentName(plain),
    guardianName: normalizeText(plain?.guardian?.name),
    guardianEmail: normalizeEmail(plain?.guardian?.email),
    grade: normalizeText(plain?.grade),
    status: normalizeStatus(plain?.status, plain?.currentStageKey),
    currentStageKey: normalizeStageKey(plain?.currentStageKey),
  };
}

function serializeAdmissionMarketingCampaign(campaign) {
  const plain = typeof campaign?.toObject === 'function' ? campaign.toObject() : campaign;
  return {
    id: String(plain?._id || plain?.id || ''),
    subject: plain?.subject || '',
    title: plain?.title || '',
    body: plain?.body || '',
    imageUrl: plain?.imageUrl || '',
    imageAlt: plain?.imageAlt || '',
    recipients: Array.isArray(plain?.recipients) ? plain.recipients : [],
    delivery: plain?.delivery || null,
    createdByName: plain?.createdByName || '',
    sentAt: plain?.sentAt || plain?.createdAt || null,
    createdAt: plain?.createdAt || null,
  };
}

function buildApplicantPayload(body = {}, existingApplicant = null) {
  const existing = existingApplicant || {};
  const student = body.student && typeof body.student === 'object' ? body.student : body;
  const guardian = body.guardian && typeof body.guardian === 'object' ? body.guardian : body;
  const currentStageKey = normalizeStageKey(body.currentStageKey || existing.currentStageKey || 'interesados');
  const requestedStatus = normalizeText(body.status).toLowerCase();
  const nextStatus = ['active', 'activo', 'activos'].includes(requestedStatus)
    ? normalizeStatus('in_process', currentStageKey)
    : normalizeStatus(body.status || existing.status, currentStageKey);
  const clearingClosedStatus = ['withdrawn', 'not_admitted'].includes(normalizeStatus(existing.status, existing.currentStageKey))
    && !['withdrawn', 'not_admitted'].includes(nextStatus);

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
    status: nextStatus,
    ...(clearingClosedStatus ? { admissionDecision: { result: '', reason: '', decidedAt: null } } : {}),
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
    const rawStatus = normalizeText(status).toLowerCase();
    if (['active', 'activo', 'activos', 'aspirantes'].includes(rawStatus)) {
      query.status = { $nin: ['withdrawn', 'not_admitted'] };
    } else {
      const normalizedStatus = normalizeStatus(status);
      if (['enrolled', 'withdrawn', 'not_admitted'].includes(normalizedStatus)) {
        query.status = normalizedStatus;
      }
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
  const metrics = { total: applicants.length, inProcess: 0, enrolled: 0, withdrawn: 0, notAdmitted: 0 };

  applicants.forEach((applicant) => {
    const status = normalizeStatus(applicant.status, applicant.currentStageKey);
    if (!['withdrawn', 'not_admitted'].includes(status) && stageCounts[applicant.currentStageKey] !== undefined) {
      stageCounts[applicant.currentStageKey] += 1;
    }
    if (status === 'enrolled') metrics.enrolled += 1;
    if (status === 'withdrawn') metrics.withdrawn += 1;
    if (status === 'not_admitted') metrics.notAdmitted += 1;
    const stageIndex = getStageIndex(applicant.currentStageKey);
    if (stageIndex >= 1 && stageIndex <= 5 && !['enrolled', 'withdrawn', 'not_admitted'].includes(status)) {
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

router.post('/marketing/uploads/image', uploadAdmissionMarketingImage, async (req, res) => {
  try {
    const [uploadedFile] = Array.isArray(req.files) ? req.files : [];
    const file = await storeAdmissionMarketingImage(req, uploadedFile);
    if (!file?.url) {
      return res.status(400).json({ message: 'No se pudo subir la imagen.' });
    }

    return res.status(201).json({
      image: {
        url: file.url || '',
        publicUrl: resolvePublicEmailAssetUrl(req, file.url || ''),
        thumbUrl: file.thumbUrl || file.url || '',
        fileName: file.fileName || '',
        originalName: file.title || file.fileName || '',
        mimeType: file.mimeType || '',
        sizeBytes: file.sizeBytes || 0,
        storage: file.storage || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo subir la imagen de marketing.' });
  }
});

router.get('/marketing/history', async (req, res) => {
  try {
    const campaigns = await AdmissionMarketingCampaign.find({ schoolId: req.user.schoolId })
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(50)
      .lean();
    return res.status(200).json({ campaigns: campaigns.map(serializeAdmissionMarketingCampaign) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo cargar el historial de marketing.' });
  }
});

router.post('/marketing/send', async (req, res) => {
  try {
    const subject = normalizeText(req.body?.subject);
    const title = normalizeText(req.body?.title || subject);
    const body = normalizeText(req.body?.body);
    const imageUrl = resolvePublicEmailAssetUrl(req, req.body?.imageUrl);
    const imageAlt = normalizeText(req.body?.imageAlt || title);
    const applicantIds = Array.isArray(req.body?.applicantIds) ? req.body.applicantIds : [];
    const objectIds = applicantIds
      .map((id) => normalizeText(id))
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (!subject) {
      return res.status(400).json({ message: 'El asunto del correo es requerido.' });
    }
    if (!body && !imageUrl) {
      return res.status(400).json({ message: 'Escribe un mensaje o sube una imagen para enviar el boletín.' });
    }
    if (!objectIds.length) {
      return res.status(400).json({ message: 'Selecciona al menos un aspirante con correo de acudiente.' });
    }

    const [schoolName, applicants] = await Promise.all([
      getAdmissionSchoolName(req.user.schoolId),
      AdmissionApplicant.find({
        _id: { $in: objectIds },
        schoolId: req.user.schoolId,
        deletedAt: null,
      }).sort({ updatedAt: -1, createdAt: -1 }),
    ]);

    const recipientsByEmail = new Map();
    applicants.forEach((applicant) => {
      const recipient = serializeMarketingRecipient(applicant);
      if (!isValidEmail(recipient.guardianEmail) || recipientsByEmail.has(recipient.guardianEmail)) return;
      recipientsByEmail.set(recipient.guardianEmail, { applicant, recipient });
    });

    const delivery = { requested: applicantIds.length, eligible: recipientsByEmail.size, sent: 0, failed: 0, skipped: Math.max(0, applicants.length - recipientsByEmail.size), failures: [] };
    const sentRecipients = [];

    for (const { recipient } of recipientsByEmail.values()) {
      try {
        await sendAdmissionMarketingEmail({
          toEmail: recipient.guardianEmail,
          toName: recipient.guardianName || 'Acudiente',
          schoolName,
          subject,
          title,
          body,
          imageUrl,
          imageAlt,
        });
        delivery.sent += 1;
        sentRecipients.push(recipient);
      } catch (sendError) {
        delivery.failed += 1;
        delivery.failures.push({ email: recipient.guardianEmail, message: sendError.message || 'No se pudo enviar.' });
      }
    }

    const campaign = await AdmissionMarketingCampaign.create({
      schoolId: req.user.schoolId,
      subject,
      title,
      body,
      imageUrl,
      imageAlt,
      recipients: sentRecipients.map((recipient) => ({
        applicantId: mongoose.Types.ObjectId.isValid(recipient.id) ? new mongoose.Types.ObjectId(recipient.id) : null,
        studentName: recipient.studentName || '',
        guardianName: recipient.guardianName || '',
        guardianEmail: recipient.guardianEmail || '',
        grade: recipient.grade || '',
        currentStageKey: recipient.currentStageKey || '',
        status: recipient.status || '',
      })),
      delivery,
      createdByUserId: mongoose.Types.ObjectId.isValid(req.user?.userId) ? new mongoose.Types.ObjectId(req.user.userId) : null,
      createdByName: normalizeText(req.user?.name || req.user?.username),
      sentAt: new Date(),
    });

    return res.status(200).json({
      message: delivery.sent ? `Boletín enviado a ${delivery.sent} acudiente(s).` : 'No se pudo enviar el boletín.',
      delivery,
      recipients: sentRecipients,
      campaign: serializeAdmissionMarketingCampaign(campaign),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo enviar el boletín de marketing.' });
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

router.delete('/:applicantId', async (req, res) => {
  try {
    const applicant = await findApplicant(req, res);
    if (!applicant) return null;
    applicant.deletedAt = new Date();
    await applicant.save();
    return res.status(200).json({ message: 'Aspirante eliminado.', summary: await buildAdmissionSummary(req.user.schoolId) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo eliminar el aspirante.' });
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
    const admissionResult = normalizeAdmissionResult(req.body.admissionResult);
    const notAdmittedReason = normalizeAdmissionText(req.body.notAdmittedReason || req.body.notes || req.body.description);
    let eventPayload = buildEventPayload(req.body, req);

    if (admissionResult === 'not_admitted') {
      if (!notAdmittedReason) {
        return res.status(400).json({ message: 'Describe por qué no fue admitido.' });
      }
      eventPayload = {
        ...eventPayload,
        title: eventPayload.title || 'NO ADMITIDO',
        notes: notAdmittedReason,
        stageKey: eventPayload.stageKey || 'resultados',
        stageLabel: getStageTemplate(eventPayload.stageKey || 'resultados').label,
      };
    } else if (admissionResult === 'admitted') {
      eventPayload = {
        ...eventPayload,
        title: eventPayload.title || 'ADMITIDO',
        stageKey: eventPayload.stageKey || 'resultados',
        stageLabel: getStageTemplate(eventPayload.stageKey || 'resultados').label,
      };
    }

    if (!eventPayload.title) {
      return res.status(400).json({ message: 'El título del evento es requerido.' });
    }
    applicant.admissionEvents.push(eventPayload);
    applicant.currentStageKey = eventPayload.stageKey;
    if (admissionResult === 'not_admitted') {
      applicant.status = 'not_admitted';
      applicant.admissionDecision = {
        result: 'not_admitted',
        reason: notAdmittedReason,
        decidedAt: new Date(),
      };
    } else if (admissionResult === 'admitted') {
      applicant.status = normalizeStatus('in_process', eventPayload.stageKey);
      applicant.admissionDecision = {
        result: 'admitted',
        reason: '',
        decidedAt: new Date(),
      };
    } else {
      applicant.status = normalizeStatus(applicant.status, eventPayload.stageKey);
    }
    applicant.admissionStages = buildDefaultStages(eventPayload.stageKey, applicant.admissionStages);
    await applicant.save();
    try {
      await notifyAdmissionAppointment(applicant, eventPayload, req.user.schoolId);
    } catch (emailError) {
      console.warn(`[ADMISSION_APPOINTMENT_EMAIL_FAILED] applicantId=${applicant._id} email=${eventPayload.appointment?.guardianEmail || ''} error=${emailError.message}`);
    }
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
